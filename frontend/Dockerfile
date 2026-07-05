# Frontend Dockerfile - Simple Node server
# Cache bust: 2026-07-05
FROM node:18-alpine AS builder

WORKDIR /app

COPY package.json ./

RUN npm install --legacy-peer-deps --no-audit --no-fund

COPY public ./public
COPY src ./src

ENV CI=false
ENV SKIP_PREFLIGHT_CHECK=true
ENV NODE_ENV=production

RUN npm run build

# Production stage - use Node directly
FROM node:18-alpine

WORKDIR /app

COPY --from=builder /app/build ./public

# Simple Express server to serve static files
RUN cat > server.js << 'EOF'
const express = require('express');
const path = require('path');
const app = express();

app.use(express.static(path.join(__dirname, 'public')));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Frontend running on port ${PORT}`);
});
EOF

RUN npm install express

EXPOSE 3000

CMD ["node", "server.js"]
