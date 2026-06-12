#!/usr/bin/env bash
# PostgreSQL Startup Script — Cross-platform compatible
# Uses relative paths to support both development and production environments.

ROOT_DIR=$(pwd)
PG_BIN="$ROOT_DIR/pg-install/bin"
PG_DATA="$ROOT_DIR/data/pg"
PG_LOG="$PG_DATA/server.log"

if "$PG_BIN/pg_isready" -h localhost -p 5432 -q 2>/dev/null; then
  echo "PostgreSQL is already running on port 5432"
else
  if [ ! -d "$PG_DATA" ]; then
    echo "Initializing PostgreSQL database cluster..."
    mkdir -p "$PG_DATA"
    "$PG_BIN/initdb" -D "$PG_DATA" --auth=trust --encoding=UTF8 --locale=C
  fi
  echo "Starting PostgreSQL..."
  "$PG_BIN/pg_ctl" -D "$PG_DATA" -l "$PG_LOG" -o "-p 5432" start
  sleep 2
fi
