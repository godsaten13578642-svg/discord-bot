const express = require('express');
const cors = require('cors');
const fs = require('fs');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// ── Persistent JSON Database ───────────────────────────────────────────────────
const DB_FILE = './db.json';
let _saved = {};
try { _saved = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); } catch (_) {}

const data = {
  servers:        _saved.servers        || {},
  users:          _saved.users          || {},
  civilizations:  _saved.civilizations  || {},
  religions:      _saved.religions      || {},
  teams:          _saved.teams          || {},
  cults:          _saved.cults          || {},
  rebels:         _saved.rebels         || {},
  alliances:      _saved.alliances      || {},
  economy:        _saved.economy        || {},
  titles:         _saved.titles         || {},
  events:         _saved.events         || {},
  blackmarket:    _saved.blackmarket    || [],
  bounties:       _saved.bounties       || {},  // targetId -> { targetId, amount, placedBy, note, createdAt }
  polls:          _saved.polls          || {},  // id -> { id, question, options:[], votes:{optIdx:[userId]}, createdBy, messageId }
  giveaways:      _saved.giveaways      || {},  // messageId -> { messageId, channelId, prize, hostId, endsAt, ended, winnerId }
  linkedAccounts: _saved.linkedAccounts || {},
  reverseLinks:   _saved.reverseLinks   || {},
  linkCodes:      _saved.linkCodes      || {},
  mcServer:       _saved.mcServer       || { players: [], online: false, lastSeen: null },
};

let counters = _saved.counters || { civ: 1, religion: 1, team: 1, cult: 1, alliance: 1, event: 1, poll: 1 };

const features = Object.assign({
  // Core
  commandsEnabled:       true,
  autoRegisterMembers:   true,
  // XP & Levels
  xpEnabled:             true,
  xpPerMessage:          10,
  levelupEnabled:        true,
  levelupChannelId:      '',
  // Welcome
  welcomeMessages:       true,
  welcomeChannelId:      '',
  // Economy
  economyEnabled:        true,
  dailyRewardAmount:     100,
  // Groups
  civilizationsEnabled:  true,
  religionsEnabled:      true,
  teamsEnabled:          true,
  cultsEnabled:          true,
  rebelsEnabled:         true,
  // Diplomacy
  warsEnabled:           true,
  diplomacyAnnouncementsEnabled: true,
  diplomacyChannelId:    '',
  // Events
  eventsEnabled:         true,
  eventsChannelId:       '',
  // Bounties
  bountyEnabled:         true,
  bountyChannelId:       '',
  // Polls
  pollsEnabled:          true,
  pollsChannelId:        '',
  // Giveaways
  giveawaysEnabled:      true,
  giveawayChannelId:     '',
  // Fun commands
  funCommandsEnabled:    true,
  // Minecraft bridge
  bridgeEnabled:         true,
  bridgeChannelId:       '',
  mcApiKey:              'change-me-to-something-secret',
  mcEventsEnabled:       true,
  mcEventsChannelId:     '',
}, _saved.features || {});

// ── Save ───────────────────────────────────────────────────────────────────────
let _saveTimer = null;
function saveDb() {
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => {
    try { fs.writeFileSync(DB_FILE, JSON.stringify({ ...data, counters, features }, null, 2)); }
    catch (e) { console.error('DB save error:', e.message); }
  }, 1500);
}
// Also save on interval as safety net
setInterval(saveDb, 30000);

// ── Helpers ────────────────────────────────────────────────────────────────────
const mkUser = (id) => ({
  id, username: id, level: 1, xp: 0, nextLevelXp: 1000,
  reputation: 0, rank: 'Member', civilization: null,
  religion: null, team: null, cult: null, isRebel: false,
  honors: [], titles: [], lastDaily: null
});

const ensureUser    = (id) => { if (!data.users[id])   data.users[id]   = mkUser(id); return data.users[id]; };
const ensureBalance = (id) => { if (!data.economy[id]) data.economy[id] = 0;          return data.economy[id]; };

const sendToChannel = (channelId, msg) => {
  if (!channelId || !global.botClient) return;
  const ch = global.botClient.channels.cache.get(channelId);
  if (ch) ch.send(msg).catch(() => {});
};

const awardXP = (userId, amount) => {
  const u = ensureUser(userId);
  const prevLevel = u.level;
  u.xp += amount;
  while (u.xp >= u.nextLevelXp) { u.xp -= u.nextLevelXp; u.level++; u.nextLevelXp = u.level * 1000; }
  saveDb();
  if (features.levelupEnabled && u.level > prevLevel) {
    const chId = features.levelupChannelId || features.welcomeChannelId;
    sendToChannel(chId, `⭐ **Level Up!** <@${userId}> reached **Level ${u.level}**! 🎉`);
  }
  return u;
};

// ── Health / Stats ─────────────────────────────────────────────────────────────
app.get('/health', (_, res) => res.json({ status: 'OK' }));

app.get('/api/stats', (_, res) => res.json({
  totalMembers:   Object.keys(data.users).length,
  civilizations:  Object.keys(data.civilizations).length,
  religions:      Object.keys(data.religions).length,
  teams:          Object.keys(data.teams).length,
  cults:          Object.keys(data.cults).length,
  rebels:         Object.keys(data.rebels).length,
  alliances:      Object.values(data.alliances).filter(a => a.type === 'alliance').length,
  wars:           Object.values(data.alliances).filter(a => a.type === 'war').length,
  servers:        Object.keys(data.servers).length,
  events:         Object.keys(data.events).length,
  bounties:       Object.keys(data.bounties).length,
  botOnline:      !!global.botClient?.isReady(),
}));

// ── Features ───────────────────────────────────────────────────────────────────
app.get('/api/features', (_, res) => res.json(features));
app.post('/api/features', (req, res) => {
  Object.assign(features, req.body);
  saveDb();
  res.json({ success: true, features });
});

// ── Discord Channels (for dashboard dropdowns) ─────────────────────────────────
app.get('/api/channels', (_, res) => {
  if (!global.botClient?.isReady()) return res.json([]);
  const channels = [];
  global.botClient.channels.cache.forEach(ch => {
    if (ch.type === 0) { // GUILD_TEXT
      const guild = global.botClient.guilds.cache.get(ch.guildId);
      channels.push({ id: ch.id, name: `#${ch.name}`, guild: guild?.name || 'Unknown' });
    }
  });
  channels.sort((a, b) => a.name.localeCompare(b.name));
  res.json(channels);
});

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
  saveDb();
  res.json({ success: true });
});
app.post('/api/users/:id/reset', (req, res) => {
  if (!data.users[req.params.id]) return res.status(404).json({ error: 'Not found' });
  const u = data.users[req.params.id];
  data.users[req.params.id] = { ...mkUser(u.id), username: u.username };
  data.economy[req.params.id] = 0;
  saveDb();
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
  saveDb();
  res.json({ success: true });
});
app.delete('/api/users/:id/title/:index', (req, res) => {
  if (!data.titles[req.params.id]) return res.status(404).json({ error: 'No titles' });
  data.titles[req.params.id].splice(Number(req.params.index), 1);
  saveDb();
  res.json({ success: true });
});
app.get('/api/users/:id/titles', (req, res) => res.json(data.titles[req.params.id] || []));
app.post('/api/members/join', (req, res) => {
  if (!features.autoRegisterMembers) return res.json({ success: false });
  const { userId } = req.body;
  ensureUser(userId);
  saveDb();
  res.json({ success: true, welcomeEnabled: features.welcomeMessages });
});

