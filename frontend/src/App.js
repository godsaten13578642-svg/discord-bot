import React, { useState, useEffect } from 'react';
import './App.css';

function App() {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    setStats({
      totalMembers: 1234,
      civilizations: 5,
      activeMembers: 456
    });
  }, []);

  return (
    <div className="app">
      <h1>🏛️ Civilization Bot Dashboard</h1>
      {stats && (
        <div className="stats">
          <div className="stat-card">
            <h3>Total Members</h3>
            <p>{stats.totalMembers}</p>
          </div>
          <div className="stat-card">
            <h3>Civilizations</h3>
            <p>{stats.civilizations}</p>
          </div>
          <div className="stat-card">
            <h3>Active Today</h3>
            <p>{stats.activeMembers}</p>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
