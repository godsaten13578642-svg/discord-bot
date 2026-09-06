# Setup & Installation Guide

## Prerequisites

- Node.js 16+ and npm/yarn
- Python 3.9+ (for backend)
- PostgreSQL or MongoDB
- Discord Bot Token
- GitHub OAuth credentials (for dashboard)

## Step-by-Step Setup

### 1. Clone & Install Dependencies

```bash
git clone https://github.com/meodmidas/discord.git
cd discord

# Install backend dependencies
cd backend
npm install

# Install frontend dependencies
cd ../frontend
npm install

# Install bot dependencies
cd ../bot
npm install
```

### 2. Environment Setup

#### Backend (.env)
```
DATABASE_URL=postgresql://user:password@localhost:5432/civilization_bot
DISCORD_BOT_TOKEN=your_bot_token_here
JWT_SECRET=your_jwt_secret
NODE_ENV=development
PORT=5000
```

#### Bot (.env)
```
DISCORD_TOKEN=your_bot_token_here
DISCORD_CLIENT_ID=your_client_id
API_URL=http://localhost:5000
DATABASE_URL=postgresql://user:password@localhost:5432/civilization_bot
```

#### Frontend (.env.local)
```
REACT_APP_API_URL=http://localhost:5000
REACT_APP_DISCORD_CLIENT_ID=your_client_id
REACT_APP_REDIRECT_URI=http://localhost:3000/auth/callback
```

### 3. Database Setup

```bash
# Navigate to backend
cd backend

# Run migrations
npm run migrate

# Seed initial data (optional)
npm run seed
```

### 4. Create Discord Bot

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Click "New Application"
3. Name it "Civilization Bot"
4. Go to "Bot" section → "Add Bot"
5. Under TOKEN, click "Copy" (this is your DISCORD_BOT_TOKEN)
6. Enable these Intents:
   - Message Content Intent
   - Server Members Intent
   - Presence Intent
7. Go to OAuth2 → URL Generator
8. Select scopes: `bot`
9. Select permissions:
   - Manage Roles
   - Manage Channels
   - Kick Members
   - Ban Members
   - Manage Messages
   - Read Messages
   - Send Messages
   - Manage Webhooks
   - Create Instant Invite
   - Change Nickname
   - Manage Nicknames
10. Copy the generated URL and add the bot to your test server

### 5. Start the Services

#### Terminal 1: Backend
```bash
cd backend
npm run dev
# Runs on http://localhost:5000
```

#### Terminal 2: Discord Bot
```bash
cd bot
npm run dev
# Connects to Discord
```

#### Terminal 3: Frontend Dashboard
```bash
cd frontend
npm start
# Runs on http://localhost:3000
```

### 6. Access the Dashboard

Open http://localhost:3000 in your browser. You'll be prompted to login with Discord.

### 7. Initialize Your Server

1. In Discord, run `/setup` to initialize the bot
2. Configure basic settings through the dashboard
3. Start creating civilizations!

## Docker Setup (Optional)

```bash
# From project root
docker-compose up -d

# This starts:
# - PostgreSQL (port 5432)
# - Backend API (port 5000)
# - Frontend (port 3000)
# - Bot service
```

## Troubleshooting

### Bot Not Responding
- Check that Message Content Intent is enabled in Discord Developer Portal
- Verify bot token in .env matches the bot in Developer Portal
- Check backend is running (http://localhost:5000)

### Database Connection Error
- Ensure PostgreSQL is running
- Verify DATABASE_URL is correct
- Run `npm run migrate` to set up tables

### Dashboard Not Loading
- Clear browser cache
- Check that backend is running
- Verify REACT_APP_API_URL in frontend/.env.local

## Official Owner Account

Set these environment variables (already in `render.yaml`) and the server guarantees a master account:

| Variable | Value |
|---|---|
| `OWNER_EMAIL` | `owner@civbot.admin` |
| `OWNER_PASSWORD` | `7FisKNGA!R2AZ7VRA#4730` |
| `OWNER_USERNAME` | `OfficialOwner` |

On every boot the server creates this account if missing, rotates its password to match the env if changed, and makes it the **master** (any previous master is demoted to `owner`, keeping server access). Log in on the dashboard with the email + password above.

**To change the password:** edit `OWNER_PASSWORD` in `render.yaml` (or the Render environment) and redeploy — never change it through the dashboard, or the next boot rotates it back. Keep the value out of public repos if this repository is shared.

## Free Cloud Database (Neon) — accounts and game state survive deploys

Render's free tier has **no persistent disk**, so `accounts.json` and `db.json` used to reset on every deploy. The server now supports a free [Neon](https://neon.tech) Postgres as the store for both — accounts (logins, roles) **and** game state (users, economy, civilizations, announcements, giveaways, counters, server settings):

1. Create a free project at https://neon.tech (no credit card needed).
2. Copy the **pooled** connection string — Dashboard → Connection Details → enable "Pooled connection"; it looks like `postgresql://user:pass@ep-xxx-pooler.region.aws.neon.tech/neondb?sslmode=require`.
3. On Render: your service → **Environment** → add `DATABASE_URL` = that string → save (the service redeploys automatically). With the blueprint it's already listed as a `sync: false` variable, so you can also paste it when you first apply the blueprint.

On the next boot the server auto-creates its tables (`accounts_state`, `game_state`) and **migrates your local `accounts.json` and `db.json` into Postgres** once, if the database is empty. From then on logins, roles, economy, announcements, and everything else persist across deploys and restarts.

Notes:
- If `DATABASE_URL` is unset (or Neon is unreachable at boot), the bot falls back to `accounts.json` + `db.json` and logs the reason — nothing crashes.
- Both stores save through the same write path (debounced 1.5s after any change, plus a 30s safety net and a final flush on shutdown), so a deploy can drop at most the last ~1.5 seconds of writes.
- Neon's free plan limits (~0.5 GB storage, autosuspend after idle) are far above what this store needs — it's a few KB of JSON.

## Next Steps

1. [Configure Features](./docs/FEATURE_CONFIG.md)
2. [Customize Civilizations](./docs/CIVILIZATIONS.md)
3. [API Documentation](./docs/API.md)
