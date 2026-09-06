package com.civbot.lightsaber;

import org.bukkit.ChatColor;
import org.bukkit.Material;
import org.bukkit.inventory.ItemStack;
import org.bukkit.inventory.meta.ItemMeta;

import java.util.ArrayList;
import java.util.List;

/**
 * Builds the custom lightsaber ItemStacks. Every saber is a netherite sword
 * whose client-side appearance comes from the bundled resource pack via the
 * custom_model_data component (string form for 1.21.4+; the legacy integer
 * is stored as well so older clients fall back to the override models).
 */
public final class LightsaberFactory {

    private LightsaberFactory() {}

    public static ItemStack create(LightsaberType type) {
        ItemStack item = new ItemStack(Material.NETHERITE_SWORD);
        ItemMeta meta = item.getItemMeta();

        meta.setDisplayName(type.color().toString() + ChatColor.BOLD + type.displayName());

        List<String> lore = new ArrayList<>();
        lore.add(ChatColor.GRAY + type.modelId());
        lore.add("");
        for (String line : type.lore()) {
            lore.add(ChatColor.DARK_GRAY + "" + ChatColor.ITALIC + line);
        }
        lore.add("");
        lore.add(ChatColor.YELLOW + "✦ " + type.attackDamage() + " Blade Damage");
        lore.add(ChatColor.DARK_GREEN + "Unbreakable");
        lore.add(ChatColor.DARK_GRAY + "CivBridge Lightsaber");
        meta.setLore(lore);

        // Keep the vanilla netherite attack value from inflating saber hits —
        // damage is handled by SaberListener, and the first lore line is the id.
        meta.setUnbreakable(true);
        meta.addItemFlags(org.bukkit.inventory.ItemFlag.HIDE_ATTRIBUTES);
        meta.addItemFlags(org.bukkit.inventory.ItemFlag.HIDE_UNBREAKABLE);

        // Modern 1.21.4+: custom_model_data with strings. This is what the
        // resource pack's minecraft/items/netherite_sword.json matches on.
        try {
            var cmd = meta.getCustomModelDataComponent();
            cmd.setStrings(List.of(type.cmdString()));
            meta.setCustomModelDataComponent(cmd);
        } catch (Throwable ignored) {}

        // Legacy 1.21.3 and below: plain integer CMD, matched by the override
        // models. On 1.21.4+ this integer lives beside the strings harmlessly.
        try {
            meta.setCustomModelData(type.legacyCmd());
        } catch (Throwable ignored) {}

        item.setItemMeta(meta);
        return item;
    }

    /** Reads the saber id back from an item's lore, or null if it's not a saber. */
    public static LightsaberType fromItem(ItemStack item) {
        if (item == null || !item.hasItemMeta()) return null;
        ItemMeta meta = item.getItemMeta();
        if (!meta.hasLore() || meta.getLore().isEmpty()) return null;
        String first = ChatColor.stripColor(meta.getLore().get(0)).trim();
        if (!first.startsWith("custom_swords:")) return null;
        return LightsaberType.parse(first.substring("custom_swords:".length()));
    }
}
