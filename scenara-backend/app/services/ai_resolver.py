"""
app/services/ai_resolver.py

Uses Gemini Flash with Google Search grounding to auto-resolve
non-crypto prediction market events.

Requires GEMINI_API_KEY env var (free tier at aistudio.google.com).
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import re
from datetime import date
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "") or ""
GEMINI_MODEL = "gemini-2.5-flash"
GEMINI_URL = (
    f"https://generativelanguage.googleapis.com/v1beta/models"
    f"/{GEMINI_MODEL}:generateContent"
)
CONFIDENCE_THRESHOLD = 75  # minimum % to auto-resolve; below this → leave for manual
MAX_RETRIES = 3


def _extract_text(data: dict) -> Optional[str]:
    """Extract the final text from a Gemini response.

    Handles:
    - Thinking model responses (parts with thought=True are skipped)
    - Empty content dicts (safety blocks, incomplete responses)
    - Missing candidates
    """
    candidates = data.get("candidates") or []
    if not candidates:
        return None

    candidate = candidates[0]
    finish = candidate.get("finishReason")

    # Safety block or other non-STOP finish with no usable content
    content = candidate.get("content") or {}
    parts = content.get("parts") or []
    if not parts:
        logger.warning(f"[AIResolver] No parts in response (finishReason={finish})")
        return None

    # Gemini 2.5 Flash is a thinking model — skip thought-only parts
    text_parts = [p["text"] for p in parts if "text" in p and not p.get("thought")]
    if not text_parts:
        text_parts = [p["text"] for p in parts if "text" in p]

    return text_parts[-1].strip() if text_parts else None


def _parse_json(text: str) -> Optional[dict]:
    """Robustly extract and parse a JSON object from freeform text."""
    # Strip markdown code fences
    text = re.sub(r"^```(?:json)?\s*", "", text.strip())
    text = re.sub(r"\s*```$", "", text.strip())

    # Try direct parse first (clean response)
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    # Greedy match of the outermost {...} — handles multiline notes
    match = re.search(r"\{.*\}", text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group())
        except json.JSONDecodeError:
            pass

    return None


async def ai_resolve_event(
    title: str,
    description: str,
    scenarios: list[str],
) -> tuple[Optional[int], int, str]:
    """
    Ask Gemini Flash (with Google Search) which scenario won.

    Returns:
        (winner_index, confidence, note)
        winner_index is None if outcome can't be determined confidently.
    """
    if not GEMINI_API_KEY:
        return None, 0, "GEMINI_API_KEY not set"

    scenarios_text = "\n".join(f"{i}: \"{s}\"" for i, s in enumerate(scenarios))
    today = date.today().strftime("%B %d, %Y")

    prompt = (
        f"Today is {today}. You are resolving a prediction market event. "
        f"Search the web to find if the outcome is known.\n\n"
        f"Event: \"{title}\"\n"
        f"Description: \"{description}\"\n\n"
        f"Scenarios:\n{scenarios_text}\n\n"
        f"Search for the current status and determine which scenario occurred.\n\n"
        f"Respond with ONLY a JSON object — no markdown, no extra text:\n"
        f"{{\"winner_index\": <integer index or null>, "
        f"\"confidence\": <0-100>, "
        f"\"note\": \"<one short sentence>\"}}\n\n"
        f"Use null and confidence below {CONFIDENCE_THRESHOLD} if the event "
        f"has not concluded or you are uncertain."
    )

    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "tools": [{"google_search": {}}],
        "generationConfig": {
            "temperature": 0.1,
            "maxOutputTokens": 512,
        },
    }

    delay = 5  # exponential backoff starting delay
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            async with httpx.AsyncClient(timeout=45) as client:
                resp = await client.post(
                    GEMINI_URL,
                    json=payload,
                    params={"key": GEMINI_API_KEY},
                )

            # Retry on transient server errors and rate limits
            if resp.status_code in (429, 503):
                if attempt < MAX_RETRIES:
                    logger.warning(
                        f"[AIResolver] HTTP {resp.status_code} for '{title[:40]}' "
                        f"(attempt {attempt}/{MAX_RETRIES}), retrying in {delay}s..."
                    )
                    await asyncio.sleep(delay)
                    delay *= 2
                    continue
                status_name = "rate limited" if resp.status_code == 429 else "unavailable"
                return None, 0, f"Gemini {status_name} after {MAX_RETRIES} retries"

            resp.raise_for_status()
            data = resp.json()

        except httpx.HTTPStatusError as e:
            logger.error(f"[AIResolver] HTTP {e.response.status_code}: {e.response.text[:200]}")
            return None, 0, f"Gemini API error: {e.response.status_code}"
        except Exception as e:
            logger.error(f"[AIResolver] Request error: {e}")
            return None, 0, str(e)

        # Parse response
        text = _extract_text(data)
        if not text:
            return None, 0, "Empty or blocked response from Gemini"

        result = _parse_json(text)
        if result is None:
            logger.warning(f"[AIResolver] Could not parse JSON from: {text[:200]}")
            return None, 0, "Could not parse Gemini response"

        winner_index = result.get("winner_index")
        confidence = int(result.get("confidence", 0))
        note = str(result.get("note", "Auto-resolved by AI"))

        # Coerce string index to int (defensive)
        if isinstance(winner_index, str) and winner_index.lstrip("-").isdigit():
            winner_index = int(winner_index)

        if winner_index is None or confidence < CONFIDENCE_THRESHOLD:
            return None, confidence, note

        if not isinstance(winner_index, int) or not (0 <= winner_index < len(scenarios)):
            logger.warning(f"[AIResolver] Invalid winner_index={winner_index} for {len(scenarios)} scenarios")
            return None, 0, f"Invalid scenario index: {winner_index}"

        return winner_index, confidence, f"[AI {confidence}% confident] {note}"

    return None, 0, "Gemini unavailable after retries"
