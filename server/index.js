import express from 'express';
import { WebSocketServer } from 'ws';
import cors from 'cors';
import { MongoClient, ObjectId, GridFSBucket } from 'mongodb';
import crypto from 'crypto';
import multer from 'multer';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');
import { GoogleGenerativeAI } from '@google/generative-ai';

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/Lumo_AI';
const PORT = Number(process.env.PORT) || 8765;
const ADMIN_SECRET = process.env.ADMIN_SECRET || '';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.API_KEY || '';

let db;
let materialsBucket;
async function initDb() {
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  // derive DB name from URI or default to Lumo_AI
  let dbName = 'Lumo_AI';
  try { const u = new URL(MONGODB_URI); dbName = (u.pathname || '/Lumo_AI').slice(1) || 'Lumo_AI'; } catch {}
  db = client.db(dbName);
  await db.collection('users').createIndex({ email: 1 }, { unique: true });

// Update module topics (teacher only)
app.patch('/api/courses/:courseId/modules/:moduleId/topics', async (req, res) => {
  try {
    const user = await getUserFromAuth(req);
    if (!user || user.role !== 'teacher') return res.status(403).json({ error: 'Forbidden' });
    const { courseId, moduleId } = req.params;
    const { topics } = req.body || {};
    if (!Array.isArray(topics)) return res.status(400).json({ error: 'Invalid payload' });
    const r = await db.collection('courses').updateOne(
      { $or: [{ id: courseId }, { _id: new ObjectId(courseId).catch?.(() => undefined) }], 'modules.id': moduleId },
      { $set: { 'modules.$.topics': topics } }
    );
    if (r.matchedCount === 0) return res.status(404).json({ error: 'Course/module not found' });
    return res.json({ success: true });
  } catch (e) {
    console.error('Update topics error:', e);
    return res.status(500).json({ error: 'Failed to update topics' });
  }
});
  await db.collection('sessions').createIndex({ token: 1 }, { unique: true });
  await db.collection('materials').createIndex({ courseId: 1, moduleId: 1 });
  await db.collection('embeddings').createIndex({ courseId: 1, moduleId: 1 });
  await db.collection('enrollments').createIndex({ userId: 1, courseId: 1 }, { unique: true });
  materialsBucket = new GridFSBucket(db, { bucketName: 'materials' });
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

// ---------- Courses persistence ----------

// List all courses with modules and lectures
app.get('/api/courses', async (req, res) => {
  try {
    const user = await getUserFromAuth(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    const list = await db.collection('courses').find({}).sort({ createdAt: -1 }).toArray();
    console.log(`[Courses] GET list -> ${list.length} item(s)`);
    // normalize _id to id
    const out = list.map(c => ({
      id: (c.id || c._id?.toString()),
      title: c.title,
      creatorId: c.creatorId ? c.creatorId.toString() : undefined,
      description: c.description,
      modules: (c.modules || []).map(m => ({
        id: m.id,
        title: m.title,
        description: m.description,
        topics: m.topics || [],
        lectures: (m.lectures || []),
      })),
      createdAt: c.createdAt,
    }));
    return res.json({ courses: out });
  } catch (e) {
    console.error('List courses error:', e);
    return res.status(500).json({ error: 'Failed to list courses' });
  }
});

// Create a course (teacher only). Accepts { id?, title, modules }
app.post('/api/courses', async (req, res) => {
  try {
    const user = await getUserFromAuth(req);
    if (!user || user.role !== 'teacher') return res.status(403).json({ error: 'Forbidden' });
    const { id, title, modules, description } = req.body || {};
    if (!title || !Array.isArray(modules)) return res.status(400).json({ error: 'Invalid payload' });
    console.log('[Courses] CREATE request by', user?._id?.toString?.(), 'title=', title, 'modules=', Array.isArray(modules) ? modules.length : 0);
    const defaultDesc = `A guided journey through ${title} across ${(modules||[]).length || 'several'} modules. By the end, you will understand core concepts and be able to apply them in practical scenarios.`;
    const doc = {
      id: id || undefined,
      title,
      description: description || defaultDesc,
      modules: (modules || []).map(m => ({ id: m.id, title: m.title, description: m.description, topics: m.topics || [], lectures: m.lectures || [] })),
      creatorId: user._id,
      createdAt: new Date(),
    };
    const r = await db.collection('courses').insertOne(doc);
    console.log('[Courses] CREATED _id=', r.insertedId?.toString?.());
    return res.json({ course: { id: id || r.insertedId.toString(), title: doc.title, description: doc.description, modules: doc.modules } });
  } catch (e) {
    console.error('Create course error:', e);
    return res.status(500).json({ error: 'Failed to create course' });
  }
});

// Add a lecture to a module
app.post('/api/courses/:courseId/modules/:moduleId/lectures', async (req, res) => {
  try {
    const user = await getUserFromAuth(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    const { courseId, moduleId } = req.params;
    const lecture = req.body || {};
    if (!lecture?.id || !lecture?.title || !Array.isArray(lecture?.slides) || !Array.isArray(lecture?.quiz)) {
      return res.status(400).json({ error: 'Invalid lecture' });
    }
    const r = await db.collection('courses').updateOne(
      { $or: [{ id: courseId }, { _id: new ObjectId(courseId).catch?.(() => undefined) }], 'modules.id': moduleId },
      { $push: { 'modules.$.lectures': { $each: [lecture], $position: 0 } } }
    );
    if (r.matchedCount === 0) return res.status(404).json({ error: 'Course/module not found' });
    return res.json({ success: true });
  } catch (e) {
    console.error('Add lecture error:', e);
    return res.status(500).json({ error: 'Failed to add lecture' });
  }
});

// Delete a lecture
app.delete('/api/courses/:courseId/modules/:moduleId/lectures/:lectureId', async (req, res) => {
  try {
    const user = await getUserFromAuth(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    const { courseId, moduleId, lectureId } = req.params;
    const r = await db.collection('courses').updateOne(
      { $or: [{ id: courseId }, { _id: new ObjectId(courseId).catch?.(() => undefined) }], 'modules.id': moduleId },
      { $pull: { 'modules.$.lectures': { id: lectureId } } }
    );
    if (r.matchedCount === 0) return res.status(404).json({ error: 'Course/module not found' });
    return res.json({ success: true });
  } catch (e) {
    console.error('Delete lecture error:', e);
    return res.status(500).json({ error: 'Failed to delete lecture' });
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

// -------- Materials Upload & RAG ---------

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});

function chunkText(text, chunkSize = 800, overlap = 100) {
  const chunks = [];
  let i = 0;
  while (i < text.length) {
    const end = Math.min(text.length, i + chunkSize);
    chunks.push(text.slice(i, end));
    if (end === text.length) break;
    i = end - overlap;
    if (i < 0) i = 0;
  }
  return chunks.map(t => t.trim()).filter(Boolean);
}

const embeddingModelName = 'text-embedding-004';
const genAI = GEMINI_API_KEY ? new GoogleGenerativeAI(GEMINI_API_KEY) : null;

async function embedTexts(texts) {
  if (!genAI) throw new Error('GEMINI_API_KEY not configured');
  const model = genAI.getGenerativeModel({ model: embeddingModelName });
  const out = [];
  for (const t of texts) {
    const r = await model.embedContent(t);
    const vec = r?.embedding?.values || r?.embedding?.value || [];
    out.push(vec);
    // tiny delay to be polite
    await new Promise(r => setTimeout(r, 50));
  }
  return out;
}

app.post('/api/materials/upload', upload.single('file'), async (req, res) => {
  try {
    const user = await getUserFromAuth(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    const { courseId, moduleId, title } = req.body || {};
    if (!courseId || !req.file) return res.status(400).json({ error: 'Missing courseId or file' });
    const file = req.file;
    if (!/pdf$/i.test(file.mimetype)) return res.status(400).json({ error: 'Only PDF is supported currently' });

    // Store file to GridFS
    const uploadStream = materialsBucket.openUploadStream(file.originalname, {
      contentType: file.mimetype,
      metadata: { courseId, moduleId: moduleId || null, uploaderId: user._id, title: title || file.originalname }
    });
    uploadStream.end(file.buffer);
    const saved = await new Promise((resolve, reject) => {
      uploadStream.on('finish', resolve);
      uploadStream.on('error', reject);
    });

    const materialDoc = {
      fileId: saved._id,
      courseId,
      moduleId: moduleId || null,
      title: title || file.originalname,
      mime: file.mimetype,
      size: file.size,
      uploaderId: user._id,
      createdAt: new Date(),
      indexed: false,
    };
    const ins = await db.collection('materials').insertOne(materialDoc);

    try {
      const parsed = await pdfParse(file.buffer).catch(() => ({ text: '' }));
      const text = (parsed.text || '').replace(/\s+/g, ' ').trim();
      if (!text) {
        console.warn('[Materials] No extractable text found for material', ins.insertedId?.toString?.());
        return res.status(200).json({ material: { id: ins.insertedId.toString(), indexed: false, warning: 'No extractable text found in PDF.' } });
      }

      const chunks = chunkText(text);
      const vectors = await embedTexts(chunks);
      const docs = chunks.map((t, i) => ({
        materialId: ins.insertedId,
        courseId,
        moduleId: moduleId || null,
        chunkIndex: i,
        text: t,
        vector: vectors[i],
        createdAt: new Date(),
      }));
      if (docs.length) await db.collection('embeddings').insertMany(docs);
      await db.collection('materials').updateOne({ _id: ins.insertedId }, { $set: { indexed: true } });

      return res.json({ material: { id: ins.insertedId.toString(), indexed: true, chunks: docs.length } });
    } catch (err) {
      console.warn('[Materials] Embedding pipeline failed; keeping material unindexed. id=', ins.insertedId?.toString?.(), 'error=', err?.message || err);
      return res.status(200).json({ material: { id: ins.insertedId.toString(), indexed: false, warning: 'Material saved but embedding failed. Set GEMINI_API_KEY to enable indexing.' } });
    }
  } catch (e) {
    console.error('Upload error:', e);
    return res.status(500).json({ error: 'Upload failed' });
  }
});

app.get('/api/materials/list', async (req, res) => {
  try {
    const user = await getUserFromAuth(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    const { courseId, moduleId } = req.query || {};
    if (!courseId) return res.status(400).json({ error: 'courseId required' });
    const q = { courseId: String(courseId) };
    if (moduleId) q.moduleId = String(moduleId);
    const list = await db.collection('materials').find(q).sort({ createdAt: -1 }).toArray();
    return res.json({ materials: list.map(m => ({
      id: m._id.toString(),
      title: m.title,
      size: m.size,
      mime: m.mime,
      indexed: !!m.indexed,
      createdAt: m.createdAt,
    }))});
  } catch {
    return res.status(500).json({ error: 'Failed to list materials' });
  }
});

app.post('/api/rag/retrieve', async (req, res) => {
  try {
    const user = await getUserFromAuth(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    const { courseId, moduleId, topic, limit } = req.body || {};
    if (!courseId || !topic) return res.status(400).json({ error: 'courseId and topic are required' });

    // Embed the query (topic)
    const [qVec] = await embedTexts([String(topic)]);

    const k = Math.min(Number(limit) || 12, 25);
    const baseFilter = { courseId: String(courseId) };
    if (moduleId) baseFilter.moduleId = String(moduleId);

    // Try Atlas vector search; fallback to regex if not available
    try {
      const results = await db.collection('embeddings').aggregate([
        {
          $vectorSearch: {
            index: 'vector_index',
            path: 'vector',
            queryVector: qVec,
            numCandidates: Math.max(k * 10, 100),
            limit: k,
            filter: baseFilter,
          }
        },
        { $project: { text: 1, materialId: 1, chunkIndex: 1, score: { $meta: 'vectorSearchScore' } } }
      ]).toArray();
      return res.json({ chunks: results.map(r => ({ text: r.text, materialId: r.materialId, chunkIndex: r.chunkIndex, score: r.score })) });
    } catch (err) {
      // Fallback: naive keyword search
      const regex = new RegExp(String(topic).replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&'), 'i');
      const results = await db.collection('embeddings')
        .find({ ...baseFilter, text: { $regex: regex } })
        .limit(k)
        .toArray();
      return res.json({ chunks: results.map(r => ({ text: r.text, materialId: r.materialId, chunkIndex: r.chunkIndex, score: 0 })) });
    }
  } catch (e) {
    console.error('RAG retrieve error:', e);
    return res.status(500).json({ error: 'Failed to retrieve context' });
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
