# syntax=docker/dockerfile:1

# Node 24 is the current LTS and satisfies the >=22.13 engine requirement.
ARG NODE_VERSION=24-alpine

# ---------------------------------------------------------------- build stage
FROM node:${NODE_VERSION} AS build
WORKDIR /app

RUN corepack enable

# Install with the lockfile alone first, so dependency layers survive source
# edits.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY tsconfig.json ./
COPY src ./src
RUN pnpm build

# Re-resolve to production dependencies only. The dev tree (TypeScript, Vitest,
# Biome) is large and has no business in a runtime image.
RUN pnpm prune --prod

# -------------------------------------------------------------- runtime stage
FROM node:${NODE_VERSION} AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    # Bind all interfaces: the container's own network namespace is the
    # boundary, and the orchestrator decides what is exposed.
    ODOO_MCP_HOST=0.0.0.0 \
    ODOO_MCP_PORT=3000

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./

# The stock `node` user (uid 1000) ships with the image; never run as root.
USER node

EXPOSE 3000

# Liveness only. Readiness (/ready) is for orchestrators that distinguish the
# two — Docker has a single healthcheck, and failing it restarts the container,
# which is the wrong response to a transient Odoo outage.
#
# Uses Node's global fetch rather than adding curl, which keeps a package (and
# its CVE surface) out of the runtime image.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.ODOO_MCP_PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]

ENTRYPOINT ["node", "dist/index.js"]
CMD ["--http"]
