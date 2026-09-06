package com.civbot.lightsaber;

import org.bukkit.ChatColor;

/**
 * The six custom lightsabers. Each is a separate custom item: its own model
 * (via custom-model-data string "custom_swords:<id>"), its own display name,
 * its own blade damage, and its own lore.
 *
 * The modern string ids map 1:1 to the legacy integer ids (1001-1006) kept for
 * clients older than 1.21.4.
 */
public enum LightsaberType {

    ANAKIN_BLUE("anakin_blue", 1001, ChatColor.AQUA,
        "Anakin's Blue Saber", 10,
        "A Jedi Guardian's blade.", "The light side flows through it."),
    ANAKIN_GREEN("anakin_green", 1002, ChatColor.GREEN,
        "Yavin Green Saber", 9,
        "Carried by Jedi Consulars.", "Calm minds cut deepest."),
    ANAKIN_PURPLE("anakin_purple", 1003, ChatColor.LIGHT_PURPLE,
        "Mace's Purple Saber", 11,
        "A rare crystal, a rarer wielder.", "Walks the line between light and dark."),
    ANAKIN_DARK("anakin_dark", 1004, ChatColor.DARK_PURPLE,
        "Dark Disciple Saber", 12,
        "Forged in the Umbaran dark.", "Its hum sounds like a warning."),
    ANAKIN_RED("anakin_red", 1005, ChatColor.RED,
        "Crimson Inquisitor Saber", 12,
        "The crystal bleeds.", "It remembers every scream."),
    ANAKIN_WHITE("anakin_white", 1006, ChatColor.WHITE,
        "Ahsoka's White Sabers", 9,
        "Purified from the dark.", "Balance, held in one hand.");

    private final String modelId;      // custom_swords:<modelId>
    private final int legacyCmd;       // 1.21.3 and older
    private final ChatColor color;
    private final String displayName;
    private final int attackDamage;    // bonus damage applied via the listener
    private final String[] lore;

    LightsaberType(String modelId, int legacyCmd, ChatColor color, String displayName,
                   int attackDamage, String... lore) {
        this.modelId = modelId;
        this.legacyCmd = legacyCmd;
        this.color = color;
        this.displayName = displayName;
        this.attackDamage = attackDamage;
        this.lore = lore;
    }

    public String modelId()    { return modelId; }
    public String cmdString()  { return "custom_swords:" + modelId; }
    public int legacyCmd()     { return legacyCmd; }
    public ChatColor color()   { return color; }
    public String displayName(){ return displayName; }
    public int attackDamage()  { return attackDamage; }
    public String[] lore()     { return lore; }

    /** Looks a saber up by friendly name or model id, e.g. "blue", "anakin_blue", "1005". */
    public static LightsaberType parse(String input) {
        String q = input.toLowerCase().replace(" ", "_").replace("-", "_");
        for (LightsaberType t : values()) {
            if (t.modelId.equals(q)
                || t.modelId.endsWith("_" + q) && !q.isBlank()
                || t.displayName.toLowerCase().replace(" ", "_").contains(q) && q.length() >= 3
                || String.valueOf(t.legacyCmd).equals(q)) {
                return t;
            }
        }
        return null;
    }
}
