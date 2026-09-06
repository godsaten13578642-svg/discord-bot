package com.civbot.bosses;

import com.civbot.CivBridgePlugin;
import com.civbot.fandom.FandomType;
import org.bukkit.Bukkit;
import org.bukkit.Location;
import org.bukkit.NamespacedKey;
import org.bukkit.Particle;
import org.bukkit.Sound;
import org.bukkit.attribute.Attribute;
import org.bukkit.attribute.AttributeInstance;
import org.bukkit.boss.BarColor;
import org.bukkit.boss.BarFlag;
import org.bukkit.boss.BarStyle;
import org.bukkit.boss.BossBar;
import org.bukkit.entity.EntityType;
import org.bukkit.entity.Enderman;
import org.bukkit.entity.Entity;
import org.bukkit.entity.ElderGuardian;
import org.bukkit.entity.LivingEntity;
import org.bukkit.entity.Mob;
import org.bukkit.entity.Monster;
import org.bukkit.persistence.PersistentDataType;
import org.bukkit.scheduler.BukkitRunnable;

import java.util.HashMap;
import java.util.Iterator;
import java.util.Map;
import java.util.Random;
import java.util.UUID;

/**
 * Spawns and drives the custom fandom bosses. Each boss carries a PDC tag
 * (so we recognize it across restarts/chunk unloads), a progress boss bar
 * kept in sync on damage, a name tag, and a per-type ability scheduler.
 *
 * Loot is rolled on death and handed out by BossListener.
 */
public final class BossManager {

    /** PDC tag on the boss entity: BossType.id(). */
    public final NamespacedKey bossKey;
    private final NamespacedKey phaseKey; // internal: last blink time for the demon

    private final CivBridgePlugin plugin;
    private final Random random = new Random();

    // uuid -> active boss bar (also implies this entity is a managed boss)
    private final Map<UUID, BossBar> bars = new HashMap<>();

    public BossManager(CivBridgePlugin plugin) {
        this.plugin = plugin;
        this.bossKey = new NamespacedKey(plugin, "boss_type");
        this.phaseKey = new NamespacedKey(plugin, "boss_phase");
    }

    // ── Spawn ────────────────────────────────────────────────────────────────

    /** Spawns the boss at loc and returns it, or null if the type is invalid. */
    public LivingEntity spawn(BossType type, Location loc) {
        LivingEntity entity = (LivingEntity) loc.getWorld().spawnEntity(loc, type.entity());
        configure(type, entity);

        BossBar bar = Bukkit.createBossBar(
            type.color() + "" + org.bukkit.ChatColor.BOLD + type.displayName(),
            barColorOf(type), BarStyle.SEGMENTED_10,
            type == BossType.KIZUKI_DEMON ? BarFlag.DARKEN_SKY : BarFlag.CREATE_FOG);
        bar.setProgress(1.0);
        bars.put(entity.getUniqueId(), bar);
        showBarToNearby(bar, loc);

        startAbilities(type, entity);
        startBarSync(bar, entity);

        loc.getWorld().playSound(loc, Sound.valueOf(type.ambientSound()), 2f, 0.6f);
        loc.getWorld().spawnParticle(Particle.PORTAL, loc.clone().add(0, 1, 0), 120, 1.2, 1.5, 1.2, 0.6);
        loc.getWorld().spawnParticle(Particle.EXPLOSION, loc.clone().add(0, 1, 0), 3, 0.2, 0.2, 0.2, 0.01);
        if (plugin.getConfig().getBoolean("bosses.broadcast-spawns", true)) {
            Bukkit.broadcastMessage("§8§m                                                ");
            Bukkit.broadcastMessage(type.color() + "⚔ " + type.displayName() + " §7has awakened"
                + " §8(" + loc.getWorld().getName() + ", " + loc.getBlockX() + ", "
                + loc.getBlockY() + ", " + loc.getBlockZ() + ")");
            Bukkit.broadcastMessage("§8§m                                                ");
        }
        return entity;
    }

