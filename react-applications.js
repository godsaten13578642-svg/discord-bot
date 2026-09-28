// ── React Applications ───────────────────────────────────────────────────────
// The state machine behind `!Reactapp`. MemeBot DMs the player a short
// interview, collects exactly the fields their tier needs, then files the
// finished request on the owners' to-do list.
//
// This is an **orb-for-item request queue**: the player spends a React Orb and
// asks for an item in return. The orb hand-over and the item delivery both
// happen in game with an owner — this file only records the request, so nobody
// has to catch an owner in real time.
//
// The ladder matches the resource pack's 11 React Orb tiers, and the fields
// asked scale with it:
//
//   Common / Uncommon / Rare (1–3)   →  item wanted, name
//   Epic (4)                         →  name, item, *suggested* ability list
//   Legendary … Transcend (5–11)     →  name, item, full ability list
//
// Every tier ends with the same extra questions:
//
//   mcUsername  →  the in-game name the item is handed to
//   delivery    →  base coords to drop it at, or "wait" to hand it over online
//
// After the owners allow the request the customer gets one final confirm, and
// the job then moves through DELIVERY_STAGES until an owner marks it delivered.
//
// This file deliberately has no discord.js dependency: the whole flow is plain
// data in / data out, so it can be unit-tested without a gateway connection
// (see minecraft-plugin/tools/test-react-applications.js).
'use strict';

const TIERS = [
  { key: 'common',    label: 'Common',    rank: 1,  fields: ['item', 'name'] },
  { key: 'uncommon',  label: 'Uncommon',  rank: 2,  fields: ['item', 'name'] },
  { key: 'rare',      label: 'Rare',      rank: 3,  fields: ['item', 'name'] },
  { key: 'epic',      label: 'Epic',      rank: 4,  fields: ['name', 'item', 'suggestedAbilities'] },
  { key: 'legendary', label: 'Legendary', rank: 5,  fields: ['name', 'item', 'abilities'] },
  { key: 'heroic',    label: 'Heroic',    rank: 6,  fields: ['name', 'item', 'abilities'] },
  { key: 'mythic',    label: 'Mythic',    rank: 7,  fields: ['name', 'item', 'abilities'] },
  { key: 'demigod',   label: 'Demi God',  rank: 8,  fields: ['name', 'item', 'abilities'] },
  { key: 'semiop',    label: 'Semi OP',   rank: 9,  fields: ['name', 'item', 'abilities'] },
  { key: 'god',       label: 'God',       rank: 10, fields: ['name', 'item', 'abilities'] },
  { key: 'transcend', label: 'Transcend', rank: 11, fields: ['name', 'item', 'abilities'] },
];

const MAX_ABILITIES = 24;
const MAX_NAME = 48;
const MAX_ITEM = 120;
const MAX_ANSWER = 400;
const MAX_COMMENT = 600;

// Tiers that build their React out of the whole ability list vs. a wishlist.
const EPIC_RANK = 4;

// Asked of every tier, after the design questions.
const PLAYER_STEP = 'mcUsername';
const DELIVERY_STEP = 'delivery';

// A Minecraft account name: 3–16 letters, digits or underscores.
const PLAYER_NAME_RE = /^[A-Za-z0-9_]{3,16}$/;
const PLAYER_NAME_ERROR = '❌ That does not look like a Minecraft username — 3–16 letters, numbers or underscores (e.g. `Notch`).';

/**
 * The design fields a tier asks, plus the in-game name and delivery question
 * everyone gets.
 */
const fieldsForTier = (tier) => (tier ? [...tier.fields, PLAYER_STEP, DELIVERY_STEP] : []);

const STATUS_LABELS = {
  draft:     '📝 In progress',
  submitted: '🕓 Awaiting review',
  needs_dim: '🔻 Dim-down requested',
  approved:  '👍 Allowed',
  queued:    '📦 In delivery',
  delivered: '✅ Delivered',
  rejected:  '❌ Rejected',
  withdrawn: '🚫 Withdrawn',
};

// Terminal states — nothing more happens to these.
const CLOSED_STATUSES = ['delivered', 'rejected', 'withdrawn'];

