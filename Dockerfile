# Minerva — container image.
#
# Multi-stage: build (tsc → dist/) then a lean runtime with production deps only.
# The runtime serves web/ (static site) + /api on one origin, reading fixtures/ from disk —
# identical behavior to `npm run dev`, fixture-backed by default. Set MINERVA_LIVE=1 (plus the
# DT_* / Gemini env vars, see .env.example) to run the live agent instead.
#
#   docker build -t minerva .
#   docker run --rm -p 8787:8787 minerva                      # fixture demo, no credentials
#   docker run --rm -p 8787:8787 --env-file .env -e MINERVA_LIVE=1 minerva   # live agent

# ---- build stage: compile TypeScript ----
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ---- runtime stage ----
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production \
    PORT=8787

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund \
    # Pre-fetch the Dynatrace MCP server so live mode (`npx -y @dynatrace-oss/dynatrace-mcp-server`)
    # resolves from the image instead of hitting the npm registry at runtime.
    && npm install --no-save --no-audit --no-fund @dynatrace-oss/dynatrace-mcp-server \
    && npm cache clean --force

COPY --from=build /app/dist ./dist
# Static site + recorded fixtures are read from the working directory at runtime.
COPY web ./web
COPY fixtures ./fixtures

# Run as the unprivileged user that ships with the node image.
USER node

EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -qO- http://127.0.0.1:8787/api/health || exit 1

CMD ["node", "dist/index.js"]
