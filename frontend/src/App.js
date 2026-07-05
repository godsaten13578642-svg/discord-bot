import React, { useState, useEffect, useCallback } from 'react';
import './App.css';

const api = (path, opts) => fetch(path, opts).then(r => r.json());

const TABS = ['Dashboard', 'Civilizations', 'Members', 'Servers', 'Settings'];

function Toggle({ label, checked, onChange, description }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid #eee' }}>
      <div>
        <div style={{ fontWeight: 600 }}>{label}</div>
        {description && <div style={{ fontSize: 13, color: '#888', marginTop: 2 }}>{description}</div>}
      </div>
      <label style={{ position: 'relative', display: 'inline-block', width: 48, height: 26, flexShrink: 0 }}>
        <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} style={{ opacity: 0, width: 0, height: 0 }} />
        <span style={{
          position: 'absolute', cursor: 'pointer', inset: 0, borderRadius: 13,
          backgroundColor: checked ? '#0d6efd' : '#ccc', transition: '.2s'
        }}>
          <span style={{
            position: 'absolute', height: 20, width: 20, left: checked ? 24 : 4, bottom: 3,
            backgroundColor: 'white', borderRadius: '50%', transition: '.2s'
          }} />
        </span>
      </label>
    </div>
  );
}

function Btn({ children, onClick, color = '#0d6efd', small, disabled }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      background: disabled ? '#aaa' : color, color: 'white', border: 'none',
      borderRadius: 6, padding: small ? '4px 10px' : '8px 16px',
      fontSize: small ? 12 : 14, cursor: disabled ? 'not-allowed' : 'pointer', fontWeight: 600
    }}>{children}</button>
  );
}

