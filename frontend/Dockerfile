# Frontend Dockerfile
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json ./

# Install dependencies
RUN npm install --legacy-peer-deps --no-audit --no-fund 2>&1 || npm install --legacy-peer-deps

# Copy source
COPY public ./public
COPY src ./src

# Build with environment variables
ENV CI=false
ENV SKIP_PREFLIGHT_CHECK=true
ENV NODE_ENV=production

RUN npm run build

# Check if build succeeded
RUN test -d /app/build || (echo "Build failed!" && exit 1)

# Production stage
FROM node:18-alpine

WORKDIR /app

# Install serve
RUN npm install -g serve

# Copy built app from builder
COPY --from=builder /app/build ./build

EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:3000 || exit 1

# Start serve
CMD ["serve", "-s", "build", "-l", "3000"]
