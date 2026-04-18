from __future__ import annotations

import asyncio
import hashlib
import httpx
import os
import time
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from fastapi import APIRouter, Query
from pydantic import BaseModel
from urllib.parse import quote

router = APIRouter()

CACHE_TTL = 600  # 10 minutes cache (RSS is free, so refresh more often)

_news_cache: dict[str, tuple[float, list]] = {}

# Google News RSS URL template — no API key needed
GNEWS_RSS = "https://news.google.com/rss/search?q={query}&hl={hl}&gl={gl}&ceid={ceid}"

CATEGORY_QUERIES: dict[str, dict] = {
    "all": {
        "en": ("world news OR breaking news OR politics", "en-US", "US", "US:en"),
        "pt": ("Brasil notícias OR política OR economia", "pt-419", "BR", "BR:pt-419"),
        "zh": ("中国 OR 国际新闻 OR 科技 OR 经济 OR 世界", "zh-CN", "CN", "CN:zh-Hans"),
    },
    "politics": {
        "en": ("politics OR government OR election OR congress", "en-US", "US", "US:en"),
        "pt": ("política Brasil OR Lula OR eleições OR congresso", "pt-419", "BR", "BR:pt-419"),
        "zh": ("中国政治 OR 习近平 OR 美国政治 OR 国际政治 OR 选举", "zh-CN", "CN", "CN:zh-Hans"),
    },
    "economy": {
        "en": ("economy OR inflation OR Fed OR GDP OR markets", "en-US", "US", "US:en"),
        "pt": ("economia Brasil OR Selic OR inflação OR IPCA OR mercado", "pt-419", "BR", "BR:pt-419"),
        "zh": ("中国经济 OR 美联储 OR 通货膨胀 OR GDP OR 股市", "zh-CN", "CN", "CN:zh-Hans"),
    },
    "crypto": {
        "en": ("Bitcoin OR Ethereum OR crypto OR blockchain", "en-US", "US", "US:en"),
        "pt": ("Bitcoin OR Ethereum OR criptomoeda OR blockchain", "pt-419", "BR", "BR:pt-419"),
        "zh": ("比特币 OR 以太坊 OR 加密货币 OR 区块链", "zh-CN", "CN", "CN:zh-Hans"),
    },
    "sports": {
        "en": ("World Cup OR FIFA OR NBA OR F1 OR Olympics", "en-US", "US", "US:en"),
        "pt": ("futebol OR Copa do Mundo OR Brasileirão OR NBA OR F1", "pt-419", "BR", "BR:pt-419"),
        "zh": ("世界杯 OR NBA OR 中国足球 OR F1 OR 奥运会", "zh-CN", "CN", "CN:zh-Hans"),
    },
    "technology": {
        "en": ("AI OR artificial intelligence OR tech OR Google OR Apple OR OpenAI", "en-US", "US", "US:en"),
        "pt": ("tecnologia OR inteligência artificial OR IA OR Google OR Apple", "pt-419", "BR", "BR:pt-419"),
        "zh": ("人工智能 OR 科技 OR 华为 OR 苹果 OR 谷歌 OR OpenAI", "zh-CN", "CN", "CN:zh-Hans"),
    },
    "geopolitics": {
        "en": ("war OR Ukraine OR Gaza OR China OR diplomacy OR NATO", "en-US", "US", "US:en"),
        "pt": ("guerra OR Ucrânia OR Gaza OR China OR diplomacia", "pt-419", "BR", "BR:pt-419"),
        "zh": ("中美关系 OR 乌克兰 OR 中东 OR 外交 OR 地缘政治", "zh-CN", "CN", "CN:zh-Hans"),
    },
    "entertainment": {
        "en": ("Netflix OR movie OR Oscar OR celebrity OR Hollywood", "en-US", "US", "US:en"),
        "pt": ("Netflix OR cinema OR Oscar OR celebridade OR Hollywood", "pt-419", "BR", "BR:pt-419"),
        "zh": ("电影 OR 奥斯卡 OR Netflix OR 明星 OR 娱乐", "zh-CN", "CN", "CN:zh-Hans"),
    },
    "music": {
        "en": ("music OR concert OR album OR Spotify OR Grammy", "en-US", "US", "US:en"),
        "pt": ("música OR show OR álbum OR Spotify OR Grammy", "pt-419", "BR", "BR:pt-419"),
        "zh": ("音乐 OR 演唱会 OR 格莱美 OR Spotify OR 专辑", "zh-CN", "CN", "CN:zh-Hans"),
    },
    "tv": {
        "en": ("TV show OR streaming OR HBO OR Disney OR series", "en-US", "US", "US:en"),
        "pt": ("novela OR série OR Globo OR BBB OR streaming", "pt-419", "BR", "BR:pt-419"),
        "zh": ("电视剧 OR 流媒体 OR 爱奇艺 OR 腾讯视频 OR Netflix", "zh-CN", "CN", "CN:zh-Hans"),
    },
    "science": {
        "en": ("science OR NASA OR space OR discovery OR research", "en-US", "US", "US:en"),
        "pt": ("ciência OR NASA OR espaço OR descoberta OR pesquisa", "pt-419", "BR", "BR:pt-419"),
        "zh": ("科学 OR NASA OR 太空 OR 科研 OR 新发现", "zh-CN", "CN", "CN:zh-Hans"),
    },
    "weather": {
        "en": ("weather OR climate OR storm OR hurricane OR flood", "en-US", "US", "US:en"),
        "pt": ("clima OR tempo Brasil OR tempestade OR enchente", "pt-419", "BR", "BR:pt-419"),
        "zh": ("天气 OR 气候变化 OR 台风 OR 洪水 OR 极端天气", "zh-CN", "CN", "CN:zh-Hans"),
    },
    "macro": {
        "en": ("economy OR markets OR stocks OR Fed OR inflation", "en-US", "US", "US:en"),
        "pt": ("mercado OR economia OR bolsa OR inflação", "pt-419", "BR", "BR:pt-419"),
        "zh": ("宏观经济 OR 股市 OR 美联储 OR 通货膨胀 OR 债券", "zh-CN", "CN", "CN:zh-Hans"),
    },
}

