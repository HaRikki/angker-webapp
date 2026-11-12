"""SMM Management backend for the Mini App Admin (real provider API calls — no demo data).
Providers, sync (no duplicates), service mgmt + bulk, orders (status/refill/cancel/refund w/ cost+profit),
dashboard. Registered from webapp.py: smm_admin.register(app, require_admin, helpers)."""
from __future__ import annotations
import asyncio, json, time
from typing import Optional
import aiosqlite, httpx
from fastapi import Depends, HTTPException
from pydantic import BaseModel
import database as db

P = "/api/admin/smm"
STATUS_MAP = {"pending": "Pending", "in progress": "Processing", "processing": "Processing", "inprogress": "Processing",
              "completed": "Completed", "complete": "Completed", "partial": "Partial", "canceled": "Canceled",
              "cancelled": "Canceled", "failed": "Failed", "refunded": "Canceled", "fail": "Failed"}


class ProviderBody(BaseModel):
    name: str = ""
    api_url: str = ""
    api_key: str = ""   # empty on edit = keep old key


class SyncBody(BaseModel):
    panel: int = 1
    import_new: bool = False
    categories: list[str] = []
    profit_type: str = "percent"
    profit_value: float = 0
    reprice: bool = True      # re-apply each service's own profit to the new provider cost


class BulkBody(BaseModel):
    ids: list[int]
    action: str  # enable|disable|delete|restore|purge|profit|category|feature|unfeature
    profit_type: Optional[str] = None
    profit_value: Optional[float] = None
    category: Optional[str] = None


class SvcOrderBody(BaseModel):
    sort_order: Optional[int] = None
    featured: Optional[int] = None


class RefundBody(BaseModel):
    amount: Optional[float] = None


def _d(r):
    return dict(r) if r is not None else {}


def _norm_status(s: str) -> str:
    return STATUS_MAP.get((s or "").strip().lower(), (s or "Pending").strip().title() or "Pending")


def _sell(cost, ptype, pval):
    c, v = float(cost or 0), float(pval or 0)
    return round(c * (1 + v / 100.0), 6) if ptype == "percent" else round(c + v, 6)


async def _migrate():
    async with aiosqlite.connect(db.DB_PATH) as c:
        try:
            await db._ensure_service_extra_cols(c)
            await db._ensure_channel_cols(c)
        except Exception:
            pass
        for tbl, col, ddl in [("orders", "panel_id", "INTEGER DEFAULT 0"), ("orders", "cost", "REAL"),
                              ("orders", "service_id", "INTEGER"), ("orders", "refunded", "REAL DEFAULT 0"),
                              ("orders", "remains", "INTEGER"), ("services", "featured", "INTEGER DEFAULT 0")]:
            cur = await c.execute(f"PRAGMA table_info({tbl})")
            if col not in [r[1] for r in await cur.fetchall()]:
                try:
                    await c.execute(f"ALTER TABLE {tbl} ADD COLUMN {col} {ddl}")
                except Exception:
                    pass
        await c.commit()


async def record_order_meta(order_id, svc: dict, qty: int, panel_id: int):
    """Called by webapp right after save_order() for real provider orders."""
    try:
        await _migrate()
        cost = round(float(svc.get("cost_price") or 0) * float(qty) / 1000.0, 6)
        async with aiosqlite.connect(db.DB_PATH) as c:
            await c.execute("UPDATE orders SET panel_id=?, cost=?, service_id=? WHERE order_id=? AND COALESCE(panel_id,0)=0",
                            (int(panel_id), cost, svc.get("id"), str(order_id)))
            await c.commit()
    except Exception:
        pass


async def _panel_call(panel: int, **data):
    url, key, err = await db.get_smm_panel_credentials(int(panel or 1))
    if err or not url or not key:
        raise HTTPException(400, err or "Provider URL/KEY not configured")
    try:
        async with httpx.AsyncClient(timeout=30) as cl:
            r = await cl.post(url, data={"key": key, **data})
            return r.json() if r.content else {}
    except httpx.TimeoutException:
        raise HTTPException(504, "Provider API timeout")
    except Exception as e:
        raise HTTPException(502, f"Provider API error: {e}")


