"""Video Processing and Audio Extraction Service for ScribeFlow.

Handles:
1. Video file format and size validation (.mp4, .mov, .webm, .mkv, .avi up to 200MB).
2. Video duration checking via ffprobe (up to 120 minutes).
3. Audio track extraction via FFmpeg (optimized 16kHz mono speech audio).
4. Safe, zero-leak temporary file cleanup on success and error.
5. Delegation to the active transcription provider.
"""

import logging
import os
import shutil
import subprocess
import tempfile
from typing import Tuple

from fastapi import HTTPException, UploadFile

from app.transcription import get_transcription_provider

logger = logging.getLogger("scribeflow.video")

ALLOWED_VIDEO_EXTENSIONS = {".mp4", ".mov", ".webm", ".mkv", ".avi"}
MAX_VIDEO_SIZE_BYTES = 200 * 1024 * 1024       # 200 MB
MAX_VIDEO_DURATION_SECONDS = 7200              # 120 minutes (2 hours)


def validate_video_upload(file: UploadFile, content: bytes) -> None:
    """Validate uploaded video file extension and byte size."""
    filename = file.filename or "video.mp4"
    _, ext = os.path.splitext(filename.lower())

    if ext not in ALLOWED_VIDEO_EXTENSIONS:
        allowed_list = ", ".join(sorted(ALLOWED_VIDEO_EXTENSIONS))
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported video format '{ext}'. Supported formats: {allowed_list}",
        )

    if len(content) == 0:
        raise HTTPException(status_code=400, detail="Uploaded video file is empty.")

    if len(content) > MAX_VIDEO_SIZE_BYTES:
        max_mb = MAX_VIDEO_SIZE_BYTES // (1024 * 1024)
        raise HTTPException(
            status_code=413,
            detail=f"Video file exceeds maximum size limit of {max_mb} MB.",
        )


def probe_video_duration(video_path: str) -> float | None:
    """Probe video duration in seconds using ffprobe."""
    ffprobe_bin = shutil.which("ffprobe")
    if not ffprobe_bin:
        logger.warning("ffprobe is not available on PATH; skipping duration pre-check.")
        return None

    try:
        cmd = [
            ffprobe_bin,
            "-v", "error",
            "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1",
            video_path,
        ]
        res = subprocess.run(cmd, capture_output=True, text=True, check=True)
        raw = res.stdout.strip()
        if raw:
            duration = float(raw)
            logger.info("Probed video duration: %.1f seconds (%.1f minutes)", duration, duration / 60.0)
            return duration
    except Exception as e:
        logger.warning("Could not probe video duration with ffprobe: %s", e)

    return None


def extract_audio_from_video(video_path: str, temp_dir: str) -> str:
    """Extract audio track from video file into 16kHz mono MP3."""
    ffmpeg_bin = shutil.which("ffmpeg")
    if not ffmpeg_bin:
        raise RuntimeError(
            "FFmpeg is not installed or not available on the server PATH. "
            "FFmpeg is required to extract audio from video files."
        )

    output_audio_path = os.path.join(temp_dir, "extracted_audio.mp3")

    # -vn: disable video recording
    # -ar 16000: 16 kHz sample rate (standard for speech recognition)
    # -ac 1: mono audio (cuts size in half)
    # -b:a 64k: 64 kbps MP3 bitrate
    cmd = [
        ffmpeg_bin,
        "-y",
        "-i", video_path,
        "-vn",
        "-ar", "16000",
        "-ac", "1",
        "-b:a", "64k",
        output_audio_path,
    ]

    logger.info("Executing FFmpeg audio extraction: %s", " ".join(cmd))
    res = subprocess.run(cmd, capture_output=True, text=True)

    if res.returncode != 0:
        logger.error("FFmpeg extraction failed with code %d: %s", res.returncode, res.stderr)
        raise RuntimeError(f"FFmpeg failed to extract audio from video: {res.stderr.strip()[:300]}")

    if not os.path.exists(output_audio_path) or os.path.getsize(output_audio_path) == 0:
        raise RuntimeError("Extracted audio file is missing or empty. The video may contain no audio track.")

    logger.info(
        "Successfully extracted audio (%d bytes) to %s",
        os.path.getsize(output_audio_path),
        output_audio_path,
    )
    return output_audio_path


def process_and_transcribe_video(filename: str, content: bytes) -> Tuple[str, float | None]:
    """Process uploaded video: validate, extract audio with FFmpeg, and transcribe via provider.

    Guarantees that all temporary video, audio, and segment files are deleted immediately
    via tempfile.TemporaryDirectory, even if an error occurs.
    """
    provider = get_transcription_provider()
    available, reason = provider.is_available()
    if not available:
        raise NotImplementedError(reason)

    _, ext = os.path.splitext(filename.lower())
    if not ext:
        ext = ".mp4"

    # TemporaryDirectory guarantees full cleanup of all files on context exit
    with tempfile.TemporaryDirectory(prefix="scribeflow_vidproc_") as temp_dir:
        temp_video_path = os.path.join(temp_dir, f"input_video{ext}")

        # 1. Write video bytes
        with open(temp_video_path, "wb") as f:
            f.write(content)

        # 2. Check duration
        duration = probe_video_duration(temp_video_path)
        if duration is not None and duration > MAX_VIDEO_DURATION_SECONDS:
            max_mins = MAX_VIDEO_DURATION_SECONDS // 60
            raise HTTPException(
                status_code=400,
                detail=f"Video duration ({duration / 60:.1f} mins) exceeds maximum allowed duration of {max_mins} minutes.",
            )

        # 3. Extract audio
        audio_path = extract_audio_from_video(temp_video_path, temp_dir)

        # 4. Remove the temporary video immediately to minimize disk usage before transcription
        try:
            if os.path.exists(temp_video_path):
                os.remove(temp_video_path)
        except Exception as e:
            logger.warning("Could not immediately remove temp video file %s: %s", temp_video_path, e)

        # 5. Transcribe extracted audio
        logger.info("Sending extracted video audio to transcription provider: %s", provider.name())
        transcript = provider.transcribe(audio_path, filename)

        return transcript, duration
