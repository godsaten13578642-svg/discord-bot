package com.civbot.pack;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import org.bukkit.plugin.Plugin;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.security.MessageDigest;
import java.util.concurrent.Executors;
import java.util.zip.ZipFile;

/**
 * Serves the resource pack embedded in the CivBridge jar over a tiny HTTP
 * server bound to the Minecraft server's own address — so admins don't need
 * to host the zip anywhere or paste a SHA-1 into config.
 *
 * The pack is extracted once at startup (either from the jar's /packs folder
 * or from the prebuilt zip next to the jar) and streamed from disk, so the
 * HTTP handler is a plain file send. SHA-1 of the served bytes is computed
 * at startup and handed to Player#setResourcePack for client caching.
 *
 * URL shape: http://<server-ip-or-host>:<port>/pack (single file).
 */
public final class EmbeddedPackServer {

    // ZipFile entry names have NO leading slash — keep this exact form.
    private static final String RESOURCE_PATH = "packs/civbridge-pack.zip";

    private final Plugin plugin;
    private HttpServer http;
    private Path packFile;
    private byte[] sha1 = new byte[0];
    private int port = -1;
    private String bindAddress = "";

    public EmbeddedPackServer(Plugin plugin) {
        this.plugin = plugin;
    }

    /** Extracts the embedded zip and starts the HTTP server. Returns the public URL, or null on failure. */
    public String start(String bindHost, int requestedPort) {
        stop();
        try {
            packFile = extractEmbeddedPack();
            if (packFile == null) {
                plugin.getLogger().warning("No embedded resource pack found in CivBridge.jar — embedded pack server not started.");
                return null;
            }
            sha1 = sha1Of(packFile);

            InetAddress addr = (bindHost == null || bindHost.isBlank())
                ? InetAddress.getByName("0.0.0.0")
                : InetAddress.getByName(bindHost.trim());
            http = HttpServer.create(new InetSocketAddress(addr, requestedPort), 0);
            http.createContext("/pack", this::servePack);
            http.setExecutor(Executors.newFixedThreadPool(2, r -> {
                Thread t = new Thread(r, "CivBridge-PackServer");
                t.setDaemon(true);
                return t;
            }));
            http.start();

            port = http.getAddress().getPort();
            bindAddress = addr.getHostAddress();
            String url = publicUrl();
            plugin.getLogger().info("Embedded resource pack serving at " + url
                + " (sha1 " + hex(sha1) + ")");
            return url;
        } catch (Exception e) {
            plugin.getLogger().warning("Could not start embedded resource pack server: " + e.getMessage()
                + " — set resource-pack.url in config.yml to host the pack externally.");
            stop();
            return null;
        }
    }

    private void servePack(HttpExchange exchange) throws IOException {
        try {
            if (!"GET".equalsIgnoreCase(exchange.getRequestMethod())
                && !"HEAD".equalsIgnoreCase(exchange.getRequestMethod())) {
                exchange.sendResponseHeaders(405, -1);
                return;
            }
            long size = Files.size(packFile);
            exchange.getResponseHeaders().set("Content-Type", "application/zip");
            exchange.getResponseHeaders().set("Content-Disposition", "attachment; filename=\"civbridge-pack.zip\"");
            if ("HEAD".equalsIgnoreCase(exchange.getRequestMethod())) {
                // HEAD: declare the size the GET would return, send no body.
                exchange.getResponseHeaders().set("Content-Length", Long.toString(size));
                exchange.sendResponseHeaders(200, -1);
                return;
            }
            exchange.sendResponseHeaders(200, size);
            try (InputStream in = Files.newInputStream(packFile);
                 OutputStream out = exchange.getResponseBody()) {
                in.transferTo(out);
            }
        } catch (Exception e) {
            try { exchange.sendResponseHeaders(500, -1); } catch (IOException ignored) {}
        } finally {
            exchange.close();
        }
    }

