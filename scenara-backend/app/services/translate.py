from __future__ import annotations

import logging
import time
import httpx
from app.config import settings

logger = logging.getLogger(__name__)

# Google Translation API v2 limit is 5000 chars per request.
# Stay well under it to leave room for encoding overhead.
_MAX_CHARS_PER_CHUNK = 3000

# ── Circuit breaker ──────────────────────────────────────────────────────────
# When the Translate API starts failing (bad key, billing not enabled, etc.),
# every request that needs translation kicks off a doomed background thread
# that hits Google with another failure — flooding logs and wasting CPU.
# After 5 failures within 60 s we "open" the circuit and stop calling Google
# for 10 minutes.  If the user fixes their key, the breaker auto-recovers
# after the cooldown.
_BREAKER_FAILURE_THRESHOLD = 5
_BREAKER_WINDOW_SECONDS    = 60
_BREAKER_COOLDOWN_SECONDS  = 600  # 10 min
_recent_failures: list[float] = []
_breaker_open_until: float = 0.0


def _breaker_is_open() -> bool:
    return time.time() < _breaker_open_until


def _record_failure() -> None:
    """Track this failure; trip the breaker if too many happened recently."""
    global _breaker_open_until
    now = time.time()
    # Keep only failures within the rolling window
    _recent_failures[:] = [t for t in _recent_failures if now - t < _BREAKER_WINDOW_SECONDS]
    _recent_failures.append(now)
    if len(_recent_failures) >= _BREAKER_FAILURE_THRESHOLD and not _breaker_is_open():
        _breaker_open_until = now + _BREAKER_COOLDOWN_SECONDS
        logger.error(
            "TRANSLATE: Circuit breaker tripped — %d failures in %ds. "
            "Pausing translation calls for %d minutes.",
            len(_recent_failures), _BREAKER_WINDOW_SECONDS, _BREAKER_COOLDOWN_SECONDS // 60,
        )


def _record_success() -> None:
    """Successful call → clear the failure history."""
    _recent_failures.clear()


def _api_call(texts: list[str], target: str) -> list[str | None]:
    """Single API call for a small list of strings. Returns None on any error."""
    result: list[str | None] = [None] * len(texts)
    if _breaker_is_open():
        # Silent skip — we already logged the breaker tripping.  Avoids
        # flooding logs while the cooldown is in effect.
        return result
    try:
        with httpx.Client(timeout=15.0) as client:
            r = client.post(
                "https://translation.googleapis.com/language/translate/v2",
                params={"key": settings.google_translate_api_key},
                json={"q": texts, "target": target, "format": "text"},
            )
            r.raise_for_status()
            translations = r.json()["data"]["translations"]
            if len(translations) != len(texts):
                logger.error("TRANSLATE: API returned %d results for %d inputs", len(translations), len(texts))
                _record_failure()
                return result
            for i, t in enumerate(translations):
                result[i] = t["translatedText"]
            _record_success()
    except httpx.HTTPStatusError as e:
        # Log only status code + reason — never the URL.  Google's HTTPStatusError
        # str() includes the full request URL with the API key as a query
        # parameter, so logging `e` directly would leak the secret to deploy logs.
        logger.error(
            "TRANSLATE: API call failed — HTTP %s %s",
            e.response.status_code, e.response.reason_phrase,
        )
        _record_failure()
    except httpx.RequestError as e:
        # Network-level failures (timeouts, DNS, TLS).  Log only the error class
        # name, not str(e) which can also embed the URL.
        logger.error("TRANSLATE: API call failed — network error: %s", type(e).__name__)
        _record_failure()
    except Exception as e:
        # Catch-all: log only the type, never the message, in case a future
        # exception class also embeds the URL.
        logger.error("TRANSLATE: API call failed — %s", type(e).__name__)
        _record_failure()
    return result


def translate_batch(texts: list[str], target: str = "zh-CN") -> list[str | None]:
    """Translate a list of strings, chunked to stay within API character limits."""
    if not settings.google_translate_api_key:
        logger.warning("TRANSLATE: google_translate_api_key is not set — skipping")
        return [None] * len(texts)

    non_empty = [(i, t) for i, t in enumerate(texts) if t and t.strip()]
    if not non_empty:
        return [None] * len(texts)

    result: list[str | None] = [None] * len(texts)

    # Split non_empty into chunks that stay under the character limit
    chunks: list[list[tuple[int, str]]] = []
    current_chunk: list[tuple[int, str]] = []
    current_chars = 0
    for idx, text in non_empty:
        text_len = len(text)
        if current_chunk and current_chars + text_len > _MAX_CHARS_PER_CHUNK:
            chunks.append(current_chunk)
            current_chunk = []
            current_chars = 0
        current_chunk.append((idx, text))
        current_chars += text_len
    if current_chunk:
        chunks.append(current_chunk)

    total_translated = 0
    for chunk in chunks:
        indices = [i for i, _ in chunk]
        chunk_texts = [t for _, t in chunk]
        translated = _api_call(chunk_texts, target)
        for i, val in zip(indices, translated):
            result[i] = val
            if val:
                total_translated += 1

    if total_translated:
        logger.info("TRANSLATE: translated %d/%d strings to %s across %d chunk(s)",
                    total_translated, len(non_empty), target, len(chunks))
    return result


def translate_text(text: str, target: str = "zh-CN") -> str | None:
    """Translate a single string."""
    results = translate_batch([text], target=target)
    return results[0]