    private void configure(BossType type, LivingEntity entity) {
        entity.getPersistentDataContainer().set(bossKey, PersistentDataType.STRING, type.id());
        entity.setCustomName(type.color() + "" + org.bukkit.ChatColor.BOLD + type.displayName());
        entity.setCustomNameVisible(true);
        entity.setRemoveWhenFarAway(false);
        entity.setPersistent(true); // survives chunk unloads — this fight is not lost to lag

        AttributeInstance health = entity.getAttribute(Attribute.MAX_HEALTH);
        if (health != null) {
            health.setBaseValue(type.maxHealth());
            entity.setHealth(type.maxHealth());
        }
        AttributeInstance speed = entity.getAttribute(Attribute.MOVEMENT_SPEED);
        if (speed != null) speed.setBaseValue(type.speed());
        AttributeInstance attack = entity.getAttribute(Attribute.ATTACK_DAMAGE);
        if (attack != null) attack.setBaseValue(type.damage());
        AttributeInstance follow = entity.getAttribute(Attribute.FOLLOW_RANGE);
        if (follow != null) follow.setBaseValue(96.0);

        // Peaceful-difficulty guard: bosses need a target to be a fight.
        if (entity.getWorld().getDifficulty().name().equals("PEACEFUL")) {
            entity.getWorld().setDifficulty(org.bukkit.Difficulty.NORMAL);
            plugin.getLogger().warning("Difficulty was PEACEFUL — raised to NORMAL for the boss fight.");
        }

        if (entity instanceof Enderman enderman) {
            enderman.setTarget(null); // picked up by abilities once players engage
        }
        if (entity instanceof ElderGuardian guardian) {
            guardian.setAI(true);
            entity.setGlowing(false);
        }
    }

    // ── Identification ───────────────────────────────────────────────────────

    /** The BossType of an entity, or null if it isn't one of our bosses. */
    public BossType typeOf(Entity entity) {
        if (entity == null) return null;
        String id = entity.getPersistentDataContainer().get(bossKey, PersistentDataType.STRING);
        return id == null ? null : BossType.parse(id);
    }

    public boolean isBoss(Entity entity) {
        return entity != null && entity.getPersistentDataContainer().has(bossKey, PersistentDataType.STRING);
    }

    /**
     * Re-attaches the boss bar + ability scheduler to a boss entity that was
     * loaded back from a chunk (e.g. after a server restart). No-op if the
     * boss is already managed.
     */
    public void reattach(LivingEntity boss) {
        if (bars.containsKey(boss.getUniqueId())) return;
        BossType type = typeOf(boss);
        if (type == null) return;

        BossBar bar = Bukkit.createBossBar(
            type.color() + "" + org.bukkit.ChatColor.BOLD + type.displayName(),
            barColorOf(type), BarStyle.SEGMENTED_10,
            type == BossType.KIZUKI_DEMON ? BarFlag.DARKEN_SKY : BarFlag.CREATE_FOG);
        AttributeInstance max = boss.getAttribute(Attribute.MAX_HEALTH);
        double maxHealth = max != null ? max.getValue() : type.maxHealth();
        bar.setProgress(Math.max(0, Math.min(1, boss.getHealth() / maxHealth)));
        bars.put(boss.getUniqueId(), bar);
        showBarToNearby(bar, boss.getLocation());

        startAbilities(type, boss);
        startBarSync(bar, boss);
    }

    // ── Abilities ────────────────────────────────────────────────────────────

    private void startAbilities(BossType type, LivingEntity boss) {
        switch (type) {
            case KIZUKI_DEMON -> runKizukiAbilities(boss);
            case LEVIATHAN -> runLeviathanAbilities(boss);
        }
    }

