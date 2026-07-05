# Deploy to Render (Simple Alternative to Railway)

## Step 1: Create Render Account
1. Go to https://render.com
2. Click **"Sign Up"**
3. Sign up with GitHub (easiest option)

## Step 2: Deploy Blueprint
1. Go to https://render.com/i/new
2. Select **"Blueprint"** (not individual services)
3. Choose your GitHub repo: `discord-bot`
4. Click **"Connect"**
5. Render will auto-detect the `render.yaml` file
6. Click **"Apply"**

Render will automatically deploy:
- ✅ PostgreSQL database
- ✅ Backend API (Node.js)
- ✅ Frontend (React)
- ✅ Discord Bot (Worker)

## Step 3: Configure Environment Variables

Once deployed, you need to set your Discord credentials:

1. Go to Render Dashboard
2. Click on **"civilization-bot-discord"** service
3. Go to **"Environment"** tab
4. Edit these variables:
   - `DISCORD_BOT_TOKEN` = [your bot token]
   - `DISCORD_CLIENT_ID` = [your client ID]

5. Click **"Save"**
6. The bot will auto-restart

## Step 4: Get Your Public URLs

After deployment completes:
- **Frontend**: `https://civilization-bot-frontend.onrender.com` (or custom name)
- **Backend**: `https://civilization-bot-backend.onrender.com` (or custom name)
- **Bot**: Running in background (no public URL needed)

## Step 5: Update Discord Bot Settings

1. Go to https://discord.com/developers/applications
2. Select your bot
3. Go to **"Bot"** section
4. Scroll to **"Gateway Intents"**
5. Enable:
   - ✅ Presence Intent
   - ✅ Server Members Intent
   - ✅ Message Content Intent

## Costs

**Render Free Tier:**
- Frontend: Free (paused after 15 min inactivity)
- Backend: Free (paused after 15 min inactivity)
- Database: Free (limited)
- Bot: Free

**To keep running 24/7:** Upgrade to Paid ($7/month per service)

## Troubleshooting

**Frontend shows blank page:**
- Check if `REACT_APP_API_URL` is set in Frontend environment
- Verify Backend service is running

**Bot not responding:**
- Check Discord Bot Intents are enabled
- Verify `DISCORD_BOT_TOKEN` and `DISCORD_CLIENT_ID` are set
- Check logs in bot service

**Database connection error:**
- Render auto-creates PostgreSQL
- Should auto-connect with `DATABASE_URL`
- Check backend logs for errors

## Alternative: Deploy Individually

If Blueprint doesn't work:

1. Create 3 separate services:
   - Click **"+ New"** → **"Web Service"** for Backend
   - Click **"+ New"** → **"Web Service"** for Frontend
   - Click **"+ New"** → **"Background Worker"** for Bot

2. For each, select:
   - GitHub repo: `discord-bot`
   - Directory: `/backend`, `/frontend`, or `/bot`
   - Build command: `npm install`
   - Start command: `npm start`

3. Render auto-detects Dockerfile and uses it

That's it! Your bot is now deployed on Render and globally accessible.
