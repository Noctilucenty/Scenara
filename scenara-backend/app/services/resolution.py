"""
app/services/resolution.py

Shared settlement logic used by:
  - Manual resolve endpoint (events.py)
  - Auto-resolver (auto_resolver.py)
  - Settle endpoint (predictions.py)

Single source of truth — fix here, fixed everywhere.
"""
from __future__ import annotations
from datetime import datetime
from sqlalchemy.orm import Session

from app.models.prediction import Prediction
from app.models.account import Account
from app.models.transaction import Transaction
from app.models.user import User
from app.models.event import Event
from app.models.probability_history import ScenarioProbabilityHistory
from app.services.notifications import notify_prediction_settled
from app.services.history_pruner import prune_resolved_event_history


def _update_streak(user: User, won: bool) -> None:
    if won:
        user.current_streak = (user.current_streak or 0) + 1
        if user.current_streak > (user.best_streak or 0):
            user.best_streak = user.current_streak
        return
    # Loss: consume a streak freeze if available, otherwise reset to 0.
    # The freeze is set by /users/me/freeze-streak before the loss resolves,
    # giving users active control over when to spend it.
    if getattr(user, "streak_freeze_active", False):
        user.streak_freeze_active = False
        return
    user.current_streak = 0


def settle_event(
    db: Session,
    event: Event,
    winning_scenario_id: int,
    resolution_note: str = "",
) -> dict:
    """
    Settle all open predictions for an event.
    Winners get payout. Losers keep nothing. Returns summary dict.
    """
    # Guard against double-resolution (admin + auto-resolver race, or manual retry)
    if event.status == "resolved":
        return {"ok": False, "error": "Event already resolved"}

    scenario_ids = {s.id for s in event.scenarios}
    if winning_scenario_id not in scenario_ids:
        return {"ok": False, "error": "winning_scenario_id not in event"}

    open_predictions = (
        db.query(Prediction)
        .filter(
            Prediction.scenario_id.in_(scenario_ids),
            Prediction.status == "open",
        )
        .all()
    )

    # Batch-load all accounts and users in 2 queries instead of 2×N queries.
    user_ids = list({p.user_id for p in open_predictions})
    accounts_map: dict[int, Account] = {
        a.user_id: a
        for a in db.query(Account).filter(
            Account.user_id.in_(user_ids),
            Account.account_type == "simulation",
            Account.is_active.is_(True),
        ).all()
    }
    users_map: dict[int, User] = {
        u.id: u
        for u in db.query(User).filter(User.id.in_(user_ids)).all()
    }

    now = datetime.utcnow()
    total_winners = total_losers = 0
    total_payout = 0.0

    # Pre-compute which users bet on the winning scenario.  A user who
    # hedge-bet across multiple scenarios is treated as a winner if *any*
    # of their predictions landed on the winning side.  Without this,
    # processing order determines streak outcome: a "lost" prediction
    # processed before the user's "won" prediction would reset the streak
    # and then the "won" prediction would only increment it to 1.
    winning_user_ids: set[int] = {
        p.user_id for p in open_predictions
        if p.scenario_id == winning_scenario_id
    }
    # Track which users have already had their streak updated so each
    # user's streak changes exactly once per event resolution.
    streak_updated: set[int] = set()

    for prediction in open_predictions:
        account = accounts_map.get(prediction.user_id)
        user = users_map.get(prediction.user_id)

        if prediction.scenario_id == winning_scenario_id:
            payout = float(prediction.simulated_amount) * prediction.payout_multiplier
            pnl = payout - float(prediction.simulated_amount)
            prediction.status = "won"
            prediction.pnl = round(pnl, 2)
            prediction.settled_at = now
            if account:
                account.balance = float(account.balance) + payout
                db.add(Transaction(
                    user_id=prediction.user_id, account_id=account.id,
                    type="prediction_win", amount=round(payout, 2),
                    currency=account.currency,
                ))
            if user and prediction.user_id not in streak_updated:
                _update_streak(user, won=True)
                streak_updated.add(prediction.user_id)
            total_winners += 1
            total_payout += payout
        else:
            prediction.status = "lost"
            prediction.pnl = round(-float(prediction.simulated_amount), 2)
            prediction.settled_at = now
            if account:
                db.add(Transaction(
                    user_id=prediction.user_id, account_id=account.id,
                    type="prediction_loss", amount=0,
                    currency=account.currency,
                ))
            # Only update the streak for pure losers — users who also backed
            # the winning scenario are already (or will be) marked as winners.
            if user and prediction.user_id not in streak_updated \
                    and prediction.user_id not in winning_user_ids:
                _update_streak(user, won=False)
                streak_updated.add(prediction.user_id)
            total_losers += 1

    # Mark event resolved + log final probability snapshots
    event.status = "resolved"
    event.resolution_note = resolution_note
    event.resolved_at = now

    for scenario in event.scenarios:
        scenario.status = "won" if scenario.id == winning_scenario_id else "lost"
        scenario.probability = 100.0 if scenario.id == winning_scenario_id else 0.0
        db.add(ScenarioProbabilityHistory(
            scenario_id=scenario.id,
            event_id=scenario.event_id,
            probability=scenario.probability,
            source="resolved",
            recorded_at=now,
        ))

    # Collect notification payloads BEFORE commit while ORM objects are still loaded.
    # After db.commit() the session expires all objects — accessing prediction.pnl
    # post-commit triggers N lazy-load queries (N+1 bug).
    event_title = event.title or "your prediction"
    event_id_val = event.id
    notification_payloads = [
        (p.user_id, p.status == "won", float(p.pnl or 0))
        for p in open_predictions
    ]

    db.commit()

    # Auto top-up any users whose balance dropped below threshold.
    # Re-use the already-loaded accounts_map to avoid N extra queries.
    _batch_topup(db, accounts_map)

    # Trim history for this now-resolved event (open events are never touched).
    prune_resolved_event_history(db)

    # Fire-and-forget push notifications after commit (background thread per call).
    for user_id, won, pnl in notification_payloads:
        notify_prediction_settled(
            user_id=user_id,
            won=won,
            pnl=pnl,
            event_id=event_id_val,
            event_title=event_title,
        )

    return {
        "ok": True,
        "event_id": event.id,
        "winning_scenario_id": winning_scenario_id,
        "total_winners": total_winners,
        "total_losers": total_losers,
        "total_payout": round(total_payout, 2),
        "resolution_note": resolution_note,
    }


