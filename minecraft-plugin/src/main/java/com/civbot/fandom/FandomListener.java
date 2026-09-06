package com.civbot.fandom;

import com.civbot.CivBridgePlugin;
import org.bukkit.Bukkit;
import org.bukkit.Color;
import org.bukkit.Location;
import org.bukkit.NamespacedKey;
import org.bukkit.Particle;
import org.bukkit.Sound;
import org.bukkit.World;
import org.bukkit.entity.Entity;
import org.bukkit.entity.LivingEntity;
import org.bukkit.entity.Player;
import org.bukkit.entity.Snowball;
import org.bukkit.entity.Wolf;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.block.Action;
import org.bukkit.event.entity.EntityDamageByEntityEvent;
import org.bukkit.event.entity.EntityDamageEvent;
import org.bukkit.event.entity.ProjectileHitEvent;
import org.bukkit.event.player.PlayerInteractEntityEvent;
import org.bukkit.event.player.PlayerInteractEvent;
import org.bukkit.inventory.EquipmentSlot;
import org.bukkit.inventory.ItemStack;
import org.bukkit.persistence.PersistentDataType;
import org.bukkit.potion.PotionEffect;
import org.bukkit.potion.PotionEffectType;
import org.bukkit.scheduler.BukkitRunnable;
import org.bukkit.util.RayTraceResult;
import org.bukkit.util.Vector;

import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

/**
 * Every fandom item behavior:
 *  - Parkour Master's Boots: no fall damage while carried
 *  - No-Scope Eyes: right-click → 15s truesight in 48 blocks
 *  - Hidden Leaf Headband: Speed/Jump while held; right-click chakra burst
 *  - Ninja Star: throwable, infinite, 6 damage
 *  - Summoning Scroll: wolf companion for 3 minutes
 *  - Rasengan: 20-block ranged detonation, 9 damage + knockback
 *  - Chidori Blade: 11 damage, dash-through attack
 *  - Angel Blade: 12 damage, double vs undead
 *  - The First Blade: 14 damage, kills heal 2 ❤
 *  - Death's Scythe: 13 damage, AOE reap
 *  - The Colt: 13-round one-shot-kill pistol that spares bosses
 */
public class FandomListener implements Listener {

    private static final int COLT_MAGAZINE = 13;
    private static final long COLT_RELOAD_MS = 30_000L;

    private final CivBridgePlugin plugin;
    private final NamespacedKey coltRoundsKey;
    private final NamespacedKey starMarkerKey;

    private final Map<UUID, Map<FandomType, Long>> cooldowns = new HashMap<>();
    private final Map<UUID, Long> coltReload = new HashMap<>();
    private final Map<UUID, UUID> summons = new HashMap<>(); // player -> wolf

    public FandomListener(CivBridgePlugin plugin) {
        this.plugin = plugin;
        this.coltRoundsKey = new NamespacedKey(plugin, "colt_rounds");
        this.starMarkerKey = new NamespacedKey(plugin, "ninja_star");

        // Hidden Leaf Headband: keep Speed II + Jump II up while held.
        new BukkitRunnable() {
            @Override public void run() {
                for (Player p : Bukkit.getOnlinePlayers()) {
                    if (FandomFactory.fromItem(p.getInventory().getItemInMainHand()) == FandomType.HIDDEN_LEAF_HEADBAND
                        || FandomFactory.fromItem(p.getInventory().getItemInOffHand()) == FandomType.HIDDEN_LEAF_HEADBAND) {
                        p.addPotionEffect(new PotionEffect(PotionEffectType.SPEED, 60, 1, true, false));
                        p.addPotionEffect(new PotionEffect(PotionEffectType.JUMP_BOOST, 60, 1, true, false));
                    }
                }
            }
        }.runTaskTimer(plugin, 20L, 30L);
    }

    // ── Right-click / melee routing ──────────────────────────────────────────

    @EventHandler(priority = EventPriority.HIGH)
    public void onInteract(PlayerInteractEvent event) {
        if (event.getHand() != EquipmentSlot.HAND) return;
        Action action = event.getAction();
        if (action != Action.RIGHT_CLICK_AIR && action != Action.RIGHT_CLICK_BLOCK) return;
        handleRightClick(event.getPlayer(), event);
    }

    @EventHandler(priority = EventPriority.HIGH)
    public void onInteractEntity(PlayerInteractEntityEvent event) {
        if (event.getHand() != EquipmentSlot.HAND) return;
        handleRightClick(event.getPlayer(), null);
    }

