from __future__ import annotations

import random
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session, joinedload

from app.db import get_db
from app import models
from app.routers.auth import get_current_user

router = APIRouter()

# ---------------------------------------------------------------------------
# Synthetic comment pool — realistic, human-sounding
# ---------------------------------------------------------------------------

_SYNTHETIC_COMMENTS_EN = [
    ("Lucas M.", "This one is tricky, I've been going back and forth all week lol"),
    ("Sofia R.", "Already placed my bet. Feeling good about this one 🤞"),
    ("Gabriel T.", "The odds moved a lot since yesterday, something's up"),
    ("Ana C.", "I always get burned on these economic ones 😅 let's see"),
    ("Mateus V.", "Smart money is on yes if you ask me"),
    ("Beatriz D.", "Volume looks thin for now, might wait closer to close"),
    ("Pedro A.", "Been tracking this market for 3 days now. Holding my position"),
    ("Camila S.", "Anyone else think the probability is way off here?"),
    ("Rafael O.", "Went 50/50 on this and the other one as a hedge"),
    ("Fernanda P.", "This exact scenario played out last year too"),
    ("Diego L.", "No brainer imo. Already in"),
    ("Larissa G.", "I respect the other side but I just don't see it happening"),
    ("Bruno F.", "Been wrong on similar markets twice this month, not touching it"),
    ("Juliana M.", "The market has been moving toward Yes all morning"),
    ("Vitor H.", "Anyone have a link to good analysis on this?"),
    ("Natalia Z.", "I trust the crowd on this one more than my own gut"),
    ("Thiago B.", "This closes tomorrow right? Cutting it close"),
    ("Amanda K.", "Up 40% on my position. Patience pays"),
    ("Carlos E.", "Bet small, sleep well. That's my motto here"),
    ("Patricia N.", "Really wish there was more context provided for this one"),
    ("Leonardo W.", "The news from earlier makes this almost certain"),
    ("Isabela C.", "I've seen markets like this flip in the last hour before"),
    ("Rodrigo S.", "Bold prediction but I'm going with the contrarian take"),
    ("Mariana F.", "This is exactly the kind of uncertainty I look for"),
    ("Felipe A.", "Whoever set these odds knows something I don't"),
    ("Renata Q.", "Adding more to my position after that last update"),
    ("Eduardo X.", "Classic overthinking situation. Just pick one and go"),
    ("Tatiana P.", "The trend has been consistent for weeks now"),
    ("Henrique L.", "I like this market. Clean, binary, trackable"),
    ("Vanessa M.", "Already doubled my stake. Very confident on this"),
    ("Alexandre B.", "Remember when everyone was sure last time? Humbling"),
    ("Priscila R.", "This feels like a coin flip dressed up as analysis lol"),
    ("Gustavo C.", "Sharp drop in No probability overnight. Interesting"),
    ("Aline D.", "Markets don't lie. Following the money here"),
    ("Daniel V.", "Been watching this one since it opened. Finally pulled the trigger"),
    ("Carolina T.", "Anyone else feel like the Yes crowd is way overconfident?"),
    ("Arthur K.", "Minimal risk for solid reward. That's the play"),
    ("Elaine F.", "Not touching this one. Too noisy right now"),
    ("Marcos J.", "Strong conviction on my side. Let's see if I'm right"),
    ("Bianca S.", "This market moves fast. Blink and you miss the window"),
    ("Jonas P.", "I only bet when I know more than the market. This qualifies"),
    ("Nathalia O.", "Rolled over my winnings from the last one into this"),
    ("Ricardo M.", "This would be the third time this exact thing has happened"),
    ("Leticia B.", "I love how active the comments are. Good sign"),
    ("Andre H.", "Opened a position then immediately second-guessed myself lol"),
    ("Samara C.", "Exit plan is ready. Just waiting now"),
    ("Murilo V.", "Reading the comments always calms me down before I bet"),
    ("Gisele A.", "I was wrong last week. Made up for it here already"),
    ("Paulo N.", "Never bet more than you'd be OK losing. Lesson learned"),
    ("Denise L.", "Curious what the sharp bettors are thinking on this one"),
]