function Confirm({ message, onConfirm, onCancel }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999 }}>
      <div style={{ background: 'white', borderRadius: 10, padding: 28, maxWidth: 360, textAlign: 'center' }}>
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>⚠️ Confirm</div>
        <p style={{ color: '#555', marginBottom: 20 }}>{message}</p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
          <Btn color="#dc3545" onClick={onConfirm}>Yes, delete</Btn>
          <Btn color="#6c757d" onClick={onCancel}>Cancel</Btn>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [tab, setTab] = useState('Dashboard');
  const [stats, setStats] = useState(null);
  const [bot, setBot] = useState(null);
  const [civs, setCivs] = useState([]);
  const [users, setUsers] = useState([]);
  const [servers, setServers] = useState([]);
  const [features, setFeatures] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [toast, setToast] = useState(null);

  const showToast = (msg, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  };

  const load = useCallback(async () => {
    const [s, b, c, u, srv, f] = await Promise.all([
      api('/api/stats'), api('/api/bot/status'),
      api('/api/civilizations'), api('/api/users'),
      api('/api/servers'), api('/api/features')
    ]);
    setStats(s); setBot(b); setCivs(c); setUsers(u); setServers(srv); setFeatures(f);
  }, []);

  useEffect(() => { load(); const t = setInterval(load, 8000); return () => clearInterval(t); }, [load]);

  const deleteCiv = (id, name) => setConfirm({
    message: `Delete civilization "${name}"? All members will be removed from it.`,
    onConfirm: async () => {
      await api(`/api/civilizations/${id}`, { method: 'DELETE' });
      setConfirm(null); showToast(`Deleted "${name}"`); load();
    },
    onCancel: () => setConfirm(null)
  });

  const deleteUser = (id, username) => setConfirm({
    message: `Remove member "${username}" from the system?`,
    onConfirm: async () => {
      await api(`/api/users/${id}`, { method: 'DELETE' });
      setConfirm(null); showToast(`Removed "${username}"`); load();
    },
    onCancel: () => setConfirm(null)
  });

  const resetUser = async (id, username) => {
    await api(`/api/users/${id}/reset`, { method: 'POST' });
    showToast(`Reset "${username}" to level 1`); load();
  };

  const deleteServer = (id, name) => setConfirm({
    message: `Remove server "${name}" from tracking?`,
    onConfirm: async () => {
      await api(`/api/servers/${id}`, { method: 'DELETE' });
      setConfirm(null); showToast(`Removed "${name}"`); load();
    },
    onCancel: () => setConfirm(null)
  });

  const toggleFeature = async (key, val) => {
    const updated = { ...features, [key]: val };
    setFeatures(updated);
    await api('/api/features', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ [key]: val }) });
    showToast(`${key} ${val ? 'enabled' : 'disabled'}`);
  };

  const botAction = async (action) => {
    const res = await api(`/api/bot/${action}`, { method: 'POST' });
    showToast(res.message, res.success); load();
  };

  const tabStyle = (t) => ({
    padding: '10px 18px', cursor: 'pointer', fontWeight: 600, fontSize: 14,
    borderBottom: tab === t ? '3px solid #0d6efd' : '3px solid transparent',
    color: tab === t ? '#0d6efd' : '#555', background: 'none', border: 'none',
    borderBottom: tab === t ? '3px solid #0d6efd' : '3px solid transparent'
  });

  const card = { background: 'white', borderRadius: 10, padding: 20, boxShadow: '0 1px 4px rgba(0,0,0,.08)' };
  const th = { padding: '10px 12px', textAlign: 'left', borderBottom: '2px solid #eee', fontWeight: 700, fontSize: 13, color: '#888' };
  const td = { padding: '10px 12px', borderBottom: '1px solid #f0f0f0', fontSize: 14 };

  return (
    <div style={{ minHeight: '100vh', background: '#f4f6fb', fontFamily: 'system-ui, sans-serif' }}>
      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', top: 20, right: 20, zIndex: 1000,
          background: toast.ok ? '#198754' : '#dc3545', color: 'white',
          padding: '10px 18px', borderRadius: 8, fontWeight: 600, boxShadow: '0 2px 10px rgba(0,0,0,.2)'
        }}>{toast.msg}</div>
      )}

      {/* Confirm dialog */}
      {confirm && <Confirm {...confirm} />}

      {/* Header */}
      <div style={{ background: 'white', boxShadow: '0 1px 4px rgba(0,0,0,.08)', padding: '0 24px' }}>
        <div style={{ maxWidth: 1000, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 0 0' }}>
            <span style={{ fontSize: 26 }}>🏛️</span>
            <span style={{ fontWeight: 800, fontSize: 20 }}>Civilization Bot</span>
            {bot && (
              <span style={{
                marginLeft: 'auto', fontSize: 12, fontWeight: 700, padding: '4px 10px',
                borderRadius: 20, background: bot.online ? '#d4edda' : '#f8d7da',
                color: bot.online ? '#155724' : '#721c24'
              }}>
                {bot.online ? `🟢 ${bot.tag}` : '🔴 Bot Offline'}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
            {TABS.map(t => <button key={t} style={tabStyle(t)} onClick={() => setTab(t)}>{t}</button>)}
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1000, margin: '24px auto', padding: '0 16px' }}>

        {/* ── DASHBOARD ── */}
        {tab === 'Dashboard' && (
          <div style={{ display: 'grid', gap: 20 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
              {[
                { label: 'Total Members', value: stats?.totalMembers ?? '…', icon: '👥' },
                { label: 'Civilizations', value: stats?.civilizations ?? '…', icon: '🗺️' },
                { label: 'Servers', value: stats?.servers ?? '…', icon: '🖥️' },
                { label: 'Bot Ping', value: bot?.online ? `${bot.ping}ms` : '—', icon: '📡' },
              ].map(s => (
                <div key={s.label} style={{ ...card, textAlign: 'center' }}>
                  <div style={{ fontSize: 32 }}>{s.icon}</div>
                  <div style={{ fontSize: 28, fontWeight: 800, margin: '6px 0 2px' }}>{s.value}</div>
                  <div style={{ fontSize: 13, color: '#888' }}>{s.label}</div>
                </div>
              ))}
            </div>

            <div style={card}>
              <h3 style={{ margin: '0 0 16px' }}>⌨️ Bot Commands</h3>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <tbody>
                  {[['!profile', 'View your level, XP, rank, and civilization'],
                    ['!createciv <name>', 'Create a civilization and become leader'],
                    ['!joinciv <id>', 'Join a civilization by ID'],
                    ['!civs', 'List all civilizations'],
                    ['!help', 'Show all commands']
                  ].map(([cmd, desc]) => (
                    <tr key={cmd}><td style={td}><code style={{ color: '#0d6efd' }}>{cmd}</code></td><td style={{ ...td, color: '#666' }}>{desc}</td></tr>
                  ))}
                </tbody>
              </table>
              <p style={{ margin: '12px 0 0', fontSize: 12, color: '#aaa' }}>Every message earns 10 XP (when XP is enabled). Dashboard refreshes every 8 seconds.</p>
            </div>
          </div>
        )}

        {/* ── CIVILIZATIONS ── */}
        {tab === 'Civilizations' && (
          <div style={card}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <h3 style={{ margin: 0 }}>🗺️ Civilizations ({civs.length})</h3>
            </div>
            {civs.length === 0 ? (
              <p style={{ color: '#aaa', textAlign: 'center', padding: '40px 0' }}>No civilizations yet. Use <code>!createciv &lt;name&gt;</code> in Discord.</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr><th style={th}>ID</th><th style={th}>Name</th><th style={th}>Leader</th><th style={th}>Members</th><th style={th}>Created</th><th style={th}>Actions</th></tr>
                </thead>
                <tbody>
                  {civs.map(c => (
                    <tr key={c.id}>
                      <td style={td}><code>{c.id}</code></td>
                      <td style={{ ...td, fontWeight: 700 }}>{c.name}</td>
                      <td style={{ ...td, fontSize: 12, color: '#666' }}>{c.leaderId || '—'}</td>
                      <td style={td}>{c.members.length}</td>
                      <td style={{ ...td, fontSize: 12, color: '#999' }}>{c.createdAt ? new Date(c.createdAt).toLocaleDateString() : '—'}</td>
                      <td style={td}><Btn small color="#dc3545" onClick={() => deleteCiv(c.id, c.name)}>🗑 Delete</Btn></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* ── MEMBERS ── */}
        {tab === 'Members' && (
          <div style={card}>
            <h3 style={{ margin: '0 0 16px' }}>👥 Members ({users.length})</h3>
            {users.length === 0 ? (
              <p style={{ color: '#aaa', textAlign: 'center', padding: '40px 0' }}>No members yet. Members are registered when they chat in Discord.</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr><th style={th}>User ID</th><th style={th}>Level</th><th style={th}>XP</th><th style={th}>Rank</th><th style={th}>Civilization</th><th style={th}>Actions</th></tr>
                </thead>
                <tbody>
                  {users.map(u => (
                    <tr key={u.id}>
                      <td style={{ ...td, fontSize: 12 }}><code>{u.id}</code></td>
                      <td style={td}>{u.level}</td>
                      <td style={{ ...td, fontSize: 12 }}>{u.xp}/{u.nextLevelXp}</td>
                      <td style={td}>{u.rank}</td>
                      <td style={{ ...td, fontSize: 12, color: '#666' }}>{u.civilization ? `Civ #${u.civilization}` : '—'}</td>
                      <td style={{ ...td, display: 'flex', gap: 6 }}>
                        <Btn small color="#fd7e14" onClick={() => resetUser(u.id, u.username || u.id)}>↩ Reset</Btn>
                        <Btn small color="#dc3545" onClick={() => deleteUser(u.id, u.username || u.id)}>🗑 Delete</Btn>
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
          <div style={card}>
            <h3 style={{ margin: '0 0 16px' }}>🖥️ Servers ({servers.length})</h3>
            {servers.length === 0 ? (
              <p style={{ color: '#aaa', textAlign: 'center', padding: '40px 0' }}>No servers tracked yet. Servers are added automatically when the bot is in them.</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr><th style={th}>Server ID</th><th style={th}>Name</th><th style={th}>Added</th><th style={th}>Actions</th></tr>
                </thead>
                <tbody>
                  {servers.map(s => (
                    <tr key={s.serverId}>
                      <td style={{ ...td, fontSize: 12 }}><code>{s.serverId}</code></td>
                      <td style={{ ...td, fontWeight: 700 }}>{s.serverName}</td>
                      <td style={{ ...td, fontSize: 12, color: '#999' }}>{s.setupAt ? new Date(s.setupAt).toLocaleDateString() : '—'}</td>
                      <td style={td}><Btn small color="#dc3545" onClick={() => deleteServer(s.serverId, s.serverName)}>🗑 Remove</Btn></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* ── SETTINGS ── */}
        {tab === 'Settings' && (
          <div style={{ display: 'grid', gap: 20 }}>

            {/* Bot Control */}
            <div style={card}>
              <h3 style={{ margin: '0 0 16px' }}>🤖 Bot Control</h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '12px 0', borderBottom: '1px solid #eee' }}>
                <div>
                  <div style={{ fontWeight: 600 }}>Discord Connection</div>
                  <div style={{ fontSize: 13, color: '#888', marginTop: 2 }}>
                    {bot?.online ? `Connected as ${bot.tag} · ${bot.guilds} server(s) · ${bot.ping}ms` : 'Bot is offline'}
                  </div>
                </div>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                  {bot?.online
                    ? <Btn color="#dc3545" onClick={() => botAction('disconnect')}>⏹ Disconnect</Btn>
                    : <Btn color="#198754" onClick={() => botAction('reconnect')}>▶ Reconnect</Btn>
                  }
                </div>
              </div>
            </div>

            {/* Feature Flags */}
            <div style={card}>
              <h3 style={{ margin: '0 0 4px' }}>⚙️ Features</h3>
              <p style={{ margin: '0 0 8px', fontSize: 13, color: '#888' }}>Changes take effect immediately — no restart needed.</p>
              {features && (
                <>
                  <Toggle label="XP System" description="Members earn 10 XP per message" checked={features.xpEnabled} onChange={v => toggleFeature('xpEnabled', v)} />
                  <Toggle label="Bot Commands" description="Enable !profile, !createciv, etc." checked={features.commandsEnabled} onChange={v => toggleFeature('commandsEnabled', v)} />
                  <Toggle label="Civilizations" description="Allow creating and joining civilizations" checked={features.civilizationsEnabled} onChange={v => toggleFeature('civilizationsEnabled', v)} />
                  <Toggle label="Welcome Messages" description="Send welcome info when members join" checked={features.welcomeMessages} onChange={v => toggleFeature('welcomeMessages', v)} />
                  <Toggle label="Auto-Register Members" description="Track new members automatically on join" checked={features.autoRegisterMembers} onChange={v => toggleFeature('autoRegisterMembers', v)} />
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