    private void handleRightClick(Player player, PlayerInteractEvent cancelTarget) {
        FandomType type = FandomFactory.fromItem(player.getInventory().getItemInMainHand());
        if (type == null) return;
        if (cancelTarget != null) cancelTarget.setCancelled(true);
        if (player.hasCooldown(type.material())) return;
        player.setCooldown(type.material(), 6);

        switch (type) {
            case NO_SCOPE_EYES -> powerTruesight(player);
            case HIDDEN_LEAF_HEADBAND -> powerChakraBurst(player);
            case SUMMONING_SCROLL -> powerSummon(player);
            case RASENGAN -> powerRasengan(player);
            case CHIDORI_BLADE -> powerChidoriDash(player);
            case DEATHS_SCYTHE -> powerReap(player);
            case NINJA_STAR -> powerThrowStar(player);
            case THE_COLT -> powerColt(player);
            case PARKOUR_BOOTS -> player.sendMessage("§7Carry the boots and gravity loses its grip. Just… don't test the void.");
            case ANGEL_BLADE, FIRST_BLADE -> { /* melee-only */ }
        }
    }

    /** Weapon damage overrides (like SaberListener). */
    @EventHandler(priority = EventPriority.HIGH, ignoreCancelled = true)
    public void onHit(EntityDamageByEntityEvent event) {
        if (!(event.getDamager() instanceof Player player)) return;
        FandomType type = FandomFactory.fromItem(player.getInventory().getItemInMainHand());
        if (type == null || type.attackDamage() <= 0) return;

        double damage = type.attackDamage();
        if (type == FandomType.ANGEL_BLADE && isUndead(event.getEntity())) {
            damage *= 2;
            player.getWorld().spawnParticle(Particle.END_ROD, event.getEntity().getLocation().add(0, 1, 0),
                20, 0.3, 0.6, 0.3, 0.05);
        }
        event.setDamage(damage);
        if (type == FandomType.CHIDORI_BLADE) {
            player.getWorld().playSound(player.getLocation(), Sound.BLOCK_AMETHYST_BLOCK_CHIME, 0.8f, 1.8f);
        }
    }

    /** The First Blade: kills feed the Mark. */
    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
    public void onKillingBlow(EntityDamageByEntityEvent event) {
        if (!(event.getDamager() instanceof Player player)) return;
        if (FandomFactory.fromItem(player.getInventory().getItemInMainHand()) != FandomType.FIRST_BLADE) return;
        if (!(event.getEntity() instanceof LivingEntity victim)) return;
        if (victim.getHealth() - event.getFinalDamage() > 0) return;

        double max = player.getMaxHealth();
        player.setHealth(Math.min(max, player.getHealth() + 4.0));
        player.getWorld().spawnParticle(Particle.DAMAGE_INDICATOR, player.getLocation().add(0, 1, 0),
            12, 0.3, 0.4, 0.3, 0.1);
        player.sendMessage("§4The Mark is fed. §c+2 ❤");
    }

    /** Parkour Master's Boots: no fall damage while carried anywhere. */
    @EventHandler(priority = EventPriority.HIGH, ignoreCancelled = true)
    public void onFall(EntityDamageEvent event) {
        if (event.getCause() != EntityDamageEvent.DamageCause.FALL) return;
        if (!(event.getEntity() instanceof Player player)) return;
        if (!carries(player, FandomType.PARKOUR_BOOTS)) return;
        event.setCancelled(true);
        player.getWorld().playSound(player.getLocation(), Sound.ENTITY_RABBIT_JUMP, 0.6f, 1.4f);
    }

    /** Ninja Star projectile impact. */
    @EventHandler(priority = EventPriority.HIGH, ignoreCancelled = true)
    public void onStarHit(ProjectileHitEvent event) {
        if (!(event.getEntity() instanceof Snowball snowball)) return;
        if (!snowball.getPersistentDataContainer().has(starMarkerKey, PersistentDataType.BYTE)) return;
        if (event.getHitEntity() instanceof LivingEntity victim) {
            victim.damage(6.0, snowball.getShooter() instanceof Player p ? p : null);
            victim.addPotionEffect(new PotionEffect(PotionEffectType.SLOWNESS, 40, 1));
            victim.getWorld().playSound(victim.getLocation(), Sound.ENTITY_ARROW_HIT_PLAYER, 0.8f, 1.6f);
        }
    }

    // ── Powers ───────────────────────────────────────────────────────────────

