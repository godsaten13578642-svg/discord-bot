const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// ── Data Store ────────────────────────────────────────────────────────────────
const data = {
  servers: {},
  users: {},
  civilizations: {},
  religions: {},
  teams: {},
  cults: {},
  rebels: {},        // userId -> { userId, fromCivId, reason, createdAt }
  alliances: {},     // id -> { id, type:'alliance'|'war'|'treaty', party1, party2, createdAt }
  economy: {},       // userId -> balance
  titles: {},        // userId -> [{ title, awardedBy, createdAt }]
  events: {},        // id -> { id, name, type, participants[], status, createdAt }
  blackmarket: [],   // anonymous trades
};

let counters = { civ: 1, religion: 1, team: 1, cult: 1, alliance: 1, event: 1 };

const features = {
  xpEnabled: true,
  welcomeMessages: true,
  civilizationsEnabled: true,
  commandsEnabled: true,
  autoRegisterMembers: true,
  religionsEnabled: true,
  teamsEnabled: true,
  cultsEnabled: true,
  economyEnabled: true,
  rebelsEnabled: true,
  warsEnabled: true,
  eventsEnabled: true,
  dailyRewardAmount: 100,
  xpPerMessage: 10,
};

// ── Helpers ───────────────────────────────────────────────────────────────────
const mkUser = (id) => ({
  id, username: id, level: 1, xp: 0, nextLevelXp: 1000,
  reputation: 0, rank: 'Member', civilization: null,
  religion: null, team: null, cult: null, isRebel: false,
  honors: [], titles: [], lastDaily: null
});

const ensureUser = (id) => { if (!data.users[id]) data.users[id] = mkUser(id); return data.users[id]; };
const ensureBalance = (id) => { if (!data.economy[id]) data.economy[id] = 0; return data.economy[id]; };

const awardXP = (userId, amount) => {
  const u = ensureUser(userId);
  u.xp += amount;
  while (u.xp >= u.nextLevelXp) { u.xp -= u.nextLevelXp; u.level++; u.nextLevelXp = u.level * 1000; }
  return u;
};

// ── Health / Stats ─────────────────────────────────────────────────────────────
app.get('/health', (_, res) => res.json({ status: 'OK' }));

app.get('/api/stats', (_, res) => res.json({
  totalMembers: Object.keys(data.users).length,
  civilizations: Object.keys(data.civilizations).length,
  religions: Object.keys(data.religions).length,
  teams: Object.keys(data.teams).length,
  cults: Object.keys(data.cults).length,
  rebels: Object.keys(data.rebels).length,
  alliances: Object.values(data.alliances).filter(a => a.type === 'alliance').length,
  wars: Object.values(data.alliances).filter(a => a.type === 'war').length,
  servers: Object.keys(data.servers).length,
  events: Object.keys(data.events).length,
  botOnline: !!global.botClient?.isReady(),
}));

// ── Features ───────────────────────────────────────────────────────────────────
app.get('/api/features', (_, res) => res.json(features));
app.post('/api/features', (req, res) => { Object.assign(features, req.body); res.json({ success: true, features }); });

