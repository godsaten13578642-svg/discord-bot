# Frontend Dockerfile
FROM node:18-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --legacy-peer-deps --no-audit --no-fund
COPY public ./public
COPY src ./src
ENV CI=false SKIP_PREFLIGHT_CHECK=true NODE_ENV=production
RUN npm run build

FROM node:18-alpine
WORKDIR /app
RUN npm install -g http-server
COPY --from=builder /app/build ./dist
EXPOSE 3000
CMD ["http-server", "dist", "-p", "3000", "--cors"]
