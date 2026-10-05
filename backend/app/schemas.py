import json
from datetime import datetime
from typing import Any
from pydantic import BaseModel, Field, model_validator


class ProcessRequest(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    transcript: str = Field(min_length=20)
    topic: str | None = None
    marks: int = Field(default=3, ge=2, le=8)


class FlashcardRatingUpdate(BaseModel):
    rating: int = Field(ge=1, le=4)  # 1: Again, 2: Hard, 3: Good, 4: Easy


class FlashcardOut(BaseModel):
    id: int | None = None
    seq_num: int = 1
    topic: str | None = None
    card_type: str | None = "concept"
    difficulty: str = "Medium"
    question: str
    answer: str
    key_takeaway: str | None = None
    source_reference: str | None = None
    rich_data: dict[str, Any] | None = None
    rating: int | None = None
    review_count: int = 0
    last_reviewed: datetime | None = None

    model_config = {"from_attributes": True}

    @model_validator(mode="before")
    @classmethod
    def process_data(cls, data: Any) -> Any:
        is_obj = not isinstance(data, dict)

        def get_val(key: str, default: Any = None) -> Any:
            if is_obj:
                return getattr(data, key, default)
            return data.get(key, default)

        rd = get_val("rich_data")
        ans = get_val("answer", "")

        # If rd is a JSON string, deserialize it
        if isinstance(rd, str) and rd.strip():
            try:
                rd = json.loads(rd)
            except Exception:
                rd = None

        # Backwards compatibility: If rd is None, but ans is JSON rich_data
        if rd is None and isinstance(ans, str) and ans.strip().startswith("{"):
            try:
                parsed_ans = json.loads(ans)
                if isinstance(parsed_ans, dict) and ("definition" in parsed_ans or "title" in parsed_ans):
                    rd = parsed_ans
                    ans = parsed_ans.get("definition") or parsed_ans.get("title") or ans
            except Exception:
                pass

        if is_obj:
            return {
                "id": get_val("id"),
                "seq_num": get_val("seq_num") or 1,
                "topic": get_val("topic"),
                "card_type": get_val("card_type") or "concept",
                "difficulty": get_val("difficulty") or "Medium",
                "question": get_val("question", ""),
                "answer": ans,
                "key_takeaway": get_val("key_takeaway"),
                "source_reference": get_val("source_reference"),
                "rich_data": rd,
                "rating": get_val("rating"),
                "review_count": get_val("review_count") or 0,
                "last_reviewed": get_val("last_reviewed"),
            }
        data["rich_data"] = rd
        data["answer"] = ans
        return data


class FlashcardsSummary(BaseModel):
    total_cards: int = 0
    difficulty_counts: dict[str, int] = {}
    topic_counts: dict[str, int] = {}
    card_type_counts: dict[str, int] = {}
    challenging_count: int = 0


class StudySetOut(BaseModel):
    id: int
    title: str
    source_name: str | None
    transcript: str
    notes: str
    topic: str
    user_id: str | None = None
    confidence: float | None = None
    generator_used: str | None = None
    marks: int | None = None
    flashcards: list[FlashcardOut]
    summary: FlashcardsSummary | None = None

    model_config = {"from_attributes": True}

    @model_validator(mode="after")
    def compute_summary(self) -> "StudySetOut":
        if self.summary is None and self.flashcards:
            total = len(self.flashcards)
            diff_counts: dict[str, int] = {}
            topic_counts: dict[str, int] = {}
            type_counts: dict[str, int] = {}
            challenging = 0

            for card in self.flashcards:
                d = card.difficulty or "Medium"
                diff_counts[d] = diff_counts.get(d, 0) + 1

                t = card.topic or self.topic or "General"
                topic_counts[t] = topic_counts.get(t, 0) + 1

                ct = card.card_type or "concept"
                type_counts[ct] = type_counts.get(ct, 0) + 1

                if card.rating in (1, 2):  # Again or Hard
                    challenging += 1

            self.summary = FlashcardsSummary(
                total_cards=total,
                difficulty_counts=diff_counts,
                topic_counts=topic_counts,
                card_type_counts=type_counts,
                challenging_count=challenging,
            )
        return self


class TopicPredictRequest(BaseModel):
    text: str = Field(min_length=5)


class TopicPredictResponse(BaseModel):
    predicted_topic: str
    confidence: float
    is_uncertain: bool
    supported_subjects: list[str]


class TopicUpdateRequest(BaseModel):
    topic: str = Field(min_length=1, max_length=100)


class StudySetRenameRequest(BaseModel):
    title: str = Field(min_length=1, max_length=200)


class YouTubeImportRequest(BaseModel):
    url: str = Field(min_length=5, max_length=500)
    access_token: str | None = None
    title: str | None = None
    topic: str | None = None
    marks: int = Field(default=3, ge=2, le=8)
    direct_create: bool = False

