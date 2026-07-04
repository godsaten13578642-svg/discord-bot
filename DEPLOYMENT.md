# Global Deployment Guide

## Option 1: Railway (Recommended - Easiest)

### Setup Steps:
1. Push your code to GitHub
2. Go to [railway.app](https://railway.app)
3. Click "New Project" → "Deploy from GitHub"
4. Select your repository
5. Click "Add Services" and select:
   - PostgreSQL (Railway will provide DATABASE_URL)
   - Backend service (link Dockerfile)
   - Frontend service (link Dockerfile)
   - Bot service (link Dockerfile)

### Configure Environment Variables:
In Railway dashboard for each service:
- **Backend**: `PORT=5000`, `DATABASE_URL=` (auto-filled by Railway)
- **Frontend**: `REACT_APP_API_URL=https://your-backend-url.railway.app`
- **Bot**: `DISCORD_BOT_TOKEN=`, `DISCORD_CLIENT_ID=`, `API_URL=https://your-backend-url.railway.app`

### Costs:
- Free tier: $5/month credits (good for small projects)
- Paid: Usage-based pricing starting ~$5/month

---

## Option 2: Render (Good Alternative)

### Setup Steps:
1. Go to [render.com](https://render.com)
2. Click "New +" → "Web Service"
3. Connect GitHub repository
4. Configure build & start commands:
   - Build: `npm install`
   - Start: `npm start`
5. Add environment variables
6. Deploy

### Costs:
- Free tier: Limited uptime, auto-sleeps after 15min inactivity
- Paid: $12/month (always on)

---

## Option 3: Fly.io (Docker-native)

### Setup:
```bash
# Install flyctl CLI
# Windows: choco install flyctl

flyctl auth login
flyctl launch  # Follow prompts, choose your services
flyctl deploy
```

### Costs:
- Free tier: 3 shared-cpu-1x 256MB VMs
- Paid: Usage-based, typically $5-20/month

---

## Update Frontend API URL

Edit `frontend/src/App.js` to use environment variable:

```javascript
const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';
```

---

## Database Connection

Your PostgreSQL will be cloud-hosted:
- Railway provides `DATABASE_URL` automatically
- Render, Fly.io need manual PostgreSQL setup or use add-ons

---

## Domain Setup (Optional but Recommended)

1. Buy domain from Namecheap, GoDaddy, Route53
2. Point nameservers to your hosting provider:
   - **Railway**: Custom domains via dashboard
   - **Render**: Custom domains via settings
   - **Fly.io**: Use `flyctl certs`
3. Your website will be at `https://yourdomain.com`

---

## Quick Start with Railway

```bash
# 1. Push to GitHub
git push origin main

# 2. Go to railway.app
# 3. Create new project from GitHub
# 4. Select your repo
# 5. Railway auto-detects Dockerfiles
# 6. Add PostgreSQL plugin
# 7. Set environment variables
# 8. Deploy button clicks automatically
```

Done! Your bot & dashboard are now globally accessible.
