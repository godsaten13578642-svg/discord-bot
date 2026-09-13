package com.civbot.gui;

import com.civbot.CivBridgePlugin;
import com.civbot.fandom.FandomFactory;
import com.civbot.fandom.FandomType;
import com.civbot.infinity.InfinityFactory;
import com.civbot.infinity.InfinityStone;
import com.civbot.lightsaber.LightsaberFactory;
import com.civbot.lightsaber.LightsaberType;
import org.bukkit.Bukkit;
import org.bukkit.ChatColor;
import org.bukkit.Material;
import org.bukkit.NamespacedKey;
import org.bukkit.Sound;
import org.bukkit.enchantments.Enchantment;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.inventory.InventoryClickEvent;
import org.bukkit.inventory.Inventory;
import org.bukkit.inventory.ItemStack;
import org.bukkit.inventory.meta.ItemMeta;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * ReactSMP-themed item menu, opened with /civgui.
 *
 * Styled after the ReactSMP logo: black backdrop, purple neon border fading to
 * cyan, a crown marker, and a bright "spark" separator. Three sections —
 * Sabers, Infinity and Fandom — selectable via tab buttons in the header that
 * jump straight to each category. Clicks hand out the REAL plugin items (same
 * factories as /saber, /infinity and /fandom), so powers, lore and
 * resource-pack models all come along.
 */
public final class CivGui implements Listener {

    private static final String TITLE = "§8☾ §d§lReact§b§lSMP §7— §f%s";

    private static final String[] SECTION_NAMES = { "Sabers", "Infinity", "Fandom" };
    private static final String TAB_PREFIX = "▶ "; // stripped-name match key for tabs

    private final CivBridgePlugin plugin;
    private final NamespacedKey stoneKey;
    private final Map<UUID, Inventory[]> pages = new HashMap<>();
    private final Map<UUID, Integer> section = new HashMap<>();

    public CivGui(CivBridgePlugin plugin) {
        this.plugin = plugin;
        this.stoneKey = new NamespacedKey(plugin, "gauntlet_" + InfinityFactory.GAUNTLET_SOCKETS_KEY);
    }

    // ── Open ─────────────────────────────────────────────────────────────────

    public void open(Player player) {
        Inventory[] invs = buildAll();
        pages.put(player.getUniqueId(), invs);
        section.put(player.getUniqueId(), 0);
        player.openInventory(invs[0]);
        player.playSound(player.getLocation(), Sound.BLOCK_ENDER_CHEST_OPEN, 0.6f, 1.4f);
    }

    // ── Entries ──────────────────────────────────────────────────────────────

    private record Entry(String hint, ItemStack item) {}

    private List<Entry> saberEntries() {
        List<Entry> out = new ArrayList<>();
        for (LightsaberType t : LightsaberType.values()) {
            out.add(new Entry("§7✦ " + t.attackDamage() + " blade damage", LightsaberFactory.create(t)));
        }
        return out;
    }

    private List<Entry> infinityEntries() {
        List<Entry> out = new ArrayList<>();
        for (InfinityStone s : InfinityStone.values()) {
            out.add(new Entry("§7Right-click gauntlet to socket", InfinityFactory.createStone(s, stoneKey)));
        }
        out.add(new Entry("§7Socket stones in the off-hand", InfinityFactory.createGauntlet(stoneKey)));
        return out;
    }

    private List<Entry> fandomEntries() {
        List<Entry> out = new ArrayList<>();
        for (FandomType t : FandomType.values()) {
            out.add(new Entry("§7Fandom item — powers included", FandomFactory.create(t)));
        }
        return out;
    }

    // ── Decoration ───────────────────────────────────────────────────────────

    /** Purple -> cyan gradient across the row, like the logo's neon frame. */
    private ItemStack border(int columnInRow, int columnsInRow) {
        double t = columnsInRow <= 1 ? 0 : (double) columnInRow / (columnsInRow - 1);
        // Colored panes so the sweep is visible without hovering.
        Material mat = t < 0.2 ? Material.PURPLE_STAINED_GLASS_PANE
            : t < 0.45 ? Material.MAGENTA_STAINED_GLASS_PANE
            : t < 0.7 ? Material.BLUE_STAINED_GLASS_PANE
            : t < 0.9 ? Material.LIGHT_BLUE_STAINED_GLASS_PANE
            : Material.CYAN_STAINED_GLASS_PANE;
        return named(new ItemStack(mat), "§x§9§d§4§e§f§f▮ §7ReactSMP");
    }

