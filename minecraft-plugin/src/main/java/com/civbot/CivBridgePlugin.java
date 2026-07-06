package com.civbot;

import com.civbot.api.ApiClient;
import com.civbot.commands.CivCommand;
import com.civbot.commands.DiscordCommand;
import com.civbot.commands.LinkCommand;
import com.civbot.listeners.ChatListener;
import com.civbot.listeners.PlayerListener;
import com.civbot.ws.BotWebSocketClient;
import org.bukkit.Bukkit;
import org.bukkit.plugin.java.JavaPlugin;

import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

public class CivBridgePlugin extends JavaPlugin {

    private static CivBridgePlugin instance;
    private ApiClient apiClient;
    private BotWebSocketClient wsClient;

    // minecraftUUID -> discordId
    private final Map<UUID, String> linkedAccounts = new HashMap<>();
    // discordId -> minecraftUUID
    private final Map<String, UUID> reverseLinks = new HashMap<>();
    // code -> UUID
    private final Map<String, UUID> pendingLinks = new HashMap<>();
    private final Map<String, Long> pendingLinkExpiry = new HashMap<>();

    @Override
    public void onEnable() {
        instance = this;
        saveDefaultConfig();

        String apiUrl = getConfig().getString("api-url", "http://localhost:3001");
        String wsUrl  = getConfig().getString("ws-url",  "ws://localhost:3002");
        String apiKey = getConfig().getString("api-key", "change-me-to-something-secret");

        apiClient = new ApiClient(apiUrl, apiKey);
        wsClient  = new BotWebSocketClient(wsUrl, apiKey, this);
        wsClient.connectAsync();

        // Register listeners
        getServer().getPluginManager().registerEvents(new ChatListener(this), this);
        getServer().getPluginManager().registerEvents(new PlayerListener(this), this);

        // Register commands
        getCommand("link").setExecutor(new LinkCommand(this));
        getCommand("unlink").setExecutor(new LinkCommand(this));
        getCommand("discord").setExecutor(new DiscordCommand(this));
        getCommand("civ").setExecutor(new CivCommand(this));
        getCommand("civreload").setExecutor((sender, cmd, label, args) -> {
            reloadConfig();
            sender.sendMessage("§aCivBridge config reloaded.");
            return true;
        });

        // Notify Discord that server started
        if (getConfig().getBoolean("announce-server-lifecycle", true)) {
            apiClient.postMcEvent("server_start", null, "Server is now **online** 🟢", null);
        }

        getLogger().info("CivBridge enabled — connected to " + apiUrl);
    }

    @Override
    public void onDisable() {
        if (getConfig().getBoolean("announce-server-lifecycle", true)) {
            apiClient.postMcEvent("server_stop", null, "Server is now **offline** 🔴", null);
        }
        if (wsClient != null) wsClient.closeBlocking();
        getLogger().info("CivBridge disabled.");
    }

    public static CivBridgePlugin getInstance() { return instance; }
    public ApiClient getApiClient()             { return apiClient; }
    public BotWebSocketClient getWsClient()     { return wsClient; }

    // ── Account Linking ──────────────────────────────────────────────────────

    public String generateLinkCode(UUID playerUUID) {
        // Remove old pending codes for this player
        pendingLinks.values().remove(playerUUID);
        String code = String.format("%06d", (int)(Math.random() * 1_000_000));
        pendingLinks.put(code, playerUUID);
        pendingLinkExpiry.put(code, System.currentTimeMillis() + 5 * 60 * 1000); // 5 min
        return code;
    }

    public boolean confirmLink(String code, String discordId) {
        Long expiry = pendingLinkExpiry.get(code);
        if (expiry == null || System.currentTimeMillis() > expiry) {
            pendingLinks.remove(code);
            pendingLinkExpiry.remove(code);
            return false;
        }
        UUID mcUUID = pendingLinks.remove(code);
        pendingLinkExpiry.remove(code);
        if (mcUUID == null) return false;

        linkedAccounts.put(mcUUID, discordId);
        reverseLinks.put(discordId, mcUUID);
        return true;
    }

    public void unlink(UUID playerUUID) {
        String discordId = linkedAccounts.remove(playerUUID);
        if (discordId != null) reverseLinks.remove(discordId);
    }

    public String getDiscordId(UUID mcUUID)    { return linkedAccounts.get(mcUUID); }
    public UUID   getMcUUID(String discordId)  { return reverseLinks.get(discordId); }
    public boolean isLinked(UUID mcUUID)       { return linkedAccounts.containsKey(mcUUID); }

    // ── Chat relay helpers ───────────────────────────────────────────────────

    /** Relay a Discord message into Minecraft chat for all online players. */
    public void relayDiscordToMc(String authorName, String content) {
        String prefix = getConfig().getString("discord-prefix", "§9[Discord]§r");
        String msg = prefix + " §b" + authorName + "§r: " + content;
        Bukkit.getScheduler().runTask(this, () ->
            Bukkit.broadcastMessage(msg)
        );
    }

    /** Relay Minecraft chat to Discord via the API. */
    public void relayMcToDiscord(String playerName, String content) {
        String mcPrefix = getConfig().getString("mc-prefix", "[MC]");
        apiClient.postMcChat(playerName, content, mcPrefix);
    }
}