// ── Economy ────────────────────────────────────────────────────────────────────
app.get('/api/economy', (_, res) => {
  const lb = Object.entries(data.economy).sort(([,a],[,b]) => b-a).slice(0,50).map(([id,bal]) => ({ id, username: data.users[id]?.username || id, balance: bal }));
  res.json(lb);
});
app.get('/api/economy/:userId', (req, res) => res.json({ userId: req.params.userId, balance: ensureBalance(req.params.userId) }));
app.post('/api/economy/pay', (req, res) => {
  const { fromId, toId, amount } = req.body;
  const amt = Number(amount);
  if (!amt || amt <= 0) return res.status(400).json({ error: 'Invalid amount' });
  ensureBalance(fromId); ensureBalance(toId);
  if (data.economy[fromId] < amt) return res.status(400).json({ error: 'Insufficient funds' });
  data.economy[fromId] -= amt; data.economy[toId] += amt;
  saveDb();
  res.json({ success: true });
});
app.post('/api/economy/daily/:userId', (req, res) => {
  const u = ensureUser(req.params.userId);
  const now = Date.now();
  if (u.lastDaily && now - new Date(u.lastDaily).getTime() < 86400000) return res.status(400).json({ error: 'Already claimed today', next: new Date(new Date(u.lastDaily).getTime() + 86400000) });
  ensureBalance(req.params.userId);
  data.economy[req.params.userId] += features.dailyRewardAmount;
  u.lastDaily = new Date();
  saveDb();
  res.json({ success: true, amount: features.dailyRewardAmount, balance: data.economy[req.params.userId] });
});
app.post('/api/economy/admin/set', (req, res) => {
  const { userId, amount } = req.body;
  ensureUser(userId);
  data.economy[userId] = Number(amount);
  saveDb();
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
  saveDb();
  res.json({ success: true, civilizationId: id, civilization: data.civilizations[id] });
});
app.post('/api/civilizations/:id/join', (req, res) => {
  const { userId } = req.body;
  const civ = data.civilizations[req.params.id];
  if (!civ) return res.status(404).json({ error: 'Not found' });
  if (data.rebels[userId]) delete data.rebels[userId];
  if (!civ.members.includes(userId)) civ.members.push(userId);
  const u = ensureUser(userId); u.civilization = req.params.id; u.isRebel = false;
  saveDb();
  res.json({ success: true, civilization: civ });
});
app.post('/api/civilizations/:id/leave', (req, res) => {
  const { userId } = req.body;
  const civ = data.civilizations[req.params.id];
  if (!civ) return res.status(404).json({ error: 'Not found' });
  civ.members = civ.members.filter(m => m !== userId);
  if (data.users[userId]) { data.users[userId].civilization = null; if (data.users[userId].rank === 'Leader') data.users[userId].rank = 'Member'; }
  saveDb();
  res.json({ success: true, civ });
});
app.post('/api/civilizations/:id/kick', (req, res) => {
  const { leaderId, userId } = req.body;
  const civ = data.civilizations[req.params.id];
  if (!civ) return res.status(404).json({ error: 'Not found' });
  if (String(civ.leaderId) !== String(leaderId)) return res.status(403).json({ error: 'Not the leader' });
  civ.members = civ.members.filter(m => m !== userId);
  if (data.users[userId]) data.users[userId].civilization = null;
  saveDb();
  res.json({ success: true });
});
app.post('/api/civilizations/:id/treasury/deposit', (req, res) => {
  const { userId, amount } = req.body;
  const civ = data.civilizations[req.params.id];
  if (!civ) return res.status(404).json({ error: 'Not found' });
  const amt = Number(amount);
  if (!amt || amt <= 0) return res.status(400).json({ error: 'Invalid amount' });
  ensureBalance(userId);
  if (data.economy[userId] < amt) return res.status(400).json({ error: 'Insufficient funds' });
  data.economy[userId] -= amt;
  civ.treasury = (civ.treasury || 0) + amt;
  saveDb();
  res.json({ success: true, treasury: civ.treasury, balance: data.economy[userId] });
});
app.post('/api/civilizations/:id/treasury/withdraw', (req, res) => {
  const { leaderId, amount } = req.body;
  const civ = data.civilizations[req.params.id];
  if (!civ) return res.status(404).json({ error: 'Not found' });
  if (String(civ.leaderId) !== String(leaderId)) return res.status(403).json({ error: 'Not the leader' });
  const amt = Number(amount);
  if (!amt || amt <= 0) return res.status(400).json({ error: 'Invalid amount' });
  if ((civ.treasury || 0) < amt) return res.status(400).json({ error: 'Insufficient treasury funds' });
  civ.treasury -= amt;
  ensureBalance(leaderId);
  data.economy[leaderId] += amt;
  saveDb();
  res.json({ success: true, treasury: civ.treasury, balance: data.economy[leaderId] });
});
app.delete('/api/civilizations/:id', (req, res) => {
  const civ = data.civilizations[req.params.id];
  if (!civ) return res.status(404).json({ error: 'Not found' });
  civ.members.forEach(uid => { if (data.users[uid]) data.users[uid].civilization = null; });
  delete data.civilizations[req.params.id];
  saveDb();
  res.json({ success: true, discord: { roleId: civ.roleId, categoryId: civ.categoryId, channelId: civ.channelId, leaderChannelId: civ.leaderChannelId } });
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
  saveDb();
  res.json({ success: true });
});
app.delete('/api/rebels/:userId', (req, res) => {
  delete data.rebels[req.params.userId];
  if (data.users[req.params.userId]) { data.users[req.params.userId].isRebel = false; data.users[req.params.userId].rank = 'Member'; }
  saveDb();
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
  saveDb();
  res.json({ success: true, religionId: id, religion: data.religions[id] });
});
app.post('/api/religions/:id/join', (req, res) => {
  const { userId } = req.body;
  const rel = data.religions[req.params.id];
  if (!rel) return res.status(404).json({ error: 'Not found' });
  if (!rel.members.includes(userId)) rel.members.push(userId);
  const u = ensureUser(userId); u.religion = req.params.id;
  saveDb();
  res.json({ success: true, religion: rel });
});
app.post('/api/religions/:id/leave', (req, res) => {
  const { userId } = req.body;
  const rel = data.religions[req.params.id];
  if (!rel) return res.status(404).json({ error: 'Not found' });
  rel.members = rel.members.filter(m => m !== userId);
  if (data.users[userId]) data.users[userId].religion = null;
  saveDb();
  res.json({ success: true });
});
app.post('/api/religions/:id/kick', (req, res) => {
  const { leaderId, userId } = req.body;
  const rel = data.religions[req.params.id];
  if (!rel) return res.status(404).json({ error: 'Not found' });
  if (String(rel.founderId) !== String(leaderId)) return res.status(403).json({ error: 'Not the founder' });
  rel.members = rel.members.filter(m => m !== userId);
  if (data.users[userId]) data.users[userId].religion = null;
  saveDb();
  res.json({ success: true });
});
app.delete('/api/religions/:id', (req, res) => {
  const rel = data.religions[req.params.id];
  if (!rel) return res.status(404).json({ error: 'Not found' });
  rel.members.forEach(uid => { if (data.users[uid]) data.users[uid].religion = null; });
  delete data.religions[req.params.id];
  saveDb();
  res.json({ success: true, discord: { roleId: rel.roleId, categoryId: rel.categoryId, channelId: rel.channelId, leaderChannelId: rel.leaderChannelId } });
});
app.post('/api/religions/:id/bless', (req, res) => {
  const rel = data.religions[req.params.id];
  if (!rel) return res.status(404).json({ error: 'Not found' });
  rel.blessings++;
  saveDb();
  res.json({ success: true, blessings: rel.blessings });
});

// ── Teams ──────────────────────────────────────────────────────────────────────
app.get('/api/teams', (_, res) => res.json(Object.values(data.teams)));
app.post('/api/teams/create', (req, res) => {
  if (!features.teamsEnabled) return res.json({ success: false, message: 'Disabled' });
  const { name, leaderId, color, serverId } = req.body;
  const id = counters.team++;
  data.teams[id] = { id, name, leaderId, color: color || '#0d6efd', serverId, members: leaderId ? [leaderId] : [], points: 0, createdAt: new Date() };
  if (leaderId) { const u = ensureUser(leaderId); u.team = id; }
  saveDb();
  res.json({ success: true, teamId: id, team: data.teams[id] });
});
app.post('/api/teams/:id/join', (req, res) => {
  const { userId } = req.body;
  const team = data.teams[req.params.id];
  if (!team) return res.status(404).json({ error: 'Not found' });
  if (!team.members.includes(userId)) team.members.push(userId);
  const u = ensureUser(userId); u.team = req.params.id;
  saveDb();
  res.json({ success: true, team });
});
app.post('/api/teams/:id/points', (req, res) => {
  const team = data.teams[req.params.id];
  if (!team) return res.status(404).json({ error: 'Not found' });
  team.points += Number(req.body.amount) || 0;
  saveDb();
  res.json({ success: true, points: team.points });
});
app.post('/api/teams/:id/leave', (req, res) => {
  const { userId } = req.body;
  const team = data.teams[req.params.id];
  if (!team) return res.status(404).json({ error: 'Not found' });
  team.members = team.members.filter(m => m !== userId);
  if (data.users[userId]) data.users[userId].team = null;
  saveDb();
  res.json({ success: true });
});
app.post('/api/teams/:id/kick', (req, res) => {
  const { leaderId, userId } = req.body;
  const team = data.teams[req.params.id];
  if (!team) return res.status(404).json({ error: 'Not found' });
  if (String(team.leaderId) !== String(leaderId)) return res.status(403).json({ error: 'Not the leader' });
  team.members = team.members.filter(m => m !== userId);
  if (data.users[userId]) data.users[userId].team = null;
  saveDb();
  res.json({ success: true });
});
app.delete('/api/teams/:id', (req, res) => {
  const team = data.teams[req.params.id];
  if (!team) return res.status(404).json({ error: 'Not found' });
  team.members.forEach(uid => { if (data.users[uid]) data.users[uid].team = null; });
  delete data.teams[req.params.id];
  saveDb();
  res.json({ success: true, discord: { roleId: team.roleId, categoryId: team.categoryId, channelId: team.channelId, leaderChannelId: team.leaderChannelId } });
});

// ── Cults ──────────────────────────────────────────────────────────────────────
app.get('/api/cults', (_, res) => res.json(Object.values(data.cults)));
app.post('/api/cults/create', (req, res) => {
  if (!features.cultsEnabled) return res.json({ success: false, message: 'Disabled' });
  const { name, leaderId, secretObjective, serverId } = req.body;
  const id = counters.cult++;
  data.cults[id] = { id, name, leaderId, secretObjective: secretObjective || 'Unknown', serverId, members: leaderId ? [leaderId] : [], rituals: 0, power: 0, createdAt: new Date() };
  if (leaderId) { const u = ensureUser(leaderId); u.cult = id; }
  saveDb();
  res.json({ success: true, cultId: id, cult: data.cults[id] });
});
app.post('/api/cults/:id/join', (req, res) => {
  const { userId } = req.body;
  const cult = data.cults[req.params.id];
  if (!cult) return res.status(404).json({ error: 'Not found' });
  if (!cult.members.includes(userId)) cult.members.push(userId);
  const u = ensureUser(userId); u.cult = req.params.id;
  saveDb();
  res.json({ success: true, cult });
});
app.post('/api/cults/:id/ritual', (req, res) => {
  const cult = data.cults[req.params.id];
  if (!cult) return res.status(404).json({ error: 'Not found' });
  cult.rituals++; cult.power += 10;
  saveDb();
  res.json({ success: true, rituals: cult.rituals, power: cult.power });
});
app.post('/api/cults/:id/leave', (req, res) => {
  const { userId } = req.body;
  const cult = data.cults[req.params.id];
  if (!cult) return res.status(404).json({ error: 'Not found' });
  cult.members = cult.members.filter(m => m !== userId);
  if (data.users[userId]) data.users[userId].cult = null;
  saveDb();
  res.json({ success: true });
});
app.post('/api/cults/:id/kick', (req, res) => {
  const { leaderId, userId } = req.body;
  const cult = data.cults[req.params.id];
  if (!cult) return res.status(404).json({ error: 'Not found' });
  if (String(cult.leaderId) !== String(leaderId)) return res.status(403).json({ error: 'Not the leader' });
  cult.members = cult.members.filter(m => m !== userId);
  if (data.users[userId]) data.users[userId].cult = null;
  saveDb();
  res.json({ success: true });
});
app.delete('/api/cults/:id', (req, res) => {
  const cult = data.cults[req.params.id];
  if (!cult) return res.status(404).json({ error: 'Not found' });
  cult.members.forEach(uid => { if (data.users[uid]) data.users[uid].cult = null; });
  delete data.cults[req.params.id];
  saveDb();
  res.json({ success: true, discord: { roleId: cult.roleId, categoryId: cult.categoryId, channelId: cult.channelId, leaderChannelId: cult.leaderChannelId } });
});

