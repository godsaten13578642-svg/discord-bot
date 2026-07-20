import React, { useState, useEffect, useCallback } from 'react';
import './App.css';
import LoginPage from './LoginPage';

const api  = (path, opts) => fetch(path, opts).then(r => r.json());
const post = (path, body) => api(path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}` }, body: JSON.stringify(body) });
const del  = (path) => api(path, { method: 'DELETE', headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` } });

const TABS = ['Dashboard','Civilizations','Religions','Teams','Cults','Diplomacy','Economy','Events','Members','Servers','Minecraft','Announcements','Settings'];

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

export default function App() {
  // Authentication State
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userRole, setUserRole] = useState(null);
  const [userId, setUserId] = useState(null);
  const [username, setUsername] = useState(null);
  const [userInfo, setUserInfo] = useState(null);

  // Dashboard State
  const [tab,     setTab]     = useState('Dashboard');
  const [state,   setState]   = useState({ stats: null, bot: null, civs: [], users: [], servers: [], features: null, religions: [], teams: [], cults: [], rebels: [], alliances: [], economy: [] });
  const [channels, setChannels] = useState([]);
  const [modal,   setModal]   = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [toast,   setToast]   = useState(null);
  const [form,    setForm]    = useState({});
  const [announcements, setAnnouncements] = useState([]);
  const [ann, setAnn] = useState({ title: '', body: '', channelId: '', scheduledAt: '' });
  const [mcStatus, setMcStatus] = useState(null);

  const showToast  = (msg, ok = true) => { setToast({ msg, ok }); setTimeout(() => setToast(null), 3200); };
  const closeModal = () => { setModal(null); setForm({}); };

  // Check authentication on mount
  useEffect(() => {
    const token = localStorage.getItem('token');
    const role = localStorage.getItem('role');
    const id = localStorage.getItem('userId');
    const name = localStorage.getItem('username');
    
    if (token && role && id && name) {
      setIsAuthenticated(true);
      setUserRole(role);
      setUserId(id);
      setUsername(name);
    }
  }, []);

  // Load user info
  useEffect(() => {
    if (isAuthenticated) {
      api('/api/auth/me', { headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` } })
        .then(data => setUserInfo(data))
        .catch(() => {});
    }
  }, [isAuthenticated]);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('userId');
    localStorage.removeItem('role');
    localStorage.removeItem('username');
    setIsAuthenticated(false);
    setUserRole(null);
    setUserId(null);
    setUsername(null);
  };

  const handleLogin = (data) => {
    setIsAuthenticated(true);
    setUserRole(data.role);
    setUserId(data.userId);
    setUsername(data.username);
  };

  // Load dashboard data
  const loadAnnouncements = useCallback(async () => {
    const anns = await api('/api/announcements', { headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` } }).catch(() => []);
    if (Array.isArray(anns)) setAnnouncements(anns.sort((a, b) => b.id - a.id));
  }, []);

  const loadMcStatus = useCallback(async () => {
    const s = await api('/api/mc/status').catch(() => null);
    if (s) setMcStatus(s);
  }, []);

  const load = useCallback(async () => {
    try {
      const headers = { 'Authorization': `Bearer ${localStorage.getItem('token')}` };
      const [stats, bot, civs, users, servers, features, religions, teams, cults, rebels, alliances, economy, events, bounties] = await Promise.all([
        api('/api/stats', { headers }), api('/api/bot/status', { headers }), api('/api/civilizations', { headers }), api('/api/users', { headers }),
        api('/api/servers', { headers }), api('/api/features', { headers }), api('/api/religions', { headers }), api('/api/teams', { headers }),
        api('/api/cults', { headers }), api('/api/rebels', { headers }), api('/api/alliances', { headers }), api('/api/economy', { headers }),
        api('/api/events', { headers }), api('/api/bounties', { headers }),
      ]);
      setState({ stats, bot, civs, users, servers, features, religions, teams, cults, rebels, alliances, economy, events, bounties });
      const chs = await api('/api/channels', { headers }).catch(() => []);
      if (Array.isArray(chs)) setChannels(chs);
    } catch (_) {}
    loadAnnouncements();
    loadMcStatus();
  }, [loadAnnouncements, loadMcStatus]);

  useEffect(() => { 
    if (isAuthenticated) {
      load(); 
      const t = setInterval(load, 8000); 
      return () => clearInterval(t);
    }
  }, [load, isAuthenticated]);

  if (!isAuthenticated) {
    return <LoginPage onLogin={handleLogin} />;
  }

  const doDelete  = (msg, fn) => setConfirm({ msg, fn });
  const runConfirm = async () => { await confirm.fn(); setConfirm(null); load(); };

  const { stats, bot, civs, users, servers, features, religions, teams, cults, rebels, alliances, economy, events, bounties } = state;

  const tabStyle = t => ({
    padding: '10px 16px', cursor: 'pointer', fontWeight: 600, fontSize: 13,
    color: tab === t ? '#0d6efd' : '#666', background: 'none', border: 'none',
    borderBottom: tab === t ? '3px solid #0d6efd' : '3px solid transparent',
    transition: 'color .15s',
  });

  return (
    <div style={{ minHeight: '100vh', background: '#f8f9fa', fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif' }}>
      {/* Header */}
      <div style={{ background: 'white', borderBottom: '1px solid #eee', padding: '0 24px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 0 0' }}>
            <div style={{ fontWeight: 800, fontSize: 20 }}>🏛️ CivBot Dashboard</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 13, color: '#666' }}>
                👤 {username} {userRole === 'master' && <Badge color="#ffd700" textColor="#333">👑 MASTER</Badge>}
                {userRole === 'owner' && <Badge color="#87ceeb" textColor="#333">🏢 OWNER</Badge>}
              </span>
              <Btn small color="#dc3545" outline onClick={handleLogout}>Logout</Btn>
            </div>
          </div>
          <div style={{ display: 'flex', overflowX: 'auto' }}>
            {TABS.map(t => <button key={t} style={tabStyle(t)} onClick={() => setTab(t)}>{t}</button>)}
          </div>
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 24px' }}>
        {/* Dashboard Tab */}
        {tab === 'Dashboard' && stats && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', gap: 14, marginBottom: 20 }}>
              {[
                ['👥 Members', stats.totalMembers], ['🏛️ Civs', stats.civilizations],
                ['✝️ Religions', stats.religions],  ['🛡️ Teams', stats.teams],
                ['🌑 Cults', stats.cults],          ['⚔️ Wars', stats.wars],
                ['🤝 Alliances', stats.alliances],  ['📅 Events', stats.events],
              ].map(([label, val]) => (
                <div key={label} style={{ ...S.card, marginBottom: 0, textAlign: 'center' }}>
                  <div style={{ fontSize: 26, fontWeight: 800, color: '#0d6efd' }}>{val}</div>
                  <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>{label}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Civilizations Tab */}
        {tab === 'Civilizations' && (
          <div style={S.card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <h3 style={{ margin: 0 }}>🏛️ Civilizations</h3>
              {(userRole === 'master' || userRole === 'owner') && (
                <Btn small onClick={() => setModal({ title: 'Create Civilization', fields: [{ key: 'name', label: 'Name', placeholder: 'e.g. Roman Empire' }], onSubmit: f => post('/api/civilizations/create', { name: f.name, leaderId: userId }).then(() => { load(); closeModal(); showToast('Civilization created!'); }) })}>+ Create</Btn>
              )}
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
                    <td style={S.td}>{userRole === 'master' && <Btn small color="#dc3545" outline onClick={() => doDelete(`Disband ${c.name}?`, () => del(`/api/civilizations/${c.id}`))}>Disband</Btn>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!civs.length && <div style={{ textAlign: 'center', padding: '48px 0', color: '#bbb' }}>No civilizations yet</div>}
          </div>
        )}

        {/* Add more tabs as needed... */}
      </div>
    </div>
  );
}
