"""Authentication and access control module for ScribeFlow.

Handles Supabase Auth JWT validation, role & audience verification,
and current user dependency injection.
"""

import logging
import secrets
import time
from dataclasses import dataclass
from typing import Any

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.config import settings

logger = logging.getLogger("scribeflow.auth")

security = HTTPBearer(auto_error=False)


@dataclass
class CurrentUser:
    user_id: str
    email: str = ""
    role: str = "authenticated"


_jwk_client: jwt.PyJWKClient | None = None
_DEV_ENVIRONMENTS = {"development", "dev", "local", "test"}
_dev_auth_secret = settings.auth_dev_secret
if settings.app_env.strip().lower() in _DEV_ENVIRONMENTS and not _dev_auth_secret:
    # Local fallback only. Set AUTH_DEV_SECRET in backend/.env for a stable key across reloads/workers.
    _dev_auth_secret = secrets.token_urlsafe(48)


def is_development_auth_enabled() -> bool:
    """Dev login is available only in explicit local/test environments with a signing secret."""
    return settings.app_env.strip().lower() in _DEV_ENVIRONMENTS and bool(_dev_auth_secret)


def get_jwk_client() -> jwt.PyJWKClient | None:
    global _jwk_client
    if _jwk_client is not None:
        return _jwk_client
    if settings.supabase_url:
        jwks_url = f"{settings.supabase_url.rstrip('/')}/auth/v1/.well-known/jwks.json"
        try:
            _jwk_client = jwt.PyJWKClient(jwks_url, cache_jwk_set=True, lifespan=3600)
            return _jwk_client
        except Exception as e:
            logger.debug("Could not initialize JWK client: %s", e)
    return None


def create_dev_token(user_id: str, email: str = "user@example.com", expires_in: int = 86400) -> str:
    """Create a signed JWT token matching Supabase structure for local testing."""
    secret = _dev_auth_secret
    if not is_development_auth_enabled() or not secret:
        raise RuntimeError("Development authentication is disabled outside local development and test environments.")
    now = int(time.time())
    payload: dict[str, Any] = {
        "sub": user_id,
        "email": email,
        "aud": settings.supabase_jwt_audience,
        "role": "authenticated",
        "iat": now,
        "exp": now + expires_in,
        "iss": f"{settings.supabase_url.rstrip('/')}/auth/v1" if settings.supabase_url else "scribeflow-dev",
    }
    return jwt.encode(payload, secret, algorithm="HS256")


def verify_supabase_jwt(token: str) -> CurrentUser:
    """Validate JWT signature, expiration, audience, and extract the user ID.

    Supports:
    1. Symmetric HMAC (HS256) with SUPABASE_JWT_SECRET
    2. Asymmetric (RS256 / ES256) via Supabase JWKS
    3. Deterministic development fallback with AUTH_DEV_SECRET
    """
    if not token or not token.strip():
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing authentication token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    clean_token = token.strip()
    payload = None
    verification_errors = []

    try:
        unverified_header = jwt.get_unverified_header(clean_token)
        alg = unverified_header.get("alg", "HS256")
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Malformed authentication token: {e}",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # 1. Try Supabase JWT Secret (HS256 / symmetric)
    if settings.supabase_jwt_secret and alg.startswith("HS"):
        try:
            payload = jwt.decode(
                clean_token,
                settings.supabase_jwt_secret,
                algorithms=["HS256", "HS384", "HS512"],
                audience=settings.supabase_jwt_audience,
                options={"verify_exp": True, "verify_aud": True},
            )
        except Exception as err:
            verification_errors.append(f"Supabase JWT secret validation: {err}")

    # 2. Try Asymmetric JWKS (RS256 / ES256)
    if payload is None and (alg.startswith("RS") or alg.startswith("ES")):
        jwk_client = get_jwk_client()
        if jwk_client:
            try:
                signing_key = jwk_client.get_signing_key_from_jwt(clean_token)
                payload = jwt.decode(
                    clean_token,
                    signing_key.key,
                    algorithms=["RS256", "ES256"],
                    audience=settings.supabase_jwt_audience,
                    options={"verify_exp": True, "verify_aud": True},
                )
            except Exception as err:
                verification_errors.append(f"Supabase JWKS validation: {err}")

    # 3. Development / Test mode secret validation; never accept dev tokens in production.
    dev_secret = _dev_auth_secret
    if payload is None and is_development_auth_enabled() and dev_secret:
        try:
            payload = jwt.decode(
                clean_token,
                dev_secret,
                algorithms=["HS256"],
                audience=settings.supabase_jwt_audience,
                options={"verify_exp": True, "verify_aud": True},
            )
        except Exception as err:
            verification_errors.append(f"Dev secret validation: {err}")

    if payload is None:
        logger.warning("Token verification failed: %s", "; ".join(verification_errors))
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired authentication token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token missing user identification ('sub')",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return CurrentUser(
        user_id=str(user_id),
        email=payload.get("email", ""),
        role=payload.get("role", "authenticated"),
    )


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
) -> CurrentUser:
    """Dependency that requires an authenticated user."""
    if not credentials or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required to perform this action",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return verify_supabase_jwt(credentials.credentials)


def get_optional_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
) -> CurrentUser | None:
    """Dependency that returns the CurrentUser if authenticated, or None if unauthenticated."""
    if not credentials or not credentials.credentials:
        return None
    try:
        return verify_supabase_jwt(credentials.credentials)
    except HTTPException:
        return None
