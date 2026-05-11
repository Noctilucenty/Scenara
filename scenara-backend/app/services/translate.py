from __future__ import annotations

import logging
import httpx
from app.config import settings

logger = logging.getLogger(__name__)

# Google Translation API v2 limit is 5000 chars per request.
# Stay well under it to leave room for encoding overhead.
_MAX_CHARS_PER_CHUNK = 3000


def _api_call(texts: list[str], target: str) -> list[str | None]:
    """Single API call for a small list of strings. Returns None on any error."""
    result: list[str | None] = [None] * len(texts)
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
                return result
            for i, t in enumerate(translations):
                result[i] = t["translatedText"]
    except httpx.HTTPStatusError as e:
        # Log only status code + reason — never the URL.  Google's HTTPStatusError
        # str() includes the full request URL with the API key as a query
        # parameter, so logging `e` directly would leak the secret to deploy logs.
        logger.error(
            "TRANSLATE: API call failed — HTTP %s %s",
            e.response.status_code, e.response.reason_phrase,
        )
    except httpx.RequestError as e:
        # Network-level failures (timeouts, DNS, TLS).  Log only the error class
        # name, not str(e) which can also embed the URL.
        logger.error("TRANSLATE: API call failed — network error: %s", type(e).__name__)
    except Exception as e:
        # Catch-all: log only the type, never the message, in case a future
        # exception class also embeds the URL.
        logger.error("TRANSLATE: API call failed — %s", type(e).__name__)
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