async def _provider_info(pid: int, with_balance=True):
    url = (await db.get_setting(f"smm{pid}_url", "") or "").strip()
    key = (await db.get_setting(f"smm{pid}_key", "") or "").strip()
    name = (await db.get_setting(f"smm{pid}_name", "") or "").strip() or f"Provider {pid}"
    en = (await db.get_setting(f"smm{pid}_enabled", "1")) != "0"
    out = {"id": pid, "name": name, "api_url": url, "key_set": bool(key), "enabled": en, "status": "not_configured",
           "balance": None, "currency": None, "error": None}
    if url and key and with_balance:
        try:
            d = await _panel_call(pid, action="balance")
            if isinstance(d, dict) and "balance" in d:
                out.update(status="connected", balance=float(d["balance"]), currency=d.get("currency"))
            else:
                out.update(status="error", error=str((d or {}).get("error") or d)[:120])
        except HTTPException as e:
            out.update(status="error", error=str(e.detail)[:120])
        except Exception as e:
            out.update(status="error", error=str(e)[:120])
    elif url and key:
        out["status"] = "configured"
    return out


async def _pending_sync(limit=60):
    """Refresh non-final provider orders. Returns number updated."""
    await _migrate()
    async with aiosqlite.connect(db.DB_PATH) as c:
        c.row_factory = aiosqlite.Row
        cur = await c.execute("SELECT order_id,panel_id,status FROM orders WHERE COALESCE(panel_id,0)>0 AND status IN ('Pending','Processing','In progress') ORDER BY id DESC LIMIT ?", (limit,))
        rows = [dict(r) for r in await cur.fetchall()]
    n = 0
    by_panel = {}
    for r in rows:
        by_panel.setdefault(int(r["panel_id"]), []).append(r)
    for pid, lst in by_panel.items():
        for r in lst:
            try:
                d = await _panel_call(pid, action="status", order=r["order_id"])
            except Exception:
                break
            if isinstance(d, dict) and d.get("status"):
                ns = _norm_status(d["status"])
                if ns != r["status"]:
                    async with aiosqlite.connect(db.DB_PATH) as c:
                        await c.execute("UPDATE orders SET status=?, remains=? WHERE order_id=?", (ns, d.get("remains"), r["order_id"]))
                        await c.commit()
                    n += 1
    return n


