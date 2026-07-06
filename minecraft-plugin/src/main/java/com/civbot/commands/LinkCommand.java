package com.civbot.commands;

import com.civbot.CivBridgePlugin;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.entity.Player;

public class LinkCommand implements CommandExecutor {

    private final CivBridgePlugin plugin;

    public LinkCommand(CivBridgePlugin plugin) {
        this.plugin = plugin;
    }

    @Override
    public boolean onCommand(CommandSender sender, Command cmd, String label, String[] args) {
        if (!(sender instanceof Player player)) {
            sender.sendMessage("§cOnly players can use this command.");
            return true;
        }

        if (cmd.getName().equalsIgnoreCase("unlink")) {
            if (!plugin.isLinked(player.getUniqueId())) {
                player.sendMessage("§eYour account is not linked to Discord.");
                return true;
            }
            plugin.unlink(player.getUniqueId());
            player.sendMessage("§aYour Minecraft account has been unlinked from Discord.");
            return true;
        }

        // /link command
        if (plugin.isLinked(player.getUniqueId())) {
            player.sendMessage("§aYour account is already linked to Discord! Use §c/unlink §ato remove the link.");
            return true;
        }

        String code = plugin.generateLinkCode(player.getUniqueId());

        player.sendMessage("§6═══════════════════════════════");
        player.sendMessage("§e  Link your Discord account:");
        player.sendMessage("");
        player.sendMessage("§7Type in Discord:  §b!link " + code);
        player.sendMessage("");
        player.sendMessage("§7Code expires in §f5 minutes§7.");
        player.sendMessage("§6═══════════════════════════════");

        return true;
    }
}
