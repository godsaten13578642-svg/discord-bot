package com.civbot.commands;

import com.civbot.CivBridgePlugin;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;

public class DiscordCommand implements CommandExecutor {

    private final CivBridgePlugin plugin;

    public DiscordCommand(CivBridgePlugin plugin) {
        this.plugin = plugin;
    }

    @Override
    public boolean onCommand(CommandSender sender, Command cmd, String label, String[] args) {
        sender.sendMessage("§9§l Discord Integration");
        sender.sendMessage("§7This server is connected to the Civilization Bot.");
        sender.sendMessage("§7Use §b/link §7to connect your Discord account.");
        sender.sendMessage("§7Once linked, your Discord civilizations and stats sync here.");

        boolean linked = (sender instanceof org.bukkit.entity.Player player)
            && plugin.isLinked(player.getUniqueId());

        if (linked) {
            sender.sendMessage("§a✅ Your account is linked!");
        } else {
            sender.sendMessage("§c❌ Not linked — type §b/link §cto get started.");
        }

        return true;
    }
}