def register(app, require_admin, fetch_services, normalize, add_or_update):
    @app.on_event("startup")
    async def _start():
        await _migrate()

        async def loop():
            while True:
                await asyncio.sleep(180)
                try:
                    await _pending_sync()
                except Exception:
                    pass
        asyncio.create_task(loop())

    # ---------- Providers ----------
    @app.get(P + "/providers")
    async def providers(balance: int = 1, _: int = Depends(require_admin)):
        panels = await db.list_smm_panels()
        ids = [int(p["id"]) for p in panels]
        res = await asyncio.gather(*[_provider_info(i, bool(balance)) for i in ids])
        return {"providers": list(res), "active": await db.get_active_smm_panel()}

    @app.post(P + "/providers")
    async def provider_add(b: ProviderBody, _: int = Depends(require_admin)):
        if not b.api_url.startswith("http"):
            raise HTTPException(400, "API URL must start with http(s)://")
        pid = await db.add_smm_panel(b.name)
        await db.set_setting(f"smm{pid}_url", b.api_url.strip())
        await db.set_setting(f"smm{pid}_key", b.api_key.strip())
        await db.set_setting(f"smm{pid}_enabled", "1")
        return await _provider_info(pid)

    @app.put(P + "/providers/{pid}")
    async def provider_edit(pid: int, b: ProviderBody, _: int = Depends(require_admin)):
        if b.name:
            await db.set_setting(f"smm{pid}_name", b.name.strip())
        if b.api_url:
            if not b.api_url.startswith("http"):
                raise HTTPException(400, "API URL must start with http(s)://")
            await db.set_setting(f"smm{pid}_url", b.api_url.strip())
        if b.api_key.strip():
            await db.set_setting(f"smm{pid}_key", b.api_key.strip())
        return await _provider_info(pid)

    @app.delete(P + "/providers/{pid}")
    async def provider_del(pid: int, _: int = Depends(require_admin)):
        async with aiosqlite.connect(db.DB_PATH) as c:
            cur = await c.execute("SELECT COUNT(*) FROM services WHERE COALESCE(panel_id,1)=? AND COALESCE(is_deleted,0)=0", (pid,))
            n = (await cur.fetchone())[0]
        if n:
            raise HTTPException(400, f"Provider has {n} services — delete/move them first")
        await db.delete_smm_panel(pid)
        return {"ok": True}

    @app.get(P + "/providers/{pid}/categories")
    async def provider_categories(pid: int, _: int = Depends(require_admin)):
        raw, err = await fetch_services(pid)
        if err:
            raise HTTPException(400, err)
        cats = {}
        for it in raw or []:
            if isinstance(it, dict):
                n = normalize(it)
                if n["provider_service_id"]:
                    cats[n["category"]] = cats.get(n["category"], 0) + 1
        return {"categories": [{"name": k, "count": v} for k, v in sorted(cats.items())], "total": sum(cats.values())}

    # ---------- Sync (never duplicates: matched by provider service id + panel) ----------
    @app.post(P + "/sync")
    async def sync(b: SyncBody, _: int = Depends(require_admin)):
        raw, err = await fetch_services(int(b.panel))
        if err:
            raise HTTPException(400, err)
        prov = {}
        for it in raw or []:
            if isinstance(it, dict):
                n = normalize(it)
                if n["provider_service_id"]:
                    prov[n["provider_service_id"]] = n
        stats = {"provider_total": len(prov), "updated": 0, "new": 0, "missing_on_provider": 0, "skipped": 0, "errors": []}
        async with aiosqlite.connect(db.DB_PATH) as c:
            c.row_factory = aiosqlite.Row
            cur = await c.execute("SELECT * FROM services WHERE COALESCE(channel,'bot')='webapp' AND COALESCE(panel_id,1)=? AND COALESCE(smm_service_id,'')<>''", (int(b.panel),))
            have = {str(r["smm_service_id"]): dict(r) for r in await cur.fetchall()}
        for sid, s in have.items():
            n = prov.get(sid)
            if not n:
                if not s.get("is_deleted"):
                    stats["missing_on_provider"] += 1
                continue
            fields = dict(min_qty=n["min_qty"], max_qty=n["max_qty"], cost_price=float(n["cost_price"]),
                          svc_type=n.get("svc_type") or "", avg_time=n.get("avg_time") or "",
                          refill=str(n.get("refill") or ""), cancel=str(n.get("cancel") or ""))
            if b.reprice and s.get("profit_type") in ("flat", "percent"):
                sell = _sell(n["cost_price"], s["profit_type"], s.get("profit_value") or 0)
                if sell > 0:
                    fields.update(selling_price=sell, original_price=sell)
            await db.update_service(s["id"], **fields)
            stats["updated"] += 1
        if b.import_new:
            new_ids = [sid for sid, n in prov.items() if sid not in have and (not b.categories or n["category"] in b.categories)]
            for sid in new_ids:
                n = prov[sid]
                sell = _sell(n["cost_price"], b.profit_type, b.profit_value)
                if sell <= 0:
                    stats["skipped"] += 1
                    continue
                try:
                    await add_or_update(int(b.panel), n, b.profit_type, float(b.profit_value), sell)
                    stats["new"] += 1
                except Exception as e:
                    stats["errors"].append(f"{sid}: {e}")
        return {"ok": True, "stats": stats}

    # ---------- Services ----------
    @app.get(P + "/services")
    async def services(q: str = "", status: str = "all", panel: int = 0, category: str = "", featured: int = 0,
                       limit: int = 30, offset: int = 0, _: int = Depends(require_admin)):
        await _migrate()
        cl = ["COALESCE(s.channel,'bot')='webapp'"]; pr = []
        if status == "active": cl += ["COALESCE(s.is_deleted,0)=0", "COALESCE(s.is_disabled,0)=0"]
        elif status == "disabled": cl += ["COALESCE(s.is_deleted,0)=0", "COALESCE(s.is_disabled,0)=1"]
        elif status == "deleted": cl.append("COALESCE(s.is_deleted,0)=1")
        else: cl.append("COALESCE(s.is_deleted,0)=0")
        if panel: cl.append("COALESCE(s.panel_id,1)=?"); pr.append(panel)
        if category: cl.append("COALESCE(s.group_name,'')=?"); pr.append(category)
        if featured: cl.append("COALESCE(s.featured,0)=1")
        if q:
            cl.append("(s.name LIKE ? OR s.smm_service_id LIKE ?)"); pr += [f"%{q}%", f"%{q}%"]
        w = " AND ".join(cl)
        async with aiosqlite.connect(db.DB_PATH) as c:
            c.row_factory = aiosqlite.Row
            cur = await c.execute(f"SELECT COUNT(*) FROM services s WHERE {w}", pr)
            total = (await cur.fetchone())[0]
            cur = await c.execute(
                f"SELECT s.id,s.name,s.smm_service_id,s.panel_id,s.group_name,s.min_qty,s.max_qty,s.cost_price,s.profit_type,s.profit_value,"
                f"s.selling_price,s.description,s.is_disabled,s.is_deleted,s.featured,s.sort_order,p.name AS platform "
                f"FROM services s LEFT JOIN platforms p ON p.id=s.platform_id WHERE {w} "
                f"ORDER BY COALESCE(s.featured,0) DESC, s.sort_order, s.id LIMIT ? OFFSET ?", pr + [min(limit, 100), offset])
            rows = [dict(r) for r in await cur.fetchall()]
            cur = await c.execute("SELECT DISTINCT COALESCE(group_name,'') FROM services WHERE COALESCE(channel,'bot')='webapp' AND COALESCE(is_deleted,0)=0")
            cats = sorted([r[0] for r in await cur.fetchall() if r[0]])
        return {"services": rows, "total": total, "categories": cats}

    @app.post(P + "/services/bulk")
    async def bulk(b: BulkBody, _: int = Depends(require_admin)):
        if not b.ids:
            raise HTTPException(400, "No services selected")
        n = 0
        for sid in b.ids[:2000]:
            s = await db.get_service(sid)
            if not s:
                continue
            s = _d(s)
            a = b.action
            if a == "enable": await db.set_service_disabled(sid, False)
            elif a == "disable": await db.set_service_disabled(sid, True)
            elif a == "delete": await db.soft_delete_service(sid)
            elif a == "restore": await db.restore_service(sid)
            elif a == "purge": await db.delete_service(sid, True)
            elif a == "feature": await db.update_service(sid, featured=1)
            elif a == "unfeature": await db.update_service(sid, featured=0)
            elif a == "category":
                if not (b.category or "").strip():
                    raise HTTPException(400, "Category required")
                await db.update_service(sid, group_name=b.category.strip())
            elif a == "profit":
                pt = (b.profit_type or "percent").lower()
                if pt not in ("flat", "percent") or b.profit_value is None or b.profit_value < 0:
                    raise HTTPException(400, "Invalid profit")
                sell = _sell(s.get("cost_price") or 0, pt, b.profit_value)
                if sell <= 0:
                    continue
                await db.update_service(sid, profit_type=pt, profit_value=float(b.profit_value), selling_price=sell, original_price=sell)
            else:
                raise HTTPException(400, "Unknown action")
            n += 1
        return {"ok": True, "affected": n}

    @app.post(P + "/services/{sid}/order")
    async def svc_order(sid: int, b: SvcOrderBody, _: int = Depends(require_admin)):
        f = {k: v for k, v in (("sort_order", b.sort_order), ("featured", b.featured)) if v is not None}
        await _migrate()
        await db.update_service(sid, **f)
        return {"ok": True}

    # ---------- Orders ----------
    @app.get(P + "/orders")
    async def orders(status: str = "", q: str = "", limit: int = 20, offset: int = 0, _: int = Depends(require_admin)):
        await _migrate()
        cl, pr = ["1=1"], []
        if status: cl.append("o.status=?"); pr.append(status)
        if q: cl.append("(o.order_id LIKE ? OR o.link LIKE ? OR CAST(o.user_id AS TEXT)=?)"); pr += [f"%{q}%", f"%{q}%", q]
        async with aiosqlite.connect(db.DB_PATH) as c:
            c.row_factory = aiosqlite.Row
            cur = await c.execute(
                "SELECT o.*, u.username, u.first_name FROM orders o LEFT JOIN users u ON u.user_id=o.user_id "
                f"WHERE {' AND '.join(cl)} ORDER BY o.id DESC LIMIT ? OFFSET ?", pr + [min(limit, 50), offset])
            rows = [dict(r) for r in await cur.fetchall()]
        for r in rows:
            r["profit"] = round(float(r["price"] or 0) - float(r["cost"]), 6) if r.get("cost") is not None else None
        return {"orders": rows}

    async def _order(oid):
        async with aiosqlite.connect(db.DB_PATH) as c:
            c.row_factory = aiosqlite.Row
            cur = await c.execute("SELECT * FROM orders WHERE order_id=? ORDER BY id DESC LIMIT 1", (str(oid),))
            r = await cur.fetchone()
        if not r:
            raise HTTPException(404, "Order not found")
        return dict(r)

    def _panel_of(o):
        return int(o.get("panel_id") or 0)

    @app.post(P + "/orders/{oid}/check")
    async def o_check(oid: str, _: int = Depends(require_admin)):
        o = await _order(oid)
        if not _panel_of(o):
            raise HTTPException(400, "Order has no provider (manual/old order)")
        d = await _panel_call(_panel_of(o), action="status", order=oid)
        if not isinstance(d, dict) or not d.get("status"):
            raise HTTPException(400, str((d or {}).get("error") or "No status returned"))
        ns = _norm_status(d["status"])
        async with aiosqlite.connect(db.DB_PATH) as c:
            await c.execute("UPDATE orders SET status=?, remains=? WHERE order_id=?", (ns, d.get("remains"), str(oid)))
            await c.commit()
        return {"status": ns, "provider": d}

    @app.post(P + "/orders/{oid}/refill")
    async def o_refill(oid: str, _: int = Depends(require_admin)):
        o = await _order(oid)
        if not _panel_of(o): raise HTTPException(400, "Order has no provider")
        d = await _panel_call(_panel_of(o), action="refill", order=oid)
        if isinstance(d, dict) and d.get("error"): raise HTTPException(400, str(d["error"]))
        return {"ok": True, "provider": d}

    @app.post(P + "/orders/{oid}/cancel")
    async def o_cancel(oid: str, _: int = Depends(require_admin)):
        o = await _order(oid)
        if not _panel_of(o): raise HTTPException(400, "Order has no provider")
        d = await _panel_call(_panel_of(o), action="cancel", orders=oid)
        err = d[0].get("cancel", {}) if isinstance(d, list) and d and isinstance(d[0], dict) else d
        if isinstance(err, dict) and err.get("error"): raise HTTPException(400, str(err["error"]))
        return {"ok": True, "provider": d}

    @app.post(P + "/orders/{oid}/refund")
    async def o_refund(oid: str, b: RefundBody, _: int = Depends(require_admin)):
        """Credit user balance back once. Default amount = full charge (or proportional for Partial)."""
        o = await _order(oid)
        price, done = float(o.get("price") or 0), float(o.get("refunded") or 0)
        qty, rem = int(o.get("quantity") or 0), o.get("remains")
        default = price * (float(rem) / qty) if o.get("status") == "Partial" and rem is not None and qty else price
        amt = round(float(b.amount if b.amount is not None else default) - 0, 6)
        if amt <= 0 or amt + done > price + 1e-9:
            raise HTTPException(400, f"Invalid amount (charged {price:.2f}, already refunded {done:.2f})")
        async with aiosqlite.connect(db.DB_PATH) as c:  # atomic: claim refund first, then credit
            cur = await c.execute("UPDATE orders SET refunded=COALESCE(refunded,0)+? WHERE id=? AND COALESCE(refunded,0)=?", (amt, o["id"], done))
            await c.commit()
            if cur.rowcount != 1:
                raise HTTPException(409, "Order changed, retry")
        await db.add_balance(int(o["user_id"]), amt)
        if done + amt >= price - 1e-9:
            async with aiosqlite.connect(db.DB_PATH) as c:
                await c.execute("UPDATE orders SET status='Canceled' WHERE id=?", (o["id"],)); await c.commit()
        return {"ok": True, "refunded": amt}

    @app.post(P + "/orders/sync-pending")
    async def o_sync(_: int = Depends(require_admin)):
        return {"updated": await _pending_sync(100)}

    # ---------- Dashboard ----------
    @app.get(P + "/dashboard")
    async def dash(_: int = Depends(require_admin)):
        await _migrate()
        async with aiosqlite.connect(db.DB_PATH) as c:
            async def one(sql, *a):
                cur = await c.execute(sql, a); return (await cur.fetchone())[0] or 0
            W = "COALESCE(channel,'bot')='webapp' AND COALESCE(is_deleted,0)=0"
            st = {
                "services_total": await one(f"SELECT COUNT(*) FROM services WHERE {W}"),
                "services_active": await one(f"SELECT COUNT(*) FROM services WHERE {W} AND COALESCE(is_disabled,0)=0"),
                "services_disabled": await one(f"SELECT COUNT(*) FROM services WHERE {W} AND COALESCE(is_disabled,0)=1"),
                "orders_total": await one("SELECT COUNT(*) FROM orders"),
                "orders_pending": await one("SELECT COUNT(*) FROM orders WHERE status IN ('Pending','Processing','In progress')"),
                "orders_completed": await one("SELECT COUNT(*) FROM orders WHERE status='Completed'"),
                "revenue": await one("SELECT SUM(price) FROM orders WHERE status NOT IN ('Canceled','Failed')"),
                "provider_cost": await one("SELECT SUM(cost) FROM orders WHERE cost IS NOT NULL AND status NOT IN ('Canceled','Failed')"),
                "revenue_with_cost": await one("SELECT SUM(price) FROM orders WHERE cost IS NOT NULL AND status NOT IN ('Canceled','Failed')"),
            }
        st["profit"] = round(st["revenue_with_cost"] - st["provider_cost"], 4)
        panels = await db.list_smm_panels()
        provs = await asyncio.gather(*[_provider_info(int(p["id"])) for p in panels])
        return {"stats": st, "providers": list(provs)}
