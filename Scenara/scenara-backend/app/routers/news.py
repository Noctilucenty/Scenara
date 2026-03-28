from __future__ import annotations

import asyncio
import hashlib
import httpx
import os
import time
from fastapi import APIRouter, Query
from pydantic import BaseModel

router = APIRouter()

GNEWS_API_KEY = os.getenv("GNEWS_API_KEY", "")
GNEWS_BASE    = "https://gnews.io/api/v4"
CACHE_TTL     = 3600  # 1 hour — GNews free tier = 100 req/day

_news_cache: dict[str, tuple[float, list]] = {}

CATEGORY_QUERY_MAP = {
    "all":           "Brazil OR Brasil OR world news",
    "politics":      "Brazil politics OR Lula OR elections",
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


def _cache_key(query: str, lang: str) -> str:
    return hashlib.md5(f"{query[:40]}:{lang}".encode()).hexdigest()


def _get_cached(key: str) -> list | None:
    if key in _news_cache:
        ts, data = _news_cache[key]
        if time.time() - ts < CACHE_TTL:
            return data
    return None


def _set_cached(key: str, data: list) -> None:
    _news_cache[key] = (time.time(), data)


def _fmt(a: dict) -> dict:
    return {
        "title":       a.get("title", ""),
        "description": a.get("description", ""),
        "url":         a.get("url", ""),
        "image":       a.get("image", ""),
        "published":   a.get("publishedAt", ""),
        "source":      a.get("source", {}).get("name", ""),
    }


async def _fetch(query: str, lang: str, n: int) -> list:
    key = _cache_key(query, lang)
    cached = _get_cached(key)
    if cached is not None:
        return cached
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            r = await client.get(f"{GNEWS_BASE}/search", params={
                "q": query, "lang": lang, "max": n, "apikey": GNEWS_API_KEY,
            })
            r.raise_for_status()
            articles = r.json().get("articles", [])
            _set_cached(key, articles)
            return articles
    except Exception:
        return []


@router.get("/news")
async def get_news(
    category: str = Query("all"),
    lang: str = Query("pt"),
    max_results: int = Query(10, le=20),
):
    query = CATEGORY_QUERY_MAP.get(category, CATEGORY_QUERY_MAP["all"])
    pt_arts, en_arts = await asyncio.gather(
        _fetch(query, "pt", max_results),
        _fetch(query, "en", max_results),
    )
    merged, seen = [], set()
    for i in range(max(len(pt_arts), len(en_arts))):
        for a in ([pt_arts[i]] if i < len(pt_arts) else []) + \
                 ([en_arts[i]] if i < len(en_arts) else []):
            t = a.get("title", "")
            if t and t not in seen:
                seen.add(t)
                merged.append(_fmt(a))
    return {"articles": merged[:max_results], "category": category, "total": len(merged)}


@router.get("/single")
async def get_news_single(
    category: str = Query("all"),
    lang: str = Query("pt"),
    max_results: int = Query(6, le=10),
):
    query = CATEGORY_QUERY_MAP.get(category, CATEGORY_QUERY_MAP["all"])
    articles = await _fetch(query, "pt" if lang == "pt" else "en", max_results)
    return {"articles": [_fmt(a) for a in articles[:max_results]]}


class SummaryRequest(BaseModel):
    title: str
    description: str | None = None
    url: str
    language: str = "pt"


_summary_cache: dict[str, str] = {}


@router.post("/summary")
async def get_summary(payload: SummaryRequest):
    if payload.url in _summary_cache:
        return {"summary": _summary_cache[payload.url]}

    lang_instruction = (
        "Responda em português brasileiro." if payload.language == "pt"
        else "Respond in English."
    )
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
            summary = r.json()["choices"][0]["message"]["content"].strip()
            _summary_cache[payload.url] = summary
            return {"summary": summary}
    except Exception:
        return {"summary": desc if not is_generic else ""}