// ── Bot ────────────────────────────────────────────────────────────────────────
app.get('/api/bot/status', (_, res) => {
  const b = global.botClient;
  if (b?.isReady()) res.json({ online: true, tag: b.user.tag, guilds: b.guilds.cache.size, ping: b.ws.ping });
  else res.json({ online: false, tag: null, guilds: 0, ping: 0 });
});
app.post('/api/bot/disconnect', async (_, res) => {
  try { await global.botClient?.destroy(); res.json({ success: true, message: 'Bot disconnected' }); }
  catch (e) { res.status(500).json({ success: false, message: e.message }); }
});
app.post('/api/bot/reconnect', (_, res) => {
  const token = process.env.DISCORD_BOT_TOKEN || process.env.DISCORD_TOKEN;
  if (!token) return res.status(400).json({ success: false, message: 'No token configured' });
  try { global.botClient?.login(token); res.json({ success: true, message: 'Bot reconnecting…' }); }
  catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ── Users ──────────────────────────────────────────────────────────────────────
app.get('/api/users', (_, res) => res.json(Object.values(data.users)));
app.get('/api/users/:id', (req, res) => res.json(data.users[req.params.id] || mkUser(req.params.id)));
app.delete('/api/users/:id', (req, res) => {
  const u = data.users[req.params.id];
  if (!u) return res.status(404).json({ error: 'Not found' });
  ['civilization','religion','team','cult'].forEach(k => { if (u[k] && data[k+'s']?.[u[k]]) data[k+'s'][u[k]].members = data[k+'s'][u[k]].members.filter(m => m !== req.params.id); });
  delete data.users[req.params.id]; delete data.economy[req.params.id]; delete data.rebels[req.params.id];
  res.json({ success: true });
});
app.post('/api/users/:id/reset', (req, res) => {
  if (!data.users[req.params.id]) return res.status(404).json({ error: 'Not found' });
  const u = data.users[req.params.id];
  const saved = { id: u.id, username: u.username };
  data.users[req.params.id] = { ...mkUser(u.id), username: u.username };
  data.economy[req.params.id] = 0;
  res.json({ success: true, user: data.users[req.params.id] });
});
app.post('/api/users/:id/xp', (req, res) => {
  if (!features.xpEnabled) return res.json({ success: false, message: 'XP disabled' });
  res.json({ success: true, user: awardXP(req.params.id, req.body.amount || 0) });
});
app.post('/api/users/:id/title', (req, res) => {
  const { title, awardedBy } = req.body;
  ensureUser(req.params.id);
  if (!data.titles[req.params.id]) data.titles[req.params.id] = [];
  data.titles[req.params.id].push({ title, awardedBy, createdAt: new Date() });
  res.json({ success: true });
});
app.delete('/api/users/:id/title/:index', (req, res) => {
  if (!data.titles[req.params.id]) return res.status(404).json({ error: 'No titles' });
  data.titles[req.params.id].splice(Number(req.params.index), 1);
  res.json({ success: true });
});
app.get('/api/users/:id/titles', (req, res) => res.json(data.titles[req.params.id] || []));
app.post('/api/members/join', (req, res) => {
  if (!features.autoRegisterMembers) return res.json({ success: false });
  const { userId } = req.body;
  ensureUser(userId);
  res.json({ success: true, welcomeEnabled: features.welcomeMessages });
});

// ── Economy ────────────────────────────────────────────────────────────────────
app.get('/api/economy', (_, res) => {
  const leaderboard = Object.entries(data.economy).sort(([,a],[,b]) => b-a).slice(0,50).map(([id,bal]) => ({ id, username: data.users[id]?.username || id, balance: bal }));
  res.json(leaderboard);
});
app.get('/api/economy/:userId', (req, res) => res.json({ userId: req.params.userId, balance: ensureBalance(req.params.userId) }));
app.post('/api/economy/pay', (req, res) => {
  const { fromId, toId, amount } = req.body;
  const amt = Number(amount);
  if (!amt || amt <= 0) return res.status(400).json({ error: 'Invalid amount' });
  ensureBalance(fromId); ensureBalance(toId);
  if (data.economy[fromId] < amt) return res.status(400).json({ error: 'Insufficient funds' });
  data.economy[fromId] -= amt; data.economy[toId] += amt;
  res.json({ success: true });
});
app.post('/api/economy/daily/:userId', (req, res) => {
  const u = ensureUser(req.params.userId);
  const now = Date.now();
  if (u.lastDaily && now - new Date(u.lastDaily).getTime() < 86400000) return res.status(400).json({ error: 'Already claimed today', next: new Date(new Date(u.lastDaily).getTime() + 86400000) });
  ensureBalance(req.params.userId);
  data.economy[req.params.userId] += features.dailyRewardAmount;
  u.lastDaily = new Date();
  res.json({ success: true, amount: features.dailyRewardAmount, balance: data.economy[req.params.userId] });
});
app.post('/api/economy/admin/set', (req, res) => {
  const { userId, amount } = req.body;
  ensureUser(userId);
  data.economy[userId] = Number(amount);
  res.json({ success: true });
});

// ── Civilizations ──────────────────────────────────────────────────────────────
app.get('/api/civilizations', (_, res) => res.json(Object.values(data.civilizations)));
app.get('/api/civilizations/:id', (req, res) => {
  const c = data.civilizations[req.params.id];
  if (!c) return res.status(404).json({ error: 'Not found' });
  res.json(c);
});
app.post('/api/civilizations/create', (req, res) => {
  if (!features.civilizationsEnabled) return res.json({ success: false, message: 'Disabled' });
  const { name, leaderId, serverId } = req.body;
  const id = counters.civ++;
  data.civilizations[id] = { id, name, leaderId, serverId, members: leaderId ? [leaderId] : [], treasury: 0, createdAt: new Date() };
  if (leaderId) { const u = ensureUser(leaderId); u.civilization = id; u.rank = 'Leader'; }
  res.json({ success: true, civilizationId: id, civilization: data.civilizations[id] });
});
app.post('/api/civilizations/:id/join', (req, res) => {
  const { userId } = req.body;
  const civ = data.civilizations[req.params.id];
  if (!civ) return res.status(404).json({ error: 'Not found' });
  if (data.rebels[userId]) delete data.rebels[userId];
  if (!civ.members.includes(userId)) civ.members.push(userId);
  const u = ensureUser(userId); u.civilization = req.params.id; u.isRebel = false;
  res.json({ success: true, civilization: civ });
});
app.delete('/api/civilizations/:id', (req, res) => {
  const civ = data.civilizations[req.params.id];
  if (!civ) return res.status(404).json({ error: 'Not found' });
  civ.members.forEach(uid => { if (data.users[uid]) data.users[uid].civilization = null; });
  delete data.civilizations[req.params.id];
  res.json({ success: true });
});

// ── Rebels ─────────────────────────────────────────────────────────────────────
app.get('/api/rebels', (_, res) => res.json(Object.values(data.rebels)));
app.post('/api/rebels', (req, res) => {
  if (!features.rebelsEnabled) return res.json({ success: false, message: 'Disabled' });
  const { userId, reason } = req.body;
  const u = ensureUser(userId);
  if (!u.civilization) return res.status(400).json({ error: 'Not in a civilization' });
  const fromCivId = u.civilization;
  const civ = data.civilizations[fromCivId];
  if (civ) civ.members = civ.members.filter(m => m !== userId);
  data.rebels[userId] = { userId, fromCivId, reason: reason || 'No reason given', createdAt: new Date() };
  u.civilization = null; u.isRebel = true; u.rank = 'Rebel';
  res.json({ success: true });
});
app.delete('/api/rebels/:userId', (req, res) => {
  delete data.rebels[req.params.userId];
  if (data.users[req.params.userId]) { data.users[req.params.userId].isRebel = false; data.users[req.params.userId].rank = 'Member'; }
  res.json({ success: true });
});

// ── Religions ──────────────────────────────────────────────────────────────────
app.get('/api/religions', (_, res) => res.json(Object.values(data.religions)));
app.post('/api/religions/create', (req, res) => {
  if (!features.religionsEnabled) return res.json({ success: false, message: 'Disabled' });
  const { name, founderId, doctrine, serverId } = req.body;
  const id = counters.religion++;
  data.religions[id] = { id, name, founderId, doctrine: doctrine || '', serverId, members: founderId ? [founderId] : [], holyWars: [], blessings: 0, createdAt: new Date() };
  if (founderId) { const u = ensureUser(founderId); u.religion = id; }
  res.json({ success: true, religionId: id, religion: data.religions[id] });
});
app.post('/api/religions/:id/join', (req, res) => {
  const { userId } = req.body;
  const rel = data.religions[req.params.id];
  if (!rel) return res.status(404).json({ error: 'Not found' });
  if (!rel.members.includes(userId)) rel.members.push(userId);
  const u = ensureUser(userId); u.religion = req.params.id;
  res.json({ success: true, religion: rel });
});
app.delete('/api/religions/:id', (req, res) => {
  const rel = data.religions[req.params.id];
  if (!rel) return res.status(404).json({ error: 'Not found' });
  rel.members.forEach(uid => { if (data.users[uid]) data.users[uid].religion = null; });
  delete data.religions[req.params.id];
  res.json({ success: true });
});
app.post('/api/religions/:id/bless', (req, res) => {
  const rel = data.religions[req.params.id];
  if (!rel) return res.status(404).json({ error: 'Not found' });
  rel.blessings++; res.json({ success: true, blessings: rel.blessings });
});

// ── Teams ──────────────────────────────────────────────────────────────────────
app.get('/api/teams', (_, res) => res.json(Object.values(data.teams)));
app.post('/api/teams/create', (req, res) => {
  if (!features.teamsEnabled) return res.json({ success: false, message: 'Disabled' });
  const { name, leaderId, color, serverId } = req.body;
  const id = counters.team++;
  data.teams[id] = { id, name, leaderId, color: color || '#0d6efd', serverId, members: leaderId ? [leaderId] : [], points: 0, createdAt: new Date() };
  if (leaderId) { const u = ensureUser(leaderId); u.team = id; }
  res.json({ success: true, teamId: id, team: data.teams[id] });
});
app.post('/api/teams/:id/join', (req, res) => {
  const { userId } = req.body;
  const team = data.teams[req.params.id];
  if (!team) return res.status(404).json({ error: 'Not found' });
  if (!team.members.includes(userId)) team.members.push(userId);
  const u = ensureUser(userId); u.team = req.params.id;
  res.json({ success: true, team });
});
app.post('/api/teams/:id/points', (req, res) => {
  const team = data.teams[req.params.id];
  if (!team) return res.status(404).json({ error: 'Not found' });
  team.points += Number(req.body.amount) || 0;
  res.json({ success: true, points: team.points });
});
app.delete('/api/teams/:id', (req, res) => {
  const team = data.teams[req.params.id];
  if (!team) return res.status(404).json({ error: 'Not found' });
  team.members.forEach(uid => { if (data.users[uid]) data.users[uid].team = null; });
  delete data.teams[req.params.id];
  res.json({ success: true });
});

// ── Cults ──────────────────────────────────────────────────────────────────────
app.get('/api/cults', (_, res) => res.json(Object.values(data.cults)));
app.post('/api/cults/create', (req, res) => {
  if (!features.cultsEnabled) return res.json({ success: false, message: 'Disabled' });
  const { name, leaderId, secretObjective, serverId } = req.body;
  const id = counters.cult++;
  data.cults[id] = { id, name, leaderId, secretObjective: secretObjective || 'Unknown', serverId, members: leaderId ? [leaderId] : [], rituals: 0, power: 0, createdAt: new Date() };
  if (leaderId) { const u = ensureUser(leaderId); u.cult = id; }
  res.json({ success: true, cultId: id, cult: data.cults[id] });
});
app.post('/api/cults/:id/join', (req, res) => {
  const { userId } = req.body;
  const cult = data.cults[req.params.id];
  if (!cult) return res.status(404).json({ error: 'Not found' });
  if (!cult.members.includes(userId)) cult.members.push(userId);
  const u = ensureUser(userId); u.cult = req.params.id;
  res.json({ success: true, cult });
});
app.post('/api/cults/:id/ritual', (req, res) => {
  const cult = data.cults[req.params.id];
  if (!cult) return res.status(404).json({ error: 'Not found' });
  cult.rituals++; cult.power += 10;
  res.json({ success: true, rituals: cult.rituals, power: cult.power });
});
app.delete('/api/cults/:id', (req, res) => {
  const cult = data.cults[req.params.id];
  if (!cult) return res.status(404).json({ error: 'Not found' });
  cult.members.forEach(uid => { if (data.users[uid]) data.users[uid].cult = null; });
  delete data.cults[req.params.id];
  res.json({ success: true });
});

// ── Alliances & Wars ───────────────────────────────────────────────────────────
app.get('/api/alliances', (_, res) => res.json(Object.values(data.alliances)));
app.post('/api/alliances', (req, res) => {
  if (!features.warsEnabled) return res.json({ success: false, message: 'Disabled' });
  const { type, party1, party2, party1Type, party2Type } = req.body;
  const id = counters.alliance++;
  data.alliances[id] = { id, type, party1, party2, party1Type: party1Type || 'civilization', party2Type: party2Type || 'civilization', createdAt: new Date() };
  res.json({ success: true, id, alliance: data.alliances[id] });
});
app.delete('/api/alliances/:id', (req, res) => {
  if (!data.alliances[req.params.id]) return res.status(404).json({ error: 'Not found' });
  delete data.alliances[req.params.id];
  res.json({ success: true });
});

// ── Events ─────────────────────────────────────────────────────────────────────
app.get('/api/events', (_, res) => res.json(Object.values(data.events)));
app.post('/api/events/create', (req, res) => {
  if (!features.eventsEnabled) return res.json({ success: false, message: 'Disabled' });
  const { name, type, serverId } = req.body;
  const id = counters.event++;
  data.events[id] = { id, name, type: type || 'general', serverId, participants: [], status: 'open', reward: 200, createdAt: new Date() };
  res.json({ success: true, eventId: id, event: data.events[id] });
});
app.post('/api/events/:id/join', (req, res) => {
  const { userId } = req.body;
  const ev = data.events[req.params.id];
  if (!ev) return res.status(404).json({ error: 'Not found' });
  if (ev.status !== 'open') return res.status(400).json({ error: 'Event not open' });
  if (!ev.participants.includes(userId)) ev.participants.push(userId);
  res.json({ success: true, event: ev });
});
app.post('/api/events/:id/end', (req, res) => {
  const { winnerId } = req.body;
  const ev = data.events[req.params.id];
  if (!ev) return res.status(404).json({ error: 'Not found' });
  ev.status = 'ended'; ev.winner = winnerId; ev.endedAt = new Date();
  if (winnerId) { ensureBalance(winnerId); data.economy[winnerId] += ev.reward; }
  res.json({ success: true, event: ev });
});
app.delete('/api/events/:id', (req, res) => {
  if (!data.events[req.params.id]) return res.status(404).json({ error: 'Not found' });
  delete data.events[req.params.id];
  res.json({ success: true });
});

// ── Servers ────────────────────────────────────────────────────────────────────
app.get('/api/servers', (_, res) => res.json(Object.values(data.servers)));
app.post('/api/servers/setup', (req, res) => {
  const { serverId, serverName } = req.body;
  data.servers[serverId] = { serverId, serverName, setupAt: new Date() };
  res.json({ success: true });
});
app.delete('/api/servers/:id', (req, res) => {
  if (!data.servers[req.params.id]) return res.status(404).json({ error: 'Not found' });
  delete data.servers[req.params.id];
  res.json({ success: true });
});

const API_PORT = process.env.API_PORT || 3001;
app.listen(API_PORT, '0.0.0.0', () => console.log(`✅ API server running on port ${API_PORT}`));

// ── Discord Bot ────────────────────────────────────────────────────────────────
const token = process.env.DISCORD_BOT_TOKEN || process.env.DISCORD_TOKEN;

if (!token) {
  console.warn('⚠️  No DISCORD_BOT_TOKEN — bot will not start.');
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

  const call = (path, opts) => fetch(`http://localhost:${API_PORT}${path}`, opts).then(r => r.json());
  const post = (path, body) => call(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

  client.once(Events.ClientReady, (c) => {
    console.log(`✅ Discord bot logged in as ${c.user.tag}`);
    c.guilds.cache.forEach(g => { if (!data.servers[g.id]) data.servers[g.id] = { serverId: g.id, serverName: g.name, setupAt: new Date() }; });
  });

  client.on(Events.GuildMemberAdd, async (member) => {
    if (!features.autoRegisterMembers) return;
    await post('/api/members/join', { userId: member.id, serverId: member.guild.id });
  });

  client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot) return;
    if (!features.commandsEnabled) return;

    const prefix = '!';
    if (!message.content.startsWith(prefix)) {
      if (features.xpEnabled) await post(`/api/users/${message.author.id}/xp`, { amount: features.xpPerMessage });
      return;
    }

    const args = message.content.slice(prefix.length).trim().split(/\s+/);
    const cmd = args.shift().toLowerCase();
    const reply = (msg) => message.reply(msg);

    // ── Profile & Core ──
    if (cmd === 'profile') {
      const u = await call(`/api/users/${message.author.id}`);
      const bal = await call(`/api/economy/${message.author.id}`);
      const titles = await call(`/api/users/${message.author.id}/titles`);
      const civName = u.civilization && data.civilizations[u.civilization] ? data.civilizations[u.civilization].name : 'None';
      const relName = u.religion && data.religions[u.religion] ? data.religions[u.religion].name : 'None';
      const teamName = u.team && data.teams[u.team] ? data.teams[u.team].name : 'None';
      const cultName = u.cult && data.cults[u.cult] ? '🌑 In a Cult' : 'None';
      reply(
        `**${message.author.username}'s Profile** ${u.isRebel ? '⚔️ REBEL' : ''}\n` +
        `Level: ${u.level} | XP: ${u.xp}/${u.nextLevelXp} | Rep: ${u.reputation}\n` +
        `Rank: ${u.rank} | 💰 Gold: ${bal.balance}\n` +
        `🏛️ Civilization: ${civName}\n` +
        `✝️ Religion: ${relName}\n` +
        `🛡️ Team: ${teamName}\n` +
        `🌑 Cult: ${cultName}\n` +
        (titles.length ? `🏅 Titles: ${titles.map(t => t.title).join(', ')}` : '')
      );
    }

    // ── Economy ──
    else if (cmd === 'balance' || cmd === 'bal') {
      const b = await call(`/api/economy/${message.author.id}`);
      reply(`💰 Your balance: **${b.balance} gold**`);
    }
    else if (cmd === 'daily') {
      const r = await post(`/api/economy/daily/${message.author.id}`, {});
      if (r.error) reply(`❌ ${r.error}`);
      else reply(`💰 Claimed daily reward: **+${r.amount} gold**! Balance: **${r.balance} gold**`);
    }
    else if (cmd === 'pay') {
      const [target, amtStr] = args;
      if (!target || !amtStr) return reply('Usage: !pay @user <amount>');
      const userId = target.replace(/[<@!>]/g, '');
      const r = await post('/api/economy/pay', { fromId: message.author.id, toId: userId, amount: Number(amtStr) });
      if (r.error) reply(`❌ ${r.error}`);
      else reply(`✅ Paid **${amtStr} gold** to <@${userId}>`);
    }
    else if (cmd === 'leaderboard' || cmd === 'lb') {
      const lb = await call('/api/economy');
      if (!lb.length) return reply('No economy data yet.');
      reply(`**💰 Gold Leaderboard:**\n${lb.slice(0, 10).map((e, i) => `${i + 1}. <@${e.id}> — ${e.balance} gold`).join('\n')}`);
    }

    // ── Civilizations ──
    else if (cmd === 'createciv') {
      if (!features.civilizationsEnabled) return reply('❌ Civilizations are disabled.');
      const name = args.join(' ');
      if (!name) return reply('Usage: !createciv <name>');
      const r = await post('/api/civilizations/create', { name, leaderId: message.author.id, serverId: message.guild?.id });
      reply(r.success ? `✅ Civilization **${name}** created! (ID: ${r.civilizationId})` : `❌ ${r.message}`);
    }
    else if (cmd === 'joinciv') {
      const id = args[0];
      if (!id) return reply('Usage: !joinciv <id>');
      const r = await post(`/api/civilizations/${id}/join`, { userId: message.author.id });
      if (r.error) reply(`❌ ${r.error}`);
      else reply(`✅ Joined civilization **${r.civilization.name}**!`);
    }
    else if (cmd === 'civs') {
      const civs = await call('/api/civilizations');
      if (!civs.length) return reply('No civilizations yet.');
      reply(`**🏛️ Civilizations:**\n${civs.map(c => `• **${c.name}** (ID: ${c.id}) — ${c.members.length} members`).join('\n')}`);
    }

    // ── Rebels ──
    else if (cmd === 'rebel') {
      const reason = args.join(' ');
      const r = await post('/api/rebels', { userId: message.author.id, reason });
      if (r.error) reply(`❌ ${r.error}`);
      else reply(`⚔️ You have rebelled! You are now a free agent.`);
    }
    else if (cmd === 'rebels') {
      const rebels = await call('/api/rebels');
      if (!rebels.length) return reply('No rebels.');
      reply(`**⚔️ Rebels:**\n${rebels.map(r => `• <@${r.userId}> (from Civ ${r.fromCivId}): ${r.reason}`).join('\n')}`);
    }

    // ── Religions ──
    else if (cmd === 'foundreligion') {
      if (!features.religionsEnabled) return reply('❌ Religions are disabled.');
      const parts = args.join(' ').split('|');
      const name = parts[0]?.trim();
      const doctrine = parts[1]?.trim() || '';
      if (!name) return reply('Usage: !foundreligion <name> | <doctrine>');
      const r = await post('/api/religions/create', { name, doctrine, founderId: message.author.id, serverId: message.guild?.id });
      reply(r.success ? `✝️ Religion **${name}** founded! (ID: ${r.religionId})` : `❌ ${r.message}`);
    }
    else if (cmd === 'joinreligion') {
      const id = args[0];
      if (!id) return reply('Usage: !joinreligion <id>');
      const r = await post(`/api/religions/${id}/join`, { userId: message.author.id });
      if (r.error) reply(`❌ ${r.error}`);
      else reply(`✝️ You have joined **${r.religion.name}**!`);
    }
    else if (cmd === 'religions') {
      const rels = await call('/api/religions');
      if (!rels.length) return reply('No religions yet.');
      reply(`**✝️ Religions:**\n${rels.map(r => `• **${r.name}** (ID: ${r.id}) — ${r.members.length} followers | ✨ ${r.blessings} blessings`).join('\n')}`);
    }
    else if (cmd === 'pray') {
      const u = await call(`/api/users/${message.author.id}`);
      if (!u.religion) return reply('❌ You have no religion to pray to.');
      const r = await post(`/api/religions/${u.religion}/bless`, {});
      reply(`🙏 You prayed. Your religion now has **${r.blessings} blessings**.`);
    }

    // ── Teams ──
    else if (cmd === 'createteam') {
      if (!features.teamsEnabled) return reply('❌ Teams are disabled.');
      const name = args.join(' ');
      if (!name) return reply('Usage: !createteam <name>');
      const r = await post('/api/teams/create', { name, leaderId: message.author.id, serverId: message.guild?.id });
      reply(r.success ? `🛡️ Team **${name}** created! (ID: ${r.teamId})` : `❌ ${r.message}`);
    }
    else if (cmd === 'jointeam') {
      const id = args[0];
      if (!id) return reply('Usage: !jointeam <id>');
      const r = await post(`/api/teams/${id}/join`, { userId: message.author.id });
      if (r.error) reply(`❌ ${r.error}`);
      else reply(`🛡️ Joined team **${r.team.name}**!`);
    }
    else if (cmd === 'teams') {
      const teams = await call('/api/teams');
      if (!teams.length) return reply('No teams yet.');
      reply(`**🛡️ Teams:**\n${teams.map(t => `• **${t.name}** (ID: ${t.id}) — ${t.members.length} members | ${t.points} pts`).join('\n')}`);
    }

    // ── Cults ──
    else if (cmd === 'foundcult') {
      if (!features.cultsEnabled) return reply('❌ Cults are disabled.');
      const parts = args.join(' ').split('|');
      const name = parts[0]?.trim();
      const secretObjective = parts[1]?.trim() || 'World domination';
      if (!name) return reply('Usage: !foundcult <name> | <secret objective>');
      const r = await post('/api/cults/create', { name, secretObjective, leaderId: message.author.id, serverId: message.guild?.id });
      reply(r.success ? `🌑 Cult **${name}** founded! (ID: ${r.cultId}) — The secrets are known only to you.` : `❌ ${r.message}`);
    }
    else if (cmd === 'joincult') {
      const id = args[0];
      if (!id) return reply('Usage: !joincult <id>');
      const r = await post(`/api/cults/${id}/join`, { userId: message.author.id });
      if (r.error) reply(`❌ ${r.error}`);
      else reply(`🌑 You have been initiated into **${r.cult.name}**...`);
    }
    else if (cmd === 'cults') {
      const cults = await call('/api/cults');
      if (!cults.length) return reply('No cults... that you know of.');
      reply(`**🌑 Known Cults:**\n${cults.map(c => `• **${c.name}** (ID: ${c.id}) — ${c.members.length} members | ⚡ ${c.power} power`).join('\n')}`);
    }
    else if (cmd === 'ritual') {
      const u = await call(`/api/users/${message.author.id}`);
      if (!u.cult) return reply('❌ You are not in a cult.');
      const r = await post(`/api/cults/${u.cult}/ritual`, {});
      reply(`🕯️ The ritual is complete. Cult power: **${r.power}** | Rituals performed: **${r.rituals}**`);
    }

    // ── Wars & Alliances ──
    else if (cmd === 'war') {
      if (!features.warsEnabled) return reply('❌ Wars are disabled.');
      const targetId = args[0];
      if (!targetId) return reply('Usage: !war <civId>');
      const u = await call(`/api/users/${message.author.id}`);
      if (!u.civilization) return reply('❌ You need a civilization to declare war.');
      const r = await post('/api/alliances', { type: 'war', party1: u.civilization, party2: targetId });
      const civ2 = data.civilizations[targetId];
      reply(`⚔️ War declared between **Civ ${u.civilization}** and **${civ2?.name || `Civ ${targetId}`}**!`);
    }
    else if (cmd === 'ally') {
      const targetId = args[0];
      if (!targetId) return reply('Usage: !ally <civId>');
      const u = await call(`/api/users/${message.author.id}`);
      if (!u.civilization) return reply('❌ You need a civilization.');
      const r = await post('/api/alliances', { type: 'alliance', party1: u.civilization, party2: targetId });
      const civ2 = data.civilizations[targetId];
      reply(`🤝 Alliance formed between **Civ ${u.civilization}** and **${civ2?.name || `Civ ${targetId}`}**!`);
    }

    // ── Events ──
    else if (cmd === 'joinevent') {
      const id = args[0];
      if (!id) return reply('Usage: !joinevent <id>');
      const r = await post(`/api/events/${id}/join`, { userId: message.author.id });
      if (r.error) reply(`❌ ${r.error}`);
      else reply(`✅ Joined event **${r.event.name}**! ${r.event.participants.length} participants.`);
    }
    else if (cmd === 'events') {
      const evs = await call('/api/events');
      if (!evs.length) return reply('No events running.');
      reply(`**📅 Events:**\n${evs.map(e => `• **${e.name}** (ID: ${e.id}) [${e.status}] — ${e.participants.length} joined | 💰 ${e.reward} reward`).join('\n')}`);
    }

    else if (cmd === 'help') {
      reply(
        '**📜 Commands:**\n' +
        '`!profile` `!balance` `!daily` `!pay @user <amt>` `!leaderboard`\n' +
        '`!createciv <n>` `!joinciv <id>` `!civs`\n' +
        '`!rebel [reason]` `!rebels`\n' +
        '`!foundreligion <n>|<doctrine>` `!joinreligion <id>` `!religions` `!pray`\n' +
        '`!createteam <n>` `!jointeam <id>` `!teams`\n' +
        '`!foundcult <n>|<objective>` `!joincult <id>` `!cults` `!ritual`\n' +
        '`!war <civId>` `!ally <civId>`\n' +
        '`!joinevent <id>` `!events`'
      );
    }
  });

  client.on(Events.Error, (err) => console.error('❌ Bot error:', err));
  client.login(token);
}
