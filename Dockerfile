# ── Stage 1: Build frontend ────────────────────────────────────────────────
FROM node:20-alpine AS frontend-builder

WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install --prefer-offline
COPY frontend/ ./
RUN npm run build

# ── Stage 2: Build backend (compile native modules) ────────────────────────
FROM node:20-alpine AS backend-builder

# Native build deps for better-sqlite3
RUN apk add --no-cache python3 make g++

WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm install --omit=dev
COPY backend/ ./

# ── Stage 3: Production image ──────────────────────────────────────────────
FROM node:20-alpine AS production

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Create non-root user
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001

WORKDIR /app

# Copy backend (with compiled node_modules) from builder stage
COPY --from=backend-builder /app/backend ./backend

# Copy built frontend from stage 1
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# Create data directory and set permissions
RUN mkdir -p /app/data && chown -R nodejs:nodejs /app

USER nodejs

# Data volume (SQLite database persists here)
VOLUME ["/app/data"]

EXPOSE 3000

ENV NODE_ENV=production
ENV PORT=3000
ENV DB_PATH=/app/data/app.db

HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/public/info/healthcheck 2>/dev/null | grep -q "error" || wget -qO- http://localhost:3000/ > /dev/null 2>&1

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "backend/src/index.js"]
