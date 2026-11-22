FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/greengate/package.json packages/greengate/
COPY apps/demo/package.json apps/demo/
RUN npm ci
COPY packages/greengate packages/greengate
COPY apps/demo apps/demo
RUN npm run build && npm run build -w @greengate/demo
ENV PORT=3000
EXPOSE 3000
CMD ["node", "apps/demo/dist/server.js"]
