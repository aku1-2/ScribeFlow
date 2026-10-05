"""ScribeFlow Study Material Generation Pipeline.

Generates complete, precise, well-structured educational study notes and
varied exam flashcards across ALL supported subjects (Literature, Sciences,
Mathematics, Engineering, History, Economics, and General Studies).
"""

import json
import logging
import os
import re
import tempfile
import time
from typing import Any

import httpx

from app.config import settings
from app.transcription import get_transcription_provider

logger = logging.getLogger("scribeflow.ai")

GROQ_CHAT_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions"
PRIMARY_LLM_MODEL = "openai/gpt-oss-120b"
LLM_MODELS_POOL = [
    "openai/gpt-oss-120b",
    "qwen/qwen3.8-27b",
    "openai/gpt-oss-20b",
]

# Subject-specific pedagogical guidance
SUBJECT_GUIDELINES: dict[str, dict[str, str]] = {
    "English / Literature": {
        "domain": "Literature, Literary Theory, & Languages",
        "focus": (
            "Narrative and poetic structure, thematic meaning, motifs, character development, "
            "psychological motivations, narrative voice/point of view, literary devices "
            "(metaphor, irony, symbolism, imagery), textual evidence, and critical interpretation."
        ),
        "specifics": (
            "- Contextualize genre conventions, narrative tone, and literary structure.\n"
            "- Analyze key passages, dialogues, and symbols directly with subtext commentary.\n"
            "- Dissect structural narrative arcs (exposition, inciting incident, conflict, resolution).\n"
            "- Contrast character motivations or thematic conflicts in clear comparison tables."
        ),
        "exam_focus": "Thematic analysis, character motivation, literary devices, and critical textual interpretation.",
    },
    "Computer Science / IT": {
        "domain": "Computer Science, Software Engineering, & IT",
        "focus": (
            "Data structures, algorithms, asymptotic computational complexity (O(1), O(log n), O(n), O(n log n), O(n^2)), "
            "system architectures, mechanisms, state transitions, invariants, edge cases, and design trade-offs."
        ),
        "specifics": (
            "- State rigorous definitions of computational structures, data types, and problem definitions.\n"
            "- Detail operation steps (insertion, deletion, traversal, lookup, execution flow) step by step.\n"
            "- Provide asymptotic time and space complexity with best, average, and worst-case analyses.\n"
            "- Compare alternative algorithms, data structures, or paradigms in clear comparison tables."
        ),
        "exam_focus": "Algorithm tracing, complexity derivations, data structure operations, and trade-off comparisons.",
    },
    "Electrical and Electronics Engineering": {
        "domain": "Electrical, Electronics, & Communications Engineering",
        "focus": (
            "Circuit theory, signals and systems, semiconductors, electromagnetic principles, "
            "governing laws (Ohm's, Kirchhoff's, Maxwell's), frequency response, units (V, A, Hz, Ω, F, H), "
            "transfer functions, component ratings, and hardware constraints."
        ),
        "specifics": (
            "- Define components, signal classifications, and circuit topologies.\n"
            "- Show step-by-step circuit derivations, mesh/nodal equations, or state responses.\n"
            "- Explicitly state all component ratings, standard SI units, and operating regimes.\n"
            "- Compare ideal circuit models vs practical non-ideal behaviors in tables."
        ),
        "exam_focus": "Circuit analysis, transfer function derivation, frequency response, and parameter calculations.",
    },
    "Engineering (Mechanical, Civil, Chemical)": {
        "domain": "Applied Engineering (Mechanical, Civil, Chemical)",
        "focus": (
            "Statics, dynamics, thermodynamics, fluid mechanics, stress/strain analysis, "
            "material properties, safety factors, mass/energy balances, transport phenomena, "
            "and unit dimensions (N, Pa, J, W, kg/m³)."
        ),
        "specifics": (
            "- Define physical mechanisms, system boundaries, and conservation laws.\n"
            "- Explain processes step by step (thermodynamic cycles, stress paths, chemical unit operations).\n"
            "- Explicitly specify SI units, dimensional analysis, and safety factor calculations.\n"
            "- Compare material behaviors, thermodynamic cycles, or design trade-offs in tables."
        ),
        "exam_focus": "Governing balance equations, free-body analysis, cycle efficiency, and structural criteria.",
    },
    "Biology / Life Sciences": {
        "domain": "Biology, Life Sciences, & Medicine",
        "focus": (
            "Cellular and molecular biology, physiology, biochemical pathways, genetics, "
            "anatomical structures, organ systems, biological classifications, and evolutionary significance."
        ),
        "specifics": (
            "- Provide complete biological definitions, explaining technical Latin/Greek terminology.\n"
            "- Detail physiological mechanisms and biochemical pathways step by step with inputs/outputs.\n"
            "- Highlight structural adaptations, regulatory feedback loops, and evolutionary functions.\n"
            "- Compare homologous structures, cell types, or pathways in comparison tables."
        ),
        "exam_focus": "Pathway sequencing, cellular structures, regulatory mechanisms, and biological functions.",
    },
    "Physics": {
        "domain": "Physical Sciences & Mechanics",
        "focus": (
            "Fundamental physical laws, mathematical derivations, scalar and vector quantities, "
            "SI units and dimensions, fundamental physical constants, free-body/field descriptions, "
            "idealized assumptions, boundary conditions, and real-world physical systems."
        ),
        "specifics": (
            "- State definitions and physical laws rigorously, specifying vector/scalar nature.\n"
            "- Derive equations step-by-step, stating all intermediate algebraic steps.\n"
            "- Explicitly define all symbols, units, and necessary approximations.\n"
            "- Compare physical regimes (e.g., classical vs relativistic, laminar vs turbulent) in tables."
        ),
        "exam_focus": "Law applications, mathematical derivations, free-body equations, and dimensional analysis.",
    },
    "Chemistry": {
        "domain": "Chemical Sciences & Molecular Systems",
        "focus": (
            "Molecular structures, chemical bonding, reaction mechanisms, stoichiometry, "
            "chemical equilibrium (Ka, Kb, Kp, pH), thermodynamics (ΔH, ΔS, ΔG), kinetics, "
            "spectroscopy, catalysts, and laboratory conditions."
        ),
        "specifics": (
            "- State complete chemical definitions and IUPAC nomenclatures.\n"
            "- Detail reaction mechanisms step by step (intermediates, transition states, electron movement).\n"
            "- Explicitly state balanced stoichiometric equations, states of matter, and equilibrium expressions.\n"
            "- Compare trends in the periodic table, acid/base strengths, or reaction pathways in tables."
        ),
        "exam_focus": "Reaction mechanism steps, equilibrium math, stoichiometric calculations, and periodic trends.",
    },
    "Mathematics": {
        "domain": "Pure & Applied Mathematics",
        "focus": (
            "Axiomatic definitions, mathematical theorems, formulas, explicit variable meanings, "
            "domain/range conditions, step-by-step rigorous proofs, worked problems, and edge cases."
        ),
        "specifics": (
            "- State mathematical definitions and theorems with precise logical notation.\n"
            "- Provide step-by-step worked solutions with every intermediate algebraic or analytical step.\n"
            "- Explicitly explain every symbol, parameter, variable, and constraint.\n"
            "- Highlight common mathematical pitfalls, undefined regions, and edge cases."
        ),
        "exam_focus": "Theorem proofs, step-by-step problem derivations, formula application, and edge cases.",
    },
    "History": {
        "domain": "History & Social Sciences",
        "focus": (
            "Chronological progression, historical periods, underlying vs immediate causes, "
            "key historical figures, treaties, primary source evidence, ideological movements, "
            "sociopolitical dynamics, and long-term historical consequences."
        ),
        "specifics": (
            "- Establish chronological sequence and historical context (social, economic, geopolitical).\n"
            "- Differentiate primary sources, interpretations, and historiographical debates.\n"
            "- Detail cause-and-effect chains leading up to major turning points or conflicts.\n"
            "- Compare historical eras, revolutionary movements, or governing systems in tables."
        ),
        "exam_focus": "Chronological timeline, causal analysis (underlying vs immediate), and historical significance.",
    },
    "Economics": {
        "domain": "Economics, Finance, & Policy",
        "focus": (
            "Microeconomic and macroeconomic models, market structures, price determination, "
            "supply and demand curves, elasticities, underlying assumptions (ceteris paribus), "
            "fiscal and monetary policy tools, welfare economics, and real-world implications."
        ),
        "specifics": (
            "- Define economic concepts with formal definitions and intuitive explanations.\n"
            "- Explain graphical shifts and mathematical relationships step by step.\n"
            "- State all underlying assumptions and boundary conditions of economic models.\n"
            "- Compare market structures (perfect competition, monopoly, oligopoly) or policies in tables."
        ),
        "exam_focus": "Model assumptions, graphical shifts, elasticity calculations, and policy trade-offs.",
    },
    "General Studies": {
        "domain": "Interdisciplinary Studies",
        "focus": (
            "Foundational concepts, structured definitions, contextual background, thematic breakdown, "
            "practical applications, and analytical synthesis across interdisciplinary topics."
        ),
        "specifics": (
            "- State definitions clearly with explanation of unfamiliar terminology.\n"
            "- Explain what concepts mean, why they matter, and how they function.\n"
            "- Provide structured step-by-step progressions and concrete examples.\n"
            "- Compare contrasting approaches or perspectives in structured tables."
        ),
        "exam_focus": "Conceptual definitions, core applications, process steps, and analytical synthesis.",
    },
}


