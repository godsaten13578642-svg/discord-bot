package com.civbot.bosses;

import org.bukkit.ChatColor;
import org.bukkit.Material;
import org.bukkit.entity.EntityType;

/**
 * Custom bosses themed to the Fandom item sets. Spawned only via /boss (admin).
 *
 *  - KIZUKI_DEMON   (Naruto) — an Upper Moon in everything but name. Blinks in
 *    a swirl of blood art every few seconds, summons lesser demons, and drops
 *    Chidori Blade parts when slain by a fandom weapon.
 *  - LEVIATHAN      (Supernatural) — the things from Purgatory. Shrugs off
 *    conventional damage (regenerates hard), erupts in a pillar of black blood,
 *    and must be finished with the items that were made to kill them: Angel
 *    Blade, First Blade, or Death's Scythe (the Colt only wounds them —
 *    "some things the Colt cannot kill").
 */
public enum BossType {

    KIZUKI_DEMON(
        "kizuki_demon", EntityType.ENDERMAN, ChatColor.DARK_PURPLE,
        "Upper Moon, the Twelve Kizuki",
        300.0, 0.38, 12.0,
        new String[]{
            "§5Blood Demon Art: §7phases between shadows and calls",
            "§7lesser demons to its side. Slayer's blade required.",
            "§8Drops Chidori Blade / Rasengan when felled by",
            "§8a demon-slaying weapon."
        },
        "civbridge:boss_kizuki_demon", 3011,
        "ENTITY_ENDERMAN_TELEPORT", "ENTITY_ENDERMAN_SCREAM"
    ),

    LEVIATHAN(
        "leviathan", EntityType.ELDER_GUARDIAN, ChatColor.DARK_AQUA,
        "The Leviathan",
        400.0, 0.30, 15.0,
        new String[]{
            "§3Regenerates faster than steel can bite —",
            "§7finish it with Heaven's steel: §fAngel Blade§7,",
            "§4First Blade§7, or §5Death's Scythe§7.",
            "§8Drops The Colt and Angel Blades when felled"
        },
        "civbridge:boss_leviathan", 3012,
        "ENTITY_ELDER_GUARDIAN_CURSE", "ENTITY_ELDER_GUARDIAN_DEATH"
    );

    private final String id;
    private final EntityType entityType;
    private final ChatColor color;
    private final String displayName;
    private final double maxHealth;
    private final double movementSpeed;
    private final double attackDamage;
    private final String[] description;
    private final String cmdString;
    private final int legacyCmd;
    private final String ambientSound;
    private final String deathSound;

    BossType(String id, EntityType entityType, ChatColor color, String displayName,
             double maxHealth, double movementSpeed, double attackDamage,
             String[] description, String cmdString, int legacyCmd,
             String ambientSound, String deathSound) {
        this.id = id;
        this.entityType = entityType;
        this.color = color;
        this.displayName = displayName;
        this.maxHealth = maxHealth;
        this.movementSpeed = movementSpeed;
        this.attackDamage = attackDamage;
        this.description = description;
        this.cmdString = cmdString;
        this.legacyCmd = legacyCmd;
        this.ambientSound = ambientSound;
        this.deathSound = deathSound;
    }

    public String id()          { return id; }
    public EntityType entity()  { return entityType; }
    public ChatColor color()    { return color; }
    public String displayName() { return displayName; }
    public double maxHealth()   { return maxHealth; }
    public double speed()       { return movementSpeed; }
    public double damage()      { return attackDamage; }
    public String[] description() { return description; }
    public String cmdString()   { return cmdString; }
    public int legacyCmd()      { return legacyCmd; }
    public String ambientSound(){ return ambientSound; }
    public String deathSound()  { return deathSound; }

    /** Parse from a friendly name or id: "kizuki", "demon", "leviathan", "3012". */
    public static BossType parse(String input) {
        if (input == null) return null;
        String q = input.toLowerCase().replace(' ', '_').replace('-', '_');
        for (BossType t : values()) {
            if (t.id.equals(q) || String.valueOf(t.legacyCmd).equals(q)) return t;
            if (q.length() >= 3 && t.displayName.toLowerCase().replace(" ", "_").contains(q)) return t;
        }
        return null;
    }

    /** Vanilla Material used as a pseudo-icon in listings (informational only). */
    public Material icon() {
        return switch (this) {
            case KIZUKI_DEMON -> Material.REDSTONE;
            case LEVIATHAN -> Material.PRISMARINE_SHARD;
        };
    }
}
