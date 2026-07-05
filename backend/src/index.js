const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();

// Minimal CORS
app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK' });
});

app.post('/api/servers/setup', (req, res) => {
  res.json({ success: true, message: 'Server setup complete' });
});

app.post('/api/civilizations/create', (req, res) => {
  res.json({ success: true, civilizationId: 1, categoryId: 'cat_123' });
});

app.post('/api/members/join', (req, res) => {
  res.json({
    welcomeEnabled: true,
    welcomeChannelId: 'ch_123',
    autoRoles: []
  });
});

app.get('/api/users/:userId', (req, res) => {
  res.json({
    id: 1,
    username: req.params.userId,
    level: 5,
    xp: 1250,
    nextLevelXp: 5000,
    reputation: 42,
    rank: 'Member',
    civilization: null,
    honors: []
  });
});

// Error handling
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Backend running on port ${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
