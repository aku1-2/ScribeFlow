import json
import logging
import os
from typing import Any

import joblib

logger = logging.getLogger("scribeflow.topic_model")

MODEL_PATH = os.path.join(os.path.dirname(__file__), "topic_model.joblib")
METADATA_PATH = os.path.join(os.path.dirname(__file__), "topic_model_metadata.json")

_pipeline = None
_metadata: dict[str, Any] = {}


def _get_model():
    global _pipeline, _metadata
    if _pipeline is None:
        if os.path.exists(MODEL_PATH):
            try:
                _pipeline = joblib.load(MODEL_PATH)
                logger.info("Loaded trained topic classifier from %s", MODEL_PATH)
            except Exception as e:
                logger.error("Failed to load model from %s: %s", MODEL_PATH, e)
        else:
            logger.warning(
                "No trained classifier found at %s. Supply a rights-cleared dataset and run scripts/train.py to enable subject prediction.",
                MODEL_PATH,
            )

        if os.path.exists(METADATA_PATH):
            try:
                with open(METADATA_PATH, "r", encoding="utf-8") as f:
                    _metadata = json.load(f)
            except Exception:
                pass
    return _pipeline


UNKNOWN_LABEL = "Unknown / choose a subject"
CONFIDENCE_THRESHOLD = 0.38  # Below this probability, model rejects forced guess
MIN_MARGIN = 0.05            # Minimum gap between top-1 and top-2 class probabilities

SUPPORTED_SUBJECTS = [
    "English / Literature",
    "Biology / Life Sciences",
    "Chemistry",
    "Computer Science / IT",
    "Economics",
    "Electrical and Electronics Engineering",
    "Engineering (Mechanical, Civil, Chemical)",
    "History",
    "Mathematics",
    "Physics",
    "General Studies",
]


def get_model_info() -> dict[str, Any]:
    _get_model()
    return {
        "model_loaded": _pipeline is not None,
        "classes": _metadata.get("classes", []),
        "supported_subjects": SUPPORTED_SUBJECTS,
        "unknown_label": UNKNOWN_LABEL,
        "confidence_threshold": CONFIDENCE_THRESHOLD,
        "accuracy": _metadata.get("overall_accuracy"),
        "trained_at": _metadata.get("trained_at"),
        "samples": _metadata.get("total_samples"),
    }


def predict_topic(text: str) -> str:
    """Predict the subject topic for a lecture transcript excerpt."""
    topic, _ = predict_topic_with_confidence(text)
    return topic


def predict_topic_with_confidence(text: str) -> tuple[str, float]:
    """Predict topic and return highest class probability score, flagging uncertain predictions."""
    model = _get_model()
    clean = text.strip()
    if not clean:
        return UNKNOWN_LABEL, 0.0

    if model is None:
        return UNKNOWN_LABEL, 0.0

    try:
        probabilities = model.predict_proba([clean])[0]
        classes = model.classes_
        best_idx = int(probabilities.argmax())
        top_prob = float(probabilities[best_idx])
        top_label = str(classes[best_idx])

        # Check for uncertainty or low confidence
        if top_prob < CONFIDENCE_THRESHOLD:
            logger.info("Prediction confidence (%.3f) below threshold (%.2f). Returning '%s'", top_prob, CONFIDENCE_THRESHOLD, UNKNOWN_LABEL)
            return UNKNOWN_LABEL, top_prob

        # Check margin against runner-up class
        sorted_probs = sorted(probabilities, reverse=True)
        if len(sorted_probs) > 1 and (sorted_probs[0] - sorted_probs[1]) < MIN_MARGIN:
            logger.info("Prediction margin (%.3f) below margin threshold (%.2f). Returning '%s'", sorted_probs[0] - sorted_probs[1], MIN_MARGIN, UNKNOWN_LABEL)
            return UNKNOWN_LABEL, top_prob

        return top_label, top_prob
    except Exception as e:
        logger.warning("Prediction error, falling back to Unknown: %s", e)
        return UNKNOWN_LABEL, 0.0
