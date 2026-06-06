#!/usr/bin/env bash
# =============================================
# Genova Genova - PostgreSQL Startup Script
# =============================================
# Starts the user-space PostgreSQL instance required
# for the Genova SaaS authentication and data storage.
# =============================================

set -e

PG_BASE="/home/z/.local/pg"
PG_BIN="$PG_BASE/usr/lib/postgresql/17/bin"
PG_DATA="$PG_BASE/data"
PG_LOG="$PG_BASE/logfile"
PG_SOCKET="/tmp"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

info()  { echo -e "${GREEN}[INFO]${NC}  $1"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Check if PostgreSQL is already running
if "$PG_BIN/pg_isready" -h localhost -p 5432 -q 2>/dev/null; then
  info "PostgreSQL is already running on port 5432"
  exit 0
fi

# Initialize database if needed
if [ ! -d "$PG_DATA" ]; then
  info "Initializing PostgreSQL database cluster..."
  "$PG_BIN/initdb" -D "$PG_DATA" --auth=trust --encoding=UTF8 --locale=C
fi

# Ensure configuration is correct
if ! grep -q "listen_addresses = 'localhost'" "$PG_DATA/postgresql.conf" 2>/dev/null; then
  info "Configuring PostgreSQL..."
  echo "listen_addresses = 'localhost'" >> "$PG_DATA/postgresql.conf"
  echo "port = 5432" >> "$PG_DATA/postgresql.conf"
  echo "unix_socket_directories = '$PG_SOCKET'" >> "$PG_DATA/postgresql.conf"

  # Write pg_hba.conf for local development
  cat > "$PG_DATA/pg_hba.conf" << 'EOF'
# TYPE  DATABASE        USER            ADDRESS                 METHOD
local   all             all                                     trust
host    all             all             127.0.0.1/32            trust
host    all             all             ::1/128                 trust
EOF
fi

# Start PostgreSQL
info "Starting PostgreSQL..."
"$PG_BIN/pg_ctl" -D "$PG_DATA" -l "$PG_LOG" start

# Wait for PostgreSQL to be ready
RETRIES=10
while [ $RETRIES -gt 0 ]; do
  if "$PG_BIN/pg_isready" -h localhost -p 5432 -q 2>/dev/null; then
    break
  fi
  RETRIES=$((RETRIES - 1))
  sleep 1
done

if [ $RETRIES -eq 0 ]; then
  error "PostgreSQL failed to start. Check $PG_LOG for details."
  exit 1
fi

info "PostgreSQL is running on port 5432"

# Create the genova user and database if they don't exist
if ! "$PG_BIN/psql" -h localhost -p 5432 -U "$USER" -d postgres -tAc "SELECT 1 FROM pg_roles WHERE rolname='genova'" 2>/dev/null | grep -q 1; then
  info "Creating genova database user..."
  "$PG_BIN/psql" -h localhost -p 5432 -U "$USER" -d postgres -c "CREATE USER genova WITH PASSWORD 'genova_secret' SUPERUSER;" 2>/dev/null
fi

if ! "$PG_BIN/psql" -h localhost -p 5432 -U "$USER" -d postgres -lqt 2>/dev/null | cut -d \| -f 1 | grep -qw genova; then
  info "Creating genova database..."
  "$PG_BIN/psql" -h localhost -p 5432 -U "$USER" -d postgres -c "CREATE DATABASE genova OWNER genova;" 2>/dev/null
  "$PG_BIN/psql" -h localhost -p 5432 -U "$USER" -d postgres -c "GRANT ALL PRIVILEGES ON DATABASE genova TO genova;" 2>/dev/null
fi

info "PostgreSQL is ready. You can now start Genova with: npm run dev"
