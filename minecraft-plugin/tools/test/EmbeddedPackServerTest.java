import java.lang.reflect.Proxy;
import java.net.HttpURLConnection;
import java.net.URI;
import java.nio.file.*;
import java.security.MessageDigest;
import java.util.logging.Logger;

/**
 * Test-only harness for EmbeddedPackServer: loads the class from the built
 * CivBridge jar (so /packs/civbridge-pack.zip is really embedded), wires a
 * mocked org.bukkit.plugin.Plugin, starts the server on an ephemeral port,
 * then GETs/HEADs /pack and compares bytes + SHA-1 against the entry inside
 * the jar itself. Exits 0 on success, 1 on any failure.
 *
 * Usage: java -cp target/CivBridge-1.1.0.jar tools/test EmbeddedPackServerTest
 *   (or compile+run with the jar on the classpath)
 */
public class EmbeddedPackServerTest {

    public static void main(String[] args) throws Exception {
        Class<?> pluginCls = Class.forName("org.bukkit.plugin.Plugin");
        Object plugin = Proxy.newProxyInstance(
            EmbeddedPackServerTest.class.getClassLoader(),
            new Class<?>[]{ pluginCls },
            (proxy, method, margs) -> switch (method.getName()) {
                case "getLogger" -> Logger.getLogger("CivBridgeTest");
                case "getDataFolder" -> Files.createTempDirectory("civbridge-pack-test").toFile();
                default -> defaultReturn(method);
            });

        Class<?> eps = Class.forName("com.civbot.pack.EmbeddedPackServer");
        Object server = eps.getConstructor(pluginCls).newInstance(plugin);

        @SuppressWarnings("unchecked")
        java.util.concurrent.Callable<String> start = () -> {
            var m = eps.getMethod("start", String.class, int.class);
            return (String) m.invoke(server, "", 0);
        };
        String url = start.call();
        if (url == null || url.isBlank()) { System.err.println("FAIL: start() returned null"); System.exit(1); }
        System.out.println("server started at " + url);

        // SHA-1 + bytes as embedded in the jar = source of truth.
        Path jarPath = Paths.get(args.length > 0 ? args[0] : "target/CivBridge-1.1.0.jar");
        byte[] expected;
        try (FileSystem fs = FileSystems.newFileSystem(jarPath, (ClassLoader) null)) {
            expected = Files.readAllBytes(fs.getPath("packs/civbridge-pack.zip"));
        }

        // GET /pack
        HttpURLConnection get = (HttpURLConnection) URI.create(url).toURL().openConnection();
        get.setRequestMethod("GET");
        int code = get.getResponseCode();
        byte[] body = java.io.InputStream.class.cast(get.getContent()).readAllBytes();
        String gotSha = shaHex(body), wantSha = shaHex(expected);
        System.out.println("GET  /pack -> HTTP " + code + ", " + body.length + " bytes");
        if (code != 200) fail("expected 200");
        if (!java.util.Arrays.equals(body, expected)) fail("GET body differs from embedded zip");
        if (!gotSha.equals(wantSha)) fail("GET sha mismatch");

        // HEAD /pack
        HttpURLConnection head = (HttpURLConnection) URI.create(url).toURL().openConnection();
        head.setRequestMethod("HEAD");
        System.out.println("HEAD /pack -> HTTP " + head.getResponseCode()
            + ", content-length " + head.getContentLengthLong());
        if (head.getResponseCode() != 200) fail("HEAD expected 200");
        if (head.getContentLengthLong() != expected.length) fail("HEAD length mismatch");

        // Extraction state
        var sha1Hex = eps.getMethod("sha1Hex").invoke(server);
        System.out.println("server-reported sha1: " + sha1Hex);
        if (!wantSha.equals(sha1Hex)) fail("server sha1Hex mismatch");
        Path packFile = (Path) eps.getMethod("packFile").invoke(server);
        if (!Files.isRegularFile(packFile)) fail("extracted pack missing");
        if (!java.util.Arrays.equals(Files.readAllBytes(packFile), expected)) fail("extracted file differs");

        // Stop
        eps.getMethod("stop").invoke(server);
        System.out.println("PASS: embedded pack server serves the exact jar-embedded zip (sha1 " + wantSha + ")");
        System.exit(0); // pack-server threads keep the JVM alive otherwise
    }

    private static Object defaultReturn(java.lang.reflect.Method m) {
        Class<?> r = m.getReturnType();
        if (r == boolean.class) return false;
        if (r.isPrimitive()) return 0;
        return null;
    }

    private static void fail(String msg) {
        System.err.println("FAIL: " + msg);
        System.exit(1);
    }

    private static String shaHex(byte[] data) {
        try {
            StringBuilder sb = new StringBuilder();
            for (byte b : MessageDigest.getInstance("SHA-1").digest(data)) sb.append(String.format("%02x", b));
            return sb.toString();
        } catch (Exception e) { throw new RuntimeException(e); }
    }
}
