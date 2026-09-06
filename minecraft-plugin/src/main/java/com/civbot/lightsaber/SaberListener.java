package com.civbot.lightsaber;

import com.civbot.CivBridgePlugin;
import org.bukkit.Sound;
import org.bukkit.entity.LivingEntity;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.entity.EntityDamageByEntityEvent;
import org.bukkit.inventory.ItemStack;

/**
 * Gives each lightsaber its own damage value. The vanilla netherite-sword
 * attribute is hidden (the factory hides attributes and the lore announces
 * the saber's own damage), so the listener replaces melee damage with the
 * saber's blade damage whenever a saber is the attacking item.
 */
public class SaberListener implements Listener {

    private final CivBridgePlugin plugin;

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
}
