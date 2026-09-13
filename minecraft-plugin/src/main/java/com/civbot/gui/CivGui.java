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
 * Styled after the ReactSMP logo: black backdrop, purple neon border on the
 * left edge fading to cyan on the right, a crown marker up top, and a bright
 * "spark" separator. Two pages — Sabers & Infinity, then Fandom — plus a
 * "give one of everything" button. Clicks hand out the REAL plugin items
 * (same factories as /saber, /infinity and /fandom), so powers, lore and
 * resource-pack models all come along.
 */
public final class CivGui implements Listener {

    private static final String TITLE = "§8☾ §d§lReact§b§lSMP §7Items §8— §dPage %d§7/§b%d";

    private final CivBridgePlugin plugin;
    private final NamespacedKey stoneKey;
    private final Map<UUID, Integer> page = new HashMap<>();
    private final Map<UUID, List<Inventory>> pages = new HashMap<>();

    public CivGui(CivBridgePlugin plugin) {
        this.plugin = plugin;
        this.stoneKey = new NamespacedKey(plugin, "gauntlet_" + InfinityFactory.GAUNTLET_SOCKETS_KEY);
    }

    // ── Open ─────────────────────────────────────────────────────────────────

    public void open(Player player) {
        List<Inventory> invs = buildPages();
        pages.put(player.getUniqueId(), invs);
        page.put(player.getUniqueId(), 0);
        player.openInventory(invs.get(0));
        player.playSound(player.getLocation(), Sound.BLOCK_ENDER_CHEST_OPEN, 0.6f, 1.4f);
    }

    // ── Entries ──────────────────────────────────────────────────────────────

    private record Entry(String label, String hint, ItemStack item) {}

    private List<Entry> entries() {
        List<Entry> out = new ArrayList<>();
        for (LightsaberType t : LightsaberType.values()) {
            out.add(new Entry(t.color() + "" + ChatColor.BOLD + t.displayName(),
                "§7✦ " + t.attackDamage() + " blade damage", LightsaberFactory.create(t)));
        }
        for (InfinityStone s : InfinityStone.values()) {
            out.add(new Entry(s.color() + "" + ChatColor.BOLD + s.displayName(),
                "§7Right-click gauntlet to socket", InfinityFactory.createStone(s, stoneKey)));
        }
        out.add(new Entry(ChatColor.GOLD + "" + ChatColor.BOLD + "Infinity Gauntlet",
            "§7Socket stones in the off-hand", InfinityFactory.createGauntlet(stoneKey)));
        for (FandomType t : FandomType.values()) {
            out.add(new Entry(t.color() + "" + ChatColor.BOLD + t.displayName(),
                "§7Fandom item — powers included", FandomFactory.create(t)));
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
        return named(new ItemStack(mat),
            "§x§9§d§4§e§f§f▮ §7ReactSMP");
    }

    private ItemStack filler() {
        return named(new ItemStack(Material.GRAY_STAINED_GLASS_PANE), "§r");
    }

    private ItemStack crown() {
        return named(new ItemStack(Material.GOLDEN_HELMET), "§6♚ §7ReactSMP §8• §7Custom Items");
    }

    private ItemStack spark() {
        return named(new ItemStack(Material.NETHER_STAR), "§b✦ §fReactSMP");
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

    private List<Inventory> buildPages() {
        List<Entry> all = entries();
        int perPage = ITEM_SLOTS.length;
        int pageCount = (all.size() + perPage - 1) / perPage;

        List<Inventory> invs = new ArrayList<>();
        for (int p = 0; p < pageCount; p++) {
            Inventory inv = Bukkit.createInventory(null, 54,
                String.format(TITLE, p + 1, pageCount));

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

            // Crown up top, spark separating header and grid.
            inv.setItem(4, crown());

            // Items for this page.
            int start = p * perPage;
            for (int i = 0; i < perPage && start + i < all.size(); i++) {
                Entry e = all.get(start + i);
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

            // Nav row (inside the gradient frame).
            if (p > 0) inv.setItem(48, named(new ItemStack(Material.ARROW), "§e« Previous"));
            if (p < pageCount - 1) inv.setItem(50, named(new ItemStack(Material.ARROW), "Next §e»"));
            inv.setItem(49, spark());
            inv.setItem(45, named(new ItemStack(Material.CHEST), "§6★ §eGive one of everything"));
            inv.setItem(53, named(new ItemStack(Material.BARRIER), "§c✕ §7Close"));

            invs.add(inv);
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
        List<Inventory> invs = pages.get(player.getUniqueId());
        if (invs == null || invs.isEmpty()) return; // stale view after reload
        int p = page.getOrDefault(player.getUniqueId(), 0);
        int pageCount = invs.size();

        switch (name) {
            case "« Previous" -> {
                if (p > 0) { page.put(player.getUniqueId(), p - 1); player.openInventory(invs.get(p - 1)); click(player); }
            }
            case "Next »" -> {
                if (p < pageCount - 1) { page.put(player.getUniqueId(), p + 1); player.openInventory(invs.get(p + 1)); click(player); }
            }
            case "✕ Close" -> player.closeInventory();
            case "★ Give one of everything" -> {
                giveEverything(player);
                player.closeInventory();
            }
            default -> { /* handled below */ }
        }

        // Any non-glass click inside the grid = give that item.
        if (isGridSlot(event.getSlot()) && clicked.getType() != Material.GRAY_STAINED_GLASS_PANE) {
            player.getInventory().addItem(clicked.clone()).forEach((slot, left) ->
                player.getWorld().dropItemNaturally(player.getLocation(), left));
            player.sendMessage("§d✦ §7Received §f" + clicked.getItemMeta().getDisplayName() + "§7.");
            click(player);
        }
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
