# CivBridge Plugin — Setup Guide

## Requirements
- Paper 1.21.4 server
- Java 21
- Maven (to build the JAR)
- Skript plugin (optional — required only for the `/react` script manager)

---

## Deploying the Bot on Render (Blueprint)

The repo ships a working `render.yaml` blueprint that deploys the bot + API as
one web service (plus the React dashboard as a static site):

1. Push the repo to GitHub, then go to https://dashboard.render.com → **New +** → **Blueprint**.
2. Pick your repo — Render reads `render.yaml` and asks for `DISCORD_BOT_TOKEN`
   (and optionally `DISCORD_CLIENT_ID`). `MC_API_KEY` is auto-generated.
3. Click **Apply**. When it's live your API URL is `https://civbot-api.onrender.com`
   (or the name you chose).
4. In the service's **Environment** tab, copy the `MC_API_KEY` value.

A keep-alive pinger is built into `server.js` (pings `/health` every 10 min when
`RENDER_EXTERNAL_URL` is set) so the free/starter service doesn't spin down and
drop the Minecraft WebSocket.

**Free-tier spin-down notices (private):** the bot DMs 🌙 when the API spins
down and 🟢 when it wakes up and the Minecraft server reconnects — sent
**privately** to Discord user `memegodmidas` (override with
`SECRET_DM_USERNAME`; message text with `SECRET_DM_MESSAGE`). Nothing is ever
posted in public server chat. The bot's Discord presence also mirrors the MC
connection ("playing the Minecraft server (N online)" / idle while waiting).
The plugin reconnects on its own with exponential backoff (10s → 5 min cap) —
no action needed from you after a wake-up.

### Pointing the plugin at Render

In `plugins/CivBridge/config.yml` on your Minecraft server:

```yaml
api-url: "https://civbot-api.onrender.com"
ws-url: "wss://civbot-api.onrender.com/ws"
api-key: "<the MC_API_KEY value from Render>"
public-url: "https://civbot-api.onrender.com"   # used for /react error-report links
```

---

## Building the JAR

> **Important:** Paper 1.21.4 requires **Java 21** to compile against.  
> The Replit environment ships with Java 19 by default, so you must either:
> - Build locally on your own machine (Java 21 + Maven installed), or
> - Use the pre-built JAR already in `target/CivBridge-1.0.0.jar`

