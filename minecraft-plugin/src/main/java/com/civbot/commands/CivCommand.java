package com.civbot.commands;

import com.civbot.CivBridgePlugin;
import com.google.gson.JsonObject;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.entity.Player;

public class CivCommand implements CommandExecutor {

    private final CivBridgePlugin plugin;

    public CivCommand(CivBridgePlugin plugin) {
        this.plugin = plugin;
    }

    @Override
    public boolean onCommand(CommandSender sender, Command cmd, String label, String[] args) {
        if (!(sender instanceof Player player)) {
            sender.sendMessage("§cOnly players can use this command.");
            return true;
        }

        String discordId = plugin.getDiscordId(player.getUniqueId());
        if (discordId == null) {
            player.sendMessage("§cYou haven't linked your Discord account. Use §b/link§c.");
            return true;
        }

        player.sendMessage("§7Fetching your civilization data…");

        // Async fetch from API
        plugin.getServer().getScheduler().runTaskAsynchronously(plugin, () -> {
            JsonObject profile = plugin.getApiClient().getLinkedProfile(discordId);

            plugin.getServer().getScheduler().runTask(plugin, () -> {
                if (profile == null) {
                    player.sendMessage("§cCould not fetch profile from the bot server.");
                    return;
                }

                player.sendMessage("§6§l═══ Civilization Profile ═══");

                if (profile.has("civilization") && !profile.get("civilization").isJsonNull()) {
                    player.sendMessage("§e🏛️ Civilization: §f" + profile.get("civilization").getAsString());
                } else {
                    player.sendMessage("§7🏛️ Civilization: §8None");
                }

                if (profile.has("religion") && !profile.get("religion").isJsonNull()) {
                    player.sendMessage("§d✝️ Religion: §f" + profile.get("religion").getAsString());
                } else {
                    player.sendMessage("§7✝️ Religion: §8None");
                }

                if (profile.has("team") && !profile.get("team").isJsonNull()) {
                    player.sendMessage("§a🛡️ Team: §f" + profile.get("team").getAsString());
                } else {
                    player.sendMessage("§7🛡️ Team: §8None");
                }

                if (profile.has("balance")) {
                    player.sendMessage("§6💰 Gold: §f" + profile.get("balance").getAsInt());
                }

                if (profile.has("level")) {
                    player.sendMessage("§b⭐ Level: §f" + profile.get("level").getAsInt());
                }
            });
        });

        return true;
    }
}
