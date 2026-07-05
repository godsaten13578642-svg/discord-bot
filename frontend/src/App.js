import React, { useState, useEffect, useCallback } from 'react';
import './App.css';

const api = (path, opts) => fetch(path, opts).then(r => r.json());
const post = (path, body) => api(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const del = (path) => api(path, { method: 'DELETE' });

const TABS = ['Dashboard', 'Civilizations', 'Religions', 'Teams', 'Cults', 'Diplomacy', 'Economy', 'Events', 'Members', 'Servers', 'Settings'];

const S = {
  card: { background: 'white', borderRadius: 10, padding: 20, boxShadow: '0 1px 4px rgba(0,0,0,.08)', marginBottom: 16 },
  th: { padding: '9px 12px', textAlign: 'left', borderBottom: '2px solid #eee', fontWeight: 700, fontSize: 12, color: '#999', textTransform: 'uppercase' },
  td: { padding: '10px 12px', borderBottom: '1px solid #f0f0f0', fontSize: 14, verticalAlign: 'middle' },
};

function Btn({ children, onClick, color = '#0d6efd', small, disabled, outline }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      background: disabled ? '#ddd' : outline ? 'transparent' : color,
      color: disabled ? '#aaa' : outline ? color : 'white',
      border: outline ? `1.5px solid ${color}` : 'none',
      borderRadius: 6, padding: small ? '3px 9px' : '7px 14px',
      fontSize: small ? 12 : 13, cursor: disabled ? 'not-allowed' : 'pointer',
      fontWeight: 600, whiteSpace: 'nowrap'
    }}>{children}</button>
  );
}

function Badge({ children, color = '#e9ecef', textColor = '#555' }) {
  return <span style={{ background: color, color: textColor, borderRadius: 20, padding: '2px 8px', fontSize: 11, fontWeight: 700 }}>{children}</span>;
}

function Toggle({ label, checked, onChange, description }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid #f0f0f0' }}>
      <div>
        <div style={{ fontWeight: 600, fontSize: 14 }}>{label}</div>
        {description && <div style={{ fontSize: 12, color: '#999', marginTop: 2 }}>{description}</div>}
      </div>
      <label style={{ position: 'relative', display: 'inline-block', width: 44, height: 24, flexShrink: 0, marginLeft: 16 }}>
        <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} style={{ opacity: 0, width: 0, height: 0 }} />
        <span style={{ position: 'absolute', cursor: 'pointer', inset: 0, borderRadius: 12, backgroundColor: checked ? '#0d6efd' : '#ccc', transition: '.2s' }}>
          <span style={{ position: 'absolute', height: 18, width: 18, left: checked ? 23 : 3, bottom: 3, backgroundColor: 'white', borderRadius: '50%', transition: '.2s' }} />
        </span>
      </label>
    </div>
  );
}

