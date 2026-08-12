# syntax=docker/dockerfile:1
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json turbo.json ./
COPY packages/ packages/
COPY apps/cloud-server/ apps/cloud-server/
RUN npm ci --workspace=@xiaohuang/cloud-server --include-workspace-root
RUN npm run build -w @xiaohuang/cloud-server

FROM node:20-alpine
ARG GIT_SHA=unknown
ARG BUILD_TIME=unknown
ARG APP_VERSION=0.0.1
ARG SOURCE_REPO=https://github.com/xingyingyuzhui/Xiao-Huang-s-Classroom
LABEL org.opencontainers.image.revision="${GIT_SHA}" \
      org.opencontainers.image.created="${BUILD_TIME}" \
      org.opencontainers.image.version="${APP_VERSION}" \
      org.opencontainers.image.source="${SOURCE_REPO}" \
      org.opencontainers.image.title="xiaohuang-cloud-server" \
      org.opencontainers.image.description="小黄的教室 cloud API"
RUN addgroup -g 1001 cloudapp && adduser -u 1001 -G cloudapp -D cloudapp
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/apps/cloud-server/dist ./dist
COPY --from=builder /app/apps/cloud-server/src/db/migrations ./dist/migrations
COPY --from=builder /app/apps/cloud-server/package.json ./
COPY --from=builder /app/node_modules ./node_modules
USER cloudapp
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=15s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:3000/livez').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# Default: API server. One-shot migrate: `node dist/migrate.js` (exits; no listen).
CMD ["node", "dist/server.js"]