// ── Delivery pipeline ────────────────────────────────────────────────────────
// The owner-facing progress buttons: an approved request sits at `approved`
// (waiting for the customer to confirm), then walks these stages once it is
// `queued`. `delivered` closes the job off the owners' to-do list.
const DELIVERY_STAGES = [
  { key: 'not_started', index: 1, label: '🕐 Not started' },
  { key: 'making',      index: 2, label: '🛠️ Started making' },
  { key: 'almost',      index: 3, label: '⏳ Almost done' },
  { key: 'ready',       index: 4, label: '📦 Ready for the customer' },
  { key: 'delivered',   index: 5, label: '✅ Delivered' },
];

const STAGE_ALIASES = {
  not_started: ['notstarted', 'queued', 'waiting', 'new', 'todo'],
  making:      ['making', 'startedmaking', 'started', 'inprogress', 'building', 'wip'],
  almost:      ['almost', 'almostdone', 'nearly', 'nearlydone', 'finishing'],
  ready:       ['ready', 'readyforpickup', 'readyfortheuser', 'readyfortheusertogeton', 'pickup', 'built'],
  delivered:   ['delivered', 'handedover', 'handed', 'complete', 'completed', 'finished', 'done'],
};

// Words that mean "don't leave it in a chest — hand it to me while I'm on".
const ONLINE_WORDS = [
  'wait', 'online', 'whenonline', 'whenimon', 'whenon', 'inperson', 'person',
  'later', 'me', 'hand', 'handover', 'waitforme', 'imonline',
];

// Looser than the exact list above: "when i'm on", "wait for me", "come online".
const ONLINE_HINTS = ['wait', 'online', 'inperson', 'whenim', 'wheniam', 'whenon', 'comegetme', 'handover'];

const DIMENSIONS = { overworld: 'Overworld', nether: 'Nether', theend: 'The End', end: 'The End' };

const norm = (s) => String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]/g, '');

function tierOf(app) {
  if (!app || !app.tier) return null;
  return TIERS.find(t => t.key === app.tier) || null;
}
const tierByRank = (rank) => TIERS.find(t => t.rank === rank) || null;

/** Accepts a 1-based number, a tier key, or a tier label ("semi-op", "Demi God"). */
function parseTier(input) {
  const raw = String(input == null ? '' : input).trim();
  if (!raw) return null;
  const digits = raw.match(/^(\d{1,2})\s*[.)-]?$/);
  if (digits) return TIERS[Number(digits[1]) - 1] || null;
  const k = norm(raw.replace(/^!+/, ''));
  return TIERS.find(t => norm(t.key) === k || norm(t.label) === k) || null;
}

function parseAbilities(text) {
  const seen = new Set();
  const out = [];
  for (const raw of String(text == null ? '' : text).split(/[\n,;|]+/)) {
    const cleaned = raw.replace(/^[\s\-*•>]*(?:\d+[.)]\s*)?/, '').trim().replace(/\s+/g, ' ');
    if (!cleaned) continue;
    const key = norm(cleaned);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(cleaned.slice(0, 80));
    if (out.length >= MAX_ABILITIES) break;
  }
  return out;
}

const isNone = (text) => ['none', 'nothing', 'na', 'nil', 'no'].includes(norm(text));

/**
 * Reads the delivery preference: base coords ("120 64 -340", "-40 70 900 nether")
 * or "wait" for a hand-over while the player is online. Returns null when the
 * answer is neither.
 */
function parseDelivery(input) {
  const raw = String(input == null ? '' : input).trim();
  if (!raw) return null;
  const plain = norm(raw);
  if (ONLINE_WORDS.includes(plain) || ONLINE_HINTS.some(h => plain.includes(h))) return { mode: 'online' };
  const dimMatch = raw.match(/\b(overworld|nether|the\s*end|end)\b/i);
  const nums = raw.replace(/\b(overworld|nether|the\s*end|end)\b/gi, ' ').match(/-?\d+(?:\.\d+)?/g);
  if (!nums || nums.length < 3) return null;
  return {
    mode: 'coords',
    coords: nums.slice(0, 3).map(n => String(Number(n))).join(' '),
    dimension: (dimMatch && DIMENSIONS[norm(dimMatch[1])]) || 'Overworld',
  };
}

/** One line for the owners: where the item should end up. */
function deliveryLabel(delivery) {
  if (!delivery) return '—';
  if (delivery.mode === 'online') return '🧍 Hand it over while the customer is online';
  const dim = delivery.dimension ? ` (${delivery.dimension})` : '';
  return `📍 Leave it at ${delivery.coords}${dim}`;
}

