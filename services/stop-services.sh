#!/bin/bash
echo "Stopping Genova services..."
pkill -f 'baileys/server.js' 2>/dev/null && echo "[baileys] Stopped" || echo "[baileys] Not running"
pkill -f 'ruflo/server.mjs' 2>/dev/null && echo "[ruflo] Stopped" || echo "[ruflo] Not running"
pkill -f 'pocketbase serve' 2>/dev/null && echo "[pocketbase] Stopped" || echo "[pocketbase] Not running"
pkill -f 'n8n start' 2>/dev/null && echo "[n8n] Stopped" || echo "[n8n] Not running"
pkill -f 'speechbrain_api_server' 2>/dev/null && echo "[speechbrain] Stopped" || echo "[speechbrain] Not running"
echo "All services stopped"