function Modal({ title, onClose, children }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999 }}>
      <div style={{ background: 'white', borderRadius: 12, padding: 28, maxWidth: 420, width: '90%', boxShadow: '0 8px 32px rgba(0,0,0,.2)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <div style={{ fontWeight: 800, fontSize: 17 }}>{title}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#999' }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Input({ label, value, onChange, placeholder, type = 'text' }) {
  return (
    <div style={{ marginBottom: 12 }}>
      {label && <div style={{ fontSize: 12, fontWeight: 700, color: '#666', marginBottom: 4 }}>{label}</div>}
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        style={{ width: '100%', padding: '8px 10px', border: '1.5px solid #ddd', borderRadius: 6, fontSize: 14, boxSizing: 'border-box' }} />
    </div>
  );
}

function EmptyState({ icon, text }) {
  return <div style={{ textAlign: 'center', padding: '48px 0', color: '#bbb' }}><div style={{ fontSize: 40, marginBottom: 10 }}>{icon}</div><div style={{ fontSize: 14 }}>{text}</div></div>;
}

export default function App() {
  const [tab, setTab] = useState('Dashboard');
  const [state, setState] = useState({ stats: null, bot: null, civs: [], users: [], servers: [], features: null, religions: [], teams: [], cults: [], rebels: [], alliances: [], economy: [], events: [] });
  const [modal, setModal] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [toast, setToast] = useState(null);
  const [form, setForm] = useState({});

  const showToast = (msg, ok = true) => { setToast({ msg, ok }); setTimeout(() => setToast(null), 3000); };
  const closeModal = () => { setModal(null); setForm({}); };

  const load = useCallback(async () => {
    try {
      const [stats, bot, civs, users, servers, features, religions, teams, cults, rebels, alliances, economy, events] = await Promise.all([
        api('/api/stats'), api('/api/bot/status'), api('/api/civilizations'), api('/api/users'),
        api('/api/servers'), api('/api/features'), api('/api/religions'), api('/api/teams'),
        api('/api/cults'), api('/api/rebels'), api('/api/alliances'), api('/api/economy'), api('/api/events'),
      ]);
      setState({ stats, bot, civs, users, servers, features, religions, teams, cults, rebels, alliances, economy, events });
    } catch (_) {}
  }, []);

  useEffect(() => { load(); const t = setInterval(load, 8000); return () => clearInterval(t); }, [load]);

  const doDelete = (msg, fn) => setConfirm({ msg, fn });
  const runConfirm = async () => { await confirm.fn(); setConfirm(null); load(); };

  const toggleFeature = async (key, val) => {
    setState(s => ({ ...s, features: { ...s.features, [key]: val } }));
    await post('/api/features', { [key]: val });
    showToast(`${key} ${val ? 'enabled' : 'disabled'}`);
  };

  const botAction = async (action) => {
    const r = await post(`/api/bot/${action}`, {});
    showToast(r.message, r.success); load();
  };

  const createItem = async (endpoint, body, label) => {
    const r = await post(endpoint, body);
    if (r.error || r.success === false) { showToast(r.error || r.message, false); return; }
    showToast(`${label} created!`); closeModal(); load();
  };

  const { stats, bot, civs, users, servers, features, religions, teams, cults, rebels, alliances, economy, events } = state;
  const wars = alliances.filter(a => a.type === 'war');
  const allies = alliances.filter(a => a.type === 'alliance');

  const tabStyle = t => ({
    padding: '10px 14px', cursor: 'pointer', fontWeight: 600, fontSize: 13,
    color: tab === t ? '#0d6efd' : '#666', background: 'none', border: 'none',
    borderBottom: tab === t ? '3px solid #0d6efd' : '3px solid transparent',
    transition: 'color .15s'
  });

  const getName = (type, id) => {
    if (!id) return '—';
    const map = { civilization: civs, religion: religions, team: teams, cult: cults };
    return (map[type] || []).find(x => String(x.id) === String(id))?.name || `#${id}`;
  };

  return (
    <div style={{ minHeight: '100vh', background: '#f4f6fb', fontFamily: 'system-ui, -apple-system, sans-serif' }}>

      {/* Toast */}
      {toast && (
        <div style={{ position: 'fixed', top: 20, right: 20, zIndex: 2000, background: toast.ok ? '#198754' : '#dc3545', color: 'white', padding: '10px 18px', borderRadius: 8, fontWeight: 600, boxShadow: '0 4px 16px rgba(0,0,0,.2)', transition: 'opacity .3s' }}>
          {toast.ok ? '✅' : '❌'} {toast.msg}
        </div>
      )}

      {/* Confirm */}
      {confirm && (
        <Modal title="⚠️ Confirm" onClose={() => setConfirm(null)}>
          <p style={{ color: '#555', marginBottom: 20 }}>{confirm.msg}</p>
          <div style={{ display: 'flex', gap: 10 }}>
            <Btn color="#dc3545" onClick={runConfirm}>Yes, delete</Btn>
            <Btn color="#6c757d" outline onClick={() => setConfirm(null)}>Cancel</Btn>
          </div>
        </Modal>
      )}

      {/* Create modals */}
      {modal === 'civ' && (
        <Modal title="🏛️ Create Civilization" onClose={closeModal}>
          <Input label="Name" value={form.name || ''} onChange={v => setForm(f => ({ ...f, name: v }))} placeholder="Roman Empire" />
          <Btn onClick={() => createItem('/api/civilizations/create', { name: form.name }, 'Civilization')}>Create</Btn>
        </Modal>
      )}
      {modal === 'religion' && (
        <Modal title="✝️ Found Religion" onClose={closeModal}>
          <Input label="Name" value={form.name || ''} onChange={v => setForm(f => ({ ...f, name: v }))} placeholder="The Holy Order" />
          <Input label="Doctrine" value={form.doctrine || ''} onChange={v => setForm(f => ({ ...f, doctrine: v }))} placeholder="Core belief..." />
          <Btn onClick={() => createItem('/api/religions/create', { name: form.name, doctrine: form.doctrine }, 'Religion')}>Found</Btn>
        </Modal>
      )}
      {modal === 'team' && (
        <Modal title="🛡️ Create Team" onClose={closeModal}>
          <Input label="Name" value={form.name || ''} onChange={v => setForm(f => ({ ...f, name: v }))} placeholder="Red Team" />
          <Input label="Color (hex)" value={form.color || ''} onChange={v => setForm(f => ({ ...f, color: v }))} placeholder="#dc3545" />
          <Btn onClick={() => createItem('/api/teams/create', { name: form.name, color: form.color || '#0d6efd' }, 'Team')}>Create</Btn>
        </Modal>
      )}
      {modal === 'cult' && (
        <Modal title="🌑 Found Cult" onClose={closeModal}>
          <Input label="Name" value={form.name || ''} onChange={v => setForm(f => ({ ...f, name: v }))} placeholder="The Dark Circle" />
          <Input label="Secret Objective" value={form.secretObjective || ''} onChange={v => setForm(f => ({ ...f, secretObjective: v }))} placeholder="World domination..." />
          <Btn onClick={() => createItem('/api/cults/create', { name: form.name, secretObjective: form.secretObjective }, 'Cult')}>Found</Btn>
        </Modal>
      )}
      {modal === 'alliance' && (
        <Modal title="🤝 Add Diplomacy" onClose={closeModal}>
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#666', marginBottom: 4 }}>Type</div>
            <select value={form.type || 'alliance'} onChange={e => setForm(f => ({ ...f, type: e.target.value }))} style={{ width: '100%', padding: '8px 10px', border: '1.5px solid #ddd', borderRadius: 6, fontSize: 14 }}>
              <option value="alliance">🤝 Alliance</option>
              <option value="war">⚔️ War</option>
              <option value="treaty">📜 Treaty</option>
            </select>
          </div>
          <Input label="Party 1 (Civ ID)" value={form.party1 || ''} onChange={v => setForm(f => ({ ...f, party1: v }))} placeholder="1" />
          <Input label="Party 2 (Civ ID)" value={form.party2 || ''} onChange={v => setForm(f => ({ ...f, party2: v }))} placeholder="2" />
          <Btn onClick={() => createItem('/api/alliances', { type: form.type || 'alliance', party1: form.party1, party2: form.party2 }, 'Diplomacy entry')}>Add</Btn>
        </Modal>
      )}
      {modal === 'event' && (
        <Modal title="📅 Create Event" onClose={closeModal}>
          <Input label="Name" value={form.name || ''} onChange={v => setForm(f => ({ ...f, name: v }))} placeholder="Summer Tournament" />
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#666', marginBottom: 4 }}>Type</div>
            <select value={form.type || 'general'} onChange={e => setForm(f => ({ ...f, type: e.target.value }))} style={{ width: '100%', padding: '8px 10px', border: '1.5px solid #ddd', borderRadius: 6, fontSize: 14 }}>
              <option value="general">General</option>
              <option value="tournament">Tournament</option>
              <option value="election">Election</option>
              <option value="war">War Event</option>
              <option value="ritual">Ritual</option>
            </select>
          </div>
          <Btn onClick={() => createItem('/api/events/create', { name: form.name, type: form.type || 'general' }, 'Event')}>Create</Btn>
        </Modal>
      )}
      {modal === 'economy_set' && (
        <Modal title="💰 Set Balance" onClose={closeModal}>
          <Input label="User ID" value={form.userId || ''} onChange={v => setForm(f => ({ ...f, userId: v }))} placeholder="Discord user ID" />
          <Input label="Amount" value={form.amount || ''} onChange={v => setForm(f => ({ ...f, amount: v }))} type="number" placeholder="1000" />
          <Btn onClick={async () => { await post('/api/economy/admin/set', { userId: form.userId, amount: form.amount }); showToast('Balance set!'); closeModal(); load(); }}>Set Balance</Btn>
        </Modal>
      )}

      {/* Header */}
      <div style={{ background: 'white', boxShadow: '0 1px 4px rgba(0,0,0,.08)' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 0 0' }}>
            <span style={{ fontSize: 24 }}>🏛️</span>
            <span style={{ fontWeight: 800, fontSize: 18 }}>Civilization Bot</span>
            {bot && (
              <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700, padding: '4px 12px', borderRadius: 20, background: bot.online ? '#d4edda' : '#f8d7da', color: bot.online ? '#155724' : '#721c24' }}>
                {bot.online ? `🟢 ${bot.tag} · ${bot.guilds} servers · ${bot.ping}ms` : '🔴 Bot Offline'}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 0, overflowX: 'auto', marginTop: 4 }}>
            {TABS.map(t => <button key={t} style={tabStyle(t)} onClick={() => setTab(t)}>{t}</button>)}
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: '20px auto', padding: '0 16px' }}>

        {/* ── DASHBOARD ── */}
        {tab === 'Dashboard' && stats && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 12, marginBottom: 16 }}>
              {[
                { icon: '👥', label: 'Members', val: stats.totalMembers },
                { icon: '🏛️', label: 'Civs', val: stats.civilizations },
                { icon: '✝️', label: 'Religions', val: stats.religions },
                { icon: '🛡️', label: 'Teams', val: stats.teams },
                { icon: '🌑', label: 'Cults', val: stats.cults },
                { icon: '⚔️', label: 'Rebels', val: stats.rebels },
                { icon: '🤝', label: 'Alliances', val: stats.alliances },
                { icon: '💥', label: 'Wars', val: stats.wars },
                { icon: '📅', label: 'Events', val: stats.events },
                { icon: '📡', label: 'Ping', val: bot?.online ? `${bot.ping}ms` : '—' },
              ].map(s => (
                <div key={s.label} style={{ ...S.card, textAlign: 'center', marginBottom: 0, padding: 14 }}>
                  <div style={{ fontSize: 28 }}>{s.icon}</div>
                  <div style={{ fontSize: 22, fontWeight: 800 }}>{s.val}</div>
                  <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>{s.label}</div>
                </div>
              ))}
            </div>
            <div style={S.card}>
              <h3 style={{ margin: '0 0 14px' }}>⌨️ All Commands</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px' }}>
                {[
                  ['!profile', 'Full profile: level, XP, gold, affiliations'],
                  ['!balance / !bal', 'Check your gold'],
                  ['!daily', 'Claim daily gold reward'],
                  ['!pay @user <amt>', 'Send gold to another user'],
                  ['!leaderboard / !lb', 'Gold leaderboard'],
                  ['!createciv <name>', 'Create a civilization'],
                  ['!joinciv <id>', 'Join a civilization'],
                  ['!civs', 'List all civilizations'],
                  ['!rebel [reason]', 'Break away from your civ'],
                  ['!rebels', 'List all rebels'],
                  ['!foundreligion <n>|<doctrine>', 'Found a new religion'],
                  ['!joinreligion <id>', 'Convert to a religion'],
                  ['!religions', 'List all religions'],
                  ['!pray', 'Add blessings to your religion'],
                  ['!createteam <name>', 'Create a team'],
                  ['!jointeam <id>', 'Join a team'],
                  ['!teams', 'List all teams'],
                  ['!foundcult <n>|<objective>', 'Found a secret cult'],
                  ['!joincult <id>', 'Join a cult'],
                  ['!cults', 'List known cults'],
                  ['!ritual', 'Perform a cult ritual'],
                  ['!war <civId>', 'Declare war'],
                  ['!ally <civId>', 'Form an alliance'],
                  ['!joinevent <id>', 'Join an event'],
                  ['!events', 'List active events'],
                  ['!help', 'Show all commands'],
                ].map(([cmd, desc]) => (
                  <div key={cmd} style={{ display: 'flex', gap: 10, padding: '6px 0', borderBottom: '1px solid #f5f5f5' }}>
                    <code style={{ color: '#0d6efd', whiteSpace: 'nowrap', fontSize: 12, minWidth: 180 }}>{cmd}</code>
                    <span style={{ fontSize: 12, color: '#777' }}>{desc}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* ── CIVILIZATIONS ── */}
        {tab === 'Civilizations' && (
          <div style={S.card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0 }}>🏛️ Civilizations ({civs.length})</h3>
              <Btn onClick={() => setModal('civ')}>+ Create</Btn>
            </div>
            {civs.length === 0 ? <EmptyState icon="🏛️" text='No civilizations yet. Use !createciv in Discord or create one above.' /> : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr><th style={S.th}>ID</th><th style={S.th}>Name</th><th style={S.th}>Leader</th><th style={S.th}>Members</th><th style={S.th}>Created</th><th style={S.th}>Actions</th></tr></thead>
                <tbody>
                  {civs.map(c => (
                    <tr key={c.id}>
                      <td style={S.td}><code style={{ fontSize: 12 }}>{c.id}</code></td>
                      <td style={{ ...S.td, fontWeight: 700 }}>{c.name}</td>
                      <td style={{ ...S.td, fontSize: 12, color: '#888' }}>{c.leaderId || '—'}</td>
                      <td style={S.td}><Badge>{c.members.length}</Badge></td>
                      <td style={{ ...S.td, fontSize: 12, color: '#aaa' }}>{c.createdAt ? new Date(c.createdAt).toLocaleDateString() : '—'}</td>
                      <td style={S.td}><Btn small color="#dc3545" onClick={() => doDelete(`Delete civilization "${c.name}"?`, () => del(`/api/civilizations/${c.id}`))}>🗑 Delete</Btn></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* ── RELIGIONS ── */}
        {tab === 'Religions' && (
          <div style={S.card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0 }}>✝️ Religions ({religions.length})</h3>
              <Btn onClick={() => setModal('religion')}>+ Found</Btn>
            </div>
            {religions.length === 0 ? <EmptyState icon="✝️" text='No religions yet. Use !foundreligion in Discord or found one above.' /> : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr><th style={S.th}>ID</th><th style={S.th}>Name</th><th style={S.th}>Doctrine</th><th style={S.th}>Followers</th><th style={S.th}>Blessings</th><th style={S.th}>Actions</th></tr></thead>
                <tbody>
                  {religions.map(r => (
                    <tr key={r.id}>
                      <td style={S.td}><code style={{ fontSize: 12 }}>{r.id}</code></td>
                      <td style={{ ...S.td, fontWeight: 700 }}>{r.name}</td>
                      <td style={{ ...S.td, fontSize: 12, color: '#777', maxWidth: 200 }}>{r.doctrine || <em style={{ color: '#bbb' }}>No doctrine</em>}</td>
                      <td style={S.td}><Badge color="#fff3cd" textColor="#856404">{r.members.length}</Badge></td>
                      <td style={S.td}><Badge color="#d1ecf1" textColor="#0c5460">✨ {r.blessings}</Badge></td>
                      <td style={{ ...S.td, display: 'flex', gap: 6 }}>
                        <Btn small color="#6f42c1" onClick={async () => { await post(`/api/religions/${r.id}/bless`, {}); showToast('Blessed!'); load(); }}>✨ Bless</Btn>
                        <Btn small color="#dc3545" onClick={() => doDelete(`Delete religion "${r.name}"?`, () => del(`/api/religions/${r.id}`))}>🗑</Btn>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* ── TEAMS ── */}
        {tab === 'Teams' && (
          <div style={S.card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0 }}>🛡️ Teams ({teams.length})</h3>
              <Btn onClick={() => setModal('team')}>+ Create</Btn>
            </div>
            {teams.length === 0 ? <EmptyState icon="🛡️" text='No teams yet. Use !createteam in Discord or create one above.' /> : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr><th style={S.th}>ID</th><th style={S.th}>Name</th><th style={S.th}>Color</th><th style={S.th}>Members</th><th style={S.th}>Points</th><th style={S.th}>Actions</th></tr></thead>
                <tbody>
                  {teams.map(t => (
                    <tr key={t.id}>
                      <td style={S.td}><code style={{ fontSize: 12 }}>{t.id}</code></td>
                      <td style={{ ...S.td, fontWeight: 700 }}>{t.name}</td>
                      <td style={S.td}><span style={{ display: 'inline-block', width: 16, height: 16, borderRadius: 4, background: t.color, border: '1px solid #ddd', verticalAlign: 'middle', marginRight: 6 }} />{t.color}</td>
                      <td style={S.td}><Badge>{t.members.length}</Badge></td>
                      <td style={S.td}><Badge color="#d4edda" textColor="#155724">{t.points} pts</Badge></td>
                      <td style={{ ...S.td, display: 'flex', gap: 6 }}>
                        <Btn small color="#198754" onClick={async () => { await post(`/api/teams/${t.id}/points`, { amount: 10 }); showToast('+10 points!'); load(); }}>+10 pts</Btn>
                        <Btn small color="#dc3545" onClick={() => doDelete(`Delete team "${t.name}"?`, () => del(`/api/teams/${t.id}`))}>🗑</Btn>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* ── CULTS ── */}
        {tab === 'Cults' && (
          <div style={S.card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0 }}>🌑 Cults ({cults.length})</h3>
              <Btn color="#6c757d" onClick={() => setModal('cult')}>+ Found</Btn>
            </div>
            {cults.length === 0 ? <EmptyState icon="🌑" text='No cults... that are known. Use !foundcult in Discord.' /> : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr><th style={S.th}>ID</th><th style={S.th}>Name</th><th style={S.th}>Secret Objective</th><th style={S.th}>Members</th><th style={S.th}>Power</th><th style={S.th}>Rituals</th><th style={S.th}>Actions</th></tr></thead>
                <tbody>
                  {cults.map(c => (
                    <tr key={c.id}>
                      <td style={S.td}><code style={{ fontSize: 12 }}>{c.id}</code></td>
                      <td style={{ ...S.td, fontWeight: 700 }}>{c.name}</td>
                      <td style={{ ...S.td, fontSize: 12, color: '#888', fontStyle: 'italic' }}>{c.secretObjective}</td>
                      <td style={S.td}><Badge>{c.members.length}</Badge></td>
                      <td style={S.td}><Badge color="#e2d9f3" textColor="#6f42c1">⚡ {c.power}</Badge></td>
                      <td style={S.td}><Badge color="#f8d7da" textColor="#721c24">🕯️ {c.rituals}</Badge></td>
                      <td style={{ ...S.td, display: 'flex', gap: 6 }}>
                        <Btn small color="#6f42c1" onClick={async () => { await post(`/api/cults/${c.id}/ritual`, {}); showToast('Ritual performed!'); load(); }}>🕯️ Ritual</Btn>
                        <Btn small color="#dc3545" onClick={() => doDelete(`Destroy cult "${c.name}"?`, () => del(`/api/cults/${c.id}`))}>🗑</Btn>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* ── DIPLOMACY ── */}
        {tab === 'Diplomacy' && (
          <>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
              <Btn onClick={() => setModal('alliance')}>+ Add</Btn>
            </div>
            {/* Rebels section */}
            <div style={S.card}>
              <h3 style={{ margin: '0 0 14px' }}>⚔️ Rebels ({rebels.length})</h3>
              {rebels.length === 0 ? <EmptyState icon="⚔️" text="No rebels. Use !rebel in Discord to break away from a civilization." /> : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr><th style={S.th}>User ID</th><th style={S.th}>From Civ</th><th style={S.th}>Reason</th><th style={S.th}>Since</th><th style={S.th}>Actions</th></tr></thead>
                  <tbody>
                    {rebels.map(r => (
                      <tr key={r.userId}>
                        <td style={S.td}><code style={{ fontSize: 12 }}>{r.userId}</code></td>
                        <td style={S.td}>{getName('civilization', r.fromCivId)}</td>
                        <td style={{ ...S.td, fontSize: 12, color: '#777' }}>{r.reason}</td>
                        <td style={{ ...S.td, fontSize: 12, color: '#aaa' }}>{r.createdAt ? new Date(r.createdAt).toLocaleDateString() : '—'}</td>
                        <td style={S.td}><Btn small color="#198754" onClick={() => doDelete(`Pardon rebel ${r.userId}?`, () => del(`/api/rebels/${r.userId}`))}>Pardon</Btn></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            {/* Wars */}
            <div style={S.card}>
              <h3 style={{ margin: '0 0 14px' }}>💥 Wars ({wars.length})</h3>
              {wars.length === 0 ? <EmptyState icon="💥" text="No active wars." /> : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr><th style={S.th}>ID</th><th style={S.th}>Party 1</th><th style={S.th}>Party 2</th><th style={S.th}>Started</th><th style={S.th}>Actions</th></tr></thead>
                  <tbody>
                    {wars.map(w => (
                      <tr key={w.id}>
                        <td style={S.td}><code style={{ fontSize: 12 }}>{w.id}</code></td>
                        <td style={{ ...S.td, fontWeight: 700 }}>{getName('civilization', w.party1)}</td>
                        <td style={{ ...S.td, fontWeight: 700 }}>{getName('civilization', w.party2)}</td>
                        <td style={{ ...S.td, fontSize: 12, color: '#aaa' }}>{w.createdAt ? new Date(w.createdAt).toLocaleDateString() : '—'}</td>
                        <td style={S.td}><Btn small color="#198754" onClick={() => doDelete('End this war?', () => del(`/api/alliances/${w.id}`))}>🕊 End</Btn></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            {/* Alliances */}
            <div style={S.card}>
              <h3 style={{ margin: '0 0 14px' }}>🤝 Alliances & Treaties ({allies.length})</h3>
              {allies.length === 0 ? <EmptyState icon="🤝" text="No alliances yet." /> : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr><th style={S.th}>Type</th><th style={S.th}>Party 1</th><th style={S.th}>Party 2</th><th style={S.th}>Since</th><th style={S.th}>Actions</th></tr></thead>
                  <tbody>
                    {allies.map(a => (
                      <tr key={a.id}>
                        <td style={S.td}><Badge color="#d4edda" textColor="#155724">{a.type}</Badge></td>
                        <td style={{ ...S.td, fontWeight: 700 }}>{getName('civilization', a.party1)}</td>
                        <td style={{ ...S.td, fontWeight: 700 }}>{getName('civilization', a.party2)}</td>
                        <td style={{ ...S.td, fontSize: 12, color: '#aaa' }}>{a.createdAt ? new Date(a.createdAt).toLocaleDateString() : '—'}</td>
                        <td style={S.td}><Btn small color="#dc3545" onClick={() => doDelete('Remove this alliance?', () => del(`/api/alliances/${a.id}`))}>🗑</Btn></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}

        {/* ── ECONOMY ── */}
        {tab === 'Economy' && (
          <div style={S.card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0 }}>💰 Economy — Gold Leaderboard</h3>
              <Btn color="#198754" onClick={() => setModal('economy_set')}>💸 Set Balance</Btn>
            </div>
            {economy.length === 0 ? <EmptyState icon="💰" text="No economy data yet. Members earn gold by using !daily in Discord." /> : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr><th style={S.th}>#</th><th style={S.th}>User</th><th style={S.th}>Balance</th></tr></thead>
                <tbody>
                  {economy.map((e, i) => (
                    <tr key={e.id}>
                      <td style={{ ...S.td, fontWeight: 700, color: i < 3 ? ['#FFD700','#C0C0C0','#CD7F32'][i] : '#aaa', fontSize: i < 3 ? 16 : 14 }}>{i + 1}</td>
                      <td style={{ ...S.td }}><code style={{ fontSize: 12, color: '#555' }}>{e.id}</code></td>
                      <td style={S.td}><Badge color="#fff3cd" textColor="#856404">💰 {e.balance} gold</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* ── EVENTS ── */}
        {tab === 'Events' && (
          <div style={S.card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0 }}>📅 Events ({events.length})</h3>
              <Btn onClick={() => setModal('event')}>+ Create</Btn>
            </div>
            {events.length === 0 ? <EmptyState icon="📅" text="No events yet. Create one above, then members can join with !joinevent in Discord." /> : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr><th style={S.th}>ID</th><th style={S.th}>Name</th><th style={S.th}>Type</th><th style={S.th}>Status</th><th style={S.th}>Participants</th><th style={S.th}>Reward</th><th style={S.th}>Actions</th></tr></thead>
                <tbody>
                  {events.map(e => (
                    <tr key={e.id}>
                      <td style={S.td}><code style={{ fontSize: 12 }}>{e.id}</code></td>
                      <td style={{ ...S.td, fontWeight: 700 }}>{e.name}</td>
                      <td style={S.td}><Badge>{e.type}</Badge></td>
                      <td style={S.td}><Badge color={e.status === 'open' ? '#d4edda' : '#f8d7da'} textColor={e.status === 'open' ? '#155724' : '#721c24'}>{e.status}</Badge></td>
                      <td style={S.td}>{e.participants.length}</td>
                      <td style={S.td}><Badge color="#fff3cd" textColor="#856404">💰 {e.reward}</Badge></td>
                      <td style={{ ...S.td, display: 'flex', gap: 6 }}>
                        {e.status === 'open' && <Btn small color="#fd7e14" onClick={async () => { await post(`/api/events/${e.id}/end`, {}); showToast('Event ended!'); load(); }}>⏹ End</Btn>}
                        <Btn small color="#dc3545" onClick={() => doDelete(`Delete event "${e.name}"?`, () => del(`/api/events/${e.id}`))}>🗑</Btn>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* ── MEMBERS ── */}
        {tab === 'Members' && (
          <div style={S.card}>
            <h3 style={{ margin: '0 0 16px' }}>👥 Members ({users.length})</h3>
            {users.length === 0 ? <EmptyState icon="👥" text="No members yet. Members are registered when they chat in Discord." /> : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr><th style={S.th}>User ID</th><th style={S.th}>Lvl</th><th style={S.th}>XP</th><th style={S.th}>Rank</th><th style={S.th}>Civ</th><th style={S.th}>Religion</th><th style={S.th}>Team</th><th style={S.th}>Cult</th><th style={S.th}>Status</th><th style={S.th}>Actions</th></tr></thead>
                <tbody>
                  {users.map(u => (
                    <tr key={u.id}>
                      <td style={{ ...S.td, fontSize: 11 }}><code>{u.id}</code></td>
                      <td style={S.td}>{u.level}</td>
                      <td style={{ ...S.td, fontSize: 11 }}>{u.xp}/{u.nextLevelXp}</td>
                      <td style={S.td}>{u.rank}</td>
                      <td style={{ ...S.td, fontSize: 11 }}>{getName('civilization', u.civilization)}</td>
                      <td style={{ ...S.td, fontSize: 11 }}>{getName('religion', u.religion)}</td>
                      <td style={{ ...S.td, fontSize: 11 }}>{getName('team', u.team)}</td>
                      <td style={{ ...S.td, fontSize: 11 }}>{u.cult ? '🌑 Yes' : '—'}</td>
                      <td style={S.td}>{u.isRebel ? <Badge color="#f8d7da" textColor="#721c24">⚔️ Rebel</Badge> : <Badge color="#d4edda" textColor="#155724">Active</Badge>}</td>
                      <td style={{ ...S.td }}>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <Btn small color="#fd7e14" onClick={async () => { await post(`/api/users/${u.id}/reset`, {}); showToast('Reset!'); load(); }}>↩</Btn>
                          <Btn small color="#dc3545" onClick={() => doDelete(`Remove member ${u.id}?`, () => del(`/api/users/${u.id}`))}>🗑</Btn>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* ── SERVERS ── */}
        {tab === 'Servers' && (
          <div style={S.card}>
            <h3 style={{ margin: '0 0 16px' }}>🖥️ Servers ({servers.length})</h3>
            {servers.length === 0 ? <EmptyState icon="🖥️" text="No servers tracked. Added automatically when the bot joins a server." /> : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr><th style={S.th}>Server ID</th><th style={S.th}>Name</th><th style={S.th}>Added</th><th style={S.th}>Actions</th></tr></thead>
                <tbody>
                  {servers.map(s => (
                    <tr key={s.serverId}>
                      <td style={{ ...S.td, fontSize: 12 }}><code>{s.serverId}</code></td>
                      <td style={{ ...S.td, fontWeight: 700 }}>{s.serverName}</td>
                      <td style={{ ...S.td, fontSize: 12, color: '#aaa' }}>{s.setupAt ? new Date(s.setupAt).toLocaleDateString() : '—'}</td>
                      <td style={S.td}><Btn small color="#dc3545" onClick={() => doDelete(`Remove server "${s.serverName}"?`, () => del(`/api/servers/${s.serverId}`))}>🗑 Remove</Btn></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* ── SETTINGS ── */}
        {tab === 'Settings' && features && (
          <div style={{ display: 'grid', gap: 16 }}>
            <div style={S.card}>
              <h3 style={{ margin: '0 0 4px' }}>🤖 Bot Control</h3>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 0', borderBottom: '1px solid #f0f0f0' }}>
                <div>
                  <div style={{ fontWeight: 600 }}>Discord Connection</div>
                  <div style={{ fontSize: 12, color: '#999', marginTop: 2 }}>{bot?.online ? `${bot.tag} · ${bot.guilds} server(s) · ${bot.ping}ms ping` : 'Bot is offline'}</div>
                </div>
                <div>
                  {bot?.online
                    ? <Btn color="#dc3545" onClick={() => botAction('disconnect')}>⏹ Disconnect</Btn>
                    : <Btn color="#198754" onClick={() => botAction('reconnect')}>▶ Reconnect</Btn>
                  }
                </div>
              </div>
            </div>
            <div style={S.card}>
              <h3 style={{ margin: '0 0 4px' }}>⚙️ Feature Flags</h3>
              <p style={{ margin: '0 0 8px', fontSize: 12, color: '#999' }}>All changes take effect immediately.</p>
              <Toggle label="XP System" description={`Members earn ${features.xpPerMessage} XP per message`} checked={features.xpEnabled} onChange={v => toggleFeature('xpEnabled', v)} />
              <Toggle label="Bot Commands" description="Enable all ! commands" checked={features.commandsEnabled} onChange={v => toggleFeature('commandsEnabled', v)} />
              <Toggle label="Civilizations" description="Allow creating/joining civilizations" checked={features.civilizationsEnabled} onChange={v => toggleFeature('civilizationsEnabled', v)} />
              <Toggle label="Religions" description="Allow founding/joining religions" checked={features.religionsEnabled} onChange={v => toggleFeature('religionsEnabled', v)} />
              <Toggle label="Teams" description="Allow creating/joining teams" checked={features.teamsEnabled} onChange={v => toggleFeature('teamsEnabled', v)} />
              <Toggle label="Cults" description="Allow founding/joining cults" checked={features.cultsEnabled} onChange={v => toggleFeature('cultsEnabled', v)} />
              <Toggle label="Rebels" description="Allow members to rebel from civilizations" checked={features.rebelsEnabled} onChange={v => toggleFeature('rebelsEnabled', v)} />
              <Toggle label="Wars & Alliances" description="Allow declaring war and alliances" checked={features.warsEnabled} onChange={v => toggleFeature('warsEnabled', v)} />
              <Toggle label="Economy" description="Enable gold, daily rewards, and trading" checked={features.economyEnabled} onChange={v => toggleFeature('economyEnabled', v)} />
              <Toggle label="Events" description="Allow creating and joining events" checked={features.eventsEnabled} onChange={v => toggleFeature('eventsEnabled', v)} />
              <Toggle label="Welcome Messages" description="Notify on member join" checked={features.welcomeMessages} onChange={v => toggleFeature('welcomeMessages', v)} />
              <Toggle label="Auto-Register Members" description="Track members automatically on join" checked={features.autoRegisterMembers} onChange={v => toggleFeature('autoRegisterMembers', v)} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