/** Owner-facing progress words — "Not started", "Ready for the customer", … */
function parseStage(input) {
  const raw = String(input == null ? '' : input).trim();
  if (!raw) return null;
  const digits = raw.match(/^(\d)$/);
  if (digits) return DELIVERY_STAGES.find(s => s.index === Number(digits[1])) || null;
  const k = norm(raw.replace(/^!+/, ''));
  const exact = DELIVERY_STAGES.find(s => norm(s.key) === k || norm(s.label) === k);
  if (exact) return exact;
  return DELIVERY_STAGES.find(s => (STAGE_ALIASES[s.key] || []).includes(k)) || null;
}

/** The stage badge for an application, or null when it is not in delivery yet. */
function stageLabelOf(app) {
  if (!app) return null;
  if (app.status === 'approved' && !app.stage) return '⏸️ Waiting for the customer to confirm';
  if (app.status === 'delivered') return DELIVERY_STAGES[DELIVERY_STAGES.length - 1].label;
  const stage = DELIVERY_STAGES.find(s => s.key === app.stage);
  return stage ? stage.label : null;
}

/**
 * Moves the job along the delivery pipeline. Setting any stage also lifts an
 * `approved` request into `queued` — an owner who starts building has clearly
 * taken it on. Returns the stage, or null when the key is not recognised.
 */
function setStage(app, input, at = new Date().toISOString()) {
  const stage = parseStage(input);
  if (!stage) return null;
  app.stage = stage.key;
  app.stageAt = at;
  app.updatedAt = at;
  if (app.status === 'approved') app.status = 'queued';
  if (stage.key === 'delivered') app.status = 'delivered';
  return stage;
}

/** The customer's final "yes, that's what I want" — locks the order in. */
function confirmOrder(app, at = new Date().toISOString()) {
  if (!app) return null;
  // An owner may already have started (which lifts an allowed request into the
  // pipeline) — that confirm only stamps the record, it never resets the stage.
  if (app.status === 'queued') {
    if (!app.confirmedAt) { app.confirmedAt = at; app.updatedAt = at; }
    return app;
  }
  if (app.status !== 'approved') return null;
  app.status = 'queued';
  app.stage = 'not_started';
  app.stageAt = at;
  app.confirmedAt = at;
  app.updatedAt = at;
  return app;
}

/** True while an allowed request is still waiting on the customer's confirm. */
const awaitingConfirm = (app) => !!app && app.status === 'approved';

// ── Prompts ──────────────────────────────────────────────────────────────────
const IN_GAME_NOTE = 'Your orb and your item change hands **in game with an owner** — '
  + 'this form only files the request, so never send items, orbs or payment over Discord.';

function tierPrompt(app) {
  const row = (ranks) => ranks
    .map(r => { const t = tierByRank(r); return `**${t.rank}** ${t.label}`; })
    .join(' · ');
  return [
    '🎬 **React request** — let\'s get it filed with the owners.',
    '',
    '**Which React Orb are you spending?**',
    '*(the orb is what you hand over — the item you ask for comes back to you)*',
    '',
    row([1, 2, 3]) + '   *(wanted item + name)*',
    '',
    `**${EPIC_RANK}** Epic   *(name + wanted item + suggested abilities)*`,
    '',
    TIERS.filter(t => t.rank > EPIC_RANK).map(t => `**${t.rank}** ${t.label}`).join(' · ') + '   *(name + wanted item + full ability list)*',
    '',
    app && app.tier ? `You picked **${tierOf(app).label}** last time — pick again to change it.` : '',
    IN_GAME_NOTE,
    'Reply with the **number** or the **name** of the tier. Type `cancel` any time to stop.',
  ].filter(Boolean).join('\n');
}

