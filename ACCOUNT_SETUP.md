# Account Management & Authentication Setup

## Overview
This authentication system implements a 3-tier user hierarchy:

1. **Master Account** (You)
   - Full system control
   - Can manage all servers
   - Can reset master account
   - Can view/delete all accounts
   - Can promote users to server owners

2. **Server Owners**
   - Manage individual Discord server settings
   - View their server's economy and members
   - Create groups/civilizations/religions for their server
   - Cannot access other servers

3. **Players/Users**
   - Regular members
   - Can join groups and participate in events
   - Can view their profile and server data
   - Cannot manage server settings

## Files Created

- **auth-config.js** - Authentication logic, JWT tokens, password hashing
- **accounts-db.js** - Account database (stored in accounts.json)
- **auth-endpoints.js** - API routes for authentication
- **frontend/src/LoginPage.js** - Login/Signup UI component

## Installation

### 1. Install Dependencies
```bash
npm install jsonwebtoken
```

### 2. Update server.js

Add these imports at the top:
```javascript
const authRouter = require('./auth-endpoints');
const { authMiddleware } = require('./auth-config');
```

Add this route after `app.use(express.json());`:
```javascript
app.use(authRouter);
```

### 3. Update Frontend App.js

Import LoginPage:
```javascript
import LoginPage from './LoginPage';
```

Add authentication check at the start of App():
```javascript
const [isAuthenticated, setIsAuthenticated] = useState(false);
const [userRole, setUserRole] = useState(null);
const [userId, setUserId] = useState(null);

useEffect(() => {
  const token = localStorage.getItem('token');
  const role = localStorage.getItem('role');
  const id = localStorage.getItem('userId');
  
  if (token && role && id) {
    setIsAuthenticated(true);
    setUserRole(role);
    setUserId(id);
  }
}, []);

if (!isAuthenticated) {
  return <LoginPage onLogin={(data) => {
    setIsAuthenticated(true);
    setUserRole(data.role);
    setUserId(data.userId);
  }} />;
}
```

## Console Commands

### Reset Master Account
In your Node console or server terminal, run:
```javascript
const { resetMasterAccount } = require('./accounts-db');
resetMasterAccount();
// Output: 🔄 MASTER ACCOUNT RESET
```

Or via API (requires master auth):
```bash
curl -X POST http://localhost:3001/api/auth/reset-master \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json"
```

## API Endpoints

### Public
- `POST /api/auth/signup` - Create account (first becomes master)
- `POST /api/auth/login` - Login to account

### Authenticated (any user)
- `GET /api/auth/me` - Get current user info

### Master Only
- `GET /api/auth/accounts` - List all accounts
- `GET /api/auth/master` - Get master account info
- `POST /api/auth/reset-master` - Reset master account
- `DELETE /api/auth/accounts/:userId` - Delete account
- `POST /api/auth/promote-owner` - Promote user to server owner
- `POST /api/auth/link-discord` - Link Discord ID to account

## Account Data Structure

### Stored in `accounts.json`:
```json
{
  "accounts": {
    "user_1234567_abc123": {
      "id": "user_1234567_abc123",
      "email": "admin@example.com",
      "passwordHash": "salt:hash",
      "role": "master",
      "username": "Admin",
      "serverId": null,
      "discordId": "12345678",
      "createdAt": "2024-01-01T00:00:00Z",
      "lastLogin": "2024-01-02T00:00:00Z"
    }
  },
  "masterAccount": "user_1234567_abc123",
  "serverOwners": {
    "123456789": "user_1234567_def456"
  },
  "totalAccounts": 1
}
```

## JWT Token

Tokens contain:
```json
{
  "userId": "user_1234567_abc123",
  "role": "master",
  "serverId": null,
  "createdAt": 1234567890
}
```

Expires in 7 days by default.

## Security Notes

1. Change `JWT_SECRET` in auth-config.js or set `JWT_SECRET` environment variable
2. Passwords are hashed using PBKDF2 with 1000 iterations
3. Each password gets a unique salt
4. Tokens are validated on every authenticated request
5. Master account can only be deleted via reset command (safety measure)

## Next Steps

1. Integrate authentication with existing server.js
2. Update dashboard to show authenticated user info
3. Add role-based access control to existing endpoints
4. Protect sensitive endpoints with `requireRole()` middleware
