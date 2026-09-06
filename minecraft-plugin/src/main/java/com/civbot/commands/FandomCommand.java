package com.civbot.commands;

import com.civbot.CivBridgePlugin;
import com.civbot.fandom.FandomFactory;
import com.civbot.fandom.FandomType;
import org.bukkit.Bukkit;
import org.bukkit.Sound;
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
 * /fandom            — list all fandom items
 * /fandom <id> [player] — give a fandom item (admin only)
 */
public class FandomCommand implements CommandExecutor, TabCompleter {

    private static final String PERMISSION = "civbridge.fandom";

    private final CivBridgePlugin plugin;

    public FandomCommand(CivBridgePlugin plugin) {
        this.plugin = plugin;
    }

    @Override
    public boolean onCommand(@NotNull CommandSender sender, @NotNull Command cmd,
                             @NotNull String label, String[] args) {
        if (!sender.hasPermission(PERMISSION)) {
            sender.sendMessage("§cYou don't have permission to use /" + label + ".");
            return true;
        }

        if (args.length == 0) {
            sender.sendMessage("§6── Fandom Items ─────────────────────────────");
            String lastGroup = null;
            for (FandomType t : FandomType.values()) {
                String group = groupOf(t);
                if (!group.equals(lastGroup)) {
                    sender.sendMessage(" §8▪ §f" + group);
                    lastGroup = group;
                }
                sender.sendMessage("   " + t.color() + "◆ " + t.displayName()
                    + " §8(/" + label + " " + t.id() + ")");
            }
            return true;
        }

        FandomType type = FandomType.parse(args[0]);
        if (type == null) {
            sender.sendMessage("§cUnknown item '§f" + args[0] + "§c'. Use §f/" + label + "§c to list them.");
            return true;
        }

        Player target;
        if (args.length >= 2) {
            target = Bukkit.getPlayerExact(args[1]);
            if (target == null) {
                sender.sendMessage("§cPlayer '§f" + args[1] + "§c' is not online.");
                return true;
            }
        } else if (sender instanceof Player p) {
            target = p;
        } else {
            sender.sendMessage("§cConsole must specify a player: /" + label + " " + args[0] + " <player>");
            return true;
        }

        ItemStack item = FandomFactory.create(type);
        var leftover = target.getInventory().addItem(item);
        leftover.values().forEach(stack ->
            target.getWorld().dropItemNaturally(target.getLocation(), stack));
        target.playSound(target.getLocation(), Sound.BLOCK_BEACON_POWER_SELECT, 0.7f, 1.2f);
        target.sendMessage("§aYou received " + type.color() + type.displayName() + "§a!");
        if (!sender.equals(target)) {
            sender.sendMessage("§aGave " + type.color() + type.displayName() + "§a to §b" + target.getName() + "§a.");
        }
        return true;
    }

    private String groupOf(FandomType t) {
        return switch (t) {
            case PARKOUR_BOOTS, NO_SCOPE_EYES -> "Parkour Civ / PVP Civ (Evbo)";
            case HIDDEN_LEAF_HEADBAND, NINJA_STAR, SUMMONING_SCROLL, RASENGAN, CHIDORI_BLADE -> "Naruto";
            case ANGEL_BLADE, FIRST_BLADE, DEATHS_SCYTHE, THE_COLT -> "Supernatural";
        };
    }

    @Override
    public @Nullable List<String> onTabComplete(@NotNull CommandSender sender, @NotNull Command cmd,
                                                @NotNull String alias, String[] args) {
        if (!sender.hasPermission(PERMISSION)) return List.of();
        if (args.length == 1) {
            String p = args[0].toLowerCase(Locale.ROOT);
            List<String> out = new ArrayList<>();
            for (FandomType t : FandomType.values()) {
                if (t.id().startsWith(p)) out.add(t.id());
            }
            return out;
        }
        if (args.length == 2) {
            String p = args[1].toLowerCase(Locale.ROOT);
            List<String> out = new ArrayList<>();
            for (Player pl : Bukkit.getOnlinePlayers()) {
                if (pl.getName().toLowerCase(Locale.ROOT).startsWith(p)) out.add(pl.getName());
            }
            return out;
        }
        return List.of();
    }
}