    private void powerTruesight(Player player) {
        if (!cooldownReady(player, FandomType.NO_SCOPE_EYES, 20_000)) return;
        int count = 0;
        for (Entity e : player.getNearbyEntities(48, 24, 48)) {
            if (e instanceof LivingEntity le) {
                le.addPotionEffect(new PotionEffect(PotionEffectType.GLOWING, 15 * 20, 0));
                count++;
            }
        }
        player.addPotionEffect(new PotionEffect(PotionEffectType.NIGHT_VISION, 15 * 20, 0));
        World world = player.getWorld();
        world.playSound(player.getLocation(), Sound.ENTITY_ENDER_EYE_LAUNCH, 1f, 1.4f);
        world.playSound(player.getLocation(), Sound.ENTITY_PLAYER_LEVELUP, 0.7f, 1.8f);
        player.sendMessage("§bNo-scope engaged. §7" + count + " entities highlighted for 15 seconds.");
    }

    private void powerChakraBurst(Player player) {
        if (!cooldownReady(player, FandomType.HIDDEN_LEAF_HEADBAND, 30_000)) return;
        player.addPotionEffect(new PotionEffect(PotionEffectType.REGENERATION, 10 * 20, 1));
        player.addPotionEffect(new PotionEffect(PotionEffectType.ABSORPTION, 20 * 20, 0));
        World world = player.getWorld();
        world.spawnParticle(Particle.NOTE, player.getLocation().add(0, 2, 0), 15, 0.4, 0.5, 0.4, 0.3);
        world.playSound(player.getLocation(), Sound.BLOCK_ENCHANTMENT_TABLE_USE, 1f, 1.2f);
        player.sendMessage("§9Chakra surges. §7The Will of Fire burns within.");
    }

    private void powerSummon(Player player) {
        if (!cooldownReady(player, FandomType.SUMMONING_SCROLL, 30_000)) return;

        // One companion at a time: dismiss the previous wolf.
        dismissSummon(player);

        Wolf wolf = player.getWorld().spawn(player.getLocation().add(1, 0, 0), Wolf.class, w -> {
            w.setTamed(true);
            w.setOwner(player);
            w.setCollarColor(org.bukkit.DyeColor.PURPLE);
            w.setCustomName("§d" + player.getName() + "'s Summon");
            w.setCustomNameVisible(true);
            w.setRemoveWhenFarAway(false);
        });
        summons.put(player.getUniqueId(), wolf.getUniqueId());
        World world = player.getWorld();
        world.spawnParticle(Particle.CLOUD, wolf.getLocation().add(0, 0.5, 0), 20, 0.4, 0.4, 0.4, 0.05);
        world.playSound(wolf.getLocation(), Sound.ENTITY_WOLF_AMBIENT, 1f, 0.8f);
        world.playSound(wolf.getLocation(), Sound.BLOCK_ENCHANTMENT_TABLE_USE, 1f, 0.8f);

        UUID wolfId = wolf.getUniqueId();
        new BukkitRunnable() {
            @Override public void run() {
                if (Bukkit.getEntity(wolfId) instanceof Wolf w) {
                    w.getWorld().spawnParticle(Particle.CLOUD, w.getLocation().add(0, 0.5, 0), 15, 0.3, 0.3, 0.3, 0.02);
                    w.remove();
                }
                if (player.isOnline()) player.sendMessage("§7Your summon's contract expired — it vanished in a puff of smoke.");
            }
        }.runTaskLater(plugin, 3 * 60 * 20L);
        player.sendMessage("§dSummoning jutsu! §7A wolf will fight beside you for 3 minutes.");
    }

    private void powerRasengan(Player player) {
        if (!cooldownReady(player, FandomType.RASENGAN, 15_000)) return;
        RayTraceResult ray = player.getWorld().rayTrace(
            player.getEyeLocation(), player.getLocation().getDirection(), 20,
            org.bukkit.FluidCollisionMode.NEVER, true, 1.0,
            e -> e instanceof LivingEntity && !e.equals(player));
        Location impact = ray != null && ray.getHitPosition() != null
            ? ray.getHitPosition().toLocation(player.getWorld())
            : player.getEyeLocation().add(player.getLocation().getDirection().multiply(16));

        World world = player.getWorld();
        world.spawnParticle(Particle.EXPLOSION, impact, 3, 0.3, 0.3, 0.3, 0);
        world.spawnParticle(Particle.SWEEP_ATTACK, impact, 10, 1.0, 1.0, 1.0);
        world.spawnParticle(Particle.BUBBLE_POP, impact, 60, 1.0, 1.0, 1.0, 0.3);
        world.playSound(impact, Sound.ENTITY_BREEZE_SHOOT, 1f, 1.2f);
        world.playSound(impact, Sound.ENTITY_GENERIC_EXPLODE, 0.9f, 1.4f);

        int hit = 0;
        for (LivingEntity e : impact.getNearbyLivingEntities(3.5)) {
            if (e.equals(player)) continue;
            Vector push = e.getLocation().toVector().subtract(impact.toVector()).setY(0);
            if (push.lengthSquared() < 0.01) push = player.getLocation().getDirection().setY(0);
            e.setVelocity(push.normalize().multiply(1.4).setY(0.6));
            e.damage(9.0, player);
            hit++;
        }
        player.sendMessage("§bRasengan! §7" + hit + (hit == 1 ? " target caught" : " targets caught") + " in the spiral.");
    }

