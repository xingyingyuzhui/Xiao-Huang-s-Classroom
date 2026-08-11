# Task 3 foundation image — Agent H extends for production deploy (Task 8).
FROM node:20-alpine AS build
WORKDIR /repo
COPY package.json package-lock.json ./
COPY apps/cloud-server/package.json apps/cloud-server/
COPY packages/ packages/
RUN npm ci --workspace=@xiaohuang/cloud-server --include-workspace-root
COPY apps/cloud-server/ apps/cloud-server/
RUN npm run build -w @xiaohuang/cloud-server

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /repo/apps/cloud-server/dist ./dist
COPY --from=build /repo/apps/cloud-server/package.json ./
COPY --from=build /repo/node_modules ./node_modules
EXPOSE 3000
CMD ["node", "dist/server.js"]
