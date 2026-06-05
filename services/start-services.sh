#!/bin/bash
# Genova AgentOS — Start All Services
# Uses double-fork to fully detach from parent process

LOG_DIR="/tmp/genova-logs"
mkdir -p "$LOG_DIR"

start_detached() {
  local name=$1
  local command=$2
  local workdir=$3
  local logfile="$LOG_DIR/${name}.log"
  
  # Double fork to fully detach from parent
  (cd "$workdir" && nohup $command > "$logfile" 2>&1 &)
  
  echo "[$name] Started"
}

# 1. Baileys WhatsApp
start_detached "baileys" "node server.js" "/home/z/my-project/services/baileys"

sleep 1

# 2. Ruflo MCP
start_detached "ruflo" "node server.mjs" "/home/z/my-project/services/ruflo"

sleep 1

# 3. PocketBase
start_detached "pocketbase" "/home/z/my-project/services/pocketbase/pocketbase serve --http=0.0.0.0:8090" "/home/z/my-project/services/pocketbase"

sleep 1

# 4. n8n
export N8N_BASIC_AUTH_ACTIVE=true
export N8N_BASIC_AUTH_USER=admin
export N8N_BASIC_AUTH_PASSWORD=genova_admin
export N8N_PORT=5678
export WEBHOOK_URL=http://localhost:5678/
start_detached "n8n" "/home/z/.npm-global/bin/n8n start" "/home/z/my-project/services"

sleep 1

# 5. SpeechBrain
start_detached "speechbrain" "python3 /home/z/my-project/services/speechbrain_api_server.py" "/home/z/my-project/services"

echo "All services started"
