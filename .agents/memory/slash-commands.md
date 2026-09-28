---
name: Slash commands (/command + !command)
description: Every bot command is a registered slash command and still answers the ! prefix, through one shared implementation.
---

**Rule:** a command is implemented **once** in `runCommand(message, cmd, args)` in `server.js`. Both
entry points call it — the `!` prefix path (`Events.MessageCreate`) and the slash path
(`Events.InteractionCreate` → `handleSlashCommand`). Never fork a command into "the slash version"
and "the prefix version".

**Why:** Discord reserves the `/` composer. Typing `/anything` opens the command picker, and a plain
message starting with `/` is swallowed by the client and never delivered to the bot — so a
`/`-as-a-text-prefix would be invisible. The commands have to be *registered* application commands,
and registering them is what makes `/balance` typos-into the picker the way users expect.

**How to apply:**
- To add a command: write the handler in `runCommand` (as `cmd === 'name'`), then add a line to
  `SLASH_COMMANDS` — `slash('name', 'description', [options])`. Default options are `FREE_ARGS`
  (`{ name: 'args' }`), which behaves exactly like the rest of a `!name one two` line.
- Use explicit options only where the shape matters: `userOpt` for `@mentions` (the handler strips
  `<@!>` off `args[0]`, so a bare id works), `intOpt` for numbers, `strOpt` for a fixed first word
  plus free text (e.g. `reactapp`'s `action` + `rest`).
- `slashArgs(interaction)` maps options → `args` by flattening every value on whitespace, which is
  what keeps `/todo add buy torches` identical to `!todo add buy torches`.
- The interaction is **deferred** before the command runs (some commands hit the API), the adapter
  supplies `author` / `member` / `guild` / `channel` / `reply`, and a command that answers nothing
  gets a `✅ Done.` so it never sticks on "thinking…".
- Registration happens in `ClientReady` (global via `c.application.commands.set`, plus per-guild via
  `g.commands.set(ALL_SLASH_COMMANDS)` for instant availability) and in `GuildCreate` for new guilds.
- Discord limits: names/option names `^[-_\p{L}\p{N}]{1,32}$`, descriptions ≤ 100 chars, ≤ 100 global
  commands. `test-react-app-commands.js` asserts these on the real registry — extend `SLASH_COMMANDS`
  and the test keeps checking you.
- Feature flags still apply: `features.commandsEnabled` gates both paths, and the DM interview
  (`handleApplicationDm`) is plain text either way.
