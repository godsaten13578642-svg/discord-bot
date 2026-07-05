const { Client, GatewayIntentBits } = require('discord.js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.Presence,
    GatewayIntentBits.DirectMessages,
  ]
});

// Use DISCORD_BOT_TOKEN from Railway/environment
const token = process.env.DISCORD_BOT_TOKEN || process.env.DISCORD_TOKEN;

if (!token) {
  console.error('❌ Error: DISCORD_BOT_TOKEN environment variable is not set');
  process.exit(1);
}

client.login(token);

client.once('ready', () => {
  console.log(`✅ Bot logged in as ${client.user.tag}`);
});

client.on('error', error => {
  console.error('❌ Bot error:', error);
});

client.on('warn', warning => {
  console.warn('⚠️ Bot warning:', warning);
});
