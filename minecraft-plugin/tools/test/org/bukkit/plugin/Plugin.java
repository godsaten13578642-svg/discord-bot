package org.bukkit.plugin;

import java.io.File;
import java.util.logging.Logger;

/**
 * Test-only stub of Bukkit's Plugin interface: just the members
 * EmbeddedPackServer uses (getLogger, getDataFolder). Keeping the surface
 * minimal avoids dragging Bukkit's transitive types onto the test classpath.
 * Never shipped — lives only under tools/test.
 */
public interface Plugin {
    Logger getLogger();
    File getDataFolder();
}
