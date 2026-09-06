package com.civbot.commands;

import com.civbot.CivBridgePlugin;
import com.civbot.lightsaber.LightsaberFactory;
import com.civbot.lightsaber.LightsaberType;
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
 * /saber                    — list the sabers
 * /saber <type> [player]    — give a saber (defaults to yourself)
 */
public class SaberCommand implements CommandExecutor, TabCompleter {

    private static final String PERMISSION = "civbridge.saber";

    private final CivBridgePlugin plugin;

    public SaberCommand(CivBridgePlugin plugin) {
        this.plugin = plugin;
    }

    @Override
    public boolean onCommand(@NotNull CommandSender sender, @NotNull Command cmd,
                             @NotNull String label, String[] args) {
        if (!sender.hasPermission(PERMISSION)) {
            sender.sendMessage("§cYou don't have permission to use /saber.");
            return true;
        }

        if (args.length == 0) {
            sender.sendMessage("§6── CivBridge Lightsabers ──");
            for (LightsaberType t : LightsaberType.values()) {
                sender.sendMessage(t.color() + "✦ " + t.displayName()
                    + " §8(" + t.modelId() + ", " + t.attackDamage() + " dmg)");
            }
            sender.sendMessage("§7Give one: §f/" + label + " <type> [player]");
            return true;
        }

        LightsaberType type = LightsaberType.parse(args[0]);
        if (type == null) {
            sender.sendMessage("§cUnknown saber '§f" + args[0] + "§c'. Use §f/" + label + "§c to list types.");
            return true;
        }

        Player target;
        if (args.length >= 2) {
            target = Bukkit.getPlayerExact(args[1]);
            if (target == null) {
                sender.sendMessage("§cPlayer '§f" + args[1] + "§c' is not online.");
                return true;
            }
        } else {
            if (!(sender instanceof Player p)) {
                sender.sendMessage("§cConsole must specify a player: /" + label + " " + args[0] + " <player>");
                return true;
            }
            target = p;
        }

        ItemStack saber = LightsaberFactory.create(type);
        var leftover = target.getInventory().addItem(saber);
        leftover.values().forEach(stack ->
            target.getWorld().dropItemNaturally(target.getLocation(), stack));

        target.sendMessage("§aYou received " + type.color() + type.displayName() + "§a!");
        if (!sender.equals(target)) {
            sender.sendMessage("§aGave " + type.color() + type.displayName() + "§a to §b" + target.getName() + "§a.");
        }
        return true;
    }

    @Override
    public @Nullable List<String> onTabComplete(@NotNull CommandSender sender, @NotNull Command cmd,
                                                @NotNull String alias, String[] args) {
        if (!sender.hasPermission(PERMISSION)) return List.of();
        if (args.length == 1) {
            String p = args[0].toLowerCase(Locale.ROOT);
            List<String> out = new ArrayList<>();
            for (LightsaberType t : LightsaberType.values()) {
                String shortName = t.modelId().replaceFirst("anakin_", "");
                if (shortName.startsWith(p) || t.modelId().startsWith(p)) out.add(shortName);
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
