package com.civbot.skript;

import ch.njol.skript.ScriptLoader;
import ch.njol.skript.Skript;
import ch.njol.skript.log.LogEntry;
import ch.njol.skript.log.RetainingLogHandler;
import ch.njol.skript.log.SkriptLogger;
import org.bukkit.Bukkit;
import org.skriptlang.skript.lang.script.Script;
import org.bukkit.plugin.Plugin;

import java.io.File;
import java.util.ArrayList;
import java.util.List;
import java.util.function.Consumer;

/**
 * Thin wrapper around Skript's ScriptLoader that lets us reload, disable and
 * enable individual .sk files, and capture the parse errors (with file + line
 * numbers) so they can be shown to the admin as a web page instead of a
 * wall of console output.
 *
 * All Skript loading must happen on the main server thread (unless Skript's
 * async loader is enabled, which ScriptLoader handles internally); we always
 * hop back to the main thread before delivering results.
 */
public class SkriptScriptManager {

    /** One captured Skript error/warning. */
    public record ScriptIssue(String level, String file, int line, String message) {}

    /** Result of any script operation. */
    public record ScriptResult(boolean success, int errorCount, List<ScriptIssue> issues) {}

    private final Plugin plugin;
    private boolean hookUsable;

    public SkriptScriptManager(Plugin plugin) {
        this.plugin = plugin;
        // Probe Skript once so /react can fail fast with a friendly message.
        try {
            Plugin skript = Bukkit.getPluginManager().getPlugin("Skript");
            hookUsable = skript != null && skript.isEnabled();
            if (!hookUsable) {
                plugin.getLogger().warning("Skript not found — /react cannot manage scripts until Skript is installed.");
            }
        } catch (Throwable t) {
            hookUsable = false;
            plugin.getLogger().warning("Skript hook failed to initialize: " + t.getMessage());
        }
    }

    public boolean isHookUsable() {
        return hookUsable;
    }

    // ── Public operations ────────────────────────────────────────────────────

    /** Reload a script by its (relative) name, e.g. "spawn" or "spawn.sk". */
    public void reload(String scriptName, Consumer<ScriptResult> callback) {
        runOnMainThread(() -> {
            File file = ScriptLoader.getScriptFromName(scriptName);
            if (file == null) {
                callback.accept(notFound(scriptName));
                return;
            }
            if (ScriptLoader.getDisabledScriptsFilter().accept(file)) {
                callback.accept(new ScriptResult(false, 1, List.of(new ScriptIssue(
                    "error", file.getName(), -1,
                    "Script is disabled — enable it first with /react enable " + scriptName))));
                return;
            }
            reloadFile(file, callback);
        });
    }

    /** Disable a script — unloads it and renames the file with a "-" prefix. */
    public void disable(String scriptName, Consumer<ScriptResult> callback) {
        runOnMainThread(() -> {
            File file = ScriptLoader.getScriptFromName(scriptName);
            if (file == null) {
                callback.accept(notFound(scriptName));
                return;
            }
            if (ScriptLoader.getDisabledScriptsFilter().accept(file)) {
                callback.accept(new ScriptResult(true, 0, List.of())); // already disabled — idempotent
                return;
            }
            try {
                Script script = ScriptLoader.getScript(file);
                if (script != null) ScriptLoader.unloadScript(script);
                File disabled = new File(file.getParentFile(), ScriptLoader.DISABLED_SCRIPT_PREFIX + file.getName());
                if (!file.renameTo(disabled)) {
                    throw new IllegalStateException("Could not rename " + file.getName() + " to " + disabled.getName());
                }
                plugin.getLogger().info("Disabled Skript script: " + file.getName());
                callback.accept(new ScriptResult(true, 0, List.of()));
            } catch (Throwable t) {
                callback.accept(new ScriptResult(false, 1, List.of(new ScriptIssue(
                    "error", file.getName(), -1, "Failed to disable: " + t.getMessage()))));
            }
        });
    }

    /** Enable a disabled script (rename back) and load it. */
    public void enable(String scriptName, Consumer<ScriptResult> callback) {
        runOnMainThread(() -> {
            File file = ScriptLoader.getScriptFromName(scriptName);
            if (file == null) {
                callback.accept(notFound(scriptName));
                return;
            }
            if (ScriptLoader.getLoadedScriptsFilter().accept(file)) {
                callback.accept(new ScriptResult(true, 0, List.of())); // already enabled — idempotent
                return;
            }
            File enabled = new File(file.getParentFile(),
                file.getName().substring(ScriptLoader.DISABLED_SCRIPT_PREFIX_LENGTH));
            try {
                if (!file.renameTo(enabled)) {
                    throw new IllegalStateException("Could not rename " + file.getName() + " to " + enabled.getName());
                }
            } catch (Throwable t) {
                callback.accept(new ScriptResult(false, 1, List.of(new ScriptIssue(
                    "error", file.getName(), -1, "Failed to enable: " + t.getMessage()))));
                return;
            }
            plugin.getLogger().info("Enabled Skript script: " + enabled.getName());
            reloadFile(enabled, callback);
        });
    }

    // ── Internals ────────────────────────────────────────────────────────────

    private ScriptResult notFound(String scriptName) {
        return new ScriptResult(false, 1, List.of(new ScriptIssue(
            "error", scriptName, -1,
            "Script not found in plugins/Skript/scripts (or its subfolders).")));
    }

    private void reloadFile(File file, Consumer<ScriptResult> callback) {
        RetainingLogHandler logHandler = new RetainingLogHandler().start();
        try {
            Script script = ScriptLoader.getScript(file);
            if (script != null) ScriptLoader.unloadScript(script);
            ScriptLoader.loadScripts(file, logHandler).whenComplete((info, err) ->
                Bukkit.getScheduler().runTask(plugin, () -> {
                    if (err != null) {
                        logHandler.stop();
                        callback.accept(new ScriptResult(false, 1, List.of(new ScriptIssue(
                            "error", file.getName(), -1,
                            "Internal error while reloading: " + err))));
                    } else {
                        callback.accept(buildResult(file, logHandler));
                    }
                }));
        } catch (Throwable t) {
            logHandler.stop();
            callback.accept(new ScriptResult(false, 1, List.of(new ScriptIssue(
                "error", file.getName(), -1, "Internal error while reloading: " + t))));
        }
    }

    private ScriptResult buildResult(File file, RetainingLogHandler logHandler) {
        // Errors still go to the console/server log, exactly like a normal reload,
        // so nothing is silently swallowed.
        logHandler.printErrors((String) null);
        List<ScriptIssue> issues = new ArrayList<>();
        for (LogEntry entry : logHandler.getLog()) {
            issues.add(new ScriptIssue(
                entry.level.intValue() >= SkriptLogger.SEVERE.intValue() ? "error" : "warning",
                fileNameOf(entry, file),
                lineOf(entry),
                entry.getMessage()));
        }
        int errors = logHandler.getNumErrors();
        return new ScriptResult(errors == 0, errors, issues);
    }

    private String fileNameOf(LogEntry entry, File fallback) {
        try {
            if (entry.node != null && entry.node.getConfig().getFile() != null) {
                return entry.node.getConfig().getFile().getName();
            }
        } catch (Throwable ignored) {}
        return fallback.getName();
    }

    private int lineOf(LogEntry entry) {
        try {
            if (entry.node != null) return entry.node.getLine();
        } catch (Throwable ignored) {}
        return -1;
    }

    private void runOnMainThread(Runnable task) {
        if (Bukkit.isPrimaryThread()) task.run();
        else Bukkit.getScheduler().runTask(plugin, task);
    }
}
