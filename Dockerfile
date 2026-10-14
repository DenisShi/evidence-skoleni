# syntax=docker/dockerfile:1

# --- build: install workspaces, build the SPA and bundle the API into a single file ---
FROM node:24-alpine AS build
WORKDIR /app

# Manifests first so the dependency layer is cached until package.json / lockfile change.
COPY package.json package-lock.json ./
COPY packages/domain/package.json packages/domain/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --no-audit --no-fund

COPY tsconfig.base.json ./
COPY packages packages
COPY apps apps
RUN npm run build

# --- runtime: plain Node, no node_modules (esbuild bundles all API dependencies) ---
FROM node:24-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000 \
    WEB_DIST_DIR=/app/web \
    # Render mounts secret files here; locally mount the data directory read-only to the same path.
    DATA_DIR=/etc/secrets

COPY --from=build /app/apps/api/dist ./api
COPY --from=build /app/apps/web/dist ./web

USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD wget -qO- "http://127.0.0.1:${PORT}/api/health" > /dev/null || exit 1
CMD ["node", "--enable-source-maps", "api/server.js"]
