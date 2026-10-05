from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class StudySet(Base):
    __tablename__ = "study_sets"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    source_name: Mapped[str | None] = mapped_column(String(500))
    transcript: Mapped[str] = mapped_column(Text, nullable=False)
    notes: Mapped[str] = mapped_column(Text, nullable=False)
    topic: Mapped[str] = mapped_column(String(100), nullable=False)
    user_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    flashcards: Mapped[list["Flashcard"]] = relationship(back_populates="study_set", cascade="all, delete-orphan")


class Flashcard(Base):
    __tablename__ = "flashcards"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    study_set_id: Mapped[int] = mapped_column(ForeignKey("study_sets.id", ondelete="CASCADE"))
    seq_num: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    topic: Mapped[str | None] = mapped_column(String(150), nullable=True)
    card_type: Mapped[str | None] = mapped_column(String(100), default="concept", nullable=True)
    difficulty: Mapped[str] = mapped_column(String(50), default="Medium", nullable=False)  # Easy, Medium, Advanced
    question: Mapped[str] = mapped_column(Text, nullable=False)
    answer: Mapped[str] = mapped_column(Text, nullable=False)
    key_takeaway: Mapped[str | None] = mapped_column(Text, nullable=True)
    source_reference: Mapped[str | None] = mapped_column(Text, nullable=True)
    rich_data: Mapped[str | None] = mapped_column(Text, nullable=True)
    rating: Mapped[int | None] = mapped_column(Integer, nullable=True)  # 1: Again, 2: Hard, 3: Good, 4: Easy
    review_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    last_reviewed: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    study_set: Mapped[StudySet] = relationship(back_populates="flashcards")
