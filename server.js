const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const data = {
  servers: {},
  civilizations: {},
  users: {}
};

let civIdCounter = 1;

const features = {
  xpEnabled: true,
  welcomeMessages: true,
  civilizationsEnabled: true,
  commandsEnabled: true,
  autoRegisterMembers: true
};

// ── Stats ────────────────────────────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ status: 'OK' }));

app.get('/api/stats', (req, res) => {
  res.json({
    totalMembers: Object.keys(data.users).length,
    civilizations: Object.keys(data.civilizations).length,
    servers: Object.keys(data.servers).length,
    botOnline: !!global.botClient?.isReady()
  });
});

// ── Features ─────────────────────────────────────────────────────────────────
app.get('/api/features', (req, res) => res.json(features));

app.post('/api/features', (req, res) => {
  Object.assign(features, req.body);
  res.json({ success: true, features });
});

// ── Bot ──────────────────────────────────────────────────────────────────────
app.get('/api/bot/status', (req, res) => {
  const bot = global.botClient;
  if (bot && bot.isReady()) {
    res.json({ online: true, tag: bot.user.tag, guilds: bot.guilds.cache.size, ping: bot.ws.ping });
  } else {
    res.json({ online: false, tag: null, guilds: 0, ping: 0 });
  }
});

app.post('/api/bot/disconnect', async (req, res) => {
  const bot = global.botClient;
  if (!bot) return res.json({ success: false, message: 'Bot not running' });
  try {
    await bot.destroy();
    console.log('🔴 Bot disconnected via dashboard');
    res.json({ success: true, message: 'Bot disconnected' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/bot/reconnect', (req, res) => {
  const token = process.env.DISCORD_BOT_TOKEN || process.env.DISCORD_TOKEN;
  if (!token) return res.status(400).json({ success: false, message: 'No token configured' });
  const bot = global.botClient;
  if (!bot) return res.status(400).json({ success: false, message: 'Bot client not initialized' });
  try {
    bot.login(token);
    console.log('🟢 Bot reconnecting via dashboard');
    res.json({ success: true, message: 'Bot reconnecting…' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── Users ────────────────────────────────────────────────────────────────────
app.get('/api/users', (req, res) => res.json(Object.values(data.users)));

app.get('/api/users/:userId', (req, res) => {
  const user = data.users[req.params.userId] || {
    id: req.params.userId, username: `User_${req.params.userId}`,
    level: 1, xp: 0, nextLevelXp: 1000, reputation: 0,
    rank: 'Member', civilization: null, honors: []
  };
  res.json(user);
});

app.delete('/api/users/:userId', (req, res) => {
  const user = data.users[req.params.userId];
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (user.civilization && data.civilizations[user.civilization]) {
    const civ = data.civilizations[user.civilization];
    civ.members = civ.members.filter(m => m !== req.params.userId);
  }
  delete data.users[req.params.userId];
  res.json({ success: true });
});

app.post('/api/users/:userId/reset', (req, res) => {
  if (!data.users[req.params.userId]) return res.status(404).json({ error: 'User not found' });
  data.users[req.params.userId] = {
    id: req.params.userId, username: data.users[req.params.userId].username,
    level: 1, xp: 0, nextLevelXp: 1000, reputation: 0,
    rank: 'Member', civilization: null, honors: []
  };
  res.json({ success: true, user: data.users[req.params.userId] });
});

app.post('/api/users/:userId/xp', (req, res) => {
  if (!features.xpEnabled) return res.json({ success: false, message: 'XP disabled' });
  const { amount } = req.body;
  if (!data.users[req.params.userId]) {
    data.users[req.params.userId] = {
      id: req.params.userId, username: req.params.userId,
      level: 1, xp: 0, nextLevelXp: 1000, reputation: 0,
      rank: 'Member', civilization: null, honors: []
    };
  }
  const user = data.users[req.params.userId];
  user.xp += amount || 0;
  while (user.xp >= user.nextLevelXp) { user.xp -= user.nextLevelXp; user.level++; user.nextLevelXp = user.level * 1000; }
  res.json({ success: true, user });
});

// ── Civilizations ─────────────────────────────────────────────────────────────
app.get('/api/civilizations', (req, res) => res.json(Object.values(data.civilizations)));

app.get('/api/civilizations/:id', (req, res) => {
  const civ = data.civilizations[req.params.id];
  if (!civ) return res.status(404).json({ error: 'Civilization not found' });
  res.json(civ);
});

app.post('/api/civilizations/create', (req, res) => {
  if (!features.civilizationsEnabled) return res.json({ success: false, message: 'Civilizations disabled' });
  const { name, leaderId, serverId } = req.body;
  const id = civIdCounter++;
  data.civilizations[id] = { id, name, leaderId, serverId, members: leaderId ? [leaderId] : [], createdAt: new Date() };
  if (leaderId) {
    if (!data.users[leaderId]) data.users[leaderId] = { id: leaderId, username: leaderId, level: 1, xp: 0, nextLevelXp: 1000, reputation: 0, rank: 'Leader', civilization: id, honors: [] };
    else data.users[leaderId].civilization = id;
  }
  res.json({ success: true, civilizationId: id, civilization: data.civilizations[id] });
});

app.post('/api/civilizations/:id/join', (req, res) => {
  const { userId } = req.body;
  const civ = data.civilizations[req.params.id];
  if (!civ) return res.status(404).json({ error: 'Civilization not found' });
  if (!civ.members.includes(userId)) civ.members.push(userId);
  if (!data.users[userId]) data.users[userId] = { id: userId, username: userId, level: 1, xp: 0, nextLevelXp: 1000, reputation: 0, rank: 'Member', civilization: req.params.id, honors: [] };
  else data.users[userId].civilization = req.params.id;
  res.json({ success: true, civilization: civ });
});

app.delete('/api/civilizations/:id', (req, res) => {
  const civ = data.civilizations[req.params.id];
  if (!civ) return res.status(404).json({ error: 'Civilization not found' });
  civ.members.forEach(uid => { if (data.users[uid]) data.users[uid].civilization = null; });
  delete data.civilizations[req.params.id];
  res.json({ success: true });
});

// ── Servers ───────────────────────────────────────────────────────────────────
app.get('/api/servers', (req, res) => res.json(Object.values(data.servers)));

app.post('/api/servers/setup', (req, res) => {
  const { serverId, serverName } = req.body;
  data.servers[serverId] = { serverId, serverName, setupAt: new Date() };
  res.json({ success: true });
});

app.delete('/api/servers/:serverId', (req, res) => {
  if (!data.servers[req.params.serverId]) return res.status(404).json({ error: 'Server not found' });
  delete data.servers[req.params.serverId];
  res.json({ success: true });
});

// ── Members join ──────────────────────────────────────────────────────────────
app.post('/api/members/join', (req, res) => {
  if (!features.autoRegisterMembers) return res.json({ success: false });
  const { userId, serverId } = req.body;
  if (!data.users[userId]) data.users[userId] = { id: userId, username: userId, level: 1, xp: 0, nextLevelXp: 1000, reputation: 0, rank: 'Member', civilization: null, honors: [] };
  res.json({ success: true, welcomeEnabled: features.welcomeMessages, autoRoles: [] });
});

const API_PORT = process.env.API_PORT || 3001;
app.listen(API_PORT, '0.0.0.0', () => console.log(`✅ API server running on port ${API_PORT}`));

// ── Discord Bot ───────────────────────────────────────────────────────────────
const token = process.env.DISCORD_BOT_TOKEN || process.env.DISCORD_TOKEN;

if (!token) {
  console.warn('⚠️  No DISCORD_BOT_TOKEN set — bot will not start.');
} else {
  const { Client, GatewayIntentBits, Events } = require('discord.js');

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildVoiceStates, GatewayIntentBits.GuildPresences,
      GatewayIntentBits.DirectMessages,
    ]
  });

  global.botClient = client;

  client.once(Events.ClientReady, (c) => {
    console.log(`✅ Discord bot logged in as ${c.user.tag}`);
    Object.values(c.guilds.cache).forEach(g => {
      if (!data.servers[g.id]) data.servers[g.id] = { serverId: g.id, serverName: g.name, setupAt: new Date() };
    });
  });

  client.on(Events.GuildMemberAdd, async (member) => {
    if (!features.autoRegisterMembers) return;
    try {
      await fetch(`http://localhost:${API_PORT}/api/members/join`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: member.id, serverId: member.guild.id })
      });
    } catch (_) {}
  });

  client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot || !features.commandsEnabled) return;

    const prefix = '!';
    if (!message.content.startsWith(prefix)) {
      if (features.xpEnabled) {
        try {
          await fetch(`http://localhost:${API_PORT}/api/users/${message.author.id}/xp`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ amount: 10 })
          });
        } catch (_) {}
      }
      return;
    }

    const args = message.content.slice(prefix.length).trim().split(/\s+/);
    const cmd = args.shift().toLowerCase();

    if (cmd === 'profile') {
      const res = await fetch(`http://localhost:${API_PORT}/api/users/${message.author.id}`);
      const u = await res.json();
      message.reply(`**${message.author.username}'s Profile**\nLevel: ${u.level} | XP: ${u.xp}/${u.nextLevelXp}\nRank: ${u.rank} | Rep: ${u.reputation}\nCivilization: ${u.civilization || 'None'}`);
    }
    else if (cmd === 'createciv') {
      if (!features.civilizationsEnabled) return message.reply('❌ Civilizations are disabled.');
      const name = args.join(' ');
      if (!name) return message.reply('Usage: !createciv <name>');
      const res = await fetch(`http://localhost:${API_PORT}/api/civilizations/create`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, leaderId: message.author.id, serverId: message.guild?.id })
      });
      const civ = await res.json();
      message.reply(`✅ Civilization **${name}** created! (ID: ${civ.civilizationId})`);
    }
    else if (cmd === 'joinciv') {
      const civId = args[0];
      if (!civId) return message.reply('Usage: !joinciv <id>');
      const res = await fetch(`http://localhost:${API_PORT}/api/civilizations/${civId}/join`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: message.author.id })
      });
      const result = await res.json();
      if (result.error) return message.reply(`❌ ${result.error}`);
      message.reply(`✅ Joined civilization **${result.civilization.name}**!`);
    }
    else if (cmd === 'civs') {
      const res = await fetch(`http://localhost:${API_PORT}/api/civilizations`);
      const civs = await res.json();
      if (civs.length === 0) return message.reply('No civilizations yet. Use !createciv <name>');
      message.reply(`**Civilizations:**\n${civs.map(c => `• **${c.name}** (ID: ${c.id}) — ${c.members.length} members`).join('\n')}`);
    }
    else if (cmd === 'help') {
      message.reply('**Commands:**\n`!profile` `!createciv <name>` `!joinciv <id>` `!civs` `!help`');
    }
  });

  client.on(Events.Error, (err) => console.error('❌ Bot error:', err));
  client.login(token);
}
