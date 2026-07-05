const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// In-memory data store (no database needed)
const data = {
  servers: {},
  civilizations: {},
  members: {},
  users: {}
};

let civIdCounter = 1;

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', botOnline: !!global.botClient?.isReady() });
});

// Get user profile
app.get('/api/users/:userId', (req, res) => {
  const user = data.users[req.params.userId] || {
    id: req.params.userId,
    username: `User_${req.params.userId}`,
    level: 1,
    xp: 0,
    nextLevelXp: 1000,
    reputation: 0,
    rank: 'Member',
    civilization: null,
    honors: []
  };
  res.json(user);
});

// Server setup
app.post('/api/servers/setup', (req, res) => {
  const { serverId, serverName } = req.body;
  data.servers[serverId] = { serverId, serverName, setupAt: new Date() };
  res.json({ success: true, message: `Server ${serverName} setup complete` });
});

// Create civilization
app.post('/api/civilizations/create', (req, res) => {
  const { name, leaderId, serverId } = req.body;
  const id = civIdCounter++;
  data.civilizations[id] = { id, name, leaderId, serverId, members: [leaderId], createdAt: new Date() };
  if (leaderId) {
    if (!data.users[leaderId]) data.users[leaderId] = { id: leaderId, username: leaderId, level: 1, xp: 0, nextLevelXp: 1000, reputation: 0, rank: 'Leader', civilization: id, honors: [] };
    else data.users[leaderId].civilization = id;
  }
  res.json({ success: true, civilizationId: id, civilization: data.civilizations[id] });
});

// Get all civilizations
app.get('/api/civilizations', (req, res) => {
  res.json(Object.values(data.civilizations));
});

// Get single civilization
app.get('/api/civilizations/:id', (req, res) => {
  const civ = data.civilizations[req.params.id];
  if (!civ) return res.status(404).json({ error: 'Civilization not found' });
  res.json(civ);
});

// Join civilization
app.post('/api/civilizations/:id/join', (req, res) => {
  const { userId } = req.body;
  const civ = data.civilizations[req.params.id];
  if (!civ) return res.status(404).json({ error: 'Civilization not found' });
  if (!civ.members.includes(userId)) civ.members.push(userId);
  if (!data.users[userId]) data.users[userId] = { id: userId, username: userId, level: 1, xp: 0, nextLevelXp: 1000, reputation: 0, rank: 'Member', civilization: req.params.id, honors: [] };
  else data.users[userId].civilization = req.params.id;
  res.json({ success: true, civilization: civ });
});

// Member join server
app.post('/api/members/join', (req, res) => {
  const { userId, serverId } = req.body;
  if (!data.users[userId]) {
    data.users[userId] = { id: userId, username: userId, level: 1, xp: 0, nextLevelXp: 1000, reputation: 0, rank: 'Member', civilization: null, honors: [] };
  }
  res.json({ success: true, welcomeEnabled: true, autoRoles: [] });
});

// Award XP
app.post('/api/users/:userId/xp', (req, res) => {
  const { amount } = req.body;
  if (!data.users[req.params.userId]) {
    data.users[req.params.userId] = { id: req.params.userId, username: req.params.userId, level: 1, xp: 0, nextLevelXp: 1000, reputation: 0, rank: 'Member', civilization: null, honors: [] };
  }
  const user = data.users[req.params.userId];
  user.xp += amount || 0;
  while (user.xp >= user.nextLevelXp) {
    user.xp -= user.nextLevelXp;
    user.level++;
    user.nextLevelXp = user.level * 1000;
  }
  res.json({ success: true, user });
});

// Stats for dashboard
app.get('/api/stats', (req, res) => {
  res.json({
    totalMembers: Object.keys(data.users).length,
    civilizations: Object.keys(data.civilizations).length,
    servers: Object.keys(data.servers).length,
    botOnline: !!global.botClient?.isReady()
  });
});

// Bot status
app.get('/api/bot/status', (req, res) => {
  const bot = global.botClient;
  if (bot && bot.isReady()) {
    res.json({
      online: true,
      tag: bot.user.tag,
      guilds: bot.guilds.cache.size,
      ping: bot.ws.ping
    });
  } else {
    res.json({ online: false, tag: null, guilds: 0, ping: 0 });
  }
});

const API_PORT = process.env.API_PORT || 3001;
app.listen(API_PORT, '0.0.0.0', () => {
  console.log(`✅ API server running on port ${API_PORT}`);
});

