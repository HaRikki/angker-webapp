"""Mini App Admin API — full Admin Panel features (users, orders, payments, marketing,
SMM panels, digital store, settings). Registered into webapp.py via register(app, ...)."""
from __future__ import annotations
import asyncio
from typing import Any, Optional
from fastapi import Depends, HTTPException
from pydantic import BaseModel
import database as db

# Settings the Mini App may read/write (whitelist — never expose API keys/tokens in GET)
BOOL_SETTINGS = ["maintenance_mode", "test_order_mode", "mini_app_enabled", "aba_enabled",
                 "acleda_enabled", "bakong_app_enabled", "deposit_bonus_enabled",
                 "daily_report_enabled", "auto_refill_enabled", "admin_2fa_enabled"]
TEXT_SETTINGS = ["maintenance_msg", "mini_app_url", "khqr_min_amount", "payment_mode",
                 "bakong_name", "daily_report_hour", "auto_refill_days", "alert_group_id",
                 "smm_balance_alert", "gemini_model"]
SECRET_SETTINGS = ["bakong_dev_token", "bakong_uid", "gemini_api_keys"]  # write-only


def _d(r: Any) -> dict:
    if r is None:
        return {}
    if isinstance(r, dict):
        return r
    try:
        return dict(r)
    except Exception:
        return {"value": str(r)}


def _rows(rows) -> list:
    return [_d(r) for r in (rows or [])]


class BalanceBody(BaseModel):
    mode: str  # add | deduct | set
    amount: float


class BanBody(BaseModel):
    banned: bool


class ReplyBody(BaseModel):
    text: str


class CouponBody(BaseModel):
    code: str
    discount_type: str = "percent"
    discount_value: float
    max_uses: int = 0
    min_order: float = 0


class BonusBody(BaseModel):
    min_amount: float
    max_amount: float
    bonus_amount: float


class BroadcastBody(BaseModel):
    text: str


class SettingBody(BaseModel):
    key: str
    value: str


class ProductBody(BaseModel):
    name: str
    emoji: str = "📦"
    description: str = ""


class StockBody(BaseModel):
    package_id: int
    items: list[str]


class StaffBody(BaseModel):
    user_id: int
    role: str = "staff"
    note: str = ""