def _get_subject_guidelines(topic: str) -> dict[str, str]:
    """Retrieve pedagogical guidelines tailored to the topic."""
    for key, val in SUBJECT_GUIDELINES.items():
        if key.lower() in topic.lower() or topic.lower() in key.lower():
            return val
    # Fallback to General Studies
    return SUBJECT_GUIDELINES["General Studies"]


def _partition_text_into_sections(text: str, max_chunk_chars: int = 6000) -> list[dict[str, Any]]:
    """Divide transcript into coherent sequential sections preserving sentence and paragraph integrity.
    
    Ensures that long chapters (e.g. 18,000+ chars) are processed section by section
    from beginning to end without silent truncation.
    """
    clean = text.strip()
    if len(clean) <= max_chunk_chars:
        return [{
            "section_index": 1,
            "total_sections": 1,
            "section_title": "Complete Lecture / Chapter",
            "text": clean,
        }]

    # Determine splitting units: paragraphs if present, else sentences
    if "\n\n" in clean:
        units = [p.strip() for p in re.split(r"\n\s*\n", clean) if p.strip()]
        sep = "\n\n"
    else:
        units = [s.strip() for s in re.split(r"(?<=[.!?])\s+", clean) if s.strip()]
        sep = " "

    sections: list[str] = []
    current_chunk: list[str] = []
    current_len = 0

    for u in units:
        u_len = len(u) + len(sep)
        if current_len + u_len > max_chunk_chars and current_chunk:
            sections.append(sep.join(current_chunk))
            current_chunk = [u]
            current_len = len(u)
        else:
            current_chunk.append(u)
            current_len += u_len

    if current_chunk:
        sections.append(sep.join(current_chunk))

    total = len(sections)
    result = []
    for i, s in enumerate(sections):
        if total == 1:
            title = "Complete Chapter"
        elif i == 0:
            title = f"Section 1 of {total}: Beginning & Conceptual Foundations"
        elif i == total - 1:
            title = f"Section {total} of {total}: Climax, Exercises & Chapter Conclusion"
        else:
            title = f"Section {i+1} of {total}: Core Developments & Principles"

        result.append({
            "section_index": i + 1,
            "total_sections": total,
            "section_title": title,
            "text": s,
        })

    return result