function fieldPrompt(app, step) {
  const tier = tierOf(app);
  const tierLabel = tier ? `**${tier.label}** ` : '';
  switch (step) {
    case 'name':
      return `✏️ What **name** should your ${tierLabel}item go by?\n*(just the name — e.g. \`Frostbite\`)*`;
    case 'item':
      return '🧱 Which **item** do you want in return?\n*(e.g. `Netherite Sword`, `Pumpkin`, `custom kyber crystal`)*';
    case 'suggestedAbilities':
      return '✨ List the abilities you would **like** your React to have.\n'
        + '*One per line or comma-separated. These are a suggestion — the owners will trim them to fit Epic.*\n'
        + '*(reply `none` if you have no preferences, `back` to change your last answer)*';
    case 'abilities':
      return `⚡ List **every ability** your React has — the full kit, one per line or comma-separated.\n`
        + `*(up to ${MAX_ABILITIES}; reply \`back\` to change your last answer)*`;
    case 'mcUsername':
      return '🎮 What is your **Minecraft username**?\n'
        + '*(the account you play and trade on — 3–16 letters, numbers or underscores)*\n'
        + (app.mcLinkedName ? `*(your linked Minecraft account is \`${app.mcLinkedName}\` — reply \`yes\` to use it)*\n` : '')
        + '*(reply `back` to change your last answer)*';
    case 'delivery':
      return '📍 **How should we hand it over when it\'s ready?**\n'
        + '*Reply with your base **coords** to have it left in a chest for you (e.g. `120 64 -340`, or `120 64 -340 nether`), '
        + 'or `wait` if you would rather be online when an owner gives it to you.*\n'
        + '*(reply `back` to change your last answer)*';
    default:
      return '…';
  }
}

function abilityLines(app) {
  const lines = [];
  if (app.suggestedAbilities.length) {
    lines.push(`**Suggested abilities (${app.suggestedAbilities.length}):**`);
    lines.push(...app.suggestedAbilities.map(a => `• ${a}`));
  }
  if (app.abilities.length) {
    lines.push(`**Abilities (${app.abilities.length}):**`);
    lines.push(...app.abilities.map(a => `• ${a}`));
  }
  return lines;
}

/** Applicant-facing summary of the answers so far. */
function summaryLines(app) {
  const tier = tierOf(app);
  const lines = [
    `**Orb you hand over:** ${tier ? `${tier.label} (rank ${tier.rank})` : '—'}`,
    `**Name:** ${app.name || '—'}`,
    `**Item you want:** ${app.item || '—'}`,
    `**In-game name:** ${app.mcUsername || '—'}`,
    `**Delivery:** ${deliveryLabel(app.delivery)}`,
    ...abilityLines(app),
  ];
  return lines.join('\n');
}

function confirmPrompt(app) {
  return [
    '📝 **Here is your request:**',
    '',
    summaryLines(app),
    '',
    IN_GAME_NOTE,
    '',
    'Reply `submit` to send it to the owners, or `cancel` to throw it away.',
  ].join('\n');
}

function promptFor(app) {
  if (!app) return tierPrompt(null);
  if (app.step === 'tier') return tierPrompt(app);
  if (app.step === 'confirm') return confirmPrompt(app);
  if (app.step === 'done') return '✅ Your request is already with the owners. Type `!Reactapp` to start a new one.';
  return fieldPrompt(app, app.step);
}

/** Reminder for a request the owners allowed that still needs the customer's OK. */
function confirmOrderPrompt(app) {
  return [
    `👍 **Your React request \`${app.id}\` is allowed!**`,
    '',
    summaryLines(app),
    '',
    `Reply \`confirm\` to lock it in — an owner will then take the **${tierOf(app)?.label || '—'} React Orb** off you in game and start on it.`,
    `Reply \`cancel\` if you have changed your mind.`,
  ].join('\n');
}

// ── Drafts ───────────────────────────────────────────────────────────────────
function createDraft({ id, discordId, username, guildId = null, channelId = null, mcLinkedName = '', at = new Date().toISOString() }) {
  return {
    id,
    discordId: String(discordId),
    username: username || String(discordId),
    guildId,
    channelId,
    tier: null,
    rank: null,
    fields: [],
    step: 'tier',
    name: '',
    item: '',
    abilities: [],
    suggestedAbilities: [],
    mcUsername: '',
    mcLinkedName,
    delivery: null,
    status: 'draft',
    stage: null,
    stageAt: null,
    confirmedAt: null,
    revision: 0,
    comments: [],
    dimNote: null,
    createdAt: at,
    updatedAt: at,
    submittedAt: null,
    reviewedAt: null,
    reviewedBy: null,
  };
}

/**
 * Walk the flow again after an admin asked for a rework. The tier is kept —
 * only the answers (name / item / abilities / delivery) are re-collected.
 */
function restartForRevision(app, at = new Date().toISOString()) {
  const tier = tierOf(app);
  const fields = fieldsForTier(tier);
  if (fields.length) { app.fields = fields; app.step = fields[0]; }
  else { app.fields = []; app.step = 'tier'; }
  app.status = 'draft';
  app.stage = null;
  app.revision = (app.revision || 0) + 1;
  app.updatedAt = at;
  return app;
}

