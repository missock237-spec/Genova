#!/usr/bin/env bash
# =============================================
# Fluro.IA — Start All Services
# =============================================
# Starts the complete Fluro.IA orchestration stack:
#   1. Ollama (LLM inference, port 11434)
#   2. ComfyUI (image generation, port 8188)
#   3. Video API (video generation, port 8189)
#   4. Baileys (WhatsApp, port 8186)
#   5. Genova SaaS (Next.js, port 3000)
# =============================================

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}=================================${NC}"
echo -e "${GREEN} Fluro.IA — Service Starter${NC}"
echo -e "${GREEN}=================================${NC}"
echo ""

# Configuration
OLLAMA_BIN="${OLLAMA_BIN:-/home/z/.local/bin/ollama}"
OLLAMA_MODELS="${OLLAMA_MODELS:-/home/z/my-project/data/ollama-models}"
OLLAMA_HOST="${OLLAMA_HOST:-0.0.0.0:11434}"
COMFYUI_DIR="${COMFYUI_DIR:-/tmp/my-project/services/comfyui}"
VIDEO_API_DIR="${VIDEO_API_DIR:-/tmp/my-project/services/video-api}"
BAILEYS_DIR="${BAILEYS_DIR:-/home/z/my-project/services/baileys}"

# Track PIDs
PIDS=()

cleanup() {
    echo ""
    echo -e "${YELLOW}Shutting down all Fluro services...${NC}"
    for pid in "${PIDS[@]}"; do
        kill "$pid" 2>/dev/null || true
    done
    wait 2>/dev/null
    echo -e "${GREEN}All Fluro services stopped.${NC}"
    exit 0
}

trap cleanup SIGINT SIGTERM

# Function to check if a port is in use
port_in_use() {
    lsof -i ":$1" >/dev/null 2>&1
}

# Function to wait for a service to be ready
wait_for_service() {
    local name=$1
    local url=$2
    local max_attempts=${3:-30}
    local attempt=0

    while [ $attempt -lt $max_attempts ]; do
        if curl -s "$url" >/dev/null 2>&1; then
            echo -e "${GREEN}$name is ready${NC}"
            return 0
        fi
        attempt=$((attempt + 1))
        sleep 2
    done

    echo -e "${YELLOW}$name did not become ready in time${NC}"
    return 1
}

# =============================================
# 1. Ollama — Fluro.IA LLM Inference
# =============================================
echo -ne "${YELLOW}Starting Ollama (Fluro LLM)...${NC} "

if curl -s http://localhost:11434/api/version >/dev/null 2>&1; then
    echo -e "${YELLOW}already running${NC}"
else
    mkdir -p "$OLLAMA_MODELS"
    OLLAMA_HOST="$OLLAMA_HOST" OLLAMA_MODELS="$OLLAMA_MODELS" \
        nohup "$OLLAMA_BIN" serve > /tmp/fluro-server.log 2>&1 &
    PIDS+=($!)
    sleep 3

    if curl -s http://localhost:11434/api/version >/dev/null 2>&1; then
        echo -e "${GREEN}OK (PID: ${PIDS[-1]})${NC}"

        # Auto-pull default model if not present
        if ! curl -s http://localhost:11434/api/tags | grep -q "qwen2.5:0.5b"; then
            echo -ne "${YELLOW}Pulling default model (qwen2.5:0.5b)...${NC} "
            "$OLLAMA_BIN" pull qwen2.5:0.5b >/dev/null 2>&1 && \
                echo -e "${GREEN}OK${NC}" || echo -e "${RED}FAILED${NC}"
        fi
    else
        echo -e "${RED}FAILED${NC}"
    fi
fi

# =============================================
# 2. ComfyUI — Image Generation
# =============================================
echo -ne "${YELLOW}Starting ComfyUI (Image Gen)...${NC} "

if port_in_use 8188; then
    echo -e "${YELLOW}already running${NC}"
elif [ -d "$COMFYUI_DIR" ] && [ -f "$COMFYUI_DIR/main.py" ]; then
    cd "$COMFYUI_DIR"
    source venv/bin/activate
    nohup python main.py --listen 0.0.0.0 --port 8188 --cpu --disable-xformers \
        > /tmp/comfyui-server.log 2>&1 &
    PIDS+=($!)
    cd - >/dev/null
    echo -e "${GREEN}started (PID: ${PIDS[-1]})${NC}"
    echo -e "  ${YELLOW}Note: ComfyUI takes 2-3 minutes to fully start on CPU${NC}"
else
    echo -e "${RED}NOT FOUND at $COMFYUI_DIR${NC}"
fi

# =============================================
# 3. Video API — Video Generation
# =============================================
echo -ne "${YELLOW}Starting Video API (VideoCrafter/CogVideo)...${NC} "

if port_in_use 8189; then
    echo -e "${YELLOW}already running${NC}"
elif [ -f "$VIDEO_API_DIR/server.py" ]; then
    mkdir -p /home/z/my-project/data/videos /home/z/my-project/data/video-models
    cd "$VIDEO_API_DIR"
    nohup python3 server.py --port 8189 > /tmp/video-server.log 2>&1 &
    PIDS+=($!)
    cd - >/dev/null
    echo -e "${GREEN}started (PID: ${PIDS[-1]})${NC}"
else
    echo -e "${RED}NOT FOUND at $VIDEO_API_DIR${NC}"
fi

# =============================================
# 4. Baileys — WhatsApp Integration
# =============================================
echo -ne "${YELLOW}Starting Baileys (WhatsApp)...${NC} "

if port_in_use 8186; then
    echo -e "${YELLOW}already running${NC}"
elif [ -f "$BAILEYS_DIR/server.js" ]; then
    cd "$BAILEYS_DIR"
    if [ ! -d "node_modules" ]; then
        echo -ne "${YELLOW}installing deps...${NC} "
        npm install --production >/dev/null 2>&1
    fi

    if command -v pm2 >/dev/null 2>&1; then
        pm2 start server.js --name baileys-whatsapp >/dev/null 2>&1
        echo -e "${GREEN}OK (pm2)${NC}"
    else
        nohup node server.js > /tmp/baileys-server.log 2>&1 &
        PIDS+=($!)
        echo -e "${GREEN}OK (PID: ${PIDS[-1]})${NC}"
    fi
    cd - >/dev/null
else
    echo -e "${RED}NOT FOUND at $BAILEYS_DIR${NC}"
fi

# =============================================
# Summary
# =============================================
echo ""
echo -e "${GREEN}=================================${NC}"
echo -e "${GREEN} Fluro.IA Services Started!${NC}"
echo -e "${GREEN}=================================${NC}"
echo ""
echo -e "Service URLs:"
echo -e "  Fluro.IA (Ollama):  ${GREEN}http://localhost:11434${NC}"
echo -e "  ComfyUI (Images):   ${GREEN}http://localhost:8188${NC}"
echo -e "  Video API (Videos): ${GREEN}http://localhost:8189${NC}"
echo -e "  Baileys (WhatsApp): ${GREEN}http://localhost:8186${NC}"
echo -e "  Health Check:       ${GREEN}http://localhost:3000/api/ai/health${NC}"
echo -e "  Service Status:     ${GREEN}http://localhost:3000/api/fluro/services${NC}"
echo -e "  WhatsApp Connect:   ${GREEN}http://localhost:3000/api/fluro/whatsapp${NC}"
echo ""
echo -e "Press ${YELLOW}Ctrl+C${NC} to stop all services"

# Wait for all background processes
wait
