package com.civbot.listeners;

import com.civbot.CivBridgePlugin;
import com.civbot.api.ApiClient;
import net.kyori.adventure.text.serializer.plain.PlainTextComponentSerializer;
import io.papermc.paper.advancement.AdvancementDisplay;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.entity.PlayerDeathEvent;
import org.bukkit.event.player.PlayerAdvancementDoneEvent;
import org.bukkit.event.player.PlayerJoinEvent;
import org.bukkit.event.player.PlayerQuitEvent;

import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

public class PlayerListener implements Listener {

    private final CivBridgePlugin plugin;

    public PlayerListener(CivBridgePlugin plugin) {
        this.plugin = plugin;
    }

    @EventHandler(priority = EventPriority.MONITOR)
    public void onJoin(PlayerJoinEvent event) {
        String name = event.getPlayer().getName();

        if (plugin.getConfig().getBoolean("announce-join", true)) {
            String fmt = plugin.getConfig().getString("join-format", "✅ **{player}** joined the server");
            plugin.getApiClient().postMcEvent("player_join", name,
                fmt.replace("{player}", name), null);
        }

        // Update player list
        updatePlayerList();
    }

    @EventHandler(priority = EventPriority.MONITOR)
    public void onQuit(PlayerQuitEvent event) {
        String name = event.getPlayer().getName();

        if (plugin.getConfig().getBoolean("announce-quit", true)) {
            String fmt = plugin.getConfig().getString("quit-format", "❌ **{player}** left the server");
            plugin.getApiClient().postMcEvent("player_quit", name,
                fmt.replace("{player}", name), null);
        }

        // Update player list after this tick (player still online during event)
        plugin.getServer().getScheduler().runTaskLater(plugin, this::updatePlayerList, 1L);
    }

    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
    public void onDeath(PlayerDeathEvent event) {
        if (!plugin.getConfig().getBoolean("announce-death", true)) return;

        String deathMsg = event.deathMessage() != null
            ? PlainTextComponentSerializer.plainText().serialize(event.deathMessage())
            : event.getEntity().getName() + " died";

        String fmt = plugin.getConfig().getString("death-format", "💀 {message}");
        plugin.getApiClient().postMcEvent("player_death", event.getEntity().getName(),
            fmt.replace("{message}", deathMsg), null);
    }

    @EventHandler(priority = EventPriority.MONITOR)
    public void onAdvancement(PlayerAdvancementDoneEvent event) {
        if (!plugin.getConfig().getBoolean("announce-advancement", true)) return;

        AdvancementDisplay display = event.getAdvancement().getDisplay();
        if (display == null) return;
        // Only announce non-recipe advancements
        if (event.getAdvancement().getKey().getKey().startsWith("recipes/")) return;

        String title = PlainTextComponentSerializer.plainText().serialize(display.title());
        String name  = event.getPlayer().getName();
        String fmt   = plugin.getConfig().getString("advancement-format",
            "🏆 **{player}** earned the advancement **{advancement}**");

        plugin.getApiClient().postMcEvent("advancement", name,
            fmt.replace("{player}", name).replace("{advancement}", title),
            Map.of("advancement", title));
    }

    private void updatePlayerList() {
        List<String> players = plugin.getServer().getOnlinePlayers().stream()
            .map(p -> p.getName())
            .collect(Collectors.toList());
        plugin.getApiClient().updatePlayerList(players);
    }
}
