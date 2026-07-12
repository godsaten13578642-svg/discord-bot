---
name: db.json Persistence Pattern
description: How data and features are persisted to disk in server.js.
---

**Rule:** All game state (data object) + features + counters are saved to `db.json` in the project root.

**Why:** In-memory store is lost every time the server restarts. File-based JSON is simple and sufficient for this scale.

**How to apply:**
- At startup: load from `db.json` into `_saved`, spread into `data` and `features` with defaults
- After any mutation: call `saveDb()` — this debounces writes to 1.5s
- Interval fallback: `setInterval(saveDb, 30000)` saves every 30s as a safety net
- New counters need to be added to the `counters` object and loaded from `_saved.counters`
- New top-level data collections need to be added to the `data` object with `|| {}` fallback
