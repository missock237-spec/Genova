#!/usr/bin/env bash
# =============================================
# Genova Genova — Start All Microservices
# =============================================
# Starts all integration microservices for local development.
# For production, use: docker compose up -d
# =============================================

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}=================================${NC}"
echo -e "${GREEN} Genova Genova — Service Starter${NC}"
echo -e "${GREEN}=================================${NC}"
echo ""

# Track PIDs for cleanup
PIDS=()

cleanup() {
    echo ""
    echo -e "${YELLOW}Shutting down all services...${NC}"
    for pid in "${PIDS[@]}"; do
        kill "$pid" 2>/dev/null || true
    done
    wait 2>/dev/null
    echo -e "${GREEN}All services stopped.${NC}"
    exit 0
}

trap cleanup SIGINT SIGTERM

# Function to start a service
start_service() {
    local name=$1
    local port=$2
    local command=$3

    echo -ne "${YELLOW}Starting ${name} on port ${port}...${NC} "
    
    if lsof -i ":${port}" >/dev/null 2>&1; then
        echo -e "${YELLOW}already running (port ${port} in use)${NC}"
        return
    fi

    eval "$command" &
    local pid=$!
    PIDS+=($pid)

    # Wait and check if process is still alive
    sleep 2
    if kill -0 "$pid" 2>/dev/null; then
        echo -e "${GREEN}OK (PID: ${pid})${NC}"
    else
        echo -e "${RED}FAILED${NC}"
    fi
}

# =============================================
# Start Services
# =============================================

# 1. PostgreSQL (user-space installation)
if [ -f "scripts/start-pg.sh" ]; then
    echo -ne "${YELLOW}Starting PostgreSQL...${NC} "
    bash scripts/start-pg.sh >/dev/null 2>&1 && \
        echo -e "${GREEN}OK${NC}" || echo -e "${RED}FAILED${NC}"
elif [ -f "/home/z/.local/pg/usr/lib/postgresql/17/bin/pg_ctl" ]; then
    /home/z/.local/pg/usr/lib/postgresql/17/bin/pg_ctl -D /home/z/.local/pg/data -l /home/z/.local/pg/logfile start 2>/dev/null && \
        echo -e "${GREEN}PostgreSQL: started (user-space)${NC}" || echo -e "${YELLOW}PostgreSQL: may already be running${NC}"
elif command -v pg_ctl >/dev/null 2>&1; then
    echo -e "${YELLOW}PostgreSQL: using system installation${NC}"
else
    echo -e "${RED}PostgreSQL: NOT FOUND. Run 'bash scripts/start-pg.sh' first or install PostgreSQL.${NC}"
fi

# 2. Qdrant (if installed)
if command -v docker >/dev/null 2>&1; then
    echo -ne "${YELLOW}Starting Qdrant via Docker...${NC} "
    if docker ps --format '{{.Names}}' | grep -q 'genova-qdrant' 2>/dev/null; then
        echo -e "${YELLOW}already running${NC}"
    else
        docker run -d --name genova-qdrant -p 6333:6333 -p 6334:6334 qdrant/qdrant:latest >/dev/null 2>&1 && \
            echo -e "${GREEN}OK${NC}" || echo -e "${RED}FAILED (install Docker or run manually)${NC}"
    fi
else
    echo -e "${YELLOW}Qdrant: Docker not available, start manually${NC}"
fi

# 3. PocketBase (if installed)
if [ -f "./pocketbase" ]; then
    start_service "PocketBase" 8090 "./pocketbase serve --http=0.0.0.0:8090"
elif command -v pocketbase >/dev/null 2>&1; then
    start_service "PocketBase" 8090 "pocketbase serve --http=0.0.0.0:8090"
else
    echo -e "${YELLOW}PocketBase: not installed, download from https://pocketbase.io/docs${NC}"
fi

# 4. Baileys WhatsApp Server
if [ -d "./services/baileys" ]; then
    if [ -d "./services/baileys/node_modules" ]; then
        start_service "Baileys WhatsApp" 8186 "cd services/baileys && node server.js"
    else
        echo -ne "${YELLOW}Installing Baileys dependencies...${NC} "
        cd services/baileys && npm install --production >/dev/null 2>&1 && cd ../.. && \
            start_service "Baileys WhatsApp" 8186 "cd services/baileys && node server.js"
    fi
fi

# 5. Ruflo MCP Server
if [ -d "./services/ruflo" ]; then
    start_service "Ruflo MCP" 8190 "cd services/ruflo && node server.js"
fi

# 6. SpeechBrain (if installed)
if [ -f "./services/speechbrain_api_server.py" ]; then
    start_service "SpeechBrain ASR" 8187 "python services/speechbrain_api_server.py"
elif command -v python3 >/dev/null 2>&1 && [ -d "./services/speechbrain" ]; then
    echo -e "${YELLOW}SpeechBrain: install with pip install speechbrain torch${NC}"
fi

# 7. ComfyUI (if installed)
if [ -d "./services/comfyui" ] && [ -f "./services/comfyui/main.py" ]; then
    start_service "ComfyUI" 8188 "cd services/comfyui && python main.py --listen 0.0.0.0 --port 8188"
else
    echo -e "${YELLOW}ComfyUI: requires GPU, install from https://github.com/comfyanonymous/ComfyUI${NC}"
fi

# 8. Video API Server
if [ -f "./services/video_api_server.py" ]; then
    start_service "Video API" 8189 "python services/video_api_server.py"
fi

# 9. n8n (if installed)
if command -v n8n >/dev/null 2>&1; then
    start_service "n8n Workflows" 5678 "n8n start"
elif command -v docker >/dev/null 2>&1; then
    echo -ne "${YELLOW}Starting n8n via Docker...${NC} "
    if docker ps --format '{{.Names}}' | grep -q 'genova-n8n' 2>/dev/null; then
        echo -e "${YELLOW}already running${NC}"
    else
        docker run -d --name genova-n8n -p 5678:5678 -v n8n_data:/home/node/.n8n n8nio/n8n:latest >/dev/null 2>&1 && \
            echo -e "${GREEN}OK${NC}" || echo -e "${RED}FAILED${NC}"
    fi
fi

echo ""
echo -e "${GREEN}=================================${NC}"
echo -e "${GREEN} All services started!${NC}"
echo -e "${GREEN}=================================${NC}"
echo ""
echo -e "Service URLs:"
echo -e "  Genova App:       ${GREEN}http://localhost:3000${NC}"
echo -e "  PostgreSQL:       ${GREEN}localhost:5432${NC}"
echo -e "  Qdrant Vector DB: ${GREEN}http://localhost:6333${NC}"
echo -e "  PocketBase:       ${GREEN}http://localhost:8090${NC}"
echo -e "  Baileys WhatsApp: ${GREEN}http://localhost:8186${NC}"
echo -e "  SpeechBrain ASR:  ${GREEN}http://localhost:8187${NC}"
echo -e "  ComfyUI:          ${GREEN}http://localhost:8188${NC}"
echo -e "  Video API:        ${GREEN}http://localhost:8189${NC}"
echo -e "  Ruflo MCP:        ${GREEN}http://localhost:8190${NC}"
echo -e "  n8n Workflows:    ${GREEN}http://localhost:5678${NC}"
echo ""
echo -e "Press ${YELLOW}Ctrl+C${NC} to stop all services"

# Wait for all background processes
wait
