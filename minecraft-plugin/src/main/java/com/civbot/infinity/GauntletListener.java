package com.civbot.infinity;

import com.civbot.CivBridgePlugin;
import org.bukkit.Bukkit;
import org.bukkit.GameMode;
import org.bukkit.Location;
import org.bukkit.Material;
import org.bukkit.NamespacedKey;
import org.bukkit.Particle;
import org.bukkit.Sound;
import org.bukkit.World;
import org.bukkit.block.Block;
import org.bukkit.block.BlockFace;
import org.bukkit.entity.LivingEntity;
import org.bukkit.entity.Mob;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.block.Action;
import org.bukkit.event.entity.EntityDamageByEntityEvent;
import org.bukkit.event.entity.EntityDeathEvent;
import org.bukkit.event.player.PlayerInteractEvent;
import org.bukkit.event.player.PlayerInteractEntityEvent;
import org.bukkit.inventory.EquipmentSlot;
import org.bukkit.inventory.ItemStack;
import org.bukkit.metadata.FixedMetadataValue;
import org.bukkit.potion.PotionEffect;
import org.bukkit.potion.PotionEffectType;
import org.bukkit.scheduler.BukkitRunnable;
import org.bukkit.util.RayTraceResult;
import org.bukkit.util.Vector;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * All gauntlet gameplay:
 *  - Socketing: sneak + right-click while holding a stone (gauntlet in off-hand)
 *  - Powers: right-click the gauntlet (last-socketed stone's power)
 *  - The Snap: right-click with all six stones socketed
 *
 * Time snapshots and soul kills are recorded passively so the powers are
 * always ready; everything is in-memory and server-session scoped.
 */
public class GauntletListener implements Listener {

    private final CivBridgePlugin plugin;
    private final NamespacedKey socketsKey;

    /** Rolling power cooldowns (ms expiry) per player. */
    private final Map<UUID, Map<InfinityStone, Long>> cooldowns = new HashMap<>();
    private final Map<UUID, Long> snapCooldowns = new HashMap<>();

    /** Mind control: mob UUID -> (master UUID, expires at ms). */
    private final Map<UUID, MindLink> mindControlled = new HashMap<>();

    /** Time Stone: player UUID -> last snapshot. */
    private final Map<UUID, TimeSnapshot> snapshots = new HashMap<>();

    /** Soul Stone: player UUID -> [soul count, window end ms]. */
    private final Map<UUID, long[]> soulTrack = new HashMap<>();

    private record MindLink(UUID master, long until) {}
    private record TimeSnapshot(Location location, double health, int food) {}

    public GauntletListener(CivBridgePlugin plugin) {
        this.plugin = plugin;
        this.socketsKey = new NamespacedKey(plugin, "gauntlet_" + InfinityFactory.GAUNTLET_SOCKETS_KEY);

        // Passive Time Stone recorder: a rolling 5-second history per player.
        new BukkitRunnable() {
            @Override public void run() {
                for (Player p : Bukkit.getOnlinePlayers()) {
                    snapshots.put(p.getUniqueId(),
                        new TimeSnapshot(p.getLocation().clone(), p.getHealth(), p.getFoodLevel()));
                }
            }
        }.runTaskTimer(plugin, 20L, 20L);

        // Mind-control upkeep: expire old links, clean visuals.
        new BukkitRunnable() {
            @Override public void run() {
                long now = System.currentTimeMillis();
                mindControlled.entrySet().removeIf(entry -> {
                    Mob mob = Bukkit.getEntity(entry.getKey()) instanceof Mob m ? m : null;
                    boolean expired = entry.getValue().until() <= now;
                    if (mob == null || expired) {
                        if (mob != null) {
                            mob.setTarget(null);
                            mob.removePotionEffect(PotionEffectType.GLOWING);
                            mob.removeMetadata("civbridge_mind_control", plugin);
                        }
                        return true;
                    }
                    return false;
                });
            }
        }.runTaskTimer(plugin, 40L, 20L);
    }

    // ── Interaction entry point ──────────────────────────────────────────────

    @EventHandler(priority = EventPriority.HIGH)
    public void onInteract(PlayerInteractEvent event) {
        if (event.getHand() != EquipmentSlot.HAND) return;
        Action action = event.getAction();
        if (action != Action.RIGHT_CLICK_AIR && action != Action.RIGHT_CLICK_BLOCK) return;

        Player player = event.getPlayer();
        ItemStack held = player.getInventory().getItemInMainHand();

        // Socketing: sneak + right-click while holding a stone item.
        InfinityStone stone = InfinityFactory.stoneFromItem(held);
        if (stone != null) {
            if (!player.isSneaking()) return;
            event.setCancelled(true);
            trySocket(player, stone);
            return;
        }

        if (!InfinityFactory.isGauntlet(held)) return;
        event.setCancelled(true);
        useGauntlet(player, held);
    }

    /** Right-clicking *at* an entity fires the entity event, not the block one — handle both. */
    @EventHandler(priority = EventPriority.HIGH)
    public void onInteractEntity(PlayerInteractEntityEvent event) {
        if (event.getHand() != EquipmentSlot.HAND) return;
        ItemStack held = event.getPlayer().getInventory().getItemInMainHand();
        if (!InfinityFactory.isGauntlet(held)) return;
        event.setCancelled(true);
        useGauntlet(event.getPlayer(), held);
    }

    private void useGauntlet(Player player, ItemStack gauntlet) {
        if (player.hasCooldown(Material.CARROT_ON_A_STICK)) return;
        player.setCooldown(Material.CARROT_ON_A_STICK, 8); // click debounce

        List<InfinityStone> socketed = InfinityFactory.readSockets(gauntlet, socketsKey);
        if (socketed.isEmpty()) {
            player.sendMessage("§7The gauntlet is empty. Sneak + right-click while holding a §6stone§7 to socket it.");
            return;
        }
        if (socketed.size() >= InfinityStone.values().length) {
            handleSnap(player);
            return;
        }
        usePower(player, socketed.get(socketed.size() - 1));
    }

    // ── Socketing ────────────────────────────────────────────────────────────

    private void trySocket(Player player, InfinityStone stone) {
        ItemStack offhand = player.getInventory().getItemInOffHand();
        if (!InfinityFactory.isGauntlet(offhand)) {
            player.sendMessage("§cHold the §6Infinity Gauntlet§c in your §7off-hand§c to socket the "
                + stone.color() + stone.displayName() + "§c.");
            return;
        }
        if (InfinityFactory.hasStone(offhand, stone, socketsKey)) {
            player.sendMessage("§cThat stone is already socketed.");
            return;
        }
        if (InfinityFactory.readSockets(offhand, socketsKey).size() >= InfinityStone.values().length) {
            player.sendMessage("§cAll six sockets are filled.");
            return;
        }

        InfinityFactory.socketStone(offhand, stone, socketsKey);
        player.getInventory().setItemInMainHand(null); // the stone is consumed
        player.updateInventory();

        World world = player.getWorld();
        world.playSound(player.getLocation(), Sound.BLOCK_END_PORTAL_FRAME_FILL, 1f, 0.7f);
        world.playSound(player.getLocation(), Sound.BLOCK_BEACON_ACTIVATE, 0.8f, 1.4f);
        world.spawnParticle(Particle.END_ROD, player.getLocation().add(0, 1, 0), 25, 0.3, 0.5, 0.3, 0.05);
        world.spawnParticle(stoneBurst(stone), player.getLocation().add(0, 1, 0), 40, 0.4, 0.6, 0.4, 0.1);

        player.sendMessage("§aThe " + stone.color() + stone.displayName() + "§a sinks into the gauntlet.");
        int count = InfinityFactory.readSockets(offhand, socketsKey).size();
        if (count < InfinityStone.values().length) {
            player.sendMessage("§7(" + count + " of 6 sockets filled — right-click the gauntlet to use the "
                + stone.color() + stone.displayName() + "§7.)");
        } else {
            player.sendMessage("§4The gauntlet burns in your hand. §8Right-click when you are ready.");
        }
    }

    // ── Powers ───────────────────────────────────────────────────────────────

    private void usePower(Player player, InfinityStone stone) {
        if (!checkCooldown(player, stone)) return;
        switch (stone) {
            case SPACE -> powerSpace(player);
            case MIND -> powerMind(player);
            case REALITY -> powerReality(player);
            case POWER -> powerPower(player);
            case TIME -> powerTime(player);
            case SOUL -> powerSoul(player);
        }
    }

    /** SPACE: teleport up to 32 blocks — to the targeted block, or blast forward. */
    private void powerSpace(Player player) {
        RayTraceResult ray = player.rayTraceBlocks(32);
        Location target;
        if (ray != null && ray.getHitBlock() != null) {
            BlockFace face = ray.getHitBlockFace() == null ? BlockFace.UP : ray.getHitBlockFace();
            target = ray.getHitBlock().getRelative(face).getLocation().add(0.5, 0, 0.5);
            target.setYaw(player.getLocation().getYaw());
            target.setPitch(player.getLocation().getPitch());
        } else {
            Vector dir = player.getLocation().getDirection().setY(0);
            if (dir.lengthSquared() < 0.01) dir = new Vector(0, 0, 1);
            dir.normalize();
            target = safeSpot(player.getLocation().add(dir.multiply(16)));
        }
        Location from = player.getLocation().clone();
        player.teleport(target);
        World world = player.getWorld();
        world.spawnParticle(Particle.PORTAL, from.clone().add(0, 1, 0), 40, 0.3, 0.8, 0.3, 0.5);
        world.spawnParticle(Particle.PORTAL, target.clone().add(0, 1, 0), 40, 0.3, 0.8, 0.3, 0.5);
        world.playSound(from, Sound.ENTITY_ENDERMAN_TELEPORT, 1f, 1f);
        world.playSound(target, Sound.ENTITY_ENDERMAN_TELEPORT, 1f, 1f);
        player.sendMessage("§bThe Space Stone folds the distance. §8(" + Math.round(from.distance(target)) + " blocks)");
    }

    /** MIND: convert the looked-at mob into a bodyguard for 60s. */
    private void powerMind(Player player) {
        RayTraceResult ray = player.getWorld().rayTraceEntities(
            player.getEyeLocation(), player.getLocation().getDirection(), 8, 1.5,
            e -> e instanceof Mob && !e.equals(player));
        if (ray == null || !(ray.getHitEntity() instanceof Mob mob)) {
            player.sendMessage("§cNo creature within reach for the Mind Stone to touch.");
            return;
        }
        mob.setTarget(null);
        mob.setPersistent(false);
        mob.setMetadata("civbridge_mind_control", new FixedMetadataValue(plugin, player.getUniqueId().toString()));
        mob.addPotionEffect(new PotionEffect(PotionEffectType.GLOWING, 60 * 20, 0));
        mindControlled.put(mob.getUniqueId(), new MindLink(player.getUniqueId(), System.currentTimeMillis() + 60_000L));

        World world = player.getWorld();
        world.spawnParticle(Particle.NOTE, mob.getLocation().add(0, 1.5, 0), 12, 0.3, 0.3, 0.3, 0.5);
        world.playSound(mob.getLocation(), Sound.ENTITY_EVOKER_CAST_SPELL, 1f, 1.3f);
        player.sendMessage("§eThe Mind Stone opens. §f" + mob.getName() + " §ewill defend you for 60 seconds.");
    }

    /** Defends the mind-control link: if the master (or the mob) is hit, retarget. */
    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
    public void onMindCombat(EntityDamageByEntityEvent event) {
        // If a mind-controlled mob is attacked, fight back.
        MindLink link = mindControlled.get(event.getEntity().getUniqueId());
        LivingEntity aggressor = event.getDamager() instanceof LivingEntity le ? le : null;

        if (link != null && aggressor != null && Bukkit.getEntity(event.getEntity().getUniqueId()) instanceof Mob mob) {
            if (!aggressor.getUniqueId().equals(link.master())) mob.setTarget(aggressor);
            return;
        }
        // If a master is attacked, their bodyguards intervene.
        if (event.getEntity() instanceof Player victim && aggressor != null && !aggressor.getUniqueId().equals(victim.getUniqueId())) {
            for (Map.Entry<UUID, MindLink> entry : mindControlled.entrySet()) {
                if (!entry.getValue().master().equals(victim.getUniqueId())) continue;
                if (Bukkit.getEntity(entry.getKey()) instanceof Mob mob) mob.setTarget(aggressor);
            }
        }
    }

    /** REALITY: nearby foes levitate helplessly for 6s. */
    private void powerReality(Player player) {
        World world = player.getWorld();
        int hit = 0;
        for (LivingEntity e : player.getLocation().getNearbyLivingEntities(9)) {
            if (e.equals(player)) continue;
            if (e instanceof Player && !allowPvP()) continue;
            e.addPotionEffect(new PotionEffect(PotionEffectType.LEVITATION, 6 * 20, 1));
            e.addPotionEffect(new PotionEffect(PotionEffectType.SLOW_FALLING, 9 * 20, 0));
            world.spawnParticle(Particle.DUST, e.getLocation().add(0, 1, 0), 20, 0.3, 0.6, 0.3,
                new Particle.DustOptions(org.bukkit.Color.fromRGB(235, 50, 65), 1.4f));
            hit++;
        }
        world.playSound(player.getLocation(), Sound.ENTITY_SHULKER_SHOOT, 1f, 0.6f);
        world.playSound(player.getLocation(), Sound.BLOCK_ENCHANTMENT_TABLE_USE, 1f, 0.5f);
        player.sendMessage("§cReality bends. §7" + hit + (hit == 1 ? " foe floats" : " foes float") + " where you decide.");
    }

    /** POWER: radial shockwave hurling entities away. */
    private void powerPower(Player player) {
        World world = player.getWorld();
        Location center = player.getLocation();
        world.spawnParticle(Particle.EXPLOSION, center.clone().add(0, 1, 0), 2, 0.2, 0.4, 0.2, 0);
        world.spawnParticle(Particle.SWEEP_ATTACK, center.clone().add(0, 0.5, 0), 6, 1.2, 0.4, 1.2);
        world.playSound(center, Sound.ENTITY_GENERIC_EXPLODE, 1f, 0.7f);
        world.playSound(center, Sound.ENTITY_WARDEN_SONIC_BOOM, 0.7f, 1.6f);

        int hit = 0;
        for (LivingEntity e : center.getNearbyLivingEntities(7)) {
            if (e.equals(player)) continue;
            if (e instanceof Player && !allowPvP()) continue;
            Vector push = e.getLocation().toVector().subtract(center.toVector());
            push.setY(0);
            if (push.lengthSquared() < 0.01) push = player.getLocation().getDirection().setY(0);
            push.normalize().multiply(2.6).setY(0.9);
            e.setVelocity(push);
            e.damage(4.0, player);
            hit++;
        }
        player.sendMessage("§dPower unleashed. §7" + hit + (hit == 1 ? " entity sent" : " entities sent") + " flying.");
    }

    /** TIME: rewind ~5 seconds of position/health/hunger. */
    private void powerTime(Player player) {
        TimeSnapshot old = snapshots.get(player.getUniqueId());
        snapshots.remove(player.getUniqueId());
        if (old == null) {
            player.sendMessage("§cThe Time Stone finds no past to return to yet.");
            return;
        }
        Location now = player.getLocation().clone();
        player.teleport(old.location());
        if (player.getGameMode() == GameMode.SURVIVAL || player.getGameMode() == GameMode.ADVENTURE) {
            player.setHealth(Math.min(player.getMaxHealth(), Math.max(player.getHealth(), old.health())));
            player.setFoodLevel(Math.max(player.getFoodLevel(), old.food()));
            player.setFireTicks(0);
        }
        World world = player.getWorld();
        world.spawnParticle(Particle.REVERSE_PORTAL, now.clone().add(0, 1, 0), 60, 0.3, 0.9, 0.3, 0.2);
        world.spawnParticle(Particle.REVERSE_PORTAL, old.location().clone().add(0, 1, 0), 60, 0.3, 0.9, 0.3, 0.2);
        world.playSound(old.location(), Sound.ENTITY_ENDERMAN_TELEPORT, 1f, 0.5f);
        world.playSound(old.location(), Sound.BLOCK_BEACON_AMBIENT, 1f, 0.6f);
        player.sendMessage("§aTime flows backward. §7You are where you stood 5 seconds ago.");
    }

    /** SOUL: harvest the souls of creatures slain nearby in the last 10s. */
    @EventHandler(priority = EventPriority.MONITOR)
    public void onSoulDeath(EntityDeathEvent event) {
        LivingEntity dead = event.getEntity();
        if (dead instanceof Player) return;
        long now = System.currentTimeMillis();
        for (Player p : dead.getLocation().getNearbyPlayers(12)) {
            if (!hasStoneEquipped(p, InfinityStone.SOUL)) continue;
            long[] track = soulTrack.computeIfAbsent(p.getUniqueId(), k -> new long[2]);
            if (track[1] <= now) track[0] = 0; // window expired, start over
            track[0] = Math.min(64, track[0] + 1);
            track[1] = now + 10_000L;
        }
    }

    private void powerSoul(Player player) {
        long[] track = soulTrack.get(player.getUniqueId());
        int souls = 0;
        if (track != null && track[1] > System.currentTimeMillis()) souls = (int) track[0];
        soulTrack.put(player.getUniqueId(), new long[]{0, 0});
        if (souls <= 0) {
            player.sendMessage("§6The Soul Stone aches — §7no fresh souls nearby. Slay creatures, then harvest within 10s.");
            return;
        }
        int harvested = Math.min(souls, 8); // 1 heart per soul, capped
        double heal = harvested * 2.0;
        double before = player.getHealth();
        double gained = Math.min(player.getMaxHealth(), before + heal) - before;
        player.setHealth(before + gained);
        player.setAbsorptionAmount(Math.min(8.0, player.getAbsorptionAmount() + (heal - gained)));
        World world = player.getWorld();
        world.spawnParticle(Particle.SOUL, player.getLocation().add(0, 1, 0), Math.min(60, souls * 8), 0.4, 0.8, 0.4, 0.03);
        world.playSound(player.getLocation(), Sound.PARTICLE_SOUL_ESCAPE, 1f, 0.8f);
        player.sendMessage("§6" + harvested + " soul" + (harvested == 1 ? "" : "s") + " harvested. §c+" + String.format("%.0f", gained / 2) + " ❤");
    }

    // ── THE SNAP ─────────────────────────────────────────────────────────────

    private void handleSnap(Player player) {
        long now = System.currentTimeMillis();
        long last = snapCooldowns.getOrDefault(player.getUniqueId(), 0L);
        long remaining = last + InfinityStone.SNAP_COOLDOWN_SECONDS * 1000L - now;
        if (remaining > 0) {
            player.sendMessage("§8The gauntlet needs time to recover. §7" + (remaining / 1000) + "s remain.");
            return;
        }
        snapCooldowns.put(player.getUniqueId(), now);

        World world = player.getWorld();
        InfinityFactory.playSnapSound(player);
        player.sendMessage("§4§n*snap*");

        if (plugin.getConfig().getBoolean("infinity.broadcast-snap", true)) {
            Bukkit.broadcastMessage("§8[§6∞§8] §4" + player.getName() + " snapped their fingers…");
        }

        new BukkitRunnable() {
            int ticks = 0;
            @Override public void run() {
                if (ticks++ == 0) {
                    world.playSound(player.getLocation(), Sound.BLOCK_RESPAWN_ANCHOR_DEPLETE, 1.2f, 0.5f);
                    world.spawnParticle(Particle.LARGE_SMOKE, player.getLocation().add(0, 1.2, 0), 60, 1.0, 1.0, 1.0, 0.02);
                }
                if (ticks >= 10) { // dramatic half-second beat, then… dust.
                    cancel();
                    int faded = 0;
                    for (LivingEntity e : player.getLocation().getNearbyLivingEntities(24)) {
                        if (e.equals(player)) continue;
                        if (e instanceof Player && !allowPvP()) continue;
                        if (e instanceof org.bukkit.entity.Boss) continue;
                        if (!InfinityFactory.isChosen()) continue;
                        world.spawnParticle(Particle.ASH, e.getLocation().add(0, 1, 0), 40, 0.3, 0.9, 0.3, 0.02);
                        world.playSound(e.getLocation(), Sound.PARTICLE_SOUL_ESCAPE, 0.8f, 0.5f);
                        e.remove();
                        faded++;
                    }
                    world.playSound(player.getLocation(), Sound.ENTITY_WITHER_DEATH, 0.8f, 1.8f);
                    player.sendMessage("§4" + faded + (faded == 1 ? " life faded" : " lives faded") + " §8— perfectly balanced.");
                }
            }
        }.runTaskTimer(plugin, 20L, 10L);
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    private boolean checkCooldown(Player player, InfinityStone stone) {
        long now = System.currentTimeMillis();
        Map<InfinityStone, Long> mine = cooldowns.computeIfAbsent(player.getUniqueId(), k -> new HashMap<>());
        Long until = mine.get(stone);
        if (until != null && until > now) {
            player.sendMessage("§7" + stone.color() + stone.displayName() + " §7recharging… §8"
                + Math.ceil((until - now) / 1000.0) + "s");
            return false;
        }
        mine.put(stone, now + 15_000L); // 15s per power
        return true;
    }

    /** Does this player hold a gauntlet (either hand) with the given stone socketed? */
    private boolean hasStoneEquipped(Player player, InfinityStone stone) {
        return InfinityFactory.hasStone(player.getInventory().getItemInMainHand(), stone, socketsKey)
            || InfinityFactory.hasStone(player.getInventory().getItemInOffHand(), stone, socketsKey);
    }

    private boolean allowPvP() {
        return plugin.getConfig().getBoolean("infinity.allow-pvp-powers", true);
    }

    private Particle stoneBurst(InfinityStone stone) {
        return switch (stone) {
            case SPACE -> Particle.DRAGON_BREATH;
            case MIND -> Particle.WAX_ON;
            case REALITY -> Particle.CRIMSON_SPORE;
            case POWER -> Particle.ELECTRIC_SPARK;
            case TIME -> Particle.WAX_OFF;
            case SOUL -> Particle.SOUL;
        };
    }

    private static Location safeSpot(Location l) {
        Block base = l.getBlock();
        for (int dy = 1; dy >= -2; dy--) {
            Block feet = base.getRelative(0, dy, 0);
            Block ground = feet.getRelative(BlockFace.DOWN);
            if (feet.isPassable() && feet.getRelative(BlockFace.UP).isPassable() && !ground.isPassable()) {
                return feet.getLocation().add(0.5, 0, 0.5);
            }
        }
        return base.getRelative(BlockFace.UP).getLocation().add(0.5, 0, 0.5);
    }
}
