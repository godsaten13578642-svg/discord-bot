const express = require('express');
const cors = require('cors');
const fs = require('fs');
const http = require('http');
const { WebSocketServer } = require('ws');
require('dotenv').config();

// ── Authentication Imports ──────────────────────────────────────────────────
const authRouter = require('./auth-endpoints');
const { authMiddleware, requireRole } = require('./auth-config');
const { getMasterAccount, getServerOwner } = require('./accounts-db');

const app = express();
app.use(cors());
app.use(express.json());

// ── Add Auth Routes ────────────────────────────────────────────────────────
app.use(authRouter);

// ── Persistent JSON Database ───────────────────────────────────────────────────────
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
  bounties:       _saved.bounties       || {},
  polls:          _saved.polls          || {},
  giveaways:      _saved.giveaways      || {},
  announcements:  _saved.announcements  || {},
  linkedAccounts: _saved.linkedAccounts || {},
  reverseLinks:   _saved.reverseLinks   || {},
  linkCodes:      _saved.linkCodes      || {},
  mcServer:       { players: [], online: false, lastSeen: null, chatLog: [], eventLog: [], commandLog: [], ...(_saved.mcServer || {}) },
};

let counters = _saved.counters || { civ: 1, religion: 1, team: 1, cult: 1, alliance: 1, event: 1, poll: 1 };

const features = Object.assign({
  // The Render blueprint generates MC_API_KEY — it must be authoritative when set.
  mcApiKey:              process.env.MC_API_KEY || 'change-me-to-something-secret',
  autoRegisterMembers:   true,
  xpEnabled:             true,
  xpPerMessage:          10,
  levelupEnabled:        true,
  levelupChannelId:      '',
  welcomeMessages:       true,
  welcomeChannelId:      '',
  economyEnabled:        true,
  dailyRewardAmount:     100,
  civilizationsEnabled:  true,
  religionsEnabled:      true,
  teamsEnabled:          true,
  cultsEnabled:          true,
  rebelsEnabled:         true,
  warsEnabled:           true,
  diplomacyAnnouncementsEnabled: true,
  diplomacyChannelId:    '',
  eventsEnabled:         true,
  eventsChannelId:       '',
  bountyEnabled:         true,
  bountyChannelId:       '',
  pollsEnabled:          true,
  pollsChannelId:        '',
  announcementChannelId: '',
  giveawaysEnabled:      true,
  giveawayChannelId:     '',
  funCommandsEnabled:    true,
  bridgeEnabled:         true,
  bridgeChannelId:       '',
  mcApiKey:              'change-me-to-something-secret',
  mcEventsEnabled:       true,
  mcEventsChannelId:     '',
}, _saved.features || {});

// ── Save ────────────────────────────────────────────────────────────────────
// Postgres when DATABASE_URL is set (survives deploys), else db.json.
const stateStore = require('./state-db').createGameStateStore({
  file: DB_FILE,
  snapshot: () => ({ ...data, counters, features, savedAt: new Date().toISOString() }),
  apply(saved) {
    if (!saved || typeof saved !== 'object') return;
    const safe = (obj, fallback) => (obj && typeof obj === 'object' ? obj : fallback);
    data.servers        = safe(saved.servers, data.servers);
    data.users          = safe(saved.users, data.users);
    data.civilizations  = safe(saved.civilizations, data.civilizations);
    data.religions      = safe(saved.religions, data.religions);
    data.teams          = safe(saved.teams, data.teams);
    data.cults          = safe(saved.cults, data.cults);
    data.rebels         = safe(saved.rebels, data.rebels);
    data.alliances      = safe(saved.alliances, data.alliances);
    data.economy        = safe(saved.economy, data.economy);
    data.titles         = safe(saved.titles, data.titles);
    data.events         = safe(saved.events, data.events);
    data.blackmarket    = Array.isArray(saved.blackmarket) ? saved.blackmarket : data.blackmarket;
    data.bounties       = safe(saved.bounties, data.bounties);
    data.polls          = safe(saved.polls, data.polls);
    data.giveaways      = safe(saved.giveaways, data.giveaways);
    data.announcements  = safe(saved.announcements, data.announcements);
    data.linkedAccounts = safe(saved.linkedAccounts, data.linkedAccounts);
    data.reverseLinks   = safe(saved.reverseLinks, data.reverseLinks);
    data.linkCodes      = safe(saved.linkCodes, data.linkCodes);
    data.mcServer       = { players: [], online: false, lastSeen: null, chatLog: [], eventLog: [], commandLog: [], ...(saved.mcServer || {}) };
    if (Array.isArray(saved.counters)) {
      saved.counters.forEach((v, i) => { counters[i] = v; });
    } else if (saved.counters && typeof saved.counters === 'object') {
      Object.assign(counters, saved.counters);
    }
    if (saved.features && typeof saved.features === 'object') Object.assign(features, saved.features);
    // Env MC_API_KEY stays authoritative over anything loaded from storage.
    if (process.env.MC_API_KEY) Object.assign(features, { mcApiKey: process.env.MC_API_KEY });
  },
});

function saveDb() { stateStore.scheduleSave(); }

// ── Helpers ───────────────────────────────────────────────────────────────────
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

// ── Health / Stats ────────────────────────────────────────────────────────────
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

// ── Features ──────────────────────────────────────────────────────────────────
app.get('/api/features', (_, res) => res.json(features));
app.post('/api/features', authMiddleware, requireRole('master', 'owner'), (req, res) => {
  Object.assign(features, req.body);
  saveDb();
  res.json({ success: true, features });
});

