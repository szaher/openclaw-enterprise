# Build stage — compile all enterprise plugins
FROM node:22-alpine AS builder

RUN corepack enable pnpm

WORKDIR /workspace

# Cache dependencies
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY plugins/shared/package.json plugins/shared/
COPY plugins/policy-engine/package.json plugins/policy-engine/
COPY plugins/audit-enterprise/package.json plugins/audit-enterprise/
COPY plugins/auth-enterprise/package.json plugins/auth-enterprise/
COPY plugins/connector-gmail/package.json plugins/connector-gmail/
COPY plugins/connector-gcal/package.json plugins/connector-gcal/
COPY plugins/connector-jira/package.json plugins/connector-jira/
COPY plugins/connector-github/package.json plugins/connector-github/
COPY plugins/connector-gdrive/package.json plugins/connector-gdrive/
COPY plugins/task-intelligence/package.json plugins/task-intelligence/
COPY plugins/auto-response/package.json plugins/auto-response/
COPY plugins/work-tracking/package.json plugins/work-tracking/
COPY plugins/ocip-protocol/package.json plugins/ocip-protocol/
COPY plugins/org-intelligence/package.json plugins/org-intelligence/
COPY plugins/visualization/package.json plugins/visualization/

RUN pnpm install --frozen-lockfile

# Copy source and build
COPY tsconfig.base.json tsconfig.json ./
COPY plugins/ plugins/

RUN pnpm -r run build

# Prune devDependencies for production
RUN pnpm prune --prod

# Runtime stage
FROM node:22-alpine

LABEL org.opencontainers.image.source="https://github.com/szaher/openclaw-enterprise"
LABEL org.opencontainers.image.description="OpenClaw Enterprise Gateway with enterprise plugins"
LABEL org.opencontainers.image.licenses="Apache-2.0"

RUN corepack enable pnpm && \
    addgroup -g 65532 -S nonroot && \
    adduser -u 65532 -S nonroot -G nonroot

WORKDIR /app

# Copy built plugins and production dependencies
COPY --from=builder /workspace/node_modules ./node_modules
COPY --from=builder /workspace/plugins ./plugins
COPY --from=builder /workspace/package.json ./package.json
COPY --from=builder /workspace/pnpm-workspace.yaml ./pnpm-workspace.yaml

USER 65532:65532

EXPOSE 8080

ENTRYPOINT ["node", "--enable-source-maps"]
CMD ["plugins/policy-engine/dist/plugin.js"]
