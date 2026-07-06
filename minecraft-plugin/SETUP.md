# CivBridge Plugin — Setup Guide

## Requirements
- Paper 1.21.4 server
- Java 21
- Maven (to build the JAR)

---

## Building the JAR

```bash
cd minecraft-plugin
mvn package -q
```

The output JAR will be at `target/CivBridge-1.0.0.jar`.
Drop it into your Paper server's `plugins/` folder and restart.

---

## Configuring the Plugin

After the first start, edit `plugins/CivBridge/config.yml`:

```yaml
# URL of your Civilization Bot API
api-url: "https://YOUR_REPLIT_URL.replit.app"

# WebSocket URL for real-time chat bridge
ws-url: "wss://YOUR_REPLIT_URL.replit.app"    # use wss:// if HTTPS

# Must match mcApiKey in your bot's Settings dashboard
api-key: "change-me-to-something-secret"

# Right-click a Discord channel > Copy ID (needs Developer Mode)
bridge-channel-id: "YOUR_DISCORD_CHANNEL_ID"
```

> **Important:** Set the same `api-key` value in both the plugin config
> and the bot's Settings tab → **MC API Key** field.

---

## Setting Up the Bridge Channel

1. In your Discord server, create a channel called `#mc-bridge` (or any name).
2. Copy its ID (right-click → Copy Channel ID, Developer Mode must be on).
3. Paste it into `bridge-channel-id` in `config.yml`.
4. Paste the same ID into **Settings → Bridge Channel ID** in the dashboard.

---

## Account Linking

Players link their Minecraft account to their Discord account:

1. Player runs `/link` in Minecraft → gets a 6-digit code
2. Player types `!link 123456` in Discord
3. Both accounts are now linked — `/civ` in-game shows their Discord bot profile

---

## In-Game Commands

| Command | Description |
|---|---|
| `/link` | Generate a 6-digit code to link your Discord account |
| `/unlink` | Unlink your Discord account |
| `/discord` | Show Discord connection status |
| `/civ [player]` | View your civilization, religion, team, gold, and level from the bot |

---

## Discord Commands (Minecraft-related)

| Command | Description |
|---|---|
| `!link <code>` | Link your Discord to a Minecraft account (use code from `/link`) |
| `!unlink` | Remove your Minecraft link |
| `!mcplayers` | List players currently online on the Minecraft server |
| `!mcping` | Check if the Minecraft server is online |
| `!mcciv [@user]` | View a linked user's civilization profile |

---

## What Gets Bridged

| Minecraft Event | Sent to Discord |
|---|---|
| Player chat | `[MC] Steve: Hello!` in bridge channel |
| Player join | `✅ Steve joined the server` |
| Player leave | `❌ Steve left the server` |
| Player death | `💀 Steve was slain by Zombie` |
| Advancement | `🏆 Steve earned the advancement **Getting Wood**` |
| Server start | `Server is now online 🟢` |
| Server stop | `Server is now offline 🔴` |

| Discord Event | Sent to Minecraft |
|---|---|
| Message in bridge channel | `§9[Discord]§r §bUsername§r: message` (blue in chat) |

---

## Permissions

| Permission | Default | Description |
|---|---|---|
| `civbridge.admin` | OP | Access to `/civreload` |

---

## Bot Permissions Required

Make sure the bot has **Manage Roles** and **Manage Channels** in your Discord server
(already needed for the civ/religion/team/cult features).