    /**
     * Finds the pack zip: prefers the prebuilt copy inside the jar at
     * /packs/civbridge-pack.zip, falls back to resource-pack/civbridge-pack.zip
     * sitting next to the jar (dev servers). Extracts to plugins/CivBridge/pack/.
     */
    private Path extractEmbeddedPack() throws IOException {
        Path outDir = plugin.getDataFolder().toPath().resolve("pack");
        Files.createDirectories(outDir);
        Path out = outDir.resolve("civbridge-pack.zip");

        byte[] embedded = readEmbedded(RESOURCE_PATH);
        if (embedded == null) {
            // Fallback: a zip dropped next to the plugin jar.
            Path sibling = plugin.getDataFolder().getParentFile().toPath()
                .resolve("CivBridge.jar").getParent()
                .resolve("resource-pack").resolve("civbridge-pack.zip");
            if (Files.isRegularFile(sibling)) {
                Files.copy(sibling, out, StandardCopyOption.REPLACE_EXISTING);
                plugin.getLogger().info("Using resource pack from " + sibling + " (no embedded pack in jar).");
                return out;
            }
            return null;
        }

        byte[] current = Files.isRegularFile(out) ? Files.readAllBytes(out) : null;
        if (current == null || !MessageDigest.isEqual(sha1OfBytes(current), sha1OfBytes(embedded))) {
            Files.write(out, embedded);
        }
        return out;
    }

    private byte[] readEmbedded(String path) throws IOException {
        // Locate THIS class's jar (works in production and under the test
        // harness, where the plugin object is a proxy without a real code source).
        try {
            Path jarPath = Paths.get(EmbeddedPackServer.class.getProtectionDomain()
                .getCodeSource().getLocation().toURI());
            try (ZipFile jar = new ZipFile(jarPath.toFile())) {
                var entry = jar.getEntry(path);
                if (entry == null) return null;
                try (InputStream in = jar.getInputStream(entry)) {
                    return in.readAllBytes();
                }
            }
        } catch (Exception e) {
            // Location isn't a jar (e.g. dev classpath directory) — treat as absent.
            return null;
        }
    }

    /** The URL to hand to players: uses the server's configured public address when set. */
    public String publicUrl() {
        String host = bindAddress;
        if (host == null || host.isBlank() || "0.0.0.0".equals(host) || "::".equals(host)) {
            // Prefer Bukkit's configured server-ip (matches server.properties);
            // reflective so this class also runs under the test harness.
            host = bukkitServerIp();
            if (host == null || host.isBlank()) {
                try { host = InetAddress.getLocalHost().getHostAddress(); }
                catch (Exception e) { host = "127.0.0.1"; }
            }
        }
        return "http://" + host + ":" + port + "/pack";
    }

    /** Bukkit Server#getIp via reflection; null when unavailable (tests, proxies). */
    private String bukkitServerIp() {
        try {
            Object srv = plugin.getClass().getMethod("getServer").invoke(plugin);
            if (srv == null) return null;
            Object ip = srv.getClass().getMethod("getIp").invoke(srv);
            return (ip instanceof String s) ? s : null;
        } catch (Throwable t) {
            return null;
        }
    }

    public boolean isRunning() { return http != null; }
    public int getPort()       { return port; }
    public byte[] sha1()       { return sha1.clone(); }
    public String sha1Hex()    { return hex(sha1); }
    public Path packFile()     { return packFile; }

    public void stop() {
        if (http != null) {
            http.stop(0);
            http = null;
            port = -1;
        }
    }

    private static byte[] sha1OfBytes(byte[] data) {
        try { return MessageDigest.getInstance("SHA-1").digest(data); }
        catch (Exception e) { return new byte[0]; }
    }

    private static byte[] sha1Of(Path file) throws IOException {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-1");
            try (InputStream in = Files.newInputStream(file)) {
                byte[] buf = new byte[8192];
                int n;
                while ((n = in.read(buf)) > 0) md.update(buf, 0, n);
            }
            return md.digest();
        } catch (Exception e) {
            return new byte[0];
        }
    }

    private static String hex(byte[] bytes) {
        StringBuilder sb = new StringBuilder(bytes.length * 2);
        for (byte b : bytes) sb.append(String.format("%02x", b));
        return sb.toString();
    }
}
