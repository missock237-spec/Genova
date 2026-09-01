# ============================================================
# Gen3ia - Dockerfile de production (Monorepo)
# Build context: racine du monorepo
# Gestionnaire de paquets : bun (voir bun.lock)
# Inclut la compilation du module Rust agent-safety (napi-rs)
# ============================================================

# ===== STAGE 0 : Rust builder =====
FROM rust:1.97-slim AS rust-builder
WORKDIR /build

# Installer les dépendances système pour napi-rs
RUN apt-get update && apt-get install -y --no-install-recommends \
    pkg-config libssl-dev ca-certificates && \
    apt-get clean

COPY Cargo.toml Cargo.lock* ./
COPY crates/agent-safety ./crates/agent-safety

# Build en release
RUN cargo build --release

# ===== STAGE 1 : Build Node/bun =====
FROM oven/bun:1.3-alpine AS base
RUN apk add --no-cache libc6-compat

FROM base AS builder
WORKDIR /app

COPY package.json bun.lock turbo.json ./
RUN bun install --frozen-lockfile

COPY . .

# Copier le module Rust compilé depuis le stage 0
COPY --from=rust-builder /build/target/release/libagent_safety.so ./crates/agent-safety/agent_safety.node
COPY --from=rust-builder /build/target/release/libagent_safety.so ./packages/agent-safety/agent_safety.node

# Build avec Turborepo
RUN bun run build

# ===== STAGE 2 : Production =====
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copier les fichiers nécessaires depuis le build
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Copier le module Rust compilé
COPY --from=builder /app/crates/agent-safety/agent_safety.node ./crates/agent-safety/agent_safety.node
COPY --from=builder /app/packages/agent-safety/agent_safety.node ./packages/agent-safety/agent_safety.node

# Copier les scripts de validation
COPY --from=builder /app/instrumentation.ts ./instrumentation.ts

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
