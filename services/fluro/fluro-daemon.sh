#!/bin/bash
export OLLAMA_HOST=127.0.0.1:11434
export OLLAMA_MODELS=/home/z/my-project/data/ollama-models
export OLLAMA_ORIGINS="*"
export OLLAMA_NOHISTORY=true
export HOME=/home/z

while true; do
  echo "[$(date)] Starting Fluro (Ollama) server..."
  /home/z/.local/bin/ollama serve 2>&1
  echo "[$(date)] Fluro server exited with code $?. Restarting in 3s..."
  sleep 3
done
