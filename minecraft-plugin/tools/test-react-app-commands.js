// Boots the real server.js against a stubbed Discord gateway and drives the
// !Reactapp flow end to end: the DM interview (answers + delivery preference),
// the owner DM + to-do list, the admin review commands (comment / dim / allow /
// reject), the customer's confirm, the owner's delivery stages, and the
// persisted result.
//
// server.js is a single 2,600-line module with a lot of top-level side effects,
// so it is loaded the same way test-state-db.js loads its target: Module._load
// is intercepted to hand back fakes for everything that talks to the outside
// world (discord.js, express, http, ws). The application logic, the command
// dispatch, the feature flags and the real state-db file persistence all run
// untouched.
//
// Run: node minecraft-plugin/tools/test-react-app-commands.js
const Module = require('module');
const fs = require('fs');
const path = require('path');
const os = require('os');

// ── Isolated environment ─────────────────────────────────────────────────────
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'reactapp-'));
process.chdir(tmp);
// The applicant is linked to a Minecraft account before the bot ever boots, so
// the interview can offer that name at the in-game-name question.
fs.writeFileSync(path.join(tmp, 'db.json'), JSON.stringify({ linkedNames: { '42': 'Skyrender' } }));
delete process.env.DATABASE_URL;          // force the file-backed game-state store
delete process.env.RENDER_EXTERNAL_URL;   // no keep-alive pings
delete process.env.ADMIN_DISCORD_IDS;
delete process.env.OWNER_DISCORD_IDS;
process.env.DISCORD_BOT_TOKEN = 'test-token';
process.env.SECRET_DM_USERNAME = 'memegodmidas';

let failures = 0;
function assert(cond, label) {
  if (!cond) { console.error(`❌ FAIL [react-cmd] ${label}`); failures++; }
  else console.log(`✅ [react-cmd] ${label}`);
}
const has = (bucket, needle) => bucket.some(m => m.includes(needle));
const hasAny = (bucket, needles) => needles.some(n => bucket.some(m => m.includes(n)));

// ── Fakes ────────────────────────────────────────────────────────────────────
// Every route server.js registers is kept here so the dashboard API can be
// called directly, with a plain req.user (authMiddleware is stubbed above).
const routes = {};
const mkRouter = () => {
  const r = function () {};
  const record = (method) => (routePath, ...handlers) => {
    routes[`${method} ${routePath}`] = handlers[handlers.length - 1];
    return r;
  };
  r.use = () => r;
  for (const m of ['get', 'post', 'put', 'patch', 'delete', 'all', 'options', 'head']) r[m] = record(m);
  return r;
};

/** Express-style path match (":id" captures into req.params). */
function matchRoute(method, url) {
  const parts = url.split('?')[0].split('/');
  for (const key of Object.keys(routes)) {
    const [m, pattern] = [key.slice(0, key.indexOf(' ')), key.slice(key.indexOf(' ') + 1)];
    if (m !== method) continue;
    const pp = pattern.split('/');
    if (pp.length !== parts.length) continue;
    const params = {};
    let ok = true;
    for (let i = 0; i < pp.length; i++) {
      if (pp[i].startsWith(':')) params[pp[i].slice(1)] = decodeURIComponent(parts[i]);
      else if (pp[i] !== parts[i]) { ok = false; break; }
    }
    if (ok) return { handler: routes[key], params };
  }
  return null;
}

/** Calls a registered route and resolves with what the handler wrote. */
function callApi(methodPath, { user = null, body = {} } = {}) {
  const method = methodPath.slice(0, methodPath.indexOf(' '));
  const url = methodPath.slice(methodPath.indexOf(' ') + 1);
  const hit = matchRoute(method, url);
  if (!hit) throw new Error(`route not registered: ${methodPath}`);
  return new Promise((resolve, reject) => {
    const res = {
      statusCode: 200,
      status(code) { this.statusCode = code; return this; },
      json(payload) { resolve({ status: this.statusCode, body: payload }); return this; },
      send(payload) { resolve({ status: this.statusCode, body: payload }); return this; },
      sendFile() { resolve({ status: 200, body: null }); return this; },
    };
    try {
      Promise.resolve(hit.handler({ user, body, params: hit.params, query: {}, headers: {} }, res)).catch(reject);
    } catch (e) { reject(e); }
  });
}
const fakeExpress = () => mkRouter();
fakeExpress.json = () => (req, res, next) => next && next();
fakeExpress.urlencoded = () => (req, res, next) => next && next();
fakeExpress.static = () => (req, res, next) => next && next();
fakeExpress.Router = mkRouter;

// Any Events.X / GatewayIntentBits.X / ChannelType.X / Partials.X resolves to a
// usable sentinel — the harness only ever needs the handler keys.
const anyKey = (prefix) => new Proxy({}, { get: (_, k) => `${prefix}:${String(k)}` });
const Events = new Proxy({}, { get: (_, k) => String(k) });

const users = new Map();        // id -> user (also client.users.cache)
const channels = new Map();

