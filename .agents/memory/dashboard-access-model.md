---
name: Dashboard access model
description: Durable authorization rule for dashboard accounts, servers, features, and Discord channel visibility.
---

The master account is the global administrator. Server owners can only view and manage the server settings assigned to them; they must not receive the master account list or other servers.

**Why:** The dashboard is multi-server, so UI-only hiding is insufficient—server and feature authorization must be enforced at the API boundary.

**How to apply:** When adding a server-scoped endpoint, authenticate it and validate the requested server against the current account's ownership mappings. Keep server registration, deletion, account listing, promotion, and multi-server administration master-only.

**Servers register themselves.** `syncGuilds()` in `server.js` reconciles `data.servers` with Discord: it runs on `ClientReady` (force), when the bot joins a guild (`registerGuild`), and lazily from `GET /api/servers` when the caller's list is empty while the bot is connected. It reads the gateway cache and falls back to `client.guilds.fetch()` when that cache is empty or holds nameless partials, marks servers the bot is no longer in with `goneAt` (never deletes them — their feature settings survive), and is throttled to once a minute so the 8s dashboard poll can't hammer Discord. `POST /api/servers/sync` (master) forces it for the dashboard's Sync button; manual `POST /api/servers/add` is only for a server the bot cannot see yet.

It also runs on a **background timer** (`guildSyncTick`, every 5 minutes via `GUILD_SYNC_MINUTES`, `0` disables) so joins and leaves are caught with nobody watching the dashboard; it is silent unless something changed, no-ops while the bot is offline, and `global.__guildSyncTick` is exposed so tests can run one pass without waiting.

**A removal must be loud.** Flagging a server `goneAt` is not enough — the owners are DM'd once per removal (`markServerGone`, called from both the live `GuildDelete` event and a later `syncGuilds`) and the dashboard shows a warning banner on every tab until the bot is re-invited or the entry is removed; coming back sends the opposite DM (`markServerBack`) and clears the flag. Each successful pass stamps `data.lastServerSync` (`{ at, total, added, gone }`), read by `GET /api/servers/sync-status` for the Servers tab's last-checked badge — so "is detection alive?" never depends on reading a log. Re-read the current account role during authentication so transfers and demotions take effect immediately instead of waiting for JWT expiry.