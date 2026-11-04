#!/usr/bin/env bash
# Cloudflare Tunnel for angker-smm.ndclub.top
# Set CLOUDFLARE_TUNNEL_TOKEN in panel Variables (from Zero Trust → Tunnels → token)
set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"
CF=""
if command -v cloudflared >/dev/null 2>&1; then CF="$(command -v cloudflared)"
elif [ -x "$ROOT/bin/cloudflared" ]; then CF="$ROOT/bin/cloudflared"
fi
if [ -z "$CF" ]; then
  echo "[tunnel] cloudflared binary not found"
  exit 2
fi
if [ -z "${CLOUDFLARE_TUNNEL_TOKEN:-}" ]; then
  echo "[tunnel] CLOUDFLARE_TUNNEL_TOKEN empty — domain will show Error 1033"
  echo "[tunnel] App still runs on 127.0.0.1:15794"
  exit 2
fi
echo "[tunnel] starting cloudflared → http://127.0.0.1:15794"
exec "$CF" tunnel --no-autoupdate run --token "$CLOUDFLARE_TUNNEL_TOKEN"
