import React, { useState, useEffect } from 'react';
import './App.css';

function App() {
  const [stats, setStats] = useState(null);
  const [botStatus, setBotStatus] = useState(null);
  const [civs, setCivs] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = async () => {
    try {
      const [statsRes, botRes, civsRes] = await Promise.all([
        fetch('/api/stats'),
        fetch('/api/bot/status'),
        fetch('/api/civilizations'),
      ]);
      setStats(await statsRes.json());
      setBotStatus(await botRes.json());
      setCivs(await civsRes.json());
    } catch (err) {
      console.error('Fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, 10000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="app">
      <h1>🏛️ Civilization Bot Dashboard</h1>

      {loading && <p>Loading...</p>}

      {/* Bot Status */}
      {botStatus && (
        <div style={{
          padding: '12px 16px',
          borderRadius: '8px',
          marginBottom: '20px',
          backgroundColor: botStatus.online ? '#d4edda' : '#f8d7da',
          color: botStatus.online ? '#155724' : '#721c24',
          fontWeight: 'bold'
        }}>
          {botStatus.online
            ? `🟢 Bot Online — ${botStatus.tag} | ${botStatus.guilds} server(s) | ${botStatus.ping}ms`
            : '🔴 Bot Offline — Add DISCORD_BOT_TOKEN secret to connect'}
        </div>
      )}

      {/* Stats */}
      {stats && (
        <div className="stats">
          <div className="stat-card">
            <h3>Members</h3>
            <p>{stats.totalMembers}</p>
          </div>
          <div className="stat-card">
            <h3>Civilizations</h3>
            <p>{stats.civilizations}</p>
          </div>
          <div className="stat-card">
            <h3>Servers</h3>
            <p>{stats.servers}</p>
          </div>
        </div>
      )}

      {/* Civilizations List */}
      <div style={{ marginTop: '30px' }}>
        <h2>🗺️ Civilizations</h2>
        {civs.length === 0 ? (
          <p style={{ color: '#888' }}>No civilizations yet. Use <code>!createciv &lt;name&gt;</code> in Discord.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #ddd', textAlign: 'left' }}>
                <th style={{ padding: '8px' }}>ID</th>
                <th style={{ padding: '8px' }}>Name</th>
                <th style={{ padding: '8px' }}>Members</th>
                <th style={{ padding: '8px' }}>Leader</th>
              </tr>
            </thead>
            <tbody>
              {civs.map(c => (
                <tr key={c.id} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: '8px' }}>{c.id}</td>
                  <td style={{ padding: '8px' }}><strong>{c.name}</strong></td>
                  <td style={{ padding: '8px' }}>{c.members.length}</td>
                  <td style={{ padding: '8px' }}>{c.leaderId}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Bot Commands */}
      <div style={{ marginTop: '30px', padding: '16px', backgroundColor: '#f8f9fa', borderRadius: '8px' }}>
        <h2>⌨️ Bot Commands</h2>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <tbody>
            {[
              ['!profile', 'View your level, XP, rank, and civilization'],
              ['!createciv <name>', 'Create a new civilization and become its leader'],
              ['!joinciv <id>', 'Join an existing civilization by ID'],
              ['!civs', 'List all civilizations'],
              ['!help', 'Show all commands'],
            ].map(([cmd, desc]) => (
              <tr key={cmd} style={{ borderBottom: '1px solid #e0e0e0' }}>
                <td style={{ padding: '8px', fontFamily: 'monospace', whiteSpace: 'nowrap', color: '#0d6efd' }}>{cmd}</td>
                <td style={{ padding: '8px', color: '#555' }}>{desc}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p style={{ marginTop: '10px', fontSize: '13px', color: '#888' }}>
          Every message earns 10 XP. Dashboard auto-refreshes every 10 seconds.
        </p>
      </div>
    </div>
  );
}

export default App;
