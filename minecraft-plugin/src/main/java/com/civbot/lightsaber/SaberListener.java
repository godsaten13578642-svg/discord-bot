package com.civbot.lightsaber;

import com.civbot.CivBridgePlugin;
import org.bukkit.ChatColor;
import org.bukkit.Color;
import org.bukkit.GameMode;
import org.bukkit.Location;
import org.bukkit.Particle;
import org.bukkit.Sound;
import org.bukkit.World;
import org.bukkit.entity.LivingEntity;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.block.Action;
import org.bukkit.event.entity.EntityDamageByEntityEvent;
import org.bukkit.event.player.PlayerInteractEvent;
import org.bukkit.inventory.EquipmentSlot;
import org.bukkit.inventory.ItemStack;
import org.bukkit.util.Vector;

import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

/**
 * Gives each lightsaber its own damage value. The vanilla netherite-sword
 * attribute is hidden (the factory hides attributes and the lore announces
 * the saber's own damage), so the listener replaces melee damage with the
 * saber's blade damage whenever a saber is the attacking item.
 *
 * Also paints a color-matched energy trail along the swing arc whenever a
 * saber is swung (left-click) or lands a hit — each blade leaves its own
 * color, like the films.
 */
public class SaberListener implements Listener {

    private final CivBridgePlugin plugin;

    /** Swing-trail debounce (ms) so held left-clicks don't spray particles. */
    private static final long TRAIL_DEBOUNCE_MS = 280;
    private final Map<UUID, Long> lastTrail = new HashMap<>();

    public SaberListener(CivBridgePlugin plugin) {
        this.plugin = plugin;
    }

    @EventHandler(priority = EventPriority.HIGH, ignoreCancelled = true)
    public void onHit(EntityDamageByEntityEvent event) {
        if (!(event.getDamager() instanceof Player player)) return;
        ItemStack held = player.getInventory().getItemInMainHand();
        LightsaberType saber = LightsaberFactory.fromItem(held);
        if (saber == null) return;

        double oldDamage = event.getDamage();
        event.setDamage(saber.attackDamage());
        spawnTrail(player, saber); // trail follows landed hits too

        // Saber hum on successful hits; a little extra juice on hard hits.
        player.getWorld().playSound(player.getLocation(),
            Sound.ENTITY_GUARDIAN_ATTACK, 0.4f, 1.6f);
        if (event.getFinalDamage() >= 10 && event.getEntity() instanceof LivingEntity) {
            player.playSound(player.getLocation(), Sound.BLOCK_BEACON_POWER_SELECT, 0.5f, 2.0f);
        }

        if (plugin.getConfig().getBoolean("lightsabers.log-hits", false)) {
            plugin.getLogger().info(player.getName() + " hit with " + saber.displayName()
                + ": " + oldDamage + " -> " + saber.attackDamage());
        }
    }

    /**
     * Left-click with a saber → color trail along the swing arc. Debounced so
     * holding the button doesn't spray; spectators skipped so cloaked admins
     * stay hidden.
     */
    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
    public void onSwing(PlayerInteractEvent event) {
        if (event.getAction() != Action.LEFT_CLICK_AIR && event.getAction() != Action.LEFT_CLICK_BLOCK) return;
        if (event.getHand() != EquipmentSlot.HAND) return;
        Player player = event.getPlayer();
        if (player.getGameMode() == GameMode.SPECTATOR) return;
        LightsaberType saber = LightsaberFactory.fromItem(player.getInventory().getItemInMainHand());
        if (saber == null) return;
        spawnTrail(player, saber);
    }

    /**
     * Paints the saber's color along the swing arc: a rising arc of dust in
     * front of the player, swept left→right, capped by a bright tip spark.
     * Color comes from the blade itself (same hexes as the 3D models).
     */
    private void spawnTrail(Player player, LightsaberType saber) {
        long now = System.currentTimeMillis();
        Long last = lastTrail.get(player.getUniqueId());
        if (last != null && now - last < TRAIL_DEBOUNCE_MS) return;
        lastTrail.put(player.getUniqueId(), now);

        Color color = chatColorToRgb(saber.color());
        Particle.DustOptions dust = new Particle.DustOptions(color, 1.3f);
        World world = player.getWorld();
        Location eye = player.getEyeLocation();
        Vector forward = eye.getDirection().normalize();
        // Horizontal right-vector sweeps the arc across the view.
        Vector right = forward.clone().crossProduct(new Vector(0, 1, 0)).normalize();

        for (int i = 0; i < 10; i++) {
            double t = i / 9.0;                    // 0..1 across the arc
            double angle = Math.toRadians(-60 + 120 * t);
            Vector dir = forward.clone()
                .multiply(Math.cos(angle))
                .add(right.clone().multiply(Math.sin(angle)))
                .normalize();
            Location p = eye.clone().add(dir.multiply(1.4));
            p.add(0, -0.15 + 0.3 * t, 0);          // gentle rise across the sweep
            world.spawnParticle(Particle.DUST, p, 1, 0.04, 0.04, 0.04, dust);
            if (i == 9) world.spawnParticle(Particle.END_ROD, p, 1, 0.05, 0.05, 0.05, 0.01);
        }
    }

    /** Bukkit ChatColors don't carry RGB — map each saber to its blade hex (matches the 3D models). */
    private static Color chatColorToRgb(ChatColor color) {
        return switch (color) {
            case AQUA -> Color.fromRGB(0x4FD7E9);
            case GREEN -> Color.fromRGB(0x6BFF8C);
            case LIGHT_PURPLE -> Color.fromRGB(0xB36BFF);
            case DARK_PURPLE -> Color.fromRGB(0x7A2FCC);
            case RED -> Color.fromRGB(0xFF4646);
            case WHITE -> Color.fromRGB(0xF2F6FF);
            default -> Color.fromRGB(0x4FD7E9);
        };
    }
}