    private void powerChidoriDash(Player player) {
        if (!cooldownReady(player, FandomType.CHIDORI_BLADE, 8_000)) return;
        Vector dir = player.getLocation().getDirection().setY(0);
        if (dir.lengthSquared() < 0.01) dir = new Vector(0, 0, 1);
        dir.normalize();

        World world = player.getWorld();
        Location from = player.getLocation().clone();
        Vector dest = from.clone().add(dir.multiply(8)).toVector();
        player.setVelocity(dir.clone().multiply(2.8).setY(0.4));
        world.spawnParticle(Particle.ELECTRIC_SPARK, from.clone().add(0, 1, 0), 40, 0.4, 0.8, 0.4, 0.2);
        world.playSound(player.getLocation(), Sound.ENTITY_LIGHTNING_BOLT_IMPACT, 0.6f, 2.0f);
        world.playSound(player.getLocation(), Sound.BLOCK_AMETHYST_BLOCK_RESONATE, 1f, 1.6f);

        int hit = 0;
        for (LivingEntity e : player.getLocation().getNearbyLivingEntities(9)) {
            if (e.equals(player)) continue;
            Vector toEntity = e.getLocation().toVector().subtract(from.toVector());
            if (toEntity.normalize().dot(dir) < 0.5) continue; // only what's in the dash path
            e.damage(8.0, player);
            world.spawnParticle(Particle.ELECTRIC_SPARK, e.getLocation().add(0, 1, 0), 20, 0.2, 0.5, 0.2, 0.1);
            hit++;
        }
        if (hit == 0) player.sendMessage("§bChidori! §7You cut through the air — and " + Math.round(from.toVector().distance(dest)) + " blocks of it.");
        else player.sendMessage("§bChidori! §7A thousand birds scream through " + hit + (hit == 1 ? " target." : " targets."));
    }

    private void powerReap(Player player) {
        if (!cooldownReady(player, FandomType.DEATHS_SCYTHE, 12_000)) return;
        World world = player.getWorld();
        Location center = player.getLocation();
        for (double angle = 0; angle < Math.PI * 2; angle += Math.PI / 12) {
            Location ring = center.clone().add(Math.cos(angle) * 3, 0.5, Math.sin(angle) * 3);
            world.spawnParticle(Particle.SOUL, ring, 4, 0.1, 0.3, 0.1, 0.01);
            world.spawnParticle(Particle.ASH, ring, 6, 0.1, 0.5, 0.1, 0.02);
        }
        world.playSound(center, Sound.PARTICLE_SOUL_ESCAPE, 1f, 0.6f);
        world.playSound(center, Sound.ENTITY_WITHER_HURT, 0.7f, 1.4f);

        int hit = 0;
        for (LivingEntity e : center.getNearbyLivingEntities(6)) {
            if (e.equals(player)) continue;
            e.damage(6.0, player);
            hit++;
        }
        player.sendMessage("§5Reaped. §7" + hit + (hit == 1 ? " life cut short." : " lives cut short."));
    }

    private void powerThrowStar(Player player) {
        Snowball star = player.launchProjectile(Snowball.class);
        star.getPersistentDataContainer().set(starMarkerKey, PersistentDataType.BYTE, (byte) 1);
        star.setCustomName("§7Ninja Star");
        star.setVelocity(player.getLocation().getDirection().multiply(1.8));
        player.getWorld().playSound(player.getLocation(), Sound.ENTITY_SNOWBALL_THROW, 1f, 0.7f);
    }

