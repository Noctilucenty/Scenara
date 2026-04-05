from __future__ import annotations

from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session, joinedload

from app.db import get_db
from app import models

router = APIRouter()


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class CommentCreate(BaseModel):
    user_id: int
    body: str
    event_id: int | None = None
    news_url: str | None = None


class CommentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    user_id: int
    body: str
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
def get_event_comments(event_id: int, db: Session = Depends(get_db)):
    comments = (
        db.query(models.Comment)
        .filter(models.Comment.event_id == event_id)
        .options(joinedload(models.Comment.user))
        .order_by(models.Comment.created_at.desc())
        .limit(100)
        .all()
    )
    return [_format(c) for c in comments]


@router.get("/news", response_model=list[CommentOut])
def get_news_comments(url: str = Query(...), db: Session = Depends(get_db)):
    comments = (
        db.query(models.Comment)
        .filter(models.Comment.news_url == url)
        .options(joinedload(models.Comment.user))
        .order_by(models.Comment.created_at.desc())
        .limit(100)
        .all()
    )
    return [_format(c) for c in comments]


@router.post("/", response_model=CommentOut, status_code=201)
def post_comment(payload: CommentCreate, db: Session = Depends(get_db)):
    if not payload.body.strip():
        raise HTTPException(status_code=400, detail="Comment cannot be empty")
    if not payload.event_id and not payload.news_url:
        raise HTTPException(status_code=400, detail="Provide event_id or news_url")

    user = db.query(models.User).filter(models.User.id == payload.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    comment = models.Comment(
        user_id=payload.user_id,
        body=payload.body.strip(),
        event_id=payload.event_id,
        news_url=payload.news_url,
    )
    db.add(comment)
    db.commit()
    db.refresh(comment)

    # reload with user
    comment = (
        db.query(models.Comment)
        .options(joinedload(models.Comment.user))
        .filter(models.Comment.id == comment.id)
        .first()
    )
    return _format(comment)


@router.delete("/{comment_id}", status_code=204)
def delete_comment(comment_id: int, user_id: int = Query(...), db: Session = Depends(get_db)):
    comment = db.query(models.Comment).filter(models.Comment.id == comment_id).first()
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")
    if comment.user_id != user_id:
        raise HTTPException(status_code=403, detail="Not your comment")
    db.delete(comment)
    db.commit()