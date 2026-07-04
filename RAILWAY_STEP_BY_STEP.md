# 🚀 Railway Deployment - Step by Step Guide

## Prerequisites
- GitHub account with your code pushed (✅ You have this)
- Railway account (create at https://railway.app if you don't have one)
- Discord Bot Token (from Discord Developer Portal)

---

## STEP 1: Create a New Railway Project

1. Go to https://railway.app
2. Sign in with your GitHub account
3. Click **"New Project"** button (top right, or center of dashboard)
4. Select **"Deploy from GitHub repo"**
5. Select your repository: **`discord-bot`** (from godsaten13578642-svg)
6. Click **"Deploy"**

Railway will start pulling your code from GitHub.

---

## STEP 2: Add PostgreSQL Database

While it's deploying, add the database:

1. Click **"+ Add Service"** button
2. Select **"Add from Marketplace"**
3. Search for **"PostgreSQL"**
4. Click on PostgreSQL
5. Click **"Add"**
6. Railway will provision a PostgreSQL database for you

Wait for it to finish initializing (1-2 minutes).

---

## STEP 3: Configure Backend Service

Now deploy the backend separately:

1. Click **"+ Add Service"** button again
2. Select **"Deploy from GitHub repo"**
3. Select your **`discord-bot`** repository again
4. When it asks for a directory, select **`backend`** (or type the path `/backend`)
5. Click **"Continue"**
6. Railway will build using the Dockerfile in the backend folder

While it builds, set environment variables:

1. Click on the **Backend** service (in the left panel)
2. Go to the **"Variables"** tab
3. Add these variables:
   ```
   PORT = 5000
   NODE_ENV = production
   ```
4. The `DATABASE_URL` should be auto-filled by Railway from PostgreSQL

Wait for the build to complete (3-5 minutes).

---

## STEP 4: Configure Frontend Service

1. Click **"+ Add Service"** again
2. Select **"Deploy from GitHub repo"**
3. Select **`discord-bot`** repository
4. Select **`frontend`** directory
5. Click **"Continue"**

While it builds, set environment variables:

1. Click on the **Frontend** service
2. Go to **"Variables"** tab
3. Look for the **Backend service URL** (you'll find it in the Backend service's "Public URL")
4. Add this variable:
   ```
   REACT_APP_API_URL = https://[backend-url-from-railway].railway.app
   ```
   (Replace with your actual backend URL)

Wait for frontend to build.

---

## STEP 5: Configure Bot Service

1. Click **"+ Add Service"** again
2. Select **"Deploy from GitHub repo"**
3. Select **`discord-bot`** repository
4. Select **`bot`** directory
5. Click **"Continue"**

While it builds, set environment variables:

1. Click on the **Bot** service
2. Go to **"Variables"** tab
3. Add these variables:
   ```
   DISCORD_BOT_TOKEN = [your bot token from Discord Developer Portal]
   DISCORD_CLIENT_ID = [your client ID]
   API_URL = https://[backend-url].railway.app
   NODE_ENV = production
   ```

---

## STEP 6: Get Your Public URLs

Once all services are deployed:

1. Click on **Backend** service
2. Look for **"Public URL"** section
3. Copy the URL (looks like `https://discord-bot-backend-xxx.railway.app`)
4. Do the same for **Frontend** - copy its Public URL

---

## STEP 7: Update Frontend with Backend URL

Your frontend needs to know where the backend is:

1. Go to **Frontend** service
2. Click **"Variables"** tab
3. Find the variable `REACT_APP_API_URL`
4. Update it with your Backend's public URL:
   ```
   REACT_APP_API_URL = https://discord-bot-backend-xxx.railway.app
   ```
5. Railway will automatically redeploy

---

## STEP 8: Get Your Discord Bot Token

If you haven't already:

1. Go to https://discord.com/developers/applications
2. Click **"New Application"**
3. Name: `Civilization Bot`
4. Go to **"Bot"** section
5. Click **"Add Bot"**
6. Under TOKEN, click **"Copy"**
7. Paste it into Railway Bot service's `DISCORD_BOT_TOKEN` variable

Also get your **Client ID** from the General Information tab and add it to Railway.

---

## STEP 9: Test Your Deployment

1. Go to your **Frontend** public URL in a browser
2. You should see your Civilization Bot Dashboard
3. Check the **Backend** logs for any errors
4. Check the **Bot** logs to see if it connected to Discord

---

## STEP 10: Add Bot to Your Discord Server

1. Go to https://discord.com/developers/applications
2. Select your bot application
3. Go to **"OAuth2"** → **"URL Generator"**
4. Under **Scopes**, check: `bot`
5. Under **Permissions**, check:
   - Manage Roles
   - Manage Channels
   - Send Messages
   - Read Message History
6. Copy the generated URL
7. Open it in a browser and select your test server

Your bot is now in your Discord server!

---

## Troubleshooting

### "Build Failed"
- Check the **Logs** tab in Railway
- Common issues: Missing environment variables, GitHub connectivity

### "Service won't start"
- Click service → **Logs** tab
- Look for error messages
- Common: Database not connected, wrong port

### "Frontend showing errors"
- Open browser DevTools (F12)
- Check Console tab for errors
- Usually means `REACT_APP_API_URL` is wrong or backend is down

### "Bot not responding"
- Check **Bot** service logs
- Make sure `DISCORD_BOT_TOKEN` is correct
- Verify bot has Message Content Intent enabled in Discord Developer Portal

---

## 🎉 You're Done!

Your Discord bot, dashboard, and API are now live globally!

- **Dashboard**: `https://your-frontend-url.railway.app`
- **API**: `https://your-backend-url.railway.app`
- **Bot**: Running in Discord and connected to your server

Visit your frontend URL to see your dashboard live!