// ── Alliances & Wars ───────────────────────────────────────────────────────────
app.get('/api/alliances', (_, res) => res.json(Object.values(data.alliances)));
app.post('/api/alliances', (req, res) => {
  if (!features.warsEnabled) return res.json({ success: false, message: 'Disabled' });
  const { type, party1, party2, party1Type, party2Type } = req.body;
  const id = counters.alliance++;
  data.alliances[id] = { id, type, party1, party2, party1Type: party1Type || 'civilization', party2Type: party2Type || 'civilization', createdAt: new Date() };
  saveDb();
  res.json({ success: true, id, alliance: data.alliances[id] });
});
app.delete('/api/alliances/:id', (req, res) => {
  if (!data.alliances[req.params.id]) return res.status(404).json({ error: 'Not found' });
  delete data.alliances[req.params.id];
  saveDb();
  res.json({ success: true });
});

// ── Events ─────────────────────────────────────────────────────────────────────
app.get('/api/events', (_, res) => res.json(Object.values(data.events)));
app.post('/api/events/create', (req, res) => {
  if (!features.eventsEnabled) return res.json({ success: false, message: 'Disabled' });
  const { name, type, serverId } = req.body;
  const id = counters.event++;
  data.events[id] = { id, name, type: type || 'general', serverId, participants: [], status: 'open', reward: 200, createdAt: new Date() };
  saveDb();
  if (features.eventsChannelId)
    sendToChannel(features.eventsChannelId, `📅 **New Event!** **${name}** is now open — type \`!joinevent ${id}\` to enter!`);
  res.json({ success: true, eventId: id, event: data.events[id] });
});
app.post('/api/events/:id/join', (req, res) => {
  const { userId } = req.body;
  const ev = data.events[req.params.id];
  if (!ev) return res.status(404).json({ error: 'Not found' });
  if (ev.status !== 'open') return res.status(400).json({ error: 'Event not open' });
  if (!ev.participants.includes(userId)) ev.participants.push(userId);
  saveDb();
  res.json({ success: true, event: ev });
});
app.post('/api/events/:id/end', (req, res) => {
  const { winnerId } = req.body;
  const ev = data.events[req.params.id];
  if (!ev) return res.status(404).json({ error: 'Not found' });
  ev.status = 'ended'; ev.winner = winnerId; ev.endedAt = new Date();
  if (winnerId) { ensureBalance(winnerId); data.economy[winnerId] += ev.reward; }
  saveDb();
  if (winnerId && features.eventsChannelId)
    sendToChannel(features.eventsChannelId, `🏆 **Event Ended!** <@${winnerId}> won **${ev.name}** and received **${ev.reward} gold**!`);
  res.json({ success: true, event: ev });
});
app.delete('/api/events/:id', (req, res) => {
  if (!data.events[req.params.id]) return res.status(404).json({ error: 'Not found' });
  delete data.events[req.params.id];
  saveDb();
  res.json({ success: true });
});

// ── Bounties ───────────────────────────────────────────────────────────────────
app.get('/api/bounties', (_, res) => res.json(Object.values(data.bounties)));
app.post('/api/bounties', (req, res) => {
  if (!features.bountyEnabled) return res.json({ success: false, message: 'Disabled' });
  const { targetId, amount, placedBy, note } = req.body;
  const amt = Number(amount);
  if (!amt || amt <= 0) return res.status(400).json({ error: 'Invalid amount' });
  ensureBalance(placedBy);
  if (data.economy[placedBy] < amt) return res.status(400).json({ error: 'Insufficient funds' });
  data.economy[placedBy] -= amt;
  if (!data.bounties[targetId]) data.bounties[targetId] = { targetId, amount: 0, placedBy, note: '', createdAt: new Date() };
  data.bounties[targetId].amount += amt;
  data.bounties[targetId].note = note || data.bounties[targetId].note;
  saveDb();
  if (features.bountyChannelId) {
    const targetName = data.users[targetId]?.username || `<@${targetId}>`;
    sendToChannel(features.bountyChannelId, `🎯 **Bounty Posted!** A bounty of **${data.bounties[targetId].amount} gold** has been placed on **${targetName}**!${note ? ` *"${note}"*` : ''}`);
  }
  res.json({ success: true, bounty: data.bounties[targetId] });
});
app.post('/api/bounties/claim', (req, res) => {
  const { targetId, claimerId } = req.body;
  const b = data.bounties[targetId];
  if (!b) return res.status(404).json({ error: 'No bounty on that target' });
  ensureBalance(claimerId);
  data.economy[claimerId] += b.amount;
  const amount = b.amount;
  delete data.bounties[targetId];
  saveDb();
  if (features.bountyChannelId)
    sendToChannel(features.bountyChannelId, `✅ **Bounty Claimed!** <@${claimerId}> claimed **${amount} gold** for taking out <@${targetId}>!`);
  res.json({ success: true, amount });
});
app.delete('/api/bounties/:targetId', (req, res) => {
  delete data.bounties[req.params.targetId];
  saveDb();
  res.json({ success: true });
});

// ── Polls ──────────────────────────────────────────────────────────────────────
app.get('/api/polls', (_, res) => res.json(Object.values(data.polls)));
app.post('/api/polls', (req, res) => {
  if (!features.pollsEnabled) return res.json({ success: false, message: 'Disabled' });
  const { question, options, createdBy } = req.body;
  if (!question || !options?.length) return res.status(400).json({ error: 'Question and options required' });
  const id = counters.poll++;
  const votes = {};
  options.forEach((_, i) => { votes[i] = []; });
  data.polls[id] = { id, question, options, votes, createdBy, createdAt: new Date() };
  saveDb();
  res.json({ success: true, pollId: id, poll: data.polls[id] });
});
app.post('/api/polls/:id/vote', (req, res) => {
  const { userId, optionIndex } = req.body;
  const poll = data.polls[req.params.id];
  if (!poll) return res.status(404).json({ error: 'Not found' });
  const idx = Number(optionIndex);
  if (idx < 0 || idx >= poll.options.length) return res.status(400).json({ error: 'Invalid option' });
  Object.values(poll.votes).forEach(voters => {
    const i = voters.indexOf(userId); if (i !== -1) voters.splice(i, 1);
  });
  poll.votes[idx].push(userId);
  saveDb();
  res.json({ success: true, poll });
});
app.delete('/api/polls/:id', (req, res) => {
  delete data.polls[req.params.id];
  saveDb();
  res.json({ success: true });
});

// ── Servers ────────────────────────────────────────────────────────────────────
app.get('/api/servers', (_, res) => res.json(Object.values(data.servers)));
app.post('/api/servers/setup', (req, res) => {
  const { serverId, serverName } = req.body;
  data.servers[serverId] = { serverId, serverName, setupAt: new Date() };
  saveDb();
  res.json({ success: true });
});
app.delete('/api/servers/:id', (req, res) => {
  if (!data.servers[req.params.id]) return res.status(404).json({ error: 'Not found' });
  delete data.servers[req.params.id];
  saveDb();
  res.json({ success: true });
});

// ── Minecraft Bridge API ───────────────────────────────────────────────────────
const mcAuth = (req, res, next) => {
  const key = req.headers['x-api-key'] || req.body?.apiKey;
  if (key !== features.mcApiKey) return res.status(403).json({ error: 'Invalid API key' });
  next();
};

app.post('/api/mc/chat', mcAuth, (req, res) => {
  const { playerName, content, mcPrefix = '[MC]' } = req.body;
  data.mcServer.online = true;
  data.mcServer.lastSeen = new Date();
  if (features.bridgeEnabled && features.bridgeChannelId && global.botClient) {
    const ch = global.botClient.channels.cache.get(features.bridgeChannelId);
    if (ch) ch.send(`**${mcPrefix} ${playerName}:** ${content}`).catch(() => {});
  }
  res.json({ success: true });
});

app.post('/api/mc/event', mcAuth, (req, res) => {
  const { type, playerName, message, metadata } = req.body;
  data.mcServer.online = true;
  data.mcServer.lastSeen = new Date();
  if (features.mcEventsEnabled && features.mcEventsChannelId && global.botClient) {
    const ch = global.botClient.channels.cache.get(features.mcEventsChannelId);
    if (ch && message) ch.send(message).catch(() => {});
  }
  res.json({ success: true });
});

app.post('/api/mc/players', mcAuth, (req, res) => {
  const { players } = req.body;
  data.mcServer.players = players || [];
  data.mcServer.online = true;
  data.mcServer.lastSeen = new Date();
  saveDb();
  res.json({ success: true });
});

app.get('/api/mc/link/code', (req, res) => {
  const { mcUUID, username } = req.query;
  if (!mcUUID || !username) return res.status(400).json({ error: 'mcUUID and username required' });
  const code = String(Math.floor(100000 + Math.random() * 900000));
  data.linkCodes[code] = { mcUUID, username, expiresAt: new Date(Date.now() + 10 * 60 * 1000) };
  setTimeout(() => delete data.linkCodes[code], 10 * 60 * 1000);
  res.json({ success: true, code });
});

app.post('/api/mc/link/confirm', (req, res) => {
  const { code, discordId } = req.body;
  const entry = data.linkCodes[code];
  if (!entry) return res.status(400).json({ error: 'Invalid or expired code' });
  if (new Date(entry.expiresAt) < new Date()) { delete data.linkCodes[code]; return res.status(400).json({ error: 'Code expired' }); }
  data.linkedAccounts[entry.mcUUID] = discordId;
  data.reverseLinks[discordId] = entry.mcUUID;
  delete data.linkCodes[code];
  saveDb();
  res.json({ success: true, username: entry.username, mcUUID: entry.mcUUID });
});

