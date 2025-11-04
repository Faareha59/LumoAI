# LumoAI Auth Server

Express server for authentication with MongoDB.

## Setup

1. Install dependencies:
   ```
   npm install
   ```

2. Configure MongoDB:
   - Copy `.env.example` to `.env` (optional; defaults work for local MongoDB)
   - Set `MONGODB_URI` if using a different connection string
   - Database name: `Lumo_AI`

3. Start the server:
   ```
   npm run dev
   ```

Server runs on http://localhost:4000

## Endpoints

- `POST /api/auth/register` - Register new user (name, email, password, role)
- `POST /api/auth/login` - Login (email, password)
- `GET /api/auth/me` - Get current user (requires Bearer token)

## Collections

- `users` - User accounts with hashed passwords
- `sessions` - Active auth tokens