> **Downloading instead of building:** the bot's website serves the newest
> plugin jar and resource pack at `/downloads/plugin` and `/downloads/pack`
> (also linked from the dashboard's **Minecraft tab → Downloads**). They come
> from `minecraft-plugin/artifacts/` — refresh them after any build with:
>
> ```bash
> cd minecraft-plugin && node tools/stage_artifacts.mjs
> ```
>
> The Render blueprint runs that script automatically on every deploy, so the
> website always serves the artifacts committed in the repo.

To build on Replit (one-time setup — downloads JDK 21 to `~/.local`):

```bash
mkdir -p ~/.local
curl -fsSL "https://download.java.net/java/GA/jdk21/fd2272bbf8e04c3dbaee13770090416c/35/GPL/openjdk-21_linux-x64_bin.tar.gz" \
  -o ~/.local/jdk21.tar.gz
tar -xzf ~/.local/jdk21.tar.gz -C ~/.local/
cd minecraft-plugin
JAVA_HOME=$HOME/.local/jdk-21 PATH=$HOME/.local/jdk-21/bin:$PATH mvn package -q
```

To build locally (recommended):

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
| `/react reload <script>` | Reload a Skript file from `plugins/Skript/scripts` |
| `/react disable <script>` | Disable a Skript file (unloads it and prefixes the file with `-`) |
| `/react enable <script>` | Enable a previously disabled Skript file |

### `/react` — Skript manager with error links

`/react` manages individual Skript files (requires `civbridge.react`, default OP,
and the Skript plugin to be installed):

- Tab completion lists your actual `.sk` files.
- **On reload errors**, the command uploads the full report to your bot server and
  sends the admin a clickable link (`https://…/errors/<token>`) to a clean error
  page — file, line number, and message for every error. No console scrolling.
- Report links expire after 1 hour (`error-report-expiry-seconds` in config.yml).
- Errors are still printed to the server log as usual, so nothing is hidden.

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
| `civbridge.react` | OP | Access to `/react` (Skript reload/disable/enable) |
| `civbridge.saber` | OP | Access to `/saber` (give lightsabers) |

---

## Lightsabers ✨

CivBridge includes **6 custom lightsaber items** built from the free
Anakin-saber Blockbench model, each with its own colored blade, name, lore,
and damage:

| Saber | Give argument | Blade damage |
|---|---|---|
| Anakin's Blue Saber | `blue` | 10 |
| Yavin Green Saber | `green` | 9 |
| Mace's Purple Saber | `purple` | 11 |
| Dark Disciple Saber | `dark` | 12 |
| Crimson Inquisitor Saber | `red` | 12 |
| Ahsoka's White Sabers | `white` | 9 |

```
/saber              # list all sabers
/saber blue         # give yourself Anakin's Blue Saber
/saber red Steve    # give one to another player
```

Sabers are real netherite swords (so they behave like swords everywhere), but
the plugin overrides melee damage with the saber's blade damage and hides the
vanilla attack attributes. They're unbreakable.

### The resource pack

The saber **models and textures ship inside the plugin JAR** and are also
copied to `minecraft-plugin/resource-pack/lightsabers.zip` for hosting:

- `src/main/resources/lightsabers/` — the pack source (pack.mcmeta + assets)
- `resource-pack/lightsabers.zip` — the ready-to-host ZIP (contents zipped, `pack.mcmeta` at root)

The pack works two ways (it includes both systems):
- **1.21.4+**: string `custom_model_data` (`custom_swords:anakin_blue` …) via `assets/minecraft/items/netherite_sword.json`
- **1.21.3 and older**: integer `CustomModelData` 1001–1006 via legacy override models

### Turning it on (server config)

1. Host `lightsabers.zip` over HTTPS. Easiest options:
   - Your Render bot service: drop the zip in the deployed files and serve it
     from the same host as the API (e.g. `https://civbot-api.onrender.com/packs/lightsabers.zip`), or
   - Any static host / GitHub Pages / S3.
2. In `plugins/CivBridge/config.yml`:

   ```yaml
   resource-pack:
     url: "https://civbot-api.onrender.com/packs/lightsabers.zip"
     sha1: "1bf88db9ea53ae56a026f3ca528448e6ce664e02"   # sha1 of YOUR hosted zip
   ```

3. `/civreload`. Players get the pack prompt on join (and immediately if
   they're online during the reload). Players must accept the pack to see the
   sabers; without it they just see plain netherite swords.

> Rebuild the zip yourself after editing textures/models in
> `src/main/resources/lightsabers/`, then update the `sha1` line.

---

## Infinity Stones & Gauntlet

Six Infinity Stones plus the **Infinity Gauntlet** — admin-gated, no recipes,
no drops. The only way any of it enters the game is `/infinity`:

```
/infinity                     # overview of the set
/infinity gauntlet [player]   # the gauntlet (carrot-on-a-stick item)
/infinity stone space [player]  # space | mind | reality | power | time | soul
```

All six textures are generated pixel art (`tools/gen_infinity_assets.mjs`), so
the stones look distinct: blue Space, yellow Mind, red Reality, purple Power,
green Time, orange Soul.

### Gameplay

1. **Socketing** — hold a stone in your main hand and **sneak + right-click**
   with the gauntlet in your off-hand. The stone is consumed into its socket;
   the gauntlet's model, name lore, and stored data update (data is persisted
   in the item, so it survives restarts).
2. **Powers** — right-click the gauntlet to fire the **last-socketed** stone's
   power (15s cooldown per stone):

| Stone | Right-click power |
|---|---|
| Space | Teleport up to 32 blocks — targeted block, or blast forward |
| Mind | Convert the mob you're looking at into a glowing bodyguard for 60s |
| Reality | Nearby foes levitate helplessly for 6s |
| Power | Shockwave that hurls and damages everything nearby |
| Time | Rewind yourself ~5s — position, health, and hunger |
| Soul | Harvest souls of creatures slain nearby in the last 10s (1 ❤ each, max 8) |

3. **The Snap** — with **all six** stones socketed, right-clicking instead
   triggers the Snap: every living thing within 24 blocks has a 50/50 chance
   to fade to dust (players only if `infinity.allow-pvp-powers: true`; bosses
   are spared). 5-minute cooldown. The gauntlet survives — it's Infinity.

Config toggles (`config.yml`):

```yaml
infinity:
  allow-pvp-powers: true   # false = powers/snap only affect mobs
  broadcast-snap: true     # server-wide "… snapped their fingers…" message
```

### Resource pack (same pack as the sabers)

The infinity assets live in `src/main/resources/civbridge-pack/` and are also
zipped to `resource-pack/civbridge-pack.zip` — this pack contains **everything**
(lightsabers + infinity). Hosting options:

- Serve `civbridge-pack.zip` instead of `lightsabers.zip` if you want both item
  sets from one pack, or
- Merge `civbridge-pack/assets/` into your existing pack folder — the namespaces
  don't collide (`custom_swords:` vs `civbridge:`), and both hook points are
  separate vanilla items (netherite_sword, netherite_axe, carrot_on_a_stick).

Modern (1.21.4+) string CMD ids: `civbridge:infinity_stone_<id>` and
`civbridge:gauntlet_<variant>`. Legacy fallbacks: stones 2001–2006 (netherite
axe), gauntlet 2101–2107 (carrot on a stick).

Rebuild after changes with:

```
node tools/build_resource_pack.mjs civbridge-pack
```

---

## Fandom Items (Parkour Civ / Naruto / Supernatural)

Eleven custom items from popular series, all with generated pixel-art
textures, unique models, and their own mechanics. Admin-gated via `/fandom`
(`civbridge.fandom`, OP default):

```
/fandom                    # list everything, grouped by series
/fandom the_colt [player]  # give an item (tab-completes)
```

### Parkour Civ / PVP Civ (Evbo)

| Item | Give id | Effect |
|---|---|---|
| Parkour Master's Boots | `parkour_boots` | Carry them: **no fall damage**, ever |
| No-Scope Eyes | `no_scope_eyes` | Right-click: 15s of truesight — every entity in 48 blocks glows |

### Naruto

| Item | Give id | Effect |
|---|---|---|
| Hidden Leaf Headband | `hidden_leaf_headband` | While held: Speed II + Jump II. Right-click: chakra burst (regen + absorption) |
| Ninja Star | `ninja_star` | Right-click to throw — infinite ammo, 6 dmg + slow on hit. 6 dmg melee |
| Summoning Scroll | `summoning_scroll` | Right-click: summon a tamed wolf companion for 3 minutes |
| Rasengan | `rasengan` | Right-click: launch a spiraling sphere — detonates for 9 dmg + heavy knockback |
| Chidori Blade | `chidori_blade` | 11 dmg melee. Right-click: lightning dash through enemies (8 dmg in path) |

### Supernatural

| Item | Give id | Effect |
|---|---|---|
| Angel Blade | `angel_blade` | 12 dmg melee, **double vs undead** |
| The First Blade | `first_blade` | 14 dmg melee — each kill heals you 2 ❤ (the Mark feeds) |
| Death's Scythe | `deaths_scythe` | 13 dmg melee. Right-click: reap — 6 dmg to everything in a 6-block ring |
| The Colt | `the_colt` | Right-click: one-shot-kill anything you're aiming at (64 blocks). 13 rounds, 30s reload. Bosses resist |

Config toggle: `fandom.allow-pvp` (default `true`). If `false`, The Colt and
other lethal effects only wound players instead of killing them.

These items ride on vanilla **netherite pickaxe / shovel / hoe** models, so
they don't collide with the sabers (netherite sword) or the infinity set
(netherite axe / carrot on a stick). Legacy CMD ranges: 3001-3004, 3101-3104,
3201-3203.

---

## Fandom Bosses 👹

Two custom bosses that give the fandom arsenal something to fight. Spawn them
with `/boss` (admin, `civbridge.boss`):

```
/boss                     → list both bosses and their mechanics
/boss kizuki_demon        → spawn the demon 4 blocks ahead of you
/boss leviathan Steve     → spawn it near another player
```

### Upper Moon, the Twelve Kizuki *(Naruto)* — `kizuki_demon`

An Enderman-styled demon with **300 ❤ / 12 ⚔** and a segmented purple boss bar:

- **Blood Demon Art: Blink** — every ~6s it melts into a swirl of blood
  particles and reappears *behind its target* (netherrack → redstone dust)
- **Summon lesser demons** — every ~14s calls 3 Cave Spider "Lesser Demons"
  that only hunt players
- **Blood roar** — below half health it gains Strength and screams

 Slayer's blades (Chidori Blade, Rasengan, First Blade, Angel Blade) deal
**1.5× damage** to it (`bosses.kizuki-slayer-bonus`).

**Drops:** Blood Crystals (redstone blocks), Eyes of Ender, and — if the
killing blow came from a fandom weapon — a guaranteed **Chidori Blade** plus a
50% **Rasengan**.

### The Leviathan *(Supernatural)* — `leviathan`

An Elder Guardian from Purgatory with **400 ❤ / 15 ⚔** and a blue boss bar:

- **Endless regeneration** — heals 2 ❤ every 2 seconds; conventional damage
  is reduced to **15%** (`bosses.leviathan-conventional-resistance`)
- **Black-blood pillars** — erupts under nearby players: 2 ❤ + upward launch
- **Tidal wave** — hurls back anything that crowds within 6 blocks

Only the hunters' weapons bite true: **Angel Blade**, **First Blade**, and
**Death's Scythe** (plus Infinity gauntlet powers) deal full damage. And as
the lore says — the Colt only wounds it (*"some things the Colt cannot
kill"*: it takes 20 dmg per shot instead of dropping dead).

**Drops:** Prismarine Shards, a **Leviathan Heart** (Heart of the Sea), and —
for a fandom-weapon kill — an **Angel Blade** plus a 33% **The Colt**.

### Notes

- Spawns are **broadcast server-wide** with coordinates
  (`bosses.broadcast-spawns: false` to silence)
- Bosses are persistent: they survive chunk unloads and server restarts and
  their boss bars return when players come back in range
- Bonus item drops only roll when the final blow was dealt by a fandom
  weapon; set `bosses.fandom-loot-requires-fandom-kill: false` to always drop
- Killing a boss grants 500 XP; vanilla drops are replaced by the loot table
- `/boss` requires no resource pack changes — bosses use vanilla mob models
  with custom names, particles, and sounds

---

## Bot Permissions Required

Make sure the bot has **Manage Roles** and **Manage Channels** in your Discord server
(already needed for the civ/religion/team/cult features).
