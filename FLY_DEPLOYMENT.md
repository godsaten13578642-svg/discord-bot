# Deploy to Fly.io

## Step 1: Install Flyctl CLI

**Windows:**
```powershell
choco install flyctl
```

Or download from: https://fly.io/docs/getting-started/installing-flyctl/

**Mac:**
```bash
brew install flyctl
```

**Linux:**
```bash
curl -L https://fly.io/install.sh | sh
```

## Step 2: Create Fly.io Account

1. Go to https://fly.io
2. Click **"Sign Up"**
3. Sign up with GitHub or email

## Step 3: Authenticate Flyctl

```powershell
flyctl auth login
```

This opens a browser to authenticate. Follow the prompts.

## Step 4: Deploy Backend

```powershell
cd backend
flyctl launch --name civilization-bot-backend --region sjc
```

When asked:
- **Copy configuration to the new app?** → No (we already have fly.toml)
- **Dockerfile?** → Yes
- **Would you like to set variables?** → Yes
  - `PORT=5000`
  - `NODE_ENV=production`

Then deploy:
```powershell
flyctl deploy
```

Get your backend URL:
```powershell
flyctl status
```

Copy the URL (e.g., `https://civilization-bot-backend.fly.dev`)

## Step 5: Deploy Frontend

```powershell
cd ../frontend
flyctl launch --name civilization-bot-frontend --region sjc
```

When asked:
- **Copy configuration to the new app?** → No
- **Dockerfile?** → Yes
- **Would you like to set variables?** → Yes
  - `PORT=3000`
  - `NODE_ENV=production`
  - `REACT_APP_API_URL=https://civilization-bot-backend.fly.dev`

Then deploy:
```powershell
flyctl deploy
```

Get your frontend URL:
```powershell
flyctl status
```

## Step 6: Update Frontend API URL

Your frontend needs to know where the backend is.

Go back to frontend and update the environment variable:
```powershell
cd ../frontend
flyctl secrets set REACT_APP_API_URL=https://civilization-bot-backend.fly.dev
flyctl deploy
```

## Step 7: Test

Open your frontend URL in a browser. You should see:
- ✅ Dashboard loads
- ✅ API connects (no warning message)
- ✅ Data displays

## Costs

**Fly.io Free Tier:**
- 3 shared-cpu-1x 256MB VMs (always running)
- Enough for backend + frontend
- FREE

Perfect for your use case!

## Troubleshooting

**Check logs:**
```powershell
flyctl logs
```

**Check status:**
```powershell
flyctl status
```

**Restart service:**
```powershell
flyctl restart
```

**Update code:**
```powershell
git push
flyctl deploy
```

That's it! Your bot dashboard is now live on Fly.io with 24/7 uptime on free tier.
