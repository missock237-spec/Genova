#!/bin/bash
# ============================================================
# Fluro — Genova's Primary AI Engine (Ollama)
# ============================================================
# This script manages the Fluro (Ollama) server with:
#  - Auto-restart on crash
#  - Health monitoring
#  - Automatic model pulling on first start
#  - Proper signal handling for graceful shutdown
# ============================================================

set -euo pipefail

# Configuration
FLURO_HOST="${FLURO_HOST:-127.0.0.1:11434}"
FLURO_MODELS_DIR="${FLURO_MODELS_DIR:-/home/z/my-project/data/ollama-models}"
FLURO_DEFAULT_MODEL="${FLURO_DEFAULT_MODEL:-qwen2.5:0.5b}"
FLURO_LOG="${FLURO_LOG:-/tmp/fluro-server.log}"
FLURO_PID_FILE="${FLURO_PID_FILE:-/tmp/fluro.pid}"
OLLAMA_BIN="${OLLAMA_BIN:-/home/z/.local/bin/ollama}"
RESTART_DELAY=3
MAX_RESTARTS=10
RESTART_COUNT=0

# Ensure directories exist
mkdir -p "$(dirname "$FLURO_LOG")"
mkdir -p "$FLURO_MODELS_DIR"

# Signal handler for graceful shutdown
shutdown() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Fluro daemon shutting down..." | tee -a "$FLURO_LOG"
    # Kill the ollama process
    if [ -f "$FLURO_PID_FILE" ]; then
        OLDPID=$(cat "$FLURO_PID_FILE" 2>/dev/null || true)
        if [ -n "$OLDPID" ] && kill -0 "$OLDPID" 2>/dev/null; then
            kill "$OLDPID" 2>/dev/null || true
            sleep 2
            kill -9 "$OLDPID" 2>/dev/null || true
        fi
        rm -f "$FLURO_PID_FILE"
    fi
    # Kill any remaining ollama processes
    pkill -f "ollama serve" 2>/dev/null || true
    exit 0
}

trap shutdown SIGTERM SIGINT SIGQUIT

# Wait for Fluro to be healthy
wait_for_healthy() {
    local max_wait=30
    local waited=0
    while [ $waited -lt $max_wait ]; do
        if curl -sf "http://$FLURO_HOST/api/version" > /dev/null 2>&1; then
            return 0
        fi
        sleep 1
        waited=$((waited + 1))
    done
    return 1
}

# Pull default model if not already available
ensure_model_available() {
    if ! curl -sf "http://$FLURO_HOST/api/tags" 2>/dev/null | python3 -c "
import json, sys
try:
    data = json.load(sys.stdin)
    models = [m['name'] for m in data.get('models', [])]
    sys.exit(0 if any('$FLURO_DEFAULT_MODEL' in m for m in models) else 1)
except:
    sys.exit(1)
" 2>/dev/null; then
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] Pulling default model: $FLURO_DEFAULT_MODEL..." | tee -a "$FLURO_LOG"
        curl -sf "http://$FLURO_HOST/api/pull" \
            -H "Content-Type: application/json" \
            -d "{\"name\":\"$FLURO_DEFAULT_MODEL\",\"stream\":false}" \
            --max-time 600 > /dev/null 2>&1 || {
            echo "[$(date '+%Y-%m-%d %H:%M:%S')] WARNING: Failed to pull model $FLURO_DEFAULT_MODEL" | tee -a "$FLURO_LOG"
        }
    fi
}

# Main daemon loop
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Fluro daemon starting..." | tee -a "$FLURO_LOG"
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Host: $FLURO_HOST" | tee -a "$FLURO_LOG"
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Models dir: $FLURO_MODELS_DIR" | tee -a "$FLURO_LOG"
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Default model: $FLURO_DEFAULT_MODEL" | tee -a "$FLURO_LOG"

while [ $RESTART_COUNT -lt $MAX_RESTARTS ]; do
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Starting Fluro (Ollama) server... (attempt $((RESTART_COUNT + 1)))" | tee -a "$FLURO_LOG"

    # Start Ollama server
    OLLAMA_HOST="http://$FLURO_HOST" \
    OLLAMA_MODELS="$FLURO_MODELS_DIR" \
    OLLAMA_ORIGINS="*" \
    OLLAMA_NOHISTORY=true \
        "$OLLAMA_BIN" serve >> "$FLURO_LOG" 2>&1 &
    SERVER_PID=$!
    echo "$SERVER_PID" > "$FLURO_PID_FILE"

    # Wait for server to be healthy
    if wait_for_healthy; then
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] Fluro server is healthy (PID: $SERVER_PID)" | tee -a "$FLURO_LOG"
        RESTART_COUNT=0  # Reset on successful start

        # Ensure default model is available
        ensure_model_available &

        # Wait for the server process to exit
        wait "$SERVER_PID" 2>/dev/null || true
        EXIT_CODE=$?
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] Fluro server exited with code $EXIT_CODE" | tee -a "$FLURO_LOG"
    else
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] Fluro server failed to become healthy" | tee -a "$FLURO_LOG"
        kill "$SERVER_PID" 2>/dev/null || true
    fi

    RESTART_COUNT=$((RESTART_COUNT + 1))
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Restarting in ${RESTART_DELAY}s... (restart #$RESTART_COUNT)" | tee -a "$FLURO_LOG"
    sleep "$RESTART_DELAY"
done

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Fluro daemon: max restarts ($MAX_RESTARTS) reached. Exiting." | tee -a "$FLURO_LOG"
