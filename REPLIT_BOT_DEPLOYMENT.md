# Deploy Discord Bot to Replit

## Step 1: Set Up Discord Bot Credentials

1. Go to https://discord.com/developers/applications
2. Click **"New Application"** → name it `Civilization Bot`
3. Go to **"Bot"** section (left sidebar)
4. Click **"Add Bot"**
5. Under **TOKEN**, click **"Copy"** → save it
6. Go to **"General Information"** tab
7. Copy **Client ID** → save it

**Enable Gateway Intents:**
1. In Bot section, scroll to **"Gateway Intents"**
2. Enable these:
   - ✅ Presence Intent
   - ✅ Server Members Intent
   - ✅ Message Content Intent
3. Click **"Save Changes"**

## Step 2: Deploy Bot on Replit

1. Go to https://replit.com
2. Click **"Create"** → **"Import from GitHub"**
3. Paste: `https://github.com/godsaten13578642-svg/discord-bot`
4. Name it: `discord-bot-bot`
5. After import, click **"Secrets"** (left sidebar)
6. Add environment variables:
   - `DISCORD_BOT_TOKEN` = paste your bot token
   - `DISCORD_CLIENT_ID` = paste your client ID
   - `API_URL` = your backend Replit URL (e.g., `https://discord-bot.username.replit.dev`)
   - `NODE_ENV` = `production`

7. Edit `.replit` file:
   ```
   run = "cd bot && npm start"
   entrypoint = "bot/src/index.js"
   ```

8. Click **"Run"**
9. You should see: `✅ Bot logged in as YourBotName#1234`

## Step 3: Add Bot to Your Discord Server

1. Go to https://discord.com/developers/applications
2. Select your bot application
3. Go to **"OAuth2"** → **"URL Generator"**
4. Under **Scopes**, check: `bot`
5. Under **Permissions**, check:
   - Manage Roles
   - Manage Channels
   - Send Messages
   - Read Message History
   - Embed Links
6. Copy the generated URL at bottom
7. Open it in browser and select your test server

Bot is now in your Discord server and running on Replit!

## Your Complete Setup

- **Frontend**: Replit (always running)
- **Backend**: Replit (always running)
- **Bot**: Replit (always running)
- **Database**: On Render (auto-created)

All free tier, 24/7 uptime!

## Test the Bot

1. Go to your Discord server
2. Try a command (bot doesn't have commands yet, but it's connected)
3. Check Replit logs to see bot activity

## Costs

**3 Replit projects = FREE**
- No credit card needed
- Always running
- Unlimited bandwidth

Perfect setup for your Discord bot!

## Troubleshooting

**Bot shows offline?**
- Check Secrets are set correctly
- Verify token and client ID
- Check Replit logs for errors
- Click "Run" to restart

**Bot won't connect?**
- Verify Gateway Intents enabled
- Check `DISCORD_BOT_TOKEN` is correct
- Make sure token hasn't been regenerated

**Need to update bot?**
- Edit code locally
- `git push` to GitHub
- Replit auto-deploys
- Bot restarts with new code
