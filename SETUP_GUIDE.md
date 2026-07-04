# Civilization Bot - Complete Setup Guide

## 📋 Table of Contents
1. [Prerequisites](#prerequisites)
2. [Installation](#installation)
3. [Configuration](#configuration)
4. [Running the Bot](#running-the-bot)
5. [Discord Bot Setup](#discord-bot-setup)
6. [First Steps](#first-steps)
7. [Troubleshooting](#troubleshooting)

## Prerequisites

- **Node.js 16+** - [Download](https://nodejs.org)
- **PostgreSQL 12+** - [Download](https://www.postgresql.org/download)
- **Git** - [Download](https://git-scm.com)
- **Discord Bot Token** - Created in Discord Developer Portal
- **Text Editor/IDE** - VS Code recommended

## Installation

### 1. Clone Repository

```bash
git clone https://github.com/meodmidas/discord.git
cd discord
```

### 2. Install Dependencies

```bash
# Backend
cd backend
npm install
cd ..

# Bot
cd bot
npm install
cd ..

# Frontend
cd frontend
npm install
cd ..
```

## Configuration

### 1. Create Environment Files

**bot/.env**
```bash
DISCORD_BOT_TOKEN=your_token_here
DISCORD_CLIENT_ID=your_client_id_here
API_URL=http://localhost:5000
```

**backend/.env**
```bash
PORT=5000
NODE_ENV=development
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/civilization_bot
```

**frontend/.env.local**
```bash
REACT_APP_API_URL=http://localhost:5000
```

### 2. Setup PostgreSQL Database

```bash
# Connect to PostgreSQL
psql -U postgres

# Create database
CREATE DATABASE civilization_bot;
\q
```

Or use Docker:
```bash
docker run -d \
  --name postgres-civ \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=civilization_bot \
  -p 5432:5432 \
  postgres:15-alpine
```

## Running the Bot

### Option A: Terminal Windows (Recommended for Development)

**Terminal 1 - Backend API**
```bash
cd backend
npm run dev
```
Should show: `✅ Backend running on port 5000`

**Terminal 2 - Discord Bot**
```bash
cd bot
npm run dev
```
Should show: `✅ Bot logged in as YourBotName#1234`

**Terminal 3 - Frontend Dashboard**
```bash
cd frontend
npm start
```
Should open http://localhost:3000 in your browser

### Option B: Docker Compose (All at Once)

```bash
docker-compose up
```

Then in separate terminals:
```bash
# Terminal 1
cd backend && npm run dev

# Terminal 2  
cd bot && npm run dev

# Terminal 3
cd frontend && npm start
```

## Discord Bot Setup

### Step 1: Create Application

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Click **"New Application"**
3. Name it `Civilization Bot`
4. Click **"Create"**

### Step 2: Create Bot User

1. Go to **"Bot"** section (left sidebar)
2. Click **"Add Bot"**
3. Under TOKEN, click **"Copy"**
4. Paste into `bot/.env` as `DISCORD_BOT_TOKEN`

### Step 3: Enable Intents

Under "Bot" → "Privileged Gateway Intents", enable:
- ✅ **Message Content Intent**
- ✅ **Server Members Intent**  
- ✅ **Presence Intent**

Click **"Save Changes"**

### Step 4: Get Client ID

1. Go to **"General Information"** (left sidebar)
2. Copy **Application ID**
3. Paste into `bot/.env` as `DISCORD_CLIENT_ID`

### Step 5: Generate Invite URL

1. Go to **"OAuth2"** → **"URL Generator"** (left sidebar)
2. Under **Scopes**, select: `bot`
3. Under **Permissions**, select:
   - ✅ Manage Roles
   - ✅ Manage Channels
   - ✅ Kick Members
   - ✅ Ban Members
   - ✅ Manage Messages
   - ✅ Read Message History
   - ✅ Send Messages
   - ✅ Embed Links
   - ✅ Attach Files
   - ✅ Read Reactions
   - ✅ Change Nickname
   - ✅ Manage Nicknames
   - ✅ Manage Webhooks
   - ✅ Create Instant Invite
4. Copy the generated URL
5. Open in browser and add bot to your test server

### Step 6: Create Test Server (if needed)

1. Open Discord
2. Click "+" button to create new server
3. Name it something like "Civilization Testing"
4. Add the bot using the invite URL from step 5

## First Steps

### 1. Verify Bot is Online

In Discord, type:
```
/help
```

Bot should respond with help information.

### 2. Initialize Server

```
/setup
```

Bot will configure your server.

### 3. Create a Civilization

```
/create-civilization name:"Kingdom of Sol" description:"A peaceful kingdom"
```

### 4. Access Dashboard

Open http://localhost:3000 in your browser

### 5. Configure Features

1. Go to **Settings** tab
2. Toggle features on/off as needed
3. Click **Save Settings**

## Troubleshooting

### Bot won't start

**Check Discord Token**
```bash
# Make sure DISCORD_BOT_TOKEN is set
echo $DISCORD_BOT_TOKEN
```

**Check Node version**
```bash
node --version  # Should be v16.0.0 or higher
```

### Bot not responding to commands

1. Check Message Content Intent is enabled in Developer Portal
2. Restart the bot
3. Try `/help` command

### Database connection error

```bash
# Check PostgreSQL is running
psql -U postgres -c "SELECT 1"

# Verify database exists
psql -U postgres -l | grep civilization_bot

# Create if missing
psql -U postgres -c "CREATE DATABASE civilization_bot"
```

### Dashboard not loading

1. Check backend is running: http://localhost:5000/health
2. Check frontend is running: http://localhost:3000
3. Clear browser cache (Ctrl+Shift+Delete)
4. Check console for errors (F12)

### Port already in use

```bash
# Find what's using port 5000 (backend)
lsof -i :5000

# Find what's using port 3000 (frontend)  
lsof -i :3000

# Kill process (replace PID)
kill -9 PID
```

### Permissions errors

- Make sure bot has required Discord permissions
- Check role hierarchy in Discord
- Verify user isn't above bot in role hierarchy

## Common Commands

```
/setup                              - Initialize the server
/create-civilization name:"Name"   - Create a new civilization
/invite-member @user               - Invite user to your civilization
/profile @user                     - View user profile
/help                              - Show help
```

## Next Steps

1. **Customize Features** - Go to Settings → disable unused features
2. **Create Civilizations** - Use `/create-civilization` command
3. **Invite Members** - Use `/invite-member` command
4. **Configure Roles** - Set up custom role names in dashboard
5. **Setup Events** - Create events and elections
6. **Monitor Activity** - Check Analytics dashboard

## File Locations

- Bot commands: `bot/src/commands/`
- Bot events: `bot/src/events/`
- API routes: `backend/src/routes/`
- Database schema: `backend/src/db/migrations/`
- Dashboard pages: `frontend/src/pages/`

## Getting Help

- Check [QUICKSTART.md](./QUICKSTART.md) for quick reference
- Check [docs/API.md](./docs/API.md) for API reference
- Check bot console for error messages
- Check Discord Developer Portal logs
- Search existing GitHub issues

## Performance Tips

1. Use PostgreSQL (not SQLite) for production
2. Cache frequently accessed data
3. Use database indexes for large datasets
4. Monitor activity logs size and archive old logs
5. Consider Redis for session caching

## Security

- Never commit `.env` files
- Use strong database passwords
- Enable 2FA on Discord account
- Restrict bot permissions to minimum needed
- Regularly update dependencies: `npm update`

## Next: Feature Configuration

See [docs/FEATURE_CONFIG.md](./docs/FEATURE_CONFIG.md) for detailed feature documentation.