_SYNTHETIC_COMMENTS_PT = [
    ("Lucas M.", "Difícil esse. Fico mudando de ideia toda hora kk"),
    ("Sofia R.", "Já fiz minha aposta. Tô confiante nesse 🤞"),
    ("Gabriel T.", "As odds mudaram bastante ontem, tem algo acontecendo"),
    ("Ana C.", "Sempre me queimo nesses de economia 😅 vamos ver"),
    ("Mateus V.", "Dinheiro inteligente tá no Sim, na minha opinião"),
    ("Beatriz D.", "Volume tá baixo ainda, vou esperar perto do fechamento"),
    ("Pedro A.", "Acompanhando esse mercado faz 3 dias. Mantendo minha posição"),
    ("Camila S.", "Alguém mais acha que a probabilidade tá errada aqui?"),
    ("Rafael O.", "Fiz 50/50 nesse e no outro como hedge"),
    ("Fernanda P.", "Exatamente esse cenário aconteceu no ano passado também"),
    ("Diego L.", "Decisão óbvia pra mim. Já entrei"),
    ("Larissa G.", "Respeito quem tá no outro lado, mas não vejo acontecer"),
    ("Bruno F.", "Errei em dois mercados parecidos esse mês, não vou arriscar"),
    ("Juliana M.", "O mercado foi se inclinando pro Sim a manhã toda"),
    ("Vitor H.", "Alguém tem um link com análise boa sobre isso?"),
    ("Natalia Z.", "Confio mais na multidão aqui do que no meu instinto"),
    ("Thiago B.", "Fecha amanhã né? Tá na hora"),
    ("Amanda K.", "40% de lucro na minha posição. Paciência compensa"),
    ("Carlos E.", "Aposta pequena, dorme tranquilo. Meu lema aqui"),
    ("Patricia N.", "Queria que tivesse mais contexto explicando esse aqui"),
    ("Leonardo W.", "A notícia de antes deixou isso quase certo"),
    ("Isabela C.", "Já vi mercado assim virar na última hora antes"),
    ("Rodrigo S.", "Previsão ousada mas vou na visão contrária"),
    ("Mariana F.", "Esse tipo de incerteza é exatamente o que procuro"),
    ("Felipe A.", "Quem colocou essas odds sabe algo que eu não sei"),
    ("Renata Q.", "Aumentando minha posição depois da última atualização"),
    ("Eduardo X.", "Clássico caso de análise demais. Escolhe um e vai"),
    ("Tatiana P.", "A tendência tem sido consistente há semanas"),
    ("Henrique L.", "Gosto desse mercado. Limpo, binário, rastreável"),
    ("Vanessa M.", "Dobrei minha aposta. Muito confiante"),
    ("Alexandre B.", "Lembra quando todo mundo tinha certeza da última vez? Humilhante"),
    ("Priscila R.", "Isso parece cara ou coroa disfarçado de análise kkk"),
    ("Gustavo C.", "Queda forte no Não durante a noite. Interessante"),
    ("Aline D.", "Mercado não mente. Seguindo o dinheiro"),
    ("Daniel V.", "Acompanhando desde que abriu. Finalmente entrei"),
    ("Carolina T.", "Alguém mais acha que o pessoal do Sim tá muito confiante?"),
    ("Arthur K.", "Risco mínimo pra retorno sólido. Essa é a jogada"),
    ("Elaine F.", "Não vou entrar nesse. Muito ruído agora"),
    ("Marcos J.", "Convicção forte da minha parte. Vamos ver se acerto"),
    ("Bianca S.", "Esse mercado move rápido. Pisca e perde a janela"),
    ("Jonas P.", "Só aposto quando sei mais que o mercado. Aqui qualifica"),
    ("Nathalia O.", "Reinvesti o lucro do último aqui"),
    ("Ricardo M.", "Seria a terceira vez que exatamente isso acontece"),
    ("Leticia B.", "Adoro como os comentários aqui são ativos. Bom sinal"),
    ("Andre H.", "Abri uma posição e já fiquei com dúvida imediatamente kkk"),
    ("Samara C.", "Plano de saída pronto. Só aguardando"),
    ("Murilo V.", "Ler os comentários sempre me acalma antes de apostar"),
    ("Gisele A.", "Errei na semana passada. Já compensei aqui"),
    ("Paulo N.", "Nunca aposte mais do que toparia perder. Aprendi na marra"),
    ("Denise L.", "Curioso o que os apostadores experientes estão pensando"),
]


