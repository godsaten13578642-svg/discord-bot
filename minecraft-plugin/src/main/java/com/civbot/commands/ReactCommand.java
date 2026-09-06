package com.civbot.commands;

import com.civbot.CivBridgePlugin;
import com.civbot.skript.SkriptScriptManager;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.command.TabCompleter;
import org.jetbrains.annotations.NotNull;
import org.jetbrains.annotations.Nullable;

import java.io.File;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * /react <reload|disable|enable> <script>
 *
 * Reloads, disables or enables a single Skript file from plugins/Skript/scripts.
 * If a reload produces errors, the admin gets a short link to a web page
 * showing the full error report — no console digging required.
 */
public class ReactCommand implements CommandExecutor, TabCompleter {

    private static final String PERMISSION = "civbridge.react";

    private final CivBridgePlugin plugin;
    private final SkriptScriptManager scripts;

    public ReactCommand(CivBridgePlugin plugin, SkriptScriptManager scripts) {
        this.plugin = plugin;
        this.scripts = scripts;
    }

    @Override
    public boolean onCommand(@NotNull CommandSender sender, @NotNull Command cmd,
                             @NotNull String label, String[] args) {
        if (!sender.hasPermission(PERMISSION)) {
            sender.sendMessage("§cYou don't have permission to use /react.");
            return true;
        }

        if (args.length < 1) {
            sendUsage(sender, label);
            return true;
        }

        String action = args[0].toLowerCase(Locale.ROOT);
        if (!action.equals("reload") && !action.equals("disable") && !action.equals("enable")) {
            sendUsage(sender, label);
            return true;
        }

        if (args.length < 2 || args[1].isBlank()) {
            sender.sendMessage("§cUsage: /" + label + " " + action + " <script name>");
            return true;
        }

        if (!scripts.isHookUsable()) {
            sender.sendMessage("§cSkript is not installed/enabled, so /react can't manage scripts.");
            return true;
        }

        // Join remaining args so folders with spaces work: /react reload my folder/script
        String scriptName = String.join(" ", java.util.Arrays.copyOfRange(args, 1, args.length)).trim();
        final String script = scriptName.endsWith("/") ? scriptName.substring(0, scriptName.length() - 1) : scriptName;

        sender.sendMessage("§7" + capital(action) + "ing Skript §b" + scriptName + "§7…");

        java.util.function.Consumer<SkriptScriptManager.ScriptResult> handler =
            result -> deliver(sender, action, script, result);

        switch (action) {
            case "reload"  -> scripts.reload(scriptName, handler);
            case "disable" -> scripts.disable(scriptName, handler);
            case "enable"  -> scripts.enable(scriptName, handler);
        }
        return true;
    }

    private void deliver(CommandSender sender, String action, String scriptName,
                         SkriptScriptManager.ScriptResult result) {
        if (result.success() && result.errorCount() == 0) {
            switch (action) {
                case "reload"  -> sender.sendMessage("§a✔ Reloaded §b" + scriptName + "§a without errors.");
                case "disable" -> sender.sendMessage("§a✔ Disabled §b" + scriptName + "§a.");
                case "enable"  -> sender.sendMessage("§a✔ Enabled §b" + scriptName + "§a.");
            }
            return;
        }

        // Already disabled/enabled messages come back as success with a note
        sender.sendMessage("§c✘ " + capital(action) + " of §b" + scriptName + "§c finished with "
            + result.errorCount() + " error(s):");

        // Show at most 3 issues inline; the full report lives behind the link.
        int shown = 0;
        for (SkriptScriptManager.ScriptIssue issue : result.issues()) {
            if (shown++ >= 3) break;
            String where = issue.line() > 0 ? " (line " + issue.line() + ")" : "";
            sender.sendMessage("§8 • §c" + issue.file() + where + "§7: " + issue.message());
        }
        int more = result.issues().size() - shown;
        if (more > 0) sender.sendMessage("§8 … and " + more + " more (see link below)");

        // Upload the report and give the admin a clickable link.
        String link = plugin.getApiClient().postErrorReport(
            "Skript " + action + " failed: " + scriptName, scriptName, action, result);
        if (link != null) {
            sender.sendMessage("§e➜ Full error report: §b§n" + link);
        } else {
            sender.sendMessage("§7(Could not reach the bot API for a report link — check the console instead.)");
        }
    }

    private void sendUsage(CommandSender sender, String label) {
        sender.sendMessage("§6── /" + label + " ──");
        sender.sendMessage("§e/" + label + " reload <script>§7 — reload a .sk file");
        sender.sendMessage("§e/" + label + " disable <script>§7 — unload a .sk file (won't load next restart)");
        sender.sendMessage("§e/" + label + " enable <script>§7 — load a disabled .sk file");
        sender.sendMessage("§7Example: §f/" + label + " reload spawn");
    }

    private String capital(String s) {
        return s.isEmpty() ? s : Character.toUpperCase(s.charAt(0)) + s.substring(1);
    }

    @Override
    public @Nullable List<String> onTabComplete(@NotNull CommandSender sender, @NotNull Command cmd,
                                                @NotNull String alias, String[] args) {
        if (!sender.hasPermission(PERMISSION)) return List.of();

        if (args.length == 1) {
            String p = args[0].toLowerCase(Locale.ROOT);
            List<String> out = new ArrayList<>();
            for (String s : List.of("reload", "disable", "enable")) {
                if (s.startsWith(p)) out.add(s);
            }
            return out;
        }

        if (args.length == 2) {
            String prefix = args[1].toLowerCase(Locale.ROOT);
            List<String> out = new ArrayList<>();
            File scriptsFolder = new File(plugin.getDataFolder().getParentFile(), "Skript/scripts");
            listScripts(scriptsFolder, "", prefix, out, 40);
            return out;
        }
        return List.of();
    }

    /** Recursively collect .sk file names (with folder path, without leading "-"). */
    private void listScripts(File dir, String relPath, String prefix, List<String> out, int limit) {
        if (out.size() >= limit || dir == null || !dir.isDirectory()) return;
        File[] files = dir.listFiles();
        if (files == null) return;
        for (File f : files) {
            if (f.isHidden() || f.getName().startsWith(".")) continue;
            String name = relPath.isEmpty() ? f.getName() : relPath + "/" + f.getName();
            if (f.isDirectory()) {
                listScripts(f, name, prefix, out, limit);
            } else if (name.toLowerCase(Locale.ROOT).endsWith(".sk")) {
                String clean = name.startsWith("-") ? name.substring(1) : name;
                if (clean.toLowerCase(Locale.ROOT).startsWith(prefix)) {
                    out.add(clean);
                }
            }
            if (out.size() >= limit) return;
        }
    }
}
