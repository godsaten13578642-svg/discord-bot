package com.civbot.commands;

import com.civbot.CivBridgePlugin;
import com.civbot.infinity.InfinityFactory;
import com.civbot.infinity.InfinityStone;
import org.bukkit.Bukkit;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.command.TabCompleter;
import org.bukkit.entity.Player;
import org.bukkit.inventory.ItemStack;
import org.jetbrains.annotations.NotNull;
import org.jetbrains.annotations.Nullable;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * /infinity            — overview of the Infinity set
 * /infinity stone <id> — give an Infinity Stone (admin only)
 * /infinity gauntlet   — give the Infinity Gauntlet (admin only)
 *
 * There are no recipes and no drops: the only way any of this enters the
 * game is through this command, so keep civbridge.infinity admin-only.
 */
public class InfinityCommand implements CommandExecutor, TabCompleter {

    private static final String PERMISSION = "civbridge.infinity";

    private final CivBridgePlugin plugin;

    public InfinityCommand(CivBridgePlugin plugin) {
        this.plugin = plugin;
    }

    @Override
    public boolean onCommand(@NotNull CommandSender sender, @NotNull Command cmd,
                             @NotNull String label, String[] args) {
        if (!sender.hasPermission(PERMISSION)) {
            sender.sendMessage("§cYou don't have permission to use /" + label + ".");
            return true;
        }

        if (args.length == 0 || args[0].equalsIgnoreCase("help")) {
            sendOverview(sender, label);
            return true;
        }

        String sub = args[0].toLowerCase(Locale.ROOT);
        switch (sub) {
            case "stone" -> {
                if (args.length < 2) {
                    sender.sendMessage("§cUsage: /" + label + " stone <name> [player] — names: "
                        + "§fspace, mind, reality, power, time, soul");
                    return true;
                }
                InfinityStone stone = InfinityStone.parse(args[1]);
                if (stone == null) {
                    sender.sendMessage("§cUnknown stone '§f" + args[1] + "§c'. Try: space, mind, reality, power, time, soul");
                    return true;
                }
                Player target = resolveTarget(sender, args, 2, label);
                if (target == null) return true;

                give(target, InfinityFactory.createStone(stone,
                    new org.bukkit.NamespacedKey(plugin, "gauntlet_" + InfinityFactory.GAUNTLET_SOCKETS_KEY)));
                sender.sendMessage("§aGave the " + stone.color() + stone.displayName() + "§a to §b" + target.getName() + "§a.");
            }
            case "gauntlet" -> {
                Player target = resolveTarget(sender, args, 1, label);
                if (target == null) return true;

                give(target, InfinityFactory.createGauntlet(
                    new org.bukkit.NamespacedKey(plugin, "gauntlet_" + InfinityFactory.GAUNTLET_SOCKETS_KEY)));
                sender.sendMessage("§aGave the §6Infinity Gauntlet§a to §b" + target.getName() + "§a.");
            }
            default -> {
                sender.sendMessage("§cUnknown subcommand '§f" + args[0] + "§c'.");
                sendOverview(sender, label);
            }
        }
        return true;
    }

    private void sendOverview(CommandSender sender, String label) {
        sender.sendMessage("§6── Infinity Stones ──────────────────────────");
        for (InfinityStone s : InfinityStone.values()) {
            sender.sendMessage(" " + s.color() + "◆ " + s.displayName()
                + " §8→ " + s.powerLore()[0].substring(2)); // power summary
        }
        sender.sendMessage("§7Socket a stone: §fhold the stone, sneak + right-click§7 with the gauntlet in your off-hand.");
        sender.sendMessage("§7Use a power: §fright-click the gauntlet§7. All six socketed → §4the Snap§7.");
        sender.sendMessage("§7Give items: §f/" + label + " stone <name> [player] §8| §f/" + label + " gauntlet [player]");
    }

    private Player resolveTarget(CommandSender sender, String[] args, int index, String label) {
        if (args.length > index) {
            Player target = Bukkit.getPlayerExact(args[index]);
            if (target == null) {
                sender.sendMessage("§cPlayer '§f" + args[index] + "§c' is not online.");
            }
            return target;
        }
        if (sender instanceof Player p) return p;
        sender.sendMessage("§cConsole must specify a player: /" + label + " … <player>");
        return null;
    }

    private void give(Player target, ItemStack item) {
        var leftover = target.getInventory().addItem(item);
        leftover.values().forEach(stack ->
            target.getWorld().dropItemNaturally(target.getLocation(), stack));
        target.playSound(target.getLocation(), org.bukkit.Sound.BLOCK_BEACON_POWER_SELECT, 0.7f, 1.2f);
    }

    @Override
    public @Nullable List<String> onTabComplete(@NotNull CommandSender sender, @NotNull Command cmd,
                                                @NotNull String alias, String[] args) {
        if (!sender.hasPermission(PERMISSION)) return List.of();
        String p;
        switch (args.length) {
            case 1 -> {
                p = args[0].toLowerCase(Locale.ROOT);
                List<String> out = new ArrayList<>();
                for (String s : List.of("stone", "gauntlet")) {
                    if (s.startsWith(p)) out.add(s);
                }
                return out;
            }
            case 2 -> {
                if (!args[0].equalsIgnoreCase("stone")) return List.of();
                p = args[1].toLowerCase(Locale.ROOT);
                List<String> out = new ArrayList<>();
                for (InfinityStone s : InfinityStone.values()) {
                    if (s.id().startsWith(p)) out.add(s.id());
                }
                return out;
            }
            case 3 -> {
                if (!args[0].equalsIgnoreCase("stone")) return List.of();
                p = args[2].toLowerCase(Locale.ROOT);
                List<String> out = new ArrayList<>();
                for (Player pl : Bukkit.getOnlinePlayers()) {
                    if (pl.getName().toLowerCase(Locale.ROOT).startsWith(p)) out.add(pl.getName());
                }
                return out;
            }
            default -> { return List.of(); }
        }
    }
}
