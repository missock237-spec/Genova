#!/bin/bash
# Genova Genova — Stop All Services

echo "🛑 Stopping Genova Genova Services..."

# Stop n8n
pkill -f "n8n start" 2>/dev/null

# Stop ComfyUI
pkill -f "comfyui.*main.py" 2>/dev/null

# Stop PocketBase
pkill -f "pocketbase serve" 2>/dev/null

# Stop PostgreSQL
/home/z/my-project/pg-install/bin/pg_ctl -D /home/z/my-project/data/pg stop 2>/dev/null

# Stop Next.js dev
pkill -f "next dev" 2>/dev/null

echo "✅ All services stopped."
