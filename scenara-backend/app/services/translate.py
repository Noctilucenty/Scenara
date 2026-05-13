from __future__ import annotations

import logging
import time
import urllib.parse
import httpx
from app.config import settings

logger = logging.getLogger(__name__)

# ── MyMemory translation API ─────────────────────────────────────────────────
# Truly free, no billing card required.
# Limits: ~1 000 words/day anonymous, ~50 000 words/day with email contact.
# Unlike Google's batch API, MyMemory accepts only ONE text per request and
# caps each request at 500 bytes — so translate_batch makes N sequential
# calls, one per text.  Slower than Google for big batches, but fine for our
# use case (translating event titles + short descriptions in the background).
_API_URL = "https://api.mymemory.translated.net/get"
_MAX_BYTES_PER_TEXT = 500  # MyMemory's hard limit per query

# ── Circuit breaker ──────────────────────────────────────────────────────────
# Protects against running away when the API is down or rate-limited.
# After 5 failures in 60 s we open the breaker for 10 minutes, silently
# skipping all translate calls until it auto-recovers.
_BREAKER_FAILURE_THRESHOLD = 5
_BREAKER_WINDOW_SECONDS    = 60
_BREAKER_COOLDOWN_SECONDS  = 600
_recent_failures: list[float] = []
_breaker_open_until: float = 0.0


def _breaker_is_open() -> bool:
    return time.time() < _breaker_open_until


def _record_failure() -> None:
    global _breaker_open_until
    now = time.time()
    _recent_failures[:] = [t for t in _recent_failures if now - t < _BREAKER_WINDOW_SECONDS]
    _recent_failures.append(now)
    if len(_recent_failures) >= _BREAKER_FAILURE_THRESHOLD and not _breaker_is_open():
        _breaker_open_until = now + _BREAKER_COOLDOWN_SECONDS
        logger.error(
            "TRANSLATE: Circuit breaker tripped — %d failures in %ds. "
            "Pausing translation for %d minutes.",
            len(_recent_failures), _BREAKER_WINDOW_SECONDS, _BREAKER_COOLDOWN_SECONDS // 60,
        )


def _record_success() -> None:
    _recent_failures.clear()


# Map BCP-47 language tags to MyMemory's expected format (uses |-separated
# language pairs, ISO codes; "zh-CN" is the canonical Simplified Chinese tag
# and MyMemory accepts it as-is).
def _normalize_lang(tag: str) -> str:
    return (tag or "").strip()


def _translate_one(client: httpx.Client, text: str, target: str) -> str | None:
    """Translate a single string via MyMemory. Returns None on any failure."""
    # MyMemory has a 500-byte cap.  We could break long text into sentences,
    # but the simpler/safer behaviour is to skip — caller will see None and
    # the caller (e.g. ZH backfill) keeps the original.  Loss is acceptable
    # for now; later we can sentence-chunk if needed.
    if len(text.encode("utf-8")) > _MAX_BYTES_PER_TEXT:
        return None

    lang_pair = f"en|{_normalize_lang(target)}"
    params: dict[str, str] = {"q": text, "langpair": lang_pair}
    if settings.mymemory_email:
        params["de"] = settings.mymemory_email

    try:
        r = client.get(_API_URL, params=params, timeout=10.0)
        r.raise_for_status()
        data = r.json()
        # MyMemory wraps results in responseData.translatedText
        translated = (data.get("responseData") or {}).get("translatedText")
        # responseStatus is the meaningful field — 200 = OK, 403/429/etc on
        # quota or auth issues, sometimes inside the JSON even when HTTP is 200.
        status = data.get("responseStatus")
        if status and int(status) >= 400:
            logger.error("TRANSLATE: MyMemory responded with status %s", status)
            _record_failure()
            return None
        if not translated:
            return None
        _record_success()
        return translated
    except httpx.HTTPStatusError as e:
        logger.error(
            "TRANSLATE: API call failed — HTTP %s %s",
            e.response.status_code, e.response.reason_phrase,
        )
        _record_failure()
    except httpx.RequestError as e:
        logger.error("TRANSLATE: API call failed — network error: %s", type(e).__name__)
        _record_failure()
    except Exception as e:
        logger.error("TRANSLATE: API call failed — %s", type(e).__name__)
        _record_failure()
    return None


def _api_call(texts: list[str], target: str) -> list[str | None]:
    """Translate a list of strings.  MyMemory has no batch endpoint, so this
    does N sequential single-text calls.  Returns None for any failures."""
    if _breaker_is_open():
        return [None] * len(texts)

    result: list[str | None] = [None] * len(texts)
    # Reuse a single HTTP client across the loop so keep-alive saves us a
    # TLS handshake per request.  Free-tier networks are slow enough that
    # this matters.
    with httpx.Client() as client:
        for i, text in enumerate(texts):
            if not text or not text.strip():
                continue
            result[i] = _translate_one(client, text, target)
            # Tiny pause so we don't trip MyMemory's per-IP rate limiter
            # mid-batch.  100 ms × 50 strings = 5 s of overhead, acceptable
            # for a background backfill task.
            time.sleep(0.1)
            if _breaker_is_open():
                # Circuit tripped during this batch — bail out, leave the rest as None.
                break
    return result


def translate_batch(texts: list[str], target: str = "zh-CN") -> list[str | None]:
    """Translate a list of strings, returning None per-text on failure.

    The "batch" terminology is kept for compatibility with the old Google
    Translate signature — internally we make one request per text since
    MyMemory has no batch endpoint.
    """
    non_empty = [(i, t) for i, t in enumerate(texts) if t and t.strip()]
    if not non_empty:
        return [None] * len(texts)

    indices = [i for i, _ in non_empty]
    chunk_texts = [t for _, t in non_empty]
    translated = _api_call(chunk_texts, target)

    result: list[str | None] = [None] * len(texts)
    total_translated = 0
    for i, val in zip(indices, translated):
        result[i] = val
        if val:
            total_translated += 1

    if total_translated:
        logger.info(
            "TRANSLATE: translated %d/%d strings to %s",
            total_translated, len(non_empty), target,
        )
    return result


def translate_text(text: str, target: str = "zh-CN") -> str | None:
    """Translate a single string."""
    results = translate_batch([text], target=target)
    return results[0]
