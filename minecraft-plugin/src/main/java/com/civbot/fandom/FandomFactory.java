package com.civbot.fandom;

import org.bukkit.ChatColor;
import org.bukkit.Material;
import org.bukkit.inventory.ItemFlag;
import org.bukkit.inventory.ItemStack;
import org.bukkit.inventory.meta.ItemMeta;

import java.util.ArrayList;
import java.util.List;

/**
 * Builds the Fandom item ItemStacks. Each item is its base vanilla material
 * (netherite pickaxe/shovel/hoe — the items the client reskins via
 * custom_model_data), unbreakable, with hidden attributes and its own lore.
 * Damage for weapons is applied by FandomListener, like the sabers.
 */
public final class FandomFactory {

    private FandomFactory() {}

    public static ItemStack create(FandomType type) {
        ItemStack item = new ItemStack(type.material());
        ItemMeta meta = item.getItemMeta();

        meta.setDisplayName(type.color() + "" + ChatColor.BOLD + type.displayName());

        List<String> lore = new ArrayList<>();
        lore.add(ChatColor.DARK_GRAY + type.cmdString());
        lore.add("");
        for (String line : type.lore()) {
            lore.add(line.startsWith("§") ? line : ChatColor.DARK_GRAY + "" + ChatColor.ITALIC + line);
        }
        if (type.attackDamage() > 0) {
            lore.add("");
            lore.add(ChatColor.YELLOW + "✦ " + type.attackDamage() + " Damage");
        }
        lore.add(ChatColor.DARK_GREEN + "Unbreakable");
        lore.add(ChatColor.DARK_GRAY + "CivBridge Fandom Item");
        meta.setLore(lore);

        meta.setUnbreakable(true);
        meta.addItemFlags(ItemFlag.HIDE_ATTRIBUTES, ItemFlag.HIDE_UNBREAKABLE);

        try {
            var cmd = meta.getCustomModelDataComponent();
            cmd.setStrings(List.of(type.cmdString()));
            meta.setCustomModelDataComponent(cmd);
        } catch (Throwable ignored) {}
        try {
            meta.setCustomModelData(type.legacyCmd());
        } catch (Throwable ignored) {}

        item.setItemMeta(meta);
        return item;
    }

    /** Reads the fandom id back from an item's lore, or null if it's not one. */
    public static FandomType fromItem(ItemStack item) {
        if (item == null || !item.hasItemMeta()) return null;
        ItemMeta meta = item.getItemMeta();
        if (!meta.hasLore() || meta.getLore().isEmpty()) return null;
        String first = ChatColor.stripColor(meta.getLore().get(0)).trim();
        if (!first.startsWith("civbridge:fandom_")) return null;
        return FandomType.parse(first.substring("civbridge:fandom_".length()));
    }
}
