from __future__ import annotations

import httpx
from app.config import settings


def translate_batch(texts: list[str], target: str = "zh-CN") -> list[str | None]:
    """Translate a list of strings in one API call. Returns None for each item if API key is missing or on error."""
    if not settings.google_translate_api_key:
        return [None] * len(texts)

    non_empty = [(i, t) for i, t in enumerate(texts) if t and t.strip()]
    if not non_empty:
        return [None] * len(texts)

    result: list[str | None] = [None] * len(texts)
    try:
        with httpx.Client(timeout=15.0) as client:
            r = client.post(
                "https://translation.googleapis.com/language/translate/v2",
                params={"key": settings.google_translate_api_key},
                json={
                    "q": [t for _, t in non_empty],
                    "target": target,
                    "format": "text",
                },
            )
            r.raise_for_status()
            translations = r.json()["data"]["translations"]
            if len(translations) != len(non_empty):
                return result  # partial response — return what we have (all None)
            for j, (i, _) in enumerate(non_empty):
                result[i] = translations[j]["translatedText"]
    except Exception:
        pass
    return result


def translate_text(text: str, target: str = "zh-CN") -> str | None:
    """Translate a single string. Returns None on error or if API key is missing."""
    results = translate_batch([text], target=target)
    return results[0]