// ── Discord Bot ──────────────────────────────────────────────────────────────
const token = process.env.DISCORD_BOT_TOKEN || process.env.DISCORD_TOKEN;

if (!token) {
  console.warn('⚠️  No DISCORD_BOT_TOKEN set — bot will not start. Add the secret to enable it.');
} else {
  const { Client, GatewayIntentBits, Events } = require('discord.js');

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildVoiceStates,
      GatewayIntentBits.GuildPresences,
      GatewayIntentBits.DirectMessages,
    ]
  });

  global.botClient = client;

  client.once(Events.ClientReady, (c) => {
    console.log(`✅ Discord bot logged in as ${c.user.tag}`);
    console.log(`   Watching ${c.guilds.cache.size} server(s)`);
  });

  // Auto-register new members
  client.on(Events.GuildMemberAdd, async (member) => {
    try {
      await fetch(`http://localhost:${API_PORT}/api/members/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: member.id, serverId: member.guild.id })
      });
      console.log(`📥 Registered new member: ${member.user.tag}`);
    } catch (err) {
      console.error('Error registering member:', err.message);
    }
  });

  // Message commands
  client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot) return;

    const prefix = '!';
    if (!message.content.startsWith(prefix)) {
      // Award XP for every message
      try {
        await fetch(`http://localhost:${API_PORT}/api/users/${message.author.id}/xp`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ amount: 10 })
        });
      } catch (_) {}
      return;
    }

    const args = message.content.slice(prefix.length).trim().split(/\s+/);
    const cmd = args.shift().toLowerCase();

    if (cmd === 'profile') {
      try {
        const res = await fetch(`http://localhost:${API_PORT}/api/users/${message.author.id}`);
        const user = await res.json();
        message.reply(
          `**${message.author.username}'s Profile**\n` +
          `Level: ${user.level} | XP: ${user.xp}/${user.nextLevelXp}\n` +
          `Rank: ${user.rank} | Reputation: ${user.reputation}\n` +
          `Civilization: ${user.civilization || 'None'}`
        );
      } catch (err) {
        message.reply('❌ Could not fetch profile.');
      }
    }

    else if (cmd === 'createciv') {
      const name = args.join(' ');
      if (!name) return message.reply('Usage: !createciv <name>');
      try {
        const res = await fetch(`http://localhost:${API_PORT}/api/civilizations/create`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, leaderId: message.author.id, serverId: message.guild?.id })
        });
        const civ = await res.json();
        message.reply(`✅ Civilization **${name}** created! (ID: ${civ.civilizationId})`);
      } catch (err) {
        message.reply('❌ Could not create civilization.');
      }
    }

    else if (cmd === 'joinciv') {
      const civId = args[0];
      if (!civId) return message.reply('Usage: !joinciv <id>');
      try {
        const res = await fetch(`http://localhost:${API_PORT}/api/civilizations/${civId}/join`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: message.author.id })
        });
        const result = await res.json();
        if (result.error) return message.reply(`❌ ${result.error}`);
        message.reply(`✅ Joined civilization **${result.civilization.name}**!`);
      } catch (err) {
        message.reply('❌ Could not join civilization.');
      }
    }

    else if (cmd === 'civs') {
      try {
        const res = await fetch(`http://localhost:${API_PORT}/api/civilizations`);
        const civs = await res.json();
        if (civs.length === 0) return message.reply('No civilizations exist yet. Create one with !createciv <name>');
        const list = civs.map(c => `• **${c.name}** (ID: ${c.id}) — ${c.members.length} members`).join('\n');
        message.reply(`**Civilizations:**\n${list}`);
      } catch (err) {
        message.reply('❌ Could not fetch civilizations.');
      }
    }

    else if (cmd === 'help') {
      message.reply(
        '**Civilization Bot Commands:**\n' +
        '`!profile` — View your profile\n' +
        '`!createciv <name>` — Create a new civilization\n' +
        '`!joinciv <id>` — Join a civilization by ID\n' +
        '`!civs` — List all civilizations\n' +
        '`!help` — Show this help'
      );
    }
  });

  client.on(Events.Error, (err) => console.error('❌ Bot error:', err));
  client.on(Events.Warn, (msg) => console.warn('⚠️  Bot warning:', msg));

  client.login(token);
}
