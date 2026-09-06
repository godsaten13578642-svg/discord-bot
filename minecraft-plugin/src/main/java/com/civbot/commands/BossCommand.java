package com.civbot.commands;

import com.civbot.bosses.BossType;
import com.civbot.CivBridgePlugin;
import org.bukkit.Bukkit;
import org.bukkit.Location;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.command.TabCompleter;
import org.bukkit.entity.LivingEntity;
import org.bukkit.entity.Player;
import org.jetbrains.annotations.NotNull;
import org.jetbrains.annotations.Nullable;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * /boss              — list the fandom bosses
 * /boss <id> [player] — spawn the boss at the target player's location (admin)
 */
public class BossCommand implements CommandExecutor, TabCompleter {

    private static final String PERMISSION = "civbridge.boss";

    private final CivBridgePlugin plugin;

    public BossCommand(CivBridgePlugin plugin) {
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
            sender.sendMessage("§6── Fandom Bosses ─────────────────────────────");
            for (BossType t : BossType.values()) {
                sender.sendMessage(" " + t.color() + "◆ " + t.displayName()
                    + " §8(/" + label + " " + t.id() + " §8— " + (int) t.maxHealth() + " ❤)");
                for (String line : t.description()) {
                    sender.sendMessage("   §8" + line);
                }
            }
            sender.sendMessage("§7Spawn one at a player's position: §f/" + label + " <id> [player]");
            return true;
        }

        BossType type = BossType.parse(args[0]);
        if (type == null) {
            sender.sendMessage("§cUnknown boss '§f" + args[0] + "§c'. Use §f/" + label + "§c to list them.");
            return true;
        }

        Player anchor;
        if (args.length >= 2) {
            anchor = Bukkit.getPlayerExact(args[1]);
            if (anchor == null) {
                sender.sendMessage("§cPlayer '§f" + args[1] + "§c' is not online.");
                return true;
            }
        } else if (sender instanceof Player p) {
            anchor = p;
        } else {
            sender.sendMessage("§cConsole must specify a player: /" + label + " " + args[0] + " <player>");
            return true;
        }

        Location spawnLoc = anchor.getLocation().clone().add(
            anchor.getLocation().getDirection().setY(0).normalize().multiply(4));

        LivingEntity boss = plugin.getBossManager().spawn(type, spawnLoc);
        if (boss == null) {
            sender.sendMessage("§cFailed to spawn the boss (invalid world?).");
            return true;
        }

        sender.sendMessage(type.color() + type.displayName() + " §7awakens near §b" + anchor.getName() + "§7.");
        anchor.sendMessage("§4§lSomething ancient stirs nearby…");
        return true;
    }

    @Override
    public @Nullable List<String> onTabComplete(@NotNull CommandSender sender, @NotNull Command cmd,
                                                @NotNull String alias, String[] args) {
        if (!sender.hasPermission(PERMISSION)) return List.of();
        if (args.length == 1) {
            String p = args[0].toLowerCase(Locale.ROOT);
            List<String> out = new ArrayList<>();
            for (BossType t : BossType.values()) {
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
