package com.civbot;

import com.civbot.api.ApiClient;
import com.civbot.bosses.BossListener;
import com.civbot.bosses.BossManager;
import com.civbot.commands.BossCommand;
import com.civbot.commands.CivCommand;
import com.civbot.commands.DiscordCommand;
import com.civbot.commands.FandomCommand;
import com.civbot.commands.InfinityCommand;
import com.civbot.commands.LinkCommand;
import com.civbot.commands.ReactCommand;
import com.civbot.commands.SaberCommand;
import com.civbot.infinity.GauntletListener;
import com.civbot.fandom.FandomListener;
import com.civbot.gui.CivGui;
import com.civbot.lightsaber.ResourcePackListener;
import com.civbot.lightsaber.SaberListener;
import com.civbot.pack.EmbeddedPackServer;
import com.civbot.listeners.ChatListener;
import com.civbot.listeners.PlayerListener;
import com.civbot.skript.SkriptScriptManager;
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
    private SkriptScriptManager skriptScripts;
    private ResourcePackListener resourcePackListener;
    private EmbeddedPackServer packServer;
    private BossManager bossManager;

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
        String publicUrl = getConfig().getString("public-url", "");
        String wsUrl  = getConfig().getString("ws-url",  "ws://localhost:3001/ws");
        String apiKey = getConfig().getString("api-key", "change-me-to-something-secret");

        apiClient = new ApiClient(apiUrl, publicUrl, apiKey);
        wsClient  = new BotWebSocketClient(wsUrl, apiKey, this);
        wsClient.connectAsync();

        skriptScripts = new SkriptScriptManager(this);

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

        ReactCommand react = new ReactCommand(this, skriptScripts);
        getCommand("react").setExecutor(react);
        getCommand("react").setTabCompleter(react);

        // ── Lightsabers ──────────────────────────────────────────────────────
        getServer().getPluginManager().registerEvents(new SaberListener(this), this);
        getCommand("saber").setExecutor(new SaberCommand(this));

        // ── Infinity Stones & Gauntlet ───────────────────────────────────────
        GauntletListener gauntlet = new GauntletListener(this);
        getServer().getPluginManager().registerEvents(gauntlet, this);
        InfinityCommand infinity = new InfinityCommand(this);
        getCommand("infinity").setExecutor(infinity);
        getCommand("infinity").setTabCompleter(infinity);

        // ── Fandom Items (Parkour Civ / Naruto / Supernatural) ───────────────
        getServer().getPluginManager().registerEvents(new FandomListener(this), this);
        FandomCommand fandom = new FandomCommand(this);
        getCommand("fandom").setExecutor(fandom);
        getCommand("fandom").setTabCompleter(fandom);

        // ── Fandom Bosses (Twelve Kizuki demon / Leviathan) ──────────────────
        bossManager = new BossManager(this);
        getServer().getPluginManager().registerEvents(new BossListener(this, bossManager), this);
        BossCommand boss = new BossCommand(this);
        getCommand("boss").setExecutor(boss);
        getCommand("boss").setTabCompleter(boss);

        // ── ReactSMP items GUI (/civgui) ────────────────────────────────────
        CivGui gui = new CivGui(this);
        getServer().getPluginManager().registerEvents(gui, this);
        getCommand("civgui").setExecutor((sender, cmd, label, args) -> {
            if (sender instanceof org.bukkit.entity.Player player) {
                gui.open(player);
            } else {
                sender.sendMessage("§cOnly players can open the items menu.");
            }
            return true;
        });

        // Resource pack (lightsaber models/textures). By default the plugin
        // hosts the pack ITSELF over a tiny embedded HTTP server on the same
        // address as the Minecraft server — no external host or SHA-1 needed.
        // Set resource-pack.url in config.yml to override with an external URL.
        resourcePackListener = createResourcePackListener();
        if (resourcePackListener != null) {
            getServer().getPluginManager().registerEvents(resourcePackListener, this);
        }

        // Notify Discord that server started
        if (getConfig().getBoolean("announce-server-lifecycle", true)) {
            apiClient.postMcEvent("server_start", null, "Server is now **online** 🟢", null);
        }

        getLogger().info("CivBridge enabled — connected to " + apiUrl
            + (skriptScripts.isHookUsable() ? " (Skript hook active)" : " (Skript not detected)"));
    }

    @Override
    public void onDisable() {
        if (getConfig().getBoolean("announce-server-lifecycle", true)) {
            apiClient.postMcEvent("server_stop", null, "Server is now **offline** 🔴", null);
        }
        if (bossManager != null) bossManager.shutdown();
        if (packServer != null) packServer.stop();
        if (wsClient != null) wsClient.closeBlocking();
        getLogger().info("CivBridge disabled.");
    }

    public static CivBridgePlugin getInstance() { return instance; }
    public ApiClient getApiClient()             { return apiClient; }
    public BotWebSocketClient getWsClient()     { return wsClient; }
    public SkriptScriptManager getSkriptScripts() { return skriptScripts; }
    public BossManager getBossManager()          { return bossManager; }
    public ResourcePackListener getResourcePackListener() { return resourcePackListener; }
    public EmbeddedPackServer getPackServer()            { return packServer; }

    /** Builds the pack applier: embedded server by default, or an external URL from config. Null when neither works. */
    private ResourcePackListener createResourcePackListener() {
        String url = getConfig().getString("resource-pack.url", "").trim();
        byte[] sha1 = new byte[0];
        String source;

        if (url.isEmpty()) {
            // Zero-config path: serve the pack embedded in this jar.
            if (!getConfig().getBoolean("resource-pack.embedded", true)) {
                getLogger().info("Resource pack disabled (resource-pack.embedded=false, no resource-pack.url) — players will see vanilla items.");
                return null;
            }
            packServer = new EmbeddedPackServer(this);
            int port = getConfig().getInt("resource-pack.port", getConfig().getInt("server.port", 0));
            String bind = getConfig().getString("resource-pack.bind", "").trim();
            String embeddedUrl = packServer.start(bind, port);
            if (embeddedUrl == null) {
                getLogger().warning("No resource pack will be offered — players will see vanilla items.");
                return null;
            }
            url = embeddedUrl;
            sha1 = packServer.sha1();
            source = "embedded (" + packServer.getPort() + ", sha1 " + packServer.sha1Hex() + ")";
        } else {
            // External URL from config — honor a manually configured sha1.
            String sha1Hex = getConfig().getString("resource-pack.sha1", "").trim();
            if (sha1Hex.isEmpty()) {
                java.io.File local = new java.io.File(url);
                sha1 = local.isFile() ? ResourcePackListener.sha1Of(local) : new byte[0];
                if (sha1.length == 0) {
                    getLogger().warning("resource-pack.url is set but resource-pack.sha1 is empty — clients may re-download the pack every join.");
                }
            } else {
                sha1 = ResourcePackListener.hexToBytes(sha1Hex);
            }
            source = "external URL";
        }

        ResourcePackListener listener = new ResourcePackListener(this, url, sha1);
        getLogger().info("Resource pack active (" + source + "): " + url);
        // Send to anyone already online (e.g. after /civreload).
        getServer().getScheduler().runTask(this, listener::applyToOnline);
        return listener;
    }

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