# Fallback category query (English)
_DEFAULT_QUERY = ("world news", "en-US", "US", "US:en")


def _cache_key(query: str, lang: str) -> str:
    return hashlib.md5(f"{query[:60]}:{lang}".encode()).hexdigest()


def _get_cached(key: str) -> list | None:
    if key in _news_cache:
        ts, data = _news_cache[key]
        if time.time() - ts < CACHE_TTL:
            return data
    return None


def _set_cached(key: str, data: list) -> None:
    _news_cache[key] = (time.time(), data)


def _parse_rss(xml_text: str) -> list[dict]:
    """Parse Google News RSS XML into article dicts."""
    import re
    import html as html_mod
    articles = []
    try:
        root = ET.fromstring(xml_text)
        channel = root.find("channel")
        if channel is None:
            return []
        for item in channel.findall("item"):
            title_el = item.find("title")
            link_el = item.find("link")
            desc_el = item.find("description")
            pub_el = item.find("pubDate")
            source_el = item.find("source")

            title = title_el.text if title_el is not None else ""
            link = link_el.text if link_el is not None else ""
            raw_desc = desc_el.text if desc_el is not None else ""
            pub_raw = pub_el.text if pub_el is not None else ""
            source_name = source_el.text if source_el is not None else "News"
            source_url = source_el.get("url", "") if source_el is not None else ""

            # Remove source suffix from title (Google appends " - Source Name")
            if source_name and title.endswith(f" - {source_name}"):
                title = title[: -(len(source_name) + 3)].strip()

            # Unescape HTML entities in title
            title = html_mod.unescape(title)

            # Clean up Google's HTML description (it's usually a list of related headlines)
            # Strip all HTML tags then unescape entities
            clean_desc = re.sub(r"<[^>]+>", " ", raw_desc).strip() if raw_desc else ""
            clean_desc = html_mod.unescape(clean_desc)
            # Collapse whitespace
            clean_desc = re.sub(r"\s+", " ", clean_desc).strip()
            # Remove "Source - Date" suffix Google adds
            clean_desc = re.sub(r"\s*-\s*[A-Za-z ]+\d+,?\s*\d{4}.*$", "", clean_desc).strip()
            # If description is just the title or starts with it, discard it
            # (Google News RSS descriptions typically just echo the headline)
            title_prefix = title[:40].lower()
            if clean_desc.lower().startswith(title_prefix) or len(clean_desc) < 40:
                clean_desc = ""

            # Parse published date
            pub_iso = ""
            if pub_raw:
                try:
                    pub_iso = parsedate_to_datetime(pub_raw).isoformat()
                except Exception:
                    pub_iso = ""

            if title and link:
                articles.append({
                    "title": title,
                    "description": clean_desc,
                    "url": link,
                    "image": "",  # RSS doesn't include images
                    "published": pub_iso,
                    "source": source_name,
                    "source_url": source_url,  # e.g. "https://www.bbc.com"
                })
    except Exception:
        pass
    return articles


async def _fetch_rss(query: str, hl: str, gl: str, ceid: str, n: int) -> list[dict]:
    key = _cache_key(f"{query}:{hl}:{gl}", ceid)
    cached = _get_cached(key)
    if cached is not None:
        return cached[:n]

    url = GNEWS_RSS.format(
        query=quote(query),
        hl=hl,
        gl=gl,
        ceid=ceid,
    )
    try:
        async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
            headers = {
                "User-Agent": "Mozilla/5.0 (compatible; ScenaraBot/1.0)",
                "Accept": "application/rss+xml, application/xml, text/xml, */*",
            }
            r = await client.get(url, headers=headers)
            r.raise_for_status()
            articles = _parse_rss(r.text)
            _set_cached(key, articles)
            return articles[:n]
    except Exception:
        return []


