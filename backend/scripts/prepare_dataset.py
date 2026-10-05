"""Prepare a balanced multi-disciplinary academic dataset for ScribeFlow.

Sources:
1. arXiv API (Cornell University) - STEM & Economics research abstracts
   License: Per-record license is not verified by the API; redistribution rights must be checked separately.
2. Wikimedia REST API (Wikipedia) - Academic summaries across humanities, literature, & engineering
   License: Creative Commons Attribution-ShareAlike 4.0 International (CC BY-SA 4.0)

Do not redistribute the generated corpus or a model trained on it until the rights for every included source have been reviewed.

Generates:
- backend/data/lectures_multidisciplinary.csv (full labeled dataset with URL and license for every item)
- backend/data/dataset_manifest.json (detailed manifest: sources, licenses, counts, duplicates, samples)
"""

import csv
from datetime import datetime, timezone
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET

USER_AGENT = "ScribeFlow-AcademicDatasetBuilder/1.0 (educational prototype)"
DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data")
OUTPUT_CSV = os.path.join(DATA_DIR, "lectures_multidisciplinary.csv")
MANIFEST_JSON = os.path.join(DATA_DIR, "dataset_manifest.json")

TARGET_PER_CLASS = 140
MIN_TEXT_CHARS = 120


def clean_text(text: str) -> str:
    """Normalize whitespace and strip HTML/LaTeX tags."""
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"\$[^$]+\$", " ", text)  # inline math
    text = re.sub(r"\s+", " ", text).strip()
    return text


def fetch_arxiv_abstracts(categories: list[str], max_per_cat: int = 45) -> list[dict]:
    """Fetch abstracts from the official arXiv Atom API with canonical URLs and licenses."""
    results = []
    for cat in categories:
        url = (
            f"http://export.arxiv.org/api/query?search_query=cat:{cat}"
            f"&start=0&max_results={max_per_cat}&sortBy=submittedDate&sortOrder=descending"
        )
        req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        try:
            with urllib.request.urlopen(req, timeout=15) as resp:
                tree = ET.fromstring(resp.read())
                ns = {"atom": "http://www.w3.org/2005/Atom"}
                for entry in tree.findall("atom:entry", ns):
                    summary = entry.find("atom:summary", ns)
                    title = entry.find("atom:title", ns)
                    entry_id = entry.find("atom:id", ns)
                    if summary is not None and summary.text:
                        text = clean_text(summary.text)
                        if len(text) >= MIN_TEXT_CHARS:
                            source_url = entry_id.text.strip() if entry_id is not None and entry_id.text else f"https://arxiv.org/abs/{cat}"
                            results.append({
                                "text": text,
                                "source_name": "arXiv (Cornell University)",
                                "source_url": source_url,
                                "license": "not verified",
                                "source_category": f"arxiv:{cat}",
                                "title": clean_text(title.text) if title is not None and title.text else "",
                            })
        except Exception as e:
            print(f"Warning: Failed to fetch arXiv for {cat}: {e}", file=sys.stderr)
        time.sleep(1.0)  # Rate limiting for arXiv
    return results


def fetch_wikipedia_summaries(categories: list[str], max_per_cat: int = 40) -> list[dict]:
    """Fetch article summaries from Wikipedia categories with canonical URLs and licenses."""
    results = []
    for cat in categories:
        encoded_cat = urllib.parse.quote(f"Category:{cat}")
        query_url = (
            f"https://en.wikipedia.org/w/api.php?action=query&list=categorymembers"
            f"&cmtitle={encoded_cat}&cmlimit={max_per_cat * 2}&format=json"
        )
        req = urllib.request.Request(query_url, headers={"User-Agent": USER_AGENT})
        titles = []
        try:
            with urllib.request.urlopen(req, timeout=15) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                members = data.get("query", {}).get("categorymembers", [])
                titles = [
                    m["title"] for m in members
                    if not m["title"].startswith("Category:")
                    and not m["title"].startswith("Template:")
                    and not m["title"].startswith("List of")
                    and not m["title"].startswith("Index of")
                ][:max_per_cat]
        except Exception as e:
            print(f"Warning: Failed to list Wikipedia category {cat}: {e}", file=sys.stderr)
            continue

        for title in titles:
            encoded_title = urllib.parse.quote(title.replace(" ", "_"))
            summary_url = f"https://en.wikipedia.org/api/rest_v1/page/summary/{encoded_title}"
            s_req = urllib.request.Request(summary_url, headers={"User-Agent": USER_AGENT})
            try:
                with urllib.request.urlopen(s_req, timeout=10) as s_resp:
                    s_data = json.loads(s_resp.read().decode("utf-8"))
                    extract = s_data.get("extract", "")
                    if extract:
                        text = clean_text(extract)
                        if len(text) >= MIN_TEXT_CHARS and not text.endswith("may refer to:"):
                            page_url = (
                                s_data.get("content_urls", {}).get("desktop", {}).get("page")
                                or f"https://en.wikipedia.org/wiki/{encoded_title}"
                            )
                            results.append({
                                "text": text,
                                "source_name": "English Wikipedia (Wikimedia Foundation)",
                                "source_url": page_url,
                                "license": "Creative Commons Attribution-ShareAlike 4.0 International (CC BY-SA 4.0)",
                                "source_category": f"wikipedia:{cat}",
                                "title": title,
                            })
            except Exception:
                pass
            time.sleep(0.08)  # Wikipedia REST API polite rate limiting
    return results