    /** Upper Moon: shadow blink every ~6s, lesser-demon summon every ~14s, blood roar. */
    private void runKizukiAbilities(LivingEntity boss) {
        new BukkitRunnable() {
            int ticks = 0;

            @Override
            public void run() {
                if (!boss.isValid() || boss.isDead()) {
                    cancel();
                    return;
                }
                ticks++;

                if (boss instanceof Mob mob && mob.getTarget() == null) {
                    mob.setTarget(boss.getWorld().getNearbyEntities(boss.getLocation(), 40, 24, 40).stream()
                        .filter(e -> e instanceof org.bukkit.entity.Player)
                        .map(e -> (org.bukkit.entity.Player) e)
                        .filter(p -> p.getGameMode() == org.bukkit.GameMode.SURVIVAL
                            || p.getGameMode() == org.bukkit.GameMode.ADVENTURE)
                        .findFirst().orElse(null));
                    if (mob.getTarget() == null) return; // idle until someone comes
                }

                // Blink: teleport behind/near its target with a blood swirl.
                if (ticks % 120 == 0) {
                    org.bukkit.entity.Player target =
                        boss instanceof Mob m && m.getTarget() instanceof org.bukkit.entity.Player p ? p : null;
                    if (target != null && target.isOnline()) {
                        Location base = target.getLocation();
                        Location behind = base.clone()
                            .add(target.getLocation().getDirection().multiply(-1.8))
                            .add(Math.cos(random.nextDouble() * Math.PI * 2) * 1.2, 0,
                                 Math.sin(random.nextDouble() * Math.PI * 2) * 1.2);
                        behind.setYaw(base.getYaw() + 180f);
                        boss.getWorld().spawnParticle(Particle.BLOCK_CRUMBLE,
                            boss.getLocation().clone().add(0, 1, 0), 60, 0.4, 1, 0.4, 0.2,
                            org.bukkit.Material.NETHERRACK.createBlockData());
                        boss.teleport(behind);
                        boss.getWorld().playSound(behind, Sound.ENTITY_ENDERMAN_TELEPORT, 1f, 0.5f);
                        boss.getWorld().playSound(behind, Sound.PARTICLE_SOUL_ESCAPE, 0.8f, 0.6f);
                        boss.getWorld().spawnParticle(Particle.BLOCK_CRUMBLE,
                            behind.clone().add(0, 1, 0), 60, 0.4, 1, 0.4, 0.2,
                            org.bukkit.Material.REDSTONE_BLOCK.createBlockData());
                    }
                }

                // Summon lesser demons: weak cave-spider "demons" with red eyes glow.
                if (ticks % 280 == 0) {
                    int spawned = 0;
                    for (int i = 0; i < 3; i++) {
                        Location at = boss.getLocation().clone()
                            .add(Math.cos(i * 2.1) * 3, 0, Math.sin(i * 2.1) * 3);
                        Entity minion = boss.getWorld().spawnEntity(at, EntityType.CAVE_SPIDER);
                        minion.setCustomName("§5Lesser Demon");
                        minion.setCustomNameVisible(true);
                        minion.getPersistentDataContainer().set(kizukiMinionKey(), PersistentDataType.BYTE, (byte) 1);
                        if (minion instanceof org.bukkit.entity.CaveSpider spider) {
                            AttributeInstance hp = spider.getAttribute(Attribute.MAX_HEALTH);
                            if (hp != null) { hp.setBaseValue(20); spider.setHealth(20); }
                        }
                        boss.getWorld().playSound(at, Sound.ENTITY_ENDERMAN_SCREAM, 0.6f, 1.6f);
                        boss.getWorld().spawnParticle(Particle.PORTAL, at.clone().add(0, 1, 0), 40, 0.3, 0.8, 0.3, 0.4);
                        spawned++;
                    }
                    if (spawned > 0) {
                        Bukkit.broadcastMessage("§5" + BossType.KIZUKI_DEMON.displayName() + " §8summons its demons…");
                    }
                }

                // Blood roar: brief strength swell when below half health.
                if (ticks % 100 == 0 && boss.getHealth() < boss.getAttribute(Attribute.MAX_HEALTH).getValue() / 2) {
                    boss.addPotionEffect(new org.bukkit.potion.PotionEffect(
                        org.bukkit.potion.PotionEffectType.STRENGTH, 100, 0), true);
                    boss.getWorld().playSound(boss.getLocation(), Sound.ENTITY_ENDERMAN_SCREAM, 1.5f, 0.4f);
                }
            }
        }.runTaskTimer(plugin, 20L, 10L); // every half second
    }

