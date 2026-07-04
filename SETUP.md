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

## Next Steps

1. [Configure Features](./docs/FEATURE_CONFIG.md)
2. [Customize Civilizations](./docs/CIVILIZATIONS.md)
3. [API Documentation](./docs/API.md)
