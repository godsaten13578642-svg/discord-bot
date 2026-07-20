import React, { useState } from 'react';

const S = {
  container: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif'
  },
  card: {
    background: 'white',
    borderRadius: 12,
    padding: 40,
    boxShadow: '0 20px 60px rgba(0,0,0,.3)',
    maxWidth: 420,
    width: '90%'
  },
  title: {
    fontSize: 28,
    fontWeight: 800,
    marginBottom: 8,
    color: '#333'
  },
  subtitle: {
    fontSize: 14,
    color: '#999',
    marginBottom: 28
  },
  inputGroup: {
    marginBottom: 16
  },
  label: {
    display: 'block',
    fontSize: 12,
    fontWeight: 700,
    color: '#666',
    marginBottom: 6
  },
  input: {
    width: '100%',
    padding: '11px 14px',
    border: '1.5px solid #ddd',
    borderRadius: 8,
    fontSize: 14,
    boxSizing: 'border-box',
    transition: 'border-color .2s',
    outline: 'none'
  },
  button: {
    width: '100%',
    padding: '11px 16px',
    background: '#667eea',
    color: 'white',
    border: 'none',
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 700,
    cursor: 'pointer',
    marginTop: 8,
    transition: 'background .2s'
  },
  toggle: {
    textAlign: 'center',
    marginTop: 20,
    fontSize: 14,
    color: '#666'
  },
  toggleLink: {
    color: '#667eea',
    cursor: 'pointer',
    fontWeight: 700,
    textDecoration: 'none'
  },
  error: {
    background: '#fee',
    color: '#c33',
    padding: '10px 12px',
    borderRadius: 6,
    fontSize: 13,
    marginBottom: 16,
    border: '1px solid #fcc'
  },
  success: {
    background: '#efe',
    color: '#3c3',
    padding: '10px 12px',
    borderRadius: 6,
    fontSize: 13,
    marginBottom: 16,
    border: '1px solid #cfc'
  },
  badge: {
    display: 'inline-block',
    background: '#ffd700',
    color: '#333',
    padding: '4px 8px',
    borderRadius: 4,
    fontSize: 11,
    fontWeight: 700,
    marginLeft: 8
  }
};

export default function LoginPage({ onLogin }) {
  const [mode, setMode] = useState('login'); // 'login' or 'signup'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [isMasterSignup, setIsMasterSignup] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      const data = await res.json();

      if (!res.ok || data.error) {
        setError(data.error || 'Login failed');
      } else {
        localStorage.setItem('token', data.token);
        localStorage.setItem('userId', data.userId);
        localStorage.setItem('role', data.role);
        localStorage.setItem('username', data.username);
        setSuccess('Login successful!');
        setTimeout(() => onLogin(data), 1000);
      }
    } catch (err) {
      setError('Network error: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSignup = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (!username.trim()) {
      setError('Username is required');
      setLoading(false);
      return;
    }

    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, username })
      });

      const data = await res.json();

      if (!res.ok || data.error) {
        setError(data.error || 'Signup failed');
      } else {
        setSuccess(
          data.isMasterAccount
            ? '👑 Master account created successfully! Logging in...'
            : '✅ Account created! Logging in...'
        );
        setIsMasterSignup(data.isMasterAccount);
        localStorage.setItem('token', data.token);
        localStorage.setItem('userId', data.userId);
        localStorage.setItem('role', data.role);
        localStorage.setItem('username', data.username);
        setTimeout(() => onLogin(data), 2000);
      }
    } catch (err) {
      setError('Network error: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={S.container}>
      <div style={S.card}>
        <div style={S.title}>
          🏛️ CivBot
          {mode === 'signup' && isMasterSignup && <span style={S.badge}>MASTER</span>}
        </div>
        <div style={S.subtitle}>
          {mode === 'login' ? 'Sign in to your account' : 'Create a new account'}
        </div>

        {error && <div style={S.error}>❌ {error}</div>}
        {success && <div style={S.success}>✅ {success}</div>}

        <form onSubmit={mode === 'login' ? handleLogin : handleSignup}>
          {mode === 'signup' && (
            <div style={S.inputGroup}>
              <label style={S.label}>Username</label>
              <input
                type="text"
                style={S.input}
                placeholder="Your display name"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={loading}
              />
            </div>
          )}

          <div style={S.inputGroup}>
            <label style={S.label}>Email</label>
            <input
              type="email"
              style={S.input}
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
            />
          </div>

          <div style={S.inputGroup}>
            <label style={S.label}>Password</label>
            <input
              type="password"
              style={S.input}
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
            />
          </div>

          <button
            type="submit"
            style={{
              ...S.button,
              opacity: loading ? 0.6 : 1,
              cursor: loading ? 'not-allowed' : 'pointer'
            }}
            disabled={loading}
          >
            {loading ? 'Loading...' : mode === 'login' ? 'Sign In' : 'Create Account'}
          </button>
        </form>

        <div style={S.toggle}>
          {mode === 'login' ? 'No account? ' : 'Already have an account? '}
          <a
            style={S.toggleLink}
            onClick={() => {
              setMode(mode === 'login' ? 'signup' : 'login');
              setError('');
              setSuccess('');
            }}
          >
            {mode === 'login' ? 'Sign Up' : 'Sign In'}
          </a>
        </div>
      </div>
    </div>
  );
}
