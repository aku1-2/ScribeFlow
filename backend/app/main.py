import json
import logging
import os
from contextlib import asynccontextmanager
from datetime import datetime

from fastapi import Depends, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.ai import create_study_material, generate_flashcards_only, transcribe_upload
from app.auth import CurrentUser, create_dev_token, get_current_user, get_optional_current_user, is_development_auth_enabled
from app.config import settings
from app.database import get_db, get_db_status, init_db
from app.models import Flashcard, StudySet
from app.schemas import (
    FlashcardOut,
    FlashcardRatingUpdate,
    ProcessRequest,
    StudySetOut,
    StudySetRenameRequest,
    TopicPredictRequest,
    TopicPredictResponse,
    TopicUpdateRequest,
    YouTubeImportRequest,
)
from app.topic_model import (
    SUPPORTED_SUBJECTS,
    UNKNOWN_LABEL,
    get_model_info,
    predict_topic_with_confidence,
)
from app.transcription import (
    ALLOWED_AUDIO_EXTENSIONS,
    MAX_AUDIO_SIZE_BYTES,
    get_provider_status,
)
from app.video import process_and_transcribe_video, validate_video_upload
from app.youtube import (
    fetch_official_youtube_captions,
    get_youtube_integration_status,
    validate_and_extract_youtube_id,
)

logger = logging.getLogger("scribeflow")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize database tables on startup
    init_db()
    yield


app = FastAPI(
    title="ScribeFlow API",
    version="0.2.0",
    description="Backend API for ScribeFlow AI-assisted learning platform.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        settings.frontend_origin,
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
    ],
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health():
    """System health check reporting database, topic model, and transcription status."""
    return {
        "status": "ok",
        "database": get_db_status(),
        "model": get_model_info(),
        "transcription": get_provider_status(),
    }


@app.get("/api/transcribe/status")
def transcription_status():
    """Check currently active transcription provider and capabilities."""
    return get_provider_status()


@app.get("/api/topics")
def get_topics_list():
    """List supported subjects and uncertainty labels for frontend selection."""
    return {
        "supported_subjects": SUPPORTED_SUBJECTS,
        "unknown_label": UNKNOWN_LABEL,
    }


@app.get("/api/auth/config")
def get_auth_config():
    """Return public Supabase configuration for the frontend client."""
    return {
        "supabase_url": settings.supabase_url,
        "supabase_anon_key": settings.supabase_anon_key,
        "is_configured": bool(settings.supabase_url and settings.supabase_anon_key),
    }


class DevAuthRequest(BaseModel):
    email: str
    password: str
    name: str | None = None
    is_signup: bool = False


@app.post("/api/auth/dev-login")
def dev_login(payload: DevAuthRequest):
    """Local development & testing authentication endpoint.

    Generates a valid JWT verified by the backend's token verification pipeline.
    """
    if not is_development_auth_enabled():
        raise HTTPException(status_code=404, detail="Development authentication is disabled.")

    clean_email = payload.email.strip().lower()
    if not clean_email or "@" not in clean_email:
        raise HTTPException(status_code=400, detail="Please enter a valid email address.")
    if len(payload.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters.")

    import hashlib
    user_hash = hashlib.md5(clean_email.encode()).hexdigest()
    user_uuid = f"{user_hash[:8]}-{user_hash[8:12]}-{user_hash[12:16]}-{user_hash[16:20]}-{user_hash[20:32]}"
    token = create_dev_token(user_id=user_uuid, email=clean_email)
    display_name = payload.name or clean_email.split("@")[0].capitalize()
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id": user_uuid,
            "email": clean_email,
            "user_metadata": {"full_name": display_name},
        },
    }


@app.post("/api/predict-topic", response_model=TopicPredictResponse)
def predict_topic_endpoint(
    payload: TopicPredictRequest,
    current_user: CurrentUser = Depends(get_current_user),
):
    """Predict topic with confidence score, flagging uncertain predictions."""
    pred, conf = predict_topic_with_confidence(payload.text)
    return TopicPredictResponse(
        predicted_topic=pred,
        confidence=round(conf, 3),
        is_uncertain=(pred == UNKNOWN_LABEL),
        supported_subjects=SUPPORTED_SUBJECTS,
    )


