package com.civbot.fandom;

import org.bukkit.ChatColor;
import org.bukkit.Material;

/**
 * Custom items from popular TV / movies / YouTube series:
 * Evbo's Parkour Civ & PVP Civ, Naruto, and Supernatural.
 *
 * Each entry: its own texture (civbridge:item/fandom/<id>), its own model,
 * its own base material (the vanilla item the client reskins), its own
 * damage for weapons, and a right-click power implemented in FandomListener.
 *
 * Legacy CMD ranges (older clients): 3001-3004, 3101-3104, 3201-3203.
 */
public enum FandomType {

    // ── Parkour Civ / PVP Civ (Evbo) ───────────────────────────────────────
    PARKOUR_BOOTS("parkour_boots", 3001, Material.NETHERITE_PICKAXE, ChatColor.GOLD,
        "Parkour Master's Boots", "passive", 0,
        "§eCarry them to sprint-jump across any gap.", "Falling no longer hurts you.",
        "Blocks the void? §7No. Blocks gravity's consequences? §7Yes."),

    NO_SCOPE_EYES("no_scope_eyes", 3002, Material.NETHERITE_PICKAXE, ChatColor.AQUA,
        "No-Scope Eyes", "passive", 0,
        "§bSee everything, everywhere.", "Right-click for 15s of true sight:",
        "glowing on all entities within 48 blocks."),

    // ── Naruto ───────────────────────────────────────────────────────────────
    HIDDEN_LEAF_HEADBAND("hidden_leaf_headband", 3003, Material.NETHERITE_PICKAXE, ChatColor.BLUE,
        "Hidden Leaf Headband", "passive", 0,
        "§9The Will of Fire, carried in hand.", "Speed II and Jump II while held.",
        "Right-click to hone your chakra (regen burst)."),

    NINJA_STAR("ninja_star", 3101, Material.NETHERITE_SHOVEL, ChatColor.GRAY,
        "Ninja Star", "throwable", 6,
        "§7Right-click to throw.", "Left-click melee: 6 damage.",
        "Infinite stars — a true shinobi never runs out."),

    SUMMONING_SCROLL("summoning_scroll", 3004, Material.NETHERITE_PICKAXE, ChatColor.LIGHT_PURPLE,
        "Summoning Scroll", "passive", 0,
        "§dRight-click to summon a wolf companion", "§dfor 3 minutes. It fights beside you.",
        "Blood contract signed: unlimited uses."),

    RASENGAN("rasengan", 3102, Material.NETHERITE_SHOVEL, ChatColor.AQUA,
        "Rasengan", "passive", 0,
        "§bRight-click: launch a spiraling sphere", "§bthat detonates for heavy damage.",
        "15 second cooldown."),

    CHIDORI_BLADE("chidori_blade", 3103, Material.NETHERITE_SHOVEL, ChatColor.AQUA,
        "Chidori Blade", "weapon", 11,
        "§bLeft-click: 11 lightning damage.", "Right-click: dash through enemies in a",
        "crackle of a thousand birds. 8s cooldown."),

    // ── Supernatural ─────────────────────────────────────────────────────────
    ANGEL_BLADE("angel_blade", 3104, Material.NETHERITE_SHOVEL, ChatColor.WHITE,
        "Angel Blade", "weapon", 12,
        "§fThe blade of Heaven.", "Left-click: 12 damage. Deals double",
        "to undead — smiting what crawls from the pit."),

    FIRST_BLADE("first_blade", 3201, Material.NETHERITE_HOE, ChatColor.DARK_RED,
        "The First Blade", "weapon", 14,
        "§4The blade that killed Abel.", "Left-click: 14 damage. The Mark hungers:",
        "each kill heals you 2 ❤."),

    DEATHS_SCYTHE("deaths_scythe", 3202, Material.NETHERITE_HOE, ChatColor.DARK_PURPLE,
        "Death's Scythe", "weapon", 13,
        "§5Left-click: 13 damage.", "Right-click: reap — 6 damage to every",
        "living thing in a 6-block ring. 12s cooldown."),

    THE_COLT("the_colt", 3203, Material.NETHERITE_HOE, ChatColor.YELLOW,
        "The Colt", "passive", 0,
        "§eRight-click: fire at what you're looking at.", "§4One shot kills most things.",
        "13 rounds before it must rest. Works on almost everything…"),

    ;

    private final String id;
    private final int legacyCmd;
    private final Material material;
    private final ChatColor color;
    private final String displayName;
    private final String kind;       // "weapon" | "throwable" | "no_distance"
    private final int attackDamage;  // applied by FandomListener on melee hits
    private final String[] lore;

    FandomType(String id, int legacyCmd, Material material, ChatColor color,
               String displayName, String kind, int attackDamage, String... lore) {
        this.id = id;
        this.legacyCmd = legacyCmd;
        this.material = material;
        this.color = color;
        this.displayName = displayName;
        this.kind = kind;
        this.attackDamage = attackDamage;
        this.lore = lore;
    }

    public String id()          { return id; }
    public String cmdString()   { return "civbridge:fandom_" + id; }
    public int legacyCmd()      { return legacyCmd; }
    public Material material()  { return material; }
    public ChatColor color()    { return color; }
    public String displayName() { return displayName; }
    public String kind()        { return kind; }
    public int attackDamage()   { return attackDamage; }
    public String[] lore()      { return lore; }

    /** Parse from a friendly name or id: "colt", "rasengan", "3203". */
    public static FandomType parse(String input) {
        if (input == null) return null;
        String q = input.toLowerCase().replace(' ', '_').replace('-', '_');
        for (FandomType t : values()) {
            if (t.id.equals(q) || String.valueOf(t.legacyCmd).equals(q)) return t;
            if (q.length() >= 3 && t.displayName.toLowerCase().replace(" ", "_").replace("'", "").contains(q)) return t;
        }
        return null;
    }
}
