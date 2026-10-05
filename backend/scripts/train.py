"""Train and evaluate ScribeFlow's TF-IDF + Logistic Regression Topic Classifier.

Workflow:
1. Load cleaned multi-disciplinary dataset (backend/data/lectures_multidisciplinary.csv).
2. Perform an 80/20 stratified train/test split (keeping test data strictly unseen).
3. Build a scikit-learn Pipeline with TfidfVectorizer and LogisticRegression.
4. Fit on the training set.
5. Evaluate on the test set: Accuracy, Precision, Recall, F1-score, Confusion Matrix.
6. Serialize model artifact to backend/app/topic_model.joblib with metadata.
"""

import csv
import json
import os
import sys
from datetime import datetime

import joblib
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import classification_report, confusion_matrix, accuracy_score
from sklearn.model_selection import StratifiedGroupKFold
from sklearn.pipeline import Pipeline

DATASET_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "lectures_multidisciplinary.csv")
MODEL_OUTPUT_PATH = os.path.join(os.path.dirname(__file__), "..", "app", "topic_model.joblib")
METADATA_OUTPUT_PATH = os.path.join(os.path.dirname(__file__), "..", "app", "topic_model_metadata.json")


def load_dataset(csv_path: str) -> tuple[list[str], list[str], list[str]]:
    texts = []
    labels = []
    groups = []
    with open(csv_path, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            text = row.get("text", "").strip()
            topic = row.get("topic", "").strip()
            group = row.get("source_url", "").strip() or text[:60]
            if text and topic:
                texts.append(text)
                labels.append(topic)
                groups.append(group)
    return texts, labels, groups


def train_and_evaluate():
    print("=" * 70)
    print("ScribeFlow Topic Classifier Training & Evaluation")
    print("=" * 70)

    if not os.path.exists(DATASET_PATH):
        print(f"Error: Dataset not found at {DATASET_PATH}", file=sys.stderr)
        sys.exit(1)

    texts, labels, groups = load_dataset(DATASET_PATH)
    total_samples = len(texts)
    print(f"Loaded {total_samples} samples across {len(set(labels))} topics.")

    # 1. Stratified & Source-Grouped Train / Test Split (80% Train, 20% Test)
    # StratifiedGroupKFold ensures:
    # - Proportional subject representation in train and test
    # - Strictly ZERO document leakage (all excerpts from any source URL remain on one side)
    sgkf = StratifiedGroupKFold(n_splits=5, shuffle=True, random_state=42)
    train_idx, test_idx = next(sgkf.split(texts, labels, groups))

    X_train = [texts[i] for i in train_idx]
    y_train = [labels[i] for i in train_idx]
    X_test = [texts[i] for i in test_idx]
    y_test = [labels[i] for i in test_idx]

    train_groups = set(groups[i] for i in train_idx)
    test_groups = set(groups[i] for i in test_idx)
    overlap = len(train_groups.intersection(test_groups))

    print(f"Training set: {len(X_train)} samples")
    print(f"Test set:     {len(X_test)} samples (strictly isolated held-out)")
    print(f"Source document overlap between train & test: {overlap} (Strictly 0)")
    print("-" * 70)

    # 2. Pipeline: TF-IDF feature extraction + Logistic Regression classifier
    # - sublinear_tf=True replaces tf with 1 + log(tf) to dampen the effect of very frequent words
    # - ngram_range=(1, 2) captures unigrams ("machine", "learning") and bigrams ("machine learning")
    # - class_weight="balanced" adjusts weights inversely proportional to class frequencies
    pipeline = Pipeline([
        ("tfidf", TfidfVectorizer(
            ngram_range=(1, 2),
            stop_words="english",
            max_features=15000,
            sublinear_tf=True,
            min_df=2,
        )),
        ("classifier", LogisticRegression(
            max_iter=1000,
            class_weight="balanced",
            C=1.5,
            random_state=42,
        )),
    ])

    print("Fitting TF-IDF vectorizer and training Logistic Regression model...")
    pipeline.fit(X_train, y_train)
    print("Training complete.")
    print("-" * 70)

    # 3. Model Evaluation on Unseen Test Set
    y_pred = pipeline.predict(X_test)
    accuracy = accuracy_score(y_test, y_pred)
    classes = sorted(list(set(labels)))

    print(f"\nOVERALL TEST ACCURACY: {accuracy * 100:.2f}%\n")
    print("PER-CLASS EVALUATION METRICS:")
    report_dict = classification_report(y_test, y_pred, target_names=classes, output_dict=True)
    report_text = classification_report(y_test, y_pred, target_names=classes, digits=3)
    print(report_text)

    # 4. Confusion Matrix
    cm = confusion_matrix(y_test, y_pred, labels=classes)
    print("CONFUSION MATRIX (Rows = True Subject, Columns = Predicted Subject):")
    header_indices = "      " + " ".join(f"[{i:02d}]" for i in range(len(classes)))
    print(header_indices)
    for i, row in enumerate(cm):
        row_str = " ".join(f"{val:4d}" for val in row)
        print(f"[{i:02d}] {row_str}  <- {classes[i]}")

    # 5. Save Model and Metadata
    os.makedirs(os.path.dirname(MODEL_OUTPUT_PATH), exist_ok=True)
    joblib.dump(pipeline, MODEL_OUTPUT_PATH)
    print(f"\nModel artifact serialized to: {MODEL_OUTPUT_PATH}")

    metadata = {
        "trained_at": datetime.utcnow().isoformat() + "Z",
        "dataset_path": os.path.relpath(DATASET_PATH, os.path.dirname(__file__)),
        "total_samples": total_samples,
        "train_samples": len(X_train),
        "test_samples": len(X_test),
        "overall_accuracy": float(accuracy),
        "classes": classes,
        "classification_report": report_dict,
        "confusion_matrix": cm.tolist(),
    }
    with open(METADATA_OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(metadata, f, indent=2)
    print(f"Evaluation metadata saved to:  {METADATA_OUTPUT_PATH}")
    print("=" * 70)


if __name__ == "__main__":
    train_and_evaluate()
