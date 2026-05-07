"""
app/services/ai_resolver.py

Uses Gemini Flash with Google Search grounding to auto-resolve non-crypto
prediction-market events.

Design choices that minimize wrong resolutions:
  - Two-shot consensus: query the model twice with different framings.
    Only resolve if BOTH calls return the same winner_index AND average
    confidence ≥ AUTO_RESOLVE_THRESHOLD.
  - Anchored prompt: include closes_at date and resolution criteria so
    the model can't reach a stale conclusion from generic search.
  - Required source URL: model must cite the page it used. Stored on the
    Event so admins can audit. Resolutions without a citation are downgraded
    to "needs review".
  - Confidence in the gap [REVIEW_THRESHOLD, AUTO_RESOLVE_THRESHOLD) goes
    to a human review queue rather than being silently dropped.

Requires GEMINI_API_KEY env var (free tier at aistudio.google.com).
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import re
from dataclasses import dataclass
from datetime import datetime
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "") or ""
GEMINI_MODEL   = "gemini-2.5-flash"
GEMINI_URL = (
    f"https://generativelanguage.googleapis.com/v1beta/models"
    f"/{GEMINI_MODEL}:generateContent"
)

# Confidence required for an *autonomous* resolution (no human in the loop).
AUTO_RESOLVE_THRESHOLD = 80
# Confidence at which the event is queued for admin review instead of dropped.
REVIEW_THRESHOLD = 60
MAX_RETRIES = 3


@dataclass
class AIResolution:
    """Result of an attempted AI resolution.

    `decision` is one of:
      - "resolve":      both shots agreed and confidence ≥ AUTO_RESOLVE_THRESHOLD
      - "needs_review": confidence in [REVIEW_THRESHOLD, AUTO_RESOLVE_THRESHOLD)
                        OR shots disagreed but had moderate confidence
      - "skip":         too uncertain, not worth admin time yet
    """
    decision: str                    # "resolve" | "needs_review" | "skip"
    winner_index: Optional[int]
    confidence: int                  # 0-100
    note: str
    source_url: Optional[str]


# ── Helpers ──────────────────────────────────────────────────────────────────

def _extract_text(data: dict) -> Optional[str]:
    """Pull the user-facing text from a Gemini response.

    Handles thinking-mode parts (skipped), safety blocks (no parts),
    and the rare malformed envelope.
    """
    candidates = data.get("candidates") or []
    if not candidates:
        return None
    candidate = candidates[0]
    content = candidate.get("content") or {}
    parts = content.get("parts") or []
    if not parts:
        finish = candidate.get("finishReason")
        logger.warning("[AIResolver] No parts in response (finishReason=%s)", finish)
        return None
    text_parts = [p["text"] for p in parts if "text" in p and not p.get("thought")]
    if not text_parts:
        text_parts = [p["text"] for p in parts if "text" in p]
    return text_parts[-1].strip() if text_parts else None


def _parse_json(text: str) -> Optional[dict]:
    """Extract the first JSON object from freeform text. Robust to fences/notes."""
    text = re.sub(r"^```(?:json)?\s*", "", text.strip())
    text = re.sub(r"\s*```$", "", text.strip())
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    # Greedy outermost {...}
    match = re.search(r"\{.*\}", text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group())
        except json.JSONDecodeError:
            pass
    return None


def _build_prompt(
    *,
    title: str,
    description: str,
    scenarios_text: str,
    closes_at: Optional[datetime],
    resolution_note: str,
    framing: str,
) -> str:
    """Build a fully anchored prompt. `framing` slightly varies between shots."""
    today = datetime.utcnow().strftime("%B %d, %Y")
    closes_str = closes_at.strftime("%B %d, %Y at %H:%M UTC") if closes_at else "unknown"
    res_block = f"\nResolution criteria: {resolution_note}\n" if resolution_note else "\n"
    if framing == "primary":
        intro = (
            "You are resolving a prediction-market event. Use Google Search to find "
            "the actual outcome. Be conservative — if you cannot find a clear, "
            "primary-source confirmation, return null."
        )
    else:
        intro = (
            "You are an independent fact-checker reviewing a prediction-market event. "
            "Use Google Search and prefer primary sources (official sites, major news "
            "outlets). If the outcome is genuinely ambiguous or has not been reported "
            "yet, return null — do not guess."
        )
    return (
        f"{intro}\n\n"
        f"Today is {today}. The event scheduled to resolve on {closes_str}.\n\n"
        f"Event: \"{title}\"\n"
        f"Description: \"{description}\"{res_block}\n"
        f"Scenarios:\n{scenarios_text}\n\n"
        f"Determine which scenario actually occurred. You MUST return strict JSON:\n"
        f"{{\n"
        f"  \"winner_index\": <integer index from above, or null if unknown>,\n"
        f"  \"confidence\": <integer 0-100>,\n"
        f"  \"note\": \"<one short sentence describing what happened>\",\n"
        f"  \"source_url\": \"<URL of the page that confirms it, or null>\"\n"
        f"}}\n\n"
        f"Rules:\n"
        f"- If the outcome is unknown or the event hasn't concluded, set winner_index=null.\n"
        f"- If you can't find a citable source, set source_url=null and confidence ≤ 50.\n"
        f"- Output ONLY the JSON object — no markdown, no explanations."
    )


# ── Single-shot API call ─────────────────────────────────────────────────────

async def _gemini_call(prompt: str) -> Optional[dict]:
    """Issue one Gemini call with retry on 429/503. Returns parsed JSON or None."""
    if not GEMINI_API_KEY:
        return None

    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "tools": [{"google_search": {}}],
        "generationConfig": {"temperature": 0.1, "maxOutputTokens": 512},
    }

    delay = 5
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            async with httpx.AsyncClient(timeout=45) as client:
                resp = await client.post(GEMINI_URL, json=payload, params={"key": GEMINI_API_KEY})
            if resp.status_code in (429, 503):
                if attempt < MAX_RETRIES:
                    logger.warning("[AIResolver] HTTP %s, retrying in %ds...", resp.status_code, delay)
                    await asyncio.sleep(delay)
                    delay *= 2
                    continue
                return None
            resp.raise_for_status()
            text = _extract_text(resp.json())
            if not text:
                return None
            return _parse_json(text)
        except httpx.HTTPStatusError as e:
            logger.error("[AIResolver] HTTP %s: %s", e.response.status_code, e.response.text[:200])
            return None
        except Exception as e:
            logger.error("[AIResolver] Request error: %s", e)
            return None
    return None


def _coerce_index(value, n_scenarios: int) -> Optional[int]:
    """Defensively turn winner_index into a valid scenario index, or None."""
    if value is None:
        return None
    if isinstance(value, str) and value.lstrip("-").isdigit():
        value = int(value)
    if not isinstance(value, int):
        return None
    if 0 <= value < n_scenarios:
        return value
    return None


# ── Public entry point ───────────────────────────────────────────────────────

async def ai_resolve_event(
    title: str,
    description: str,
    scenarios: list[str],
    *,
    closes_at: Optional[datetime] = None,
    resolution_criteria: str = "",
) -> AIResolution:
    """
    Two-shot consensus resolution.

    Both shots must agree on winner_index. The reported confidence is the
    average; the source URL is taken from the higher-confidence shot
    (defaulting to the primary's).
    """
    if not GEMINI_API_KEY:
        return AIResolution("skip", None, 0, "GEMINI_API_KEY not set", None)

    scenarios_text = "\n".join(f"{i}: \"{s}\"" for i, s in enumerate(scenarios))

    primary_prompt = _build_prompt(
        title=title, description=description, scenarios_text=scenarios_text,
        closes_at=closes_at, resolution_note=resolution_criteria, framing="primary",
    )
    cross_prompt = _build_prompt(
        title=title, description=description, scenarios_text=scenarios_text,
        closes_at=closes_at, resolution_note=resolution_criteria, framing="cross",
    )

    # Run both shots concurrently — saves wall time without changing semantics.
    primary, cross = await asyncio.gather(
        _gemini_call(primary_prompt),
        _gemini_call(cross_prompt),
        return_exceptions=False,
    )

    if not primary or not cross:
        return AIResolution("skip", None, 0, "Gemini returned no usable response", None)

    p_idx = _coerce_index(primary.get("winner_index"), len(scenarios))
    c_idx = _coerce_index(cross.get("winner_index"),  len(scenarios))
    p_conf = int(primary.get("confidence", 0) or 0)
    c_conf = int(cross.get("confidence", 0) or 0)
    p_note = str(primary.get("note", "") or "")
    c_note = str(cross.get("note", "") or "")
    p_url  = primary.get("source_url") or None
    c_url  = cross.get("source_url") or None

    # Disagreement on winner = automatic abstain. Don't average across two
    # different outcomes — that's how you settle a market the wrong way.
    if p_idx != c_idx:
        # If one was confident enough to be useful, surface for review; else skip.
        higher_conf = max(p_conf, c_conf)
        decision = "needs_review" if higher_conf >= REVIEW_THRESHOLD else "skip"
        note = (
            f"Models disagreed: primary→{p_idx} ({p_conf}%), cross→{c_idx} ({c_conf}%). "
            f"Primary: {p_note} | Cross: {c_note}"
        )[:480]
        return AIResolution(decision, None, higher_conf, note, p_url or c_url)

    # Both agreed. If both said "unknown" (None), it's a real abstain.
    if p_idx is None:
        return AIResolution("skip", None, max(p_conf, c_conf),
                            f"Both models abstained: {p_note}", None)

    avg_conf = (p_conf + c_conf) // 2
    citation = p_url if p_conf >= c_conf else c_url

    # Prefer the higher-confidence note for the audit trail.
    chosen_note = p_note if p_conf >= c_conf else c_note

    # Without a citation we don't trust the call enough to auto-resolve, even
    # at high model confidence. Force it through review.
    if not citation:
        return AIResolution(
            "needs_review", p_idx, min(avg_conf, AUTO_RESOLVE_THRESHOLD - 1),
            f"No source URL provided. {chosen_note}", None,
        )

    if avg_conf >= AUTO_RESOLVE_THRESHOLD:
        return AIResolution(
            "resolve", p_idx, avg_conf,
            f"[AI {avg_conf}% confident, two-shot consensus] {chosen_note}",
            citation,
        )
    if avg_conf >= REVIEW_THRESHOLD:
        return AIResolution(
            "needs_review", p_idx, avg_conf,
            f"[AI {avg_conf}% — needs review] {chosen_note}",
            citation,
        )
    return AIResolution(
        "skip", p_idx, avg_conf,
        f"[AI {avg_conf}% — too uncertain] {chosen_note}",
        citation,
    )