// What Discord reports. guild-900 is a server the bot was already in before
// this boot (no event fires for it), guild-901 only reaches the gateway as a
// nameless partial — both are what server auto-detection has to cope with.
const guildsCache = new Map([
  ['guild-900', { id: 'guild-900', name: 'Auto Detected', commands: { set: () => Promise.resolve() } }],
  ['guild-901', { id: 'guild-901', unavailable: true }],
]);
const fullGuilds = new Map([
  ['guild-777', { id: 'guild-777', name: 'Late Joiners' }],
  ['guild-900', { id: 'guild-900', name: 'Auto Detected' }],
  ['guild-901', { id: 'guild-901', name: 'Fetched Later' }],
]);
class FakeClient {
  constructor() {
    this.handlers = {};
    this.user = { id: 'bot', username: 'MemeBot', setPresence() {} };
    this.users = { cache: users, fetch: async (id) => users.get(id) || Promise.reject(new Error('unknown user')) };
    // With an id: that one guild (role ops). Without: the full list, like
    // discord.js' fetch() — this is what server auto-detection reads.
    this.guilds = {
      cache: guildsCache,
      fetch: async (id) => (id
        ? { id, roles: { create: async () => ({ id: 'role' }) }, channels: { cache: channels } }
        : fullGuilds),
    };
    this.channels = { cache: channels };
  }
  on(event, fn) { (this.handlers[event] ||= []).push(fn); return this; }
  once(event, fn) { (this.handlers[event] ||= []).push(fn); return this; }
  async login() { return 'ok'; }
  destroy() {}
  isReady() { return true; }
}

const fakeDiscord = {
  Client: FakeClient,
  GatewayIntentBits: anyKey('intent'),
  Partials: anyKey('partial'),
  PermissionsBitField: { Flags: new Proxy({}, { get: (_, k) => String(k) }) },
  ChannelType: anyKey('channel'),
  Events,
};

const fakes = {
  'discord.js': fakeDiscord,
  express: fakeExpress,
  cors: () => (req, res, next) => next && next(),
  dotenv: { config: () => ({ parsed: {} }) },
  http: {
    createServer: () => ({ on() {}, listen(port, cb) { if (cb) cb(); return this; }, close(cb) { if (cb) cb(); } }),
  },
  ws: { WebSocketServer: class { constructor() {} on() {} handleUpgrade() {} emit() {} } },
  './auth-endpoints': {},
  './auth-config': { authMiddleware: (req, res, next) => next && next(), requireRole: () => (req, res, next) => next && next() },
};

const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (parent && parent.filename === path.join(__dirname, '..', '..', 'server.js') && Object.prototype.hasOwnProperty.call(fakes, request)) {
    return typeof fakes[request] === 'function' && !fakes[request].prototype ? fakes[request] : fakes[request];
  }
  return origLoad.call(this, request, parent, isMain);
};

// ── Message plumbing ─────────────────────────────────────────────────────────
const sent = { applicant: [], owner: [], channel: [], stranger: [] };
const mkUser = (id, username, bucket) => ({
  id, username, bot: false,
  send: async (text) => { bucket.push(text); return {}; },
});
const APPLICANT = mkUser('42', 'player', sent.applicant);
const OWNER = mkUser('900', 'memegodmidas', sent.owner);
const STRANGER = mkUser('55', 'random', sent.stranger);
users.set(APPLICANT.id, APPLICANT);
users.set(OWNER.id, OWNER);
users.set(STRANGER.id, STRANGER);

let guildId = 0;
function mkMessage({ content, author, guild = 'guild-1', admin = false, bucket = sent.channel }) {
  return {
    content,
    author,
    guild: guild ? { id: `${guild}-${++guildId}`, name: guild } : null,
    member: guild ? { permissions: { has: (flag) => admin && (flag === 'Administrator' || flag === 'ManageGuild') } } : null,
    channel: { id: guild ? `chan-${guildId}` : `dm-${author.id}`, send: async (t) => { bucket.push(t); return {}; } },
    reply: async (t) => { bucket.push(t); return {}; },
  };
}

async function fire(message) {
  for (const handler of global.botClient.handlers[Events.MessageCreate] || []) await handler(message);
}

// ── Slash-command plumbing ───────────────────────────────────────────────────
let interactionDefers = 0;
const bucketFor = (bucket, payload) => { bucket.push(typeof payload === 'string' ? payload : payload.content); return {}; };

/** A chat-input interaction shaped like discord.js, recorded into `bucket`. */
function mkInteraction({ name, options = {}, user = OWNER, guild = 'guild-1', bucket = sent.owner, member = { permissions: { has: () => true } } }) {
  return {
    isChatInputCommand: () => true,
    commandName: name,
    user,
    member: guild ? member : null,
    guild: guild ? { id: `${guild}-int`, name: guild } : null,
    channelId: guild ? 'chan-int' : `dm-${user.id}`,
    channel: { id: 'chan-int', send: async (t) => bucketFor(bucket, t) },
    options: { data: Object.entries(options).map(([n, v]) => ({ name: n, value: v, type: 3 })) },
    deferReply: async () => { interactionDefers++; return {}; },
    editReply: async (p) => bucketFor(bucket, p),
    followUp: async (p) => bucketFor(bucket, p),
    reply: async (p) => bucketFor(bucket, p),
  };
}
const fireInteraction = async (interaction) => {
  for (const handler of global.botClient.handlers[Events.InteractionCreate] || []) await handler(interaction);
};
const say       = (author, content, opts = {}) => fire(mkMessage({ content, author, ...opts }));
const dmTo      = (author, content) => fire(mkMessage({ content, author, guild: null, bucket: sent.applicant }));
const ownerSays = (content, opts = {}) => fire(mkMessage({ content, author: OWNER, guild: null, bucket: sent.owner, ...opts }));
const wait      = (ms) => new Promise(r => setTimeout(r, ms));

