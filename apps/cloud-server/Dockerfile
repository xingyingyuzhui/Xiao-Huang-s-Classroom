FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json turbo.json ./
COPY packages/ packages/
COPY apps/cloud-server/ apps/cloud-server/
RUN npm ci --workspace=@xiaohuang/cloud-server --include-workspace-root
RUN npm run build -w @xiaohuang/cloud-server

FROM node:20-alpine
RUN addgroup -g 1001 cloudapp && adduser -u 1001 -G cloudapp -D cloudapp
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/apps/cloud-server/dist ./dist
COPY --from=builder /app/apps/cloud-server/src/db/migrations ./dist/migrations
COPY --from=builder /app/apps/cloud-server/package.json ./
COPY --from=builder /app/node_modules ./node_modules
USER cloudapp
EXPOSE 3000
CMD ["node", "dist/server.js"]