    private ItemStack filler() {
        return named(new ItemStack(Material.BLACK_STAINED_GLASS_PANE), "§r");
    }

    private ItemStack crown() {
        return withCmd(named(new ItemStack(Material.GOLDEN_HELMET),
            "§6♚ §7ReactSMP §8• §7Custom Items"), "reactsmp:crown");
    }

    private ItemStack spark() {
        return withCmd(named(new ItemStack(Material.NETHER_STAR), "§b✦ §fReactSMP"), "reactsmp:spark");
    }

    /** Applies a string CMD so the resource pack swaps in the logo-extracted model. */
    private ItemStack withCmd(ItemStack item, String cmd) {
        try {
            var meta = item.getItemMeta();
            var component = meta.getCustomModelDataComponent();
            component.setStrings(List.of(cmd));
            meta.setCustomModelDataComponent(component);
            item.setItemMeta(meta);
        } catch (Throwable ignored) {
            // Pre-1.21.4: fall back to the plain item (name still reads fine).
        }
        return item;
    }

    /** A category tab: themed icon, glints when it's the section you're on. */
    private ItemStack tab(int index, boolean active) {
        ItemStack icon = switch (index) {
            case 0 -> LightsaberFactory.create(LightsaberType.ANAKIN_BLUE);
            case 1 -> InfinityFactory.createGauntlet(stoneKey);
            default -> FandomFactory.create(FandomType.THE_COLT);
        };
        ItemMeta meta = icon.getItemMeta();
        String label = SECTION_NAMES[index];
        meta.setDisplayName(active ? "§f§l" + TAB_PREFIX + label : "§8" + TAB_PREFIX + "§7" + label);
        List<String> lore = new ArrayList<>();
        lore.add(active ? "§a§l▸ Current section" : "§7Click to jump to §f" + label);
        meta.setLore(lore);
        if (active) meta.addEnchant(Enchantment.UNBREAKING, 1, true); // glint = selected
        icon.setItemMeta(meta);
        return icon;
    }

    private ItemStack named(ItemStack item, String name) {
        ItemMeta meta = item.getItemMeta();
        meta.setDisplayName(name);
        item.setItemMeta(meta);
        return item;
    }

    // ── Pages ────────────────────────────────────────────────────────────────

    private static final int[] ITEM_SLOTS = {
        10, 11, 12, 13, 14, 15, 16,
        19, 20, 21, 22, 23, 24, 25,
        28, 29, 30, 31, 32, 33, 34,
    };
    private static final int[] TAB_SLOTS = { 2, 4, 6 };

    /** Builds one 54-slot page per section, tabs and all. */
    private Inventory[] buildAll() {
        List<List<Entry>> sections = List.of(saberEntries(), infinityEntries(), fandomEntries());

        Inventory[] invs = new Inventory[sections.size()];
        for (int s = 0; s < sections.size(); s++) {
            Inventory inv = Bukkit.createInventory(null, 54, String.format(TITLE, SECTION_NAMES[s]));

            // Black backdrop everywhere.
            for (int i = 0; i < 54; i++) inv.setItem(i, filler());

            // Neon gradient frame: top + bottom rows sweep purple -> cyan,
            // side columns hold the matching end of the gradient.
            for (int c = 0; c < 9; c++) {
                inv.setItem(c, border(c, 9));                    // top
                inv.setItem(45 + c, border(c, 9));               // bottom
            }
            for (int r = 1; r < 5; r++) {
                inv.setItem(r * 9, border(0, 9));                // left (purple)
                inv.setItem(r * 9 + 8, border(8, 9));            // right (cyan)
            }

            // Header: category tabs (glinting on the current section) + crown.
            for (int t = 0; t < TAB_SLOTS.length; t++) {
                inv.setItem(TAB_SLOTS[t], tab(t, t == s));
            }
            inv.setItem(8, crown());

            // Items for this section.
            List<Entry> entries = sections.get(s);
            for (int i = 0; i < ITEM_SLOTS.length && i < entries.size(); i++) {
                Entry e = entries.get(i);
                ItemStack item = e.item().clone();
                ItemMeta meta = item.getItemMeta();
                List<String> lore = meta.hasLore() && meta.getLore() != null
                    ? new ArrayList<>(meta.getLore()) : new ArrayList<>();
                lore.add("");
                lore.add(e.hint());
                lore.add("§d§lCLICK §7to receive");
                meta.setLore(lore);
                item.setItemMeta(meta);
                inv.setItem(ITEM_SLOTS[i], item);
            }

            // Nav row.
            inv.setItem(45, named(new ItemStack(Material.CHEST), "§6★ §eGive one of everything"));
            inv.setItem(49, spark());
            inv.setItem(53, named(new ItemStack(Material.BARRIER), "§c✕ §7Close"));

            invs[s] = inv;
        }
        return invs;
    }