app.get('/api/mc/linked/:discordId', (req, res) => {
  const mcUUID = data.reverseLinks[req.params.discordId];
  res.json({ linked: !!mcUUID, mcUUID: mcUUID || null });
});

// ── HTTP + WebSocket Server (same port, path /ws) ──────────────────────────────
const http = require('http');
const { WebSocketServer } = require('ws');
const API_PORT = process.env.PORT || 3001;

global.mcWsClients = global.mcWsClients || new Set();

const httpServer = http.createServer(app);

const wss = new WebSocketServer({ noServer: true });

httpServer.on('upgrade', (req, socket, head) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (pathname === '/ws') {
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  } else {
    socket.destroy();
  }
});

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, 'http://localhost');
  const apiKey = url.searchParams.get('apiKey')
    || req.headers['x-api-key']
    || req.headers['authorization']?.replace('Bearer ', '');
  if (apiKey !== features.mcApiKey) { ws.close(1008, 'Unauthorized'); return; }

  global.mcWsClients.add(ws);
  data.mcServer.online = true;
  data.mcServer.lastSeen = new Date();
  console.log('🎮 Minecraft plugin connected via WebSocket');

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }

    if (msg.type === 'mc_chat' && features.bridgeEnabled && features.bridgeChannelId && global.botClient) {
      const ch = global.botClient.channels.cache.get(features.bridgeChannelId);
      if (ch) ch.send(`🎮 **[MC] ${msg.playerName}:** ${msg.content}`).catch(() => {});
    } else if (msg.type === 'mc_event' && features.mcEventsEnabled && features.mcEventsChannelId && global.botClient) {
      const ch = global.botClient.channels.cache.get(features.mcEventsChannelId);
      if (ch && msg.message) ch.send(msg.message).catch(() => {});
    } else if (msg.type === 'mc_players') {
      data.mcServer.players = msg.players || [];
      saveDb();
    }
  });

  ws.on('close', () => {
    global.mcWsClients.delete(ws);
    if (global.mcWsClients.size === 0) {
      data.mcServer.online = false;
      saveDb();
    }
  });

  ws.on('error', () => global.mcWsClients.delete(ws));
});

httpServer.listen(API_PORT, () => console.log(`🌐 API + WebSocket on port ${API_PORT} (ws path: /ws)`));

// ── Discord Bot ────────────────────────────────────────────────────────────────
const token = process.env.DISCORD_BOT_TOKEN || process.env.DISCORD_TOKEN;
if (!token) { console.error('❌ DISCORD_BOT_TOKEN not set'); process.exit(1); }

const { Client, GatewayIntentBits, Events, PermissionsBitField, ChannelType } = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

global.botClient = client;