// ── The run ──────────────────────────────────────────────────────────────────
async function main() {
  require(path.join(__dirname, '..', '..', 'server.js'));
  await wait(60);   // let the boot-time whenReady()/listen() promises settle
  const client = global.botClient;
  assert(client instanceof FakeClient, 'server.js booted and registered a Discord client');
  assert(users.get(OWNER.id)?.username === 'memegodmidas', 'owner DM target is cached for the to-do notifications');

  // ── 1. `!Reactapp` opens a DM interview ───────────────────────────────────
  await say(APPLICANT, '!Reactapp');
  assert(has(sent.applicant, 'Welcome to the React request desk'), 'applicant got the welcome DM');
  assert(has(sent.channel, 'RA-1'), 'guild channel was told the application id');
  assert(has(sent.applicant, 'Which React Orb are you spending'), 'first question is the orb picker');
  assert(has(sent.applicant, 'in game with an owner'), 'the request states that the swap happens in game');

  // ── 2. Rare and below: wanted item + name + delivery, then submit ─────────
  await dmTo(APPLICANT, '3');
  assert(has(sent.applicant, 'do you want in return'), 'rare tier asks which item is wanted');
  await dmTo(APPLICANT, 'Netherite Sword');
  await dmTo(APPLICANT, 'Frostbite');
  assert(has(sent.applicant, 'Minecraft username'), 'the in-game name is asked before delivery');
  assert(has(sent.applicant, 'Skyrender'), 'the linked Minecraft account is offered');
  await dmTo(APPLICANT, 'not a name!');
  assert(has(sent.applicant, 'letters, numbers or underscores'), 'a non-username is refused');
  await dmTo(APPLICANT, 'yes');
  assert(has(sent.applicant, 'hand it over'), 'the delivery question follows the answers');
  await dmTo(APPLICANT, 'somewhere near spawn');
  assert(has(sent.applicant, 'base coords'), 'a vague delivery answer is refused');
  await dmTo(APPLICANT, '120 64 -340 nether');
  assert(has(sent.applicant, 'Here is your request'), 'answers summarised before submitting');
  await dmTo(APPLICANT, 'submit');
  assert(has(sent.applicant, 'Submitted!'), 'applicant is told the application was filed');
  assert(has(sent.owner, 'New React request `RA-1`'), 'owner got the request by DM');
  assert(has(sent.owner, 'Netherite Sword') && has(sent.owner, 'Frostbite'), 'owner DM carries the answers');
  assert(has(sent.owner, '120 64 -340') && has(sent.owner, 'Nether'), 'owner DM carries the delivery preference');
  assert(has(sent.owner, 'In-game name') && has(sent.owner, 'Skyrender'), 'owner DM carries the in-game name');
  assert(has(sent.owner, 'stage RA-1'), 'owner DM shows how to move the delivery along');
  assert(has(sent.owner, '`T-1`'), 'owner DM points at the to-do item');

  // ── 3. It lands in db.json (Postgres equivalent in test mode) ─────────────
  await wait(1700);   // state-db debounces writes by 1.5s
  const file = JSON.parse(fs.readFileSync(path.join(tmp, 'db.json'), 'utf8'));
  assert(file.reactApplications?.['RA-1']?.status === 'submitted', 'application persisted as submitted');
  assert(file.reactApplications?.['RA-1']?.name === 'Frostbite', 'answers persisted');
  assert(file.reactApplications?.['RA-1']?.delivery?.coords === '120 64 -340', 'delivery preference persisted');
  assert(file.reactApplications?.['RA-1']?.mcUsername === 'Skyrender', 'the linked name is used when the player replies yes');
  assert(file.ownerTodos?.['T-1']?.status === 'open', 'to-do item persisted as open');
  assert(file.counters?.reactApp === 2 && file.counters?.todo === 2, 'id counters persisted');

  // ── 4. `!todo` for the owner ──────────────────────────────────────────────
  sent.owner.length = 0;
  await ownerSays('!todo');
  assert(has(sent.owner, "Owners' to-do list") && has(sent.owner, '🎬'), 'owner sees the react to-do item');
  const strangerTodos = sent.stranger.length;
  await fire(mkMessage({ content: '!todo', author: STRANGER, guild: null, bucket: sent.stranger }));
  assert(sent.stranger.length === strangerTodos + 1 && has(sent.stranger, "private"), 'to-do list is owner-only');

  // ── 5. Admin review: comment, then ask them to dim down ───────────────────
  await ownerSays('!reactapp comment RA-1 love the name');
  assert(has(sent.applicant, 'love the name'), 'comment is DM\'d to the applicant');
  await ownerSays('!reactapp dim RA-1 drop the instant-kill please');
  assert(has(sent.applicant, 'Dim-down requested'), 'dim-down request is DM\'d to the applicant');
  assert(has(sent.applicant, 'item'), 'the interview reopens at the first field for the revision');
  await dmTo(APPLICANT, 'Wooden Sword');
  await dmTo(APPLICANT, 'Frostbite Jr');
  await dmTo(APPLICANT, 'Skyrender');
  await dmTo(APPLICANT, '200 70 -500 the end');
  await dmTo(APPLICANT, 'submit');
  await wait(1700);
  const revised = JSON.parse(fs.readFileSync(path.join(tmp, 'db.json'), 'utf8')).reactApplications['RA-1'];
  assert(revised.revision === 1 && revised.name === 'Frostbite Jr', 'revision bumped and re-collected');
  assert(revised.dimNote === 'drop the instant-kill please', 'dim-down note kept on the record');
  assert(revised.status === 'submitted', 'revision is back in review');
  assert(has(sent.owner, '`T-1`'), 'to-do item survives a revision');

  // ── 6. A stranger cannot review ───────────────────────────────────────────
  sent.stranger.length = 0;
  await fire(mkMessage({ content: '!reactapp dim RA-1 nerf it', author: STRANGER, guild: null, bucket: sent.stranger }));
  assert(hasAny(sent.stranger, ['not yours', 'Only owners/admins']), 'non-admins cannot review someone else\'s application');
  await fire(mkMessage({ content: '!reactapp approve RA-1', author: STRANGER, guild: 'guild-3', bucket: sent.stranger }));
  assert(hasAny(sent.stranger, ['not yours', 'Only owners/admins']), 'a plain member cannot approve from a guild channel');
  await fire(mkMessage({ content: '!reactapp status', author: STRANGER, guild: null, bucket: sent.stranger }));
  assert(has(sent.stranger, 'no React applications'), 'status shows only the caller\'s own applications');
  await fire(mkMessage({ content: '!reactapp list', author: APPLICANT, guild: null, bucket: sent.applicant }));
  assert(has(sent.applicant, 'RA-1'), 'applicant can list their own application');

  // ── 7. Allowing a request leaves it on the board for the customer's OK ────
  await ownerSays('!reactapp approve RA-1 looks great');
  assert(has(sent.applicant, 'is allowed!'), 'the customer is asked to confirm the order');
  assert(has(sent.applicant, '`confirm`'), 'the confirm word is spelled out');
  assert(has(sent.owner, 'waiting on'), 'the owner is told who they are waiting on');
  await wait(1700);
  const allowed = JSON.parse(fs.readFileSync(path.join(tmp, 'db.json'), 'utf8'));
  assert(allowed.reactApplications['RA-1'].status === 'approved', 'the allowance persisted');
  assert(allowed.reactApplications['RA-1'].stage === null, 'nothing is being built before the customer confirms');
  assert(allowed.ownerTodos['T-1'].status === 'open', 'the job stays on the to-do list until it is delivered');
  await ownerSays('!todo');
  assert(has(sent.owner, 'Frostbite Jr'), 'the to-do list still shows the allowed job');

  // ── 7b. The customer confirms, then the owners walk the delivery along ────
  sent.applicant.length = 0;
  sent.owner.length = 0;
  await dmTo(APPLICANT, 'confirm');
  assert(has(sent.applicant, 'Order locked in'), 'the customer is told the order is locked in');
  assert(has(sent.owner, 'confirmed — ready to build'), 'the owners are told to start on it');
  await wait(1700);
  const confirmed = JSON.parse(fs.readFileSync(path.join(tmp, 'db.json'), 'utf8')).reactApplications['RA-1'];
  assert(confirmed.status === 'queued' && confirmed.stage === 'not_started', 'the confirmed order enters the pipeline');
  assert(!!confirmed.confirmedAt, 'the confirm is timestamped');

  sent.applicant.length = 0;
  await ownerSays('!reactapp stage RA-1 making');
  assert(has(sent.owner, 'Started making'), 'the owner moves the stage forward');
  sent.applicant.length = 0;
  await ownerSays('!reactapp stage RA-1 ready');
  assert(has(sent.applicant, 'Your item is ready'), 'the customer is told it is ready');
  assert(has(sent.applicant, '200 70 -500'), 'the ready DM carries the delivery coords');
  sent.applicant.length = 0;
  await ownerSays('!reactapp stage RA-1 delivered');
  assert(has(sent.applicant, 'Delivered!'), 'the customer is told it was delivered');
  await wait(1700);
  const deliveredRa1 = JSON.parse(fs.readFileSync(path.join(tmp, 'db.json'), 'utf8'));
  assert(deliveredRa1.reactApplications['RA-1'].status === 'delivered', 'delivered sticks');
  assert(deliveredRa1.ownerTodos['T-1'].status === 'done', 'delivering closes the to-do item');
  await ownerSays('!todo');
  assert(has(sent.owner, 'to-do list is empty'), 'nothing left open once it is delivered');
  await ownerSays('!reactapp stage RA-1 banana');
  assert(has(sent.owner, 'Unknown stage'), 'an unknown stage is refused');
  await dmTo(APPLICANT, '!reactapp cancel RA-1');
  assert(has(sent.applicant, 'already'), 'a delivered request cannot be cancelled');

  // ── 8. A `Manage Server` holder counts as an admin ────────────────────────
  await fire(mkMessage({ content: '!reactapp view RA-1', author: STRANGER, guild: 'guild-2', admin: true, bucket: sent.stranger }));
  assert(has(sent.stranger, 'Applicant:') && has(sent.stranger, 'Frostbite Jr'), 'Manage Server holder can view an application');

  // ── 9. Cancel throws a draft away ────────────────────────────────────────
  sent.applicant.length = 0;
  await say(APPLICANT, '!Reactapp');
  await dmTo(APPLICANT, '11');
  await dmTo(APPLICANT, 'cancel');
  assert(has(sent.applicant, 'cancelled'), 'cancel is confirmed in the DM');
  await wait(1700);
  const cancelled = JSON.parse(fs.readFileSync(path.join(tmp, 'db.json'), 'utf8'));
  assert(cancelled.reactApplications['RA-2']?.status === 'withdrawn', 'cancelled draft persisted as withdrawn');
  assert(!cancelled.ownerTodos || Object.values(cancelled.ownerTodos).every(t => t.status === 'done' || t.appId !== 'RA-2'),
    'a cancelled draft never leaves a to-do item behind');
  // A plain DM after the cancel is no longer an interview answer: server.js
  // falls through to the XP call, which has no API to talk to in this harness.
  const before = sent.applicant.length;
  try { await dmTo(APPLICANT, 'hello?'); } catch (_) { /* expected: no API server in the test */ }
  assert(sent.applicant.length === before, 'after a cancel, plain DMs are no longer interview answers');

  // ── 10. Resume an abandoned draft ─────────────────────────────────────────
  await say(APPLICANT, '!Reactapp');
  await dmTo(APPLICANT, '7');
  sent.applicant.length = 0;
  await say(APPLICANT, '!Reactapp');
  assert(has(sent.applicant, 'Resuming your React request `RA-3`'), 'a second !Reactapp resumes the draft');
  assert(has(sent.applicant, 'name'), 'resume re-asks the outstanding question');

  // ── 11. Dashboard API: the queue, its scoping, and the review actions ─────
  const accountsDb = require(path.join(__dirname, '..', '..', 'accounts-db.js'));
  await accountsDb.whenReady();
  const master = accountsDb.getMasterAccount();
  assert(!!master, 'official owner account is available to the dashboard');
  const MASTER = { role: 'master', userId: master.id };

  const created = accountsDb.createAccount('dash-owner@civbot.test', 'Passw0rd#2026', 'DashOwner', 'owner');
  assert(created.success && created.role === 'owner', 'a second (owner) dashboard account was created');
  const OWNER_ACCOUNT = { role: 'owner', userId: created.userId };

  const queueAsMaster = await callApi('get /api/react-applications', { user: MASTER });
  assert(queueAsMaster.status === 200 && queueAsMaster.body.length === 3, 'master sees every application');
  const ra3 = queueAsMaster.body.find(a => a.id === 'RA-3');
  assert(ra3?.tierLabel === 'Mythic' && ra3?.rank === 7, 'queue rows carry the tier label + rank');
  assert(/In progress/.test(ra3?.statusLabel || ''), 'queue rows carry a status label');
  assert(ra3?.stageLabel === null, 'a draft has no delivery stage yet');
  assert(ra3?.mcUsername === '', 'the in-game name is empty until it is answered');

  const unscoped = await callApi('get /api/react-applications', { user: OWNER_ACCOUNT });
  assert(unscoped.body.length === 0, 'an owner with no assigned server sees nothing');

  // Register RA-3's guild and hand it to the dashboard owner.
  const added = await callApi('post /api/servers/add', { user: MASTER, body: { serverId: ra3.guildId, serverName: 'Test Guild' } });
  assert(added.body.success === true, 'guild registered for the owner');
  accountsDb.setServerOwner(created.userId, ra3.guildId);
  const scoped = await callApi('get /api/react-applications', { user: OWNER_ACCOUNT });
  assert(scoped.body.length === 1 && scoped.body[0].id === 'RA-3', 'owner sees only their own server\'s applications');

  const denied = await callApi('post /api/react-applications/RA-1/comment', { user: OWNER_ACCOUNT, body: { text: 'not mine' } });
  assert(denied.status === 403, 'owner cannot touch another server\'s application');
  const missing = await callApi('post /api/react-applications/RA-99/comment', { user: MASTER, body: { text: 'x' } });
  assert(missing.status === 404, 'unknown application ids 404');
  const emptyComment = await callApi('post /api/react-applications/RA-3/comment', { user: OWNER_ACCOUNT, body: { text: '   ' } });
  assert(emptyComment.status === 400, 'a blank comment is rejected');

  sent.applicant.length = 0;
  const commented = await callApi('post /api/react-applications/RA-3/comment', { user: OWNER_ACCOUNT, body: { text: 'nice concept' } });
  assert(commented.body.success === true, 'comment saved from the dashboard');
  assert(has(sent.applicant, 'nice concept'), 'dashboard comment is DM\'d to the applicant');
  assert(commented.body.application.comments.length === 1, 'comment is on the returned application');

  // Finish RA-3's interview in DMs, then review it from the dashboard.
  await dmTo(APPLICANT, 'Sunder');
  await dmTo(APPLICANT, 'Netherite Axe');
  await dmTo(APPLICANT, 'Flight, Energy Blast');
  await dmTo(APPLICANT, 'Skyrender');
  await dmTo(APPLICANT, 'wait');
  await dmTo(APPLICANT, 'submit');
  assert(has(sent.owner, '`RA-3`'), 'submitted request DMs the owners with its id');

  const todos = await callApi('get /api/owner-todos', { user: OWNER_ACCOUNT });
  const ra3Todo = todos.body.find(t => t.appId === 'RA-3');
  assert(!!ra3Todo && ra3Todo.application?.name === 'Sunder', 'the to-do feed carries the application summary');
  assert(/online/.test(ra3Todo.application?.deliveryLabel || ''), 'the to-do feed carries the delivery preference');
  assert(ra3Todo.application?.mcUsername === 'Skyrender', 'the to-do feed carries the in-game name');
  const draftStage = await callApi('post /api/react-applications/RA-3/stage', { user: OWNER_ACCOUNT, body: { stage: 'making' } });
  assert(draftStage.status === 400, 'a request still in progress cannot be moved along the delivery board');

  sent.applicant.length = 0;
  const dimmed = await callApi('post /api/react-applications/RA-3/dim', { user: OWNER_ACCOUNT, body: { text: 'drop flight' } });
  assert(dimmed.body.application.status === 'draft' && dimmed.body.application.revision === 1, 'dashboard dim reopens the interview');
  assert(has(sent.applicant, 'Dim-down requested') && has(sent.applicant, 'drop flight'), 'dashboard dim DMs the applicant');
  assert(has(sent.applicant, 'name'), 'the reopened interview asks the first question again');

  await dmTo(APPLICANT, 'Sunder II');
  await dmTo(APPLICANT, 'Netherite Axe');
  await dmTo(APPLICANT, 'Energy Blast');
  await dmTo(APPLICANT, 'Skyrender');
  await dmTo(APPLICANT, 'wait');
  await dmTo(APPLICANT, 'submit');
  sent.applicant.length = 0;
  const approvedRes = await callApi('post /api/react-applications/RA-3/approve', { user: OWNER_ACCOUNT, body: { text: 'approved by the dashboard' } });
  assert(approvedRes.body.application.status === 'approved', 'allowing from the dashboard sticks');
  assert(/Waiting for the customer/.test(approvedRes.body.application.stageLabel || ''), 'the queue shows it is waiting on the customer');
  assert(has(sent.applicant, 'is allowed!') && has(sent.applicant, 'Sunder II'), 'the customer is asked to confirm');

  const afterAllow = await callApi('get /api/owner-todos', { user: OWNER_ACCOUNT });
  const allowedTodo = afterAllow.body.find(t => t.appId === 'RA-3');
  assert(!!allowedTodo, 'an allowed job stays on the to-do list');
  assert(/Waiting for the customer/.test(allowedTodo.text || ''), 'the to-do line tracks the new state');

  // The customer locks the order in, then the owner walks the delivery board.
  sent.applicant.length = 0;
  await dmTo(APPLICANT, '!reactapp confirm RA-3');
  assert(has(sent.applicant, 'confirmed'), 'the customer can confirm with a command');
  await wait(1700);
  const queued = JSON.parse(fs.readFileSync(path.join(tmp, 'db.json'), 'utf8')).reactApplications['RA-3'];
  assert(queued.status === 'queued' && queued.stage === 'not_started', 'the confirmed order is queued');

  const badStage = await callApi('post /api/react-applications/RA-3/stage', { user: OWNER_ACCOUNT, body: { stage: 'banana' } });
  assert(badStage.status === 400, 'an unknown stage is rejected by the API');
  const noStage = await callApi('post /api/react-applications/RA-3/stage', { user: OWNER_ACCOUNT, body: {} });
  assert(noStage.status === 400, 'a missing stage is rejected');

  const making = await callApi('post /api/react-applications/RA-3/stage', { user: OWNER_ACCOUNT, body: { stage: 'making' } });
  assert(/Started making/.test(making.body.application?.stageLabel || ''), 'the dashboard moves the stage');
  const almost = await callApi('post /api/react-applications/RA-3/stage', { user: OWNER_ACCOUNT, body: { stage: '3' } });
  assert(/Almost/.test(almost.body.application?.stageLabel || ''), 'the stage buttons accept the number');

  sent.applicant.length = 0;
  await callApi('post /api/react-applications/RA-3/stage', { user: OWNER_ACCOUNT, body: { stage: 'ready' } });
  assert(has(sent.applicant, 'ready'), 'marking it ready DMs the customer');
  assert(has(sent.applicant, 'online'), 'the ready DM repeats their delivery preference');
  assert(has(sent.applicant, 'Skyrender'), 'the ready DM names the in-game player');
  const deliveredRes = await callApi('post /api/react-applications/RA-3/stage', { user: OWNER_ACCOUNT, body: { stage: 'delivered' } });
  assert(deliveredRes.body.application?.status === 'delivered', 'the dashboard can mark it delivered');
  assert(deliveredRes.body.closed === 1, 'delivering closes the to-do item');

  const afterTodos = await callApi('get /api/owner-todos', { user: OWNER_ACCOUNT });
  assert(!afterTodos.body.some(t => t.appId === 'RA-3'), 'nothing left open for the delivered request');
  const manualAdd = await callApi('post /api/owner-todos/RA-3/done', { user: OWNER_ACCOUNT });
  assert(manualAdd.status === 404, 'a non-to-do id 404s');

  const fetched = await callApi('get /api/react-applications/RA-3', { user: OWNER_ACCOUNT });
  assert(fetched.body.comments.length === 8 && fetched.body.status === 'delivered', 'single-application fetch returns the comment trail + status');
  assert(fetched.body.comments.some(c => c.kind === 'stage'), 'the delivery stages are logged on the request');

  await wait(1700);
  const apiPersisted = JSON.parse(fs.readFileSync(path.join(tmp, 'db.json'), 'utf8'));
  assert(apiPersisted.reactApplications['RA-3'].status === 'delivered', 'dashboard delivery persisted to the store');
  assert(Object.values(apiPersisted.ownerTodos).every(t => t.status === 'done'), 'every to-do item is closed at the end');

  // ── 12. Servers show up as soon as the bot is in them ────────────────────
  const guildHandlers = global.botClient.handlers[Events.GuildCreate] || [];
  assert(guildHandlers.length === 1, 'the bot listens for guild joins');
  let registeredSlash = [];
  await guildHandlers[0]({
    id: 'guild-777', name: 'Late Joiners',
    commands: { set: (cmds) => { registeredSlash = cmds; return Promise.resolve(); } },
  });
  const serversRes = await callApi('get /api/servers', { user: MASTER });
  assert(serversRes.body.some(s => s.serverId === 'guild-777' && s.serverName === 'Late Joiners'),
    'a server the bot joins appears in the dashboard without a restart');
  await wait(1700);
  const serverPersisted = JSON.parse(fs.readFileSync(path.join(tmp, 'db.json'), 'utf8'));
  assert(serverPersisted.servers?.['guild-777']?.serverName === 'Late Joiners',
    'the joined server is persisted, not just cached in memory');

  // ── 13. Slash commands: registered, validated, and the same implementation ─
  const slashNames = registeredSlash.map(c => c.name);
  assert(registeredSlash.length >= 50, `${registeredSlash.length} slash commands are registered`);
  assert(['help', 'reactapp', 'todo', 'secret'].every(n => slashNames.includes(n)),
    'the suite covers help, reactapp, todo and the owner-only secret');
  assert(slashNames.every(n => /^[-_\p{L}\p{N}]{1,32}$/u.test(n)), 'every command name passes Discord\'s rules');
  assert(registeredSlash.every(c => c.description && c.description.length <= 100
    && (c.options || []).every(o => /^[-_\p{L}\p{N}]{1,32}$/u.test(o.name) && o.description && o.description.length <= 100)),
    'every description and option name fits Discord\'s limits');

  sent.owner.length = 0;
  await fireInteraction(mkInteraction({ name: 'todo', options: { args: 'add buy more torches' } }));
  assert(/Added `T-\d+`/.test(sent.owner.join('\n')), '/todo add runs through the interaction adapter');
  assert(interactionDefers > 0, 'slash replies are deferred before the command runs');
  await wait(1700);
  const slashTodo = JSON.parse(fs.readFileSync(path.join(tmp, 'db.json'), 'utf8'));
  assert(Object.values(slashTodo.ownerTodos).some(t => t.text === 'buy more torches' && t.status === 'open'),
    'free text from the slash option is split into args and stored');

  sent.applicant.length = 0;
  await fireInteraction(mkInteraction({
    name: 'todo', user: APPLICANT, bucket: sent.applicant,
    member: { permissions: { has: () => false } },
  }));
  assert(has(sent.applicant, 'private'), 'the slash path keeps the same owner-only checks');

  sent.owner.length = 0;
  await fireInteraction(mkInteraction({ name: 'rps', options: { choice: 'rock' } }));
  assert(has(sent.owner, 'vs') && hasAny(sent.owner, ['You win!', 'You lose!', 'Tie!']),
    'a named option lands in args[0] like the prefix path');

  sent.owner.length = 0;
  await fireInteraction(mkInteraction({ name: 'help' }));
  assert(has(sent.owner, 'Available Commands') && has(sent.owner, '`/reactapp`') && has(sent.owner, '`!` prefix'),
    'the help text lists the slash commands and the kept prefix');

  // ── 14. Every server is detected automatically ────────────────────────────
  // Wipe the list: guild-900 was never announced by an event, guild-901 is only
  // a nameless partial in the gateway cache — both still have to turn up.
  for (const s of (await callApi('get /api/servers', { user: MASTER })).body) {
    await callApi(`delete /api/servers/${s.serverId}`, { user: MASTER });
  }
  const healed = await callApi('get /api/servers', { user: MASTER });
  const healedIds = healed.body.map(s => s.serverId);
  assert(healedIds.length === 3 && ['guild-777', 'guild-900', 'guild-901'].every(id => healedIds.includes(id)),
    'an empty server list re-detects every guild on its own');
  assert(healed.body.find(s => s.serverId === 'guild-900')?.serverName === 'Auto Detected',
    'a guild the bot was already in is detected without any event');
  assert(healed.body.find(s => s.serverId === 'guild-901')?.serverName === 'Fetched Later',
    'a partial guild gets its real name from the REST fetch');

  await callApi('post /api/servers/add', { user: MASTER, body: { serverId: 'guild-999', serverName: 'Never Joined' } });
  const syncRes = await callApi('post /api/servers/sync', { user: MASTER });
  assert(syncRes.body.success === true && syncRes.body.total === 3, 'the sync endpoint reports every guild Discord knows');
  assert(syncRes.body.gone === 1, 'a server the bot is not in is flagged by the sync');
  const resynced = await callApi('post /api/servers/sync', { user: MASTER });
  assert(resynced.body.added === 0 && resynced.body.total === 3, 'a second sync is a no-op when nothing changed');
  const flagged = (await callApi('get /api/servers', { user: MASTER })).body;
  assert(!!flagged.find(s => s.serverId === 'guild-999')?.goneAt, 'a server the bot is not in stays on record, flagged');
  assert(flagged.find(s => s.serverId === 'guild-900')?.goneAt === undefined, 'servers the bot is still in are not flagged');

  // ── 15. The background timer re-syncs without a dashboard visit ──────────
  assert(typeof global.__guildSyncTick === 'function', 'the background sync tick is wired up');
  await callApi('delete /api/servers/guild-900', { user: MASTER });
  const afterDelete = (await callApi('get /api/servers', { user: MASTER })).body.map(s => s.serverId);
  assert(!afterDelete.includes('guild-900'), 'a stored server can be removed');
  const ticked = await global.__guildSyncTick({ force: true });
  assert(ticked.synced === true && ticked.total === 3, 'one tick asks Discord for the guild list');
  const afterTick = (await callApi('get /api/servers', { user: MASTER })).body.map(s => s.serverId);
  assert(afterTick.includes('guild-900'), 'the tick restores a server nobody asked about');
  const quiet = await global.__guildSyncTick();
  assert(quiet.synced === false && quiet.reason === 'throttled', 'ticks are throttled so the timer stays cheap');

  // ── 16. A removal is a warning, not a quiet footnote ────────────────────
  // Sync-discovered removal: a server nobody announced, picked up by a scan.
  sent.owner.length = 0;
  await callApi('post /api/servers/add', { user: MASTER, body: { serverId: 'guild-404', serverName: 'Ghost Town' } });
  await global.__guildSyncTick({ force: true });
  assert(has(sent.owner, 'removed from') && has(sent.owner, 'Ghost Town'),
    'a server flagged by a background scan warns the owners, not just the live event');

  const deleteHandlers = global.botClient.handlers[Events.GuildDelete] || [];
  assert(deleteHandlers.length === 1, 'the bot listens for guild removals');

  // Live event path: the kick must flag the server *and* DM the owners.
  sent.owner.length = 0;
  await deleteHandlers[0]({ id: 'guild-777', name: 'Late Joiners' });
  assert(has(sent.owner, 'removed from') && has(sent.owner, 'Late Joiners'), 'a live removal DMs the owners by name');
  assert(has(sent.owner, 'Re-invite'), 'the DM says how to put the bot back');
  const kicked = (await callApi('get /api/servers', { user: MASTER })).body.find(s => s.serverId === 'guild-777');
  assert(!!kicked?.goneAt, 'the removed server is flagged in the dashboard list');

  // One warning per removal — a repeat event must not re-DM an already-flagged server.
  sent.owner.length = 0;
  await deleteHandlers[0]({ id: 'guild-777', name: 'Late Joiners' });
  assert(sent.owner.length === 0, 'the owners are warned once, not on every event');

  // Re-invited: the flag clears and the owners get the good news.
  sent.owner.length = 0;
  await global.__guildSyncTick({ force: true });
  assert(has(sent.owner, "I'm back in") && has(sent.owner, 'Late Joiners'), 'a re-invite DMs the owners that the bot is back');
  const back = (await callApi('get /api/servers', { user: MASTER })).body.find(s => s.serverId === 'guild-777');
  assert(back?.goneAt === undefined, 'the dashboard flag clears once the bot is back');

  // The "is detection still alive?" badge the Servers tab reads.
  const syncStatus = await callApi('get /api/servers/sync-status', { user: MASTER });
  assert(!!syncStatus.body.at && syncStatus.body.intervalMinutes > 0 && syncStatus.body.online === true,
    'the dashboard can ask when detection last ran');
  await wait(1700);
  const syncPersisted = JSON.parse(fs.readFileSync(path.join(tmp, 'db.json'), 'utf8'));
  assert(!!syncPersisted.lastServerSync?.at, 'the last-sync stamp survives a restart');

  if (failures) { console.error(`\n❌ ${failures} react-command check(s) failed`); process.exitCode = 1; }
  else console.log('\n✅ all react-command checks passed');
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) { /* Windows may hold the dir */ }
  process.exit(failures ? 1 : 0);
}

main().catch(e => { console.error('❌ [react-cmd] harness crash:', e); process.exit(1); });
