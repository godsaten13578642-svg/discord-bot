package com.civbot.bosses;

import com.civbot.CivBridgePlugin;
import com.civbot.fandom.FandomFactory;
import com.civbot.fandom.FandomType;
import org.bukkit.Bukkit;
import org.bukkit.ChatColor;
import org.bukkit.Particle;
import org.bukkit.Sound;
import org.bukkit.entity.CaveSpider;
import org.bukkit.entity.Entity;
import org.bukkit.entity.LivingEntity;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.entity.EntityDamageByEntityEvent;
import org.bukkit.event.entity.EntityDamageEvent;
import org.bukkit.event.entity.EntityDeathEvent;
import org.bukkit.event.entity.EntityTargetEvent;
import org.bukkit.event.world.ChunkLoadEvent;
import org.bukkit.inventory.ItemStack;

import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Event glue for the fandom bosses:
 *
 *  - Leviathan takes sharply reduced damage from anything that isn't one of
 *    the three blades (or gauntlet/Infinity Power) that were made to kill it.
 *  - Naruto blades (Chidori, First Blade, Angel Blade, Scythe) deal bonus
 *    damage to the Kizuki demon — the slayer's arsenal, as it should be.
 *  - Death rolls loot (bonus fandom items require a fandom-weapon kill) and
 *    clears the boss bar.
 *  - Lesser Kizuki demons don't wander off or target each other.
 *  - If a boss somehow survives a chunk unload/reload cycle it gets re-barred.
 */
public class BossListener implements Listener {

    /** Records the fandom weapon (if any) that landed the killing blow. */
    private final Map<UUID, Boolean> lastHitWasFandom = new ConcurrentHashMap<>();

    private final CivBridgePlugin plugin;
    private final BossManager manager;

    public BossListener(CivBridgePlugin plugin, BossManager manager) {
        this.plugin = plugin;
        this.manager = manager;
    }

    // ── Damage ───────────────────────────────────────────────────────────────

    @EventHandler(priority = EventPriority.HIGH, ignoreCancelled = true)
    public void onDamage(EntityDamageByEntityEvent event) {
        BossType boss = manager.typeOf(event.getEntity());
        if (boss == null) return;

        // Resolve the true attacker (projectiles: the shooter).
        Entity attacker = event.getDamager();
        if (attacker instanceof org.bukkit.entity.Projectile proj
            && proj.getShooter() instanceof Entity shooter) {
            attacker = shooter;
        }

        boolean fandomKill = isFandomWeapon(attacker);
        double damage = event.getDamage();

        switch (boss) {
            case LEVIATHAN -> {
                // Conventional weapons barely scratch it; the trio of blades
                // (and Infinity's Power Stone) bite true.
                if (fandomKill || isPowerStoneAttack(attacker)) {
                    // full damage + slayer flare
                    event.getEntity().getWorld().spawnParticle(Particle.DAMAGE_INDICATOR,
                        event.getEntity().getLocation().add(0, 1, 0), 8, 0.3, 0.5, 0.3, 0.1);
                } else {
                    double resist = plugin.getConfig().getDouble("bosses.leviathan-conventional-resistance", 0.15);
                    event.setDamage(damage * resist);
                    if (attacker instanceof Player p) {
                        p.sendMessage(ChatColor.DARK_AQUA + "The Leviathan's flesh knits closed — steel alone won't do it.");
                    }
                }
            }
            case KIZUKI_DEMON -> {
                // The slayer's blades hit harder; everything else is normal.
                if (isSlayerBlade(attacker)) {
                    double bonus = plugin.getConfig().getDouble("bosses.kizuki-slayer-bonus", 1.5);
                    event.setDamage(damage * bonus);
                    event.getEntity().getWorld().playSound(
                        event.getEntity().getLocation(), Sound.BLOCK_AMETHYST_BLOCK_HIT, 0.7f, 1.6f);
                }
            }
        }

        lastHitWasFandom.put(event.getEntity().getUniqueId(), fandomKill);
    }

