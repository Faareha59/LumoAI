import express from 'express';
import { WebSocketServer } from 'ws';
import cors from 'cors';
import { MongoClient, ObjectId } from 'mongodb';
import crypto from 'crypto';

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/Lumo_AI';
const PORT = Number(process.env.PORT) || 8765;
const ADMIN_SECRET = process.env.ADMIN_SECRET || '';

let db;
async function initDb() {
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  // derive DB name from URI or default to Lumo_AI
  let dbName = 'Lumo_AI';
  try { const u = new URL(MONGODB_URI); dbName = (u.pathname || '/Lumo_AI').slice(1) || 'Lumo_AI'; } catch {}
  db = client.db(dbName);
  await db.collection('users').createIndex({ email: 1 }, { unique: true });
  await db.collection('sessions').createIndex({ token: 1 }, { unique: true });
  console.log(`Connected to MongoDB database: ${dbName}`);
}

function hashPassword(password, salt) {
  const s = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, s, 64).toString('hex');
  return `${s}:${hash}`;
}

function verifyPassword(password, stored) {
  const [s, hash] = stored.split(':');
  const calc = crypto.scryptSync(password, s, 64).toString('hex');
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(calc, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function issueToken(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  await db.collection('sessions').insertOne({ token, userId: new ObjectId(userId), createdAt: new Date() });
  return token;
}

async function getUserFromAuth(req) {
  const auth = req.headers['authorization'];
  if (!auth || !auth.startsWith('Bearer ')) return null;
  const token = auth.slice(7);
  const session = await db.collection('sessions').findOne({ token });
  if (!session) return null;
  const user = await db.collection('users').findOne({ _id: session.userId });
  return user;
}

app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password, role } = req.body || {};
    if (!name || !email || !password || !role || !['teacher','student'].includes(String(role))) {
      return res.status(400).json({ error: 'Invalid payload' });
    }
    if (String(role) === 'teacher') {
      return res.status(403).json({ error: 'Teacher accounts are created by the admin only' });
    }
    const passHash = hashPassword(password);
    const userDoc = { name, email: String(email).toLowerCase(), passwordHash: passHash, role: 'student', createdAt: new Date() };
    const r = await db.collection('users').insertOne(userDoc);
    const token = await issueToken(r.insertedId.toString());
    return res.json({ token, user: { id: r.insertedId.toString(), name, email: userDoc.email, role: userDoc.role } });
  } catch (e) {
    if (e?.code === 11000) return res.status(409).json({ error: 'Email already registered' });
    return res.status(500).json({ error: 'Register failed' });
  }
});

// Admin-only endpoint to create teacher accounts
app.post('/api/admin/create-teacher', async (req, res) => {
  try {
    const secret = (req.headers['x-admin-secret'] || req.body?.secret || '').toString();
    if (!ADMIN_SECRET || secret !== ADMIN_SECRET) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const { name, email, password } = req.body || {};
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Invalid payload' });
    }
    const passHash = hashPassword(password);
    const userDoc = { name, email: String(email).toLowerCase(), passwordHash: passHash, role: 'teacher', createdAt: new Date() };
    const r = await db.collection('users').insertOne(userDoc);
    return res.json({ user: { id: r.insertedId.toString(), name, email: userDoc.email, role: userDoc.role } });
  } catch (e) {
    if (e?.code === 11000) return res.status(409).json({ error: 'Email already registered' });
    return res.status(500).json({ error: 'Create teacher failed' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'Missing credentials' });
    const user = await db.collection('users').findOne({ email: String(email).toLowerCase() });
    if (!user) return res.status(401).json({ error: 'Invalid email or password' });
    const ok = verifyPassword(password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: 'Invalid email or password' });
    const token = await issueToken(user._id.toString());
    return res.json({ token, user: { id: user._id.toString(), name: user.name, email: user.email, role: user.role } });
  } catch {
    return res.status(500).json({ error: 'Login failed' });
  }
});

// Authenticated user can change their own password
app.post('/api/auth/change-password', async (req, res) => {
  try {
    const user = await getUserFromAuth(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    const { oldPassword, newPassword } = req.body || {};
    if (!oldPassword || !newPassword || String(newPassword).length < 8) {
      return res.status(400).json({ error: 'Invalid payload' });
    }
    const ok = verifyPassword(oldPassword, user.passwordHash);
    if (!ok) return res.status(401).json({ error: 'Old password is incorrect' });
    const newHash = hashPassword(newPassword);
    await db.collection('users').updateOne({ _id: user._id }, { $set: { passwordHash: newHash } });
    return res.json({ success: true });
  } catch {
    return res.status(500).json({ error: 'Change password failed' });
  }
});

// Admin can reset any user's password (e.g., set a temporary password)
app.post('/api/admin/reset-password', async (req, res) => {
  try {
    const secret = (req.headers['x-admin-secret'] || req.body?.secret || '').toString();
    if (!ADMIN_SECRET || secret !== ADMIN_SECRET) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const { email, newPassword } = req.body || {};
    if (!email || !newPassword || String(newPassword).length < 8) {
      return res.status(400).json({ error: 'Invalid payload' });
    }
    const user = await db.collection('users').findOne({ email: String(email).toLowerCase() });
    if (!user) return res.status(404).json({ error: 'User not found' });
    const newHash = hashPassword(newPassword);
    await db.collection('users').updateOne({ _id: user._id }, { $set: { passwordHash: newHash } });
    return res.json({ success: true });
  } catch {
    return res.status(500).json({ error: 'Reset password failed' });
  }
});

app.get('/api/auth/me', async (req, res) => {
  try {
    const user = await getUserFromAuth(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    return res.json({ user: { id: user._id.toString(), name: user.name, email: user.email, role: user.role } });
  } catch {
    return res.status(500).json({ error: 'Failed' });
  }
});

function startServer(port) {
  const srv = app.listen(port, () => console.log(`Auth server listening on http://localhost:${port}`));
  // WebSocket: Class Chat
  try {
    const wss = new WebSocketServer({ server: srv, path: '/ws/class' });
    wss.on('connection', (ws) => {
      ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString());
          const text = String(msg?.text || '');
          const sender = String(msg?.sender || 'Student');
          const mentions = Array.from(text.matchAll(/!(\w+)/g)).map(m => m[1]);
          const out = JSON.stringify({ type: 'class_message', text, sender, mentions, time: Date.now() });
          wss.clients.forEach((client) => {
            if (client.readyState === 1) client.send(out);
          });
        } catch {}
      });
      ws.send(JSON.stringify({ type: 'hello', time: Date.now() }));
    });
  } catch (e) {
    console.warn('WebSocket setup failed:', e?.message);
  }
  srv.on('error', (err) => {
    if (err && err.code === 'EADDRINUSE') {
      const next = port + 1;
      console.warn(`Port ${port} in use, retrying on ${next}...`);
      startServer(next);
    } else {
      console.error('Server error', err);
      process.exit(1);
    }
  });
}

initDb().then(() => startServer(PORT)).catch((e) => {
  console.error('Failed to start server', e);
  process.exit(1);
});
