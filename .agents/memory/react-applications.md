---
name: React Orb requests (!Reactapp)
description: How players order an item with a React Orb in DMs and how owners review, build and deliver it.
---

**Rule:** `/reactapp` (the `!Reactapp` prefix still works — see [slash commands](slash-commands.md))
is an **orb-for-item request queue**, not a React-design submission. A player
spends a React Orb and asks for an item back; the orb hand-over and the item delivery both happen
**in game** (never over Discord), and the app exists so nobody has to catch an owner in real time.

It is a **DM interview**, not a channel command. The questions scale with the tier:

| Tiers | Rank | Asked for |
| --- | --- | --- |
| Common · Uncommon · Rare | 1–3 | wanted item, name |
| Epic | 4 | name, wanted item, **suggested** ability list (a wishlist, owners trim it) |
| Legendary … Transcend | 5–11 | name, wanted item, full ability list |

Every tier then answers two logistics questions, in this order:
- **`mcUsername`** — the in-game name the item is handed to (`/^[A-Za-z0-9_]{3,16}$/`). When the
  player has linked with `/link` the bot knows the name (`data.linkedNames[discordId]`, written at
  link-confirm and cleared on unlink), offers it in the prompt and accepts `yes` for it.
- **`delivery`** — base coords (with an optional dimension) to leave it in a chest, or `wait` to hand
  it over while the player is online.

That list is `fieldsForTier(tier)` in `react-applications.js` (design fields → name → delivery).

The lifecycle is **draft → submitted → allowed → queued → delivered**:
- `submit` files the request on the owners' to-do list as a `T-` item (`/todo`) and DMs every owner.
- Owners/admins review with `/reactapp list|pending|view|comment|dim|approve|reject <id>`;
  `dim <id> <text>` records the note **and reopens the interview** so the player redoes their own
  answers.
- **Allowing does not close the job.** The customer is asked to confirm the order; `/reactapp confirm
  <id>` (or just replying `confirm` to the DM) moves it to `queued` with stage `not_started`.
  Only a **rejection** or a **delivery** closes the to-do item.
- Owners walk the delivery board with `/reactapp stage <id> <not_started|making|almost|ready|delivered>`
  (keys, labels, aliases like `done`, or button numbers all parse). `ready` and `delivered` DM the
  customer; `delivered` is terminal and closes the to-do item.

**Why:** requests must land somewhere the owner actually looks, the tier gate keeps the interview
short for low tiers, and the confirm step stops an owner building something the customer no longer
wants.

**How to apply:**
- Pure flow lives in `react-applications.js` (no discord.js — test it directly); Discord wiring,
  owner DMs and the to-do list live in `server.js` under the "React Applications" banner.
- Review and delivery actions are shared: `reviewComment` / `reviewDim` / `reviewDecide` /
  `confirmApplication` / `setDeliveryStage` in `server.js` are called by both the `/reactapp`
  commands and the dashboard API, with an `{ id, name }` actor — never fork the logic, or Discord and
  the web will drift. `setDeliveryStage` also closes the to-do item on `delivered`. The Discord side
  is registered in `SLASH_COMMANDS` (see [slash commands](slash-commands.md)).
- Dashboard endpoints (owner/master, scoped by `serverIdsForUser`; a DM-started request has no
  guild, so it stays visible to owners):
  `GET /api/react-applications` · `GET /api/react-applications/:id` ·
  `POST /api/react-applications/:id/comment|dim|approve|reject|stage` ·
  `GET /api/owner-todos` · `POST /api/owner-todos/:id/done`.
  Rows are decorated with `tierLabel` / `rank` / `statusLabel` / `stageLabel` / `deliveryLabel` /
  `todoOpen`. The frontend tab is `React Apps` in `frontend/src/App.js` (`DELIVERY_STAGES` there
  mirrors the server list — keep the keys in step).
- **One open to-do item per request**: a resubmission after a dim-down updates the existing `T-`
  line instead of stacking duplicates (see `fileApplication`, and `refreshAppTodo` which keeps the
  line in step with the stage).
- State persists as `data.reactApplications['RA-N']` + `data.ownerTodos['T-N']`, with
  `counters.reactApp` / `counters.todo` for the ids (see [persistence pattern](persistence-pattern.md)).
  Linked Minecraft names live in `data.linkedNames['<discordId>']` — it is written on link-confirm
  and deleted on unlink, and is not part of `linkedAccounts` (that one is keyed by MC UUID).
- **The bot needs the `DirectMessages` gateway intent** (`GatewayIntentBits.DirectMessages`,
  non-privileged — no Developer Portal toggle) plus `Partials.Channel`, or DM replies never arrive.
- Admin check order: configured owner DM username → `OWNER_DISCORD_IDS`/`ADMIN_DISCORD_IDS` env →
  Discord `Manage Server`/`Administrator`.
- Tests: `test-react-applications.js` (state machine) and `test-react-app-commands.js` (boots
  server.js against a stubbed gateway and drives the whole flow, including the slash-command
  registration + interaction path).