def _synthetic_comments(event_id: int, lang: str = "pt", count: int = 5) -> list[CommentOut]:
    """Generate deterministic but varied synthetic comments for an event.

    Always uses the PT pool so comments feel local; body_en carries the paired
    EN translation so the frontend can show a "Show translation" toggle.
    """
    rng = random.Random(event_id * 31337)
    # Always pick from PT pool — same indices in EN pool are the translations
    indices = rng.sample(range(len(_SYNTHETIC_COMMENTS_PT)), min(count, len(_SYNTHETIC_COMMENTS_PT)))
    now = datetime.utcnow()
    result = []
    for i, idx in enumerate(indices):
        name_pt, body_pt = _SYNTHETIC_COMMENTS_PT[idx]
        _name_en, body_en = _SYNTHETIC_COMMENTS_EN[idx]
        offset_hours = rng.randint(1, 48)
        offset_mins = rng.randint(0, 59)
        ts = now - timedelta(hours=offset_hours, minutes=offset_mins)
        result.append(CommentOut(
            id=-(event_id * 1000 + i),  # Negative IDs mark synthetic
            user_id=0,
            body=body_pt,        # Always Portuguese
            body_en=body_en,     # Paired English translation
            created_at=ts,
            display_name=name_pt,
            event_id=event_id,
            news_url=None,
        ))
    # Sort by created_at desc
    result.sort(key=lambda c: c.created_at, reverse=True)
    return result


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class CommentCreate(BaseModel):
    body: str
    event_id: int | None = None
    news_url: str | None = None


class CommentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    user_id: int
    body: str
    body_en: str | None = None   # EN translation for PT synthetic comments
    created_at: datetime
    display_name: str | None = None
    event_id: int | None = None
    news_url: str | None = None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _format(c: models.Comment) -> CommentOut:
    return CommentOut(
        id=c.id,
        user_id=c.user_id,
        body=c.body,
        created_at=c.created_at,
        display_name=c.user.display_name if c.user else None,
        event_id=c.event_id,
        news_url=c.news_url,
    )


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.get("/event/{event_id}", response_model=list[CommentOut])
def get_event_comments(
    event_id: int,
    lang: str = Query(default="pt"),
    db: Session = Depends(get_db),
):
    real = (
        db.query(models.Comment)
        .filter(models.Comment.event_id == event_id)
        .options(joinedload(models.Comment.user))
        .order_by(models.Comment.created_at.desc())
        .limit(100)
        .all()
    )
    formatted = [_format(c) for c in real]

    # Pad with synthetic comments so every event has at least 6 comments
    if len(formatted) < 6:
        need = 6 - len(formatted)
        synthetic = _synthetic_comments(event_id, count=need + 4)
        # Interleave synthetic with real by timestamp
        combined = formatted + synthetic
        combined.sort(key=lambda c: c.created_at, reverse=True)
        return combined[:20]

    return formatted


_NEWS_SYNTHETIC_COMMENTS_PT = [
    ("Lucas M.", "Notícia importante. Vai impactar bastante o mercado de previsão"),
    ("Sofia R.", "Já esperava isso. Posicionei cedo e valeu a pena"),
    ("Gabriel T.", "Isso muda completamente o cenário que eu tinha em mente"),
    ("Ana C.", "Preciso ler mais antes de tomar qualquer decisão"),
    ("Mateus V.", "Bom contexto. Exatamente o que precisava pra fechar minha posição"),
    ("Beatriz D.", "Interesting. Vou rever minha aposta com base nisso"),
    ("Pedro A.", "Essa notícia confirma o que o mercado já estava indicando"),
    ("Camila S.", "Alguém mais acha que a reação do mercado foi exagerada?"),
    ("Rafael O.", "Fonte confiável. Levo a sério"),
    ("Fernanda P.", "Esse tipo de notícia costuma movimentar os mercados de crypto mais"),
    ("Diego L.", "Já refleti na minha carteira. Ajustei ontem"),
    ("Larissa G.", "Contexto perfeito pra quem tá estudando o mercado"),
    ("Bruno F.", "Tô acompanhando esse assunto faz semanas. Finalmente confirmado"),
    ("Juliana M.", "Queria saber qual a opinião dos traders experientes sobre isso"),
    ("Vitor H.", "Compartilhei com meu grupo. Todo mundo dividido sobre o impacto"),
]

