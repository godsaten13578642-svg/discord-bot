# Discord Civilization Bot & Dashboard

A comprehensive Discord bot system for managing civilizations, religions, economies, and community engagement, with a React web dashboard.

## Stack

- **Backend / Bot**: `server.js` — Express API + Discord.js v14 bot, combined in one process
- **Frontend**: React (Create React App), in `frontend/`
- **Storage**: JSON file (`db.json`) — no database required
- **Discord library**: discord.js v14

## Running the App

The app starts with `npm start` which runs both the API server and the React dashboard concurrently.

- **API + Bot**: port 3001
- **Dashboard**: port 5000 (main preview)

## Environment Secrets

Set in Replit Secrets (never in code):

| Secret | Description |
|---|---|
| `DISCORD_BOT_TOKEN` | Bot token from Discord Developer Portal → Bot |
| `DISCORD_CLIENT_ID` | Application ID from Discord Developer Portal → General Information |
| `SESSION_SECRET` | Session signing key |

## Enabling the Bot (Required Before Bot Works)

The Discord bot requires **Privileged Gateway Intents** to be enabled in the Developer Portal:

1. Go to https://discord.com/developers/applications
2. Select your application → **Bot**
3. Enable all three under "Privileged Gateway Intents":
   - ✅ Server Members Intent
   - ✅ Presence Intent
   - ✅ Message Content Intent
4. Save Changes
5. Restart the workflow

## Project Structure

```
server.js          # Main Express API + Discord bot (combined)
db.json            # JSON file database
frontend/          # React dashboard (CRA)
backend/           # Stub backend (minimal, not the main server)
bot/               # Standalone bot variant (not used by default)
minecraft-plugin/  # Minecraft Java plugin
```

## User Preferences

- Keep existing project structure — combined server.js approach is intentional
