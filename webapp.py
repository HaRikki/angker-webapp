#!/usr/bin/env python3
"""
HaRikKi Shop — Telegram Mini App backend (FastAPI).

Serves:
  - Static Mini App (miniapp/)
  - REST API under /api/*

Reuses existing database.py, payment_client.py, config.
Run: uvicorn webapp:app --host 0.0.0.0 --port 8000
Or:  python webapp.py
"""
from __future__ import annotations

import asyncio
import hashlib
import logging
import os
import sys
import time
import uuid
from pathlib import Path
from typing import Any, Optional

from fastapi import Depends, FastAPI, Header, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))

from dotenv import load_dotenv
load_dotenv(ROOT / ".env")

import config
from api.auth import get_user_id_from_init_data, validate_init_data
from database import (
    init_db,
    get_user,
    create_or_update_user,
    get_setting,
    set_setting,
    get_platforms,
    get_services,
    get_service,
    get_packages,
    get_package_by_id,
    add_service,
    update_service,
    delete_service,
    list_webapp_services,
    soft_delete_service,
    restore_service,
    set_service_disabled,
    find_service_by_smm_id,
    get_or_create_platform_by_name,
    get_user_orders,
    get_order_by_id,
    save_order,
    deduct_balance,
    add_balance,
    get_user_deposits,
    get_digital_products,
    get_digital_product,
    get_digital_packages,
    get_digital_package,
    get_product_total_stock,
    count_digital_stock,
    get_stock_preview_images,
    reserve_digital_stock,
    save_digital_order,
    get_digital_order,
    get_ticket,
)
from payment_client import create_payment, check_payment

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("webapp")