def _call_groq_llm(messages: list[dict[str, str]], max_tokens: int = 2500, json_mode: bool = False) -> str | None:
    """Execute Groq Chat Completion with multi-model fallback pool and rate-limit handling."""
    api_key = getattr(settings, "groq_api_key", None)
    if not api_key or api_key.startswith("your_") or not api_key.startswith("gsk_"):
        return None

    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}

    for model in LLM_MODELS_POOL:
        payload: dict[str, Any] = {
            "model": model,
            "messages": messages,
            "temperature": 0.2,
            "max_completion_tokens": max_tokens,
        }
        if json_mode:
            payload["response_format"] = {"type": "json_object"}

        for attempt in range(2):
            try:
                with httpx.Client(timeout=60.0) as client:
                    resp = client.post(GROQ_CHAT_ENDPOINT, headers=headers, json=payload)
                    if resp.status_code == 200:
                        return resp.json()["choices"][0]["message"]["content"].strip()
                    elif resp.status_code == 429:
                        logger.warning("Rate limit (429) hit on model %s (attempt %d). Trying next candidate.", model, attempt + 1)
                        time.sleep(2.0)
                    else:
                        logger.warning("Groq model %s returned status %s: %s", model, resp.status_code, resp.text[:100])
                        break
            except Exception as e:
                logger.warning("Groq request error on model %s: %s", model, e)
                break

    return None


def _generate_section_notes(
    section_data: dict[str, Any], topic: str, marks: int, api_key: str
) -> str | None:
    """Generate in-depth, structured educational study notes for a single source section."""
    guidelines = _get_subject_guidelines(topic)

    system_prompt = (
        f"You are an expert academic master tutor and educational curriculum author in {guidelines['domain']}.\n"
        "Your mission is to generate comprehensive, precise, well-structured educational study notes "
        "that thoroughly teach the content of the provided section and support rigorous exam revision.\n\n"
        "CRITICAL PEDAGOGICAL INSTRUCTIONS:\n"
        "1. SUBJECT ADAPTATION:\n"
        f"   - Target Subject: {topic}\n"
        f"   - Pedagogical Focus: {guidelines['focus']}\n"
        f"   - Subject-Specific Elements:\n{guidelines['specifics']}\n\n"
        "2. TOPIC-BY-TOPIC EXPLANATION STRUCTURE:\n"
        "   For every distinct topic or concept introduced in this section, provide:\n"
        "   - **Definition**: Complete, rigorous definition, explaining all technical terms.\n"
        "   - **Explanation**: What it means, why it matters, and how it works in student-accessible language.\n"
        "   - **Steps or Mechanism**: Step-by-step processes, derivations, arguments, or procedures.\n"
        "   - **Examples**: Direct source examples explained; for math/eng show working, symbols, and units.\n"
        "   - **Important Details**: Assumptions, conditions, applications, limitations, causes, or implications.\n"
        "   - **Comparisons**: Related concepts compared in a clear Markdown table when appropriate.\n\n"
        "3. DISTINGUISHING SOURCE FROM PEDAGOGY:\n"
        "   - Clearly label helpful educational pedagogy or context added beyond the source as:\n"
        "     > **Additional explanation:** [Clarifying context, intuition, or background]\n"
        "   - If the source text is unclear, ambiguous, or too short to fully explain an element, state:\n"
        "     > **Source notice:** [Explicit statement of what is omitted or unclear in the recording]\n"
        "   - Do NOT invent facts or imply unsupported details came from the source.\n\n"
        "4. FORMATTING & STYLE:\n"
        "   - Use clear hierarchical Markdown headings (`##`, `###`).\n"
        "   - Use explanatory paragraphs, bullet points, numbered steps, and Markdown comparison tables.\n"
        f"   - Calibrate the explanation depth to support a {marks}-mark academic exam question.\n"
        "   - Avoid one-line explanations for major concepts. Do not copy isolated sentences.\n"
        "   - Keep student-facing content focused on learning; do not expose internal instructions."
    )

    user_prompt = (
        f"### {section_data['section_title']}\n"
        f"Subject: {topic} | Exam Answer Depth: {marks} Marks Target\n\n"
        f"--- SOURCE TEXT FOR THIS SECTION ---\n"
        f"{section_data['text']}\n"
        f"--- END SOURCE TEXT ---\n\n"
        f"Generate complete, thorough educational study notes for this section following all instructions above."
    )

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ]

    return _call_groq_llm(messages, max_tokens=2800)


