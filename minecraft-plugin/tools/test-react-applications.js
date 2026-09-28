// Exercises react-applications.js — the !Reactapp DM interview.
//
// The state machine is discord.js-free on purpose, so every branch of the
// application flow (rare-and-below, epic's suggested list, the higher tiers'
// full kit, back-navigation, cancel, revision) can be driven with plain
// strings here.
//
// Run: node minecraft-plugin/tools/test-react-applications.js
const path = require('path');

const R = require(path.join(__dirname, '..', '..', 'react-applications.js'));

let failures = 0;
function assert(cond, label) {
  if (!cond) { console.error(`❌ FAIL [react-app] ${label}`); failures++; }
  else console.log(`✅ [react-app] ${label}`);
}

const draft = (extra = {}) => ({
  ...R.createDraft({ id: 'RA-1', discordId: '42', username: 'tester', guildId: '9', at: '2026-09-28T00:00:00.000Z' }),
  ...extra,
});

/** Feed a list of answers into a fresh draft, returning the app + last result. */
function drive(answers, start = draft()) {
  const app = start;
  let last = null;
  const prompts = [];
  for (const a of answers) {
    last = R.answer(app, a, '2026-09-28T00:00:00.000Z');
    if (last.prompt) prompts.push(last.prompt);
    if (last.submitted || last.cancelled) break;
  }
  return { app, last, prompts };
}

