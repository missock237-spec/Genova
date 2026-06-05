#!/bin/bash
cd /home/z/my-project
export DATABASE_URL="postgresql://genova:genova_secret@127.0.0.1:5432/genova"
while true; do
  echo "Starting Next.js at $(date)"
  npx next dev -p 3000 -H 0.0.0.0 2>&1
  echo "Next.js exited with code $?, restarting in 5s..."
  sleep 5
done