    /** Leviathan: regen pulse, black-blood pillar when engaged, tidal knockback. */
    private void runLeviathanAbilities(LivingEntity boss) {
        new BukkitRunnable() {
            int ticks = 0;

            @Override
            public void run() {
                if (!boss.isValid() || boss.isDead()) {
                    cancel();
                    return;
                }
                ticks++;

                // Endless regen — the whole point of the Leviathan fight.
                if (ticks % 40 == 0) {
                    double max = boss.getAttribute(Attribute.MAX_HEALTH).getValue();
                    if (boss.getHealth() < max) {
                        boss.setHealth(Math.min(max, boss.getHealth() + 4.0));
                        boss.getWorld().spawnParticle(Particle.BUBBLE_POP,
                            boss.getLocation().clone().add(0, 1, 0), 15, 0.5, 0.8, 0.5, 0.05);
                    }
                }

                boolean engaged = boss.getWorld().getNearbyEntities(boss.getLocation(), 32, 16, 32).stream()
                    .anyMatch(e -> e instanceof org.bukkit.entity.Player p
                        && (p.getGameMode() == org.bukkit.GameMode.SURVIVAL
                            || p.getGameMode() == org.bukkit.GameMode.ADVENTURE));

                // Black-blood pillar under nearby players.
                if (engaged && ticks % 90 == 0) {
                    for (org.bukkit.entity.Player p : boss.getWorld().getNearbyPlayers(boss.getLocation(), 16)) {
                        Location at = p.getLocation();
                        p.getWorld().spawnParticle(Particle.DRIPPING_OBSIDIAN_TEAR,
                            at.clone().add(0, 0.2, 0), 50, 0.4, 0.1, 0.4, 0.02);
                        p.getWorld().playSound(at, Sound.BLOCK_POINTED_DRIPSTONE_DRIP_WATER, 1.4f, 0.4f);
                        p.damage(4.0, boss);
                        p.setVelocity(p.getVelocity().setY(0.8)); // knocked upward by the pillar
                    }
                }

                // Tidal wave: massive knockback when something gets too close.
                if (engaged && ticks % 160 == 0) {
                    for (Entity e : boss.getWorld().getNearbyEntities(boss.getLocation(), 6, 4, 6)) {
                        if (e instanceof org.bukkit.entity.Player || e instanceof Monster) {
                            org.bukkit.util.Vector push = e.getLocation().toVector()
                                .subtract(boss.getLocation().toVector()).normalize().multiply(2.4).setY(0.9);
                            e.setVelocity(push);
                        }
                    }
                    boss.getWorld().playSound(boss.getLocation(), Sound.ENTITY_GENERIC_EXPLODE, 1.2f, 0.5f);
                    boss.getWorld().playSound(boss.getLocation(), Sound.AMBIENT_UNDERWATER_ENTER, 2f, 0.7f);
                    boss.getWorld().spawnParticle(Particle.CLOUD,
                        boss.getLocation().clone().add(0, 0.5, 0), 80, 2, 0.5, 2, 0.3);
                }
            }
        }.runTaskTimer(plugin, 20L, 10L);
    }

    // ── Boss bar upkeep ──────────────────────────────────────────────────────

    private void startBarSync(BossBar bar, LivingEntity boss) {
        new BukkitRunnable() {
            @Override
            public void run() {
                if (!boss.isValid() || boss.isDead()) {
                    cancel();
                    return;
                }
                double max = boss.getAttribute(Attribute.MAX_HEALTH).getValue();
                double pct = Math.max(0, Math.min(1, boss.getHealth() / max));
                bar.setProgress(pct);
                showBarToNearby(bar, boss.getLocation());
                // Drop the bar for players who left the fight.
                bar.getPlayers().removeIf(p -> !p.getWorld().equals(boss.getWorld())
                    || p.getLocation().distanceSquared(boss.getLocation()) > 80 * 80);
            }
        }.runTaskTimer(plugin, 10L, 20L);
    }