    private void powerColt(Player player) {
        ItemStack held = player.getInventory().getItemInMainHand();
        var pdc = held.getItemMeta().getPersistentDataContainer();
        Integer rounds = pdc.get(coltRoundsKey, PersistentDataType.INTEGER);
        int ammo = rounds == null ? COLT_MAGAZINE : rounds;

        long reloadUntil = coltReload.getOrDefault(player.getUniqueId(), 0L);
        if (ammo <= 0) {
            long left = reloadUntil - System.currentTimeMillis();
            if (left > 0) {
                player.sendMessage("§7The Colt rests… §8" + Math.ceil(left / 1000.0) + "s");
                return;
            }
            ammo = COLT_MAGAZINE; // reloaded
        }
        setColtRounds(player, held, ammo - 1);
        player.updateInventory();

        World world = player.getWorld();
        world.playSound(player.getLocation(), Sound.ENTITY_GENERIC_EXPLODE, 0.6f, 2.2f);
        world.playSound(player.getLocation(), Sound.BLOCK_NOTE_BLOCK_SNARE, 0.9f, 0.6f);
        player.sendMessage("§e*bang* §7(" + (ammo - 1) + " rounds left)");

        RayTraceResult ray = player.getWorld().rayTraceEntities(
            player.getEyeLocation(), player.getLocation().getDirection(), 64, 1.2,
            e -> e instanceof LivingEntity && !e.equals(player));
        if (ray == null || !(ray.getHitEntity() instanceof LivingEntity victim)) {
            player.sendMessage("§7…missed. The shot echoes across the empty field.");
            return;
        }

        Location hitLoc = victim.getLocation().add(0, 1, 0);
        world.spawnParticle(Particle.CRIT, hitLoc, 25, 0.3, 0.5, 0.3, 0.4);
        world.spawnParticle(Particle.LARGE_SMOKE, hitLoc, 20, 0.2, 0.4, 0.2, 0.02);

        boolean customBoss = plugin.getBossManager() != null
            && plugin.getBossManager().typeOf(victim) != null;
        if (customBoss || victim instanceof org.bukkit.entity.Boss || victim instanceof org.bukkit.entity.EnderDragon
            || victim instanceof org.bukkit.entity.Wither) {
            victim.damage(20.0, player);
            player.sendMessage("§4It shrugs off the bullet. §7Some things the Colt cannot kill.");
            return;
        }
        if (victim instanceof Player target && !plugin.getConfig().getBoolean("fandom.allow-pvp", true)) {
            victim.damage(10.0, player);
            player.sendMessage("§7The bullet bites — but this server protects players.");
            return;
        }
        victim.setHealth(0);
        world.playSound(hitLoc, Sound.PARTICLE_SOUL_ESCAPE, 1f, 0.5f);
        player.sendMessage("§4The Colt never misses. §7One down" +
            (victim instanceof Player ? " — and it works on almost everything." : "."));
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    private void dismissSummon(Player player) {
        UUID wolfId = summons.remove(player.getUniqueId());
        if (wolfId != null && Bukkit.getEntity(wolfId) instanceof Wolf w) {
            w.getWorld().spawnParticle(Particle.CLOUD, w.getLocation().add(0, 0.5, 0), 10, 0.2, 0.3, 0.2, 0.02);
            w.remove();
        }
    }

    private boolean cooldownReady(Player player, FandomType type, long cooldownMs) {
        long now = System.currentTimeMillis();
        Map<FandomType, Long> mine = cooldowns.computeIfAbsent(player.getUniqueId(), k -> new HashMap<>());
        Long until = mine.get(type);
        if (until != null && until > now) {
            player.sendMessage("§7" + type.color() + type.displayName() + " §7needs " + Math.ceil((until - now) / 1000.0) + "s.");
            return false;
        }
        mine.put(type, now + cooldownMs);
        return true;
    }

    private boolean carries(Player player, FandomType type) {
        for (ItemStack item : player.getInventory().getContents()) {
            if (FandomFactory.fromItem(item) == type) return true;
        }
        return false;
    }

    private void setColtRounds(Player player, ItemStack colt, int rounds) {
        var meta = colt.getItemMeta();
        meta.getPersistentDataContainer().set(coltRoundsKey, PersistentDataType.INTEGER, rounds);
        colt.setItemMeta(meta);
        if (rounds <= 0) {
            // The reload clock starts when the last round is fired.
            coltReload.put(player.getUniqueId(), System.currentTimeMillis() + COLT_RELOAD_MS);
            player.sendMessage("§6Empty. §7The Colt needs 30 seconds to reload.");
        }
    }

    private static boolean isUndead(Entity entity) {
        return entity instanceof org.bukkit.entity.Skeleton
            || entity instanceof org.bukkit.entity.Zombie
            || entity instanceof org.bukkit.entity.Phantom
            || entity instanceof org.bukkit.entity.Wither
            || entity instanceof org.bukkit.entity.Zoglin;
    }
}