    private boolean isFandomWeapon(Entity attacker) {
        if (!(attacker instanceof Player player)) return false;
        ItemStack held = player.getInventory().getItemInMainHand();
        FandomType type = FandomFactory.fromItem(held);
        return type == FandomType.ANGEL_BLADE
            || type == FandomType.FIRST_BLADE
            || type == FandomType.DEATHS_SCYTHE
            || type == FandomType.CHIDORI_BLADE;
    }

    private boolean isSlayerBlade(Entity attacker) {
        if (!(attacker instanceof Player player)) return false;
        FandomType type = FandomFactory.fromItem(player.getInventory().getItemInMainHand());
        return type == FandomType.CHIDORI_BLADE
            || type == FandomType.RASENGAN
            || type == FandomType.FIRST_BLADE
            || type == FandomType.ANGEL_BLADE;
    }

    private boolean isPowerStoneAttack(Entity attacker) {
        // Infinity gauntlet powers are the only other things that hurt a Leviathan.
        return attacker instanceof Player p
            && com.civbot.infinity.InfinityFactory.isGauntlet(p.getInventory().getItemInMainHand());
    }

    // ── Death & loot ─────────────────────────────────────────────────────────

    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
    public void onDeath(EntityDeathEvent event) {
        BossType boss = manager.typeOf(event.getEntity());
        if (boss == null) return;

        boolean byFandom = lastHitWasFandom.getOrDefault(event.getEntity().getUniqueId(), false);
        lastHitWasFandom.remove(event.getEntity().getUniqueId());

        event.getDrops().clear();
        event.setDroppedExp(500);

        event.getEntity().getWorld().playSound(
            event.getEntity().getLocation(), Sound.valueOf(boss.deathSound()), 2f, 0.8f);
        event.getEntity().getWorld().spawnParticle(Particle.EXPLOSION,
            event.getEntity().getLocation().add(0, 1, 0), 6, 0.5, 0.8, 0.5, 0.05);
        event.getEntity().getWorld().spawnParticle(Particle.LARGE_SMOKE,
            event.getEntity().getLocation().add(0, 1, 0), 80, 1, 1.2, 1, 0.05);
        event.getEntity().getWorld().spawnParticle(Particle.PORTAL,
            event.getEntity().getLocation().add(0, 1, 0), 120, 1.2, 1.5, 1.2, 0.8);

        manager.unregister(event.getEntity().getUniqueId());
        manager.rollLoot(boss, event.getEntity().getLocation(), byFandom);

        Bukkit.getConsoleSender().sendMessage(
            ChatColor.DARK_PURPLE + "[CivBridge] " + boss.color() + boss.displayName()
            + ChatColor.GRAY + " was slain by " + (event.getEntity().getKiller() != null
                ? event.getEntity().getKiller().getName() : "unknown")
            + (byFandom ? " (fandom weapon bonus loot)" : ""));
    }

    // ── Minion discipline ────────────────────────────────────────────────────

    @EventHandler
    public void onTarget(EntityTargetEvent event) {
        if (manager.isBoss(event.getEntity())) {
            // Bosses pick their own targets via the ability scheduler.
            return;
        }
        if (event.getEntity() instanceof CaveSpider
            && event.getEntity().getPersistentDataContainer().has(
                new org.bukkit.NamespacedKey(plugin, "kizuki_minion"),
                org.bukkit.persistence.PersistentDataType.BYTE)) {
            // Minions only chase players.
            if (!(event.getTarget() instanceof Player)) event.setCancelled(true);
        }
    }

    // ── Chunk reload safety ──────────────────────────────────────────────────

    @EventHandler
    public void onChunkLoad(ChunkLoadEvent event) {
        // Entities may not be spawned until a tick after the event fires.
        plugin.getServer().getScheduler().runTask(plugin, () -> {
            for (Entity e : event.getChunk().getEntities()) {
                if (manager.isBoss(e) && e instanceof LivingEntity le) {
                    // PDC tag persists across restarts; re-attach bar + abilities.
                    le.setRemoveWhenFarAway(false);
                    manager.reattach(le);
                }
            }
        });
    }
}
