package com.civbot.api;

import com.civbot.CivBridgePlugin;
import com.google.gson.Gson;
import com.google.gson.JsonObject;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URI;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.logging.Level;

public class ApiClient {

    private final String baseUrl;
    private final String publicUrl;
    private final String apiKey;
    private final Gson gson = new Gson();

    public ApiClient(String baseUrl, String apiKey) {
        this(baseUrl, null, apiKey);
    }

    public ApiClient(String baseUrl, String publicUrl, String apiKey) {
        this.baseUrl  = baseUrl.replaceAll("/$", "");
        this.publicUrl = (publicUrl == null || publicUrl.isBlank())
            ? this.baseUrl : publicUrl.replaceAll("/$", "");
        this.apiKey   = apiKey;
    }

    // ── Generic helpers ──────────────────────────────────────────────────────

    private JsonObject post(String path, Map<String, Object> body) {
        try {
            URL url = URI.create(baseUrl + path).toURL();
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("POST");
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setRequestProperty("X-Api-Key", apiKey);
            conn.setConnectTimeout(5000);
            conn.setReadTimeout(5000);
            conn.setDoOutput(true);

            String json = gson.toJson(body);
            try (OutputStream os = conn.getOutputStream()) {
                os.write(json.getBytes(StandardCharsets.UTF_8));
            }

            int code = conn.getResponseCode();
            if (code >= 200 && code < 300) {
                return gson.fromJson(
                    new String(conn.getInputStream().readAllBytes(), StandardCharsets.UTF_8),
                    JsonObject.class
                );
            }
        } catch (Exception e) {
            CivBridgePlugin.getInstance().getLogger().log(Level.WARNING, "API POST " + path + " failed: " + e.getMessage());
        }
        return null;
    }

    private JsonObject get(String path) {
        try {
            URL url = URI.create(baseUrl + path).toURL();
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("GET");
            conn.setRequestProperty("X-Api-Key", apiKey);
            conn.setConnectTimeout(5000);
            conn.setReadTimeout(5000);

            int code = conn.getResponseCode();
            if (code >= 200 && code < 300) {
                return gson.fromJson(
                    new String(conn.getInputStream().readAllBytes(), StandardCharsets.UTF_8),
                    JsonObject.class
                );
            }
        } catch (Exception e) {
            CivBridgePlugin.getInstance().getLogger().log(Level.WARNING, "API GET " + path + " failed: " + e.getMessage());
        }
        return null;
    }

    // ── MC → Discord chat ────────────────────────────────────────────────────

    public void postMcChat(String playerName, String content, String mcPrefix) {
        new Thread(() -> post("/api/mc/chat", Map.of(
            "playerName", playerName,
            "content", content,
            "mcPrefix", mcPrefix
        ))).start();
    }

    // ── MC events (join, leave, death, advancement, server) ─────────────────

    public void postMcEvent(String type, String playerName, String message, Map<String, Object> extra) {
        new Thread(() -> {
            java.util.Map<String, Object> body = new java.util.HashMap<>();
            body.put("type", type);
            if (playerName != null) body.put("playerName", playerName);
            if (message   != null) body.put("message", message);
            if (extra     != null) body.putAll(extra);
            post("/api/mc/event", body);
        }).start();
    }

    // ── Account linking ──────────────────────────────────────────────────────

    public boolean confirmLink(String code, String discordId) {
        JsonObject res = post("/api/mc/link/confirm", Map.of("code", code, "discordId", discordId));
        return res != null && res.has("success") && res.get("success").getAsBoolean();
    }

    // ── Server stats ─────────────────────────────────────────────────────────

    public void updatePlayerList(java.util.List<String> players) {
        new Thread(() -> post("/api/mc/players", Map.of("players", players))).start();
    }

    public JsonObject getLinkedProfile(String discordId) {
        return get("/api/mc/profile/" + discordId);
    }

    // ── Error reports (/react) ─────────────────────────────────────────────

    /**
     * Uploads a Skript error report and returns a short-lived URL the admin can
     * open to read the full report, or null if the API could not be reached.
     */
    public String postErrorReport(String title, String scriptName, String action,
                                  com.civbot.skript.SkriptScriptManager.ScriptResult result) {
        try {
            java.util.List<java.util.Map<String, Object>> issues = new java.util.ArrayList<>();
            for (com.civbot.skript.SkriptScriptManager.ScriptIssue issue : result.issues()) {
                java.util.Map<String, Object> m = new java.util.HashMap<>();
                m.put("level", issue.level());
                m.put("file", issue.file());
                m.put("line", issue.line());
                m.put("message", issue.message());
                issues.add(m);
            }
            JsonObject res = post("/api/errors", Map.of(
                "title", title,
                "source", "skript-" + action,
                "script", scriptName,
                "errorCount", result.errorCount(),
                "issues", issues
            ));
            if (res != null && res.has("url") && !res.get("url").isJsonNull()) {
                String token = res.has("token") && !res.get("token").isJsonNull()
                    ? res.get("token").getAsString() : null;
                String path = res.has("path") && !res.get("path").isJsonNull()
                    ? res.get("path").getAsString() : null;
                if (token != null) return publicUrl + "/errors/" + token;
                if (path != null) return publicUrl + path;
                return res.get("url").getAsString();
            }
        } catch (Exception e) {
            CivBridgePlugin.getInstance().getLogger().log(Level.WARNING,
                "Could not upload error report: " + e.getMessage());
        }
        return null;
    }
}
