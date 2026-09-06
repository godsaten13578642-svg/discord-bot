package com.civbot.infinity;

import org.bukkit.ChatColor;

import java.util.Locale;

/**
 * The six Infinity Stones. A stone is an item; when socketed into the
 * Infinity Gauntlet it grants that gauntlet a unique right-click power
 * (see {@link GauntletListener}).
 *
 * Modern string ids map 1:1 to legacy integer CMD 2001-2006; the gauntlet's
 * model variants use 2101-2107 (empty + one per stone).
 */
public enum InfinityStone {

    SPACE("space", 2001, ChatColor.AQUA, "Space Stone",
        "§bTeleport§7: right-click the gauntlet to warp up to 32 blocks —",
        "§7look at a block to go there, or look at the sky to blast forward."),

    MIND("mind", 2002, ChatColor.YELLOW, "Mind Stone",
        "§eMind control§7: right-click a mob (or player, if allowed) within",
        "§7eight blocks and it fights beside you for 60 seconds."),

    REALITY("reality", 2003, ChatColor.RED, "Reality Stone",
        "§cReality wave§7: right-click to warp the ground around you —",
        "§7nearby foes levitate helplessly for 6 seconds."),

    POWER("power", 2004, ChatColor.LIGHT_PURPLE, "Power Stone",
        "§dPower blast§7: right-click to release a shockwave that hurls",
        "§7everything nearby away from you."),

    TIME("time", 2005, ChatColor.GREEN, "Time Stone",
        "§aTime rewind§7: right-click to roll yourself back 5 seconds in",
        "§7time — health, hunger, and position, exactly where you stood."),

    SOUL("soul", 2006, ChatColor.GOLD, "Soul Stone",
        "§6Soul harvest§7: right-click to pull the souls of nearby slain",
        "§7creatures back as healing — 1 ❤ per soul, up to 8 souls.");

    public static final int SNAP_COOLDOWN_SECONDS = 300;

    private final String id;
    private final int legacyCmd;
    private final ChatColor color;
    private final String displayName;
    private final String[] powerLore;

    InfinityStone(String id, int legacyCmd, ChatColor color, String displayName, String... powerLore) {
        this.id = id;
        this.legacyCmd = legacyCmd;
        this.color = color;
        this.displayName = displayName;
        this.powerLore = powerLore;
    }

    public String id()          { return id; }
    public String cmdString()   { return "civbridge:infinity_stone_" + id; }
    public int legacyCmd()      { return legacyCmd; }
    public ChatColor color()    { return color; }
    public String displayName() { return displayName; }
    public String[] powerLore() { return powerLore; }

    /** Parse from a friendly name or id: "space", "2003", "space stone". */
    public static InfinityStone parse(String input) {
        if (input == null) return null;
        String q = input.toLowerCase(Locale.ROOT).replace(' ', '_').replace('-', '_');
        if (q.startsWith("stone_")) q = q.substring("stone_".length());
        for (InfinityStone s : values()) {
            if (s.id.equals(q) || String.valueOf(s.legacyCmd).equals(q)) return s;
            if (q.length() >= 3 && (s.id + "_stone").startsWith(q)) return s;
        }
        return null;
    }
}
