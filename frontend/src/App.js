import React, { useState, useEffect, useCallback } from 'react';
import './App.css';

const api  = (path, opts) => fetch(path, opts).then(r => r.json());
const post = (path, body) => api(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const del  = (path) => api(path, { method: 'DELETE' });

const TABS = ['Dashboard','Civilizations','Religions','Teams','Cults','Diplomacy','Economy','Events','Members','Servers','Settings'];

const S = {
  card:    { background: 'white', borderRadius: 10, padding: 20, boxShadow: '0 1px 4px rgba(0,0,0,.08)', marginBottom: 16 },
  th:      { padding: '9px 12px', textAlign: 'left', borderBottom: '2px solid #eee', fontWeight: 700, fontSize: 12, color: '#999', textTransform: 'uppercase' },
  td:      { padding: '10px 12px', borderBottom: '1px solid #f0f0f0', fontSize: 14, verticalAlign: 'middle' },
  section: { marginBottom: 24 },
  label:   { fontSize: 12, fontWeight: 700, color: '#666', marginBottom: 4, display: 'block' },
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
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '11px 0', borderBottom: '1px solid #f5f5f5' }}>
      <div>
        <div style={{ fontWeight: 600, fontSize: 14 }}>{label}</div>
        {description && <div style={{ fontSize: 12, color: '#999', marginTop: 2 }}>{description}</div>}
      </div>
      <label style={{ position: 'relative', display: 'inline-block', width: 44, height: 24, flexShrink: 0, marginLeft: 16 }}>
        <input type="checkbox" checked={!!checked} onChange={e => onChange(e.target.checked)} style={{ opacity: 0, width: 0, height: 0 }} />
        <span style={{ position: 'absolute', cursor: 'pointer', inset: 0, borderRadius: 12, backgroundColor: checked ? '#0d6efd' : '#ccc', transition: '.2s' }}>
          <span style={{ position: 'absolute', height: 18, width: 18, left: checked ? 23 : 3, bottom: 3, backgroundColor: 'white', borderRadius: '50%', transition: '.2s' }} />
        </span>
      </label>
    </div>
  );
}

function ChannelSelect({ label, description, value, onChange, channels, enabled = true }) {
  return (
    <div style={{ padding: '11px 0', borderBottom: '1px solid #f5f5f5' }}>
      <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 2 }}>{label}</div>
      {description && <div style={{ fontSize: 12, color: '#999', marginBottom: 6 }}>{description}</div>}
      <select
        value={value || ''}
        onChange={e => onChange(e.target.value)}
        disabled={!enabled}
        style={{
          width: '100%', padding: '7px 10px', border: '1.5px solid #ddd', borderRadius: 6,
          fontSize: 13, background: enabled ? 'white' : '#f5f5f5', color: enabled ? '#333' : '#999',
          cursor: enabled ? 'pointer' : 'not-allowed'
        }}
      >
        <option value="">— No channel selected —</option>
        {channels.map(ch => (
          <option key={ch.id} value={ch.id}>{ch.name} ({ch.guild})</option>
        ))}
      </select>
    </div>
  );
}

