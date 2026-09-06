package com.civbot.infinity;

import org.bukkit.ChatColor;
import org.bukkit.Material;
import org.bukkit.NamespacedKey;
import org.bukkit.Sound;
import org.bukkit.entity.Player;
import org.bukkit.inventory.ItemFlag;
import org.bukkit.inventory.ItemStack;
import org.bukkit.inventory.meta.ItemMeta;
import org.bukkit.persistence.PersistentDataContainer;
import org.bukkit.persistence.PersistentDataType;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Builds and reads the Infinity items.
 *
 * The gauntlet is a {@link Material#CARROT_ON_A_STICK}: it's interactive on
 * right click, has no vanilla behavior to fight, and switching to a different
 * socketed model is just swapping its CustomModelData. Its six sockets live in
 * the item's PersistentDataContainer, so they survive restarts, backups, and
 * stay consistent for every player holding it.
 */
public final class InfinityFactory {

    /** PDC key: comma-separated socketed stone ids, e.g. "space,reality". */
    public static final String GAUNTLET_SOCKETS_KEY = "sockets";

    private InfinityFactory() {}

    // ── Stone item ───────────────────────────────────────────────────────────

    public static ItemStack createStone(InfinityStone stone, NamespacedKey key) {
        ItemStack item = new ItemStack(Material.NETHERITE_AXE);
        ItemMeta meta = item.getItemMeta();

        meta.setDisplayName(stone.color() + "" + ChatColor.BOLD + stone.displayName());
        List<String> lore = new ArrayList<>();
        lore.add(ChatColor.DARK_GRAY + stone.cmdString());
        lore.add("");
        lore.add(ChatColor.GRAY + "An Infinity Stone. It hums with restrained");
        lore.add(ChatColor.GRAY + "power, cold to the touch.");
        lore.add("");
        lore.add(ChatColor.GOLD + "Sneak + right-click the §fInfinity Gauntlet");
        lore.add(ChatColor.GOLD + "to socket it and claim its power.");
        meta.setLore(lore);

        meta.setUnbreakable(true);
        meta.addItemFlags(ItemFlag.HIDE_ATTRIBUTES, ItemFlag.HIDE_UNBREAKABLE);

        try {
            var cmd = meta.getCustomModelDataComponent();
            cmd.setStrings(List.of(stone.cmdString()));
            meta.setCustomModelDataComponent(cmd);
        } catch (Throwable ignored) {}
        try {
            meta.setCustomModelData(stone.legacyCmd());
        } catch (Throwable ignored) {}

        item.setItemMeta(meta);
        return item;
    }

    /** Reads the stone id from an item's first lore line, or null. */
    public static InfinityStone stoneFromItem(ItemStack item) {
        if (item == null || !item.hasItemMeta()) return null;
        ItemMeta meta = item.getItemMeta();
        if (!meta.hasLore() || meta.getLore().isEmpty()) return null;
        String first = ChatColor.stripColor(meta.getLore().get(0)).trim();
        if (!first.startsWith("civbridge:infinity_stone_")) return null;
        return InfinityStone.parse(first.substring("civbridge:infinity_stone_".length()));
    }

    // ── Gauntlet ─────────────────────────────────────────────────────────────

    /** A fresh, empty Infinity Gauntlet. */
    public static ItemStack createGauntlet(NamespacedKey key) {
        ItemStack item = new ItemStack(Material.CARROT_ON_A_STICK);
        ItemMeta meta = item.getItemMeta();

        meta.setDisplayName(ChatColor.GOLD + "" + ChatColor.BOLD + "Infinity Gauntlet");
        meta.setLore(gauntletLore(List.of()));
        meta.setUnbreakable(true);
        meta.addItemFlags(ItemFlag.HIDE_ATTRIBUTES, ItemFlag.HIDE_UNBREAKABLE);

        try {
            var cmd = meta.getCustomModelDataComponent();
            cmd.setStrings(List.of("civbridge:gauntlet_empty"));
            meta.setCustomModelDataComponent(cmd);
        } catch (Throwable ignored) {}
        try {
            meta.setCustomModelData(2101);
        } catch (Throwable ignored) {}

        item.setItemMeta(meta);
        return item;
    }

    /**
     * Socket a stone into a gauntlet (no-op if already there or gauntlet full).
     * Returns the updated gauntlet, or null when the socket was refused.
     */
    public static ItemStack socketStone(ItemStack gauntlet, InfinityStone stone, NamespacedKey key) {
        if (!isGauntlet(gauntlet) || stone == null) return null;
        List<InfinityStone> socketed = readSockets(gauntlet, key);
        if (socketed.size() >= InfinityStone.values().length || socketed.contains(stone)) return null;

        socketed.add(stone);
        socketed.sort(java.util.Comparator.comparingInt(Enum::ordinal)); // stable, pretty model & lore order

        ItemMeta meta = gauntlet.getItemMeta();
        PersistentDataContainer pdc = meta.getPersistentDataContainer();
        String joined = socketed.stream().map(InfinityStone::id).reduce((a, b) -> a + "," + b).orElse("");
        pdc.set(key, PersistentDataType.STRING, joined);

        meta.setLore(gauntletLore(socketed));
        applyModel(meta, socketed);
        gauntlet.setItemMeta(meta);
        return gauntlet;
    }

    /** Whether the gauntlet holds a specific stone's power. */
    public static boolean hasStone(ItemStack gauntlet, InfinityStone stone, NamespacedKey key) {
        return isGauntlet(gauntlet) && readSockets(gauntlet, key).contains(stone);
    }

    /** All socketed stones on a gauntlet (empty list if none / not a gauntlet). */
    public static List<InfinityStone> readSockets(ItemStack gauntlet, NamespacedKey key) {
        List<InfinityStone> out = new ArrayList<>();
        if (!isGauntlet(gauntlet)) return out;
        String raw = gauntlet.getItemMeta().getPersistentDataContainer()
            .get(key, PersistentDataType.STRING);
        if (raw == null || raw.isBlank()) return out;
        for (String part : raw.split(",")) {
            InfinityStone s = InfinityStone.parse(part.trim());
            if (s != null) out.add(s);
        }
        return out;
    }

    public static boolean isGauntlet(ItemStack item) {
        if (item == null || item.getType() != Material.CARROT_ON_A_STICK || !item.hasItemMeta()) return false;
        String first = ChatColor.stripColor(item.getItemMeta().getDisplayName());
        return first.equals("Infinity Gauntlet");
    }

    // ── Internals ────────────────────────────────────────────────────────────

    private static List<String> gauntletLore(List<InfinityStone> socketed) {
        List<String> lore = new ArrayList<>();
        lore.add(ChatColor.DARK_GRAY + "civbridge:gauntlet");
        lore.add("");
        if (socketed.isEmpty()) {
            lore.add(ChatColor.GRAY + "Six empty sockets. It feels heavier");
            lore.add(ChatColor.GRAY + "than it should, as if waiting.");
            lore.add("");
            lore.add(ChatColor.GOLD + "Sneak + right-click while holding a");
            lore.add(ChatColor.GOLD + "§6stone §fto socket it.");
        } else {
            lore.add(ChatColor.DARK_GRAY + "Socketed stones:");
            for (InfinityStone s : socketed) {
                lore.add(" " + s.color() + "◆ " + s.displayName());
            }
            lore.add("");
            lore.add(ChatColor.GRAY + "Right-click to use the socketed power.");
            if (socketed.size() >= InfinityStone.values().length) {
                lore.add("");
                lore.add(ChatColor.DARK_RED + "" + ChatColor.BOLD + "ALL SIX STONES.");
                lore.add(ChatColor.DARK_RED + "Right-click to… you know what to do.");
                lore.add(ChatColor.DARK_GRAY + "" + ChatColor.ITALIC + "(Perfectly balanced, 5-minute cooldown.)");
            }
        }
        return lore;
    }

    /** Updates CMD strings + legacy int so the client renders the right variant. */
    private static void applyModel(ItemMeta meta, List<InfinityStone> socketed) {
        String variant = socketed.isEmpty() ? "empty" : socketed.get(socketed.size() - 1).id();
        try {
            var cmd = meta.getCustomModelDataComponent();
            cmd.setStrings(List.of("civbridge:gauntlet_" + variant));
            meta.setCustomModelDataComponent(cmd);
        } catch (Throwable ignored) {}
        try {
            int legacy = socketed.isEmpty() ? 2101 : 2102 + socketed.get(socketed.size() - 1).ordinal();
            meta.setCustomModelData(legacy);
        } catch (Throwable ignored) {}
    }

    // ── Snap helper ──────────────────────────────────────────────────────────

    /** 50/50 fade per entity: the snap's roulette. */
    public static boolean isChosen() {
        return java.util.concurrent.ThreadLocalRandom.current().nextBoolean();
    }

    /** Little snap sound for feedback. */
    public static void playSnapSound(Player player) {
        player.getWorld().playSound(player.getLocation(), Sound.BLOCK_FIRE_EXTINGUISH, 1f, 0.6f);
    }
}
