# Dockerfile for FrequencyManager
# ─────────────────────────────────────────────────────────────────────────────
# Three build targets:
#   • `builder`  — compiles TypeScript into dist/ (used by both later stages)
#   • `production` — runs the kernel inside docker-server.js (web dashboard)
#   • `development` — same image but with dev deps installed and source mounted
#
# Build with:   docker build --target <stage> -t frequency-manager:<stage> .
# Run with:     docker compose up <service>
# ─────────────────────────────────────────────────────────────────────────────

# ───────────────────────────── Stage 1 ──────────────────────────────────────
# Builder: install deps (including devDeps for tsc) and compile TypeScript.
FROM node:20-alpine AS builder

WORKDIR /app

# Install all dependencies first for better layer caching.
COPY package*.json ./
RUN npm install

# Copy the rest of the source.
COPY . .

# Compile using the dedicated Docker tsconfig (relaxed strictness + Docker-specific paths).
# WHY a separate tsconfig: The strict path aliases and test setup that the host uses
# don't translate directly into a Docker image. We keep production builds permissive
# so they are robust against minor upstream type churn while still catching real errors.
COPY tsconfig.docker.json ./tsconfig.docker.json
RUN npx tsc -p tsconfig.docker.json

# ───────────────────────────── Stage 2 ──────────────────────────────────────
# Production: minimal runtime image that runs the kernel's web dashboard.
FROM node:20-alpine AS production

WORKDIR /app

# Install only production dependencies.
COPY package*.json ./
RUN npm install --omit=dev && npm install module-alias

# Copy compiled artefacts and helper scripts from the builder.
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/scripts/docker-server.js ./scripts/docker-server.js
COPY --from=builder /app/scripts/docker-entry.test.js ./scripts/docker-entry.test.js
COPY --from=builder /app/package.json ./package.json

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

# Container-level health check: hit the dashboard health endpoint every 30s.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -q -O- http://localhost:3000/api/health >/dev/null || exit 1

CMD ["node", "scripts/docker-server.js"]

# ───────────────────────────── Stage 3 ──────────────────────────────────────
# Development: includes dev deps + the source tree. Designed to be mounted
# over the host source so changes are picked up live.
FROM node:20-alpine AS development

WORKDIR /app

COPY package*.json ./
RUN npm install

# Source is mounted as a volume in docker-compose.yml.
COPY . .

ENV NODE_ENV=development
EXPOSE 3000 5858

CMD ["node", "scripts/docker-server.js"]

# ───────────────────────────── Stage 4 ──────────────────────────────────────
# Test: a throw-away image that only runs typecheck + jest. Used by CI and by
# the `test` service in docker-compose.yml.
FROM node:20-alpine AS test

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# Default command runs the full test pipeline. Override per-service in compose.
CMD ["sh", "-c", "npm run typecheck && npm test"]