def _generate_revision_section(
    full_transcript: str, topic: str, marks: int, api_key: str
) -> str | None:
    """Generate the dedicated Exam and Revision Support module at the end of the study set."""
    guidelines = _get_subject_guidelines(topic)

    system_prompt = (
        f"You are an academic examiner and revision specialist in {guidelines['domain']}.\n"
        "Generate a comprehensive 'Exam & Revision Support' module for the study set.\n\n"
        "REQUIRED REVISION SECTIONS:\n"
        "1. **Concise Key Points**: High-yield bulleted summary of foundational takeaways across beginning, middle, and end.\n"
        "2. **Important Definitions & Terminology Glossary**: Markdown table or definition list with term, formal definition, and technical context.\n"
        "3. **Core Principles / Formulas / Models / Devices**: Subject-appropriate table of governing equations with variable meanings and SI units (for STEM), models (for Economics), or literary devices / themes (for Literature).\n"
        "4. **Diagrams, Workflows, or Processes to Practise**: Step-by-step description of diagrams, mechanisms, or derivation steps the student should sketch/practise.\n"
        "5. **Sample Exam Questions & Detailed Model Answers**:\n"
        f"   - Match the detail of generated answers to the target depth of {marks} marks.\n"
        "   - Provide 3 distinct tiered questions:\n"
        "     * **Short-Answer Question (2 Marks)** with marking criteria and 2-mark model answer.\n"
        f"     * **Medium-Answer Question ({marks} Marks)** with structured step-by-step {marks}-mark model answer.\n"
        "     * **Long-Answer Analytical / Problem-Solving Question (8 Marks)** with detailed analytical model answer and breakdown.\n"
        "   - Do NOT claim questions are 'frequently asked' or 'guaranteed in exams' without evidence; frame them as high-yield revision questions.\n"
        "Respond in clean, beautifully styled Markdown."
    )

    # Use first 8,000 characters to provide sufficient global context
    user_prompt = (
        f"Subject: {topic}\n"
        f"Target Exam Depth: {marks} Marks\n\n"
        f"--- SOURCE CONTEXT SUMMARY ---\n"
        f"{full_transcript[:8000]}\n"
        f"--- END SOURCE CONTEXT ---\n\n"
        f"Produce the complete Exam & Revision Support module."
    )

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ]

    return _call_groq_llm(messages, max_tokens=2500)


