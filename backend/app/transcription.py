"""Transcription Provider Abstraction for ScribeFlow.

Design Principles:
1. Replaceable backend provider interface (Abstract Base Class).
2. Secrets stay on the backend; read from environment variables.
3. Safe temporary file handling and clean error reporting.
4. Extensible to Hosted APIs (OpenAI, Groq), Local Whisper, or Unconfigured fallback.
"""

from abc import ABC, abstractmethod
import glob
import logging
import os
import platform
import shutil
import subprocess
import tempfile
from typing import Any

import httpx

from app.config import settings

logger = logging.getLogger("scribeflow.transcription")

ALLOWED_AUDIO_EXTENSIONS = {".wav", ".mp3", ".m4a", ".ogg", ".webm", ".flac", ".aac"}
MAX_AUDIO_SIZE_BYTES = 100 * 1024 * 1024  # 100 MB max upload limit
API_FILE_SIZE_LIMIT = 24 * 1024 * 1024   # 24 MB per-request limit for Groq/OpenAI cloud APIs


class TranscriptionProvider(ABC):
    """Abstract interface for speech-to-text transcription engines."""

    @abstractmethod
    def name(self) -> str:
        """Display name of the provider."""
        pass

    @abstractmethod
    def is_available(self) -> tuple[bool, str]:
        """Check if provider is configured and available to process audio.

        Returns (available: bool, reason_or_status: str).
        """
        pass

    @abstractmethod
    def transcribe(self, audio_file_path: str, filename: str) -> str:
        """Transcribe an audio file to text.

        Raises RuntimeError or ValueError on failure.
        """
        pass


class UnconfiguredProvider(TranscriptionProvider):
    """Fallback provider when no external API credentials or local models are configured."""

    def name(self) -> str:
        return "Unconfigured (Text fallback active)"

    def is_available(self) -> tuple[bool, str]:
        return (
            False,
            "No audio transcription provider is configured. "
            "Set OPENAI_API_KEY or GROQ_API_KEY in backend/.env to enable hosted transcription, "
            "or paste your lecture transcript text directly."
        )

    def transcribe(self, audio_file_path: str, filename: str) -> str:
        _, msg = self.is_available()
        raise NotImplementedError(msg)


