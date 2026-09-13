package com.civbot.commands;

import com.civbot.CivBridgePlugin;
import com.civbot.lightsaber.ResourcePackListener;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.entity.Player;

/**
 * /civpack — in-game resource-pack diagnostics.
 *
 * Shows the live pack URL and SHA-1 (whichever source is active: embedded
 * server or external URL), lets players re-request the pack prompt without
 * rejoining, and gives admins a copy-paste config snippet for the fallback.
 */
public final class CivPackCommand implements CommandExecutor {

    private final CivBridgePlugin plugin;

    public CivPackCommand(CivBridgePlugin plugin) {
        this.plugin = plugin;
    }

    @Override
    public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
        ResourcePackListener pack = plugin.getResourcePackListener();

        if (args.length > 0 && args[0].equalsIgnoreCase("reload")) {
            if (pack == null) {
                sender.sendMessage("§cNo resource pack is active — nothing to re-send.");
                return true;
            }
            if (sender instanceof Player player) {
                pack.applyTo(player);
                sender.sendMessage("§a✦ Re-sent the resource pack prompt — check your chat for the download.");
            } else {
                pack.applyToOnline();
                sender.sendMessage("§a✦ Re-sent the resource pack prompt to everyone online.");
            }
            return true;
        }

        boolean admin = sender.hasPermission("civbridge.admin");
        sender.sendMessage("§8§m                                        ");
        sender.sendMessage("§b✦ §f§lCivBridge Resource Pack");
        if (pack == null) {
            sender.sendMessage("§c✕ No pack is active — custom items will look vanilla.");
            sender.sendMessage("§7Enable §fresource-pack.embedded§7 in config.yml or set §fresource-pack.url§7, then §f/civreload§7.");
        } else {
            String url = pack.getUrl();
            boolean embedded = plugin.getPackServer() != null && plugin.getPackServer().isRunning();
            sender.sendMessage("§7Source: " + (embedded ? "§aembedded server" : "§dexternal URL"));
            if (admin) {
                sender.sendMessage("§7URL:   §f" + url);
                sender.sendMessage("§7SHA-1: §f" + pack.getSha1Hex());
            } else {
                sender.sendMessage("§7Status: §aactive §7— you should have been prompted on join.");
            }
            if (admin && embedded) {
                String external = plugin.getConfig().getString("public-url", "");
                if (external == null || external.isBlank()) external = plugin.getConfig().getString("api-url", "");
                if (external != null && !external.isBlank()) {
                    sender.sendMessage("§7Website fallback: §f" + external.replaceAll("/$", "") + "/downloads/pack");
                }
            }
        }
        sender.sendMessage("§7Troubleshooting:");
        sender.sendMessage("§8• §7Items look vanilla? §f/civpack reload §7re-prompts the download.");
        sender.sendMessage("§8• §7Prompt missed? Check §fOptions → Resource Packs§7 shows CivBridge as applied.");
        sender.sendMessage("§8• §7Still stuck? Press §fF3+T§7 to force an asset reload.");
        sender.sendMessage("§8§m                                        ");
        return true;
    }
}
