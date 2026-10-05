"""Compliant YouTube Caption Integration for ScribeFlow.

Policy & Compliance Guardrails:
1. Strictly adheres to YouTube API Terms of Service (no stream ripping, scraping, or downloader tools).
2. Strict URL validation: only permits official YouTube URLs (youtube.com, youtu.be); strictly prevents SSRF.
3. Official YouTube Data API v3 implementation:
   - Caption tracks require OAuth 2.0 authorization with scope `https://www.googleapis.com/auth/youtube.force-ssl`.
   - Google API keys alone cannot download caption files (returns 401 Login Required).
   - Under YouTube API rules, `captions.download` is restricted to videos owned by the authenticated channel manager.
4. When unauthenticated or unauthorized for third-party videos, transparently explains the YouTube API constraint
   and presents official alternatives: paste the transcript directly or upload an authorized media file.
"""

import html
import logging
import re
from typing import Any, Optional
import xml.etree.ElementTree as ET

from fastapi import HTTPException
import httpx

from app.config import settings

logger = logging.getLogger("scribeflow.youtube")

# Regex to strictly match official YouTube video URLs and extract the 11-char Video ID
YOUTUBE_URL_PATTERNS = [
    re.compile(r"^https?:\/\/(?:www\.|m\.)?youtube\.com\/watch\?(?:[^&]*&)*v=([a-zA-Z0-9_-]{11})(?:&.*)?$", re.IGNORECASE),
    re.compile(r"^https?:\/\/youtu\.be\/([a-zA-Z0-9_-]{11})(?:\?.*)?$", re.IGNORECASE),
    re.compile(r"^https?:\/\/(?:www\.|m\.)?youtube\.com\/embed\/([a-zA-Z0-9_-]{11})(?:\?.*)?$", re.IGNORECASE),
    re.compile(r"^https?:\/\/(?:www\.|m\.)?youtube\.com\/v\/([a-zA-Z0-9_-]{11})(?:\?.*)?$", re.IGNORECASE),
]

YOUTUBE_CAPTIONS_LIST_URL = "https://www.googleapis.com/youtube/v3/captions"
YOUTUBE_CAPTIONS_DOWNLOAD_URL = "https://www.googleapis.com/youtube/v3/captions/{caption_id}"
REQUIRED_OAUTH_SCOPE = "https://www.googleapis.com/auth/youtube.force-ssl"


def validate_and_extract_youtube_id(url: str) -> str:
    """Validate that the URL belongs to YouTube and extract its 11-character video ID.

    Rejects arbitrary or non-YouTube URLs to prevent SSRF vulnerabilities.
    """
    clean_url = (url or "").strip()
    if not clean_url:
        raise HTTPException(status_code=400, detail="YouTube URL is required.")

    for pattern in YOUTUBE_URL_PATTERNS:
        match = pattern.match(clean_url)
        if match:
            video_id = match.group(1)
            if len(video_id) == 11 and re.match(r"^[a-zA-Z0-9_-]{11}$", video_id):
                return video_id

    raise HTTPException(
        status_code=400,
        detail="Invalid YouTube URL. Please provide a standard YouTube video link (e.g., https://www.youtube.com/watch?v=VIDEO_ID or https://youtu.be/VIDEO_ID).",
    )


def clean_vtt_or_srt_to_text(raw_captions: str) -> str:
    """Parse WebVTT or SRT formatted captions into clean, continuous transcript text."""
    lines = raw_captions.strip().splitlines()
    cleaned_lines = []
    timestamp_pattern = re.compile(r"^\d{1,2}:\d{2}(?::\d{2})?[.,]\d{3}\s+-->\s+\d{1,2}:\d{2}(?::\d{2})?[.,]\d{3}")

    for line in lines:
        line_str = line.strip()
        if not line_str:
            continue
        if line_str.startswith("WEBVTT") or line_str.startswith("NOTE") or line_str.isdigit():
            continue
        if timestamp_pattern.match(line_str):
            continue
        # Remove XML / HTML tags like <c.color> or <font>
        no_tags = re.sub(r"<[^>]+>", "", line_str)
        unescaped = html.unescape(no_tags).strip()
        if unescaped and (not cleaned_lines or cleaned_lines[-1] != unescaped):
            cleaned_lines.append(unescaped)

    return " ".join(cleaned_lines).strip()


