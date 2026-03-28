from __future__ import annotations

import asyncio
import httpx
import os
from fastapi import APIRouter, Query
from pydantic import BaseModel

router = APIRouter()

GNEWS_API_KEY = os.getenv("GNEWS_API_KEY", "")
GNEWS_BASE    = "https://gnews.io/api/v4"

CATEGORY_QUERY_MAP = {
    "all":           "Brazil OR Brasil OR world news",
    "politics":      "Brazil politics OR Lula OR eleições",
    "economy":       "Brazil economy OR Selic OR inflation",
    "crypto":        "Bitcoin OR Ethereum OR crypto",
    "sports":        "World Cup OR Brasileirao OR NBA",
    "technology":    "AI OR artificial intelligence OR tech",
    "geopolitics":   "war OR Ukraine OR Gaza OR China",
    "entertainment": "Netflix OR cinema OR Oscar",
    "music":         "music OR concert OR Spotify",
    "tv":            "Globo OR BBB OR novela OR streaming",
    "science":       "science OR NASA OR discovery",
    "weather":       "Brazil weather OR climate OR flood",
}


@router.get("/news")
async def get_news(
    category: str = Query("all"),
    lang: str = Query("pt"),
    max_results: int = Query(10, le=20),
):
    """Fetch mixed Brazilian + international news relevant to Scenara markets."""
    query = CATEGORY_QUERY_MAP.get(category, CATEGORY_QUERY_MAP["all"])
    per_lang = max(max_results, 8)

    async def fetch(language: str) -> list:
        params = {
            "q":      query,
            "lang":   language,
            "max":    per_lang,
            "apikey": GNEWS_API_KEY,
        }
        try:
            async with httpx.AsyncClient(timeout=8.0) as client:
                r = await client.get(f"{GNEWS_BASE}/search", params=params)
                r.raise_for_status()
                return r.json().get("articles", [])
        except Exception:
            return []

    pt_articles, en_articles = await asyncio.gather(fetch("pt"), fetch("en"))

    # Interleave PT and EN articles for a mixed feed
    merged = []
    for i in range(max(len(pt_articles), len(en_articles))):
        if i < len(pt_articles):
            merged.append(pt_articles[i])
        if i < len(en_articles):
            merged.append(en_articles[i])

    # Deduplicate by title
    seen = set()
    unique = []
    for a in merged:
        t = a.get("title", "")
        if t and t not in seen:
            seen.add(t)
            unique.append({
                "title":       a.get("title", ""),
                "description": a.get("description", ""),
                "url":         a.get("url", ""),
                "image":       a.get("image", ""),
                "published":   a.get("publishedAt", ""),
                "source":      a.get("source", {}).get("name", ""),
            })

    return {"articles": unique[:max_results], "category": category, "total": len(unique)}


# ── AI Summary ────────────────────────────────────────────────────────────────

@router.get("/single")
async def get_news_single(
    category: str = Query("all"),
    lang: str = Query("pt"),
    max_results: int = Query(6, le=10),
):
    """Fetch news in a single language only — used for related news in market detail."""
    query = CATEGORY_QUERY_MAP.get(category, CATEGORY_QUERY_MAP["all"])
    params = {
        "q":      query,
        "lang":   "pt" if lang == "pt" else "en",
        "max":    max_results,
        "apikey": GNEWS_API_KEY,
    }
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            r = await client.get(f"{GNEWS_BASE}/search", params=params)
            r.raise_for_status()
            articles = r.json().get("articles", [])
            return {
                "articles": [
                    {
                        "title":       a.get("title", ""),
                        "description": a.get("description", ""),
                        "url":         a.get("url", ""),
                        "image":       a.get("image", ""),
                        "published":   a.get("publishedAt", ""),
                        "source":      a.get("source", {}).get("name", ""),
                    }
                    for a in articles
                ]
            }
    except Exception:
        return {"articles": []}


class SummaryRequest(BaseModel):
    title: str
    description: str | None = None
    url: str
    language: str = "pt"


@router.post("/summary")
async def get_summary(payload: SummaryRequest):
    """Generate a brief summary using Groq (Llama 3)."""
    lang_instruction = (
        "Responda em português brasileiro."
        if payload.language == "pt"
        else "Respond in English."
    )

    # If description looks like a generic site tagline, ignore it
    generic_phrases = [
        "veja as principais", "leia textos", "assista a vídeos",
        "notícias do dia", "manchetes do dia", "all the latest",
        "breaking news", "read more", "click here",
    ]
    desc = payload.description or ""
    is_generic = any(p in desc.lower() for p in generic_phrases) or len(desc) < 30

    content = f"Title: {payload.title}"
    if desc and not is_generic:
        content += f"\nDescription: {desc}"

    prompt = f"""{lang_instruction}

You are a news summarizer for Scenara, a prediction market platform. Based on the news headline below, write a concise 2-3 sentence summary explaining what happened and why it matters for prediction markets. Be direct and informative.

{content}

Write only the summary. No intro, no labels, no markdown."""

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            r = await client.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {os.getenv('GROQ_API_KEY', '')}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": "llama-3.1-8b-instant",
                    "messages": [{"role": "user", "content": prompt}],
                    "max_tokens": 200,
                    "temperature": 0.4,
                },
            )
            r.raise_for_status()
            data = r.json()
            summary = data["choices"][0]["message"]["content"].strip()
            return {"summary": summary}
    except Exception:
        return {"summary": desc if not is_generic else ""}