def _prepare_audio_for_api(audio_file_path: str, temp_dir: str) -> list[str]:
    """Ensure audio stays within the 24MB per-request API limit by compressing or chunking with ffmpeg."""
    file_size = os.path.getsize(audio_file_path)
    if file_size <= API_FILE_SIZE_LIMIT:
        return [audio_file_path]

    ffmpeg_bin = shutil.which("ffmpeg")
    if not ffmpeg_bin:
        logger.warning(
            "Audio file is %.1f MB but ffmpeg is not available on PATH for compression.",
            file_size / (1024 * 1024),
        )
        return [audio_file_path]

    # Step 1: Compress to 16kHz mono MP3 at 48 kbps (optimal for speech models, reduces size by 75-90%)
    compressed_path = os.path.join(temp_dir, "optimized_audio.mp3")
    try:
        subprocess.run(
            [ffmpeg_bin, "-y", "-i", audio_file_path, "-vn", "-ar", "16000", "-ac", "1", "-b:a", "48k", compressed_path],
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
        if os.path.exists(compressed_path):
            compressed_size = os.path.getsize(compressed_path)
            logger.info(
                "Optimized audio from %.1f MB down to %.1f MB for API transmission",
                file_size / (1024 * 1024),
                compressed_size / (1024 * 1024),
            )
            if compressed_size <= API_FILE_SIZE_LIMIT:
                return [compressed_path]

            # Step 2: If file is still > 24MB (e.g. multi-hour recording), split into 10-minute segments
            segment_pattern = os.path.join(temp_dir, "segment_%03d.mp3")
            subprocess.run(
                [ffmpeg_bin, "-y", "-i", compressed_path, "-f", "segment", "-segment_time", "600", "-c", "copy", segment_pattern],
                check=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
            )
            segments = sorted(glob.glob(os.path.join(temp_dir, "segment_*.mp3")))
            if segments:
                logger.info("Split large audio into %d segments for API transcription", len(segments))
                return segments
    except Exception as e:
        logger.warning("FFmpeg audio compression failed (%s). Falling back to original file.", e)

    return [audio_file_path]


class HostedOpenAIWhisperProvider(TranscriptionProvider):
    """Hosted Whisper transcription using OpenAI's audio transcription endpoint."""

    def __init__(self, api_key: str):
        self.api_key = api_key
        self.endpoint = "https://api.openai.com/v1/audio/transcriptions"

    def name(self) -> str:
        return "Hosted OpenAI Whisper (cloud)"

    def is_available(self) -> tuple[bool, str]:
        if not self.api_key or self.api_key.startswith("your_"):
            return False, "OPENAI_API_KEY is missing or contains a placeholder value in .env"
        return True, "Ready for hosted cloud transcription"

    def transcribe(self, audio_file_path: str, filename: str) -> str:
        available, reason = self.is_available()
        if not available:
            raise RuntimeError(reason)

        with tempfile.TemporaryDirectory(prefix="scribeflow_openai_") as temp_dir:
            file_chunks = _prepare_audio_for_api(audio_file_path, temp_dir)
            headers = {"Authorization": f"Bearer {self.api_key}"}
            transcripts: list[str] = []

            for chunk_path in file_chunks:
                chunk_name = os.path.basename(chunk_path)
                with open(chunk_path, "rb") as f:
                    files = {"file": (chunk_name, f, "audio/mpeg")}
                    data = {"model": "whisper-1"}
                    try:
                        with httpx.Client(timeout=120.0) as client:
                            response = client.post(self.endpoint, headers=headers, files=files, data=data)
                            if response.status_code != 200:
                                error_detail = response.text
                                try:
                                    error_detail = response.json().get("error", {}).get("message", response.text)
                                except Exception:
                                    pass
                                raise RuntimeError(f"OpenAI transcription failed ({response.status_code}): {error_detail}")
                            result = response.json()
                            text = str(result.get("text", "")).strip()
                            if text:
                                transcripts.append(text)
                    except httpx.RequestError as e:
                        raise RuntimeError(f"Network error communicating with OpenAI transcription service: {e}")

            return " ".join(transcripts).strip()


class HostedGroqWhisperProvider(TranscriptionProvider):
    """Hosted Whisper transcription using Groq's low-latency API."""

    def __init__(self, api_key: str):
        self.api_key = api_key
        self.endpoint = "https://api.groq.com/openai/v1/audio/transcriptions"

    def name(self) -> str:
        return "Hosted Groq Whisper (cloud, low-latency)"

    def is_available(self) -> tuple[bool, str]:
        if not self.api_key or self.api_key.startswith("your_"):
            return False, "GROQ_API_KEY is missing or contains a placeholder value in .env"
        return True, "Ready for hosted cloud transcription"

    def transcribe(self, audio_file_path: str, filename: str) -> str:
        available, reason = self.is_available()
        if not available:
            raise RuntimeError(reason)

        with tempfile.TemporaryDirectory(prefix="scribeflow_groq_") as temp_dir:
            file_chunks = _prepare_audio_for_api(audio_file_path, temp_dir)
            headers = {"Authorization": f"Bearer {self.api_key}"}
            transcripts: list[str] = []

            for chunk_path in file_chunks:
                chunk_name = os.path.basename(chunk_path)
                with open(chunk_path, "rb") as f:
                    files = {"file": (chunk_name, f, "audio/mpeg")}
                    data = {"model": "whisper-large-v3-turbo"}
                    try:
                        with httpx.Client(timeout=90.0) as client:
                            response = client.post(self.endpoint, headers=headers, files=files, data=data)
                            if response.status_code != 200:
                                error_detail = response.text
                                try:
                                    error_detail = response.json().get("error", {}).get("message", response.text)
                                except Exception:
                                    pass
                                raise RuntimeError(f"Groq transcription failed ({response.status_code}): {error_detail}")
                            result = response.json()
                            text = str(result.get("text", "")).strip()
                            if text:
                                transcripts.append(text)
                    except httpx.RequestError as e:
                        raise RuntimeError(f"Network error communicating with Groq transcription service: {e}")

            return " ".join(transcripts).strip()


class LocalWhisperProvider(TranscriptionProvider):
    """Optional local Whisper provider (using faster-whisper or openai-whisper)."""

    def __init__(self, model_size: str = "base"):
        self.model_size = model_size

    def name(self) -> str:
        return f"Local Whisper ({self.model_size}, offline)"

    def is_available(self) -> tuple[bool, str]:
        # Detect host platform and compute capabilities
        is_mac = platform.system() == "Darwin"
        arch = platform.machine()
        try:
            import faster_whisper  # noqa: F401
            return True, f"faster-whisper is installed on {arch} Mac (CPU/Metal compute)"
        except ImportError:
            return (
                False,
                f"Local Whisper requires 'faster-whisper' package. "
                f"Host is {platform.system()} ({arch}). Install only after explicit user approval."
            )

    def transcribe(self, audio_file_path: str, filename: str) -> str:
        available, reason = self.is_available()
        if not available:
            raise NotImplementedError(reason)
        from faster_whisper import WhisperModel
        model = WhisperModel(self.model_size, device="cpu", compute_type="int8")
        segments, _ = model.transcribe(audio_file_path, beam_size=5)
        return " ".join([segment.text.strip() for segment in segments]).strip()


def get_transcription_provider() -> TranscriptionProvider:
    """Factory to resolve the active transcription provider based on configuration."""
    provider_choice = (getattr(settings, "transcription_provider", "auto") or "auto").lower()

    if provider_choice == "openai":
        return HostedOpenAIWhisperProvider(getattr(settings, "openai_api_key", None) or "")
    elif provider_choice == "groq":
        return HostedGroqWhisperProvider(getattr(settings, "groq_api_key", None) or "")
    elif provider_choice == "local":
        return LocalWhisperProvider()
    elif provider_choice == "none":
        return UnconfiguredProvider()

    # "auto" detection mode:
    # 1. Prefer Groq if key is present
    groq_key = getattr(settings, "groq_api_key", None)
    if groq_key and not groq_key.startswith("your_"):
        return HostedGroqWhisperProvider(groq_key)

    # 2. Prefer OpenAI if key is present
    openai_key = getattr(settings, "openai_api_key", None)
    if openai_key and not openai_key.startswith("your_"):
        return HostedOpenAIWhisperProvider(openai_key)

    # 3. Otherwise unconfigured fallback
    return UnconfiguredProvider()


def get_provider_status() -> dict[str, Any]:
    """Expose provider information for health checks and UI hints without revealing secrets."""
    provider = get_transcription_provider()
    available, message = provider.is_available()
    return {
        "provider_name": provider.name(),
        "is_available": available,
        "message": message,
        "configured_mode": getattr(settings, "transcription_provider", "auto"),
        "has_openai_key": bool(getattr(settings, "openai_api_key", None) and not settings.openai_api_key.startswith("your_")),
        "has_groq_key": bool(getattr(settings, "groq_api_key", None) and not settings.groq_api_key.startswith("your_")),
    }