/**
 * Feed one DM message into the draft.
 *
 * Returns:
 *   { ok, prompt }                 → the message was recorded (or a question was re-asked)
 *   { ok: false, error }           → nothing understood; caller re-shows the prompt
 *   { ok: true, submitted: true }  → the applicant typed `submit` on the confirm step
 *   { ok: true, cancelled: true }  → the applicant typed `cancel`
 */
function answer(app, raw, at = new Date().toISOString()) {
  const text = String(raw == null ? '' : raw).trim();
  const plain = norm(text.replace(/^!+/, ''));

  if (plain === 'cancel' || plain === 'stop' || plain === 'quit' || plain === 'withdraw') {
    return { ok: true, cancelled: true };
  }
  if (!text) return { ok: false, error: '❌ That message was empty — try again.' };
  if ((plain === 'help' || plain === '?') && app.step !== 'tier') {
    return { ok: true, prompt: promptFor(app) };
  }

  if (app.step === 'tier') {
    const tier = parseTier(text);
    if (!tier) {
      return { ok: false, error: '❌ I did not recognise that tier. Reply with a number **1–11** or the tier name.' };
    }
    app.tier = tier.key;
    app.rank = tier.rank;
    app.fields = fieldsForTier(tier);
    app.step = app.fields[0];
    app.updatedAt = at;
    return { ok: true, prompt: promptFor(app) };
  }

  if (plain === 'back' && app.step !== 'done') {
    const order = ['tier', ...app.fields];
    // 'confirm' is past the end of the field list — step back onto the last answer.
    const i = app.step === 'confirm' ? order.length : order.indexOf(app.step);
    if (i <= 0) return { ok: true, prompt: promptFor(app) };
    app.step = order[i - 1];
    if (app.step === 'tier') { app.tier = null; app.rank = null; app.fields = []; }
    app.updatedAt = at;
    return { ok: true, prompt: promptFor(app) };
  }

  if (app.step === 'confirm') {
    if (['submit', 'yes', 'send', 'done', 'confirm'].includes(plain)) {
      app.status = 'submitted';
      app.step = 'done';
      app.submittedAt = at;
      app.updatedAt = at;
      return { ok: true, submitted: true };
    }
    return { ok: false, error: '❌ Reply `submit` to send it to the owners, or `cancel` to discard it.' };
  }

  if (app.step === 'done') {
    return { ok: false, error: '✅ That request is already submitted. Type `!Reactapp` to start a new one.' };
  }

  if (text.length > MAX_ANSWER * 4) {
    return { ok: false, error: '❌ That answer is too long — keep it under a paragraph.' };
  }

  if (app.step === 'name') {
    const name = text.replace(/\s+/g, ' ').slice(0, MAX_NAME + 1);
    if (name.length > MAX_NAME) return { ok: false, error: `❌ Keep the name under ${MAX_NAME} characters.` };
    app.name = name;
  } else if (app.step === 'item') {
    if (text.length > MAX_ITEM) return { ok: false, error: `❌ Keep the item under ${MAX_ITEM} characters.` };
    app.item = text.replace(/\s+/g, ' ');
  } else if (app.step === 'mcUsername') {
    // "yes" accepts the name from their linked Minecraft account, when we know it.
    const useLinked = app.mcLinkedName
      && ['yes', 'yeah', 'yep', 'y', 'that', 'thatme', 'itsme', 'me', 'mine', 'myname', 'correct'].includes(plain);
    const name = useLinked ? app.mcLinkedName : text.replace(/\s+/g, ' ').trim();
    if (!PLAYER_NAME_RE.test(name)) return { ok: false, error: PLAYER_NAME_ERROR };
    app.mcUsername = name;
  } else if (app.step === 'delivery') {
    const parsed = parseDelivery(text);
    if (!parsed) {
      return {
        ok: false,
        error: '❌ Reply with your base coords (e.g. `120 64 -340`, or `120 64 -340 nether`) or `wait` to get it in person.',
      };
    }
    app.delivery = parsed;
  } else if (app.step === 'abilities' || app.step === 'suggestedAbilities') {
    const optional = app.step === 'suggestedAbilities';
    const list = isNone(text) ? [] : parseAbilities(text);
    if (!list.length && !optional) {
      return { ok: false, error: '❌ Give me at least one ability (one per line or comma-separated).' };
    }
    if (app.step === 'abilities') app.abilities = list;
    else app.suggestedAbilities = list;
  } else {
    return { ok: false, error: `❌ I was not expecting that — ${promptFor(app)}` };
  }

  const i = app.fields.indexOf(app.step);
  app.step = i >= 0 && i < app.fields.length - 1 ? app.fields[i + 1] : 'confirm';
  app.updatedAt = at;
  return { ok: true, prompt: promptFor(app) };
}

