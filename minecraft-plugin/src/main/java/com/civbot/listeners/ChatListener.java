package com.civbot.listeners;

import com.civbot.CivBridgePlugin;
import io.papermc.paper.event.player.AsyncChatEvent;
import net.kyori.adventure.text.serializer.plain.PlainTextComponentSerializer;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;

public class ChatListener implements Listener {

    private final CivBridgePlugin plugin;

    public ChatListener(CivBridgePlugin plugin) {
        this.plugin = plugin;
    }

    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
    public void onChat(AsyncChatEvent event) {
        String playerName = event.getPlayer().getName();
        String content    = PlainTextComponentSerializer.plainText().serialize(event.message());
        plugin.relayMcToDiscord(playerName, content);
    }
}