@router.get("/news")
async def get_news(
    category: str = Query("all"),
    lang: str = Query("pt"),
    max_results: int = Query(10, le=20),
):
    cat_cfg = CATEGORY_QUERIES.get(category, CATEGORY_QUERIES["all"])
    # Fetch both PT and EN and merge
    pt_cfg = cat_cfg.get("pt", _DEFAULT_QUERY)
    en_cfg = cat_cfg.get("en", _DEFAULT_QUERY)

    pt_arts, en_arts = await asyncio.gather(
        _fetch_rss(*pt_cfg, n=max_results),
        _fetch_rss(*en_cfg, n=max_results),
    )
    merged, seen = [], set()
    for i in range(max(len(pt_arts), len(en_arts))):
        for a in ([pt_arts[i]] if i < len(pt_arts) else []) + \
                 ([en_arts[i]] if i < len(en_arts) else []):
            t = a.get("title", "")
            if t and t not in seen:
                seen.add(t)
                merged.append(a)
    return {"articles": merged[:max_results], "category": category, "total": len(merged)}


@router.get("/single")
async def get_news_single(
    category: str = Query("all"),
    lang: str = Query("pt"),
    max_results: int = Query(10, le=20),
    query: str = Query(""),  # custom search query — overrides category when provided
):
    if query.strip():
        # Specific query (e.g. extracted from an event title) — use directly
        # Use the correct Google News locale so articles come back in the right language
        if lang == "pt":
            hl, gl, ceid = "pt-419", "BR", "BR:pt-419"
        elif lang == "zh":
            hl, gl, ceid = "zh-CN", "CN", "CN:zh-Hans"
        else:
            hl, gl, ceid = "en-US", "US", "US:en"
        articles = await _fetch_rss(query.strip(), hl, gl, ceid, n=max_results)
    else:
        cat_cfg  = CATEGORY_QUERIES.get(category, CATEGORY_QUERIES["all"])
        lang_key = "pt" if lang == "pt" else "zh" if lang == "zh" else "en"
        cfg      = cat_cfg.get(lang_key, cat_cfg.get("en", _DEFAULT_QUERY))
        articles = await _fetch_rss(*cfg, n=max_results)
    return {"articles": articles[:max_results]}


class SummaryRequest(BaseModel):
    title: str
    description: str | None = None
    url: str
    language: str = "en"


_summary_cache: dict[str, str] = {}

GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")


@router.post("/summary")
async def get_summary(payload: SummaryRequest):
    if payload.url in _summary_cache:
        return {"summary": _summary_cache[payload.url]}

    lang_instruction = (
        "Respond in Brazilian Portuguese (português do Brasil)."
        if payload.language == "pt"
        else "Respond in Simplified Chinese (简体中文)."
        if payload.language == "zh"
        else "Respond in English."
    )

    desc = (payload.description or "").strip()
    content = f"Headline: {payload.title}"
    if desc and len(desc) > 30:
        content += f"\nContext: {desc}"

    prompt = (
        f"{lang_instruction}\n\n"
        "You are a news summarizer for Scenara, a prediction market platform. "
        "Based on the news below, write a concise 2–3 sentence summary explaining "
        "what happened and why it matters for prediction markets. Be factual and direct.\n\n"
        f"{content}\n\n"
        "Write only the summary. No labels, no markdown."
    )

    # Try Groq first (free, fast)
    if GROQ_API_KEY:
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                r = await client.post(
                    "https://api.groq.com/openai/v1/chat/completions",
                    headers={
                        "Authorization": f"Bearer {GROQ_API_KEY}",
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
            pass

    # Try OpenAI fallback
    if OPENAI_API_KEY:
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                r = await client.post(
                    "https://api.openai.com/v1/chat/completions",
                    headers={
                        "Authorization": f"Bearer {OPENAI_API_KEY}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": "gpt-4o-mini",
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
            pass

    # Fallback: generate a template-based summary from the headline
    title_text = payload.title.strip().rstrip(".")
    if payload.language == "pt":
        fallback = (
            f"{title_text}. "
            f"Esta notícia pode impactar mercados de previsão relacionados ao tema. "
            f"Traders estão acompanhando de perto os desdobramentos para ajustar suas posições."
        )
    elif payload.language == "zh":
        fallback = (
            f"{title_text}。"
            f"这一事件可能影响与该主题相关的预测市场。"
            f"交易者正在密切关注事态发展，以调整其仓位。"
        )
    else:
        fallback = (
            f"{title_text}. "
            f"This development may impact prediction markets tied to this topic. "
            f"Traders are watching closely as the situation develops and adjusting positions accordingly."
        )
    _summary_cache[payload.url] = fallback
    return {"summary": fallback}