// ── Rendering ────────────────────────────────────────────────────────────────
const ts = (iso) => `<t:${Math.floor(new Date(iso).getTime() / 1000)}:f>`;

/** Admin/owner view of a whole application. */
function renderApplication(app, { mention = true } = {}) {
  const tier = tierOf(app);
  const who = mention ? `<@${app.discordId}> (${app.username})` : `${app.username} (${app.discordId})`;
  const out = [
    `📋 **React request \`${app.id}\`**`,
    `**Applicant:** ${who}`,
    `**Status:** ${STATUS_LABELS[app.status] || app.status}`,
    `**Orb handed over:** ${tier ? `${tier.label} (rank ${tier.rank}/${TIERS.length})` : '—'}`,
    `**Name:** ${app.name || '—'}`,
    `**Item wanted:** ${app.item || '—'}`,
    `**In-game name:** ${app.mcUsername || '—'}`,
    `**Delivery:** ${deliveryLabel(app.delivery)}`,
    ...abilityLines(app),
  ];
  const stage = stageLabelOf(app);
  if (stage) out.push(`**Stage:** ${stage}`);
  if (app.revision) out.push(`**Revisions:** ${app.revision}`);
  if (app.dimNote) out.push(`**🔻 Dim-down requested:** ${app.dimNote}`);
  if (app.comments.length) {
    out.push(`**💬 Comments (${app.comments.length}):**`);
    out.push(...app.comments.map(c => `• **${c.byName}**${c.kind === 'dim' ? ' *(dim-down)*' : c.kind === 'stage' ? ' *(stage)*' : ''}: ${c.text}`));
  }
  if (app.submittedAt) out.push(`**Submitted:** ${ts(app.submittedAt)}`);
  if (app.reviewedAt) out.push(`**Reviewed:** ${ts(app.reviewedAt)}${app.reviewedBy ? ` by ${app.reviewedBy}` : ''}`);
  return out.join('\n');
}

/** One line per application, for `!Reactapp list` / `!todo`. */
function renderApplicationLine(app) {
  const tier = tierOf(app);
  const stage = stageLabelOf(app);
  return `• \`${app.id}\` — **${app.name || 'untitled'}** · ${tier ? tier.label : '—'} · <@${app.discordId}> · ${STATUS_LABELS[app.status] || app.status}${stage ? ` · ${stage}` : ''}`;
}

/** Compact headline used in the owners' DM / to-do list. */
function renderApplicationTodo(app) {
  const tier = tierOf(app);
  const bits = [`**${app.name || 'untitled'}**`, tier ? tier.label : '—', app.item || '—'];
  const stage = stageLabelOf(app);
  return `${bits.join(' · ')}${stage ? ` · ${stage}` : ''} — <@${app.discordId}>`;
}

function addComment(app, { byId, byName, text, kind = 'comment', at = new Date().toISOString() }) {
  const body = String(text == null ? '' : text).trim().slice(0, MAX_COMMENT);
  if (!body) return null;
  const entry = { byId: String(byId), byName: byName || String(byId), text: body, kind, at };
  app.comments.push(entry);
  app.updatedAt = at;
  return entry;
}

module.exports = {
  TIERS,
  EPIC_RANK,
  MAX_ABILITIES,
  STATUS_LABELS,
  PLAYER_STEP,
  DELIVERY_STEP,
  DELIVERY_STAGES,
  CLOSED_STATUSES,
  fieldsForTier,
  tierOf,
  tierByRank,
  parseTier,
  parseAbilities,
  parseDelivery,
  parseStage,
  deliveryLabel,
  stageLabelOf,
  setStage,
  confirmOrder,
  awaitingConfirm,
  createDraft,
  promptFor,
  tierPrompt,
  confirmPrompt,
  confirmOrderPrompt,
  answer,
  summaryLines,
  renderApplication,
  renderApplicationLine,
  renderApplicationTodo,
  addComment,
  restartForRevision,
};
