"""
TEMPORARY — one-shot migration endpoint: Render → Neon.
DELETE THIS FILE AND ITS ROUTER REGISTRATION IN main.py after migration completes.
"""
from fastapi import APIRouter, HTTPException
from sqlalchemy import create_engine, MetaData, text

NEON_URL = "postgresql://neondb_owner:npg_ma6NrxdX7OYo@ep-wandering-pond-anjnjr88.c-6.us-east-1.aws.neon.tech/neondb?sslmode=require"
SECRET   = "scenara-migrate-2026"          # simple guard so random visitors can't trigger this

router = APIRouter()

@router.get("/admin/migrate-to-neon")
def migrate_to_neon(secret: str):
    if secret != SECRET:
        raise HTTPException(status_code=403, detail="wrong secret")

    from app.db import engine as src_engine   # current Render DB via DATABASE_URL
    results = []

    try:
        tgt_engine = create_engine(NEON_URL)

        # 1. Reflect full schema from source
        meta = MetaData()
        meta.reflect(bind=src_engine)
        tables = meta.sorted_tables
        results.append(f"Found {len(tables)} tables: {[t.name for t in tables]}")

        # 2. Create all tables in Neon (safe: checkfirst=True)
        meta.create_all(bind=tgt_engine, checkfirst=True)
        results.append("Schema created in Neon")

        # 3. Copy data
        with src_engine.connect() as sc, tgt_engine.connect() as tc:
            for table in tables:
                rows = sc.execute(table.select()).fetchall()
                count = len(rows)
                if count:
                    tc.execute(table.delete())
                    tc.execute(table.insert(), [dict(r._mapping) for r in rows])
                    tc.commit()
                results.append(f"{table.name}: {count} rows copied")

        # 4. Reset sequences
        with tgt_engine.connect() as tc:
            for table in tables:
                for col in table.columns:
                    if col.primary_key and col.autoincrement:
                        try:
                            max_val = tc.execute(
                                text(f'SELECT MAX("{col.name}") FROM "{table.name}"')
                            ).scalar()
                            if max_val:
                                tc.execute(text(
                                    f"SELECT setval(pg_get_serial_sequence('{table.name}', '{col.name}'), {max_val})"
                                ))
                        except Exception:
                            pass
            tc.commit()
        results.append("Sequences reset")

        return {"status": "DONE", "log": results}

    except Exception as e:
        return {"status": "ERROR", "error": str(e), "log": results}