    // ── Click handling ───────────────────────────────────────────────────────

    @EventHandler
    public void onClick(InventoryClickEvent event) {
        Inventory top = event.getView().getTopInventory();
        if (top.getHolder() != null || top.getSize() != 54) return;
        String title = event.getView().getTitle();
        if (!title.startsWith("§8☾ §d§lReact§b§lSMP")) return;

        event.setCancelled(true);
        if (!(event.getWhoClicked() instanceof Player player)) return;
        if (event.getClickedInventory() != top) return;

        ItemStack clicked = event.getCurrentItem();
        if (clicked == null || !clicked.hasItemMeta()) return;
        String name = ChatColor.stripColor(clicked.getItemMeta().getDisplayName());
        Inventory[] invs = pages.get(player.getUniqueId());
        if (invs == null || invs.length == 0) return; // stale view after reload

        switch (name) {
            case TAB_PREFIX + "Sabers" -> switchTo(player, invs, 0);
            case TAB_PREFIX + "Infinity" -> switchTo(player, invs, 1);
            case TAB_PREFIX + "Fandom" -> switchTo(player, invs, 2);
            case "✕ Close" -> player.closeInventory();
            case "★ Give one of everything" -> {
                giveEverything(player);
                player.closeInventory();
            }
            default -> { /* fall through to the item grid below */ }
        }

        // Any non-glass click inside the grid = give that item.
        if (isGridSlot(event.getSlot()) && clicked.getType() != Material.BLACK_STAINED_GLASS_PANE) {
            player.getInventory().addItem(clicked.clone()).forEach((slot, left) ->
                player.getWorld().dropItemNaturally(player.getLocation(), left));
            player.sendMessage("§d✦ §7Received §f" + clicked.getItemMeta().getDisplayName() + "§7.");
            click(player);
        }
    }

    private void switchTo(Player player, Inventory[] invs, int index) {
        if (index >= invs.length) return;
        if (section.getOrDefault(player.getUniqueId(), 0) == index) return; // already there
        section.put(player.getUniqueId(), index);
        player.openInventory(invs[index]);
        click(player);
    }

    private boolean isGridSlot(int slot) {
        for (int s : ITEM_SLOTS) if (s == slot) return true;
        return false;
    }

    private void click(Player player) {
        player.playSound(player.getLocation(), Sound.UI_BUTTON_CLICK, 0.5f, 1.6f);
    }

    /** One of every custom item — 24 stacks total. */
    private void giveEverything(Player player) {
        List<ItemStack> all = new ArrayList<>();
        for (LightsaberType t : LightsaberType.values()) all.add(LightsaberFactory.create(t));
        for (InfinityStone s : InfinityStone.values()) all.add(InfinityFactory.createStone(s, stoneKey));
        all.add(InfinityFactory.createGauntlet(stoneKey));
        for (FandomType t : FandomType.values()) all.add(FandomFactory.create(t));
        for (ItemStack item : all) {
            player.getInventory().addItem(item).forEach((slot, left) ->
                player.getWorld().dropItemNaturally(player.getLocation(), left));
        }
        player.sendMessage("§6★ §7Gave you §fone of everything §7(" + all.size() + " items).");
        player.playSound(player.getLocation(), Sound.ENTITY_PLAYER_LEVELUP, 0.8f, 1.2f);
    }
}
