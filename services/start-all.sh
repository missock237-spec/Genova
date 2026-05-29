#!/bin/bash
# Genova AgentOS — Start All Micro-Services
# This script starts all the external services that Genova depends on.

set -e

echo "============================================================"
echo "  Genova AgentOS — Starting Micro-Services"
echo "============================================================"

SERVICES_DIR="/home/z/my-project/services"
LOG_DIR="/home/z/my-project/services/logs"
mkdir -p "$LOG_DIR"

# Function to check if a port is in use
port_in_use() {
  ss -tlnp 2>/dev/null | grep -q ":$1 " || lsof -i ":$1" >/dev/null 2>&1
}

# 1. Start PostgreSQL
echo ""
echo "[1/7] Starting PostgreSQL..."
PG_DIR="/home/z/my-project/pg-install"
if [ -d "$PG_DIR" ]; then
  "$PG_DIR/bin/pg_ctl" -D /home/z/my-project/data/pg -l /home/z/my-project/data/pg/logfile start 2>/dev/null || true
  echo "  → PostgreSQL started"
else
  echo "  → PostgreSQL not found at $PG_DIR, skipping"
fi
sleep 1

# 2. Video API Server (port 8189)
echo ""
echo "[2/7] Starting Video API Server (CogVideo/VideoCrafter) on port 8189..."
if port_in_use 8189; then
  echo "  → Port 8189 already in use, skipping"
else
  cd "$SERVICES_DIR" && python3 video_api_server.py --port 8189 > "$LOG_DIR/video-api.log" 2>&1 &
  echo "  → Started (PID: $!)"
fi

# 3. SpeechBrain API Server (port 8187)
echo ""
echo "[3/7] Starting SpeechBrain API Server on port 8187..."
if port_in_use 8187; then
  echo "  → Port 8187 already in use, skipping"
else
  cd "$SERVICES_DIR" && python3 speechbrain_api_server.py --port 8187 > "$LOG_DIR/speechbrain-api.log" 2>&1 &
  echo "  → Started (PID: $!)"
fi

# 4. PocketBase (port 8090)
echo ""
echo "[4/7] Starting PocketBase on port 8090..."
if port_in_use 8090; then
  echo "  → Port 8090 already in use, skipping"
else
  PB_DIR="$SERVICES_DIR/pocketbase"
  mkdir -p "$PB_DIR/pb_data"
  if [ -f "$PB_DIR/pocketbase" ]; then
    cd "$PB_DIR" && ./pocketbase serve --http=0.0.0.0:8090 > "$LOG_DIR/pocketbase.log" 2>&1 &
    echo "  → Started (PID: $!)"
  else
    echo "  → PocketBase binary not found. Download from https://pocketbase.io/docs/"
    echo "  → Place binary at: $PB_DIR/pocketbase"
  fi
fi

# 5. n8n (port 5678)
echo ""
echo "[5/7] Starting n8n on port 5678..."
if port_in_use 5678; then
  echo "  → Port 5678 already in use, skipping"
else
  if command -v n8n &>/dev/null || [ -f "/home/z/my-project/node_modules/.bin/n8n" ]; then
    cd /home/z/my-project && N8N_PORT=5678 npx n8n start > "$LOG_DIR/n8n.log" 2>&1 &
    echo "  → Started (PID: $!)"
  else
    echo "  → n8n not installed. Install with: npm install -g n8n"
  fi
fi

# 6. ComfyUI (port 8188)
echo ""
echo "[6/7] Starting ComfyUI on port 8188..."
if port_in_use 8188; then
  echo "  → Port 8188 already in use, skipping"
else
  COMFYUI_DIR="/home/z/my-project/upload/ComfyUI-extract/ComfyUI-master"
  if [ -f "$COMFYUI_DIR/main.py" ]; then
    cd "$COMFYUI_DIR" && python3 main.py --listen 0.0.0.0 --port 8188 --cpu --disable-xformers > "$LOG_DIR/comfyui.log" 2>&1 &
    echo "  → Started (PID: $!)"
  else
    echo "  → ComfyUI not found at expected location, skipping"
  fi
fi

# 7. Legacy Video API (subdirectory server)
echo ""
echo "[7/7] Starting Legacy Video API (video-api/server.py) if needed..."
if [ -f "$SERVICES_DIR/video-api/server.py" ]; then
  echo "  → Legacy video-api/server.py exists (use video_api_server.py instead)"
else
  echo "  → No legacy video-api found"
fi

# Wait for services to initialize
echo ""
sleep 3

echo "============================================================"
echo "  All services started! Checking health..."
echo "============================================================"

# Health checks
for service in "8189:Video API" "8187:SpeechBrain" "8090:PocketBase" "5678:n8n" "8188:ComfyUI"; do
  port="${service%%:*}"
  name="${service##*:}"
  if curl -s "http://localhost:$port/health" >/dev/null 2>&1; then
    echo "  [OK] $name (port $port) — HEALTHY"
  else
    if port_in_use "$port"; then
      echo "  [--] $name (port $port) — STARTING (port in use, health check pending)"
    else
      echo "  [XX] $name (port $port) — NOT RESPONDING"
    fi
  fi
done

echo ""
echo "Logs available at: $LOG_DIR/"
echo ""
echo "Service URLs:"
echo "   Genova App:   http://localhost:3000"
echo "   Video API:    http://localhost:8189"
echo "   SpeechBrain:  http://localhost:8187"
echo "   ComfyUI:      http://localhost:8188"
echo "   PocketBase:   http://localhost:8090"
echo "   n8n:          http://localhost:5678"
echo "============================================================"