def _generate_fallback_revision_section(text: str, topic: str, marks: int) -> str:
    """Generate structured revision section when offline or if LLM call hits rate limits."""
    guidelines = _get_subject_guidelines(topic)
    sentences = [s.strip() for s in re.split(r"(?<=[.!?])\s+", text) if len(s.strip()) > 20]
    s_beg = sentences[0] if sentences else topic
    s_mid = sentences[len(sentences) // 2] if sentences else topic
    s_end = sentences[-1] if sentences else topic

    return (
        f"### 1. Concise Key Points\n"
        f"- **Foundational Principle**: {s_beg}\n"
        f"- **Pivotal Development**: {s_mid}\n"
        f"- **Concluding Outcome**: {s_end}\n\n"
        f"### 2. Important Definitions & Terminology Glossary\n"
        f"| Term / Concept | Academic Significance ({guidelines['domain']}) |\n"
        f"| :--- | :--- |\n"
        f"| **{topic} Core Framework** | {s_beg[:100]} |\n"
        f"| **Central Mechanism / Motif** | {s_mid[:100]} |\n"
        f"| **Synthesis / Application** | {s_end[:100]} |\n\n"
        f"### 3. Core Principles, Models & Devices\n"
        f"- **Focus Domain**: {guidelines['domain']}\n"
        f"- **Analytical Emphasis**: {guidelines['exam_focus']}\n\n"
        f"### 4. Processes & Tasks to Practise\n"
        f"1. Trace the progression from the opening premise to the central turning point.\n"
        f"2. Practise applying the key equations, models, or textual devices to novel examination prompts.\n\n"
        f"### 5. Sample Exam Questions & Detailed Model Answers ({marks} Marks Standard)\n"
        f"- **Short-Answer Question (2 Marks)**: State the primary premise or definition established at the start of this material.\n"
        f"  - *Model Answer (2 Marks)*: {s_beg}\n"
        f"- **Medium-Answer Question ({marks} Marks)**: Explain the central development, mechanism, or thematic turning point.\n"
        f"  - *Model Answer ({marks} Marks)*: In the core development, {s_mid}. For full marks, explain how this interacts with the overarching context.\n"
        f"- **Long-Answer Analytical Question (8 Marks)**: Critically analyze the complete development and its broader implications.\n"
        f"  - *Model Answer (8 Marks)*: A comprehensive 8-mark response must synthesize: (1) Initial conditions/exposition: {s_beg[:90]}; (2) Primary mechanism or conflict: {s_mid[:90]}; (3) Final outcomes and analytical significance: {s_end[:90]}."
    )



def _generate_flashcards(
    full_transcript: str, topic: str, marks: int, api_key: str
) -> list[dict[str, Any]] | None:
    """Generate varied, high-quality active-recall exam flashcards testing distinct learning objectives."""
    guidelines = _get_subject_guidelines(topic)
    clean_text = full_transcript.strip()
    
    # Scale card count based on text length: 6 to 14 cards
    target_count = min(14, max(6, len(clean_text) // 1500))

    # For long chapters, provide excerpts from beginning, middle, and end
    if len(clean_text) <= 12000:
        source_context = clean_text
    else:
        third = len(clean_text) // 3
        beg_chunk = clean_text[:4000]
        mid_chunk = clean_text[third - 1500 : third + 2500]
        end_chunk = clean_text[-4000:]
        source_context = (
            f"=== PART 1: BEGINNING & FOUNDATIONAL CONCEPTS ===\n{beg_chunk}\n\n"
            f"=== PART 2: MIDDLE & CORE PROCEDURAL/THEMATIC DEVELOPMENT ===\n{mid_chunk}\n\n"
            f"=== PART 3: CONCLUSION, SYNTHESIS & RESOLUTION ===\n{end_chunk}"
        )

    system_prompt = (
        f"You are an expert academic curriculum designer and exam examiner specializing in {guidelines['domain']}.\n"
        "Your task is to generate active-recall flashcards that test specific, rigorous learning objectives across "
        "the entire source material (beginning, middle, and end). Follow active-recall principles:\n"
        "- Never simply rephrase a single isolated sentence into a trivial question.\n"
        "- Avoid generic 'What is the key takeaway?' or answer-revealing wording.\n"
        "- Ensure each card tests one clear learning objective.\n"
        "- Easy cards: test foundational definitions, core terminology, or basic recall.\n"
        "- Medium cards: test understanding, relationships, mechanisms, step-by-step processes, or comparisons.\n"
        "- Advanced cards: test analytical synthesis, scenarios, edge cases, formulas/derivations, or problem-solving.\n"
        "- Adapt card types to the subject:\n"
        "  * Literature: character motivations, thematic conflicts, narrative structure, literary devices, textual interpretation.\n"
        "  * Computer Science / Math: algorithm steps, asymptotic complexity, formulas, edge cases, state transitions.\n"
        "  * Science / Engineering: mechanisms, experimental conditions, cause-and-effect, distinctions, formulas.\n"
        "  * Social Sciences / General: structural models, cause/consequence, comparative frameworks, key hypotheses.\n\n"
        "Return valid JSON strictly with a single key 'flashcards' containing an array of objects:\n"
        "  - 'seq_num': integer (1, 2, 3, ...)\n"
        "  - 'topic': subtopic or chapter section name (e.g. 'Foundational Definitions', 'Core Mechanism', 'Analytical Synthesis')\n"
        "  - 'card_type': one of ['definition', 'mechanism', 'comparison', 'application', 'formula', 'misconception', 'interpretation', 'scenario']\n"
        "  - 'difficulty': strictly one of ['Easy', 'Medium', 'Advanced']\n"
        "  - 'question': clear, focused, unambiguous question\n"
        "  - 'answer': concise yet complete, self-contained explanation (2-4 sentences)\n"
        "  - 'key_takeaway': high-impact 1-sentence active-recall anchor\n"
        "  - 'source_reference': brief excerpt or section reference from the source\n"
        "  - 'rich_data': object formatted for handwritten aesthetic display with keys:\n"
        "      * 'title': short punchy title (3-5 words)\n"
        "      * 'definition': core concept definition (1-2 sentences)\n"
        "      * 'examples': array of { 'equation': str, 'note': str }\n"
        "      * 'important': critical caveat, exam pitfall, or condition\n"
        "      * 'comparison_title': e.g. 'CONCEPT COMPARISON' or 'KEY DISTINCTION'\n"
        "      * 'comparison_text': analytical contrast or distinction\n"
        "      * 'rule_boxes': array of 1-2 takeaway formulas, rules, or mnemonics"
    )

    user_prompt = (
        f"Subject: {topic}\n"
        f"Target Depth: {marks} Marks Standard\n"
        f"Target Flashcard Count: {target_count} cards\n\n"
        f"--- SOURCE MATERIAL ---\n"
        f"{source_context}\n"
        f"--- END SOURCE MATERIAL ---\n\n"
        f"Generate exactly {target_count} varied, active-recall flashcards covering beginning, middle, and end."
    )

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ]

    raw_json = _call_groq_llm(messages, max_tokens=3500, json_mode=True)
    if not raw_json:
        return None

    try:
        parsed = json.loads(raw_json)
        cards = parsed.get("flashcards", [])
        if isinstance(cards, list) and len(cards) >= 4:
            valid_cards: list[dict[str, Any]] = []
            seen_questions: set[str] = set()

            for idx, c in enumerate(cards):
                q = str(c.get("question", "")).strip()
                ans = str(c.get("answer", "")).strip()
                if not q or not ans or len(q) < 8 or len(ans) < 8:
                    continue

                q_norm = re.sub(r"[^a-zA-Z0-9]", "", q.lower())
                if q_norm in seen_questions:
                    continue
                seen_questions.add(q_norm)

                diff = c.get("difficulty", "Medium")
                if diff not in ("Easy", "Medium", "Advanced"):
                    diff = "Medium"

                rd = c.get("rich_data")
                if not isinstance(rd, dict) or not rd.get("definition"):
                    rd = {
                        "title": c.get("topic") or f"Concept #{idx + 1}",
                        "definition": ans[:140],
                        "examples": [{"equation": q[:70], "note": "Active Recall Question"}],
                        "important": c.get("key_takeaway") or "Ensure active retrieval before revealing the answer.",
                        "comparison_title": "KEY DISTINCTION",
                        "comparison_text": "Differentiate this concept from adjacent principles in this chapter.",
                        "rule_boxes": [c.get("key_takeaway") or f"{topic} Core Concept"],
                    }

                valid_cards.append({
                    "seq_num": idx + 1,
                    "topic": c.get("topic") or topic,
                    "card_type": c.get("card_type") or "concept",
                    "difficulty": diff,
                    "question": q,
                    "answer": ans,
                    "key_takeaway": c.get("key_takeaway") or ans[:100],
                    "source_reference": c.get("source_reference"),
                    "rich_data": rd,
                })

            if len(valid_cards) >= 4:
                return valid_cards
    except Exception as e:
        logger.warning("Flashcard JSON parse or validation failed: %s", e)

    return None


def _generate_fallback_material(
    transcript: str, topic: str = "General Studies", marks: int = 3
) -> tuple[str, list[dict[str, Any]]]:
    """Robust multi-section deterministic fallback generator.
    
    Processes the entire source text from beginning to end without silent truncation
    when external LLM services are unavailable.
    """
    clean_text = transcript.strip()
    sentences = [s.strip() for s in re.split(r"(?<=[.!?])\s+", clean_text) if len(s.strip()) > 20]

    if not sentences:
        return (
            f"# {topic}: Overview\n\nNo text content available.",
            [{
                "seq_num": 1,
                "topic": topic,
                "card_type": "definition",
                "difficulty": "Easy",
                "question": f"What is the topic of this {topic} lecture?",
                "answer": clean_text[:200] or "No lecture content provided.",
                "key_takeaway": "Provide transcript content for active recall study.",
                "source_reference": None,
                "rich_data": {
                    "title": topic,
                    "definition": clean_text[:120] or "Empty lecture material.",
                    "examples": [],
                    "important": "Provide source transcript.",
                    "comparison_title": "OVERVIEW",
                    "comparison_text": "Study material requires text.",
                    "rule_boxes": [topic],
                },
            }],
        )

    n = len(sentences)
    guidelines = _get_subject_guidelines(topic)

    # Partition sentences across beginning (0-33%), middle (33-66%), and ending (66-100%)
    n_third = max(1, n // 3)
    beg_sentences = sentences[:n_third]
    mid_sentences = sentences[n_third : 2 * n_third]
    end_sentences = sentences[2 * n_third :]

    # Detect definition-like sentences
    def_keywords = ("is defined as", "refers to", "is a", "are defined as", "means", "is called")
    definitions = [s for s in sentences if any(kw in s.lower() for kw in def_keywords)]

    notes_sections = [
        f"# Complete Study Notes: {topic}",
        f"> *Subject Domain: {guidelines['domain']} | Target Depth: {marks} Marks*",
        "> *Notice: Generated using local rule-based extractor across beginning, middle, and end. Connect Groq API key for deep AI exam analysis.*",
        "\n---",
        "\n## 1. Beginning & Conceptual Foundations",
    ]
    notes_sections.extend(f"- {s}" for s in beg_sentences[:6])
    if len(beg_sentences) > 6:
        notes_sections.append(f"- *Additional context:* {beg_sentences[6]}")

    notes_sections.append("\n## 2. Core Principles & Detailed Development")
    notes_sections.extend(f"- {s}" for s in mid_sentences[:6])
    if len(mid_sentences) > 6:
        notes_sections.append(f"- *Analytical detail:* {mid_sentences[6]}")

    notes_sections.append("\n## 3. Climax, Synthesis & Chapter Conclusion")
    notes_sections.extend(f"- {s}" for s in end_sentences[:6])

    # Add Definitions & Terminology section
    notes_sections.append("\n---\n## 4. Key Terminology & Definitions")
    if definitions:
        notes_sections.append("| Term / Statement | Contextual Meaning |")
        notes_sections.append("| :--- | :--- |")
        for d in definitions[:4]:
            parts = d.split(" is ", 1)
            if len(parts) == 2:
                notes_sections.append(f"| **{parts[0][:40].strip()}** | {parts[1][:90].strip()} |")
            else:
                notes_sections.append(f"| **Core Concept** | {d[:100]} |")
    else:
        notes_sections.append(f"- **Primary Subject**: {topic}")
        notes_sections.append(f"- **Key Passage**: {sentences[0]}")

    # Add Exam and Revision Support module
    notes_sections.extend([
        "\n---\n## 5. Exam & Revision Support",
        f"### Concise Key Points ({marks} Marks Standard)",
        f"1. **Foundational Concept**: {sentences[0]}",
        f"2. **Pivotal Development**: {mid_sentences[0] if mid_sentences else sentences[0]}",
        f"3. **Resolution & Synthesis**: {end_sentences[-1] if end_sentences else sentences[-1]}",
        "\n### Sample Revision Questions & Marking Criteria",
        f"- **Short-Answer Question (2 Marks)**: What foundational premise is established at the beginning of this text?",
        f"  - *Model Answer (2 Marks)*: {beg_sentences[0]}",
        f"- **Medium-Answer Question ({marks} Marks)**: Explain the central development and mechanisms detailed in the text.",
        f"  - *Model Answer ({marks} Marks)*: In the core development, {mid_sentences[len(mid_sentences)//2] if mid_sentences else sentences[0]}. For full marks, connect this to the overall context.",
        f"- **Long-Answer Question (8 Marks)**: Critically analyze the complete progression from the initial premise to the final outcome.",
        f"  - *Model Answer (8 Marks)*: A comprehensive 8-mark answer addresses: (1) Exposition: {beg_sentences[0][:80]}; (2) Development: {mid_sentences[0][:80] if mid_sentences else ''}; (3) Conclusion: {end_sentences[-1][:80] if end_sentences else ''}.",
    ])

    notes = "\n".join(notes_sections)

    # Varied Active-Recall Flashcards across beginning, middle, and end with full fields
    cards: list[dict[str, Any]] = []

    # Card 1: Easy - Foundational Concept / Exposition
    s0 = beg_sentences[0]
    cards.append({
        "seq_num": 1,
        "topic": "Foundations & Exposition",
        "card_type": "definition" if "Literature" not in topic else "plot_and_structure",
        "difficulty": "Easy",
        "question": f"What foundational premise is established at the start of this {topic} material?",
        "answer": f"At the opening of the text, the foundational premise is established as follows: {s0}. This sets the conceptual framework for subsequent developments.",
        "key_takeaway": f"The chapter opens by anchoring the reader in: {s0[:80]}.",
        "source_reference": f"Beginning passage: '{s0[:70]}...'",
        "rich_data": {
            "title": "Exposition & Setting",
            "definition": s0,
            "examples": [{"equation": s0[:80], "note": "Opening textual premise"}],
            "important": "Exposition establishes character context and foundational assumptions.",
            "comparison_title": "EXPOSITION vs DEVELOPMENT",
            "comparison_text": "Early passages establish narrative parameters before conflict or analytical complexity arises.",
            "rule_boxes": ["Beginning = Context & Initial State"],
        },
    })

    # Card 2: Medium - Core Mechanism & Development
    sm = mid_sentences[len(mid_sentences) // 2] if mid_sentences else s0
    cards.append({
        "seq_num": 2,
        "topic": "Core Mechanism & Conflict",
        "card_type": "mechanism" if "Literature" not in topic else "theme_and_message",
        "difficulty": "Medium",
        "question": f"How does the text develop the central conflict or operational mechanism?",
        "answer": f"In the central development of the chapter: {sm}. This represents the turning point or critical operational phase.",
        "key_takeaway": f"The turning point pivots on: {sm[:80]}.",
        "source_reference": f"Middle passage: '{sm[:70]}...'",
        "rich_data": {
            "title": "Central Development",
            "definition": sm,
            "examples": [{"equation": sm[:80], "note": "Key narrative/analytical development"}],
            "important": "Middle sections contain the primary operational mechanics and pivotal events.",
            "comparison_title": "CORE ANALYSIS",
            "comparison_text": "Examines how internal tensions or procedural steps interact to alter outcomes.",
            "rule_boxes": ["Development = Active Process & Tension"],
        },
    })

    # Card 3: Medium - Distinctions & Comparisons
    s_mid_alt = mid_sentences[0] if mid_sentences else s0
    cards.append({
        "seq_num": 3,
        "topic": "Key Distinctions & Relationships",
        "card_type": "comparison",
        "difficulty": "Medium",
        "question": f"Compare the initial premise with the developing conditions in this {topic} material.",
        "answer": f"While the initial premise introduces '{s0[:80]}', the central development advances the framework through '{s_mid_alt[:80]}'. The critical distinction is that the development introduces active dynamics and tensions not present in the initial state.",
        "key_takeaway": "Distinguish between static starting conditions and dynamic operational developments.",
        "source_reference": f"Source sections: '{s0[:50]}' vs '{s_mid_alt[:50]}'",
        "rich_data": {
            "title": "Comparative Framework",
            "definition": "Distinction between foundational conditions and dynamic transformations.",
            "examples": [
                {"equation": s0[:70], "note": "Initial Baseline"},
                {"equation": s_mid_alt[:70], "note": "Dynamic State"},
            ],
            "important": "Always identify the transition factor that changes the state or narrative.",
            "comparison_title": "INITIAL STATE vs PROGRESSION",
            "comparison_text": "Static introduction provides grounding; progression introduces real-world tension or complexity.",
            "rule_boxes": ["Contrast Baseline with Active State"],
        },
    })

    # Card 4: Advanced - Evidence & Textual Analysis
    s_extra = sentences[min(len(sentences) - 2, max(1, len(sentences) // 3))]
    cards.append({
        "seq_num": 4,
        "topic": "Evidence-Based Analysis",
        "card_type": "interpretation",
        "difficulty": "Advanced",
        "question": f"Analyze the analytical significance of the following evidence: '{s_extra[:80]}...'?",
        "answer": f"This detail highlights: {s_extra}. In academic examination, this evidence demonstrates how specific textual details or empirical observations substantiate the broader theoretical thesis.",
        "key_takeaway": "Evidence directly anchors conceptual claims to the source text.",
        "source_reference": s_extra[:100],
        "rich_data": {
            "title": "Textual Evidence",
            "definition": s_extra,
            "examples": [{"equation": s_extra[:80], "note": "Exam evidence citation"}],
            "important": "Always connect specific citations back to the broader exam question.",
            "comparison_title": "EVIDENCE vs ASSERTION",
            "comparison_text": "Unsupported claims forfeit marks; explicit textual references secure the full score.",
            "rule_boxes": ["Evidence + Analysis = Full Marks"],
        },
    })

    # Card 5: Advanced - Synthesis & Climax Resolution
    se = end_sentences[-1] if end_sentences else s0
    cards.append({
        "seq_num": 5,
        "topic": "Synthesis & Final Outcome",
        "card_type": "application" if "Literature" not in topic else "plot_and_structure",
        "difficulty": "Advanced",
        "question": f"What concluding synthesis or resolution does the text arrive at, and what are its implications?",
        "answer": f"The material concludes with the following resolution: {se}. This synthesizes the overarching takeaways and demonstrates the final equilibrium or narrative resolution.",
        "key_takeaway": f"Resolution: {se[:80]}.",
        "source_reference": f"Concluding passage: '{se[:70]}...'",
        "rich_data": {
            "title": "Chapter Resolution",
            "definition": se,
            "examples": [{"equation": se[:80], "note": "Concluding synthesis"}],
            "important": "Exam questions frequently target the final implications and outcomes.",
            "comparison_title": "FINAL SYNTHESIS",
            "comparison_text": "Synthesizes preceding arguments into actionable or thematic conclusions.",
            "rule_boxes": ["Conclusion = Resolution & Key Takeaway"],
        },
    })

    # Card 6: Easy / Medium - Critical Rule or Misconception
    if definitions:
        def_s = definitions[0]
        cards.append({
            "seq_num": 6,
            "topic": "Terminology & Formal Definition",
            "card_type": "definition",
            "difficulty": "Easy",
            "question": f"State the formal definition or statement regarding: '{def_s[:50]}...'",
            "answer": f"According to the source material: {def_s}. This definition is critical for establishing technical precision.",
            "key_takeaway": f"Core Definition: {def_s[:80]}.",
            "source_reference": def_s[:100],
            "rich_data": {
                "title": "Formal Definition",
                "definition": def_s,
                "examples": [{"equation": def_s[:75], "note": "Precise formulation"}],
                "important": "Do not paraphrase technical terms where exact phrasing is required.",
                "comparison_title": "FORMAL vs COLLOQUIAL",
                "comparison_text": "Technical concepts require precise terminology rather than casual approximation.",
                "rule_boxes": ["Precision = Academic Clarity"],
            },
        })
    else:
        cards.append({
            "seq_num": 6,
            "topic": "Common Pitfall & Misconception",
            "card_type": "misconception",
            "difficulty": "Medium",
            "question": f"What common misconception should students avoid when interpreting this {topic} material?",
            "answer": f"A frequent pitfall is treating '{s0[:60]}' as a static standalone fact rather than connecting it to the broader development: '{sm[:60]}'. Full comprehension requires tracing the causal progression.",
            "key_takeaway": "Avoid isolated memorization; connect initial premises to central outcomes.",
            "source_reference": f"Synthesis of '{s0[:40]}' and '{sm[:40]}'",
            "rich_data": {
                "title": "Exam Pitfall",
                "definition": "Isolated recall without relational understanding leads to shallow exam answers.",
                "examples": [{"equation": "Premise + Process -> Conclusion", "note": "Integrated framework"}],
                "important": "Always show cause-and-effect relationships rather than isolated statements.",
                "comparison_title": "ISOLATED RECALL vs SYNTHESIS",
                "comparison_text": "High scorers demonstrate relational understanding across the entire chapter.",
                "rule_boxes": ["Connect Concepts Across the Chapter"],
            },
        })

    return notes, cards


def create_study_material(
    transcript: str, topic: str = "General Studies", marks: int = 3
) -> tuple[str, list[dict[str, Any]], str]:
    """Generate complete, high-quality, subject-adapted study notes and varied flashcards.
    
    Processes the entire transcript from beginning to end, using section-by-section
    synthesis for long material to guarantee full chapter coverage without truncation.
    Returns (notes, flashcards, generator_label).
    """
    clean_text = transcript.strip()
    if not clean_text:
        return "", [], "Empty Input"

    api_key = getattr(settings, "groq_api_key", None)
    is_groq_configured = bool(api_key and not api_key.startswith("your_") and api_key.startswith("gsk_"))

    if is_groq_configured:
        logger.info("Starting Groq study material generation for subject '%s' (%d chars, %d marks)", topic, len(clean_text), marks)
        sections = _partition_text_into_sections(clean_text, max_chunk_chars=6000)
        logger.info("Partitioned transcript into %d section(s) for complete beginning-to-end processing.", len(sections))

        section_notes_list: list[str] = []
        all_sections_succeeded = True

        for sec in sections:
            logger.info("Generating study notes for section %d of %d: '%s' (%d chars)", sec["section_index"], sec["total_sections"], sec["section_title"], len(sec["text"]))
            sec_note = _generate_section_notes(sec, topic, marks, api_key)
            if sec_note:
                section_notes_list.append(sec_note)
            else:
                logger.warning("Section %d LLM generation encountered limit; creating structured section fallback.", sec["section_index"])
                sec_fb, _ = _generate_fallback_material(sec["text"], topic=topic, marks=marks)
                section_notes_list.append(sec_fb)
            time.sleep(1.0)

        if section_notes_list:
            combined_section_notes = "\n\n---\n\n".join(section_notes_list)
            
            # Generate the Exam and Revision Support module
            logger.info("Generating Exam & Revision Support module for '%s'...", topic)
            revision_section = _generate_revision_section(clean_text, topic, marks, api_key)
            
            full_notes_parts = [
                f"# Complete Study Notes: {topic}",
                f"> **Subject Domain**: {_get_subject_guidelines(topic)['domain']} | **Target Exam Depth**: {marks} Marks Standard",
                "\n" + combined_section_notes,
            ]
            if not revision_section:
                revision_section = _generate_fallback_revision_section(clean_text, topic, marks)
            full_notes_parts.extend(["\n\n---\n\n## 📝 Exam & Revision Support", revision_section])

            full_notes = "\n".join(full_notes_parts)

            # Generate 6 to 8 varied flashcards spanning beginning, middle, and end
            logger.info("Generating varied flashcards for '%s'...", topic)
            flashcards = _generate_flashcards(clean_text, topic, marks, api_key)
            if not flashcards:
                # Use fallback cards if flashcard generation JSON failed
                _, fallback_cards = _generate_fallback_material(clean_text, topic=topic, marks=marks)
                flashcards = fallback_cards

            logger.info("Successfully generated complete multi-section study notes and %d flashcards using Groq LLM", len(flashcards))
            return full_notes, flashcards, f"Groq LLM ({PRIMARY_LLM_MODEL})"

    # Fallback to deterministic multi-section generator when offline or if Groq fails
    logger.info("Using deterministic multi-section fallback generator for subject '%s'", topic)
    notes, cards = _generate_fallback_material(clean_text, topic=topic, marks=marks)
    return notes, cards, "Basic Fallback Generator (Rule-based)"


def generate_flashcards_only(
    transcript: str, topic: str = "General Studies", marks: int = 3
) -> tuple[list[dict[str, Any]], str]:
    """Generate active-recall flashcards only, using Groq LLM if available, or fallback."""
    clean_text = transcript.strip()
    if not clean_text:
        return [], "Empty Input"

    api_key = getattr(settings, "groq_api_key", None)
    is_groq_configured = bool(api_key and not api_key.startswith("your_") and api_key.startswith("gsk_"))

    if is_groq_configured:
        cards = _generate_flashcards(clean_text, topic, marks, api_key)
        if cards:
            return cards, f"Groq LLM ({PRIMARY_LLM_MODEL})"

    _, fallback_cards = _generate_fallback_material(clean_text, topic=topic, marks=marks)
    return fallback_cards, "Basic Fallback Generator (Rule-based)"


def transcribe_upload(filename: str, content: bytes) -> str:
    """Safe temporary-file handling for audio uploads, delegating to the configured provider."""
    provider = get_transcription_provider()

    _, ext = os.path.splitext(filename)
    if not ext:
        ext = ".wav"

    temp_fd, temp_path = tempfile.mkstemp(suffix=ext, prefix="scribeflow_audio_")
    try:
        with os.fdopen(temp_fd, "wb") as f:
            f.write(content)

        logger.info("Delegating audio transcription (%s bytes) to provider: %s", len(content), provider.name())
        transcript = provider.transcribe(temp_path, filename)
        return transcript
    finally:
        if os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except Exception as e:
                logger.warning("Failed to remove temporary file %s: %s", temp_path, e)
