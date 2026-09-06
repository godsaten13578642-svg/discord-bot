package com.civbot.lightsaber;

import com.civbot.CivBridgePlugin;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.player.PlayerJoinEvent;

import java.security.MessageDigest;

/**
 * Applies the lightsaber resource pack when players join, if the server admin
 * configured a URL for it in config.yml (resource-pack.url). The SHA-1 hash is
 * computed once so clients can cache the pack properly.
 */
public class ResourcePackListener implements Listener {

    private final CivBridgePlugin plugin;
    private final String url;
    private final byte[] sha1;

    public ResourcePackListener(CivBridgePlugin plugin, String url, byte[] sha1) {
        this.plugin = plugin;
        this.url = url;
        this.sha1 = sha1;
    }

    public void apply(PlayerJoinEvent event) {
        event.getPlayer().setResourcePack(url, sha1);
    }

    /** Resends the pack prompt to everyone (used after config reload). */
    public void applyToOnline() {
        plugin.getServer().getOnlinePlayers().forEach(p -> p.setResourcePack(url, sha1));
    }

    @EventHandler
    public void onJoin(PlayerJoinEvent event) {
        apply(event);
    }

    public static byte[] hexToBytes(String hex) {
        try {
            int len = hex.length();
            byte[] out = new byte[len / 2];
            for (int i = 0; i < len; i += 2) {
                out[i / 2] = (byte) ((Character.digit(hex.charAt(i), 16) << 4)
                    + Character.digit(hex.charAt(i + 1), 16));
            }
            return out;
        } catch (Exception e) {
            return new byte[0];
        }
    }

    /** Computes a SHA-1 over a file — helper used at startup when a local path is given. */
    public static byte[] sha1Of(java.io.File file) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-1");
            try (var in = new java.io.FileInputStream(file)) {
                byte[] buf = new byte[8192];
                int n;
                while ((n = in.read(buf)) > 0) md.update(buf, 0, n);
            }
            return md.digest();
        } catch (Exception e) {
            return new byte[0];
        }
    }

    public static String toHex(byte[] bytes) {
        StringBuilder sb = new StringBuilder(bytes.length * 2);
        for (byte b : bytes) sb.append(String.format("%02x", b));
        return sb.toString();
    }
}
