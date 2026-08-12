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
WORKDIR /app/apps/server
CMD ["node", "src/index.js"]
