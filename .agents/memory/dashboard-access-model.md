---
name: Dashboard access model
description: Durable authorization rule for dashboard accounts, servers, features, and Discord channel visibility.
---

The master account is the global administrator. Server owners can only view and manage the server settings assigned to them; they must not receive the master account list or other servers.

**Why:** The dashboard is multi-server, so UI-only hiding is insufficient—server and feature authorization must be enforced at the API boundary.

**How to apply:** When adding a server-scoped endpoint, authenticate it and validate the requested server against the current account's ownership mappings. Keep server registration, deletion, account listing, promotion, and multi-server administration master-only. Re-read the current account role during authentication so transfers and demotions take effect immediately instead of waiting for JWT expiry.