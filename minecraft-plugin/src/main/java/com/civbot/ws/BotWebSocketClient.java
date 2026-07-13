package com.civbot.ws;

import com.civbot.CivBridgePlugin;
import com.google.gson.Gson;
import com.google.gson.JsonObject;
import org.java_websocket.client.WebSocketClient;
import org.java_websocket.handshake.ServerHandshake;

import java.net.URI;
import java.util.Map;
import java.util.logging.Level;

public class BotWebSocketClient extends WebSocketClient {

    private final CivBridgePlugin plugin;
    private final Gson gson = new Gson();
    private volatile boolean intentionallyClosed = false;

    public BotWebSocketClient(String wsUrl, String apiKey, CivBridgePlugin plugin) {
        super(URI.create(wsUrl), Map.of("X-Api-Key", apiKey));
        this.plugin = plugin;
        setConnectionLostTimeout(30);
    }

    public void connectAsync() {
        new Thread(() -> {
            try { connectBlocking(); }
            catch (InterruptedException e) { Thread.currentThread().interrupt(); }
        }, "civbridge-ws-connect").start();
    }

    @Override
    public void onOpen(ServerHandshake hs) {
        plugin.getLogger().info("§aConnected to CivBot WebSocket.");
        // Identify as a Minecraft plugin
        JsonObject msg = new JsonObject();
        msg.addProperty("type", "identify");
        msg.addProperty("client", "minecraft");
        send(gson.toJson(msg));
    }

    @Override
    public void onMessage(String raw) {
        try {
            JsonObject msg = gson.fromJson(raw, JsonObject.class);
            String type = msg.has("type") ? msg.get("type").getAsString() : "";

            switch (type) {
                case "discord_chat" -> {
                    String author  = msg.has("author")  ? msg.get("author").getAsString()  : "Discord";
                    String content = msg.has("content") ? msg.get("content").getAsString() : "";
                    plugin.relayDiscordToMc(author, content);
                }
                case "discord_join" -> {
                    String who = msg.has("author") ? msg.get("author").getAsString() : "Someone";
                    plugin.relayDiscordToMc("§7System", who + " joined Discord");
                }
                case "link_confirm" -> {
                    String code      = msg.has("code")      ? msg.get("code").getAsString()      : "";
                    String discordId = msg.has("discordId") ? msg.get("discordId").getAsString() : "";
                    java.util.UUID uuid = plugin.confirmLink(code, discordId) ? null : null;
                    // Actual linking is handled server-side; notify in-game player
                    String username = msg.has("discordName") ? msg.get("discordName").getAsString() : discordId;
                    boolean ok = plugin.confirmLink(code, discordId);
                    if (ok) {
                        java.util.UUID mcUUID = plugin.getMcUUID(discordId);
                        if (mcUUID != null) {
                            org.bukkit.entity.Player p = plugin.getServer().getPlayer(mcUUID);
                            if (p != null) p.sendMessage("§a✅ Your account is now linked to Discord user §b" + username + "§a!");
                        }
                    }
                }
                case "ping" -> {
                    JsonObject pong = new JsonObject();
                    pong.addProperty("type", "pong");
                    pong.addProperty("playerCount", plugin.getServer().getOnlinePlayers().size());
                    send(gson.toJson(pong));
                }
                case "run_command" -> {
                    String command = msg.has("command") ? msg.get("command").getAsString() : "";
                    if (!command.isEmpty()) {
                        plugin.getServer().getScheduler().runTask(plugin, () -> {
                            boolean ok = plugin.getServer().dispatchCommand(
                                plugin.getServer().getConsoleSender(), command);
                            JsonObject result = new JsonObject();
                            result.addProperty("type", "command_result");
                            result.addProperty("command", command);
                            result.addProperty("ok", ok);
                            sendEvent(result);
                        });
                    }
                }
                case "broadcast" -> {
                    String content = msg.has("content") ? msg.get("content").getAsString() : "";
                    if (!content.isEmpty()) {
                        plugin.getServer().getScheduler().runTask(plugin, () ->
                            plugin.getServer().broadcastMessage("§9[Bot]§r " + content)
                        );
                    }
                }
                case "kick_player" -> {
                    String playerName = msg.has("playerName") ? msg.get("playerName").getAsString() : "";
                    String reason = msg.has("reason") ? msg.get("reason").getAsString() : "Kicked by dashboard";
                    if (!playerName.isEmpty()) {
                        plugin.getServer().getScheduler().runTask(plugin, () -> {
                            org.bukkit.entity.Player p = plugin.getServer().getPlayer(playerName);
                            if (p != null) p.kickPlayer(reason);
                        });
                    }
                }
                default -> {}
            }
        } catch (Exception e) {
            plugin.getLogger().log(Level.WARNING, "WS parse error: " + e.getMessage());
        }
    }

    @Override
    public void onClose(int code, String reason, boolean remote) {
        if (!intentionallyClosed) {
            plugin.getLogger().warning("§eWS disconnected (" + code + "): " + reason + " — reconnecting in 10s…");
            scheduleReconnect();
        }
    }

    @Override
    public void onError(Exception e) {
        plugin.getLogger().log(Level.WARNING, "WS error: " + e.getMessage());
    }

    public void closeBlocking() {
        intentionallyClosed = true;
        try { super.closeBlocking(); }
        catch (InterruptedException e) { Thread.currentThread().interrupt(); }
    }

    private void scheduleReconnect() {
        plugin.getServer().getScheduler().runTaskLaterAsynchronously(plugin, () -> {
            if (!intentionallyClosed) {
                plugin.getLogger().info("Attempting WS reconnect…");
                try { reconnectBlocking(); }
                catch (InterruptedException e) { Thread.currentThread().interrupt(); }
            }
        }, 200L); // 10 seconds (200 ticks)
    }

    /** Send a Minecraft event to the bot server. */
    public void sendEvent(JsonObject payload) {
        if (isOpen()) send(gson.toJson(payload));
    }
}
