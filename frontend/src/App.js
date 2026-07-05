import React, { useState, useEffect } from 'react';
import './App.css';

function App() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        // Get API URL from environment or use default
        const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:5000';
        
        console.log('Fetching from:', `${apiUrl}/api/users/1`);
        
        const response = await fetch(`${apiUrl}/api/users/1`);
        
        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }
        
        const data = await response.json();
        
        setStats({
          totalMembers: 1234,
          civilizations: 5,
          activeMembers: 456,
          apiConnected: true,
          userFromApi: data
        });
        
        setError(null);
      } catch (err) {
        console.error('Error fetching stats:', err);
        
        // Fallback to mock data if API fails
        setStats({
          totalMembers: 1234,
          civilizations: 5,
          activeMembers: 456,
          apiConnected: false
        });
        
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, []);

  return (
    <div className="app">
      <h1>🏛️ Civilization Bot Dashboard</h1>
      
      {loading && <p>Loading...</p>}
      
      {error && (
        <div style={{ color: 'orange', padding: '10px', backgroundColor: '#fff3cd', borderRadius: '4px' }}>
          ⚠️ Warning: {error} (Using fallback data)
        </div>
      )}
      
      {!stats?.apiConnected && !loading && (
        <div style={{ color: 'blue', padding: '10px', backgroundColor: '#d1ecf1', borderRadius: '4px' }}>
          ℹ️ API Status: Backend not connected (displaying mock data)
        </div>
      )}
      
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
      
      {stats?.userFromApi && (
        <div style={{ marginTop: '20px', padding: '10px', backgroundColor: '#f8f9fa', borderRadius: '4px' }}>
          <h3>API User Data:</h3>
          <pre>{JSON.stringify(stats.userFromApi, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}

export default App;