def build_corpus():
    print("=" * 75)
    print("ScribeFlow Dataset Preparation & Manifest Builder")
    print(f"Timestamp: {datetime.now(timezone.utc).isoformat()}")
    print("=" * 75)

    dataset_plan = [
        {
            "topic": "English / Literature",
            "arxiv": [],
            "wiki": [
                "English_literature",
                "Literary_genres",
                "Literary_criticism",
                "Literary_devices",
                "Novels",
                "Short_stories",
                "Poetry",
                "Drama",
            ],
        },
        {
            "topic": "Computer Science / IT",
            "arxiv": ["cs.AI", "cs.SE", "cs.DB"],
            "wiki": ["Computer_science", "Software_engineering"],
        },
        {
            "topic": "Electrical and Electronics Engineering",
            "arxiv": ["eess.SP", "eess.SY"],
            "wiki": ["Electrical_engineering", "Electronics"],
        },
        {
            "topic": "Engineering (Mechanical, Civil, Chemical)",
            "arxiv": [],
            "wiki": ["Mechanical_engineering", "Civil_engineering", "Chemical_engineering"],
        },
        {
            "topic": "Biology / Life Sciences",
            "arxiv": ["q-bio.BM", "q-bio.GN"],
            "wiki": ["Biology", "Cell_biology"],
        },
        {
            "topic": "Physics",
            "arxiv": ["physics.class-ph", "quant-ph"],
            "wiki": ["Physics", "Thermodynamics"],
        },
        {
            "topic": "Chemistry",
            "arxiv": ["physics.chem-ph"],
            "wiki": ["Chemistry", "Organic_chemistry"],
        },
        {
            "topic": "Mathematics",
            "arxiv": ["math.PR", "math.AG"],
            "wiki": ["Mathematics", "Calculus"],
        },
        {
            "topic": "History",
            "arxiv": [],
            "wiki": ["Ancient_history", "Modern_history", "History_of_science"],
        },
        {
            "topic": "Economics",
            "arxiv": ["econ.EM", "q-fin.EC"],
            "wiki": ["Economics", "Macroeconomics"],
        },
    ]

    all_rows = []
    seen_texts = set()
    manifest_by_class = []

    for item in dataset_plan:
        topic = item["topic"]
        print(f"\n[Collecting] {topic}...")
        raw_items = []

        if item["arxiv"]:
            arxiv_items = fetch_arxiv_abstracts(item["arxiv"], max_per_cat=45)
            raw_items.extend(arxiv_items)

        if item["wiki"]:
            wiki_items = fetch_wikipedia_summaries(item["wiki"], max_per_cat=35)
            raw_items.extend(wiki_items)

        raw_count = len(raw_items)
        unique_for_topic = []
        duplicate_count = 0

        for r in raw_items:
            t = r["text"]
            if t in seen_texts:
                duplicate_count += 1
                continue
            seen_texts.add(t)
            unique_for_topic.append({
                "topic": topic,
                "text": t,
                "source_name": r["source_name"],
                "source_url": r["source_url"],
                "license": r["license"],
                "source_category": r["source_category"],
            })

        # Cap at TARGET_PER_CLASS to maintain balance across all 10 subjects
        final_selected = unique_for_topic[:TARGET_PER_CLASS]
        all_rows.extend(final_selected)

        # Build class manifest summary
        distinct_sources = sorted(list(set(x["source_name"] for x in final_selected)))
        distinct_licenses = sorted(list(set(x["license"] for x in final_selected)))
        sample_urls = [x["source_url"] for x in final_selected[:3]]
        sample_text = final_selected[0]["text"][:160] + "..." if final_selected else ""

        class_summary = {
            "topic": topic,
            "raw_fetched": raw_count,
            "duplicates_filtered": duplicate_count,
            "final_unique_count": len(final_selected),
            "sources": distinct_sources,
            "licenses": distinct_licenses,
            "sample_urls": sample_urls,
            "sample_excerpt": sample_text,
        }
        manifest_by_class.append(class_summary)

        print(f" -> Raw: {raw_count} | Duplicates Filtered: {duplicate_count} | Final Count: {len(final_selected)}")

    # 1. Save CSV
    os.makedirs(DATA_DIR, exist_ok=True)
    fieldnames = ["topic", "text", "source_name", "source_url", "license", "source_category"]
    with open(OUTPUT_CSV, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(all_rows)

    # 2. Save Manifest JSON
    manifest = {
        "dataset_name": "ScribeFlow Multi-Disciplinary Academic Corpus",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "total_classes": len(manifest_by_class),
        "total_examples": len(all_rows),
        "columns": fieldnames,
        "classes": manifest_by_class,
    }
    with open(MANIFEST_JSON, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)

    print("\n" + "=" * 75)
    print(f"Dataset compiled to: {OUTPUT_CSV}")
    print(f"Manifest saved to:   {MANIFEST_JSON}")
    print(f"Total rows:          {len(all_rows)}")
    print("=" * 75)
    return manifest


if __name__ == "__main__":
    build_corpus()