def get_youtube_integration_status() -> dict[str, Any]:
    """Expose YouTube configuration status, requirements, and policy information."""
    has_client_id = bool(getattr(settings, "google_client_id", None))
    has_client_secret = bool(getattr(settings, "google_client_secret", None))
    has_api_key = bool(getattr(settings, "youtube_api_key", None))

    return {
        "is_configured": has_client_id and has_client_secret,
        "has_google_client_id": has_client_id,
        "has_youtube_api_key": has_api_key,
        "required_oauth_scope": REQUIRED_OAUTH_SCOPE,
        "policy_note": (
            "Under Google's official YouTube Data API v3 policies, downloading caption tracks via API requires "
            "an OAuth 2.0 access token authorized by the channel owner of the video. An API key alone cannot "
            "download caption tracks. For videos you do not own, YouTube requires viewing the transcript directly "
            "on youtube.com and pasting it into ScribeFlow."
        ),
    }


def fetch_official_youtube_captions(video_id: str, access_token: Optional[str] = None) -> str:
    """Fetch captions via the official YouTube Data API v3 if authorized.

    If unauthorized or unconfigured, raises an informative HTTPException with compliant alternatives.
    """
    if not access_token:
        raise HTTPException(
            status_code=401,
            detail=(
                "Official YouTube caption access requires an authorized Google OAuth token with the video owner's permission "
                f"(scope: {REQUIRED_OAUTH_SCOPE}). A Google API key alone cannot download caption tracks.\n\n"
                "Recommended alternative: Open the video on YouTube, click '... More' -> 'Show transcript', "
                "copy the text, and paste it directly into ScribeFlow's 'Paste Transcript' tab."
            ),
        )

    headers = {
        "Authorization": f"Bearer {access_token}",
        "Accept": "application/json",
    }

    try:
        with httpx.Client(timeout=30.0) as client:
            # 1. List caption tracks
            list_resp = client.get(
                YOUTUBE_CAPTIONS_LIST_URL,
                headers=headers,
                params={"videoId": video_id, "part": "snippet"},
            )

            if list_resp.status_code == 403:
                raise HTTPException(
                    status_code=403,
                    detail=(
                        "YouTube API returned 403 Forbidden. Under Google's YouTube Data API terms, caption downloading "
                        "is only permitted for videos owned by your authenticated YouTube channel. "
                        "ScribeFlow strictly adheres to YouTube policies and does not use unauthorized scrapers or stream rippers.\n\n"
                        "Alternative: Open the video on YouTube, click 'Show transcript', copy the text, and paste it into "
                        "ScribeFlow's 'Paste Transcript' tab, or upload a video file you own."
                    ),
                )

            if list_resp.status_code != 200:
                err_text = list_resp.text
                try:
                    err_text = list_resp.json().get("error", {}).get("message", err_text)
                except Exception:
                    pass
                raise HTTPException(
                    status_code=list_resp.status_code,
                    detail=f"YouTube Data API error ({list_resp.status_code}): {err_text}",
                )

            data = list_resp.json()
            items = data.get("items", [])
            if not items:
                raise HTTPException(
                    status_code=404,
                    detail=f"No caption tracks found on YouTube for video ID '{video_id}'.",
                )

            # Pick English track or first track
            chosen_track = items[0]
            for it in items:
                snippet = it.get("snippet", {})
                if snippet.get("language") in ("en", "en-US", "en-GB"):
                    chosen_track = it
                    break

            caption_id = chosen_track.get("id")
            if not caption_id:
                raise HTTPException(status_code=404, detail="Caption track ID could not be identified.")

            # 2. Download caption file
            download_url = YOUTUBE_CAPTIONS_DOWNLOAD_URL.format(caption_id=caption_id)
            down_resp = client.get(
                download_url,
                headers=headers,
                params={"tfmt": "vtt"},
            )

            if down_resp.status_code != 200:
                raise HTTPException(
                    status_code=down_resp.status_code,
                    detail=f"Failed to download caption track from YouTube ({down_resp.status_code}).",
                )

            clean_text = clean_vtt_or_srt_to_text(down_resp.text)
            if not clean_text or len(clean_text) < 20:
                raise HTTPException(
                    status_code=400,
                    detail="Downloaded caption track contained insufficient text content.",
                )

            return clean_text

    except httpx.RequestError as e:
        logger.error("Network error communicating with YouTube Data API: %s", e)
        raise HTTPException(
            status_code=502,
            detail=f"Network error communicating with YouTube Data API: {e}",
        )