_NEWS_SYNTHETIC_COMMENTS_EN = [
    ("Lucas M.", "Big news. This will definitely move the prediction markets"),
    ("Sofia R.", "Saw this coming. Positioned early and it paid off"),
    ("Gabriel T.", "This completely changes the scenario I had in mind"),
    ("Ana C.", "Need to read more before making any decisions"),
    ("Mateus V.", "Good context. Exactly what I needed to close my position"),
    ("Beatriz D.", "Interesting. Going to revisit my bet based on this"),
    ("Pedro A.", "This confirms what the market was already pricing in"),
    ("Camila S.", "Anyone else think the market overreacted to this?"),
    ("Rafael O.", "Reliable source. Taking this seriously"),
    ("Fernanda P.", "This kind of news usually moves crypto markets more"),
    ("Diego L.", "Already reflected in my portfolio. Adjusted yesterday"),
    ("Larissa G.", "Perfect context for anyone studying this market"),
    ("Bruno F.", "Been following this topic for weeks. Finally confirmed"),
    ("Juliana M.", "Would love to know what experienced traders think about this"),
    ("Vitor H.", "Shared with my group. Everyone split on the impact"),
]


def _news_synthetic_comments(url: str, lang: str = "pt", count: int = 5) -> list[CommentOut]:
    rng = random.Random(hash(url) & 0xFFFFFF)
    # Always pick from PT pool; EN pool at same index is the translation
    indices = rng.sample(range(len(_NEWS_SYNTHETIC_COMMENTS_PT)), min(count, len(_NEWS_SYNTHETIC_COMMENTS_PT)))
    now = datetime.utcnow()
    result = []
    for i, idx in enumerate(indices):
        name_pt, body_pt = _NEWS_SYNTHETIC_COMMENTS_PT[idx]
        _name_en, body_en = _NEWS_SYNTHETIC_COMMENTS_EN[idx]
        offset_hours = rng.randint(1, 24)
        offset_mins = rng.randint(0, 59)
        ts = now - timedelta(hours=offset_hours, minutes=offset_mins)
        result.append(CommentOut(
            id=-(abs(hash(url)) % 100000 + i),
            user_id=0,
            body=body_pt,    # Always Portuguese
            body_en=body_en, # Paired English translation
            created_at=ts,
            display_name=name_pt,
            event_id=None,
            news_url=url,
        ))
    result.sort(key=lambda c: c.created_at, reverse=True)
    return result


@router.get("/news", response_model=list[CommentOut])
def get_news_comments(
    url: str = Query(...),
    lang: str = Query(default="pt"),
    db: Session = Depends(get_db),
):
    real = (
        db.query(models.Comment)
        .filter(models.Comment.news_url == url)
        .options(joinedload(models.Comment.user))
        .order_by(models.Comment.created_at.desc())
        .limit(100)
        .all()
    )
    formatted = [_format(c) for c in real]

    if len(formatted) < 5:
        need = 5 - len(formatted)
        synthetic = _news_synthetic_comments(url, count=need + 3)
        combined = formatted + synthetic
        combined.sort(key=lambda c: c.created_at, reverse=True)
        return combined[:15]

    return formatted


@router.post("/", response_model=CommentOut, status_code=201)
def post_comment(
    payload: CommentCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if not payload.body.strip():
        raise HTTPException(status_code=400, detail="Comment cannot be empty")
    if not payload.event_id and not payload.news_url:
        raise HTTPException(status_code=400, detail="Provide event_id or news_url")

    comment = models.Comment(
        user_id=current_user.id,  # always use JWT identity — never trust caller-supplied ID
        body=payload.body.strip(),
        event_id=payload.event_id,
        news_url=payload.news_url,
    )
    db.add(comment)
    db.commit()
    db.refresh(comment)

    # reload with user relationship for display_name
    comment = (
        db.query(models.Comment)
        .options(joinedload(models.Comment.user))
        .filter(models.Comment.id == comment.id)
        .first()
    )
    return _format(comment)


@router.delete("/{comment_id}", status_code=204)
def delete_comment(
    comment_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    comment = db.query(models.Comment).filter(models.Comment.id == comment_id).first()
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")
    if comment.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not your comment")
    db.delete(comment)
    db.commit()