@app.post("/api/study-sets", response_model=StudySetOut)
def create_study_set(
    payload: ProcessRequest,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    """Create a new study set from a raw lecture transcript with depth control."""
    transcript_clean = payload.transcript.strip()
    if len(transcript_clean) < 20:
        raise HTTPException(status_code=400, detail="Transcript must be at least 20 characters long.")

    # Determine topic: use user-chosen topic if provided; otherwise predict
    topic_chosen = payload.topic
    conf = None
    if not topic_chosen or topic_chosen == UNKNOWN_LABEL:
        pred_topic, conf = predict_topic_with_confidence(transcript_clean)
        topic_chosen = pred_topic

    notes, cards, generator_used = create_study_material(
        transcript_clean, topic=topic_chosen, marks=payload.marks
    )

    item = StudySet(
        title=payload.title.strip() or "Untitled Lecture",
        transcript=transcript_clean,
        notes=notes,
        topic=topic_chosen,
        user_id=current_user.user_id,
    )

    item.flashcards = [
        Flashcard(
            seq_num=c.get("seq_num") or (idx + 1),
            topic=c.get("topic") or topic_chosen,
            card_type=c.get("card_type") or c.get("question_type") or "concept",
            difficulty=c.get("difficulty") or "Medium",
            question=c["question"].strip(),
            answer=c.get("answer", "").strip(),
            key_takeaway=c.get("key_takeaway"),
            source_reference=c.get("source_reference"),
            rich_data=json.dumps(c["rich_data"]) if c.get("rich_data") else None,
            rating=c.get("rating"),
            review_count=c.get("review_count", 0),
            last_reviewed=c.get("last_reviewed"),
        )
        for idx, c in enumerate(cards)
        if c.get("question") and (c.get("answer") or c.get("rich_data"))
    ]
    db.add(item)
    db.commit()
    db.refresh(item)

    # Attach transient metadata to response
    setattr(item, "confidence", conf)
    setattr(item, "generator_used", generator_used)
    return item


@app.get("/api/study-sets", response_model=list[StudySetOut])
def list_study_sets(
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    """Retrieve all study sets belonging to the authenticated user."""
    return list(db.scalars(
        select(StudySet)
        .options(selectinload(StudySet.flashcards))
        .where(StudySet.user_id == current_user.user_id)
        .order_by(StudySet.created_at.desc())
    ))


@app.get("/api/study-sets/{study_set_id}", response_model=StudySetOut)
def get_study_set(
    study_set_id: int,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    """Retrieve a single study set by ID, verifying user ownership."""
    item = db.scalar(
        select(StudySet)
        .options(selectinload(StudySet.flashcards))
        .where(StudySet.id == study_set_id, StudySet.user_id == current_user.user_id)
    )
    if item is None:
        raise HTTPException(status_code=404, detail="Study set not found")
    return item


@app.patch("/api/study-sets/{study_set_id}/topic", response_model=StudySetOut)
def update_study_set_topic(
    study_set_id: int,
    payload: TopicUpdateRequest,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    """Review and correct the subject label for an existing study set owned by current user."""
    item = db.scalar(
        select(StudySet)
        .options(selectinload(StudySet.flashcards))
        .where(StudySet.id == study_set_id, StudySet.user_id == current_user.user_id)
    )
    if item is None:
        raise HTTPException(status_code=404, detail="Study set not found")
    item.topic = payload.topic.strip()
    db.commit()
    db.refresh(item)
    return item


@app.patch("/api/study-sets/{study_set_id}/title", response_model=StudySetOut)
def rename_study_set_title(
    study_set_id: int,
    payload: StudySetRenameRequest,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    """Rename an existing study set owned by current user while preserving cards, notes, and transcript."""
    clean_title = payload.title.strip()
    if not clean_title:
        raise HTTPException(status_code=422, detail="Title cannot be empty")
    item = db.scalar(
        select(StudySet)
        .options(selectinload(StudySet.flashcards))
        .where(StudySet.id == study_set_id, StudySet.user_id == current_user.user_id)
    )
    if item is None:
        raise HTTPException(status_code=404, detail="Study set not found")
    item.title = clean_title
    db.commit()
    db.refresh(item)
    return item


@app.patch("/api/study-sets/{study_set_id}", response_model=StudySetOut)
def update_study_set(
    study_set_id: int,
    payload: StudySetRenameRequest,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    """Update study set metadata (e.g. rename title)."""
    return rename_study_set_title(study_set_id=study_set_id, payload=payload, db=db, current_user=current_user)


@app.delete("/api/study-sets/{study_set_id}")
def delete_study_set(
    study_set_id: int,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    """Delete a study set owned by current user and its associated flashcards."""
    item = db.scalar(
        select(StudySet).where(StudySet.id == study_set_id, StudySet.user_id == current_user.user_id)
    )
    if item is None:
        raise HTTPException(status_code=404, detail="Study set not found")
    db.delete(item)
    db.commit()
    return {"deleted": True, "id": study_set_id}



def _validate_audio_upload(file: UploadFile, content: bytes):
    """Validate uploaded audio extension and byte size."""
    filename = file.filename or "recording.wav"
    _, ext = os.path.splitext(filename.lower())

    if ext not in ALLOWED_AUDIO_EXTENSIONS:
        allowed_list = ", ".join(sorted(ALLOWED_AUDIO_EXTENSIONS))
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported audio format '{ext}'. Supported formats: {allowed_list}",
        )

    if len(content) == 0:
        raise HTTPException(status_code=400, detail="Uploaded audio file is empty.")

    if len(content) > MAX_AUDIO_SIZE_BYTES:
        max_mb = MAX_AUDIO_SIZE_BYTES // (1024 * 1024)
        raise HTTPException(
            status_code=413,
            detail=f"Audio file exceeds maximum size limit of {max_mb} MB.",
        )


@app.post("/api/transcribe")
async def transcribe_audio(
    file: UploadFile = File(...),
    current_user: CurrentUser = Depends(get_current_user),
):
    """Transcribe an uploaded audio file into text using the configured provider."""
    try:
        content = await file.read()
        _validate_audio_upload(file, content)
        transcript = transcribe_upload(file.filename or "recording.wav", content)
        return {"transcript": transcript, "filename": file.filename}
    except HTTPException:
        raise
    except NotImplementedError as nie:
        # Provider unconfigured or unsupported on host
        raise HTTPException(status_code=501, detail=str(nie))
    except Exception as e:
        logger.error("Audio transcription error: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/study-sets/from-audio", response_model=StudySetOut)
async def create_study_set_from_audio(
    file: UploadFile = File(...),
    title: str = Form("Lecture Recording"),
    topic: str | None = Form(None),
    marks: int = Form(3),
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    """Transcribe audio and automatically create the study set with notes, flashcards, and topic prediction."""
    try:
        content = await file.read()
        _validate_audio_upload(file, content)
        transcript = transcribe_upload(file.filename or "recording.wav", content)
    except HTTPException:
        raise
    except NotImplementedError as nie:
        raise HTTPException(status_code=501, detail=str(nie))
    except Exception as e:
        logger.error("Audio processing failed: %s", e)
        raise HTTPException(status_code=500, detail=str(e))

    # Determine topic: use user-chosen topic if provided; otherwise predict
    topic_chosen = topic
    conf = None
    if not topic_chosen or topic_chosen == UNKNOWN_LABEL:
        pred_topic, conf = predict_topic_with_confidence(transcript)
        topic_chosen = pred_topic

    notes, cards, generator_used = create_study_material(
        transcript, topic=topic_chosen, marks=marks
    )

    resolved_title = (
        title.strip()
        if title and title.strip() not in ("Lecture Recording", "Lecture Notes")
        else os.path.splitext(file.filename or "Lecture Recording")[0]
    )

    item = StudySet(
        title=resolved_title,
        source_name=file.filename,
        transcript=transcript,
        notes=notes,
        topic=topic_chosen,
        user_id=current_user.user_id,
    )
    item.flashcards = [
        Flashcard(
            seq_num=c.get("seq_num") or (idx + 1),
            topic=c.get("topic") or topic_chosen,
            card_type=c.get("card_type") or c.get("question_type") or "concept",
            difficulty=c.get("difficulty") or "Medium",
            question=c["question"].strip(),
            answer=c.get("answer", "").strip(),
            key_takeaway=c.get("key_takeaway"),
            source_reference=c.get("source_reference"),
            rich_data=json.dumps(c["rich_data"]) if c.get("rich_data") else None,
            rating=c.get("rating"),
            review_count=c.get("review_count", 0),
            last_reviewed=c.get("last_reviewed"),
        )
        for idx, c in enumerate(cards)
        if c.get("question") and (c.get("answer") or c.get("rich_data"))
    ]
    db.add(item)
    db.commit()
    item = db.scalar(
        select(StudySet).options(selectinload(StudySet.flashcards)).where(StudySet.id == item.id)
    )
    setattr(item, "confidence", conf)
    setattr(item, "generator_used", generator_used)
    return item


@app.post("/api/video/transcribe")
async def transcribe_video(
    file: UploadFile = File(...),
    current_user: CurrentUser = Depends(get_current_user),
):
    """Extract audio via FFmpeg and transcribe uploaded video into text."""
    try:
        content = await file.read()
        validate_video_upload(file, content)
        transcript, duration = process_and_transcribe_video(file.filename or "video.mp4", content)
        return {
            "transcript": transcript,
            "filename": file.filename,
            "duration_seconds": duration,
        }
    except HTTPException:
        raise
    except NotImplementedError as nie:
        raise HTTPException(status_code=501, detail=str(nie))
    except Exception as e:
        logger.error("Video transcription error: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/study-sets/from-video", response_model=StudySetOut)
async def create_study_set_from_video(
    file: UploadFile = File(...),
    title: str = Form("Lecture Video"),
    topic: str | None = Form(None),
    marks: int = Form(3),
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    """Extract audio with FFmpeg, transcribe video, and automatically create study materials."""
    try:
        content = await file.read()
        validate_video_upload(file, content)
        transcript, _ = process_and_transcribe_video(file.filename or "video.mp4", content)
    except HTTPException:
        raise
    except NotImplementedError as nie:
        raise HTTPException(status_code=501, detail=str(nie))
    except Exception as e:
        logger.error("Video processing failed: %s", e)
        raise HTTPException(status_code=500, detail=str(e))

    # Determine topic
    topic_chosen = topic
    conf = None
    if not topic_chosen or topic_chosen == UNKNOWN_LABEL:
        pred_topic, conf = predict_topic_with_confidence(transcript)
        topic_chosen = pred_topic

    notes, cards, generator_used = create_study_material(
        transcript, topic=topic_chosen, marks=marks
    )

    resolved_title = (
        title.strip()
        if title and title.strip() not in ("Lecture Video", "Lecture Recording", "Lecture Notes")
        else os.path.splitext(file.filename or "Lecture Video")[0]
    )

    item = StudySet(
        title=resolved_title,
        source_name=file.filename,
        transcript=transcript,
        notes=notes,
        topic=topic_chosen,
        user_id=current_user.user_id,
    )
    item.flashcards = [
        Flashcard(
            seq_num=c.get("seq_num") or (idx + 1),
            topic=c.get("topic") or topic_chosen,
            card_type=c.get("card_type") or c.get("question_type") or "concept",
            difficulty=c.get("difficulty") or "Medium",
            question=c["question"].strip(),
            answer=c.get("answer", "").strip(),
            key_takeaway=c.get("key_takeaway"),
            source_reference=c.get("source_reference"),
            rich_data=json.dumps(c["rich_data"]) if c.get("rich_data") else None,
            rating=c.get("rating"),
            review_count=c.get("review_count", 0),
            last_reviewed=c.get("last_reviewed"),
        )
        for idx, c in enumerate(cards)
        if c.get("question") and (c.get("answer") or c.get("rich_data"))
    ]
    db.add(item)
    db.commit()
    item = db.scalar(
        select(StudySet).options(selectinload(StudySet.flashcards)).where(StudySet.id == item.id)
    )
    setattr(item, "confidence", conf)
    setattr(item, "generator_used", generator_used)
    return item


@app.get("/api/youtube/status")
def youtube_status():
    """Return YouTube integration and compliance status."""
    return get_youtube_integration_status()


@app.post("/api/youtube/import")
def import_youtube_captions(
    payload: YouTubeImportRequest,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    """Compliantly import official YouTube captions if authorized, or provide helpful guidance."""
    video_id = validate_and_extract_youtube_id(payload.url)
    transcript = fetch_official_youtube_captions(video_id, access_token=payload.access_token)

    if not payload.direct_create:
        return {
            "transcript": transcript,
            "video_id": video_id,
            "filename": f"YouTube video ({video_id})",
        }

    # Direct creation flow
    topic_chosen = payload.topic
    conf = None
    if not topic_chosen or topic_chosen == UNKNOWN_LABEL:
        pred_topic, conf = predict_topic_with_confidence(transcript)
        topic_chosen = pred_topic

    notes, cards, generator_used = create_study_material(
        transcript, topic=topic_chosen, marks=payload.marks
    )

    resolved_title = payload.title.strip() if (payload.title and payload.title.strip()) else f"YouTube Lecture ({video_id})"

    item = StudySet(
        title=resolved_title,
        source_name=f"https://www.youtube.com/watch?v={video_id}",
        transcript=transcript,
        notes=notes,
        topic=topic_chosen,
        user_id=current_user.user_id,
    )
    item.flashcards = [
        Flashcard(
            seq_num=c.get("seq_num") or (idx + 1),
            topic=c.get("topic") or topic_chosen,
            card_type=c.get("card_type") or c.get("question_type") or "concept",
            difficulty=c.get("difficulty") or "Medium",
            question=c["question"].strip(),
            answer=c.get("answer", "").strip(),
            key_takeaway=c.get("key_takeaway"),
            source_reference=c.get("source_reference"),
            rich_data=json.dumps(c["rich_data"]) if c.get("rich_data") else None,
            rating=c.get("rating"),
            review_count=c.get("review_count", 0),
            last_reviewed=c.get("last_reviewed"),
        )
        for idx, c in enumerate(cards)
        if c.get("question") and (c.get("answer") or c.get("rich_data"))
    ]
    db.add(item)
    db.commit()
    item = db.scalar(
        select(StudySet).options(selectinload(StudySet.flashcards)).where(StudySet.id == item.id)
    )
    setattr(item, "confidence", conf)
    setattr(item, "generator_used", generator_used)
    return item



@app.patch("/api/flashcards/{card_id}/rating", response_model=FlashcardOut)
def update_flashcard_rating(
    card_id: int,
    payload: FlashcardRatingUpdate,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    """Update active-recall rating, verifying user ownership of the parent study set."""
    card = db.scalar(
        select(Flashcard)
        .join(StudySet)
        .where(Flashcard.id == card_id, StudySet.user_id == current_user.user_id)
    )
    if card is None:
        raise HTTPException(status_code=404, detail="Flashcard not found")
    card.rating = payload.rating
    card.review_count = (card.review_count or 0) + 1
    card.last_reviewed = datetime.utcnow()
    db.commit()
    db.refresh(card)
    return card


@app.post("/api/study-sets/{study_set_id}/regenerate-flashcards", response_model=StudySetOut)
def regenerate_flashcards(
    study_set_id: int,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    """Regenerate active-recall flashcards for an existing study set using the current source transcript."""
    item = db.scalar(
        select(StudySet)
        .options(selectinload(StudySet.flashcards))
        .where(StudySet.id == study_set_id, StudySet.user_id == current_user.user_id)
    )
    if item is None:
        raise HTTPException(status_code=404, detail="Study set not found")

    # Generate fresh active-recall cards from the existing transcript
    cards, _ = generate_flashcards_only(item.transcript, topic=item.topic, marks=3)

    # Delete existing cards
    for old_card in list(item.flashcards):
        db.delete(old_card)
    db.flush()

    # Add new active-recall cards
    item.flashcards = [
        Flashcard(
            seq_num=c.get("seq_num") or (idx + 1),
            topic=c.get("topic") or item.topic,
            card_type=c.get("card_type") or c.get("question_type") or "concept",
            difficulty=c.get("difficulty") or "Medium",
            question=c["question"].strip(),
            answer=c.get("answer", "").strip(),
            key_takeaway=c.get("key_takeaway"),
            source_reference=c.get("source_reference"),
            rich_data=json.dumps(c["rich_data"]) if c.get("rich_data") else None,
            rating=None,
            review_count=0,
            last_reviewed=None,
        )
        for idx, c in enumerate(cards)
        if c.get("question") and (c.get("answer") or c.get("rich_data"))
    ]
    db.commit()
    db.refresh(item)
    return item
