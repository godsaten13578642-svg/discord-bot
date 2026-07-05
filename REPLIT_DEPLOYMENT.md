# Deploy to Replit

## What You Get
- ✅ Backend always running (free tier)
- ✅ Frontend always running (free tier)
- ✅ Public URLs for both
- ✅ No CLI needed - just connect GitHub

## Step 1: Deploy Backend on Replit

1. Go to https://replit.com
2. Sign up with GitHub
3. Click **"Create"** → **"Import from GitHub"**
4. Paste: `https://github.com/godsaten13578642-svg/discord-bot`
5. Click **"Import"**
6. Replit auto-detects `.replit` config
7. Click **"Run"** button
8. Wait 2-3 minutes for npm install
9. You'll see: `✅ Backend running on port 5000`

**Copy your Backend URL** (shown at top of Replit):
- Example: `https://discord-bot.mckin.replit.dev`

## Step 2: Deploy Frontend on Replit

1. Click **"Create"** → **"Import from GitHub"** again
2. Paste same repo URL: `https://github.com/godsaten13578642-svg/discord-bot`
3. Name it something different like: `discord-bot-frontend`
4. After import, click **"Secrets"** (left sidebar)
5. Add environment variable:
   - Key: `REACT_APP_API_URL`
   - Value: `https://your-backend-replit-url.replit.dev`
   - (Replace with your actual backend URL from Step 1)
6. Edit `.replit` file:
   - Change `run = "npm start"` to `cd frontend && npm start`
   - Change `entrypoint` to `frontend/src/index.js`
7. Click **"Run"**
8. Wait for build
9. Frontend loads at: `https://discord-bot-frontend.your-username.replit.dev`

## Step 3: Test Connection

Visit your frontend URL. You should see:
- ✅ Dashboard loads
- ✅ "API Status: Backend connected" (no warning)
- ✅ Stats display properly

## Environment Variables in Replit

To set `REACT_APP_API_URL`:
1. Click **"Secrets"** in left sidebar
2. Add new secret:
   - Key: `REACT_APP_API_URL`
   - Value: Your backend Replit URL
3. Click **"Done"**
4. Replit auto-restarts with new variable

## Your Final URLs

- **Frontend**: `https://discord-bot-frontend.your-username.replit.dev`
- **Backend**: `https://discord-bot.your-username.replit.dev`

Share the frontend URL with anyone!

## Costs

**Replit Free Tier:**
- 2 free repls (perfect for backend + frontend)
- Always running (no sleep)
- Unlimited bandwidth
- FREE

## Troubleshooting

**Frontend shows blank?**
- Check `REACT_APP_API_URL` is set in Secrets
- Make sure backend URL is correct
- Click "Run" to restart

**Backend not responding?**
- Check logs (bottom of screen)
- Verify npm install completed
- Click "Run" again

**Changes not showing?**
- Push to GitHub: `git push`
- Click "Run" in Replit to redeploy
- Replit auto-syncs with GitHub

## Auto-Deploy

Replit watches your GitHub repo. When you push code:
1. Replit detects the change
2. Auto-rebuilds
3. Service restarts with new code

Done! Both services running 24/7 on free tier with public URLs.
