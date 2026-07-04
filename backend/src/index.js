const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();

// CORS configuration for global access
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:5000',
  process.env.FRONTEND_URL,
  process.env.PRODUCTION_URL
].filter(Boolean);

app.use(cors({
  origin: allowedOrigins,
  credentials: true,
  optionsSuccessStatus: 200
}));

app.use(express.json());

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

const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Backend running on port ${PORT}`);
  console.log(`✅ CORS enabled for: ${allowedOrigins.join(', ')}`);
});
