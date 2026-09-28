# Discord Civilization Bot & Website

A comprehensive Discord bot system for managing civilizations, religions, economies, and community engagement.

## Features

### 👤 User System
- Discord verification
- New member onboarding
- Welcome messages
- Auto roles
- Inactive member tracking
- Account age checks
- Custom profile cards
- Reputation system
- XP & leveling
- Activity tracking
- Custom status badges

### 📊 Rank System
- Server ranks (Owner, Co-Owner, Developer, Administrator, etc.)
- Automatic rank assignment based on activity, message count, voice time, reactions, boosts

### 🏛 Civilization System
- Create and manage civilizations
- Custom role hierarchies
- Civilization-specific permissions
- Activity tracking per civilization

### 🔐 Bot Permissions System
- Customizable role permissions per civilization
- No direct Discord permissions needed

### 🎤 Private Voice Channel System
- On-demand voice channel creation
- Lock/unlock, user limits, rename, kick/ban users
- Temporary channels with auto-delete

### ⚔ Military System
- Military ranks and roles
- Military-only channels
- Strategy management

### ✝ Religion System
- Create religions
- Private chats and voice channels
- Religious leaders can manage ceremonies and announcements

### 🗳 Voting & Elections
- Yes/No, multiple choice, ranked choice voting
- Anonymous voting option
- Quorum requirements
- Election system with candidate registration

### 📅 Events & 🏆 Elections
- Create meetings, wars, festivals, tournaments
- Automatic reminders
- Election cycles and term limits

### 🤝 Diplomacy
- Alliance requests
- Peace treaties
- Rivalry declarations
- History tracking

### 🎖 Honors System
- Award badges (Hero, Veteran, Founder, Builder, Diplomat, War Hero, Champion, Legend)
- Display on custom profile cards

### 🎫 Ticket System
- Support tickets
- Appeals
- Bug reports
- Player reports

### 💡 Suggestions
- Community suggestions with reactions
- Status tracking (Under Review, Planned, Approved, Denied, Implemented)

### 📜 Laws & 📖 Wiki
- Civilization-specific laws
- Searchable wiki built into Discord

### 🤖 Automation
- Auto role assignment
- Inactive role removal
- Channel archival
- Reminder system

### 💬 Slash commands
- Every command is a real Discord slash command — type `/` and pick one
  (`/balance`, `/pay`, `/giveaway`, `/reactapp`, `/todo`, …)
- The old `!` prefix still works for all of them, so nothing has to change at once
- Discord reserves `/` for *registered* commands: a plain message starting with `/` never reaches the
  bot, which is why the commands are registered rather than just prefixed with a slash
- Commands are registered globally and per guild on join, so a newly added server gets them instantly
- `/help` lists everything; the DM interview answers stay plain messages

### 🎬 React Orb requests (delivery desk)
A player **spends a React Orb and orders an item back** — the app is the queue so nobody has to catch
an owner in real time. The orb hand-over and the item delivery both happen **in game**; the bot only
records the request.
- `/reactapp` DMs the player the questions their tier needs
- Common / Uncommon / Rare ask for the wanted item + name; Epic adds a *suggested* ability list;
  Legendary and above ask for the full ability list. Every tier then asks for the player's
  **Minecraft username** (offered automatically when they have linked with `/link`, so `yes` is enough)
  and **where to deliver it**: base coords (`120 64 -340 nether`) or `wait` to get it in person
- Owners/admins review from Discord: `/reactapp list` / `view` / `comment` / `dim` / `approve` / `reject`
- A dim-down request reopens the interview so the player revises their own answers
- **Allow → confirm → deliver**: allowing asks the customer to confirm the order in DMs
  (`/reactapp confirm <id>`); the job then sits on the delivery board until an owner marks it
  delivered
- Owners move the job with `/reactapp stage <id> <not_started|making|almost|ready|delivered>` —
  `ready` and `delivered` DM the customer automatically
- Every request is filed on the owners' to-do list (`/todo`) and stays there until it is delivered
- **React Apps dashboard tab** — the queue (applicant + in-game name, orb, wanted item, progress,
  delivery) plus a delivery board with Not-started / Started-making / Almost-done / Ready / Delivered
  buttons and a review note, next to the live owner to-do list (server owners only see their own
  servers' requests)

### 📈 Analytics Dashboard
- Member growth tracking
- Activity metrics
- Event attendance
- Custom dashboard for admins

### ⭐ Quality-of-Life Features
- /afk command
- /remind command
- Starboard
- Giveaway system
- Birthday reminders
- Server statistics channels
- Custom embed builder
- Anonymous confessions

## Quick Start

See [SETUP.md](./SETUP.md) for installation and running instructions.
