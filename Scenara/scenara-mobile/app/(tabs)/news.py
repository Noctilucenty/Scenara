from __future__ import annotations

import httpx
import os
from fastapi import APIRouter, Query

router = APIRouter()

GNEWS_API_KEY = os.getenv("GNEWS_API_KEY", "")
GNEWS_BASE    = "https://gnews.io/api/v4"

CATEGORY_QUERY_MAP = {
    "politics":      "Brasil política OR Brazil politics",
    "economy":       "Brasil economia OR Brazil economy",
    "crypto":        "Bitcoin Ethereum crypto",
    "sports":        "futebol Copa do Mundo NBA OR soccer World Cup",
    "technology":    "tecnologia IA OR technology AI",
    "geopolitics":   "geopolítica guerra OR geopolitics war",
    "entertainment": "entretenimento filmes séries OR entertainment movies",
    "music":         "música shows lançamento OR music concert release",
    "tv":            "televisão Globo streaming OR television",
    "science":       "ciência descoberta NASA OR science discovery",
    "weather":       "clima tempo Brasil OR weather Brazil",
    "all":           "Brasil OR Brazil",
}


@router.get("/news")
async def get_news(
    category: str = Query("all"),
    lang: str = Query("pt"),
    max_results: int = Query(10, le=20),
):
    """Fetch news headlines from GNews relevant to Scenara markets."""
    query = CATEGORY_QUERY_MAP.get(category, CATEGORY_QUERY_MAP["all"])
    language = "pt" if lang == "pt" else "en"

    params = {
        "q":       query,
        "lang":    language,
        "country": "br" if lang == "pt" else "us",
        "max":     max_results,
        "apikey":  GNEWS_API_KEY,
    }

    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            r = await client.get(f"{GNEWS_BASE}/search", params=params)
            r.raise_for_status()
            data = r.json()
            articles = data.get("articles", [])
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
                ],
                "category": category,
                "total": len(articles),
            }
    except Exception as e:
        return {"articles": [], "category": category, "total": 0, "error": str(e)}