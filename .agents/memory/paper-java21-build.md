---
name: Paper 1.21.4 Java 21 Build
description: How to build the CivBridge plugin; Paper 1.21.4 needs Java 21 which Replit doesn't ship.
---

**Rule:** Paper 1.21.4 API JAR is compiled with Java 21 (class version 65.0). Replit's default GraalVM CE 22.3.1 is Java 19 (max 61.0). You MUST use Java 21 to compile the plugin.

**Why:** `bad class file` errors cascade into hundreds of `cannot find symbol` errors because the entire Paper API is unreadable to Java 19.

**How to apply:** Download JDK 21 to `~/.local/jdk-21` using the OpenJDK download URL in SETUP.md, then set `JAVA_HOME=$HOME/.local/jdk-21` when running `mvn package`. This is a one-time setup per Replit container lifecycle (downloaded to `~/.local` which survives restarts but not rebuilds).

Also note: `AdvancementDisplay` in Paper 1.21.4 is `io.papermc.paper.advancement.AdvancementDisplay` — NOT `org.bukkit.advancement.AdvancementDisplay`.
