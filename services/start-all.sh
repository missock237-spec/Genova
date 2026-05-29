#!/bin/bash
# Genova AgentOS — Start All Services
set -e

echo "🚀 Starting Genova AgentOS Services..."
echo ""

# 1. Start PostgreSQL
echo "📦 Starting PostgreSQL..."
/home/z/my-project/pg-install/bin/pg_ctl -D /home/z/my-project/data/pg -l /home/z/my-project/data/pg/logfile start 2>/dev/null || true
sleep 2

# 2. Start PocketBase
echo "📦 Starting PocketBase on port 8090..."
cd /home/z/my-project/services/pocketbase
./pocketbase serve --http=0.0.0.0:8090 &
sleep 2

# 3. Start Video API (CogVideo + VideoCrafter)
echo "🎬 Starting Video API on port 8189..."
cd /home/z/my-project/services/video-api
python3 server.py --port 8189 --host 127.0.0.1 &
sleep 2

# 4. Start n8n
echo "🔄 Starting n8n on port 5678..."
cd /home/z/my-project
export N8N_PORT=5678
export N8N_PROTOCOL=http
export N8N_HOST=localhost
export WEBHOOK_URL=http://localhost:5678/
npx n8n start &
sleep 3

# 5. ComfyUI (if model available)
if [ -f "/home/z/my-project/services/comfyui/models/checkpoints/v1-5-pruned-emaonly.safetensors" ]; then
  echo "🎨 Starting ComfyUI on port 8188..."
  cd /home/z/my-project/services/comfyui
  source venv/bin/activate
  python main.py --listen 0.0.0.0 --port 8188 --cpu --disable-xformers &
  sleep 3
else
  echo "⏭️  ComfyUI skipped (no model checkpoint)"
fi

# 6. Start Genova
echo "🤖 Starting Genova AgentOS on port 3000..."
cd /home/z/my-project
npm run dev &

echo ""
echo "✅ All services starting!"
echo ""
echo "   Genova:      http://localhost:3000"
echo "   PocketBase:  http://localhost:8090"
echo "   Video API:   http://localhost:8189"
echo "   ComfyUI:     http://localhost:8188"
echo "   n8n:         http://localhost:5678"
echo "   PostgreSQL:  localhost:5432"
echo ""
