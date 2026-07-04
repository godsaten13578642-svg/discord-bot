# GitHub Upload Instructions

## Step 1: Create a GitHub Account (if you don't have one)
1. Go to https://github.com/signup
2. Sign up with your email
3. Verify your email

## Step 2: Create a New Repository on GitHub
1. Go to https://github.com/new
2. Repository name: `discord-civilization-bot` (or your preferred name)
3. Description: "Discord Civilization Bot with dashboard and API"
4. Choose **Public** or **Private** (Private is recommended for security)
5. Do NOT check "Initialize with README" (we already have files)
6. Click "Create repository"

## Step 3: Get Your Repository URL
After creating, GitHub will show you a URL like:
`https://github.com/yourusername/discord-civilization-bot.git`

## Step 4: Add Remote and Push

Run these commands in PowerShell from your project directory:

```powershell
cd "C:\Users\mckin\Downloads\discord-main\discord-main"

# Add GitHub as remote
git remote add origin https://github.com/YOUR_USERNAME/discord-civilization-bot.git

# Rename branch to main (optional, but recommended)
git branch -M main

# Push to GitHub
git push -u origin main
```

Replace `YOUR_USERNAME` with your actual GitHub username.

## Step 5: Authenticate

When you run `git push`, GitHub will prompt you to authenticate.

**Option A: Personal Access Token (Recommended)**
1. Go to https://github.com/settings/tokens
2. Click "Generate new token (classic)"
3. Name it "discord-bot-deploy"
4. Check these scopes: `repo`, `workflow`
5. Click "Generate token" and copy it
6. When Git asks for password, paste the token

**Option B: SSH Key (More secure long-term)**
1. Generate SSH key: `ssh-keygen -t ed25519 -C "your_email@example.com"`
2. Add to GitHub: https://github.com/settings/keys
3. Use SSH URL instead: `git@github.com:YOUR_USERNAME/discord-civilization-bot.git`

## Verify Upload

After pushing, visit: `https://github.com/YOUR_USERNAME/discord-civilization-bot`
You should see all your files there!

## Troubleshooting

**Error: "fatal: remote origin already exists"**
```powershell
git remote remove origin
git remote add origin https://github.com/YOUR_USERNAME/discord-civilization-bot.git
```

**Error: "error: src refspec main does not match any"**
```powershell
git branch -M main
git push -u origin main
```

**Error: "fatal: No configured push destination"**
Make sure you ran `git remote add origin` correctly.
