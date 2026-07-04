# 🏛️ Discord Civilization Bot & Dashboard

A comprehensive Discord bot system for managing civilizations, economies, and communities with a full web dashboard.

## Features

### 👤 User System
- Discord verification & new member onboarding
- Welcome messages & auto roles
- Custom profile cards with XP & leveling
- Reputation system & activity tracking
- Account age checks & inactive member tracking

### 🏛️ Civilization System
- Create and manage civilizations
- Custom role hierarchies (Leader, Officer, Citizen, etc.)
- Civilization-specific permissions
- Private voice channels
- Auto-generated category structure

### ⚔️ Advanced Systems
- **Military**: Custom military ranks and channels
- **Religion**: Religious organizations with ceremonies
- **Elections**: Democratic voting and candidate registration
- **Diplomacy**: Alliance system with treaties
- **Honors**: Badge system (Hero, Veteran, Founder, etc.)
- **Tickets**: Support system (Appeals, Bug Reports, Player Reports)
- **Voting**: Yes/No, Multiple Choice, Ranked Choice
- **Laws**: Civilization-specific laws with history
- **Wiki**: Built-in documentation system

### 📊 Analytics & Management
- Real-time activity tracking
- Member growth metrics
- Feature toggle dashboard
- Admin panel with audit logs
- Event management

### ⭐ Quality-of-Life Features
- Starboard for popular messages
- Giveaway system
- Birthday reminders
- Slowmode automation
- Anonymous confessions
- Scheduled announcements
- Custom embed builder
- Server statistics channels

## Project Structure

```
.
├── bot/                 # Discord bot (Node.js + discord.js)
├── backend/            # API server (Express)
├── frontend/           # Dashboard (React)
├── docker-compose.yml  # Local development setup
└── README.md
```

## Quick Start

### Prerequisites
- Node.js 16+ & npm/yarn
- PostgreSQL (or use Docker)
- Discord Bot Token

### Step 1: Clone & Setup

```bash
git clone https://github.com/meodmidas/discord.git
cd discord
```

### Step 2: Environment Variables

Create `.env` files in each directory:

**bot/.env**
```
DISCORD_BOT_TOKEN=your_bot_token_here
DISCORD_CLIENT_ID=your_client_id_here
API_URL=http://localhost:5000
```

**backend/.env**
```
PORT=5000
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/civilization_bot
```

**frontend/.env.local**
```
REACT_APP_API_URL=http://localhost:5000
```

### Step 3: Install Dependencies

```bash
# Backend
cd backend
npm install

# Bot
cd ../bot
npm install

# Frontend
cd ../frontend
npm install
```

### Step 4: Start PostgreSQL

Using Docker (easiest):
```bash
docker-compose up -d postgres
```

Or install PostgreSQL locally and create database:
```sql
CREATE DATABASE civilization_bot;
```

### Step 5: Start Services

Open 3 terminals:

**Terminal 1 - Backend:**
```bash
cd backend
npm run dev
# Runs on http://localhost:5000
```

**Terminal 2 - Bot:**
```bash
cd bot
npm run dev
# Connects to Discord
```

**Terminal 3 - Frontend:**
```bash
cd frontend
npm start
# Runs on http://localhost:3000
```

### Step 6: Create Discord Bot

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Click "New Application" → Name it "Civilization Bot"
3. Go to "Bot" section → "Add Bot"
4. Copy the token to `bot/.env` as `DISCORD_BOT_TOKEN`
5. Enable these Intents:
   - ✅ Message Content Intent
   - ✅ Server Members Intent
   - ✅ Presence Intent
6. Go to OAuth2 → URL Generator
   - Scopes: `bot`
   - Permissions: `Manage Roles`, `Manage Channels`, `Kick Members`, `Ban Members`, `Manage Messages`
7. Copy the URL and add bot to your test server

### Step 7: Test the Bot

In Discord, run:
```
/setup
```

Then visit http://localhost:3000 to see the dashboard!

## Docker Setup (Optional)

Start everything at once:
```bash
docker-compose up
```

Then start each service:
```bash
# Terminal 1
cd backend && npm run dev

# Terminal 2
cd bot && npm run dev

# Terminal 3
cd frontend && npm start
```

## Available Commands

### Discord Bot Commands

```
/setup                           - Initialize bot for your server
/create-civilization [name]      - Create a new civilization
/invite-member [@user]           - Invite member to your civilization
/profile [@user]                 - View user profile
/help                            - Show help information
```

## Dashboard Features

### Settings
- Toggle all features on/off
- Configure welcome messages
- Set auto-assign roles
- Manage permissions

### Civilizations
- Create new civilizations
- Manage members
- View activity
- Configure roles

### Analytics
- View member growth
- Track activity metrics
- Monitor participation
- Export reports

## Feature Toggle

All features can be enabled/disabled from the dashboard:
- User System
- Rank System
- Civilization System
- Military System
- Religion System
- Voting System
- Elections
- Diplomacy
- Honors
- Ticket System
- Suggestions
- Laws System
- Wiki
- And more!

## Database Schema

- `servers` - Guild configuration
- `users` - User data & levels
- `user_profiles` - Per-guild user data
- `civilizations` - Civilization data
- `civ_roles` - Civilization roles
- `civ_members` - Civilization membership
- `polls` - Voting/polling system
- `honors` - Achievement badges
- `tickets` - Support tickets
- `activity_logs` - User activity tracking

## API Documentation

See [docs/API.md](./docs/API.md) for full API reference.

## Troubleshooting

### Bot Not Responding
- ✅ Check Message Content Intent is enabled
- ✅ Verify bot token in `.env`
- ✅ Ensure backend is running

### Database Connection Error
- ✅ Verify PostgreSQL is running
- ✅ Check `DATABASE_URL` in `.env`
- ✅ Ensure database `civilization_bot` exists

### Dashboard Not Loading
- ✅ Clear browser cache
- ✅ Check backend is running on port 5000
- ✅ Verify `REACT_APP_API_URL` is correct

## Development

- Bot uses Discord.js v14
- Backend uses Express.js
- Frontend uses React 18
- Database is PostgreSQL

## License

MIT

## Support

For issues or questions, create a GitHub issue.