function main() {
  // ── Tier parsing ──────────────────────────────────────────────────────────
  assert(R.parseTier('4')?.key === 'epic', 'number 4 → Epic');
  assert(R.parseTier('3.')?.key === 'rare', 'trailing dot accepted');
  assert(R.parseTier('epic')?.key === 'epic', 'label → Epic');
  assert(R.parseTier(' semi-op ')?.key === 'semiop', 'punctuation-insensitive tier key');
  assert(R.parseTier('Demi God')?.key === 'demigod', 'spaced label → Demi God');
  assert(R.parseTier('TRANSCEND')?.key === 'transcend', 'case-insensitive');
  assert(R.parseTier('12') === null, 'out-of-range number rejected');
  assert(R.parseTier('banana') === null, 'unknown tier rejected');
  assert(R.TIERS.length === 11 && R.TIERS.every((t, i) => t.rank === i + 1), '11 tiers, ranks 1..11');

  // ── Rare and below: wanted item + name, then the delivery question ────────
  {
    const { app, last, prompts } = drive(['3', 'Netherite Sword', 'Frostbite', 'Notch', '120 64 -340 nether', 'submit']);
    assert(app.tier === 'rare', 'rare tier stored');
    assert(/item/i.test(prompts[0] || ''), 'rare asks which item is wanted first');
    assert(/name/i.test(prompts[1] || ''), 'rare then asks for the name');
    assert(/Minecraft username/i.test(prompts[2] || ''), 'rare then asks for the in-game name');
    assert(/hand it over/i.test(prompts[3] || ''), 'rare then asks where it should be delivered');
    assert(app.mcUsername === 'Notch', 'the in-game name is stored');
    assert(app.item === 'Netherite Sword' && app.name === 'Frostbite', 'rare answers stored');
    assert(app.delivery.mode === 'coords' && app.delivery.coords === '120 64 -340' && app.delivery.dimension === 'Nether',
      'base coords + dimension stored');
    assert(app.abilities.length === 0 && app.suggestedAbilities.length === 0, 'rare collects no abilities');
    assert(last.submitted === true, 'rare request submits');
    assert(app.status === 'submitted' && app.submittedAt, 'rare lands in submitted state');
    assert(app.stage === null, 'a fresh request has no delivery stage yet');
  }

  // ── Common uses the same shape ────────────────────────────────────────────
  {
    const { app } = drive(['Common', 'Pumpkin', 'Jack', 'Notch', 'wait', 'submit']);
    assert(app.tier === 'common' && app.status === 'submitted', 'common submits with item + name');
    assert(app.delivery.mode === 'online', '"wait" means hand it over while the customer is online');
  }

  // ── The in-game name ──────────────────────────────────────────────────────
  {
    const app = draft();
    R.answer(app, '1'); R.answer(app, 'Stone'); R.answer(app, 'Pebble');
    assert(app.step === 'mcUsername', 'the in-game name is asked once the answers are in');
    const bad = R.answer(app, 'no spaces or dashes!');
    assert(bad.ok === false && /Minecraft username/.test(bad.error), 'a non-username is refused');
    assert(app.mcUsername === '', 'nothing is stored after a bad name');
    const ok = R.answer(app, 'Notch_99');
    assert(ok.ok === true && app.mcUsername === 'Notch_99', 'a valid name is stored');
    assert(app.step === 'delivery', 'the delivery question follows the name');

    const linked = draft({ mcLinkedName: 'Steve_99' });
    R.answer(linked, '1'); R.answer(linked, 'Stone'); R.answer(linked, 'Pebble');
    const prompt = R.promptFor(linked);
    assert(/Steve_99/.test(prompt) && /yes/.test(prompt), 'the linked Minecraft account is offered');
    R.answer(linked, 'yes');
    assert(linked.mcUsername === 'Steve_99', 'replying "yes" uses the linked name');
    const override = draft({ mcLinkedName: 'Steve_99' });
    R.answer(override, '1'); R.answer(override, 'Stone'); R.answer(override, 'Pebble');
    R.answer(override, 'SomebodyElse');
    assert(override.mcUsername === 'SomebodyElse', 'a typed name overrides the linked one');
  }

  // ── Delivery parsing ──────────────────────────────────────────────────────
  assert(R.parseDelivery('wait')?.mode === 'online' && R.parseDelivery('when I am on')?.mode === 'online',
    'online words are recognised however they are typed');
  assert(R.parseDelivery('120 64 -340')?.coords === '120 64 -340', 'bare coords parse');
  assert(R.parseDelivery('-40, 70, 900 the end')?.dimension === 'The End', 'dimension suffix parses');
  assert(R.parseDelivery('120 64 340')?.dimension === 'Overworld', 'coords default to the overworld');
  assert(R.parseDelivery('somewhere near spawn') === null, 'a vague answer is not a delivery method');
  assert(R.parseDelivery('12 64') === null, 'two numbers are not coords');

  // ── Epic: name + item + *suggested* list ──────────────────────────────────
  {
    const { app, prompts } = drive(['4', 'Voltage', 'Blaze Rod', '1. Fire Burst\n2. Spark Dash\nfly', 'Notch', 'wait', 'submit']);
    assert(/name/i.test(prompts[0] || ''), 'epic asks for the name first');
    assert(/item/i.test(prompts[1] || ''), 'epic then asks for the item');
    assert(/suggest/i.test(prompts[2] || ''), 'epic then asks for a suggested list');
    assert(app.suggestedAbilities.join('|') === 'Fire Burst|Spark Dash|fly', 'epic list de-numbered + de-duped');
    assert(app.abilities.length === 0, 'epic has no full kit');
    assert(app.status === 'submitted', 'epic submits');
  }

  // ── Epic tolerates "none" ─────────────────────────────────────────────────
  {
    const { app, last } = drive(['epic', 'Bare', 'Stick', 'none', 'Notch', 'wait', 'submit']);
    assert(last.submitted === true && app.suggestedAbilities.length === 0, 'epic accepts "none" for suggestions');
  }

  // ── Legendary and above: full ability list required ───────────────────────
  {
    const { app, prompts, last } = drive(['8', 'Sunder', 'Netherite Axe', 'none']);
    assert(app.tier === 'demigod', 'demi god tier stored');
    assert(last.ok === false && /at least one ability/i.test(last.error), 'high tiers reject an empty kit');
    assert(/abilit/i.test(prompts[2] || ''), 'high tier asks for the full kit');
    assert(app.status === 'draft', 'still a draft after a rejected answer');
    const done = drive(['God', 'Sunder', 'Netherite Axe', 'Flight, Energy Blast\nTeleport', 'Notch', 'wait', 'submit'], draft());
    assert(done.app.abilities.length === 3, 'high-tier kit parsed from commas + newlines');
    assert(done.app.status === 'submitted', 'high tier submits');
  }

  // ── Ability parsing ───────────────────────────────────────────────────────
  assert(R.parseAbilities('a, a, A ; b').join('|') === 'a|b', 'abilities de-duped case-insensitively');
  assert(R.parseAbilities('   ').length === 0, 'blank ability text yields nothing');
  assert(R.parseAbilities('- Dash\n* Blink\n3) Warp').join('|') === 'Dash|Blink|Warp', 'list bullets stripped');
  assert(R.parseAbilities(Array.from({ length: 60 }, (_, i) => `a${i}`).join(',')).length === R.MAX_ABILITIES,
    `abilities capped at ${R.MAX_ABILITIES}`);

  // ── Back-navigation, cancel, resume ───────────────────────────────────────
  {
    const app = draft();
    R.answer(app, '5');                 // legendary
    const first = R.answer(app, 'Blade');       // name
    assert(app.step === 'item', 'advanced to item');
    const back = R.answer(app, 'back');
    assert(app.step === 'name' && back.prompt.includes('name'), 'back returns to the name step');
    R.answer(app, 'Blade II');
    R.answer(app, 'Emerald');
    R.answer(app, 'Slice');
    assert(app.step === 'mcUsername', 'the ability list leads into the in-game name');
    R.answer(app, 'Notch');
    assert(app.step === 'delivery', 'the name leads into the delivery question');
    R.answer(app, '100 64 -200');
    assert(app.step === 'confirm', 'reaches the confirm step');
    assert(R.answer(app, 'back').prompt.includes('hand it over'), 'back from confirm returns to the delivery question');
    const cancelled = R.answer(app, 'cancel');
    assert(cancelled.cancelled === true, 'cancel is reported');
    assert(first.ok === true, 'answers report success');
  }
  {
    const app = draft();
    R.answer(app, '2');
    const help = R.answer(app, 'help');
    assert(help.ok === true && /item/i.test(help.prompt), 'help re-asks the current question');
    const early = R.answer(app, '!submit');
    assert(early.ok === true && early.submitted !== true, 'submit typed outside the confirm step never files the application');
    assert(app.status === 'draft', 'still a draft after an early submit');
  }

  // ── Confirm gate ──────────────────────────────────────────────────────────
  {
    const app = draft();
    R.answer(app, '1'); R.answer(app, 'Stone'); R.answer(app, 'Pebble'); R.answer(app, 'Notch'); R.answer(app, 'wait');
    const nope = R.answer(app, 'yes please');
    assert(nope.ok === false, 'confirm step rejects anything but submit/cancel');
    assert(app.status === 'draft', 'nothing submitted on a bad confirm answer');
    assert(R.answer(app, 'submit').submitted === true, 'submit goes through');
  }

  // ── The delivery pipeline + the customer's final confirm ──────────────────
  {
    const { app } = drive(['7', 'Sunder', 'Netherite Axe', 'Flight', 'Notch', '120 64 -340', 'submit']);
    assert(app.status === 'submitted', 'mythic request is queued for review');
    assert(app.abilities.join('|') === 'Flight' && app.suggestedAbilities.length === 0, 'mythic keeps a full kit');

    app.status = 'approved';             // an owner allows the item
    assert(R.awaitingConfirm(app) === true, 'an allowed request waits on the customer');
    assert(/customer to confirm/i.test(R.stageLabelOf(app) || ''), 'the stage badge says who it is waiting on');
    assert(R.confirmOrder(app, '2026-09-28T02:00:00.000Z') === app, 'confirming locks the order in');
    assert(app.status === 'queued' && app.stage === 'not_started', 'confirmed orders start "not started"');
    assert(app.confirmedAt === '2026-09-28T02:00:00.000Z', 'the confirm is timestamped');
    assert(R.awaitingConfirm(app) === false, 'no longer waiting on the customer');
    assert(R.renderApplication(app).includes('Not started'), 'the owner view shows the stage');

    assert(R.parseStage('started making')?.key === 'making', 'stage aliases parse');
    assert(R.parseStage('3')?.key === 'almost', 'stages accept the button number');
    assert(R.parseStage('ready for the user to get on')?.key === 'ready', 'the long stage name parses');
    assert(R.parseStage('done')?.key === 'delivered', '"done" means delivered');
    assert(R.parseStage('banana') === null, 'an unknown stage is rejected');
    assert(R.setStage(app, 'banana') === null, 'setStage refuses nonsense');

    const making = R.setStage(app, 'making', '2026-09-28T03:00:00.000Z');
    assert(making.key === 'making' && app.stage === 'making', 'the stage moves forward');
    assert(app.status === 'queued', 'stages keep a confirmed order queued');
    R.setStage(app, 'ready');
    assert(/Ready/.test(R.stageLabelOf(app) || ''), 'the stage badge follows the pipeline');
    R.setStage(app, 'delivered');
    assert(app.status === 'delivered' && app.stage === 'delivered', 'delivered is terminal');
    assert(/Delivered/.test(R.stageLabelOf(app) || ''), 'the delivered badge renders');
    assert(R.CLOSED_STATUSES.includes(app.status), 'delivered counts as closed');
    assert(R.deliveryLabel(app.delivery).includes('120 64 -340'), 'the delivery label carries the coords');
  }
  {
    // An owner who starts before the customer confirms still gets a queued job,
    // and the customer's late confirm is a safe no-op on the stage.
    const { app } = drive(['5', 'Blade', 'Emerald', 'Slice', 'Notch', 'wait', 'submit']);
    app.status = 'approved';
    R.setStage(app, 'making');
    assert(app.status === 'queued' && app.stage === 'making', 'an early start lifts the request into delivery');
    assert(R.confirmOrder(app) === app && app.stage === 'making', 'a late confirm keeps the current stage');
    assert(!!app.confirmedAt, 'the late confirm is still recorded');
  }
  {
    const { app } = drive(['2', 'Torch', 'Sparky', 'Notch', 'wait', 'submit']);
    assert(R.confirmOrder(app) === null, 'a request that was never allowed cannot be confirmed');
    assert(R.awaitingConfirm(app) === false, 'a submitted request is not awaiting a confirm');
  }

  // ── Rendering + admin actions ─────────────────────────────────────────────
  {
    const { app } = drive(['4', 'Voltage', 'Blaze Rod', 'Fire Burst', 'Notch', 'wait', 'submit']);
    const view = R.renderApplication(app);
    assert(view.includes('RA-1') && view.includes('<@42>'), 'admin view names the application + applicant');
    assert(view.includes('Epic') && view.includes('Blaze Rod') && view.includes('Fire Burst'), 'admin view carries every answer');
    assert(view.includes('In-game name') && view.includes('Notch'), 'admin view names the in-game player');
    assert(R.renderApplicationLine(app).includes('RA-1'), 'list line renders');
    assert(R.renderApplicationTodo(app).includes('Voltage'), 'to-do headline renders');
    R.addComment(app, { byId: '1', byName: 'owner', text: 'dim it down', kind: 'dim' });
    assert(app.comments.length === 1 && app.comments[0].byName === 'owner', 'comment recorded');
    assert(R.renderApplication(app).includes('dim it down'), 'comment shows in the admin view');
    assert(R.addComment(app, { byId: '1', byName: 'owner', text: '   ' }) === null, 'blank comment ignored');
  }
  {
    const { app } = drive(['4', 'Voltage', 'Blaze Rod', 'none', 'Notch', 'wait', 'submit']);
    R.addComment(app, { byId: '1', byName: 'owner', text: 'too strong', kind: 'dim' });
    app.dimNote = 'too strong';
    R.restartForRevision(app, '2026-09-28T01:00:00.000Z');
    assert(app.status === 'draft' && app.revision === 1, 'revision resets status + counts up');
    assert(app.step === 'name' && app.tier === 'epic', 'revision keeps the tier, re-asks the fields');
    assert(app.stage === null, 'a revision clears the delivery stage');
    const again = R.answer(app, 'Voltage', '2026-09-28T01:00:00.000Z');
    assert(again.ok === true, 'revision answers accepted');
    assert(R.renderApplication(app).includes('Revisions'), 'revision count rendered');
  }

  if (failures) { console.error(`\n❌ ${failures} react-application check(s) failed`); process.exitCode = 1; }
  else console.log('\n✅ all react-application checks passed');
}

main();