def void_event(db: Session, event: Event, note: str = "Event expired — all bets refunded") -> dict:
    """
    Void all open predictions — refund amounts, mark event resolved.
    Used for non-crypto events that expire without a determined outcome.
    """
    scenario_ids = {s.id for s in event.scenarios}
    open_predictions = (
        db.query(Prediction)
        .filter(
            Prediction.scenario_id.in_(scenario_ids),
            Prediction.status == "open",
        )
        .all()
    )

    # Batch-load accounts to avoid N queries in the loop.
    void_user_ids = list({p.user_id for p in open_predictions})
    void_accounts: dict[int, Account] = {
        a.user_id: a
        for a in db.query(Account).filter(
            Account.user_id.in_(void_user_ids),
            Account.account_type == "simulation",
            Account.is_active.is_(True),
        ).all()
    }

    now = datetime.utcnow()
    refunded = 0

    for prediction in open_predictions:
        account = void_accounts.get(prediction.user_id)
        prediction.status = "void"
        prediction.pnl = 0.0
        prediction.settled_at = now
        if account:
            account.balance = float(account.balance) + float(prediction.simulated_amount)
            db.add(Transaction(
                user_id=prediction.user_id, account_id=account.id,
                type="void", amount=float(prediction.simulated_amount),
                currency=account.currency,
            ))
        refunded += 1

    event.status = "resolved"
    event.resolution_note = note
    event.resolved_at = now
    for s in event.scenarios:
        s.status = "lost"

    db.commit()
    return {"ok": True, "event_id": event.id, "refunded": refunded}


TOPUP_THRESHOLD = 100.0   # top up when balance drops below this
TOPUP_TARGET    = 1_000.0 # restore balance to this amount


def _batch_topup(db: Session, accounts_map: dict) -> int:
    """
    Top-up all accounts in the map whose balance is below TOPUP_THRESHOLD.
    Returns the count of accounts that were topped up.
    Single db.commit() at the end covers all changes.
    """
    topped = 0
    for user_id, account in accounts_map.items():
        if account and float(account.balance) < TOPUP_THRESHOLD:
            added = TOPUP_TARGET - float(account.balance)
            account.balance = TOPUP_TARGET
            db.add(Transaction(
                user_id=user_id, account_id=account.id,
                type="top_up", amount=round(added, 2),
                currency=account.currency,
            ))
            topped += 1
    if topped:
        db.commit()
    return topped


def _auto_topup(db: Session, user_id: int) -> bool:
    """Single-user topup — kept for external callers outside settle flow."""
    account = (
        db.query(Account)
        .filter(
            Account.user_id == user_id,
            Account.account_type == "simulation",
            Account.is_active.is_(True),
        )
        .first()
    )
    if not account:
        return False
    if float(account.balance) < TOPUP_THRESHOLD:
        added = TOPUP_TARGET - float(account.balance)
        account.balance = TOPUP_TARGET
        db.add(Transaction(
            user_id=user_id, account_id=account.id,
            type="top_up", amount=round(added, 2),
            currency=account.currency,
        ))
        db.commit()
        return True
    return False