    private void showBarToNearby(BossBar bar, Location loc) {
        for (org.bukkit.entity.Player p : loc.getWorld().getNearbyPlayers(loc, 64)) {
            if (!bar.getPlayers().contains(p)) bar.addPlayer(p);
        }
    }

    /** Called when a boss dies — remove its bar. */
    public void unregister(UUID entityId) {
        BossBar bar = bars.remove(entityId);
        if (bar != null) bar.removeAll();
    }

    /** Removes all bosses (plugin disable). */
    public void shutdown() {
        bars.values().forEach(BossBar::removeAll);
        bars.clear();
        // Also purge the mobs themselves so no half-configured boss is orphaned.
        for (org.bukkit.World world : Bukkit.getWorlds()) {
            for (Entity e : world.getEntities()) {
                if (isBoss(e)) e.remove();
            }
        }
    }

    private BarColor barColorOf(BossType type) {
        return switch (type) {
            case KIZUKI_DEMON -> BarColor.PURPLE;
            case LEVIATHAN -> BarColor.BLUE;
        };
    }

    private NamespacedKey kizukiMinionKey() {
        return new NamespacedKey(plugin, "kizuki_minion");
    }

    // ── Loot ─────────────────────────────────────────────────────────────────

    /**
     * Rolls and drops boss loot at the death location. Bonus fandom items drop
     * only when the killing blow came from a fandom weapon / power — bosses
     * should be a reward for using the themed arsenal.
     */
    public void rollLoot(BossType type, Location deathLoc, boolean killedByFandomWeapon) {
        boolean bonusLoot = killedByFandomWeapon
            || !plugin.getConfig().getBoolean("bosses.fandom-loot-requires-fandom-kill", true);
        switch (type) {
            case KIZUKI_DEMON -> {
                dropAt(deathLoc, org.bukkit.Material.REDSTONE_BLOCK, 4 + random.nextInt(4), "Blood Crystal");
                dropAt(deathLoc, org.bukkit.Material.ENDER_EYE, 1 + random.nextInt(2), null);
                if (bonusLoot) {
                    dropItem(deathLoc, com.civbot.fandom.FandomFactory.create(FandomType.CHIDORI_BLADE));
                    if (random.nextBoolean()) {
                        dropItem(deathLoc, com.civbot.fandom.FandomFactory.create(FandomType.RASENGAN));
                    }
                }
            }
            case LEVIATHAN -> {
                dropAt(deathLoc, org.bukkit.Material.PRISMARINE_SHARD, 6 + random.nextInt(6), null);
                dropAt(deathLoc, org.bukkit.Material.HEART_OF_THE_SEA, 1, "Leviathan Heart");
                if (bonusLoot) {
                    dropItem(deathLoc, com.civbot.fandom.FandomFactory.create(FandomType.ANGEL_BLADE));
                    if (random.nextInt(3) == 0) {
                        dropItem(deathLoc, com.civbot.fandom.FandomFactory.create(FandomType.THE_COLT));
                    }
                }
            }
        }
    }

    private void dropAt(Location loc, org.bukkit.Material material, int amount, String customName) {
        org.bukkit.inventory.ItemStack stack = new org.bukkit.inventory.ItemStack(material, amount);
        if (customName != null) {
            var meta = stack.getItemMeta();
            meta.setDisplayName(org.bukkit.ChatColor.AQUA + customName);
            stack.setItemMeta(meta);
        }
        loc.getWorld().dropItemNaturally(loc, stack);
    }

    private void dropItem(Location loc, org.bukkit.inventory.ItemStack stack) {
        loc.getWorld().dropItemNaturally(loc, stack);
    }
}