// ── Discord Channels (for dashboard dropdowns) ─────────────────────────────────
app.get('/api/channels', authMiddleware, (_, res) => {
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
app.post('/api/bot/disconnect', authMiddleware, requireRole('master'), async (_, res) => {
  try { await global.botClient?.destroy(); res.json({ success: true, message: 'Bot disconnected' }); }
  catch (e) { res.status(500).json({ success: false, message: e.message }); }
});
app.post('/api/bot/reconnect', authMiddleware, requireRole('master'), (_, res) => {
  const token = process.env.DISCORD_BOT_TOKEN || process.env.DISCORD_TOKEN;
  if (!token) return res.status(400).json({ success: false, message: 'No token configured' });
  try { global.botClient?.login(token); res.json({ success: true, message: 'Bot reconnecting…' }); }
  catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ── Users ───────────────────────────────────────────────────────────────────────
app.get('/api/users', authMiddleware, (_, res) => res.json(Object.values(data.users)));
app.get('/api/users/:id', authMiddleware, (req, res) => res.json(data.users[req.params.id] || mkUser(req.params.id)));
app.delete('/api/users/:id', authMiddleware, requireRole('master'), (req, res) => {
  const u = data.users[req.params.id];
  if (!u) return res.status(404).json({ error: 'Not found' });
  ['civilization','religion','team','cult'].forEach(k => { if (u[k] && data[k+'s']?.[u[k]]) data[k+'s'][u[k]].members = data[k+'s'][u[k]].members.filter(m => m !== req.params.id); });
  delete data.users[req.params.id]; delete data.economy[req.params.id]; delete data.rebels[req.params.id];
  saveDb();
  res.json({ success: true });
});
app.post('/api/users/:id/reset', authMiddleware, requireRole('master'), (req, res) => {
  if (!data.users[req.params.id]) return res.status(404).json({ error: 'Not found' });
  const u = data.users[req.params.id];
  data.users[req.params.id] = { ...mkUser(u.id), username: u.username };
  data.economy[req.params.id] = 0;
  saveDb();
  res.json({ success: true, user: data.users[req.params.id] });
});
app.post('/api/users/:id/xp', authMiddleware, (req, res) => {
  if (!features.xpEnabled) return res.json({ success: false, message: 'XP disabled' });
  res.json({ success: true, user: awardXP(req.params.id, req.body.amount || 0) });
});
app.post('/api/users/:id/title', authMiddleware, requireRole('master', 'owner'), (req, res) => {
  const { title, awardedBy } = req.body;
  ensureUser(req.params.id);
  if (!data.titles[req.params.id]) data.titles[req.params.id] = [];
  data.titles[req.params.id].push({ title, awardedBy, createdAt: new Date() });
  saveDb();
  res.json({ success: true });
});
app.delete('/api/users/:id/title/:index', authMiddleware, (req, res) => {
  if (!data.titles[req.params.id]) return res.status(404).json({ error: 'No titles' });
  data.titles[req.params.id].splice(Number(req.params.index), 1);
  saveDb();
  res.json({ success: true });
});
app.get('/api/users/:id/titles', authMiddleware, (req, res) => res.json(data.titles[req.params.id] || []));
app.post('/api/members/join', (req, res) => {
  if (!features.autoRegisterMembers) return res.json({ success: false });
  const { userId } = req.body;
  ensureUser(userId);
  saveDb();
  res.json({ success: true, welcomeEnabled: features.welcomeMessages });
});

// ── Economy ───────────────────────────────────────────────────────────────────────
app.get('/api/economy', authMiddleware, (_, res) => {
  const lb = Object.entries(data.economy).sort(([,a],[,b]) => b-a).slice(0,50).map(([id,bal]) => ({ id, username: data.users[id]?.username || id, balance: bal }));
  res.json(lb);
});
app.get('/api/economy/:userId', authMiddleware, (req, res) => res.json({ userId: req.params.userId, balance: ensureBalance(req.params.userId) }));
app.post('/api/economy/pay', authMiddleware, (req, res) => {
  const { fromId, toId, amount } = req.body;
  const amt = Number(amount);
  if (!amt || amt <= 0) return res.status(400).json({ error: 'Invalid amount' });
  ensureBalance(fromId); ensureBalance(toId);
  if (data.economy[fromId] < amt) return res.status(400).json({ error: 'Insufficient funds' });
  data.economy[fromId] -= amt; data.economy[toId] += amt;
  saveDb();
  res.json({ success: true });
});
app.post('/api/economy/daily/:userId', authMiddleware, (req, res) => {
  const u = ensureUser(req.params.userId);
  const now = Date.now();
  if (u.lastDaily && now - new Date(u.lastDaily).getTime() < 86400000) return res.status(400).json({ error: 'Already claimed today', next: new Date(new Date(u.lastDaily).getTime() + 86400000) });
  ensureBalance(req.params.userId);
  data.economy[req.params.userId] += features.dailyRewardAmount;
  u.lastDaily = new Date();
  saveDb();
  res.json({ success: true, amount: features.dailyRewardAmount, balance: data.economy[req.params.userId] });
});
app.post('/api/economy/admin/set', authMiddleware, requireRole('master', 'owner'), (req, res) => {
  const { userId, amount } = req.body;
  ensureUser(userId);
  data.economy[userId] = Number(amount);
  saveDb();
  res.json({ success: true });
});

// ── Civilizations ─────────────────────────────────────────────────────────────────
app.get('/api/civilizations', authMiddleware, (_, res) => res.json(Object.values(data.civilizations)));
app.get('/api/civilizations/:id', authMiddleware, (req, res) => {
  const c = data.civilizations[req.params.id];
  if (!c) return res.status(404).json({ error: 'Not found' });
  res.json(c);
});
app.post('/api/civilizations/create', authMiddleware, (req, res) => {
  if (!features.civilizationsEnabled) return res.json({ success: false, message: 'Disabled' });
  const { name, leaderId, serverId } = req.body;
  const id = counters.civ++;
  data.civilizations[id] = { id, name, leaderId, serverId, members: leaderId ? [leaderId] : [], treasury: 0, createdAt: new Date() };
  if (leaderId) { const u = ensureUser(leaderId); u.civilization = id; u.rank = 'Leader'; }
  saveDb();
  res.json({ success: true, civilizationId: id, civilization: data.civilizations[id] });
});
app.post('/api/civilizations/:id/join', authMiddleware, (req, res) => {
  const { userId } = req.body;
  const civ = data.civilizations[req.params.id];
  if (!civ) return res.status(404).json({ error: 'Not found' });
  if (data.rebels[userId]) delete data.rebels[userId];
  if (!civ.members.includes(userId)) civ.members.push(userId);
  const u = ensureUser(userId); u.civilization = req.params.id; u.isRebel = false;
  saveDb();
  res.json({ success: true, civilization: civ });
});
app.post('/api/civilizations/:id/leave', authMiddleware, (req, res) => {
  const { userId } = req.body;
  const civ = data.civilizations[req.params.id];
  if (!civ) return res.status(404).json({ error: 'Not found' });
  civ.members = civ.members.filter(m => m !== userId);
  if (data.users[userId]) { data.users[userId].civilization = null; if (data.users[userId].rank === 'Leader') data.users[userId].rank = 'Member'; }
  saveDb();
  res.json({ success: true, civ });
});
app.post('/api/civilizations/:id/kick', authMiddleware, (req, res) => {
  const { leaderId, userId } = req.body;
  const civ = data.civilizations[req.params.id];
  if (!civ) return res.status(404).json({ error: 'Not found' });
  if (String(civ.leaderId) !== String(leaderId)) return res.status(403).json({ error: 'Not the leader' });
  civ.members = civ.members.filter(m => m !== userId);
  if (data.users[userId]) data.users[userId].civilization = null;
  saveDb();
  res.json({ success: true });
});
app.post('/api/civilizations/:id/treasury/deposit', authMiddleware, (req, res) => {
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
app.post('/api/civilizations/:id/treasury/withdraw', authMiddleware, (req, res) => {
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
app.delete('/api/civilizations/:id', authMiddleware, requireRole('master', 'owner'), (req, res) => {
  const civ = data.civilizations[req.params.id];
  if (!civ) return res.status(404).json({ error: 'Not found' });
  civ.members.forEach(uid => { if (data.users[uid]) data.users[uid].civilization = null; });
  delete data.civilizations[req.params.id];
  saveDb();
  res.json({ success: true, discord: { roleId: civ.roleId, categoryId: civ.categoryId, channelId: civ.channelId, leaderChannelId: civ.leaderChannelId } });
});

// ── Rebels ───────────────────────────────────────────────────────────────────────
app.get('/api/rebels', authMiddleware, (_, res) => res.json(Object.values(data.rebels)));
app.post('/api/rebels', authMiddleware, (req, res) => {
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
app.delete('/api/rebels/:userId', authMiddleware, requireRole('master'), (req, res) => {
  delete data.rebels[req.params.userId];
  if (data.users[req.params.userId]) { data.users[req.params.userId].isRebel = false; data.users[req.params.userId].rank = 'Member'; }
  saveDb();
  res.json({ success: true });
});

// ── Religions ──────────────────────────────────────────────────────────────────────
app.get('/api/religions', authMiddleware, (_, res) => res.json(Object.values(data.religions)));
app.post('/api/religions/create', authMiddleware, (req, res) => {
  if (!features.religionsEnabled) return res.json({ success: false, message: 'Disabled' });
  const { name, founderId, doctrine, serverId } = req.body;
  const id = counters.religion++;
  data.religions[id] = { id, name, founderId, doctrine: doctrine || '', serverId, members: founderId ? [founderId] : [], holyWars: [], blessings: 0, createdAt: new Date() };
  if (founderId) { const u = ensureUser(founderId); u.religion = id; }
  saveDb();
  res.json({ success: true, religionId: id, religion: data.religions[id] });
});
app.post('/api/religions/:id/join', authMiddleware, (req, res) => {
  const { userId } = req.body;
  const rel = data.religions[req.params.id];
  if (!rel) return res.status(404).json({ error: 'Not found' });
  if (!rel.members.includes(userId)) rel.members.push(userId);
  const u = ensureUser(userId); u.religion = req.params.id;
  saveDb();
  res.json({ success: true, religion: rel });
});
app.post('/api/religions/:id/leave', authMiddleware, (req, res) => {
  const { userId } = req.body;
  const rel = data.religions[req.params.id];
  if (!rel) return res.status(404).json({ error: 'Not found' });
  rel.members = rel.members.filter(m => m !== userId);
  if (data.users[userId]) data.users[userId].religion = null;
  saveDb();
  res.json({ success: true });
});
app.post('/api/religions/:id/kick', authMiddleware, (req, res) => {
  const { leaderId, userId } = req.body;
  const rel = data.religions[req.params.id];
  if (!rel) return res.status(404).json({ error: 'Not found' });
  if (String(rel.founderId) !== String(leaderId)) return res.status(403).json({ error: 'Not the founder' });
  rel.members = rel.members.filter(m => m !== userId);
  if (data.users[userId]) data.users[userId].religion = null;
  saveDb();
  res.json({ success: true });
});
app.delete('/api/religions/:id', authMiddleware, requireRole('master', 'owner'), (req, res) => {
  const rel = data.religions[req.params.id];
  if (!rel) return res.status(404).json({ error: 'Not found' });
  rel.members.forEach(uid => { if (data.users[uid]) data.users[uid].religion = null; });
  delete data.religions[req.params.id];
  saveDb();
  res.json({ success: true, discord: { roleId: rel.roleId, categoryId: rel.categoryId, channelId: rel.channelId, leaderChannelId: rel.leaderChannelId } });
});
app.post('/api/religions/:id/bless', authMiddleware, (req, res) => {
  const rel = data.religions[req.params.id];
  if (!rel) return res.status(404).json({ error: 'Not found' });
  rel.blessings++;
  saveDb();
  res.json({ success: true, blessings: rel.blessings });
});

// ── Teams ───────────────────────────────────────────────────────────────────────
app.get('/api/teams', authMiddleware, (_, res) => res.json(Object.values(data.teams)));
app.post('/api/teams/create', authMiddleware, (req, res) => {
  if (!features.teamsEnabled) return res.json({ success: false, message: 'Disabled' });
  const { name, leaderId, color, serverId } = req.body;
  const id = counters.team++;
  data.teams[id] = { id, name, leaderId, color: color || '#0d6efd', serverId, members: leaderId ? [leaderId] : [], points: 0, createdAt: new Date() };
  if (leaderId) { const u = ensureUser(leaderId); u.team = id; }
  saveDb();
  res.json({ success: true, teamId: id, team: data.teams[id] });
});
app.post('/api/teams/:id/join', authMiddleware, (req, res) => {
  const { userId } = req.body;
  const team = data.teams[req.params.id];
  if (!team) return res.status(404).json({ error: 'Not found' });
  if (!team.members.includes(userId)) team.members.push(userId);
  const u = ensureUser(userId); u.team = req.params.id;
  saveDb();
  res.json({ success: true, team });
});
app.post('/api/teams/:id/points', authMiddleware, (req, res) => {
  const team = data.teams[req.params.id];
  if (!team) return res.status(404).json({ error: 'Not found' });
  team.points += Number(req.body.amount) || 0;
  saveDb();
  res.json({ success: true, points: team.points });
});
app.post('/api/teams/:id/leave', authMiddleware, (req, res) => {
  const { userId } = req.body;
  const team = data.teams[req.params.id];
  if (!team) return res.status(404).json({ error: 'Not found' });
  team.members = team.members.filter(m => m !== userId);
  if (data.users[userId]) data.users[userId].team = null;
  saveDb();
  res.json({ success: true });
});
app.post('/api/teams/:id/kick', authMiddleware, (req, res) => {
  const { leaderId, userId } = req.body;
  const team = data.teams[req.params.id];
  if (!team) return res.status(404).json({ error: 'Not found' });
  if (String(team.leaderId) !== String(leaderId)) return res.status(403).json({ error: 'Not the leader' });
  team.members = team.members.filter(m => m !== userId);
  if (data.users[userId]) data.users[userId].team = null;
  saveDb();
  res.json({ success: true });
});
app.delete('/api/teams/:id', authMiddleware, requireRole('master', 'owner'), (req, res) => {
  const team = data.teams[req.params.id];
  if (!team) return res.status(404).json({ error: 'Not found' });
  team.members.forEach(uid => { if (data.users[uid]) data.users[uid].team = null; });
  delete data.teams[req.params.id];
  saveDb();
  res.json({ success: true, discord: { roleId: team.roleId, categoryId: team.categoryId, channelId: team.channelId, leaderChannelId: team.leaderChannelId } });
});

// ── Cults ───────────────────────────────────────────────────────────────────────
app.get('/api/cults', authMiddleware, (_, res) => res.json(Object.values(data.cults)));
app.post('/api/cults/create', authMiddleware, (req, res) => {
  if (!features.cultsEnabled) return res.json({ success: false, message: 'Disabled' });
  const { name, leaderId, secretObjective, serverId } = req.body;
  const id = counters.cult++;
  data.cults[id] = { id, name, leaderId, secretObjective: secretObjective || 'Unknown', serverId, members: leaderId ? [leaderId] : [], rituals: 0, power: 0, createdAt: new Date() };
  if (leaderId) { const u = ensureUser(leaderId); u.cult = id; }
  saveDb();
  res.json({ success: true, cultId: id, cult: data.cults[id] });
});
app.post('/api/cults/:id/join', authMiddleware, (req, res) => {
  const { userId } = req.body;
  const cult = data.cults[req.params.id];
  if (!cult) return res.status(404).json({ error: 'Not found' });
  if (!cult.members.includes(userId)) cult.members.push(userId);
  const u = ensureUser(userId); u.cult = req.params.id;
  saveDb();
  res.json({ success: true, cult });
});
app.post('/api/cults/:id/ritual', authMiddleware, (req, res) => {
  const cult = data.cults[req.params.id];
  if (!cult) return res.status(404).json({ error: 'Not found' });
  cult.rituals++; cult.power += 10;
  saveDb();
  res.json({ success: true, rituals: cult.rituals, power: cult.power });
});
app.post('/api/cults/:id/leave', authMiddleware, (req, res) => {
  const { userId } = req.body;
  const cult = data.cults[req.params.id];
  if (!cult) return res.status(404).json({ error: 'Not found' });
  cult.members = cult.members.filter(m => m !== userId);
  if (data.users[userId]) data.users[userId].cult = null;
  saveDb();
  res.json({ success: true });
});
app.post('/api/cults/:id/kick', authMiddleware, (req, res) => {
  const { leaderId, userId } = req.body;
  const cult = data.cults[req.params.id];
  if (!cult) return res.status(404).json({ error: 'Not found' });
  if (String(cult.leaderId) !== String(leaderId)) return res.status(403).json({ error: 'Not the leader' });
  cult.members = cult.members.filter(m => m !== userId);
  if (data.users[userId]) data.users[userId].cult = null;
  saveDb();
  res.json({ success: true });
});
app.delete('/api/cults/:id', authMiddleware, requireRole('master', 'owner'), (req, res) => {
  const cult = data.cults[req.params.id];
  if (!cult) return res.status(404).json({ error: 'Not found' });
  cult.members.forEach(uid => { if (data.users[uid]) data.users[uid].cult = null; });
  delete data.cults[req.params.id];
  saveDb();
  res.json({ success: true, discord: { roleId: cult.roleId, categoryId: cult.categoryId, channelId: cult.channelId, leaderChannelId: cult.leaderChannelId } });
});

// ── Alliances & Wars ────────────────────────────────────────────────────────────────
app.get('/api/alliances', authMiddleware, (_, res) => res.json(Object.values(data.alliances)));
app.post('/api/alliances', authMiddleware, (req, res) => {
  if (!features.warsEnabled) return res.json({ success: false, message: 'Disabled' });
  const { type, party1, party2, party1Type, party2Type } = req.body;
  const id = counters.alliance++;
  data.alliances[id] = { id, type, party1, party2, party1Type: party1Type || 'civilization', party2Type: party2Type || 'civilization', createdAt: new Date() };
  saveDb();
  res.json({ success: true, id, alliance: data.alliances[id] });
});
app.delete('/api/alliances/:id', authMiddleware, requireRole('master', 'owner'), (req, res) => {
  if (!data.alliances[req.params.id]) return res.status(404).json({ error: 'Not found' });
  delete data.alliances[req.params.id];
  saveDb();
  res.json({ success: true });
});

// ── Events ───────────────────────────────────────────────────────────────────────
app.get('/api/events', authMiddleware, (_, res) => res.json(Object.values(data.events)));
app.post('/api/events/create', authMiddleware, (req, res) => {
  if (!features.eventsEnabled) return res.json({ success: false, message: 'Disabled' });
  const { name, type, serverId } = req.body;
  const id = counters.event++;
  data.events[id] = { id, name, type: type || 'general', serverId, participants: [], status: 'open', reward: 200, createdAt: new Date() };
  saveDb();
  if (features.eventsChannelId)
    sendToChannel(features.eventsChannelId, `📅 **New Event!** **${name}** is now open — type \`!joinevent ${id}\` to enter!`);
  res.json({ success: true, eventId: id, event: data.events[id] });
});
app.post('/api/events/:id/join', authMiddleware, (req, res) => {
  const { userId } = req.body;
  const ev = data.events[req.params.id];
  if (!ev) return res.status(404).json({ error: 'Not found' });
  if (ev.status !== 'open') return res.status(400).json({ error: 'Event not open' });
  if (!ev.participants.includes(userId)) ev.participants.push(userId);
  saveDb();
  res.json({ success: true, event: ev });
});
app.post('/api/events/:id/end', authMiddleware, (req, res) => {
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
app.delete('/api/events/:id', authMiddleware, requireRole('master', 'owner'), (req, res) => {
  if (!data.events[req.params.id]) return res.status(404).json({ error: 'Not found' });
  delete data.events[req.params.id];
  saveDb();
  res.json({ success: true });
});

// ── Bounties ──────────────────────────────────────────────────────────────────────
app.get('/api/bounties', authMiddleware, (_, res) => res.json(Object.values(data.bounties)));
app.post('/api/bounties', authMiddleware, (req, res) => {
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
app.post('/api/bounties/claim', authMiddleware, (req, res) => {
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
app.delete('/api/bounties/:targetId', authMiddleware, requireRole('master'), (req, res) => {
  delete data.bounties[req.params.targetId];
  saveDb();
  res.json({ success: true });
});

// ── Polls ───────────────────────────────────────────────────────────────────────
app.get('/api/polls', authMiddleware, (_, res) => res.json(Object.values(data.polls)));
app.post('/api/polls', authMiddleware, (req, res) => {
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
app.post('/api/polls/:id/vote', authMiddleware, (req, res) => {
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
app.delete('/api/polls/:id', authMiddleware, requireRole('master', 'owner'), (req, res) => {
  delete data.polls[req.params.id];
  saveDb();
  res.json({ success: true });
});

// ── Announcements ─────────────────────────────────────────────────────────────────
let annIdCounter = _saved.annIdCounter || 1;

function sendAnnouncement(ann) {
  if (!global.botClient) return;
  const ch = global.botClient.channels.cache.get(ann.channelId);
  if (!ch) return;
  const msg = ann.title
    ? `📢 **${ann.title}**\n\n${ann.body}`
    : `📢 ${ann.body}`;
  ch.send(msg).catch(() => {});
  ann.sentAt = new Date().toISOString();
  saveDb();
}

function scheduleAnnouncement(ann) {
  const delay = new Date(ann.scheduledAt) - Date.now();
  if (delay <= 0) {
    if (!ann.sentAt && !ann.cancelled) sendAnnouncement(ann);
    return;
  }
  ann._timer = setTimeout(() => {
    if (!ann.cancelled) sendAnnouncement(ann);
  }, Math.min(delay, 2147483647));
}

app.get('/api/announcements', authMiddleware, (_, res) => res.json(Object.values(data.announcements)));

app.post('/api/announcements/send', authMiddleware, requireRole('master', 'owner'), (req, res) => {
  const { title, body, channelId } = req.body;
  if (!body) return res.status(400).json({ error: 'Body required' });
  const chId = channelId || features.announcementChannelId;
  if (!chId) return res.status(400).json({ error: 'No channel selected' });
  const ann = { id: annIdCounter++, title: title || '', body, channelId: chId, scheduledAt: null, sentAt: null, cancelled: false };
  data.announcements[ann.id] = ann;
  sendAnnouncement(ann);
  saveDb();
  res.json({ success: true, announcement: ann });
});

app.post('/api/announcements/schedule', authMiddleware, requireRole('master', 'owner'), (req, res) => {
  const { title, body, channelId, scheduledAt } = req.body;
  if (!body) return res.status(400).json({ error: 'Body required' });
  if (!scheduledAt) return res.status(400).json({ error: 'scheduledAt required' });
  const chId = channelId || features.announcementChannelId;
  if (!chId) return res.status(400).json({ error: 'No channel selected' });
  const ann = { id: annIdCounter++, title: title || '', body, channelId: chId, scheduledAt, sentAt: null, cancelled: false };
  data.announcements[ann.id] = ann;
  scheduleAnnouncement(ann);
  saveDb();
  res.json({ success: true, announcement: ann });
});

app.delete('/api/announcements/:id', authMiddleware, requireRole('master', 'owner'), (req, res) => {
  const ann = data.announcements[req.params.id];
  if (!ann) return res.status(404).json({ error: 'Not found' });
  ann.cancelled = true;
  saveDb();
  res.json({ success: true });
});

// ── Servers ───────────────────────────────────────────────────────────────────────
app.get('/api/servers', authMiddleware, (_, res) => res.json(Object.values(data.servers)));
app.post('/api/servers/setup', authMiddleware, (req, res) => {
  const { serverId, serverName } = req.body;
  data.servers[serverId] = { serverId, serverName, setupAt: new Date() };
  saveDb();
  res.json({ success: true });
});
app.delete('/api/servers/:id', authMiddleware, requireRole('master'), (req, res) => {
  if (!data.servers[req.params.id]) return res.status(404).json({ error: 'Not found' });
  delete data.servers[req.params.id];
  saveDb();
  res.json({ success: true });
});

// ── Minecraft Bridge API ──────────────────────────────────────────────────────────────
const mcAuth = (req, res, next) => {
  const key = req.headers['x-api-key'] || req.body?.apiKey;
  if (key !== features.mcApiKey) return res.status(403).json({ error: 'Invalid API key' });
  next();
};

const MC_LOG_MAX = 100;
const pushMcLog = (arr, entry) => { arr.push(entry); if (arr.length > MC_LOG_MAX) arr.shift(); };

// ── Error Reports (from the Minecraft plugin's /react command) ───────────────
// The plugin POSTs a Skript error report and gets back a short URL. Anyone with
// the URL can view the report as a plain HTML page — no dashboard login needed.
const errorReports = new Map(); // token -> { title, source, script, errorCount, issues, createdAt, expiresAt }
const ERROR_TOKEN_MAX = 100;

function cleanErrorToken() {
  const now = Date.now();
  for (const [token, r] of errorReports) {
    if (r.expiresAt && r.expiresAt < now) errorReports.delete(token);
  }
  while (errorReports.size >= ERROR_TOKEN_MAX) {
    errorReports.delete(errorReports.keys().next().value);
  }
}

app.post('/api/errors', mcAuth, (req, res) => {
  const { title, source, script, errorCount, issues } = req.body || {};
  if (!Array.isArray(issues)) return res.status(400).json({ error: 'issues array required' });
  cleanErrorToken();
  const token = require('crypto').randomBytes(16).toString('hex');
  const expirySeconds = Number(req.body.expiry || 3600);
  errorReports.set(token, {
    title: String(title || 'Error report').slice(0, 200),
    source: String(source || 'unknown').slice(0, 100),
    script: String(script || '').slice(0, 200),
    errorCount: Number(errorCount) || 0,
    issues: issues.slice(0, 200).map(i => ({
      level: String(i.level || 'error').slice(0, 20),
      file: String(i.file || '').slice(0, 300),
      line: Number(i.line) || -1,
      message: String(i.message || '').slice(0, 4000),
    })),
    createdAt: new Date().toISOString(),
    expiresAt: expirySeconds > 0 ? Date.now() + expirySeconds * 1000 : null,
  });
  res.json({ success: true, token, path: `/errors/${token}` });
});

app.get('/api/errors/:token', (req, res) => {
  const report = errorReports.get(req.params.token);
  if (!report) return res.status(404).json({ error: 'Report not found or expired' });
  res.json(report);
});

const escapeHtml = (s) => String(s)
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&#39;');

app.get('/errors/:token', (req, res) => {
  const report = errorReports.get(req.params.token);
  if (!report) {
    res.status(404).type('html').send(
      '<!doctype html><html><head><meta charset="utf-8"><title>Error report</title></head>' +
      '<body style="font-family:system-ui;background:#111;color:#eee;text-align:center;padding-top:4rem">' +
      '<h1>Report not found</h1><p>This error report does not exist or has expired.</p></body></html>');
    return;
  }
  const rows = report.issues.map(i => {
    const isError = i.level === 'error';
    const color = isError ? '#ff6b6b' : '#f7b731';
    const where = i.line > 0 ? `${escapeHtml(i.file)} — line ${i.line}` : escapeHtml(i.file);
    return `<div style="border-left:4px solid ${color};background:#1b1b1b;margin:10px 0;padding:10px 14px;border-radius:6px">`
      + `<div style="font-size:12px;color:${color};font-weight:600;margin-bottom:4px">${isError ? 'ERROR' : 'WARNING'} · ${where}</div>`
      + `<pre style="white-space:pre-wrap;word-break:break-word;margin:0;font-size:13.5px;color:#ddd;font-family:ui-monospace,Consolas,monospace">${escapeHtml(i.message)}</pre></div>`;
  }).join('');
  const expiryNote = report.expiresAt
    ? `<p style="color:#888;font-size:12px">This page expires at ${new Date(report.expiresAt).toLocaleString()}.</p>`
    : '';
  res.type('html').send(
    '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
    + `<title>${escapeHtml(report.title)}</title></head>`
    + '<body style="font-family:system-ui;background:#111;color:#eee;max-width:860px;margin:0 auto;padding:2rem 1rem">'
    + `<h1 style="font-size:22px;margin-bottom:2px">${escapeHtml(report.title)}</h1>`
    + `<p style="color:#888;margin-top:0">source: ${escapeHtml(report.source)}`
    + (report.script ? ` · script: <b>${escapeHtml(report.script)}</b>` : '')
    + ` · ${report.errorCount} error(s) · created ${new Date(report.createdAt).toLocaleString()}</p>`
    + rows
    + expiryNote
    + '</body></html>');
});

// ── Downloads (plugin jar + resource pack) ────────────────────────────────
// Serves artifacts staged by minecraft-plugin/tools/stage_artifacts.mjs.
// Public (no auth): Minecraft resource-pack fetches can't send bearer headers.
const path = require('path');
const downloadsDir = path.join(__dirname, 'minecraft-plugin', 'artifacts');
function readDownloadsManifest() {
  try {
    return JSON.parse(fs.readFileSync(path.join(downloadsDir, 'manifest.json'), 'utf8'));
  } catch (_) {
    return { generatedAt: null, plugin: null, pack: null };
  }
}

app.get('/api/downloads', (_, res) => {
  const m = readDownloadsManifest();
  res.json({
    plugin: m.plugin ? { version: m.plugin.version, size: m.plugin.size, sha1: m.plugin.sha1, url: '/downloads/plugin', builtAt: m.plugin.builtAt } : null,
    pack: m.pack ? { size: m.pack.size, sha1: m.pack.sha1, url: '/downloads/pack', updatedAt: m.pack.updatedAt } : null,
    generatedAt: m.generatedAt,
  });
});

app.get('/downloads/plugin', (_, res) => {
  const m = readDownloadsManifest();
  if (!m.plugin) return res.status(404).send('Plugin jar not staged yet — run minecraft-plugin/tools/stage_artifacts.mjs');
  res.download(path.join(downloadsDir, m.plugin.file), 'CivBridge.jar');
});

app.get('/downloads/pack', (_, res) => {
  const m = readDownloadsManifest();
  if (!m.pack) return res.status(404).send('Resource pack not staged yet — run minecraft-plugin/tools/stage_artifacts.mjs');
  res.download(path.join(downloadsDir, m.pack.file), 'civbridge-pack.zip');
});

// Keep-alive for Render free tier — pings this service every 10 minutes so it
// doesn't spin down (free web services sleep after 15 min without traffic).
// A missed ping (spin-down or network blip) flips the Discord status to a
// visible "reconnecting" state.
if (process.env.RENDER_EXTERNAL_URL) {
  const KEEP_ALIVE_URL = process.env.KEEP_ALIVE_URL || `${process.env.RENDER_EXTERNAL_URL}/health`;
  setInterval(() => {
    fetch(KEEP_ALIVE_URL)
      .then(r => { if (!r.ok) throw new Error(`health responded ${r.status}`); })
      .catch(() => {
        console.log('⚠️  Keep-alive ping failed — service is likely spinning down; showing reconnecting status.');
        if (global.botClient?.user) {
          try {
            global.botClient.user.setPresence({
              status: 'dnd',
              activities: [{ name: 'reconnecting… (API spun down)', type: 0 }],
            });
          } catch (_) { /* never let presence break the service */ }
        }
      });
  }, 10 * 60 * 1000).unref();
  console.log(`⏰ Keep-alive ping enabled → ${KEEP_ALIVE_URL}`);
}

// Discord presence follows the Minecraft connection state, so the widget is
// honest even between spin-downs.
function updateBotPresence() {
  const c = global.botClient;
  if (!c?.user || !global.__botActive) return;
  const online = global.mcWsClients.size > 0;
  try {
    // discord.js v14: setPresence is synchronous (returns the user, not a Promise).
    c.user.setPresence({
      status: online ? 'online' : 'idle',
      activities: [{
        name: online ? `the Minecraft server (${data.mcServer.playerCount || 0} online)` : 'waiting for the Minecraft server…',
        type: 0,
      }],
    });
  } catch (_) { /* never let presence break the service */ }
}
setInterval(updateBotPresence, 60 * 1000).unref();

app.get('/api/mc/status', (_, res) => res.json(data.mcServer));

app.post('/api/mc/chat', mcAuth, (req, res) => {
  const { playerName, content, mcPrefix = '[MC]' } = req.body;
  data.mcServer.online = true;
  data.mcServer.lastSeen = new Date();
  pushMcLog(data.mcServer.chatLog, { playerName, content, ts: new Date().toISOString() });
  saveDb();
  if (features.bridgeEnabled && features.bridgeChannelId && global.botClient) {
    const ch = global.botClient.channels.cache.get(features.bridgeChannelId);
    if (ch) ch.send(`**${mcPrefix} ${playerName}:** ${content}`).catch(() => {});
  }
  res.json({ success: true });
});

app.post('/api/mc/event', mcAuth, (req, res) => {
  const { type, playerName, message } = req.body;
  data.mcServer.online = true;
  data.mcServer.lastSeen = new Date();
  pushMcLog(data.mcServer.eventLog, { type, playerName, message, ts: new Date().toISOString() });
  saveDb();
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

app.post('/api/mc/command', authMiddleware, (req, res) => {
  const { command } = req.body;
  if (!command) return res.status(400).json({ error: 'command required' });
  if (global.mcWsClients.size === 0) return res.status(503).json({ error: 'Minecraft server not connected' });
  const msg = JSON.stringify({ type: 'run_command', command });
  global.mcWsClients.forEach(ws => { try { ws.send(msg); } catch {} });
  pushMcLog(data.mcServer.commandLog, { command, ts: new Date().toISOString(), status: 'sent' });
  saveDb();
  res.json({ success: true });
});

app.post('/api/mc/broadcast', authMiddleware, (req, res) => {
  const { content } = req.body;
  if (!content) return res.status(400).json({ error: 'content required' });
  if (global.mcWsClients.size === 0) return res.status(503).json({ error: 'Minecraft server not connected' });
  const msg = JSON.stringify({ type: 'broadcast', content });
  global.mcWsClients.forEach(ws => { try { ws.send(msg); } catch {} });
  res.json({ success: true });
});

app.post('/api/mc/kick', authMiddleware, (req, res) => {
  const { playerName, reason = 'Kicked by dashboard' } = req.body;
  if (!playerName) return res.status(400).json({ error: 'playerName required' });
  if (global.mcWsClients.size === 0) return res.status(503).json({ error: 'Minecraft server not connected' });
  const msg = JSON.stringify({ type: 'run_command', command: `kick ${playerName} ${reason}` });
  global.mcWsClients.forEach(ws => { try { ws.send(msg); } catch {} });
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

app.post('/api/mc/link/confirm', authMiddleware, (req, res) => {
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
  if (global.mcWsClients.size === 1) {
    // First authenticated connection since boot/wake — usually the MC server
    // reattaching after a free-tier spin-down.
    sendStatusNotice('🟢 **API is back online** after a spin-down — the Minecraft server reconnected automatically.');
  }
  updateBotPresence();

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }

    if (msg.type === 'identify') {
      // Plugin identified itself — nothing extra needed
    } else if (msg.type === 'pong') {
      data.mcServer.online = true;
      data.mcServer.lastSeen = new Date();
      if (typeof msg.playerCount === 'number') data.mcServer.playerCount = msg.playerCount;
    } else if (msg.type === 'mc_chat') {
      pushMcLog(data.mcServer.chatLog, { playerName: msg.playerName, content: msg.content, ts: new Date().toISOString() });
      saveDb();
      if (features.bridgeEnabled && features.bridgeChannelId && global.botClient) {
        const ch = global.botClient.channels.cache.get(features.bridgeChannelId);
        if (ch) ch.send(`🎮 **[MC] ${msg.playerName}:** ${msg.content}`).catch(() => {});
      }
    } else if (msg.type === 'mc_event') {
      pushMcLog(data.mcServer.eventLog, { type: msg.eventType, playerName: msg.playerName, message: msg.message, ts: new Date().toISOString() });
      saveDb();
      if (features.mcEventsEnabled && features.mcEventsChannelId && global.botClient) {
        const ch = global.botClient.channels.cache.get(features.mcEventsChannelId);
        if (ch && msg.message) ch.send(msg.message).catch(() => {});
      }
    } else if (msg.type === 'mc_players') {
      data.mcServer.players = msg.players || [];
      saveDb();
    } else if (msg.type === 'command_result') {
      // Update last command log entry with result
      const last = data.mcServer.commandLog[data.mcServer.commandLog.length - 1];
      if (last && last.command === msg.command) last.ok = msg.ok;
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

// ── Free-tier spin-down notices ───────────────────────────────────────
function botCanAnnounce() {
  return !!(global.botClient && global.__botActive && global.__statusChannelId);
}

function sendStatusNotice(text) {
  if (!botCanAnnounce()) return;
  const ch = global.botClient.channels.cache.get(global.__statusChannelId);
  if (ch) ch.send(text).catch(() => {});
}

// Wait for the accounts store (Postgres/Neon when DATABASE_URL is set, else
// accounts.json) before accepting traffic.
Promise.all([
  require('./accounts-db').whenReady(),
  stateStore.whenReady(),
]).then(() => {
  httpServer.listen(API_PORT, () => console.log(`🌐 API + WebSocket on port ${API_PORT} (ws path: /ws)\n🔐 Authentication enabled`));
});

// ── Discord Bot ─────────────────────────────────────────────────────────────────────
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

client.once(Events.ClientReady, (c) => {
  console.log(`✅ Discord bot logged in as ${c.user.tag}`);
  global.__botActive = true;
  const raw = process.env.DISCORD_STATUS_CHANNEL_ID || '';
  global.__statusChannelId = raw.includes(':') ? raw.split(':')[1] : raw;
  c.guilds.cache.forEach(g => { if (!data.servers[g.id]) data.servers[g.id] = { serverId: g.id, serverName: g.name, setupAt: new Date() }; });
  Object.values(data.announcements).forEach(a => { if (a.scheduledAt && !a.sentAt && !a.cancelled) scheduleAnnouncement(a); });
  if (global.mcWsClients.size > 0) {
    sendStatusNotice('🟢 **API is back online** after a spin-down — the Minecraft server reconnected automatically.');
  }
  updateBotPresence();

  // ── Secret DM (once per boot) ──────────────────────────────────
  // Sends a hidden message to the configured Discord username. Tries at boot;
  // if the user isn't cached (or DMs failed), retries whenever they speak or join.
  const secretDmName = (process.env.SECRET_DM_USERNAME || 'memegodmidas').trim().toLowerCase();
  const secretDmText = process.env.SECRET_DM_MESSAGE || '🤫 psst… you have been chosen. Check /saber and /fandom on the server.';
  let secretDmSent = false;
  const trySendSecretDm = async (user) => {
    if (secretDmSent || !user || user.bot) return;
    if (user.username?.toLowerCase() !== secretDmName) return;
    try {
      await user.send(secretDmText);
      secretDmSent = true;
      console.log(`🤫 Secret DM delivered to @${user.username}`);
    } catch (e) {
      console.log(`🤫 Secret DM to @${user.username} failed (will retry): ${e.message}`);
    }
  };
  c.users.cache.forEach(trySendSecretDm);
  c.on(Events.MessageCreate, (m) => trySendSecretDm(m.author));
  c.on(Events.GuildMemberAdd, (m) => trySendSecretDm(m.user));

  saveDb();
});

client.on(Events.ShardDisconnect, () => {
  global.__botActive = false;
  console.log('⚠️  Discord gateway lost — bot will auto-reconnect (presence pauses).');
});
client.on(Events.ShardResume, () => {
  global.__botActive = true;
  console.log('✅ Discord gateway resumed.');
  updateBotPresence();
});

// Render sends SIGTERM on deploys/spin-down — say goodbye and close cleanly.
process.on('SIGTERM', () => {
  console.log('👋 SIGTERM received (deploy or spin-down) — shutting down cleanly.');
  sendStatusNotice('🌙 **API is spinning down** (Render free tier idle or deploy). It will wake automatically on the next request — the Minecraft server will reconnect on its own.');
  try { client.destroy(); } catch (_) {}
  global.mcWsClients.forEach(ws => { try { ws.close(1001, 'Server restarting'); } catch (_) {} });
  setTimeout(() => process.exit(0), 1500);
});

// Persist the very last state on shutdown (deploys must not lose writes).
process.on('SIGTERM', () => { stateStore.flush(); });
process.on('SIGINT', () => { stateStore.flush(); });

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
  const cmd  = args.shift().toLowerCase();
  const reply = (msg) => message.reply(msg);
  
  // Commands remain the same as in original server.js
  if (cmd === 'profile') {
    const u = await call(`/api/users/${message.author.id}`);
    const bal = await call(`/api/economy/${message.author.id}`);
    reply(`**${message.author.username}'s Profile**\nLevel: **${u.level}** | 💰 Gold: **${bal.balance}**`);
  }
});

client.login(token);