function NumberInput({ label, description, value, onChange, min = 1, max = 99999 }) {
  return (
    <div style={{ padding: '11px 0', borderBottom: '1px solid #f5f5f5' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: 14 }}>{label}</div>
          {description && <div style={{ fontSize: 12, color: '#999', marginTop: 2 }}>{description}</div>}
        </div>
        <input
          type="number" min={min} max={max} value={value || 0}
          onChange={e => onChange(Number(e.target.value))}
          style={{ width: 80, padding: '5px 8px', border: '1.5px solid #ddd', borderRadius: 6, fontSize: 14, textAlign: 'right' }}
        />
      </div>
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

function SettingsGroup({ title, icon, children }) {
  return (
    <div style={S.card}>
      <h3 style={{ margin: '0 0 4px', fontSize: 15 }}>{icon} {title}</h3>
      <p style={{ margin: '0 0 4px', fontSize: 12, color: '#aaa' }}>Changes apply immediately.</p>
      {children}
    </div>
  );
}

export default function App() {
  const [tab,     setTab]     = useState('Dashboard');
  const [state,   setState]   = useState({ stats: null, bot: null, civs: [], users: [], servers: [], features: null, religions: [], teams: [], cults: [], rebels: [], alliances: [], economy: [], events: [], bounties: [] });
  const [channels, setChannels] = useState([]);
  const [modal,   setModal]   = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [toast,   setToast]   = useState(null);
  const [form,    setForm]    = useState({});

  const showToast  = (msg, ok = true) => { setToast({ msg, ok }); setTimeout(() => setToast(null), 3200); };
  const closeModal = () => { setModal(null); setForm({}); };

  const load = useCallback(async () => {
    try {
      const [stats, bot, civs, users, servers, features, religions, teams, cults, rebels, alliances, economy, events, bounties] = await Promise.all([
        api('/api/stats'), api('/api/bot/status'), api('/api/civilizations'), api('/api/users'),
        api('/api/servers'), api('/api/features'), api('/api/religions'), api('/api/teams'),
        api('/api/cults'), api('/api/rebels'), api('/api/alliances'), api('/api/economy'),
        api('/api/events'), api('/api/bounties'),
      ]);
      setState({ stats, bot, civs, users, servers, features, religions, teams, cults, rebels, alliances, economy, events, bounties });
      // Fetch channels separately (only works when bot is online)
      const chs = await api('/api/channels').catch(() => []);
      if (Array.isArray(chs)) setChannels(chs);
    } catch (_) {}
  }, []);

  useEffect(() => { load(); const t = setInterval(load, 8000); return () => clearInterval(t); }, [load]);

  const doDelete  = (msg, fn) => setConfirm({ msg, fn });
  const runConfirm = async () => { await confirm.fn(); setConfirm(null); load(); };

  const setFeature = async (key, val) => {
    setState(s => ({ ...s, features: { ...s.features, [key]: val } }));
    await post('/api/features', { [key]: val });
    showToast(`Saved!`);
  };
  const toggleFeature = (key, val) => setFeature(key, val);

  const botAction = async (action) => {
    const r = await post(`/api/bot/${action}`, {});
    showToast(r.message, r.success); load();
  };

  const createItem = async (endpoint, body, label) => {
    const r = await post(endpoint, body);
    if (r.error || r.success === false) { showToast(r.error || r.message, false); return; }
    showToast(`${label} created!`); closeModal(); load();
  };

  const { stats, bot, civs, users, servers, features, religions, teams, cults, rebels, alliances, economy, events, bounties } = state;
  const wars  = alliances.filter(a => a.type === 'war');
  const allies = alliances.filter(a => a.type === 'alliance');

  const tabStyle = t => ({
    padding: '10px 16px', cursor: 'pointer', fontWeight: 600, fontSize: 13,
    color: tab === t ? '#0d6efd' : '#666', background: 'none', border: 'none',
    borderBottom: tab === t ? '3px solid #0d6efd' : '3px solid transparent',
    transition: 'color .15s',
  });

  return (
    <div style={{ minHeight: '100vh', background: '#f8f9fa', fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif' }}>
      {/* Toast */}
      {toast && (
        <div style={{ position: 'fixed', top: 20, right: 20, zIndex: 9999, background: toast.ok ? '#198754' : '#dc3545', color: 'white', borderRadius: 8, padding: '10px 18px', fontWeight: 600, boxShadow: '0 4px 16px rgba(0,0,0,.2)', fontSize: 14 }}>
          {toast.ok ? '✅' : '❌'} {toast.msg}
        </div>
      )}

      {/* Confirm */}
      {confirm && (
        <Modal title="Confirm" onClose={() => setConfirm(null)}>
          <p style={{ marginBottom: 20 }}>{confirm.msg}</p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Btn outline onClick={() => setConfirm(null)}>Cancel</Btn>
            <Btn color="#dc3545" onClick={runConfirm}>Confirm</Btn>
          </div>
        </Modal>
      )}

      {/* Modal */}
      {modal && (
        <Modal title={modal.title} onClose={closeModal}>
          {modal.fields?.map(f => (
            <Input key={f.key} label={f.label} placeholder={f.placeholder} value={form[f.key] || ''} onChange={v => setForm(s => ({ ...s, [f.key]: v }))} />
          ))}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
            <Btn outline onClick={closeModal}>Cancel</Btn>
            <Btn onClick={() => modal.onSubmit(form)}>Create</Btn>
          </div>
        </Modal>
      )}

      {/* Header */}
      <div style={{ background: 'white', borderBottom: '1px solid #eee', padding: '0 24px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 0 0' }}>
            <div style={{ fontWeight: 800, fontSize: 20 }}>🏛️ CivBot Dashboard</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: bot?.online ? '#198754' : '#dc3545', display: 'inline-block' }} />
              <span style={{ fontSize: 13, color: '#666' }}>{bot?.online ? `${bot.tag} · ${bot.ping}ms` : 'Bot offline'}</span>
            </div>
          </div>
          <div style={{ display: 'flex', overflowX: 'auto' }}>
            {TABS.map(t => <button key={t} style={tabStyle(t)} onClick={() => setTab(t)}>{t}</button>)}
          </div>
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 24px' }}>

        {/* Dashboard */}
        {tab === 'Dashboard' && stats && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', gap: 14, marginBottom: 20 }}>
              {[
                ['👥 Members', stats.totalMembers], ['🏛️ Civs', stats.civilizations],
                ['✝️ Religions', stats.religions],  ['🛡️ Teams', stats.teams],
                ['🌑 Cults', stats.cults],          ['⚔️ Wars', stats.wars],
                ['🤝 Alliances', stats.alliances],  ['📅 Events', stats.events],
                ['🎯 Bounties', stats.bounties],    ['🖥️ Servers', stats.servers],
              ].map(([label, val]) => (
                <div key={label} style={{ ...S.card, marginBottom: 0, textAlign: 'center' }}>
                  <div style={{ fontSize: 26, fontWeight: 800, color: '#0d6efd' }}>{val}</div>
                  <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>{label}</div>
                </div>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div style={S.card}>
                <h4 style={{ margin: '0 0 12px' }}>🏆 Top Gold</h4>
                {economy.slice(0, 5).map((e, i) => (
                  <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f5f5f5', fontSize: 13 }}>
                    <span>{i + 1}. {e.username}</span><span style={{ fontWeight: 700 }}>{e.balance} 💰</span>
                  </div>
                ))}
                {!economy.length && <EmptyState icon="💰" text="No economy data" />}
              </div>
              <div style={S.card}>
                <h4 style={{ margin: '0 0 12px' }}>🎯 Active Bounties</h4>
                {(bounties || []).slice(0, 5).map(b => (
                  <div key={b.targetId} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f5f5f5', fontSize: 13 }}>
                    <span>{b.targetId.slice(0,8)}…{b.note ? ` — ${b.note}` : ''}</span>
                    <span style={{ fontWeight: 700, color: '#dc3545' }}>{b.amount} 💰</span>
                  </div>
                ))}
                {!(bounties || []).length && <EmptyState icon="🎯" text="No bounties" />}
              </div>
            </div>
          </div>
        )}

        {/* Civilizations */}
        {tab === 'Civilizations' && (
          <div style={S.card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <h3 style={{ margin: 0 }}>🏛️ Civilizations</h3>
              <Btn small onClick={() => setModal({ title: 'Create Civilization', fields: [{ key: 'name', label: 'Name', placeholder: 'e.g. Roman Empire' }], onSubmit: f => createItem('/api/civilizations/create', { name: f.name }, 'Civilization') })}>+ Create</Btn>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>{['ID','Name','Members','Treasury','Leader','Actions'].map(h => <th key={h} style={S.th}>{h}</th>)}</tr></thead>
              <tbody>
                {civs.map(c => (
                  <tr key={c.id}>
                    <td style={S.td}><Badge>{c.id}</Badge></td>
                    <td style={S.td}><strong>{c.name}</strong></td>
                    <td style={S.td}>{c.members.length}</td>
                    <td style={S.td}>💰 {c.treasury || 0}</td>
                    <td style={S.td}><code style={{ fontSize: 11 }}>{c.leaderId}</code></td>
                    <td style={S.td}><Btn small color="#dc3545" outline onClick={() => doDelete(`Disband ${c.name}?`, () => del(`/api/civilizations/${c.id}`))}>Disband</Btn></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!civs.length && <EmptyState icon="🏛️" text="No civilizations yet" />}
          </div>
        )}

        {/* Religions */}
        {tab === 'Religions' && (
          <div style={S.card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <h3 style={{ margin: 0 }}>✝️ Religions</h3>
              <Btn small onClick={() => setModal({ title: 'Found Religion', fields: [{ key: 'name', label: 'Name' }, { key: 'doctrine', label: 'Doctrine', placeholder: 'optional' }], onSubmit: f => createItem('/api/religions/create', { name: f.name, doctrine: f.doctrine }, 'Religion') })}>+ Found</Btn>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>{['ID','Name','Doctrine','Followers','Blessings','Actions'].map(h => <th key={h} style={S.th}>{h}</th>)}</tr></thead>
              <tbody>
                {religions.map(r => (
                  <tr key={r.id}>
                    <td style={S.td}><Badge>{r.id}</Badge></td>
                    <td style={S.td}><strong>{r.name}</strong></td>
                    <td style={S.td} title={r.doctrine}><span style={{ fontSize: 12, color: '#888' }}>{r.doctrine?.slice(0,40) || '—'}</span></td>
                    <td style={S.td}>{r.members.length}</td>
                    <td style={S.td}>✨ {r.blessings}</td>
                    <td style={S.td}><Btn small color="#dc3545" outline onClick={() => doDelete(`Dissolve ${r.name}?`, () => del(`/api/religions/${r.id}`))}>Dissolve</Btn></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!religions.length && <EmptyState icon="✝️" text="No religions yet" />}
          </div>
        )}

        {/* Teams */}
        {tab === 'Teams' && (
          <div style={S.card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <h3 style={{ margin: 0 }}>🛡️ Teams</h3>
              <Btn small onClick={() => setModal({ title: 'Create Team', fields: [{ key: 'name', label: 'Name' }], onSubmit: f => createItem('/api/teams/create', { name: f.name }, 'Team') })}>+ Create</Btn>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>{['ID','Name','Members','Points','Leader','Actions'].map(h => <th key={h} style={S.th}>{h}</th>)}</tr></thead>
              <tbody>
                {teams.map(t => (
                  <tr key={t.id}>
                    <td style={S.td}><Badge>{t.id}</Badge></td>
                    <td style={S.td}><strong>{t.name}</strong></td>
                    <td style={S.td}>{t.members.length}</td>
                    <td style={S.td}>⭐ {t.points}</td>
                    <td style={S.td}><code style={{ fontSize: 11 }}>{t.leaderId}</code></td>
                    <td style={S.td}><Btn small color="#dc3545" outline onClick={() => doDelete(`Disband ${t.name}?`, () => del(`/api/teams/${t.id}`))}>Disband</Btn></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!teams.length && <EmptyState icon="🛡️" text="No teams yet" />}
          </div>
        )}

        {/* Cults */}
        {tab === 'Cults' && (
          <div style={S.card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <h3 style={{ margin: 0 }}>🌑 Cults</h3>
              <Btn small onClick={() => setModal({ title: 'Found Cult', fields: [{ key: 'name', label: 'Name' }, { key: 'secretObjective', label: 'Secret Objective' }], onSubmit: f => createItem('/api/cults/create', { name: f.name, secretObjective: f.secretObjective }, 'Cult') })}>+ Found</Btn>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>{['ID','Name','Members','Power','Rituals','Actions'].map(h => <th key={h} style={S.th}>{h}</th>)}</tr></thead>
              <tbody>
                {cults.map(c => (
                  <tr key={c.id}>
                    <td style={S.td}><Badge>{c.id}</Badge></td>
                    <td style={S.td}><strong>{c.name}</strong></td>
                    <td style={S.td}>{c.members.length}</td>
                    <td style={S.td}>⚡ {c.power}</td>
                    <td style={S.td}>{c.rituals}</td>
                    <td style={S.td}><Btn small color="#dc3545" outline onClick={() => doDelete(`Dissolve ${c.name}?`, () => del(`/api/cults/${c.id}`))}>Dissolve</Btn></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!cults.length && <EmptyState icon="🌑" text="No cults yet" />}
          </div>
        )}

        {/* Diplomacy */}
        {tab === 'Diplomacy' && (
          <div>
            <div style={S.card}>
              <h3 style={{ margin: '0 0 12px' }}>⚔️ Active Wars ({wars.length})</h3>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>{['ID','Aggressor (Civ)','Target (Civ)','Since','Actions'].map(h => <th key={h} style={S.th}>{h}</th>)}</tr></thead>
                <tbody>
                  {wars.map(w => (
                    <tr key={w.id}>
                      <td style={S.td}><Badge color="#ffe3e3" textColor="#c0392b">{w.id}</Badge></td>
                      <td style={S.td}>{civs.find(c => String(c.id) === String(w.party1))?.name || `Civ ${w.party1}`}</td>
                      <td style={S.td}>{civs.find(c => String(c.id) === String(w.party2))?.name || `Civ ${w.party2}`}</td>
                      <td style={S.td} style={{ fontSize: 12 }}>{new Date(w.createdAt).toLocaleDateString()}</td>
                      <td style={S.td}><Btn small color="#198754" outline onClick={() => doDelete('End this war?', () => del(`/api/alliances/${w.id}`))}>Peace</Btn></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!wars.length && <EmptyState icon="🕊️" text="No active wars" />}
            </div>
            <div style={S.card}>
              <h3 style={{ margin: '0 0 12px' }}>🤝 Alliances ({allies.length})</h3>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>{['ID','Party 1','Party 2','Since','Actions'].map(h => <th key={h} style={S.th}>{h}</th>)}</tr></thead>
                <tbody>
                  {allies.map(a => (
                    <tr key={a.id}>
                      <td style={S.td}><Badge color="#d4edda" textColor="#155724">{a.id}</Badge></td>
                      <td style={S.td}>{civs.find(c => String(c.id) === String(a.party1))?.name || `Civ ${a.party1}`}</td>
                      <td style={S.td}>{civs.find(c => String(c.id) === String(a.party2))?.name || `Civ ${a.party2}`}</td>
                      <td style={S.td} style={{ fontSize: 12 }}>{new Date(a.createdAt).toLocaleDateString()}</td>
                      <td style={S.td}><Btn small color="#dc3545" outline onClick={() => doDelete('Break this alliance?', () => del(`/api/alliances/${a.id}`))}>Break</Btn></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!allies.length && <EmptyState icon="🤝" text="No alliances yet" />}
            </div>
            <div style={S.card}>
              <h3 style={{ margin: '0 0 12px' }}>⚔️ Rebels ({rebels.length})</h3>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>{['User','From Civ','Reason','Since','Actions'].map(h => <th key={h} style={S.th}>{h}</th>)}</tr></thead>
                <tbody>
                  {rebels.map(r => (
                    <tr key={r.userId}>
                      <td style={S.td}><code style={{ fontSize: 11 }}>{r.userId}</code></td>
                      <td style={S.td}>{civs.find(c => String(c.id) === String(r.fromCivId))?.name || `Civ ${r.fromCivId}`}</td>
                      <td style={S.td}>{r.reason}</td>
                      <td style={S.td} style={{ fontSize: 12 }}>{new Date(r.createdAt).toLocaleDateString()}</td>
                      <td style={S.td}><Btn small color="#198754" outline onClick={() => doDelete('Pardon this rebel?', () => del(`/api/rebels/${r.userId}`))}>Pardon</Btn></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!rebels.length && <EmptyState icon="⚔️" text="No rebels" />}
            </div>
          </div>
        )}

        {/* Economy */}
        {tab === 'Economy' && (
          <div style={S.card}>
            <h3 style={{ margin: '0 0 14px' }}>💰 Economy Leaderboard</h3>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>{['Rank','User','Balance','Actions'].map(h => <th key={h} style={S.th}>{h}</th>)}</tr></thead>
              <tbody>
                {economy.map((e, i) => (
                  <tr key={e.id}>
                    <td style={S.td}><Badge>{i + 1}</Badge></td>
                    <td style={S.td}><code style={{ fontSize: 12 }}>{e.username || e.id}</code></td>
                    <td style={S.td}><strong>{e.balance}</strong> gold</td>
                    <td style={S.td}><Btn small onClick={() => setModal({ title: `Set Balance for ${e.id}`, fields: [{ key: 'amount', label: 'New Balance' }], onSubmit: f => { post('/api/economy/admin/set', { userId: e.id, amount: Number(f.amount) }); closeModal(); load(); } })}>Set Balance</Btn></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!economy.length && <EmptyState icon="💰" text="No economy data yet" />}
          </div>
        )}

        {/* Events */}
        {tab === 'Events' && (
          <div style={S.card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <h3 style={{ margin: 0 }}>📅 Events</h3>
              <Btn small onClick={() => setModal({ title: 'Create Event', fields: [{ key: 'name', label: 'Event Name' }, { key: 'type', label: 'Type', placeholder: 'general / pvp / building' }], onSubmit: f => createItem('/api/events/create', { name: f.name, type: f.type || 'general' }, 'Event') })}>+ Create</Btn>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>{['ID','Name','Type','Status','Participants','Reward','Actions'].map(h => <th key={h} style={S.th}>{h}</th>)}</tr></thead>
              <tbody>
                {events.map(e => (
                  <tr key={e.id}>
                    <td style={S.td}><Badge>{e.id}</Badge></td>
                    <td style={S.td}><strong>{e.name}</strong></td>
                    <td style={S.td}><Badge>{e.type}</Badge></td>
                    <td style={S.td}><Badge color={e.status === 'open' ? '#d4edda' : '#e9ecef'} textColor={e.status === 'open' ? '#155724' : '#555'}>{e.status}</Badge></td>
                    <td style={S.td}>{e.participants.length}</td>
                    <td style={S.td}>💰 {e.reward}</td>
                    <td style={S.td} style={{ display: 'flex', gap: 4 }}>
                      {e.status === 'open' && <Btn small color="#198754" onClick={() => { const w = prompt('Winner user ID?'); if (w) post(`/api/events/${e.id}/end`, { winnerId: w }).then(load); }}>End</Btn>}
                      <Btn small color="#dc3545" outline onClick={() => doDelete(`Delete event ${e.name}?`, () => del(`/api/events/${e.id}`))}>Delete</Btn>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!events.length && <EmptyState icon="📅" text="No events yet" />}
          </div>
        )}

        {/* Members */}
        {tab === 'Members' && (
          <div style={S.card}>
            <h3 style={{ margin: '0 0 14px' }}>👥 Members ({users.length})</h3>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>{['User ID','Level','XP','Rank','Civ','Religion','Team','Gold','Actions'].map(h => <th key={h} style={S.th}>{h}</th>)}</tr></thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id}>
                    <td style={S.td}><code style={{ fontSize: 11 }}>{u.id}</code></td>
                    <td style={S.td}>{u.level}</td>
                    <td style={S.td}><span style={{ fontSize: 11 }}>{u.xp}/{u.nextLevelXp}</span></td>
                    <td style={S.td}><Badge color={u.isRebel ? '#ffe3e3' : '#e9ecef'} textColor={u.isRebel ? '#c0392b' : '#555'}>{u.rank}</Badge></td>
                    <td style={S.td}>{civs.find(c => String(c.id) === String(u.civilization))?.name || '—'}</td>
                    <td style={S.td}>{religions.find(r => String(r.id) === String(u.religion))?.name || '—'}</td>
                    <td style={S.td}>{teams.find(t => String(t.id) === String(u.team))?.name || '—'}</td>
                    <td style={S.td}>{economy.find(e => e.id === u.id)?.balance ?? 0}</td>
                    <td style={S.td} style={{ display: 'flex', gap: 4 }}>
                      <Btn small color="#ffc107" outline onClick={() => doDelete(`Reset ${u.id}?`, () => post(`/api/users/${u.id}/reset`, {}))}>Reset</Btn>
                      <Btn small color="#dc3545" outline onClick={() => doDelete(`Delete ${u.id}?`, () => del(`/api/users/${u.id}`))}>Del</Btn>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!users.length && <EmptyState icon="👥" text="No members yet" />}
          </div>
        )}

        {/* Servers */}
        {tab === 'Servers' && (
          <div style={S.card}>
            <h3 style={{ margin: '0 0 14px' }}>🖥️ Discord Servers ({servers.length})</h3>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>{['Server ID','Name','Setup At','Actions'].map(h => <th key={h} style={S.th}>{h}</th>)}</tr></thead>
              <tbody>
                {servers.map(s => (
                  <tr key={s.serverId}>
                    <td style={S.td}><code style={{ fontSize: 11 }}>{s.serverId}</code></td>
                    <td style={S.td}><strong>{s.serverName}</strong></td>
                    <td style={S.td} style={{ fontSize: 12 }}>{new Date(s.setupAt).toLocaleDateString()}</td>
                    <td style={S.td}><Btn small color="#dc3545" outline onClick={() => doDelete(`Remove ${s.serverName}?`, () => del(`/api/servers/${s.serverId}`))}>Remove</Btn></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!servers.length && <EmptyState icon="🖥️" text="No servers yet" />}
          </div>
        )}

        {/* Settings */}
        {tab === 'Settings' && features && (
          <div style={{ display: 'grid', gap: 0 }}>

            {/* Bot Control */}
            <SettingsGroup title="Bot Control" icon="🤖">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 0', borderBottom: '1px solid #f5f5f5' }}>
                <div>
                  <div style={{ fontWeight: 600 }}>Discord Connection</div>
                  <div style={{ fontSize: 12, color: '#999', marginTop: 2 }}>{bot?.online ? `${bot.tag} · ${bot.guilds} server(s) · ${bot.ping}ms` : 'Bot is offline'}</div>
                </div>
                {bot?.online
                  ? <Btn color="#dc3545" onClick={() => botAction('disconnect')}>⏹ Disconnect</Btn>
                  : <Btn color="#198754" onClick={() => botAction('reconnect')}>▶ Reconnect</Btn>
                }
              </div>
              <Toggle label="Bot Commands" description="Enable all ! prefix commands" checked={features.commandsEnabled} onChange={v => toggleFeature('commandsEnabled', v)} />
              <Toggle label="Auto-Register Members" description="Track members automatically when they join" checked={features.autoRegisterMembers} onChange={v => toggleFeature('autoRegisterMembers', v)} />
              {!channels.length && <div style={{ fontSize: 12, color: '#f59e0b', padding: '8px 0' }}>⚠️ Bot must be online to load channel dropdowns.</div>}
            </SettingsGroup>

            {/* Welcome & Notifications */}
            <SettingsGroup title="Welcome & Notifications" icon="👋">
              <Toggle label="Welcome Messages" description="Post a welcome message when members join" checked={features.welcomeMessages} onChange={v => toggleFeature('welcomeMessages', v)} />
              <ChannelSelect label="Welcome Channel" description="Where to post join/leave messages" value={features.welcomeChannelId} onChange={v => setFeature('welcomeChannelId', v)} channels={channels} enabled={features.welcomeMessages} />
              <Toggle label="Level-Up Announcements" description="Announce when members level up" checked={features.levelupEnabled} onChange={v => toggleFeature('levelupEnabled', v)} />
              <ChannelSelect label="Level-Up Channel" description="Where to post level-up announcements (falls back to welcome channel)" value={features.levelupChannelId} onChange={v => setFeature('levelupChannelId', v)} channels={channels} enabled={features.levelupEnabled} />
            </SettingsGroup>

            {/* XP & Economy */}
            <SettingsGroup title="XP & Economy" icon="⭐">
              <Toggle label="XP System" description="Members earn XP for chatting" checked={features.xpEnabled} onChange={v => toggleFeature('xpEnabled', v)} />
              <NumberInput label="XP per Message" description="How much XP each message awards" value={features.xpPerMessage} onChange={v => setFeature('xpPerMessage', v)} min={1} max={1000} />
              <Toggle label="Economy" description="Enable gold, daily rewards, and trading" checked={features.economyEnabled} onChange={v => toggleFeature('economyEnabled', v)} />
              <NumberInput label="Daily Reward" description="Gold awarded by !daily" value={features.dailyRewardAmount} onChange={v => setFeature('dailyRewardAmount', v)} min={1} max={999999} />
            </SettingsGroup>

            {/* Bounties */}
            <SettingsGroup title="Bounties" icon="🎯">
              <Toggle label="Bounty System" description="Allow placing gold bounties on players" checked={features.bountyEnabled} onChange={v => toggleFeature('bountyEnabled', v)} />
              <ChannelSelect label="Bounty Channel" description="Where to announce new/claimed bounties" value={features.bountyChannelId} onChange={v => setFeature('bountyChannelId', v)} channels={channels} enabled={features.bountyEnabled} />
            </SettingsGroup>

            {/* Polls */}
            <SettingsGroup title="Polls" icon="📊">
              <Toggle label="Polls" description="Allow !poll to create community votes" checked={features.pollsEnabled} onChange={v => toggleFeature('pollsEnabled', v)} />
              <ChannelSelect label="Polls Channel" description="Where polls are posted by default" value={features.pollsChannelId} onChange={v => setFeature('pollsChannelId', v)} channels={channels} enabled={features.pollsEnabled} />
            </SettingsGroup>

            {/* Fun Commands */}
            <SettingsGroup title="Fun Commands" icon="🎮">
              <Toggle label="Fun Commands" description="!coinflip, !roll, !8ball, !rps" checked={features.funCommandsEnabled} onChange={v => toggleFeature('funCommandsEnabled', v)} />
            </SettingsGroup>

            {/* Groups */}
            <SettingsGroup title="Groups & Factions" icon="🏛️">
              <Toggle label="Civilizations" description="Allow creating/joining civilizations" checked={features.civilizationsEnabled} onChange={v => toggleFeature('civilizationsEnabled', v)} />
              <Toggle label="Religions" description="Allow founding/joining religions" checked={features.religionsEnabled} onChange={v => toggleFeature('religionsEnabled', v)} />
              <Toggle label="Teams" description="Allow creating/joining teams" checked={features.teamsEnabled} onChange={v => toggleFeature('teamsEnabled', v)} />
              <Toggle label="Cults" description="Allow founding/joining cults" checked={features.cultsEnabled} onChange={v => toggleFeature('cultsEnabled', v)} />
              <Toggle label="Rebels" description="Allow members to rebel from civilizations" checked={features.rebelsEnabled} onChange={v => toggleFeature('rebelsEnabled', v)} />
            </SettingsGroup>

            {/* Diplomacy */}
            <SettingsGroup title="Diplomacy" icon="⚔️">
              <Toggle label="Wars & Alliances" description="Allow declaring war and forming alliances" checked={features.warsEnabled} onChange={v => toggleFeature('warsEnabled', v)} />
              <Toggle label="Diplomacy Announcements" description="Post war/alliance news to a channel" checked={features.diplomacyAnnouncementsEnabled} onChange={v => toggleFeature('diplomacyAnnouncementsEnabled', v)} />
              <ChannelSelect label="Diplomacy Channel" description="Where wars and alliances are announced" value={features.diplomacyChannelId} onChange={v => setFeature('diplomacyChannelId', v)} channels={channels} enabled={features.diplomacyAnnouncementsEnabled} />
            </SettingsGroup>

            {/* Events */}
            <SettingsGroup title="Events" icon="📅">
              <Toggle label="Events" description="Allow creating and joining events" checked={features.eventsEnabled} onChange={v => toggleFeature('eventsEnabled', v)} />
              <ChannelSelect label="Events Channel" description="Where new/completed events are announced" value={features.eventsChannelId} onChange={v => setFeature('eventsChannelId', v)} channels={channels} enabled={features.eventsEnabled} />
            </SettingsGroup>

            {/* Minecraft Bridge */}
            <SettingsGroup title="Minecraft Bridge" icon="🎮">
              <Toggle label="MC↔Discord Bridge" description="Relay Minecraft chat to Discord and back" checked={features.bridgeEnabled} onChange={v => toggleFeature('bridgeEnabled', v)} />
              <ChannelSelect label="Bridge Channel" description="Discord channel linked to Minecraft chat" value={features.bridgeChannelId} onChange={v => setFeature('bridgeChannelId', v)} channels={channels} enabled={features.bridgeEnabled} />
              <Toggle label="MC Event Announcements" description="Announce player joins, deaths, advancements" checked={features.mcEventsEnabled} onChange={v => toggleFeature('mcEventsEnabled', v)} />
              <ChannelSelect label="MC Events Channel" description="Where MC player events are posted" value={features.mcEventsChannelId} onChange={v => setFeature('mcEventsChannelId', v)} channels={channels} enabled={features.mcEventsEnabled} />
              <div style={{ padding: '11px 0', borderBottom: '1px solid #f5f5f5' }}>
                <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 2 }}>MC API Key</div>
                <div style={{ fontSize: 12, color: '#999', marginBottom: 6 }}>Set this in your Paper plugin's config.yml</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    type="text" value={features.mcApiKey || ''} readOnly
                    style={{ flex: 1, padding: '7px 10px', border: '1.5px solid #ddd', borderRadius: 6, fontSize: 13, background: '#f5f5f5' }}
                  />
                  <Btn small onClick={() => {
                    const key = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
                    setFeature('mcApiKey', key);
                  }}>Regenerate</Btn>
                </div>
              </div>
            </SettingsGroup>

          </div>
        )}
      </div>
    </div>
  );
}
