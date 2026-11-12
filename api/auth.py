"""
Telegram WebApp initData validation.
Never trust user_id / balance / prices from the client.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import time
from typing import Any, Optional
from urllib.parse import parse_qsl

import config


def _bot_token() -> str:
    return (config.BOT_TOKEN or "").strip()


def validate_init_data(init_data: str, max_age_seconds: int = 86400) -> Optional[dict[str, Any]]:
    """
    Validate Telegram WebApp initData string.
    Returns parsed data dict on success, None on failure.
    """
    if not init_data or not isinstance(init_data, str):
        return None
    token = _bot_token()
    if not token:
        return None

    try:
        parsed = dict(parse_qsl(init_data, keep_blank_values=True))
    except Exception:
        return None

    received_hash = parsed.pop("hash", None)
    if not received_hash:
        return None

    # Build data-check-string
    data_check_arr = [f"{k}={v}" for k, v in sorted(parsed.items())]
    data_check_string = "\n".join(data_check_arr)

    secret_key = hmac.new(
        b"WebAppData",
        token.encode("utf-8"),
        hashlib.sha256,
    ).digest()
    computed = hmac.new(
        secret_key,
        data_check_string.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()

    if not hmac.compare_digest(computed, received_hash):
        return None

    # Auth date freshness
    auth_date = parsed.get("auth_date")
    if auth_date:
        try:
            if abs(time.time() - int(auth_date)) > max_age_seconds:
                return None
        except (TypeError, ValueError):
            return None

    # Parse user JSON
    user_raw = parsed.get("user")
    if user_raw:
        try:
            parsed["user"] = json.loads(user_raw)
        except Exception:
            return None
    else:
        return None

    return parsed


def get_user_id_from_init_data(init_data: str) -> Optional[int]:
    data = validate_init_data(init_data)
    if not data:
        return None
    user = data.get("user") or {}
    try:
        return int(user.get("id"))
    except (TypeError, ValueError):
        return None
