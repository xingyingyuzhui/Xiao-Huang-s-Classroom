# syntax=docker/dockerfile:1
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json turbo.json tsconfig.base.json ./
COPY packages/ packages/
COPY apps/server/ apps/server/
RUN npm ci --workspace=@xiaohuang/server --include-workspace-root
RUN npm run build -w @xiaohuang/domain-core -w @xiaohuang/subject-settings -w @xiaohuang/math-expr -w @xiaohuang/server
# Drop root/dev tooling so runtime copy stays small
RUN npm prune --omit=dev --workspace=@xiaohuang/server --include-workspace-root \
  && rm -rf \
    node_modules/electron \
    node_modules/electron-builder \
    node_modules/electron-updater \
    node_modules/app-builder-* \
    node_modules/@electron \
    node_modules/playwright* \
    node_modules/vitest \
    node_modules/typescript \
    node_modules/tsup \
    node_modules/esbuild \
    node_modules/turbo \
    node_modules/@types \
    node_modules/pkg \
    apps/server/node_modules \
    packages/*/node_modules

FROM node:20-alpine
ARG GIT_SHA=unknown
ARG BUILD_TIME=unknown
ARG APP_VERSION=0.0.1
ARG SOURCE_REPO=https://github.com/xingyingyuzhui/Xiao-Huang-s-Classroom
LABEL org.opencontainers.image.revision="${GIT_SHA}" \
      org.opencontainers.image.created="${BUILD_TIME}" \
      org.opencontainers.image.version="${APP_VERSION}" \
      org.opencontainers.image.source="${SOURCE_REPO}" \
      org.opencontainers.image.title="xiaohuang-lab-server" \
      org.opencontainers.image.description="小黄的教室 local lab API (loopback only)"
ENV GIT_SHA=${GIT_SHA} \
    BUILD_TIME=${BUILD_TIME} \
    APP_VERSION=${APP_VERSION} \
    SOURCE_REPO=${SOURCE_REPO}
RUN addgroup -g 1001 labapp && adduser -u 1001 -G labapp -D labapp
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3001
ENV CHEM_LAB_BIND=0.0.0.0
ENV CHEM_LAB_DATA_DIR=/data
ENV OPEN_BROWSER=0
COPY --from=builder /app/package.json /app/package-lock.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/domain-core ./packages/domain-core
COPY --from=builder /app/packages/subject-settings ./packages/subject-settings
COPY --from=builder /app/packages/math-expr ./packages/math-expr
COPY --from=builder /app/packages/config ./packages/config
COPY --from=builder /app/apps/server ./apps/server
RUN mkdir -p /data && chown -R labapp:labapp /data /app
USER labapp
EXPOSE 3001
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:3001/api/health').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
WORKDIR /app/apps/server
CMD ["node", "src/index.js"]