app = FastAPI(title="HaRikKi Mini App API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

MINIAPP_DIR = ROOT / "miniapp"


# ---------- Auth dependency ----------
async def require_user(
    x_telegram_init_data: Optional[str] = Header(None, alias="X-Telegram-Init-Data"),
    authorization: Optional[str] = Header(None),
) -> int:
    """Extract and validate Telegram user_id from initData header."""
    init_data = x_telegram_init_data
    if not init_data and authorization and authorization.lower().startswith("tma "):
        init_data = authorization[4:].strip()
    if not init_data:
        raise HTTPException(status_code=401, detail="Missing Telegram initData")
    uid = get_user_id_from_init_data(init_data)
    if not uid:
        raise HTTPException(status_code=401, detail="Invalid Telegram initData")
    # Ensure user exists in DB
    user = await get_user(uid)
    if not user:
        data = validate_init_data(init_data) or {}
        u = data.get("user") or {}
        await create_or_update_user(
            uid,
            lang=u.get("language_code") or "km",
            username=u.get("username") or "",
            first_name=u.get("first_name") or "",
        )
    else:
        # light update
        data = validate_init_data(init_data) or {}
        u = data.get("user") or {}
        if u:
            await create_or_update_user(
                uid,
                username=u.get("username"),
                first_name=u.get("first_name"),
            )
    return uid


async def require_admin(user_id: int = Depends(require_user)) -> int:
    """Only bot ADMIN_ID can access Mini App Admin Panel APIs."""
    admin_id = int(getattr(config, "ADMIN_ID", 0) or 0)
    if not admin_id or int(user_id) != admin_id:
        raise HTTPException(status_code=403, detail="Admin only")
    return user_id


def row_to_dict(row) -> dict:
    if row is None:
        return {}
    try:
        return dict(row)
    except Exception:
        return {k: row[k] for k in row.keys()}


# ---------- Models ----------
class OrderCreate(BaseModel):
    package_id: int = 0
    service_id: Optional[int] = None  # for rate-based (no package) orders
    link: str = Field(..., min_length=3, max_length=500)
    quantity: Optional[int] = None  # override if custom; else use package qty


class DepositCreate(BaseModel):
    amount: float = Field(..., gt=0, le=10000)


class DigitalBuy(BaseModel):
    package_id: int
    quantity: int = Field(1, ge=1, le=50)
    payment_method: str = Field("balance", pattern="^(balance|khqr)$")


class TicketCreate(BaseModel):
    category: str = Field(..., min_length=1, max_length=100)
    message: str = Field(..., min_length=3, max_length=2000)


class LangUpdate(BaseModel):
    lang: str = Field(..., pattern="^(km|en)$")


# ---------- Startup ----------
@app.on_event("startup")
async def startup():
    await init_db()
    log.info("HaRikKi Mini App API ready")


# ---------- Health ----------
@app.get("/api/health")
async def health():
    return {"ok": True, "service": "HaRikKi Mini App"}


# ---------- User ----------
@app.get("/api/user")
async def api_user(user_id: int = Depends(require_user)):
    user = await get_user(user_id)
    if not user:
        raise HTTPException(404, "User not found")
    u = row_to_dict(user)
    # Safe fields only
    orders = await get_user_orders(user_id, limit=500)
    active = sum(1 for o in orders if (o["status"] or "").lower() in ("pending", "processing", "in progress", "inprogress"))
    completed = sum(1 for o in orders if (o["status"] or "").lower() in ("completed", "complete", "success"))
    return {
        "user_id": int(user_id),
        "id": int(user_id),
        "username": u.get("username") or "",
        "first_name": u.get("first_name") or "",
        "lang": u.get("lang") or "km",
        "balance": float(u.get("balance") or 0),
        "total_orders": int(u.get("total_orders") or len(orders) or 0),
        "total_spent": float(u.get("total_spent") or 0),
        "active_orders": active,
        "completed_orders": completed,
        "is_banned": bool(u.get("is_banned")),
        "is_admin": int(user_id) == int(getattr(config, "ADMIN_ID", 0) or 0),
    }


@app.post("/api/user/lang")
async def api_set_lang(body: LangUpdate, user_id: int = Depends(require_user)):
    from database import set_lang
    await set_lang(user_id, body.lang)
    return {"ok": True, "lang": body.lang}


# ---------- Services (SMM) ----------
async def _svc_card(sd: dict, source: str = "bot") -> dict:
    """Build one service card for Mini App catalog."""
    pkgs = await get_packages(sd["id"], active_only=True)
    pkg_list = [row_to_dict(pk) for pk in pkgs]
    prices = [float(pk.get("price") or 0) for pk in pkg_list if pk.get("is_active", 1)]
    rate = float(sd.get("selling_price") or sd.get("original_price") or 0)
    min_price = min(prices) if prices else rate
    group = (sd.get("group_name") or "").strip()
    if not group:
        # Bot services: use service name as its own category group
        group = (sd.get("name") or "General").strip() or "General"
    return {
        "id": sd["id"],
        "name": sd.get("name"),
        "key_name": sd.get("key_name"),
        "min_qty": sd.get("min_qty") or 1,
        "max_qty": sd.get("max_qty") or 100000,
        "original_price": rate,
        "min_price": min_price,
        "packages_count": len(pkg_list),
        "packages": pkg_list,
        "source": source,
        "group_name": group,
        "description": (sd.get("description") or "")[:200],
        "avg_time": sd.get("avg_time") or "",
        "refill": sd.get("refill") or "",
    }


@app.get("/api/services")
async def api_services(
    platform: Optional[str] = None,
    q: Optional[str] = None,
    user_id: int = Depends(require_user),
):
    """
    Mini App catalog:
    - Always include Bot services (base)
    - Plus WebApp services Admin added
    - If Admin never added WebApp services → same as Bot
    Platforms with the same display name are merged.
    """
    merged = {}

    async def _ingest(channel: str):
        plats = await get_platforms(channel=channel)
        for p in plats:
            pd = row_to_dict(p)
            if platform:
                if (
                    pd.get("key_name") != platform
                    and str(pd.get("id")) != str(platform)
                    and (pd.get("name") or "").lower() != (platform or "").lower()
                ):
                    continue
            name = (pd.get("name") or "Other").strip() or "Other"
            nk = name.lower()
            if nk not in merged:
                merged[nk] = {
                    "id": pd["id"],
                    "key_name": pd.get("key_name"),
                    "name": name,
                    "emoji": pd.get("emoji") or "",
                    "services": [],
                    "_seen": set(),
                }
            if not merged[nk]["emoji"] and pd.get("emoji"):
                merged[nk]["emoji"] = pd.get("emoji") or ""
            svcs = await get_services(pd["id"], include_deleted=False, include_disabled=False)
            for s in svcs:
                sd = row_to_dict(s)
                # Only services of the Admin-selected active panel
                svc_panel = int(sd.get("panel_id") or 1)
                if svc_panel != active_panel:
                    continue
                sid = int(sd["id"])
                if sid in merged[nk]["_seen"]:
                    continue
                if q:
                    ql = q.lower()
                    if ql not in (sd.get("name") or "").lower() and ql not in (sd.get("key_name") or "").lower():
                        continue
                merged[nk]["_seen"].add(sid)
                merged[nk]["services"].append(await _svc_card(sd, source=channel))

    from database import get_active_smm_panel
    active_panel = await get_active_smm_panel()
    await _ingest("bot")
    await _ingest("webapp")

    result = []
    for item in merged.values():
        if not item["services"]:
            continue
        result.append({
            "id": item["id"],
            "key_name": item["key_name"],
            "name": item["name"],
            "emoji": item["emoji"],
            "services": item["services"],
        })
    result.sort(key=lambda x: (x.get("name") or "").lower())
    return {"platforms": result}


@app.get("/api/service/{service_id}")
async def api_service_detail(service_id: int, user_id: int = Depends(require_user)):
    svc = await get_service(service_id)
    if not svc:
        raise HTTPException(404, "Service not found")
    sd = row_to_dict(svc)
    pkgs = await get_packages(service_id, active_only=True)
    pkg_list = [row_to_dict(p) for p in pkgs]
    rate = float(sd.get("original_price") or 0)
    if not pkg_list and rate > 0:
        pkg_list = [{
            "id": 0,
            "service_id": sd["id"],
            "name": f'{sd.get("name") or "Service"} - 1K = ${rate:.2f}',
            "quantity": 1000,
            "price": rate,
            "is_rate": True,
            "is_active": 1,
            "smm_service_id": str(sd.get("smm_service_id") or sd.get("key_name") or ""),
        }]
    return {
        "id": sd["id"],
        "platform_id": sd.get("platform_id"),
        "name": sd.get("name"),
        "key_name": sd.get("key_name"),
        "smm_service_id": str(sd.get("smm_service_id") or sd.get("key_name") or ""),
        "min_qty": int(sd.get("min_qty") or 1),
        "max_qty": int(sd.get("max_qty") or 100000),
        "original_price": rate,
        "description": sd.get("description") or "",
        "packages": pkg_list,
    }


# ---------- Place SMM Order ----------
async def _call_smm_api(api_smm_id: str, link: str, quantity: int, panel_id: int = 1):
    """Call the selected SMM panel API only (not all keys). Returns (panel_order_id, error_msg)."""
    import httpx
    from database import get_smm_panel_credentials
    api_url, api_key, err = await get_smm_panel_credentials(panel_id)
    if err:
        return None, err
    if not api_smm_id:
        return None, "SMM Service ID missing"
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.post(api_url, data={
                "key": api_key,
                "action": "add",
                "service": api_smm_id,
                "link": link,
                "quantity": quantity,
            })
            data = resp.json() if resp.content else {}
    except Exception as e:
        return None, str(e)
    if "order" in data:
        return str(data["order"]), None
    return None, str(data.get("error") or data or "Unknown error")


async def _notify_order_group(user_id: int, service_name: str, qty: int, total_price: float, order_id: str, link: str):
    """Notify Order Group (same as bot) when Mini App places an order."""
    try:
        og = await get_setting("order_group_id", "")
        if not og:
            return
        u = await get_user(user_id)
        uname = (u.get("username") if u else "") or "—"
        fname = (u.get("first_name") if u else "") or "—"
        text = (
            "🔔 🔑ដំណឹងកុម្មង់ថ្មី (New Order Alert — Mini App)\n"
            "───────────────\n"
            f"👤 អ្នកទិញ: {fname} (@{uname}) ({user_id})\n"
            f"📦 សេវាកម្ម: {service_name}\n"
            f"🔢 ចំនួន: {qty}\n"
            f"💵 តម្លៃ: ${total_price:.2f}\n"
            f"🆔 Order ID: #{order_id}\n"
            f"🔗 តំណភ្ជាប់: {link}\n"
            "──────────────"
        )
        await _tg_api("sendMessage", chat_id=int(og), text=text)
    except Exception as e:
        log.warning("order group notify (miniapp): %s", e)


async def _notify_tiktok_group(
    user_id: int,
    service_name: str,
    link: str,
    qty: int,
    amount: float,
    order_id: str,
    mode_line: str = "",
    auto_note: str = "",
):
    """Notify TikTok Khmer group with admin action buttons (same as bot)."""
    try:
        group_id = await get_setting("tiktok_khmer_group_id", "")
        target = int(group_id) if group_id else int(getattr(config, "ADMIN_ID", 0) or 0)
        if not target:
            return
        u = await get_user(user_id)
        uname = (u.get("username") if u else "") or "—"
        fname = (u.get("first_name") if u else "") or "—"
        caption = (
            "╭━━━ 🆕 ការបញ្ជាទិញថ្មី (Mini App) ━━━╮\n"
            f"👤 Username: @{uname}\n"
            f"🆔 User ID: {user_id}\n"
            f"📛 Name: {fname}\n"
            "━━━━━━━━━━━━━━━\n"
            f"🛍️ កញ្ចប់៖ {service_name}\n"
            f"💵 ចំនួនទឹកប្រាក់៖ ${amount:.2f}\n"
            f"🔢 Qty: {qty}\n"
            f"🆔 Order ID៖ {order_id}\n"
            f"🔗 Link៖ {link}\n"
            f"{mode_line}{auto_note}\n"
            "━━━━━━━━━━━━━━━\n"
            "⏳ សូមពិនិត្យ / គ្រប់គ្រងការបញ្ជាទិញរបស់ User។\n"
            "╰━━━━━━━━━━━━━━╯"
        )
        # Inline buttons must be handled by bot.py (tkdone_ / tkreply_ / tkcancel_)
        reply_markup = {
            "inline_keyboard": [[
                {"text": "✅ រួចរាល់", "callback_data": f"tkdone_{order_id}_{user_id}"},
                {"text": "📝 ឆ្លើយតប", "callback_data": f"tkreply_{order_id}_{user_id}"},
                {"text": "❌ បោះបង់", "callback_data": f"tkcancel_{order_id}_{user_id}"},
            ]]
        }
        await _tg_api("sendMessage", chat_id=target, text=caption, reply_markup=reply_markup)
    except Exception as e:
        log.warning("tiktok group notify: %s", e)


async def _start_tk_qr_order(
    user_id: int,
    user,
    service_name: str,
    link: str,
    qty: int,
    total_price: float,
    is_tk2: bool,
    api_smm_id: str,
):
    """
    tiktok_khmer / tiktok_khmer2 — same as bot:
    Create KHQR → send to Telegram chat → poll → on Success create order + notify group.
    Does NOT deduct balance.
    """
    import json as _json
    import payment_client
    from database import save_deposit, get_user_pending_deposit

    pending = await get_user_pending_deposit(user_id, max_age_seconds=QR_EXPIRE_SECONDS)
    if pending:
        raise HTTPException(
            400,
            "អ្នកមាន QR កំពុងរង់ចាំ។ សូមទូទាត់ ឬរង់ចាំផុតកំណត់ មុនបង្កើតថ្មី។",
        )

    username = ((user or {}).get("username") if user else None) or f"tg{user_id}"
    lang = ((user or {}).get("lang") if user else None) or "km"
    amount = round(float(total_price), 2)

    try:
        pay = await create_payment(amount, username)
    except Exception as e:
        log.exception("TK QR create_payment failed")
        raise HTTPException(500, f"Payment create failed: {e}")

    if not pay or pay.get("error"):
        raise HTTPException(400, pay.get("error") or pay.get("message") or "Payment provider error")

    payment_id = str(pay.get("payment_id") or pay.get("id") or "")
    if not payment_id:
        raise HTTPException(500, "No payment_id from provider")

    qr_string = pay.get("qr_code") or pay.get("qr_string") or pay.get("qr") or ""
    merchant = (pay.get("merchant_name") or "").strip()
    if not merchant or merchant.lower() in ("username_qr", "user"):
        merchant = (await get_setting("bakong_name", "")) or "ABA Merchant"

    qr_path = None
    try:
        if qr_string:
            qr_path = payment_client.generate_receipt_image(qr_string, merchant, amount, payment_id)
        else:
            img_url = pay.get("card_image") or pay.get("qr_image") or ""
            if img_url:
                qr_path = await payment_client.download_card_image(img_url, payment_id)
    except Exception as e:
        log.exception("TK QR image failed")
        raise HTTPException(500, f"QR image failed: {e}")

    if not qr_path:
        raise HTTPException(500, "No QR image available from payment gateway")

    await save_deposit(payment_id, user_id, amount)

    # Store pending TK order meta (polled after pay success)
    meta = {
        "type": "tk_order",
        "user_id": user_id,
        "service_name": service_name,
        "link": link,
        "qty": qty,
        "amount": amount,
        "is_tk2": bool(is_tk2),
        "api_smm_id": api_smm_id or "",
        "created_at": int(time.time()),
    }
    await set_setting(f"tk_pending_{payment_id}", _json.dumps(meta))

    # Send order-specific QR caption to Telegram
    mode_tag = "tiktok_khmer2 · Auto SMM" if is_tk2 else "tiktok_khmer · Manual"
    caption = (
        "════════════════════\n"
        "💳 KHQR PAYMENT (Mini App)\n"
        "════════════════════\n"
        f"🛍️ កញ្ចប់៖ {service_name}\n"
        f"💵 ចំនួនទឹកប្រាក់៖ ${amount:.2f}\n"
        f"🔗 Link៖ {link}\n"
        f"📌 Mode: {mode_tag}\n"
        "════════════════════\n"
        "📱 សូមស្កេន KHQR ខាងលើ ដើម្បីទូទាត់។\n"
        "✅ បន្ទាប់ពីទូទាត់ជោគជ័យ\n"
        "📨 ការបញ្ជាទិញរបស់អ្នកនឹងត្រូវបាន\n"
        "ផ្ញើទៅ Admin ដោយស្វ័យប្រវត្តិ។\n"
        "⏳ ផុតកំណត់ក្នុង៖ 15:00\n"
        "════════════════════"
    )
    try:
        with open(qr_path, "rb") as f:
            await _tg_api(
                "sendPhoto",
                chat_id=user_id,
                caption=caption,
                files={"photo": ("qr.png", f, "image/png")},
            )
    except Exception as e:
        log.exception("send TK QR failed")
        raise HTTPException(500, f"Failed to send QR to Telegram: {e}")

    # Background poll (handles TK order on success)
    asyncio.create_task(_poll_deposit_until_done(payment_id, user_id, amount, lang=lang))

    return {
        "order_id": None,
        "payment_id": payment_id,
        "service_name": service_name,
        "link": link,
        "quantity": qty,
        "price": amount,
        "status": "AwaitingPayment",
        "payment_mode": "qr",
        "message_km": "QR បានផ្ញើទៅ Bot។ សូមស្កេនក្នុង Telegram ដើម្បីទូទាត់។",
        "message_en": "QR sent to Bot. Please scan in Telegram to pay.",
        "note": None,
    }


async def _complete_tk_order_after_pay(payment_id: str, meta: dict):
    """After KHQR Success for tiktok_khmer / tiktok_khmer2 — create order + notify (same as bot)."""
    user_id = int(meta.get("user_id") or 0)
    service_name = meta.get("service_name") or "Service"
    link = meta.get("link") or ""
    qty = int(meta.get("qty") or 0)
    amount = float(meta.get("amount") or 0)
    is_tk2 = bool(meta.get("is_tk2"))
    api_smm_id = str(meta.get("api_smm_id") or "")

    order_id = str(int(time.time()) % 1000000 + 10000)
    auto_note = ""
    if is_tk2 and api_smm_id:
        # Prefer panel stored on pending meta, else default 1
        tk_panel = int(meta.get("panel_id") or 1)
        oid, err = await _call_smm_api(api_smm_id, link, qty, panel_id=tk_panel)
        if oid:
            order_id = oid
            auto_note = f"\n⚡ Auto SMM Order: #{order_id}\n🆔 Panel Service: {api_smm_id} (Panel {tk_panel})"
        else:
            auto_note = f"\n⚠️ Auto SMM failed: {err}\n(Admin please process manually)"

    await save_order(user_id, order_id, service_name, link, amount, quantity=qty, status="Pending")

    if is_tk2 and auto_note.startswith("\n⚡"):
        success_text = (
            "╭━ ✅ ការបញ្ជាទិញបានជោគជ័យ! ━╮\n"
            f"🛍️ កញ្ចប់៖ {service_name}\n"
            f"💵 ចំនួនទឹកប្រាក់៖ ${amount:.2f}\n"
            f"🔗 Link៖ {link}\n"
            f"🆔 Order ID៖ {order_id}\n"
            "━━━━━━━━━━━━━━━━\n"
            "⚡ ប្រព័ន្ធបានបញ្ជាទិញ Auto ទៅ Panel រួចហើយ។\n"
            "📊 ស្ថានភាព order នឹងអាប់ដេតពី Website/API។\n"
            "⏳ សូមរង់ចាំដំណើរការ។\n"
            "╰━━━━━━━━━━━━━━━━╯"
        )
    else:
        success_text = (
            "╭━ ✅ ការបញ្ជាទិញបានជោគជ័យ! ━╮\n"
            f"🛍️ កញ្ចប់៖ {service_name}\n"
            f"💵 ចំនួនទឹកប្រាក់៖ ${amount:.2f}\n"
            f"🔗 Link៖ {link}\n"
            f"🆔 Order ID៖ {order_id}\n"
            "━━━━━━━━━━━━━━━━\n"
            "🙎‍♂️ Admin កំពុងពិនិត្យ និងដំណើរការការបញ្ជាទិញរបស់អ្នក។\n"
            "📝 អ្នកបានបញ្ជាទិញ Boost TikTok Khmer។\n"
            "សូមរង់ចាំការពិនិត្យពី Admin ផ្ទាល់។\n"
            "✅ បន្ទាប់ពី Admin បញ្ជាក់រួច Bot នឹងផ្ញើសារជូនដំណឹងទៅអ្នក។\n"
            "⏳ សូមរង់ចាំប្រហែល 1–24 ម៉ោង។\n"
            "╰━━━━━━━━━━━━━━━━╯"
        )
    try:
        await _tg_api("sendMessage", chat_id=user_id, text=success_text)
    except Exception as e:
        log.warning("tk user success notify: %s", e)

    mode_line = "⚡ Auto SMM (tiktok_khmer2 · Mini App)" if is_tk2 else "⏳ Manual process (tiktok_khmer · Mini App)"
    await _notify_tiktok_group(
        user_id=user_id,
        service_name=service_name,
        link=link,
        qty=qty,
        amount=amount,
        order_id=order_id,
        mode_line=mode_line,
        auto_note=auto_note,
    )
    # clear meta
    try:
        await set_setting(f"tk_pending_{payment_id}", "")
    except Exception:
        pass
    return order_id



async def _place_smm_order_internal(user_id: int, package_id: int, link: str, quantity: Optional[int] = None, service_id: Optional[int] = None):
    """Same logic as bot: resolve package → price → SMM API first → real Order ID → deduct → save.
    package_id=0 + service_id → rate-based custom qty (original_price / 1K).
    """
    pkg = None
    svc = None
    if package_id and int(package_id) > 0:
        pkg = await get_package_by_id(package_id)
        if not pkg:
            raise HTTPException(404, "Package not found")
        pkg = row_to_dict(pkg)
        if not pkg.get("is_active", 1):
            raise HTTPException(400, "Package inactive")
        svc = await get_service(pkg["service_id"])
    elif service_id:
        svc = await get_service(service_id)
        if not svc:
            raise HTTPException(404, "Service not found")
        svc = row_to_dict(svc)
        rate = float(svc.get("original_price") or 0)
        if rate <= 0:
            raise HTTPException(400, "Service has no price (Admin must set Original Price / 1K)")
        pkg = {
            "id": 0,
            "service_id": svc["id"],
            "name": f'{svc.get("name") or "Service"} - 1K = ${rate:.2f}',
            "quantity": 1000,
            "price": rate,
            "is_rate": True,
            "smm_service_id": svc.get("smm_service_id") or svc.get("key_name") or "",
        }
    else:
        raise HTTPException(400, "package_id or service_id required")

    if not svc:
        raise HTTPException(404, "Service not found")
    if not isinstance(svc, dict):
        svc = row_to_dict(svc)

    qty = int(quantity or pkg.get("quantity") or 1)
    min_q = int(svc.get("min_qty") or 1)
    max_q = int(svc.get("max_qty") or 100000)
    if qty < min_q or qty > max_q:
        raise HTTPException(400, f"Quantity must be between {min_q} and {max_q}")

    # Price (same formula as bot / existing miniapp)
    if pkg.get("is_rate") or int(pkg.get("id") or 0) == 0:
        rate = float(svc.get("original_price") or pkg.get("price") or 0)
        total_price = round((qty / 1000.0) * rate, 4)
    else:
        base_qty = int(pkg.get("quantity") or 1) or 1
        unit_price = float(pkg.get("price") or 0) / base_qty
        total_price = round(unit_price * qty, 4)
        if qty == base_qty:
            total_price = float(pkg.get("price") or 0)

    service_name = f"{svc.get('name')} — {pkg.get('name')}"

    # --- Special modes (same as bot): tiktok_khmer / tiktok_khmer1 / tiktok_khmer2 ---
    pkg_smm = str(pkg.get("smm_service_id") or pkg.get("api_smm_id") or "").strip()
    svc_smm = str(svc.get("smm_service_id") or svc.get("key_name") or "").strip()
    pkg_smm_l = pkg_smm.lower()
    svc_smm_l = svc_smm.lower()
    is_tk = svc_smm_l == "tiktok_khmer" or pkg_smm_l == "tiktok_khmer"
    is_tk1 = svc_smm_l == "tiktok_khmer1" or pkg_smm_l == "tiktok_khmer1"
    is_tk2 = (
        svc_smm_l == "tiktok_khmer2"
        or pkg_smm_l == "tiktok_khmer2"
        or pkg_smm_l.startswith("tiktok_khmer2:")
        or svc_smm_l.startswith("tiktok_khmer2:")
    )
    SPECIAL = {"tiktok_khmer", "tiktok_khmer1", "tiktok_khmer2"}

    api_smm_id = ""
    if is_tk2:
        for cand in (pkg_smm, svc_smm):
            if not cand:
                continue
            cl = cand.lower()
            if cl in SPECIAL:
                continue
            if cl.startswith("tiktok_khmer2:") or cl.startswith("tiktok_khmer2|"):
                api_smm_id = cand.split(":", 1)[-1].split("|", 1)[-1].strip()
                break
            if cl not in SPECIAL:
                api_smm_id = cand
                break
    elif not (is_tk or is_tk1):
        api_smm_id = pkg_smm or svc_smm or ""

    user = await get_user(user_id)

    # ========== Path TK QR: tiktok_khmer + tiktok_khmer2 (pay by QR, same as bot) ==========
    # Do NOT use balance — create KHQR, send to Telegram, on paid → order + group notify
    if is_tk or is_tk2:
        return await _start_tk_qr_order(
            user_id=user_id,
            user=user,
            service_name=service_name,
            link=link,
            qty=qty,
            total_price=total_price,
            is_tk2=bool(is_tk2),
            api_smm_id=api_smm_id or "",
        )

    # ========== Path TK1: tiktok_khmer1 (pay by balance, notify group — same as bot) ==========
    if is_tk1:
        bal = float(user["balance"] or 0) if user else 0
        if bal < total_price:
            raise HTTPException(400, f"Insufficient balance. Need ${total_price:.2f}, have ${bal:.2f}")
        order_id = str(int(time.time()) % 1000000 + 10000)
        await deduct_balance(user_id, total_price)
        user2 = await get_user(user_id)
        if float(user2["balance"] or 0) < 0:
            await add_balance(user_id, total_price)
            raise HTTPException(400, "Insufficient balance")
        await save_order(user_id, order_id, service_name, link, total_price, quantity=qty, status="Pending")
        await _notify_tiktok_group(
            user_id=user_id,
            service_name=service_name,
            link=link,
            qty=qty,
            amount=total_price,
            order_id=order_id,
            mode_line="💰 បង់ដោយលុយក្នុងគណនី (tiktok_khmer1 · Mini App)",
            auto_note="",
        )
        try:
            await _tg_api(
                "sendMessage",
                chat_id=user_id,
                text=(
                    "╭━ ✅ ការបញ្ជាទិញបានជោគជ័យ! ━╮\n"
                    f"🛍️ កញ្ចប់៖ {service_name}\n"
                    f"💵 ចំនួនទឹកប្រាក់៖ ${total_price:.2f}\n"
                    f"🔗 Link៖ {link}\n"
                    f"🆔 Order ID៖ {order_id}\n"
                    "━━━━━━━━━━━━━━━━\n"
                    "🙎‍♂️ Admin កំពុងពិនិត្យ និងដំណើរការការបញ្ជាទិញរបស់អ្នក។\n"
                    "📝 អ្នកបានបញ្ជាទិញ Boost TikTok Khmer។\n"
                    "សូមរង់ចាំការពិនិត្យពី Admin ផ្ទាល់។\n"
                    "✅ បន្ទាប់ពី Admin បញ្ជាក់រួច Bot នឹងផ្ញើសារជូនដំណឹងទៅអ្នក។\n"
                    "⏳ សូមរង់ចាំប្រហែល 1–24 ម៉ោង។\n"
                    "╰━━━━━━━━━━━━━━━━╯"
                ),
            )
        except Exception as e:
            log.warning("tk1 user notify: %s", e)
        return {
            "order_id": order_id,
            "service_name": service_name,
            "link": link,
            "quantity": qty,
            "price": total_price,
            "status": "Pending",
            "panel_order_id": None,
            "payment_mode": "balance",
            "note": None,
        }

    # ========== Path A: Normal SMM (same as bot do_confirm_order) ==========
    bal = float(user["balance"] or 0) if user else 0
    if bal < total_price:
        raise HTTPException(400, f"Insufficient balance. Need ${total_price:.2f}, have ${bal:.2f}")

    if api_smm_id and api_smm_id.lower() not in SPECIAL:
        svc_panel = int(svc.get("panel_id") or 1)
        panel_order_id, api_err = await _call_smm_api(api_smm_id, link, qty, panel_id=svc_panel)
        if not panel_order_id:
            raise HTTPException(400, f"SMM API failed (Panel {svc_panel}): {api_err or 'Unknown error'}")
        order_id = panel_order_id
        await deduct_balance(user_id, total_price)
        user2 = await get_user(user_id)
        if float(user2["balance"] or 0) < 0:
            await add_balance(user_id, total_price)
            raise HTTPException(400, "Insufficient balance")
        await save_order(user_id, order_id, service_name, link, total_price, quantity=qty, status="Pending")
        try:
            import smm_admin
            await smm_admin.record_order_meta(order_id, dict(svc), qty, svc_panel)
        except Exception:
            pass
        await _notify_order_group(user_id, service_name, qty, total_price, order_id, link)
        return {
            "order_id": order_id,
            "service_name": service_name,
            "link": link,
            "quantity": qty,
            "price": total_price,
            "status": "Pending",
            "panel_order_id": order_id,
            "payment_mode": "balance",
            "note": None,
        }

    raise HTTPException(400, "SMM Service ID not set for this service (Admin → Manage SMM Services)")


@app.post("/api/order")
async def api_create_order(body: OrderCreate, user_id: int = Depends(require_user)):
    user = await get_user(user_id)
    if user and user["is_banned"]:
        raise HTTPException(403, "Account banned")
    link = (body.link or "").strip()
    if not link.startswith("http") and "t.me" not in link and "@" not in link:
        # allow most targets
        pass
    result = await _place_smm_order_internal(user_id, body.package_id, link, body.quantity, getattr(body, "service_id", None))
    return result


@app.get("/api/orders")
async def api_orders(
    status: Optional[str] = None,
    limit: int = Query(100, ge=1, le=500),
    user_id: int = Depends(require_user),
):
    rows = await get_user_orders(user_id, status=status if status and status != "all" else None, limit=limit)
    out = []
    for r in rows:
        d = row_to_dict(r)
        out.append({
            "order_id": d.get("order_id"),
            "service_name": d.get("service_name"),
            "link": d.get("link"),
            "quantity": d.get("quantity"),
            "price": float(d.get("price") or 0),
            "status": d.get("status"),
            "created_at": d.get("created_at"),
            "start_count": d.get("start_count"),
            "remains": d.get("remains"),
        })
    return {"orders": out}


@app.get("/api/order/{order_id}")
async def api_order_detail(order_id: str, user_id: int = Depends(require_user)):
    row = await get_order_by_id(order_id, user_id=user_id)
    if not row:
        # try digital
        dig = await get_digital_order(order_id)
        if dig and dig["user_id"] == user_id:
            d = row_to_dict(dig)
            return {"type": "digital", **d}
        raise HTTPException(404, "Order not found")
    return {"type": "smm", **row_to_dict(row)}


# ---------- Wallet / Deposit ----------
@app.get("/api/wallet")
async def api_wallet(user_id: int = Depends(require_user)):
    user = await get_user(user_id)
    deposits = await get_user_deposits(user_id, limit=20)
    return {
        "balance": float(user["balance"] or 0) if user else 0,
        "deposits": [row_to_dict(d) for d in deposits],
    }


# QR expire (same as bot)
QR_EXPIRE_SECONDS = 15 * 60


async def _tg_api(method: str, **kwargs):
    """Call Telegram Bot API."""
    import httpx
    token = config.BOT_TOKEN
    if not token:
        raise RuntimeError("BOT_TOKEN not configured")
    url = f"https://api.telegram.org/bot{token}/{method}"
    async with httpx.AsyncClient(timeout=60.0) as client:
        # file upload vs json
        files = kwargs.pop("files", None)
        if files:
            resp = await client.post(url, data=kwargs, files=files)
        else:
            resp = await client.post(url, json=kwargs)
        data = resp.json()
        if not data.get("ok"):
            raise RuntimeError(data.get("description") or str(data))
        return data.get("result")


async def _send_qr_to_telegram(user_id: int, amount: float, payment_id: str, qr_path: str, lang: str = "km"):
    """Send QR photo to user in Telegram chat (same UX as bot Add Funds)."""
    timer0 = "15:00"
    if lang == "en":
        caption = (
            "══════════════════\n"
            "KHQR Payment\n"
            "══════════════════\n"
            f"Amount: ${amount:.2f}\n"
            f"Transaction ID: {payment_id}\n\n"
            "Please scan the KHQR above to complete payment.\n\n"
            "Scan once only\n"
            f"Expires in: {timer0}\n\n"
            "Bot will verify automatically.\n"
            "(Requested from Mini App)"
        )
    else:
        caption = (
            "══════════════════\n"
            "ការទូទាត់តាម KHQR\n"
            "══════════════════\n"
            f"ចំនួនទឹកប្រាក់៖ ${amount:.2f}\n"
            f"លេខប្រតិបត្តិការ៖ {payment_id}\n\n"
            "សូមស្កេន KHQR ខាងលើ\n"
            "ដើម្បីបញ្ចប់ការទូទាត់។\n\n"
            "ស្កេនបានតែ 1 ដង\n"
            f"ផុតកំណត់ក្នុង៖ {timer0}\n\n"
            "Bot នឹងផ្ទៀងផ្ទាត់ដោយស្វ័យប្រវត្តិ។\n"
            "(ស្នើពី Mini App)"
        )
    with open(qr_path, "rb") as f:
        result = await _tg_api(
            "sendPhoto",
            chat_id=user_id,
            caption=caption,
            files={"photo": ("qr.png", f, "image/png")},
        )
    return result


async def _poll_deposit_until_done(payment_id: str, user_id: int, amount: float, lang: str = "km"):
    """Background: poll payment status.
    - Normal deposit → credit balance
    - TK order (tiktok_khmer / tiktok_khmer2) → create order + notify group (no balance credit)
    """
    import json as _json
    from database import update_deposit_status, get_bonus_for_amount, mark_deposit_paid

    start = time.time()
    while time.time() - start < QR_EXPIRE_SECONDS:
        await asyncio.sleep(5)
        try:
            status = await check_payment(payment_id)
        except Exception as e:
            log.warning("miniapp deposit poll error %s: %s", payment_id, e)
            continue
        if status == "Success":
            try:
                import aiosqlite
                async with aiosqlite.connect(config.DB_PATH) as db:
                    db.row_factory = aiosqlite.Row
                    cur = await db.execute("SELECT * FROM deposits WHERE md5=?", (payment_id,))
                    dep = await cur.fetchone()
                if not dep or (dep["status"] or "").lower() == "success":
                    return

                # --- TK order path (QR for tiktok_khmer / tiktok_khmer2) ---
                meta_raw = await get_setting(f"tk_pending_{payment_id}", "")
                meta = None
                if meta_raw:
                    try:
                        meta = _json.loads(meta_raw)
                    except Exception:
                        meta = None
                if meta and meta.get("type") == "tk_order":
                    try:
                        await mark_deposit_paid(payment_id)
                    except Exception:
                        await update_deposit_status(payment_id, "Success")
                    try:
                        await _complete_tk_order_after_pay(payment_id, meta)
                    except Exception as e:
                        log.exception("TK order complete failed: %s", e)
                    return

                # --- Normal deposit: credit balance ---
                bonus = 0.0
                try:
                    bonus = float(await get_bonus_for_amount(amount) or 0)
                except Exception:
                    bonus = 0.0
                await add_balance(user_id, amount + bonus)
                try:
                    await mark_deposit_paid(payment_id)
                except Exception:
                    await update_deposit_status(payment_id, "Success")
                user = await get_user(user_id)
                bal = float(user["balance"] or 0) if user else amount
                if lang == "en":
                    msg = (
                        f"Funds added successfully!\n\n"
                        f"Amount: ${amount:.2f}\n"
                        f"New balance: ${bal:.2f}"
                    )
                else:
                    msg = (
                        f"បញ្ចូលទឹកប្រាក់ជោគជ័យ!\n\n"
                        f"ចំនួន: ${amount:.2f}\n"
                        f"សមតុល្យថ្មី: ${bal:.2f}"
                    )
                try:
                    await _tg_api("sendMessage", chat_id=user_id, text=msg)
                except Exception as e:
                    log.warning("notify credit failed: %s", e)
            except Exception as e:
                log.exception("credit deposit failed: %s", e)
            return
        if status in ("Failed", "Error", "Expired"):
            try:
                await update_deposit_status(payment_id, status)
            except Exception:
                pass
            try:
                await set_setting(f"tk_pending_{payment_id}", "")
            except Exception:
                pass
            return
    try:
        from database import update_deposit_status
        await update_deposit_status(payment_id, "expired")
    except Exception:
        pass
    try:
        await set_setting(f"tk_pending_{payment_id}", "")
    except Exception:
        pass


@app.post("/api/deposit")
async def api_deposit(body: DepositCreate, user_id: int = Depends(require_user)):
    """
    Mini App Add Funds:
    - User picks amount in Mini App and confirms
    - Server creates payment + sends QR photo in Telegram Bot chat
    - Does NOT show/create QR inside the Mini App UI
    """
    from database import (
        save_deposit,
        get_user_pending_deposit,
        get_bonus_for_amount,
    )
    import payment_client

    user = await get_user(user_id)
    if not user:
        raise HTTPException(404, "User not found")
    if user["is_banned"]:
        raise HTTPException(403, "Account banned")

    amount = round(float(body.amount), 2)
    try:
        min_amt = float(await get_setting("khqr_min_amount", "0.10") or "0.10")
    except Exception:
        min_amt = 0.10
    if amount < min_amt:
        raise HTTPException(400, f"Minimum deposit ${min_amt:.2f}")

    # Block if pending QR already exists (same as bot)
    pending = await get_user_pending_deposit(user_id, max_age_seconds=QR_EXPIRE_SECONDS)
    if pending:
        raise HTTPException(
            400,
            "អ្នកមាន QR កំពុងរង់ចាំ។ សូមទូទាត់ ឬរង់ចាំផុតកំណត់ មុនបង្កើតថ្មី។"
            if (user["lang"] or "km") == "km"
            else "You already have a pending QR. Pay or wait for expiry.",
        )

    username = (user["username"] or f"tg{user_id}").strip()
    lang = user["lang"] or "km"

    try:
        pay = await create_payment(amount, username)
    except Exception as e:
        log.exception("create_payment failed")
        raise HTTPException(500, f"Payment create failed: {e}")

    if not pay or pay.get("error"):
        raise HTTPException(400, pay.get("error") or pay.get("message") or "Payment provider error")

    payment_id = str(pay.get("payment_id") or pay.get("id") or "")
    if not payment_id:
        raise HTTPException(500, "No payment_id from provider")

    qr_string = pay.get("qr_code") or pay.get("qr_string") or pay.get("qr") or ""
    merchant = (pay.get("merchant_name") or "").strip()
    if not merchant or merchant.lower() in ("username_qr", "user"):
        merchant = (await get_setting("bakong_name", "")) or "ABA Merchant"

    qr_path = None
    try:
        if qr_string:
            qr_path = payment_client.generate_receipt_image(qr_string, merchant, amount, payment_id)
        else:
            img_url = pay.get("card_image") or pay.get("qr_image") or ""
            if img_url:
                qr_path = await payment_client.download_card_image(img_url, payment_id)
    except Exception as e:
        log.exception("QR image build failed")
        raise HTTPException(500, f"QR image failed: {e}")

    if not qr_path:
        raise HTTPException(500, "No QR image available from payment gateway")

    await save_deposit(payment_id, user_id, amount)

    # Send QR in Telegram chat (not in Mini App)
    try:
        await _send_qr_to_telegram(user_id, amount, payment_id, qr_path, lang=lang)
    except Exception as e:
        log.exception("send QR to telegram failed")
        raise HTTPException(500, f"Failed to send QR to Telegram: {e}")

    # Background auto-check (same role as bot JobQueue)
    asyncio.create_task(_poll_deposit_until_done(payment_id, user_id, amount, lang=lang))

    # Notify pay group (optional)
    try:
        pg = await get_setting("pay_group_id", "")
        if pg:
            uname = user["username"] or "—"
            fname = user["first_name"] or "—"
            await _tg_api(
                "sendMessage",
                chat_id=int(pg),
                text=(
                    "User created QR (Mini App)\n"
                    "────────────────────\n"
                    f"Name: {fname} (@{uname})\n"
                    f"User ID: {user_id}\n"
                    f"Amount: ${amount:.2f}\n"
                    f"Ref: {payment_id}\n"
                    "────────────────────"
                ),
            )
    except Exception as e:
        log.warning("pay group notify: %s", e)

    return {
        "ok": True,
        "payment_id": payment_id,
        "amount": amount,
        "status": "Pending",
        "delivered_via": "telegram",
        "message_km": "QR ត្រូវបានផ្ញើទៅ Telegram chat របស់អ្នក។ សូមបិទ Mini App រួចស្កេន QR ក្នុង Bot។",
        "message_en": "QR was sent to your Telegram chat. Close the Mini App and scan the QR in the Bot.",
    }


@app.get("/api/deposit/{payment_id}/status")
async def api_deposit_status(payment_id: str, user_id: int = Depends(require_user)):
    """Optional status check (credit is handled by background poll + bot)."""
    from database import update_deposit_status, get_bonus_for_amount, mark_deposit_paid
    import aiosqlite

    status = await check_payment(payment_id)
    if status == "Success":
        async with aiosqlite.connect(config.DB_PATH) as db:
            db.row_factory = aiosqlite.Row
            cur = await db.execute("SELECT * FROM deposits WHERE md5=?", (payment_id,))
            dep = await cur.fetchone()
        if dep and dep["user_id"] == user_id and (dep["status"] or "").lower() != "success":
            amount = float(dep["amount"] or 0)
            bonus = 0.0
            try:
                bonus = float(await get_bonus_for_amount(amount) or 0)
            except Exception:
                pass
            await add_balance(user_id, amount + bonus)
            try:
                await mark_deposit_paid(payment_id)
            except Exception:
                await update_deposit_status(payment_id, "Success")
            return {"status": "Success", "amount": amount, "bonus": bonus, "credited": True}
        return {"status": "Success", "credited": False}
    return {"status": status or "Pending"}



# ---------- Telegram media proxy (product images) ----------
@app.get("/api/media")
async def api_media(
    file_id: str = Query(..., min_length=5),
    initData: Optional[str] = Query(None),
    x_telegram_init_data: Optional[str] = Header(None, alias="X-Telegram-Init-Data"),
):
    """Proxy Telegram file by file_id. Auth via header or initData query (for <img src>)."""
    init_data = x_telegram_init_data or initData
    uid = get_user_id_from_init_data(init_data or "") if init_data else None
    if not uid:
        raise HTTPException(401, "Unauthorized")
    import httpx
    from fastapi.responses import StreamingResponse, RedirectResponse
    token = config.BOT_TOKEN
    if not token:
        raise HTTPException(500, "BOT_TOKEN missing")
    async with httpx.AsyncClient(timeout=30.0) as client:
        meta = await client.get(f"https://api.telegram.org/bot{token}/getFile", params={"file_id": file_id})
        data = meta.json()
        if not data.get("ok"):
            raise HTTPException(404, "File not found")
        file_path = (data.get("result") or {}).get("file_path")
        if not file_path:
            raise HTTPException(404, "No file_path")
        url = f"https://api.telegram.org/file/bot{token}/{file_path}"
        # Redirect is simpler; token ends up in URL briefly — better stream
        r = await client.get(url)
        if r.status_code != 200:
            raise HTTPException(404, "Cannot fetch file")
        content_type = r.headers.get("content-type") or "application/octet-stream"
        return StreamingResponse(
            iter([r.content]),
            media_type=content_type,
            headers={"Cache-Control": "private, max-age=3600"},
        )


async def _deliver_digital_to_telegram(
    user_id: int,
    order_id: str,
    package_name: str,
    contents: list,
    file_id: str = "",
    lang: str = "km",
):
    """Send account text + optional file to user via Bot (not Mini App)."""
    def _parse_account(c: str):
        c = (c or "").strip()
        lines = [ln.strip() for ln in c.splitlines() if ln.strip()]
        if len(lines) >= 2:
            return lines[0], lines[1]
        for sep in (":", "|", "/", " "):
            if sep in c:
                parts = c.split(sep, 1)
                return parts[0].strip(), parts[1].strip()
        return c, "—"

    lines_out = []
    for i, c in enumerate(contents, 1):
        user, pwd = _parse_account(c)
        if len(contents) > 1:
            lines_out.append("%d. %s:%s" % (i, user, pwd))
        else:
            lines_out.append("%s:%s" % (user, pwd))
    body = chr(10).join(lines_out)
    msg = (
        "╭〔 ACCOUNT INFORMATION 〕╮"
        + chr(10) + body + chr(10)
        + "╰━━━━━━━━━━━━━━━━╯"
        + chr(10) + "Order: " + str(order_id)
        + chr(10) + str(package_name)
    )
    try:
        await _tg_api("sendMessage", chat_id=user_id, text=msg)
    except Exception as e:
        log.warning("deliver text failed: %s", e)

    if file_id:
        caption = "File for " + str(package_name)
        for method, field in (
            ("sendDocument", "document"),
            ("sendPhoto", "photo"),
            ("sendVideo", "video"),
            ("sendAnimation", "animation"),
        ):
            try:
                kwargs = {"chat_id": user_id, "caption": caption, field: file_id}
                await _tg_api(method, **kwargs)
                break
            except Exception:
                continue

    try:
        if config.ADMIN_ID:
            await _tg_api(
                "sendMessage",
                chat_id=int(config.ADMIN_ID),
                text="Digital Store sold" + chr(10)
                + "Order: " + str(order_id) + chr(10)
                + "User: " + str(user_id) + chr(10)
                + str(package_name),
            )
    except Exception:
        pass


# ---------- Digital Store ----------
@app.get("/api/products")
async def api_products(user_id: int = Depends(require_user)):
    products = await get_digital_products(active_only=True)
    out = []
    for p in products:
        pd = row_to_dict(p)
        stock = await get_product_total_stock(pd["id"])
        pkgs = await get_digital_packages(pd["id"], active_only=True)
        out.append({
            **{k: pd.get(k) for k in ("id", "name", "emoji", "description", "image_file_id", "sort_order")},
            "has_image": bool((pd.get("image_file_id") or "").strip()),
            "stock": stock,
            "packages": [
                {
                    **row_to_dict(pk),
                    "available_stock": await count_digital_stock(pk["id"], available_only=True),
                }
                for pk in pkgs
            ],
        })
    return {"products": out}


@app.get("/api/product/{product_id}")
async def api_product(product_id: int, user_id: int = Depends(require_user)):
    p = await get_digital_product(product_id)
    if not p:
        raise HTTPException(404, "Product not found")
    pd = row_to_dict(p)
    pkgs = await get_digital_packages(product_id, active_only=True)
    pkg_out = []
    for pk in pkgs:
        pkd = row_to_dict(pk)
        previews = await get_stock_preview_images(pk["id"], limit=12)
        pkg_out.append({
            **pkd,
            "available_stock": await count_digital_stock(pk["id"], available_only=True),
            # Preview images only (no credentials / content)
            "stock_images": [p["image_file_id"] for p in previews],
            "has_file": bool((pkd.get("file_id") or "").strip()),
        })
    return {
        **pd,
        "has_image": bool((pd.get("image_file_id") or "").strip()),
        "stock": await get_product_total_stock(product_id),
        "packages": pkg_out,
    }


@app.post("/api/products/buy")
async def api_buy_digital(body: DigitalBuy, user_id: int = Depends(require_user)):
    """
    Digital purchase:
    - payment_method=balance → deduct, deliver account/file via Telegram Bot
    - payment_method=khqr → create QR in Bot chat, poll, deliver via Bot
    Keys/files are NEVER returned to Mini App UI (delivery only in Bot).
    """
    user = await get_user(user_id)
    if not user or user["is_banned"]:
        raise HTTPException(403, "Banned or not found")
    pkg = await get_digital_package(body.package_id)
    if not pkg:
        raise HTTPException(404, "Package not found")
    pkg = row_to_dict(pkg)
    if not pkg.get("is_active", 1):
        raise HTTPException(400, "Package inactive")
    product = await get_digital_product(pkg["product_id"])
    if not product:
        raise HTTPException(404, "Product not found")
    product = row_to_dict(product)

    qty = body.quantity
    avail = await count_digital_stock(body.package_id, available_only=True)
    if avail < qty:
        raise HTTPException(400, f"Only {avail} in stock")

    unit = float(pkg.get("price") or 0)
    total = round(unit * qty, 4)
    lang = (user["lang"] or "km")
    file_id = (pkg.get("file_id") or "").strip()

    # ----- Balance path -----
    if body.payment_method == "balance":
        bal = float(user["balance"] or 0)
        if bal < total:
            raise HTTPException(400, f"Insufficient balance. Need ${total:.2f}")

        order_id = f"DG{int(time.time())}{user_id % 10000}"
        contents = await reserve_digital_stock(body.package_id, qty, user_id, order_id)
        if not contents or len(contents) < qty:
            raise HTTPException(400, "Failed to reserve stock")

        delivered = "\n".join(contents)
        await deduct_balance(user_id, total)
        await save_digital_order(
            order_id,
            user_id,
            body.package_id,
            product.get("name") or "",
            pkg.get("name") or "",
            quantity=qty,
            unit_price=unit,
            total_price=total,
            payment_method="balance",
            status="completed",
            delivered_content=delivered,
        )
        # Deliver only via Telegram Bot
        await _deliver_digital_to_telegram(
            user_id,
            order_id,
            pkg.get("name") or product.get("name") or "order",
            contents,
            file_id=file_id,
            lang=lang,
        )
        return {
            "ok": True,
            "order_id": order_id,
            "product_name": product.get("name"),
            "package_name": pkg.get("name"),
            "quantity": qty,
            "total_price": total,
            "status": "completed",
            "payment_method": "balance",
            "delivered_via": "telegram",
            "delivered_content": delivered,
            "message_km": "ទិញជោគជ័យ! Account បង្ហាញខាងក្រោម និងផ្ញើក្នុង Bot ផង។",
            "message_en": "Purchase successful! Account shown below and also sent in Bot.",
        }

    # ----- KHQR path: QR only in Bot -----
    order_id = f"DG{int(time.time())}{user_id % 10000}"
    username = (user["username"] or f"tg{user_id}").strip()
    try:
        pay = await create_payment(total, username, reference=order_id)
    except Exception as e:
        log.exception("digital KHQR create failed")
        raise HTTPException(500, f"Payment create failed: {e}")

    payment_id = str(pay.get("payment_id") or pay.get("id") or "")
    if not payment_id:
        raise HTTPException(500, "No payment_id")

    qr_string = pay.get("qr_code") or pay.get("qr_string") or pay.get("qr") or ""
    merchant = (pay.get("merchant_name") or "").strip() or (await get_setting("bakong_name", "")) or "ABA Merchant"
    import payment_client
    qr_path = None
    try:
        if qr_string:
            qr_path = payment_client.generate_receipt_image(qr_string, merchant, total, payment_id)
        else:
            img_url = pay.get("card_image") or pay.get("qr_image") or ""
            if img_url:
                qr_path = await payment_client.download_card_image(img_url, payment_id)
    except Exception as e:
        raise HTTPException(500, f"QR image failed: {e}")
    if not qr_path:
        raise HTTPException(500, "No QR image")

    # Save pending digital order (stock reserved after pay success)
    await save_digital_order(
        order_id,
        user_id,
        body.package_id,
        product.get("name") or "",
        pkg.get("name") or "",
        quantity=qty,
        unit_price=unit,
        total_price=total,
        payment_method="khqr",
        status="pending",
        delivered_content="",
    )
    # Link payment ref in deposits table for tracking optional
    from database import save_deposit
    try:
        await save_deposit(payment_id, user_id, total)
    except Exception:
        pass

    try:
        await _send_qr_to_telegram(user_id, total, payment_id, qr_path, lang=lang)
        await _tg_api(
            "sendMessage",
            chat_id=user_id,
            text=(
                f"Digital Store order {order_id}\n"
                f"{pkg.get('name')} x{qty} = ${total:.2f}\n"
                f"សូមស្កេន QR ខាងលើ។ បន្ទាប់ពីបង់រួច Account/File នឹងផ្ញើក្នុង Bot។"
                if lang == "km"
                else f"Digital Store order {order_id}\nScan QR above. After payment, Account/File will be sent in Bot."
            ),
        )
    except Exception as e:
        raise HTTPException(500, f"Failed to send QR to Telegram: {e}")

    async def _poll_digital_khqr():
        from database import update_deposit_status, update_digital_order
        start = time.time()
        while time.time() - start < QR_EXPIRE_SECONDS:
            await asyncio.sleep(5)
            try:
                status = await check_payment(payment_id)
            except Exception:
                continue
            if status == "Success":
                try:
                    await update_deposit_status(payment_id, "Success")
                except Exception:
                    pass
                # reserve + deliver
                contents = await reserve_digital_stock(body.package_id, qty, user_id, order_id)
                if not contents:
                    await update_digital_order(order_id, status="failed")
                    try:
                        await _tg_api("sendMessage", chat_id=user_id, text="Payment OK but stock empty. Contact admin.")
                    except Exception:
                        pass
                    return
                delivered = "\n".join(contents)
                await update_digital_order(
                    order_id,
                    status="completed",
                    delivered_content=delivered,
                    paid_at=int(time.time()),
                )
                await _deliver_digital_to_telegram(
                    user_id,
                    order_id,
                    pkg.get("name") or "order",
                    contents,
                    file_id=file_id,
                    lang=lang,
                )
                return
            if status in ("Failed", "Error", "Expired"):
                await update_digital_order(order_id, status="failed")
                return
        await update_digital_order(order_id, status="expired")
        try:
            await _tg_api("sendMessage", chat_id=user_id, text="KHQR expired. Please try again.")
        except Exception:
            pass

    asyncio.create_task(_poll_digital_khqr())

    return {
        "ok": True,
        "order_id": order_id,
        "payment_id": payment_id,
        "product_name": product.get("name"),
        "package_name": pkg.get("name"),
        "quantity": qty,
        "total_price": total,
        "status": "pending",
        "payment_method": "khqr",
        "delivered_via": "telegram",
        "message_km": "QR ត្រូវបានផ្ញើទៅ Telegram Bot។ សូមស្កេនក្នុង Bot។ បន្ទាប់ពីបង់រួច Account/File នឹងផ្ញើក្នុង Bot។",
        "message_en": "QR was sent to Telegram Bot. Scan in Bot. After payment, Account/File will be sent in Bot.",
    }



@app.get("/api/digital-orders")
async def api_digital_orders(limit: int = 30, user_id: int = Depends(require_user)):
    import aiosqlite
    async with aiosqlite.connect(config.DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cur = await db.execute(
            "SELECT * FROM digital_orders WHERE user_id=? ORDER BY created_at DESC LIMIT ?",
            (user_id, limit),
        )
        rows = await cur.fetchall()
    return {"orders": [row_to_dict(r) for r in rows]}


# ---------- Tickets ----------
@app.get("/api/tickets")
async def api_tickets(user_id: int = Depends(require_user)):
    import aiosqlite
    async with aiosqlite.connect(config.DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cur = await db.execute(
            "SELECT * FROM tickets WHERE user_id=? ORDER BY created_at DESC LIMIT 50",
            (user_id,),
        )
        rows = await cur.fetchall()
    return {"tickets": [row_to_dict(r) for r in rows]}


@app.post("/api/tickets")
async def api_create_ticket(body: TicketCreate, user_id: int = Depends(require_user)):
    user = await get_user(user_id)
    username = (user["username"] if user else "") or ""
    import aiosqlite
    async with aiosqlite.connect(config.DB_PATH) as db:
        cur = await db.execute(
            "INSERT INTO tickets (user_id, username, category, message, status, created_at) VALUES (?,?,?,?,?,?)",
            (user_id, username, body.category, body.message, "open", int(time.time())),
        )
        await db.commit()
        tid = cur.lastrowid
    return {"id": tid, "status": "open"}


@app.get("/api/tickets/{ticket_id}")
async def api_ticket_detail(ticket_id: int, user_id: int = Depends(require_user)):
    t = await get_ticket(ticket_id)
    if not t or t["user_id"] != user_id:
        raise HTTPException(404, "Ticket not found")
    return row_to_dict(t)


# ---------- Mini App Admin (Service WebApp only) ----------
class AdminServiceUpdate(BaseModel):
    name: Optional[str] = None
    original_price: Optional[float] = None
    min_qty: Optional[int] = None
    max_qty: Optional[int] = None
    smm_service_id: Optional[str] = None
    description: Optional[str] = None
    panel_id: Optional[int] = None
    cost_price: Optional[float] = None
    profit_type: Optional[str] = None  # flat | percent
    profit_value: Optional[float] = None
    selling_price: Optional[float] = None
    group_name: Optional[str] = None
    is_disabled: Optional[int] = None
    status: Optional[str] = None


class AdminPlatformCreate(BaseModel):
    name: str
    emoji: str = ""


class AdminServiceCreate(BaseModel):
    platform_id: int
    name: str
    smm_service_id: str = ""
    original_price: float = 0
    min_qty: int = 1
    max_qty: int = 100000
    description: str = ""


@app.get("/api/admin/me")
async def api_admin_me(user_id: int = Depends(require_user)):
    admin_id = int(getattr(config, "ADMIN_ID", 0) or 0)
    is_adm = bool(admin_id and int(user_id) == admin_id)
    return {"is_admin": is_adm, "user_id": int(user_id)}


@app.get("/api/admin/platforms")
async def api_admin_platforms(user_id: int = Depends(require_admin)):
    plats = await get_platforms(channel="webapp")
    out = []
    for p in plats:
        pd = row_to_dict(p)
        svcs = await get_services(pd["id"])
        out.append({
            **{k: pd.get(k) for k in ("id", "name", "emoji", "key_name", "sort_order")},
            "services_count": len(svcs),
        })
    return {"platforms": out}


@app.post("/api/admin/platforms")
async def api_admin_create_platform(body: AdminPlatformCreate, user_id: int = Depends(require_admin)):
    from database import get_or_create_platform_by_name
    name = (body.name or "").strip()
    if not name:
        raise HTTPException(400, "Name required")
    pid = await get_or_create_platform_by_name(name, emoji=(body.emoji or "").strip(), channel="webapp")
    return {"ok": True, "id": pid}


@app.delete("/api/admin/platforms/{platform_id}")
async def api_admin_delete_platform(platform_id: int, user_id: int = Depends(require_admin)):
    from database import delete_platform, get_platforms as gp
    plats = await get_platforms(channel="webapp")
    if not any(int(p["id"]) == int(platform_id) for p in plats):
        raise HTTPException(404, "Platform not found in WebApp")
    await delete_platform(platform_id)
    return {"ok": True}


@app.get("/api/admin/platforms/{platform_id}/services")
async def api_admin_platform_services(platform_id: int, user_id: int = Depends(require_admin)):
    plats = await get_platforms(channel="webapp")
    plat = next((p for p in plats if int(p["id"]) == int(platform_id)), None)
    if not plat:
        raise HTTPException(404, "Platform not found")
    svcs = await get_services(platform_id)
    out = []
    for s in svcs:
        sd = row_to_dict(s)
        out.append({
            "id": sd.get("id"),
            "name": sd.get("name"),
            "smm_service_id": sd.get("smm_service_id") or "",
            "original_price": float(sd.get("original_price") or 0),
            "min_qty": int(sd.get("min_qty") or 1),
            "max_qty": int(sd.get("max_qty") or 100000),
            "description": sd.get("description") or "",
            "platform_id": sd.get("platform_id"),
        })
    return {
        "platform": row_to_dict(plat),
        "services": out,
    }


@app.get("/api/admin/services/{service_id}")
async def api_admin_service(service_id: int, user_id: int = Depends(require_admin)):
    svc = await get_service(service_id)
    if not svc:
        raise HTTPException(404, "Not found")
    sd = row_to_dict(svc)
    if (sd.get("channel") or "bot") != "webapp":
        # allow if platform is webapp
        plats = await get_platforms(channel="webapp")
        pids = {int(p["id"]) for p in plats}
        if int(sd.get("platform_id") or 0) not in pids:
            raise HTTPException(404, "Not a WebApp service")
    return sd


@app.post("/api/admin/services")
async def api_admin_create_service(body: AdminServiceCreate, user_id: int = Depends(require_admin)):
    plats = await get_platforms(channel="webapp")
    if not any(int(p["id"]) == int(body.platform_id) for p in plats):
        raise HTTPException(400, "Platform must be WebApp channel")
    name = (body.name or "").strip()
    if not name:
        raise HTTPException(400, "Name required")
    sid = await add_service(
        body.platform_id,
        key_name=f"wa_{int(time.time()) % 100000}",
        name=name,
        smm_service_id=(body.smm_service_id or "").strip(),
        min_qty=int(body.min_qty or 1),
        max_qty=int(body.max_qty or 100000),
        original_price=float(body.original_price or 0),
        description=(body.description or "").strip(),
        channel="webapp",
    )
    return {"ok": True, "id": sid}


@app.patch("/api/admin/services/{service_id}")
async def api_admin_update_service(
    service_id: int,
    body: AdminServiceUpdate,
    user_id: int = Depends(require_admin),
):
    svc = await get_service(service_id)
    if not svc:
        raise HTTPException(404, "Not found")
    kw = {}
    if body.name is not None:
        kw["name"] = body.name.strip()
    if body.original_price is not None:
        kw["original_price"] = float(body.original_price)
    if body.min_qty is not None:
        kw["min_qty"] = int(body.min_qty)
    if body.max_qty is not None:
        kw["max_qty"] = int(body.max_qty)
    if body.smm_service_id is not None:
        kw["smm_service_id"] = str(body.smm_service_id).strip()
    if body.description is not None:
        kw["description"] = body.description
    if body.panel_id is not None:
        kw["panel_id"] = int(body.panel_id)
    if body.cost_price is not None:
        kw["cost_price"] = float(body.cost_price)
    if body.profit_type is not None:
        kw["profit_type"] = str(body.profit_type)
    if body.profit_value is not None:
        kw["profit_value"] = float(body.profit_value)
    if body.selling_price is not None:
        kw["selling_price"] = float(body.selling_price)
        # keep original_price in sync for catalog display
        if body.original_price is None:
            kw["original_price"] = float(body.selling_price)
    if body.group_name is not None:
        kw["group_name"] = str(body.group_name).strip()
    if body.is_disabled is not None:
        kw["is_disabled"] = 1 if int(body.is_disabled) else 0
    if body.status is not None:
        kw["status"] = str(body.status)
    if kw:
        await update_service(service_id, **kw)
    return {"ok": True}


@app.delete("/api/admin/services/all")
async def api_admin_delete_all_services(
    channel: str = "webapp",
    panel: Optional[int] = None,
    user_id: int = Depends(require_admin),
):
    """Delete ALL services for a channel (bot or webapp). Optional panel filter."""
    from database import delete_all_services
    ch = (channel or "webapp").lower()
    if ch not in ("bot", "webapp"):
        raise HTTPException(400, "channel must be bot or webapp")
    n = await delete_all_services(channel=ch, panel_id=panel, permanent=True)
    return {"ok": True, "deleted": n, "channel": ch}


@app.delete("/api/admin/services/{service_id}")
async def api_admin_delete_service(
    service_id: int,
    permanent: bool = False,
    user_id: int = Depends(require_admin),
):
    svc = await get_service(service_id)
    if not svc:
        raise HTTPException(404, "Not found")
    await delete_service(service_id, permanent=permanent)
    return {"ok": True}


# ---------- Admin Full Service Import ----------
def _mask_key(key: str) -> str:
    k = (key or "").strip()
    if len(k) <= 8:
        return "****" if k else ""
    return k[:4] + "****" + k[-4:]


async def _admin_list_providers():
    """List all SMM panels (dynamic multi-provider) without exposing full keys."""
    from database import list_smm_panels
    panels = await list_smm_panels()
    out = []
    for p in panels:
        url = p.get("url") or ""
        key = p.get("key") or ""
        out.append({
            "id": p["id"],
            "name": p.get("name") or f"Provider {p['id']}",
            "api_url": (url[:60] + ("…" if len(url) > 60 else "")) if url else "",
            "api_key_masked": _mask_key(key),
            "configured": bool(url and key),
        })
    return out


async def _fetch_provider_services(panel: int):
    """Fetch services from panel API. Returns (list, error)."""
    import httpx
    if panel == 1:
        api_url = await get_setting("smm1_url", "") or getattr(config, "SMM_API_URL", None)
        api_key = await get_setting("smm1_key", "") or getattr(config, "SMM_API_KEY", None)
    else:
        api_url = await get_setting(f"smm{panel}_url", "")
        api_key = await get_setting(f"smm{panel}_key", "")
    if not api_url or not api_key:
        return None, "API Connection Failed — URL/KEY not configured"
    try:
        async with httpx.AsyncClient(timeout=90.0) as client:
            resp = await client.post(str(api_url), data={"key": api_key, "action": "services"})
            data = resp.json()
    except httpx.TimeoutException:
        return None, "Provider API Timeout"
    except Exception as e:
        return None, f"API Connection Failed: {e}"
    if isinstance(data, dict) and data.get("error"):
        err = str(data.get("error") or "")
        if "key" in err.lower() or "auth" in err.lower() or "invalid" in err.lower():
            return None, "Invalid API Key"
        return None, err
    if not isinstance(data, list):
        return None, f"Unexpected response: {type(data).__name__}"
    return data, None


# Main platforms for Menu 1 only (API category must not become Menu 1)
_MAIN_PLATFORMS = [
    ("tiktok", "TikTok", "🎵"),
    ("instagram", "Instagram", "📸"),
    ("telegram", "Telegram", "✈️"),
    ("facebook", "Facebook", "📘"),
    ("youtube", "YouTube", "▶️"),
    ("twitter", "Twitter / X", "🐦"),
    ("x.com", "Twitter / X", "🐦"),
    ("spotify", "Spotify", "🎧"),
    ("discord", "Discord", "💬"),
    ("twitch", "Twitch", "🎮"),
    ("linkedin", "LinkedIn", "💼"),
    ("threads", "Threads", "🧵"),
    ("snapchat", "Snapchat", "👻"),
    ("pinterest", "Pinterest", "📌"),
    ("reddit", "Reddit", "🔴"),
    ("whatsapp", "WhatsApp", "💚"),
    ("google", "Google", "🔍"),
    ("soundcloud", "SoundCloud", "🟠"),
    ("vk", "VK", "💙"),
    ("likee", "Likee", "📱"),
]


def _split_platform_and_group(category: str, name: str = "") -> tuple:
    """Menu1=platform · Menu2=group · never promote API category to Menu1."""
    blob = f"{category or ''} {name or ''}".lower()
    cat = (category or "").strip() or "Other"
    for key, label, emoji in _MAIN_PLATFORMS:
        if key in blob or key in cat.lower():
            group = cat
            for part in (label, key, "twitter / x", "twitter"):
                if group.lower().startswith(part.lower()):
                    rest = group[len(part):].strip(" |-–—/:")
                    if rest:
                        group = rest
                    break
            if not group or group.lower() in (label.lower(), key, "other"):
                group = cat if cat.lower() not in (label.lower(), key) else "General"
            return label, emoji, group
    return "Other", "📦", cat


def _normalize_provider_service(raw: dict) -> dict:
    """Map any provider response fields into a standard shape."""
    def g(*keys, default=""):
        for k in keys:
            if k in raw and raw[k] is not None and str(raw[k]).strip() != "":
                return raw[k]
        return default

    sid = str(g("service", "service_id", "id", "serviceId", default="")).strip()
    name = str(g("name", "service_name", "title", default=f"Service {sid}")).strip()
    category = str(g("category", "type", "group", "platform", default="Other")).strip() or "Other"
    platform_name, platform_emoji, group_name = _split_platform_and_group(category, name)
    try:
        rate = float(g("rate", "price", "cost", "rate_per_1000", default=0) or 0)
    except Exception:
        rate = 0.0
    try:
        min_q = int(float(g("min", "minimum", default=1) or 1))
    except Exception:
        min_q = 1
    try:
        max_q = int(float(g("max", "maximum", default=100000) or 100000))
    except Exception:
        max_q = 100000
    if min_q < 1:
        min_q = 1
    if max_q < min_q:
        max_q = min_q
    avg_time = str(g("average_time", "avg_time", "time", "start_time", default=""))
    refill = str(g("refill", default=""))
    cancel = str(g("cancel", default=""))
    dripfeed = str(g("dripfeed", "drip_feed", default=""))
    svc_type = str(g("type", "service_type", default=""))
    desc_bits = []
    for label, val in [
        ("Type", svc_type), ("Avg time", avg_time), ("Refill", refill),
        ("Cancel", cancel), ("Dripfeed", dripfeed),
    ]:
        if val and str(val).strip() not in ("", "None"):
            desc_bits.append(f"{label}: {val}")
    desc_bits.append(f"Panel rate: ${rate:.6f}/1K")
    description = " · ".join(desc_bits)
    return {
        "provider_service_id": sid,
        "name": name,
        "category": category,
        "platform_name": platform_name,
        "platform_emoji": platform_emoji,
        "group_name": group_name,
        "cost_price": rate,
        "min_qty": min_q,
        "max_qty": max_q,
        "avg_time": avg_time,
        "refill": refill,
        "cancel": cancel,
        "dripfeed": dripfeed,
        "svc_type": svc_type,
        "description": description,
        "provider_data": raw,  # keep full original
    }


def _calc_sell(cost: float, profit_type: str, profit_value: float) -> float:
    c = float(cost or 0)
    v = float(profit_value or 0)
    if profit_type == "percent":
        return round(c * (1 + v / 100.0), 6)
    return round(c + v, 6)


@app.get("/api/admin/providers")
async def api_admin_providers(user_id: int = Depends(require_admin)):
    return {"providers": await _admin_list_providers()}


@app.get("/api/admin/full-services/fetch")
async def api_admin_fetch_services(panel: int = 1, user_id: int = Depends(require_admin)):
    """Pull all services from provider (does not save)."""
    raw, err = await _fetch_provider_services(int(panel))
    if err:
        raise HTTPException(400, err)
    normalized = []
    for item in raw or []:
        if not isinstance(item, dict):
            continue
        try:
            n = _normalize_provider_service(item)
            if n["provider_service_id"]:
                normalized.append(n)
        except Exception:
            continue
    # Group by category preserving order
    cats = []
    seen = {}
    for n in normalized:
        cat = n["category"]
        if cat not in seen:
            seen[cat] = len(cats)
            cats.append({"name": cat, "services": []})
        cats[seen[cat]]["services"].append(n)
    return {
        "panel": int(panel),
        "total": len(normalized),
        "categories": cats,
        "services": normalized,
    }


class FullImportBody(BaseModel):
    panel: int = 1
    profit_type: str = "flat"  # flat | percent
    profit_value: float = 0.10
    service_ids: list = Field(default_factory=list)  # provider service IDs to import


@app.post("/api/admin/full-services/import")
async def api_admin_import_services(body: FullImportBody, user_id: int = Depends(require_admin)):
    """Import selected provider services into WebApp catalog with pricing."""
    import json as _json
    profit_type = (body.profit_type or "flat").lower()
    if profit_type not in ("flat", "percent"):
        profit_type = "flat"
    profit_value = float(body.profit_value or 0)
    if profit_value < 0:
        raise HTTPException(400, "សូមកំណត់តម្លៃចំណេញសិន មុនពេល Add Services។")

    ids = [str(x).strip() for x in (body.service_ids or []) if str(x).strip()]
    if not ids:
        raise HTTPException(400, "No services selected")

    raw, err = await _fetch_provider_services(int(body.panel))
    if err:
        raise HTTPException(400, err)

    by_id = {}
    for item in raw or []:
        if not isinstance(item, dict):
            continue
        try:
            n = _normalize_provider_service(item)
            if n["provider_service_id"]:
                by_id[n["provider_service_id"]] = n
        except Exception:
            continue

    stats = {"total_found": len(by_id), "selected": len(ids), "new": 0, "updated": 0, "failed": 0, "errors": []}
    for sid in ids:
        n = by_id.get(sid)
        if not n:
            stats["failed"] += 1
            stats["errors"].append(f"Service {sid} not found on provider")
            continue
        cost = float(n["cost_price"] or 0)
        sell = _calc_sell(cost, profit_type, profit_value)
        if sell <= 0 or (cost > 0 and sell < cost):
            stats["failed"] += 1
            stats["errors"].append(f"{sid}: invalid selling price")
            continue
        if not n["name"] or not n["category"]:
            stats["failed"] += 1
            stats["errors"].append(f"{sid}: missing name/category")
            continue
        try:
            # Menu1 = platform (TikTok…) · Menu2 = group · Menu3 = service name
            plat_label = n.get("platform_name") or "Other"
            plat_emoji = n.get("platform_emoji") or ""
            group_name = (n.get("group_name") or n.get("category") or "General").strip()
            plat_id = await get_or_create_platform_by_name(plat_label, emoji=plat_emoji, channel="webapp")
            pdata = ""
            try:
                pdata = _json.dumps(n.get("provider_data") or {}, ensure_ascii=False)[:8000]
            except Exception:
                pdata = ""
            existing = await find_service_by_smm_id(sid, panel_id=int(body.panel), channel="webapp", include_deleted=True)
            if existing:
                await update_service(
                    existing["id"],
                    name=n["name"],
                    min_qty=n["min_qty"],
                    max_qty=n["max_qty"],
                    description=n["description"],
                    cost_price=cost,
                    profit_type=profit_type,
                    profit_value=profit_value,
                    selling_price=sell,
                    original_price=sell,
                    svc_type=n.get("svc_type") or "",
                    avg_time=n.get("avg_time") or "",
                    refill=str(n.get("refill") or ""),
                    cancel=str(n.get("cancel") or ""),
                    dripfeed=str(n.get("dripfeed") or ""),
                    provider_data=pdata,
                    is_deleted=0,
                    is_disabled=0,
                    status="active",
                    platform_id=plat_id,
                    group_name=group_name,
                )
                stats["updated"] += 1
            else:
                await add_service(
                    plat_id,
                    key_name=f"smm{body.panel}_{sid}",
                    name=n["name"],
                    smm_service_id=sid,
                    min_qty=n["min_qty"],
                    max_qty=n["max_qty"],
                    original_price=sell,
                    panel_id=int(body.panel),
                    description=n["description"],
                    channel="webapp",
                    cost_price=cost,
                    profit_type=profit_type,
                    profit_value=profit_value,
                    selling_price=sell,
                    svc_type=n.get("svc_type") or "",
                    avg_time=n.get("avg_time") or "",
                    refill=str(n.get("refill") or ""),
                    cancel=str(n.get("cancel") or ""),
                    dripfeed=str(n.get("dripfeed") or ""),
                    provider_data=pdata,
                    group_name=group_name,
                )
                stats["new"] += 1
        except Exception as e:
            stats["failed"] += 1
            stats["errors"].append(f"{sid}: {e}")
    return {"ok": True, "stats": stats}


@app.get("/api/admin/full-services")
async def api_admin_list_full_services(
    status: str = "active",
    panel: Optional[int] = None,
    q: str = "",
    user_id: int = Depends(require_admin),
):
    rows = await list_webapp_services(status=status or "active", panel_id=panel, q=q or "")
    out = []
    for r in rows:
        sd = row_to_dict(r)
        out.append({
            "id": sd.get("id"),
            "name": sd.get("name"),
            "smm_service_id": sd.get("smm_service_id"),
            "platform_id": sd.get("platform_id"),
            "panel_id": sd.get("panel_id"),
            "cost_price": float(sd.get("cost_price") or 0),
            "profit_type": sd.get("profit_type") or "flat",
            "profit_value": float(sd.get("profit_value") or 0),
            "selling_price": float(sd.get("selling_price") or sd.get("original_price") or 0),
            "original_price": float(sd.get("original_price") or 0),
            "min_qty": sd.get("min_qty"),
            "max_qty": sd.get("max_qty"),
            "description": sd.get("description") or "",
            "avg_time": sd.get("avg_time") or "",
            "refill": sd.get("refill") or "",
            "is_deleted": int(sd.get("is_deleted") or 0),
            "is_disabled": int(sd.get("is_disabled") or 0),
            "status": sd.get("status") or "active",
        })
    return {"services": out, "count": len(out)}


@app.post("/api/admin/services/{service_id}/disable")
async def api_admin_disable_service(service_id: int, user_id: int = Depends(require_admin)):
    await set_service_disabled(service_id, True)
    return {"ok": True}


@app.post("/api/admin/services/{service_id}/enable")
async def api_admin_enable_service(service_id: int, user_id: int = Depends(require_admin)):
    await set_service_disabled(service_id, False)
    return {"ok": True}


@app.post("/api/admin/services/{service_id}/restore")
async def api_admin_restore_service(service_id: int, user_id: int = Depends(require_admin)):
    await restore_service(service_id)
    return {"ok": True}


# ---------- Static Mini App ----------
_NO_CACHE = {
    "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
    "Pragma": "no-cache",
    "Expires": "0",
}

@app.get("/")
async def index():
    index_file = MINIAPP_DIR / "index.html"
    if index_file.exists():
        return FileResponse(index_file, headers=_NO_CACHE)
    return JSONResponse({"message": "Mini App not built yet. Place files in miniapp/"})


# ---------- Full Admin Panel (users/orders/payments/marketing/SMM/digital/settings) ----------
import admin_api
admin_api.register(app, require_admin, _tg_api)


async def _smm_add_service(panel: int, n: dict, profit_type: str, profit_value: float, sell: float):
    """Create ONE new webapp service from a normalized provider service (caller guarantees no duplicate)."""
    import json as _json
    plat_id = await get_or_create_platform_by_name(n.get("platform_name") or "Other", emoji=n.get("platform_emoji") or "", channel="webapp")
    try:
        pdata = _json.dumps(n.get("provider_data") or {}, ensure_ascii=False)[:8000]
    except Exception:
        pdata = ""
    sid = n["provider_service_id"]
    if await find_service_by_smm_id(sid, panel_id=int(panel), channel="webapp", include_deleted=True):
        return  # never duplicate
    await add_service(
        plat_id, key_name=f"smm{panel}_{sid}", name=n["name"], smm_service_id=sid, min_qty=n["min_qty"], max_qty=n["max_qty"],
        original_price=sell, panel_id=int(panel), description=n["description"], channel="webapp", cost_price=float(n["cost_price"] or 0),
        profit_type=profit_type, profit_value=profit_value, selling_price=sell, svc_type=n.get("svc_type") or "",
        avg_time=n.get("avg_time") or "", refill=str(n.get("refill") or ""), cancel=str(n.get("cancel") or ""),
        dripfeed=str(n.get("dripfeed") or ""), provider_data=pdata, group_name=(n.get("group_name") or n.get("category") or "General"),
    )


import smm_admin
smm_admin.register(app, require_admin, _fetch_provider_services, _normalize_provider_service, _smm_add_service)

# Ensure static dirs exist (empty is OK) so StaticFiles does not crash on startup
if MINIAPP_DIR.exists():
    for sub in ("assets", "css", "js"):
        d = MINIAPP_DIR / sub
        try:
            d.mkdir(parents=True, exist_ok=True)
        except Exception:
            pass
        if d.is_dir():
            try:
                app.mount(f"/{sub}", StaticFiles(directory=str(d)), name=sub)
            except Exception as e:
                print(f"mount /{sub} skip: {e}")


# Catch-all for SPA-style (optional)
@app.get("/{path:path}")
async def spa_fallback(path: str):
    # Don't intercept API
    if path.startswith("api"):
        raise HTTPException(404)
    index_file = MINIAPP_DIR / "index.html"
    if index_file.exists():
        return FileResponse(index_file, headers=_NO_CACHE)
    raise HTTPException(404)


def main():
    import uvicorn
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run("webapp:app", host="0.0.0.0", port=port, reload=False)


if __name__ == "__main__":
    main()


# ---------- Search ----------
@app.get("/api/search")
async def api_search(q: str = "", user_id: int = Depends(require_user)):
    q = (q or "").strip().lower()
    services_out = []
    products_out = []
    if len(q) >= 1:
        try:
            from database import get_digital_products, get_services, get_platforms
            seen_ids = set()
            for ch in ("bot", "webapp"):
                plats = await get_platforms(channel=ch)
                for pl in plats or []:
                    plid = pl["id"] if not isinstance(pl, dict) else pl.get("id")
                    pname = pl["name"] if not isinstance(pl, dict) else pl.get("name")
                    try:
                        svcs = await get_services(plid, include_deleted=False, include_disabled=False)
                    except Exception:
                        continue
                    from database import get_active_smm_panel as _gap
                    _ap = await _gap()
                    for s in svcs or []:
                        sd = row_to_dict(s) if not isinstance(s, dict) else s
                        if int(sd.get("panel_id") or 1) != int(_ap):
                            continue
                        sid = sd.get("id")
                        if sid in seen_ids:
                            continue
                        name = str(sd.get("name") or "").lower()
                        if q in name:
                            seen_ids.add(sid)
                            services_out.append({
                                "id": sid,
                                "name": sd.get("name"),
                                "platform": pname,
                                "type": "service",
                                "source": ch,
                            })
            prods = await get_digital_products(active_only=True)
            for p in prods or []:
                pd = row_to_dict(p) if not isinstance(p, dict) else p
                if q in str(pd.get("name") or "").lower():
                    products_out.append({
                        "id": pd.get("id"),
                        "name": pd.get("name"),
                        "type": "product",
                        "image_file_id": pd.get("image_file_id") or "",
                    })
        except Exception as e:
            log.exception("search error: %s", e)
    return {"q": q, "services": services_out[:40], "products": products_out[:40]}


@app.get("/api/notifications")
async def api_notifications(user_id: int = Depends(require_user)):
    raw = await get_setting("miniapp_notifications", "[]")
    items = []
    try:
        import json
        items = json.loads(raw) if raw else []
        if not isinstance(items, list):
            items = []
    except Exception:
        items = []
    # also surface recent completed digital + smm counts as soft notices
    try:
        user = await get_user(user_id)
        bal = float(user["balance"] or 0) if user else 0
    except Exception:
        bal = 0
    return {"notifications": items[:50], "balance": bal}


# ---------- Promo code (credit bonus from settings JSON) ----------
class PromoBody(BaseModel):
    code: str

@app.post("/api/promo")
async def api_promo(body: PromoBody, user_id: int = Depends(require_user)):
    """
    Promo codes stored in setting promo_codes as JSON list:
    [{"code":"WELCOME","bonus":1.0,"max_uses":100,"used":0,"active":1}]
    One claim per user tracked in promo_claims setting or table-less via user note.
    """
    import json
    code = (body.code or "").strip().upper()
    if not code:
        raise HTTPException(400, "Enter promo code")
    raw = await get_setting("promo_codes", "[]")
    try:
        codes = json.loads(raw) if raw else []
    except Exception:
        codes = []
    entry = None
    for c in codes:
        if str(c.get("code") or "").upper() == code:
            entry = c
            break
    if not entry or not entry.get("active", 1):
        raise HTTPException(400, "Invalid or inactive code")
    max_uses = int(entry.get("max_uses") or 0)
    used = int(entry.get("used") or 0)
    if max_uses and used >= max_uses:
        raise HTTPException(400, "Code fully redeemed")
    bonus = float(entry.get("bonus") or 0)
    if bonus <= 0:
        raise HTTPException(400, "Invalid bonus")
    # per-user claim list
    claims_raw = await get_setting(f"promo_claimed_{user_id}", "[]")
    try:
        claimed = json.loads(claims_raw) if claims_raw else []
    except Exception:
        claimed = []
    if code in claimed:
        raise HTTPException(400, "You already used this code")
    await add_balance(user_id, bonus)
    claimed.append(code)
    from database import set_setting as _ss
    await _ss(f"promo_claimed_{user_id}", json.dumps(claimed))
    entry["used"] = used + 1
    for i, c in enumerate(codes):
        if str(c.get("code") or "").upper() == code:
            codes[i] = entry
            break
    await _ss("promo_codes", json.dumps(codes))
    user = await get_user(user_id)
    return {
        "ok": True,
        "bonus": bonus,
        "balance": float(user["balance"] or 0) if user else 0,
        "message_km": f"បានទទួល bonus ${bonus:.2f}",
        "message_en": f"Received bonus ${bonus:.2f}",
    }


# ---------- Mass order ----------
class MassOrderBody(BaseModel):
    service_id: int
    package_id: int = 0
    quantity: int = 1
    links: list[str]

@app.post("/api/orders/mass")
async def api_mass_order(body: MassOrderBody, user_id: int = Depends(require_user)):
    links = [str(x).strip() for x in (body.links or []) if str(x).strip()]
    if not links:
        raise HTTPException(400, "No links")
    if len(links) > 50:
        raise HTTPException(400, "Max 50 links per batch")
    results = []
    for link in links:
        try:
            # reuse internal place order
            res = await _place_smm_order_internal(
                user_id=user_id,
                package_id=body.package_id,
                link=link,
                quantity=body.quantity,
                service_id=body.service_id,
            )
            results.append({"link": link, "ok": True, "order_id": res.get("order_id"), "price": res.get("price")})
        except HTTPException as he:
            results.append({"link": link, "ok": False, "error": he.detail})
        except Exception as e:
            results.append({"link": link, "ok": False, "error": str(e)})
    ok_n = sum(1 for r in results if r.get("ok"))
    return {"ok": True, "success": ok_n, "failed": len(results) - ok_n, "results": results}


@app.get("/api/digital-orders/{order_id}")
async def api_digital_order_one(order_id: str, user_id: int = Depends(require_user)):
    o = await get_digital_order(order_id)
    if not o:
        raise HTTPException(404, "Not found")
    od = row_to_dict(o)
    if int(od.get("user_id") or 0) != int(user_id):
        raise HTTPException(403, "Forbidden")
    return od