// ── Discord Helpers ────────────────────────────────────────────────────────────
const post = (path, body) => fetch(`http://localhost:${API_PORT}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json());
const call = (path) => fetch(`http://localhost:${API_PORT}${path}`).then(r => r.json());

const assignRole = async (guild, userId, roleId) => {
  try { const m = await guild.members.fetch(userId); await m.roles.add(roleId); } catch (_) {}
};
const removeRole = async (guild, userId, roleId) => {
  try { const m = await guild.members.fetch(userId); await m.roles.remove(roleId); } catch (_) {}
};

const GROUP_COLORS = { civilization: 0x3498db, religion: 0xf1c40f, team: 0x2ecc71, cult: 0x9b59b6 };
const GROUP_EMOJIS = { civilization: '🏛️', religion: '✝️', team: '🛡️', cult: '🌑' };

const setupDiscordGroup = async (guild, type, name, leaderId) => {
  try {
    const role = await guild.roles.create({ name: `${GROUP_EMOJIS[type]} ${name}`, color: GROUP_COLORS[type], reason: `CivBot ${type}` });
    const category = await guild.channels.create({
      name: `${GROUP_EMOJIS[type]} ${name}`, type: ChannelType.GuildCategory,
      permissionOverwrites: [
        { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
        { id: role.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
      ],
    });
    const channel = await guild.channels.create({
      name: `${type}-general`, type: ChannelType.GuildText, parent: category.id,
      permissionOverwrites: [
        { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
        { id: role.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
      ],
    });
    let leaderChannel = null;
    if (type === 'cult' || type === 'civilization') {
      leaderChannel = await guild.channels.create({
        name: type === 'cult' ? 'inner-circle' : 'leadership', type: ChannelType.GuildText, parent: category.id,
        permissionOverwrites: [
          { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
          { id: role.id, deny: [PermissionsBitField.Flags.ViewChannel] },
          { id: leaderId, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
        ],
      });
    }
    await assignRole(guild, leaderId, role.id);
    return { roleId: role.id, categoryId: category.id, channelId: channel.id, leaderChannelId: leaderChannel?.id || null };
  } catch (e) { console.error('Discord setup error:', e.message); return null; }
};

const teardownDiscordGroup = async (guild, meta) => {
  for (const id of [meta.leaderChannelId, meta.channelId, meta.categoryId]) {
    if (id) { try { const c = guild.channels.cache.get(id); if (c) await c.delete(); } catch (_) {} }
  }
  if (meta.roleId) { try { const r = guild.roles.cache.get(meta.roleId); if (r) await r.delete(); } catch (_) {} }
};

const grantLeaderAccess = async (guild, userId, type, groupId) => {
  const store = { civilization: data.civilizations, religion: data.religions, team: data.teams, cult: data.cults };
  const group = store[type]?.[groupId];
  if (!group?.leaderChannelId) return;
  try {
    const ch = guild.channels.cache.get(group.leaderChannelId);
    if (ch) await ch.permissionOverwrites.create(userId, { ViewChannel: true, SendMessages: true });
  } catch (_) {}
};

// ── Bot Events ────────────────────────────────────────────────────────────────

// ── Giveaway helpers ───────────────────────────────────────────────────────────
function parseDuration(str) {
  const map = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
  const match = str.match(/^(\d+)(s|m|h|d)$/i);
  if (!match) return null;
  return parseInt(match[1]) * map[match[2].toLowerCase()];
}

function formatDuration(ms) {
  if (ms >= 86400000) return `${Math.round(ms / 86400000)}d`;
  if (ms >= 3600000)  return `${Math.round(ms / 3600000)}h`;
  if (ms >= 60000)    return `${Math.round(ms / 60000)}m`;
  return `${Math.round(ms / 1000)}s`;
}

async function endGiveaway(giveaway, reroll = false) {
  const ch = global.botClient?.channels.cache.get(giveaway.channelId);
  if (!ch) return;
  let msg;
  try { msg = await ch.messages.fetch(giveaway.messageId); } catch { return; }

  let entrantIds = [];

  if (giveaway.mode === 'auto') {
    // Auto mode: everyone registered in the bot at time of draw
    const guild = global.botClient?.guilds.cache.get(giveaway.guildId);
    if (guild) {
      try {
        const members = await guild.members.fetch();
        entrantIds = [...members.values()].filter(m => !m.user.bot).map(m => m.id);
      } catch {
        entrantIds = Object.keys(data.users);
      }
    } else {
      entrantIds = Object.keys(data.users);
    }
  } else {
    // React mode: only people who reacted 🎉
    const reaction = msg.reactions.cache.get('🎉');
    try {
      const fetched = await reaction?.users.fetch();
      entrantIds = fetched ? [...fetched.values()].filter(u => !u.bot).map(u => u.id) : [];
    } catch {}
  }

  if (!entrantIds.length) {
    msg.edit(`🎉 **GIVEAWAY ENDED**\n**Prize:** ${giveaway.prize}\nNo valid entries — no winner this time.`).catch(() => {});
    giveaway.ended = true; saveDb(); return;
  }

  const winnerId = entrantIds[Math.floor(Math.random() * entrantIds.length)];
  giveaway.ended = true;
  giveaway.winnerId = winnerId;
  saveDb();

  msg.edit(`🎉 **GIVEAWAY ENDED**\n**Prize:** ${giveaway.prize}\n🏆 Winner: <@${winnerId}>\nHosted by <@${giveaway.hostId}>`).catch(() => {});
  ch.send(reroll
    ? `🔄 Rerolled! New winner: <@${winnerId}> wins **${giveaway.prize}**! 🎉`
    : `🎊 Congratulations <@${winnerId}>! You won **${giveaway.prize}**!`
  ).catch(() => {});
}

function scheduleGiveaway(giveaway) {
  const delay = new Date(giveaway.endsAt) - Date.now();
  if (delay <= 0) { endGiveaway(giveaway); return; }
  setTimeout(() => endGiveaway(giveaway), Math.min(delay, 2147483647));
}

client.once(Events.ClientReady, (c) => {
  console.log(`✅ Discord bot logged in as ${c.user.tag}`);
  c.guilds.cache.forEach(g => { if (!data.servers[g.id]) data.servers[g.id] = { serverId: g.id, serverName: g.name, setupAt: new Date() }; });
  // Reschedule any active giveaways that survived a restart
  Object.values(data.giveaways).forEach(g => { if (!g.ended) scheduleGiveaway(g); });
  saveDb();
});

client.on(Events.GuildMemberAdd, async (member) => {
  if (!features.autoRegisterMembers) return;
  await post('/api/members/join', { userId: member.id, serverId: member.guild.id });
  if (features.welcomeMessages) {
    const chId = features.welcomeChannelId;
    if (chId) {
      const ch = member.guild.channels.cache.get(chId);
      if (ch) ch.send(`👋 Welcome to **${member.guild.name}**, <@${member.id}>! Type \`!help\` to see what you can do.`).catch(() => {});
    } else {
      const sys = member.guild.systemChannel;
      if (sys) sys.send(`👋 Welcome to **${member.guild.name}**, <@${member.id}>! Type \`!help\` to see what you can do.`).catch(() => {});
    }
  }
});

client.on(Events.GuildMemberRemove, async (member) => {
  if (features.welcomeMessages) {
    const chId = features.welcomeChannelId;
    if (chId) {
      const ch = member.guild.channels.cache.get(chId);
      if (ch) ch.send(`👋 **${member.user.username}** has left the server.`).catch(() => {});
    }
  }
});

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;

  // Bridge: Discord → Minecraft
  if (features.bridgeEnabled && features.bridgeChannelId && message.channel.id === features.bridgeChannelId) {
    if (global.mcWsClients?.size > 0) {
      const payload = JSON.stringify({ type: 'discord_chat', author: message.author.username, content: message.content });
      global.mcWsClients.forEach(ws => { if (ws.readyState === 1) ws.send(payload); });
    }
  }

  if (!features.commandsEnabled) return;

  const prefix = '!';
  if (!message.content.startsWith(prefix)) {
    if (features.xpEnabled) await post(`/api/users/${message.author.id}/xp`, { amount: features.xpPerMessage });
    return;
  }

  const args = message.content.slice(prefix.length).trim().split(/\s+/);
  const cmd  = args.shift().toLowerCase();
  const reply = (msg) => message.reply(msg);
  const guild = message.guild;

  // ── Profile ──────────────────────────────────────────────────────────────────
  if (cmd === 'profile') {
    const u = await call(`/api/users/${message.author.id}`);
    const bal = await call(`/api/economy/${message.author.id}`);
    const titles = await call(`/api/users/${message.author.id}/titles`);
    const civName  = u.civilization && data.civilizations[u.civilization]  ? data.civilizations[u.civilization].name  : 'None';
    const relName  = u.religion     && data.religions[u.religion]          ? data.religions[u.religion].name          : 'None';
    const teamName = u.team         && data.teams[u.team]                  ? data.teams[u.team].name                  : 'None';
    const cultName = u.cult         && data.cults[u.cult]                  ? `🌑 ${data.cults[u.cult].name}`           : 'None';
    const bounty   = data.bounties[message.author.id];
    reply(
      `**${message.author.username}'s Profile** ${u.isRebel ? '⚔️ REBEL' : ''}\n` +
      `Level: **${u.level}** | XP: ${u.xp}/${u.nextLevelXp} | Rep: ${u.reputation}\n` +
      `Rank: ${u.rank} | 💰 Gold: **${bal.balance}**\n` +
      `🏛️ Civilization: ${civName}\n` +
      `✝️ Religion: ${relName}\n` +
      `🛡️ Team: ${teamName}\n` +
      `🌑 Cult: ${cultName}` +
      (bounty ? `\n🎯 **WANTED: ${bounty.amount} gold bounty**` : '') +
      (titles.length ? `\n🏅 Titles: ${titles.map(t => t.title).join(', ')}` : '')
    );
  }

  // ── Economy ──────────────────────────────────────────────────────────────────
  else if (cmd === 'balance' || cmd === 'bal') {
    if (!features.economyEnabled) return reply('❌ Economy is disabled.');
    const b = await call(`/api/economy/${message.author.id}`);
    reply(`💰 Your balance: **${b.balance} gold**`);
  }
  else if (cmd === 'daily') {
    if (!features.economyEnabled) return reply('❌ Economy is disabled.');
    const r = await post(`/api/economy/daily/${message.author.id}`, {});
    if (r.error) reply(`❌ ${r.error}`);
    else reply(`💰 Claimed daily reward: **+${r.amount} gold**! Balance: **${r.balance} gold**`);
  }
  else if (cmd === 'pay') {
    if (!features.economyEnabled) return reply('❌ Economy is disabled.');
    const [target, amtStr] = args;
    if (!target || !amtStr) return reply('Usage: !pay @user <amount>');
    const userId = target.replace(/[<@!>]/g, '');
    const r = await post('/api/economy/pay', { fromId: message.author.id, toId: userId, amount: Number(amtStr) });
    if (r.error) reply(`❌ ${r.error}`);
    else reply(`✅ Paid **${amtStr} gold** to <@${userId}>`);
  }
  else if (cmd === 'leaderboard' || cmd === 'lb') {
    if (!features.economyEnabled) return reply('❌ Economy is disabled.');
    const lb = await call('/api/economy');
    if (!lb.length) return reply('No economy data yet.');
    reply(`**💰 Gold Leaderboard:**\n${lb.slice(0, 10).map((e, i) => `${i + 1}. <@${e.id}> — ${e.balance} gold`).join('\n')}`);
  }

  // ── Bounties ─────────────────────────────────────────────────────────────────
  else if (cmd === 'bounty') {
    if (!features.bountyEnabled) return reply('❌ Bounties are disabled.');
    const target = args[0]; const amtStr = args[1]; const note = args.slice(2).join(' ');
    if (!target || !amtStr) return reply('Usage: `!bounty @user <amount> [reason]`');
    const targetId = target.replace(/[<@!>]/g, '');
    const r = await post('/api/bounties', { targetId, amount: Number(amtStr), placedBy: message.author.id, note });
    if (r.error) reply(`❌ ${r.error}`);
    else reply(`🎯 Bounty of **${amtStr} gold** placed on <@${targetId}>!${note ? ` *"${note}"*` : ''}`);
  }
  else if (cmd === 'bounties') {
    if (!features.bountyEnabled) return reply('❌ Bounties are disabled.');
    const blist = Object.values(data.bounties);
    if (!blist.length) return reply('No active bounties.');
    reply(`**🎯 Active Bounties:**\n${blist.map(b => `• <@${b.targetId}> — **${b.amount} gold**${b.note ? ` *(${b.note})*` : ''}`).join('\n')}`);
  }
  else if (cmd === 'claimbounty') {
    if (!features.bountyEnabled) return reply('❌ Bounties are disabled.');
    const target = args[0];
    if (!target) return reply('Usage: `!claimbounty @user`');
    const targetId = target.replace(/[<@!>]/g, '');
    const r = await post('/api/bounties/claim', { targetId, claimerId: message.author.id });
    if (r.error) reply(`❌ ${r.error}`);
    else reply(`✅ You claimed the bounty on <@${targetId}> and received **${r.amount} gold**!`);
  }

  // ── Polls ─────────────────────────────────────────────────────────────────────
  else if (cmd === 'poll') {
    if (!features.pollsEnabled) return reply('❌ Polls are disabled.');
    const parts = args.join(' ').split('|').map(s => s.trim()).filter(Boolean);
    if (parts.length < 3) return reply('Usage: `!poll <question> | <option1> | <option2> [| more options]`');
    const question = parts[0];
    const options  = parts.slice(1);
    const r = await post('/api/polls', { question, options, createdBy: message.author.id });
    if (r.error) { reply(`❌ ${r.error}`); return; }

    const LETTERS = ['🇦','🇧','🇨','🇩','🇪','🇫'];
    const pollCh = features.pollsChannelId ? guild?.channels.cache.get(features.pollsChannelId) : message.channel;
    const target = pollCh || message.channel;
    const pollMsg = await target.send(
      `**📊 Poll #${r.pollId}** — *${question}*\n` +
      options.map((o, i) => `${LETTERS[i]} ${o}`).join('\n') +
      `\nType \`!vote ${r.pollId} <A/B/C...>\` to vote!`
    );
    data.polls[r.pollId].messageId = pollMsg.id;
    saveDb();
    if (pollCh && pollCh.id !== message.channel.id) reply(`📊 Poll created in ${pollCh}!`);
  }
  else if (cmd === 'vote') {
    if (!features.pollsEnabled) return reply('❌ Polls are disabled.');
    const [pollIdStr, optStr] = args;
    if (!pollIdStr || !optStr) return reply('Usage: `!vote <pollId> <A/B/C...>`');
    const poll = data.polls[pollIdStr];
    if (!poll) return reply('❌ Poll not found.');
    const LETTERS = ['A','B','C','D','E','F'];
    const idx = LETTERS.indexOf(optStr.toUpperCase());
    if (idx === -1 || idx >= poll.options.length) return reply(`❌ Valid options: ${LETTERS.slice(0, poll.options.length).join(', ')}`);
    await post(`/api/polls/${pollIdStr}/vote`, { userId: message.author.id, optionIndex: idx });
    reply(`✅ Voted **${LETTERS[idx]}** (${poll.options[idx]}) in poll #${pollIdStr}!`);
  }
  else if (cmd === 'pollresults') {
    const pollIdStr = args[0];
    if (!pollIdStr) return reply('Usage: `!pollresults <pollId>`');
    const poll = data.polls[pollIdStr];
    if (!poll) return reply('❌ Poll not found.');
    const LETTERS = ['🇦','🇧','🇨','🇩','🇪','🇫'];
    const total = Object.values(poll.votes).reduce((s, v) => s + v.length, 0);
    const lines = poll.options.map((o, i) => {
      const count = poll.votes[i]?.length || 0;
      const pct = total ? Math.round((count / total) * 100) : 0;
      const bar = '█'.repeat(Math.round(pct / 10)) + '░'.repeat(10 - Math.round(pct / 10));
      return `${LETTERS[i]} ${o}\n  ${bar} ${count} votes (${pct}%)`;
    });
    reply(`**📊 Poll Results: ${poll.question}**\n${lines.join('\n')}\n*${total} total vote(s)*`);
  }

  // ── Giveaways ─────────────────────────────────────────────────────────────────
  else if (cmd === 'giveaway' || cmd === 'gw') {
    if (!features.giveawaysEnabled) return reply('❌ Giveaways are disabled.');
    const sub = args[0]?.toLowerCase();

    // !giveaway end [messageId]  — end a giveaway early
    if (sub === 'end' || sub === 'cancel') {
      const msgId = args[1] || Object.values(data.giveaways).find(g => !g.ended)?.messageId;
      const gw = data.giveaways[msgId];
      if (!gw || gw.ended) return reply('❌ No active giveaway found with that ID.');
      await endGiveaway(gw);
      return;
    }

    // !giveaway reroll [messageId]
    if (sub === 'reroll') {
      const msgId = args[1] || Object.values(data.giveaways).findLast(g => g.ended)?.messageId;
      const gw = data.giveaways[msgId];
      if (!gw) return reply('❌ No giveaway found with that ID.');
      gw.ended = false;
      await endGiveaway(gw, true);
      return;
    }

    // !giveaway [auto|react] <duration> <prize...>
    // Detect optional mode keyword
    let mode = 'react'; // default
    let argOffset = 0;
    if (sub === 'auto' || sub === 'react') {
      mode = sub;
      argOffset = 1;
    }

    const durStr = args[argOffset];
    const prize = args.slice(argOffset + 1).join(' ');

    if (!durStr || !prize) {
      return reply(
        '**Usage:**\n' +
        '`!giveaway <duration> <prize>` — members must react 🎉 to enter\n' +
        '`!giveaway auto <duration> <prize>` — everyone is entered automatically\n' +
        '`!giveaway react <duration> <prize>` — same as default (react to enter)\n\n' +
        '**Examples:** `!giveaway 1h 500 gold` · `!giveaway auto 30m Legendary Title`\n' +
        '**Duration:** `30s` `5m` `2h` `1d`'
      );
    }

    const duration = parseDuration(durStr);
    if (!duration) return reply('❌ Invalid duration. Use format like `30s`, `5m`, `2h`, `1d`.');
    if (duration < 5000) return reply('❌ Minimum duration is 5 seconds.');
    if (duration > 7 * 86400000) return reply('❌ Maximum duration is 7 days.');

    const endsAt = new Date(Date.now() + duration);
    const chId = features.giveawayChannelId || message.channel.id;
    const ch = message.guild?.channels.cache.get(chId) || message.channel;

    const modeLabel = mode === 'auto'
      ? '🤖 **Auto-entry** — everyone in the server is entered automatically!'
      : '🎉 React with **🎉** to enter!';

    const gwMsg = await ch.send(
      `🎉 **GIVEAWAY** 🎉\n\n` +
      `**Prize:** ${prize}\n` +
      `**Ends:** <t:${Math.floor(endsAt / 1000)}:R> (<t:${Math.floor(endsAt / 1000)}:f>)\n` +
      `**Hosted by:** <@${message.author.id}>\n\n` +
      modeLabel
    );
    if (mode === 'react') await gwMsg.react('🎉');

    const gw = {
      messageId: gwMsg.id, channelId: ch.id, guildId: message.guild?.id,
      prize, hostId: message.author.id, mode,
      endsAt: endsAt.toISOString(), ended: false, winnerId: null
    };
    data.giveaways[gwMsg.id] = gw;
    saveDb();
    scheduleGiveaway(gw);

    if (ch.id !== message.channel.id) reply(`✅ ${mode === 'auto' ? '🤖 Auto-entry' : '🎉 React-to-enter'} giveaway started in <#${ch.id}>!`);
  }

  // ── Fun Commands ──────────────────────────────────────────────────────────────
  else if (cmd === 'coinflip' || cmd === 'flip') {
    if (!features.funCommandsEnabled) return;
    reply(`🪙 **${Math.random() < 0.5 ? 'Heads' : 'Tails'}!**`);
  }
  else if (cmd === 'roll') {
    if (!features.funCommandsEnabled) return;
    const sides = Math.max(2, Math.min(10000, parseInt(args[0]) || 6));
    const result = Math.floor(Math.random() * sides) + 1;
    reply(`🎲 Rolled a d${sides}: **${result}**`);
  }
  else if (cmd === '8ball') {
    if (!features.funCommandsEnabled) return;
    const ANSWERS = ['It is certain.','It is decidedly so.','Without a doubt.','Yes definitely.','You may rely on it.',
      'As I see it, yes.','Most likely.','Outlook good.','Yes.','Signs point to yes.',
      'Reply hazy, try again.','Ask again later.','Better not tell you now.','Cannot predict now.','Concentrate and ask again.',
      "Don't count on it.",'My reply is no.','My sources say no.','Outlook not so good.','Very doubtful.'];
    const q = args.join(' ');
    if (!q) return reply('Usage: `!8ball <question>`');
    reply(`🎱 *${q}*\n**${ANSWERS[Math.floor(Math.random() * ANSWERS.length)]}**`);
  }
  else if (cmd === 'rps') {
    if (!features.funCommandsEnabled) return;
    const CHOICES = ['rock','paper','scissors'];
    const EMOJI = { rock:'🪨', paper:'📄', scissors:'✂️' };
    const player = args[0]?.toLowerCase();
    if (!CHOICES.includes(player)) return reply('Usage: `!rps rock|paper|scissors`');
    const bot = CHOICES[Math.floor(Math.random() * 3)];
    const beats = { rock: 'scissors', paper: 'rock', scissors: 'paper' };
    const result = player === bot ? 'Tie!' : beats[player] === bot ? 'You win! 🎉' : 'You lose! 😢';
    reply(`${EMOJI[player]} vs ${EMOJI[bot]} — **${result}**`);
  }

  // ── Civilizations ─────────────────────────────────────────────────────────────
  else if (cmd === 'createciv') {
    if (!features.civilizationsEnabled) return reply('❌ Civilizations are disabled.');
    const name = args.join(' ');
    if (!name) return reply('Usage: !createciv <name>');
    const r = await post('/api/civilizations/create', { name, leaderId: message.author.id, serverId: guild?.id });
    if (!r.success) return reply(`❌ ${r.message}`);
    if (guild) {
      reply(`✅ Civilization **${name}** created! (ID: ${r.civilizationId}) — Setting up Discord channels…`);
      const discord = await setupDiscordGroup(guild, 'civilization', name, message.author.id);
      if (discord) {
        Object.assign(data.civilizations[r.civilizationId], discord);
        saveDb();
        const ch = guild.channels.cache.get(discord.channelId);
        if (ch) ch.send(`🏛️ Welcome to **${name}**! This is your civilization's private channel.\nRole: <@&${discord.roleId}> | Leader: <@${message.author.id}>`);
      }
    } else {
      reply(`✅ Civilization **${name}** created! (ID: ${r.civilizationId})`);
    }
  }
  else if (cmd === 'joinciv') {
    const id = args[0];
    if (!id) return reply('Usage: !joinciv <id>');
    const r = await post(`/api/civilizations/${id}/join`, { userId: message.author.id });
    if (r.error) return reply(`❌ ${r.error}`);
    if (guild && data.civilizations[id]?.roleId) await assignRole(guild, message.author.id, data.civilizations[id].roleId);
    reply(`✅ Joined civilization **${r.civilization.name}**!`);
  }
  else if (cmd === 'civs') {
    const civs = await call('/api/civilizations');
    if (!civs.length) return reply('No civilizations yet.');
    reply(`**🏛️ Civilizations:**\n${civs.map(c => `• **${c.name}** (ID: ${c.id}) — ${c.members.length} members${c.roleId ? ` | <@&${c.roleId}>` : ''}`).join('\n')}`);
  }

  // ── Rebels ────────────────────────────────────────────────────────────────────
  else if (cmd === 'rebel') {
    const u = data.users[message.author.id];
    const oldCivId = u?.civilization;
    const reason = args.join(' ');
    const r = await post('/api/rebels', { userId: message.author.id, reason });
    if (r.error) return reply(`❌ ${r.error}`);
    if (guild && oldCivId && data.civilizations[oldCivId]?.roleId)
      await removeRole(guild, message.author.id, data.civilizations[oldCivId].roleId);
    reply(`⚔️ You have rebelled! You are now a free agent.`);
  }
  else if (cmd === 'rebels') {
    const rebels = await call('/api/rebels');
    if (!rebels.length) return reply('No rebels.');
    reply(`**⚔️ Rebels:**\n${rebels.map(r => `• <@${r.userId}> (from Civ ${r.fromCivId}): ${r.reason}`).join('\n')}`);
  }

  // ── Religions ─────────────────────────────────────────────────────────────────
  else if (cmd === 'foundreligion') {
    if (!features.religionsEnabled) return reply('❌ Religions are disabled.');
    const parts = args.join(' ').split('|');
    const name = parts[0]?.trim(); const doctrine = parts[1]?.trim() || '';
    if (!name) return reply('Usage: !foundreligion <name> | <doctrine>');
    const r = await post('/api/religions/create', { name, doctrine, founderId: message.author.id, serverId: guild?.id });
    if (!r.success) return reply(`❌ ${r.message}`);
    if (guild) {
      reply(`✝️ Religion **${name}** founded! (ID: ${r.religionId}) — Setting up Discord channels…`);
      const discord = await setupDiscordGroup(guild, 'religion', name, message.author.id);
      if (discord) {
        Object.assign(data.religions[r.religionId], discord);
        saveDb();
        const ch = guild.channels.cache.get(discord.channelId);
        if (ch) ch.send(`✝️ Welcome to **${name}**!\n${doctrine ? `*"${doctrine}"*\n` : ''}Role: <@&${discord.roleId}> | High Priest: <@${message.author.id}>`);
      }
    } else {
      reply(`✝️ Religion **${name}** founded! (ID: ${r.religionId})`);
    }
  }
  else if (cmd === 'joinreligion') {
    const id = args[0];
    if (!id) return reply('Usage: !joinreligion <id>');
    const r = await post(`/api/religions/${id}/join`, { userId: message.author.id });
    if (r.error) return reply(`❌ ${r.error}`);
    if (guild && data.religions[id]?.roleId) await assignRole(guild, message.author.id, data.religions[id].roleId);
    reply(`✝️ You have converted to **${r.religion.name}**!`);
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
  else if (cmd === 'leavereligion') {
    const u = data.users[message.author.id];
    const relId = u?.religion;
    if (!relId) return reply('❌ You have no religion.');
    const rel = data.religions[relId];
    await post(`/api/religions/${relId}/leave`, { userId: message.author.id });
    if (guild && rel?.roleId) await removeRole(guild, message.author.id, rel.roleId);
    reply(`✝️ You have renounced **${rel?.name || 'your religion'}**.`);
  }

  // ── Teams ─────────────────────────────────────────────────────────────────────
  else if (cmd === 'createteam') {
    if (!features.teamsEnabled) return reply('❌ Teams are disabled.');
    const name = args.join(' ');
    if (!name) return reply('Usage: !createteam <name>');
    const r = await post('/api/teams/create', { name, leaderId: message.author.id, serverId: guild?.id });
    if (!r.success) return reply(`❌ ${r.message}`);
    if (guild) {
      reply(`🛡️ Team **${name}** created! (ID: ${r.teamId}) — Setting up Discord channels…`);
      const discord = await setupDiscordGroup(guild, 'team', name, message.author.id);
      if (discord) {
        Object.assign(data.teams[r.teamId], discord);
        saveDb();
        const ch = guild.channels.cache.get(discord.channelId);
        if (ch) ch.send(`🛡️ Welcome to team **${name}**!\nRole: <@&${discord.roleId}> | Captain: <@${message.author.id}>`);
      }
    } else {
      reply(`🛡️ Team **${name}** created! (ID: ${r.teamId})`);
    }
  }
  else if (cmd === 'jointeam') {
    const id = args[0];
    if (!id) return reply('Usage: !jointeam <id>');
    const r = await post(`/api/teams/${id}/join`, { userId: message.author.id });
    if (r.error) return reply(`❌ ${r.error}`);
    if (guild && data.teams[id]?.roleId) await assignRole(guild, message.author.id, data.teams[id].roleId);
    reply(`🛡️ Joined team **${r.team.name}**!`);
  }
  else if (cmd === 'teams') {
    const teams = await call('/api/teams');
    if (!teams.length) return reply('No teams yet.');
    reply(`**🛡️ Teams:**\n${teams.map(t => `• **${t.name}** (ID: ${t.id}) — ${t.members.length} members | ${t.points} pts`).join('\n')}`);
  }
  else if (cmd === 'leaveteam') {
    const u = data.users[message.author.id];
    const teamId = u?.team;
    if (!teamId) return reply('❌ You are not on a team.');
    const team = data.teams[teamId];
    if (String(team?.leaderId) === String(message.author.id)) return reply('❌ Captains cannot leave — use `!disband`.');
    await post(`/api/teams/${teamId}/leave`, { userId: message.author.id });
    if (guild && team?.roleId) await removeRole(guild, message.author.id, team.roleId);
    reply(`🛡️ You have left team **${team?.name || 'your team'}**.`);
  }

  // ── Cults ─────────────────────────────────────────────────────────────────────
  else if (cmd === 'foundcult') {
    if (!features.cultsEnabled) return reply('❌ Cults are disabled.');
    const parts = args.join(' ').split('|');
    const name = parts[0]?.trim(); const secretObjective = parts[1]?.trim() || 'World domination';
    if (!name) return reply('Usage: !foundcult <name> | <secret objective>');
    const r = await post('/api/cults/create', { name, secretObjective, leaderId: message.author.id, serverId: guild?.id });
    if (!r.success) return reply(`❌ ${r.message}`);
    if (guild) {
      try {
        await message.author.send(`🌑 Your cult **${name}** has been founded. (ID: ${r.cultId})\nSecret Objective: *${secretObjective}*\nSetting up your private channels now…`);
        await message.delete().catch(() => {});
      } catch (_) { reply(`🌑 Cult **${name}** founded secretly. (ID: ${r.cultId})`); }
      const discord = await setupDiscordGroup(guild, 'cult', name, message.author.id);
      if (discord) {
        Object.assign(data.cults[r.cultId], discord);
        saveDb();
        const leaderCh = guild.channels.cache.get(discord.leaderChannelId);
        if (leaderCh) leaderCh.send(`🌑 **${name}** is established.\n*Secret Objective: ${secretObjective}*\nOnly you can see this channel.`);
      }
    } else { reply(`🌑 Cult **${name}** founded! (ID: ${r.cultId})`); }
  }
  else if (cmd === 'joincult') {
    const id = args[0];
    if (!id) return reply('Usage: !joincult <id>');
    const r = await post(`/api/cults/${id}/join`, { userId: message.author.id });
    if (r.error) return reply(`❌ ${r.error}`);
    if (guild && data.cults[id]?.roleId) await assignRole(guild, message.author.id, data.cults[id].roleId);
    reply(`🌑 You have been initiated into **${r.cult.name}**...`);
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
  else if (cmd === 'leavecult') {
    const u = data.users[message.author.id];
    const cultId = u?.cult;
    if (!cultId) return reply('❌ You are not in a cult.');
    const cult = data.cults[cultId];
    if (String(cult?.leaderId) === String(message.author.id)) return reply('❌ The leader cannot abandon the cult — use `!disband`.');
    await post(`/api/cults/${cultId}/leave`, { userId: message.author.id });
    if (guild && cult?.roleId) await removeRole(guild, message.author.id, cult.roleId);
    reply(`🌑 You have defected from **${cult?.name || 'the cult'}**. They will not forget.`);
  }

  // ── Leave Civ ─────────────────────────────────────────────────────────────────
  else if (cmd === 'leaveciv') {
    const u = data.users[message.author.id];
    const civId = u?.civilization;
    if (!civId) return reply('❌ You are not in a civilization.');
    const civ = data.civilizations[civId];
    if (String(civ?.leaderId) === String(message.author.id)) return reply('❌ Leaders cannot leave — use `!disband`.');
    await post(`/api/civilizations/${civId}/leave`, { userId: message.author.id });
    if (guild && civ?.roleId) await removeRole(guild, message.author.id, civ.roleId);
    reply(`✅ You have left **${civ?.name || 'your civilization'}**.`);
  }

  // ── Kick ──────────────────────────────────────────────────────────────────────
  else if (cmd === 'kick') {
    const target = args[0];
    if (!target) return reply('Usage: !kick @user');
    const targetId = target.replace(/[<@!>]/g, '');
    const u = data.users[message.author.id];
    const stores = { civilization: data.civilizations, religion: data.religions, team: data.teams, cult: data.cults };
    const leaderKeys = { civilization: 'leaderId', religion: 'founderId', team: 'leaderId', cult: 'leaderId' };
    const apiKeys   = { civilization: 'civilizations', religion: 'religions', team: 'teams', cult: 'cults' };
    let kicked = false;
    for (const gt of Object.keys(stores)) {
      const groupId = u?.[gt === 'civilization' ? 'civilization' : gt];
      if (!groupId) continue;
      const group = stores[gt]?.[groupId];
      if (group && String(group[leaderKeys[gt]]) === String(message.author.id)) {
        if (!group.members.includes(targetId)) { reply(`❌ <@${targetId}> is not in your group.`); kicked = true; break; }
        await post(`/api/${apiKeys[gt]}/${groupId}/kick`, { leaderId: message.author.id, userId: targetId });
        if (guild && group.roleId) await removeRole(guild, targetId, group.roleId);
        reply(`✅ <@${targetId}> has been kicked from **${group.name}**.`);
        kicked = true; break;
      }
    }
    if (!kicked) reply('❌ You are not the leader of any group.');
  }

  // ── Disband ────────────────────────────────────────────────────────────────────
  else if (cmd === 'disband') {
    const u = data.users[message.author.id];
    const stores = { civilization: data.civilizations, religion: data.religions, team: data.teams, cult: data.cults };
    const apiRoutes = { civilization: 'civilizations', religion: 'religions', team: 'teams', cult: 'cults' };
    const leaderKeys = { civilization: 'leaderId', religion: 'founderId', team: 'leaderId', cult: 'leaderId' };
    let disbanded = false;
    for (const gt of Object.keys(stores)) {
      const groupId = u?.[gt === 'civilization' ? 'civilization' : gt];
      if (!groupId) continue;
      const group = stores[gt]?.[groupId];
      if (group && String(group[leaderKeys[gt]]) === String(message.author.id)) {
        const discordMeta = { roleId: group.roleId, categoryId: group.categoryId, channelId: group.channelId, leaderChannelId: group.leaderChannelId };
        await fetch(`http://localhost:${API_PORT}/api/${apiRoutes[gt]}/${groupId}`, { method: 'DELETE' });
        if (guild) await teardownDiscordGroup(guild, discordMeta);
        reply(`💥 **${group.name}** has been disbanded.`);
        disbanded = true; break;
      }
    }
    if (!disbanded) reply('❌ You are not the leader of any group.');
  }

  // ── Award Title ────────────────────────────────────────────────────────────────
  else if (cmd === 'title') {
    const target = args[0]; const titleText = args.slice(1).join(' ');
    if (!target || !titleText) return reply('Usage: !title @user <title text>');
    const targetId = target.replace(/[<@!>]/g, '');
    const u = data.users[message.author.id];
    const stores = { civilization: data.civilizations, religion: data.religions, team: data.teams, cult: data.cults };
    const leaderKeys = { civilization: 'leaderId', religion: 'founderId', team: 'leaderId', cult: 'leaderId' };
    let awarded = false;
    for (const gt of Object.keys(stores)) {
      const groupId = u?.[gt === 'civilization' ? 'civilization' : gt];
      if (!groupId) continue;
      const group = stores[gt]?.[groupId];
      if (group && String(group[leaderKeys[gt]]) === String(message.author.id)) {
        await post(`/api/users/${targetId}/title`, { title: titleText, awardedBy: message.author.id });
        reply(`🏅 <@${targetId}> has been awarded the title **"${titleText}"**!`);
        awarded = true; break;
      }
    }
    if (!awarded) reply('❌ Only group leaders can award titles.');
  }

  // ── Treasury ──────────────────────────────────────────────────────────────────
  else if (cmd === 'treasury') {
    if (!features.economyEnabled) return reply('❌ Economy is disabled.');
    const u = data.users[message.author.id];
    if (!u?.civilization) return reply('❌ You need to be in a civilization.');
    const civ = data.civilizations[u.civilization];
    reply(`🏛️ **${civ.name}** Treasury: **${civ.treasury || 0} gold**\n${civ.members.length} members | Leader: <@${civ.leaderId}>`);
  }
  else if (cmd === 'deposit') {
    if (!features.economyEnabled) return reply('❌ Economy is disabled.');
    const amt = Number(args[0]);
    if (!amt || amt <= 0) return reply('Usage: !deposit <amount>');
    const u = data.users[message.author.id];
    if (!u?.civilization) return reply('❌ You are not in a civilization.');
    const r = await post(`/api/civilizations/${u.civilization}/treasury/deposit`, { userId: message.author.id, amount: amt });
    if (r.error) reply(`❌ ${r.error}`);
    else reply(`💰 Deposited **${amt} gold** to the treasury. Treasury: **${r.treasury} gold** | Your balance: **${r.balance} gold**`);
  }
  else if (cmd === 'withdraw') {
    if (!features.economyEnabled) return reply('❌ Economy is disabled.');
    const amt = Number(args[0]);
    if (!amt || amt <= 0) return reply('Usage: !withdraw <amount>');
    const u = data.users[message.author.id];
    if (!u?.civilization) return reply('❌ You are not in a civilization.');
    const r = await post(`/api/civilizations/${u.civilization}/treasury/withdraw`, { leaderId: message.author.id, amount: amt });
    if (r.error) reply(`❌ ${r.error}`);
    else reply(`💰 Withdrew **${amt} gold**. Treasury: **${r.treasury} gold** | Your balance: **${r.balance} gold**`);
  }

  // ── Promote ────────────────────────────────────────────────────────────────────
  else if (cmd === 'promote') {
    const target = args[0];
    if (!target) return reply('Usage: !promote @user');
    const userId = target.replace(/[<@!>]/g, '');
    const u = await call(`/api/users/${message.author.id}`);
    const groupTypes = ['civilization', 'religion', 'team', 'cult'];
    const stores = { civilization: data.civilizations, religion: data.religions, team: data.teams, cult: data.cults };
    let promoted = false;
    for (const gt of groupTypes) {
      const groupId = u[gt === 'civilization' ? 'civilization' : gt];
      if (!groupId) continue;
      const group = stores[gt]?.[groupId];
      if (group && String(group.leaderId) === String(message.author.id)) {
        if (guild) await grantLeaderAccess(guild, userId, gt, groupId);
        reply(`✅ <@${userId}> has been promoted to officer in **${group.name}**.`);
        promoted = true; break;
      }
    }
    if (!promoted) reply('❌ You are not the leader of any group.');
  }

  // ── Wars & Alliances ──────────────────────────────────────────────────────────
  else if (cmd === 'war') {
    if (!features.warsEnabled) return reply('❌ Wars are disabled.');
    const targetId = args[0];
    if (!targetId) return reply('Usage: !war <civId>');
    const u = await call(`/api/users/${message.author.id}`);
    if (!u.civilization) return reply('❌ You need a civilization to declare war.');
    await post('/api/alliances', { type: 'war', party1: u.civilization, party2: targetId });
    const civ1 = data.civilizations[u.civilization];
    const civ2 = data.civilizations[targetId];
    const msg = `⚔️ **${civ1?.name || `Civ ${u.civilization}`}** has declared **WAR** on **${civ2?.name || `Civ ${targetId}`}**!`;
    reply(msg);
    if (features.diplomacyAnnouncementsEnabled && features.diplomacyChannelId)
      sendToChannel(features.diplomacyChannelId, msg);
  }
  else if (cmd === 'ally') {
    const targetId = args[0];
    if (!targetId) return reply('Usage: !ally <civId>');
    const u = await call(`/api/users/${message.author.id}`);
    if (!u.civilization) return reply('❌ You need a civilization.');
    await post('/api/alliances', { type: 'alliance', party1: u.civilization, party2: targetId });
    const civ1 = data.civilizations[u.civilization];
    const civ2 = data.civilizations[targetId];
    const msg = `🤝 Alliance formed between **${civ1?.name || `Civ ${u.civilization}`}** and **${civ2?.name || `Civ ${targetId}`}**!`;
    reply(msg);
    if (features.diplomacyAnnouncementsEnabled && features.diplomacyChannelId)
      sendToChannel(features.diplomacyChannelId, msg);
  }

  // ── Events ────────────────────────────────────────────────────────────────────
  else if (cmd === 'joinevent') {
    if (!features.eventsEnabled) return reply('❌ Events are disabled.');
    const id = args[0];
    if (!id) return reply('Usage: !joinevent <id>');
    const r = await post(`/api/events/${id}/join`, { userId: message.author.id });
    if (r.error) reply(`❌ ${r.error}`);
    else reply(`✅ Joined event **${r.event.name}**! ${r.event.participants.length} participant(s).`);
  }
  else if (cmd === 'events') {
    const evs = await call('/api/events');
    if (!evs.length) return reply('No events running.');
    reply(`**📅 Events:**\n${evs.map(e => `• **${e.name}** (ID: ${e.id}) [${e.status}] — ${e.participants.length} joined | 💰 ${e.reward} reward`).join('\n')}`);
  }

  // ── Minecraft Bridge ──────────────────────────────────────────────────────────
  else if (cmd === 'link') {
    const code = args[0];
    if (!code) return reply('Usage: `!link <code>` — get your code in Minecraft with `/link`');
    if (!/^\d{6}$/.test(code)) return reply('❌ Code must be 6 digits. Get it in Minecraft with `/link`.');
    const res = await fetch(`http://localhost:${API_PORT}/api/mc/link/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, discordId: message.author.id }),
    }).then(r => r.json()).catch(() => ({ error: 'Server error' }));
    if (res.error) reply(`❌ ${res.error}`);
    else reply(`✅ Linked to Minecraft player **${res.username}**! 🎮`);
  }
  else if (cmd === 'unlink') {
    const mcUUID = data.reverseLinks[message.author.id];
    if (!mcUUID) return reply('❌ Your Discord is not linked to any Minecraft account.');
    delete data.linkedAccounts[mcUUID];
    delete data.reverseLinks[message.author.id];
    saveDb();
    reply('✅ Your Minecraft account has been unlinked.');
  }
  else if (cmd === 'mcplayers') {
    const mc = data.mcServer;
    if (!mc.online) return reply('🔴 Minecraft server appears to be **offline**.');
    if (!mc.players.length) return reply('🟢 Minecraft server is **online** — no players currently.');
    reply(`🟢 **Minecraft Server** — ${mc.players.length} player(s) online:\n${mc.players.map(p => `• \`${p}\``).join('\n')}`);
  }
  else if (cmd === 'mcping') {
    const mc = data.mcServer;
    const lastSeen = mc.lastSeen ? `Last seen: <t:${Math.floor(new Date(mc.lastSeen).getTime() / 1000)}:R>` : 'Never connected';
    reply(`${mc.online ? '🟢 **Online**' : '🔴 **Offline**'} — ${mc.players.length} player(s) | ${lastSeen}`);
  }
  else if (cmd === 'mcciv') {
    const target = args[0];
    let discordId = target ? target.replace(/[<@!>]/g, '') : message.author.id;
    const mcUUID = data.reverseLinks[discordId];
    if (!mcUUID) return reply('❌ That user has not linked a Minecraft account.');
    const u = data.users[discordId];
    if (!u) return reply('❌ No bot profile found for that user.');
    const civ  = u.civilization ? data.civilizations[u.civilization]?.name  : 'None';
    const rel  = u.religion     ? data.religions[u.religion]?.name          : 'None';
    const team = u.team         ? data.teams[u.team]?.name                  : 'None';
    reply(`**🎮 Linked Profile** <@${discordId}>\n🏛️ Civ: **${civ}** | ✝️ Religion: **${rel}** | 🛡️ Team: **${team}**\n💰 Gold: **${data.economy[discordId] || 0}** | ⭐ Level: **${u.level}**`);
  }

  // ── Help ──────────────────────────────────────────────────────────────────────
  else if (cmd === 'help') {
    const lines = ['**📜 Available Commands:**\n', '`!profile` `!help`'];
    if (features.economyEnabled) lines.push('**💰 Economy:** `!balance` `!daily` `!pay @user <amt>` `!leaderboard` `!treasury` `!deposit <amt>` `!withdraw <amt>`');
    if (features.bountyEnabled)    lines.push('**🎯 Bounties:** `!bounty @user <amt> [reason]` `!bounties` `!claimbounty @user`');
    if (features.giveawaysEnabled) lines.push('**🎉 Giveaways:** `!giveaway <dur> <prize>` (react) · `!giveaway auto <dur> <prize>` (auto-enter all) · `!giveaway end` · `!giveaway reroll`');
    if (features.pollsEnabled)   lines.push('**📊 Polls:** `!poll <question> | <opt1> | <opt2>` `!vote <id> <A/B>` `!pollresults <id>`');
    if (features.funCommandsEnabled) lines.push('**🎮 Fun:** `!coinflip` `!roll [sides]` `!8ball <question>` `!rps rock|paper|scissors`');
    if (features.civilizationsEnabled) lines.push(`**🏛️ Civs:** \`!createciv <n>\` \`!joinciv <id>\` \`!leaveciv\` \`!civs\`${features.rebelsEnabled ? ' `!rebel [reason]` `!rebels`' : ''}`);
    if (features.religionsEnabled) lines.push('**✝️ Religion:** `!foundreligion <n>|<doctrine>` `!joinreligion <id>` `!leavereligion` `!religions` `!pray`');
    if (features.teamsEnabled)    lines.push('**🛡️ Teams:** `!createteam <n>` `!jointeam <id>` `!leaveteam` `!teams`');
    if (features.cultsEnabled)    lines.push('**🌑 Cults:** `!foundcult <n>|<obj>` `!joincult <id>` `!leavecult` `!cults` `!ritual`');
    if (features.warsEnabled)     lines.push('**⚔️ Diplomacy:** `!war <civId>` `!ally <civId>`');
    if (features.eventsEnabled)   lines.push('**📅 Events:** `!joinevent <id>` `!events`');
    lines.push('**👑 Leader only:** `!promote @user` `!kick @user` `!disband` `!title @user <title>`');
    if (features.bridgeEnabled)     lines.push('**🎮 Minecraft:** `!link <code>` `!unlink` `!mcplayers` `!mcping` `!mcciv [@user]`');
    reply(lines.join('\n'));
  }
});

client.on(Events.Error, (err) => console.error('❌ Bot error:', err));
client.login(token);