def register(app, require_admin, tg_api):
    P = "/api/admin/x"

    # ---------- Overview ----------
    @app.get(P + "/overview")
    async def x_overview(_: int = Depends(require_admin)):
        stats = await db.get_admin_dashboard_stats()
        rev = {}
        for k, s in (("day", 86400), ("week", 604800), ("month", 2592000)):
            try:
                rev[k] = await db.get_revenue_stats(s)
            except Exception:
                rev[k] = None
        return {"stats": _d(stats), "revenue": rev}

    @app.get(P + "/top-users")
    async def x_top(by: str = "spent", _: int = Depends(require_admin)):
        return {"users": _rows(await db.get_top_users(15, by))}

    @app.get(P + "/deposits")
    async def x_deposits(status: Optional[str] = None, _: int = Depends(require_admin)):
        return {"deposits": _rows(await db.get_all_deposits(30, status))}

    # ---------- Users ----------
    @app.get(P + "/banned")
    async def x_banned(_: int = Depends(require_admin)):
        return {"users": _rows(await db.get_banned_users(50))}

    @app.get(P + "/user/{uid}")
    async def x_user(uid: int, _: int = Depends(require_admin)):
        u = await db.get_user(uid)
        if not u:
            raise HTTPException(404, "User not found")
        u = _d(u)
        u["banned"] = bool(await db.is_user_banned(uid))
        return u

    @app.post(P + "/user/{uid}/balance")
    async def x_balance(uid: int, b: BalanceBody, _: int = Depends(require_admin)):
        if not await db.get_user(uid):
            raise HTTPException(404, "User not found")
        if b.amount < 0:
            raise HTTPException(400, "Amount must be >= 0")
        if b.mode == "add":
            await db.add_balance(uid, b.amount)
        elif b.mode == "deduct":
            await db.add_balance(uid, -b.amount)  # no order counters touched
        elif b.mode == "set":
            await db.set_balance(uid, b.amount)
        else:
            raise HTTPException(400, "Bad mode")
        return {"ok": True, "user": _d(await db.get_user(uid))}

    @app.post(P + "/user/{uid}/ban")
    async def x_ban(uid: int, b: BanBody, _: int = Depends(require_admin)):
        ok = await (db.ban_user(uid) if b.banned else db.unban_user(uid))
        if not ok:
            raise HTTPException(404, "User not found")
        return {"ok": True}

    # ---------- Orders & tickets ----------
    @app.get(P + "/orders")
    async def x_orders(status: Optional[str] = None, offset: int = 0, _: int = Depends(require_admin)):
        return {"orders": _rows(await db.get_all_orders(status, 20, offset))}

    @app.get(P + "/order/{oid}")
    async def x_order(oid: str, _: int = Depends(require_admin)):
        o = await db.get_order_by_id(oid)
        if not o:
            raise HTTPException(404, "Order not found")
        return _d(o)

    @app.post(P + "/order/{oid}/refund")
    async def x_refund(oid: str, _: int = Depends(require_admin)):
        o = _d(await db.get_order_by_id(oid))
        if not o:
            raise HTTPException(404, "Order not found")
        if str(o.get("status")) in ("Canceled", "Refunded"):
            raise HTTPException(400, "Already canceled")
        await db.refund_order(oid, o["user_id"], float(o.get("price") or 0))
        return {"ok": True}

    @app.get(P + "/tickets")
    async def x_tickets(_: int = Depends(require_admin)):
        return {"tickets": _rows(await db.get_open_tickets(30))}

    @app.post(P + "/ticket/{tid}/reply")
    async def x_ticket_reply(tid: int, b: ReplyBody, _: int = Depends(require_admin)):
        t = _d(await db.get_ticket(tid))
        if not t:
            raise HTTPException(404, "Ticket not found")
        await db.reply_ticket(tid, b.text)
        try:
            await tg_api("sendMessage", chat_id=int(t["user_id"]), text=f"🎫 Ticket #{tid}\n\n{b.text}")
        except Exception:
            pass
        return {"ok": True}

    # ---------- Marketing ----------
    @app.get(P + "/coupons")
    async def x_coupons(_: int = Depends(require_admin)):
        return {"coupons": _rows(await db.list_coupons())}

    @app.post(P + "/coupons")
    async def x_coupon_add(b: CouponBody, _: int = Depends(require_admin)):
        await db.add_coupon(b.code.strip().upper(), b.discount_type, b.discount_value, b.max_uses, b.min_order, 0)
        return {"ok": True}

    @app.post(P + "/coupons/{cid}/toggle")
    async def x_coupon_toggle(cid: int, active: int, _: int = Depends(require_admin)):
        await db.toggle_coupon(cid, active)
        return {"ok": True}

    @app.delete(P + "/coupons/{cid}")
    async def x_coupon_del(cid: int, _: int = Depends(require_admin)):
        await db.delete_coupon(cid)
        return {"ok": True}

    @app.get(P + "/bonuses")
    async def x_bonuses(_: int = Depends(require_admin)):
        return {"bonuses": _rows(await db.list_deposit_bonuses())}

    @app.post(P + "/bonuses")
    async def x_bonus_add(b: BonusBody, _: int = Depends(require_admin)):
        await db.add_deposit_bonus(b.min_amount, b.max_amount, b.bonus_amount)
        return {"ok": True}

    @app.delete(P + "/bonuses/{bid}")
    async def x_bonus_del(bid: int, _: int = Depends(require_admin)):
        await db.delete_deposit_bonus(bid)
        return {"ok": True}

    @app.post(P + "/broadcast")
    async def x_broadcast(b: BroadcastBody, _: int = Depends(require_admin)):
        text = b.text.strip()
        if not text:
            raise HTTPException(400, "Empty message")
        ids = await db.get_user_ids_for_broadcast()

        async def _run():
            for uid in ids:
                try:
                    await tg_api("sendMessage", chat_id=int(uid), text=text)
                except Exception:
                    pass
                await asyncio.sleep(0.06)
        asyncio.create_task(_run())
        return {"ok": True, "queued": len(ids)}

    # ---------- SMM panels ----------
    @app.get(P + "/smm")
    async def x_smm(_: int = Depends(require_admin)):
        panels = await db.list_smm_panels()
        active = await db.get_active_smm_panel()
        out = []
        for p in panels:
            p = _d(p)
            p.pop("key", None)  # never expose API key
            p["enabled"] = (await db.get_setting(f"smm{p['id']}_enabled", "1")) != "0"
            out.append(p)
        return {"panels": out, "active": active}

    @app.post(P + "/smm/{pid}/active")
    async def x_smm_active(pid: int, _: int = Depends(require_admin)):
        await db.set_active_smm_panel(pid)
        return {"ok": True}

    @app.post(P + "/smm/{pid}/enabled")
    async def x_smm_enabled(pid: int, enabled: int, _: int = Depends(require_admin)):
        await db.set_smm_panel_enabled(pid, bool(enabled))
        return {"ok": True}

    @app.delete(P + "/smm/{pid}")
    async def x_smm_del(pid: int, _: int = Depends(require_admin)):
        await db.delete_smm_panel(pid)
        return {"ok": True}

    # ---------- Digital store ----------
    @app.get(P + "/digital")
    async def x_digital(_: int = Depends(require_admin)):
        out = []
        for p in await db.get_digital_products(False):
            p = _d(p)
            pk = []
            for k in await db.get_digital_packages(p["id"], False):
                k = _d(k)
                k["stock"] = await db.count_digital_stock(k["id"])
                pk.append(k)
            p["packages"] = pk
            out.append(p)
        return {"products": out}

    @app.post(P + "/digital/products")
    async def x_digital_add(b: ProductBody, _: int = Depends(require_admin)):
        pid = await db.add_digital_product(b.name, b.emoji, b.description)
        return {"ok": True, "id": pid}

    @app.delete(P + "/digital/products/{pid}")
    async def x_digital_del(pid: int, _: int = Depends(require_admin)):
        await db.delete_digital_product(pid)
        return {"ok": True}

    @app.post(P + "/digital/stock")
    async def x_stock(b: StockBody, _: int = Depends(require_admin)):
        items = [i.strip() for i in b.items if i.strip()]
        if not items:
            raise HTTPException(400, "No items")
        await db.add_digital_stock(b.package_id, items)
        return {"ok": True, "added": len(items)}

    # ---------- Staff ----------
    @app.get(P + "/staff")
    async def x_staff(_: int = Depends(require_admin)):
        return {"staff": _rows(await db.list_staff())}

    @app.post(P + "/staff")
    async def x_staff_add(b: StaffBody, _: int = Depends(require_admin)):
        await db.add_staff(b.user_id, b.role, b.note)
        return {"ok": True}

    @app.delete(P + "/staff/{uid}")
    async def x_staff_del(uid: int, _: int = Depends(require_admin)):
        await db.remove_staff(uid)
        return {"ok": True}

    # ---------- Settings ----------
    @app.get(P + "/settings")
    async def x_settings_get(_: int = Depends(require_admin)):
        out = {k: (await db.get_setting(k, "0") or "0") for k in BOOL_SETTINGS}
        for k in TEXT_SETTINGS:
            out[k] = await db.get_setting(k, "") or ""
        for k in SECRET_SETTINGS:
            out[k] = "set" if (await db.get_setting(k, "")) else ""
        return {"bool": BOOL_SETTINGS, "text": TEXT_SETTINGS, "secret": SECRET_SETTINGS, "values": out}

    @app.post(P + "/settings")
    async def x_settings_set(b: SettingBody, _: int = Depends(require_admin)):
        if b.key not in BOOL_SETTINGS + TEXT_SETTINGS + SECRET_SETTINGS:
            raise HTTPException(400, "Setting not allowed")
        await db.set_setting(b.key, b.value.strip())
        return {"ok": True}
