import dotenv from 'dotenv';
import express from 'express';
import { WebSocketServer } from 'ws';
import cors from 'cors';
import { MongoClient, ObjectId, GridFSBucket } from 'mongodb';
import crypto from 'crypto';
import multer from 'multer';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
let cachedPdfParseFn = null;
async function getPdfParser() {
  if (cachedPdfParseFn) return cachedPdfParseFn;

  const resolveCtor = async () => {
    try {
      // 1. Try standard require
      const mod = require('pdf-parse');
      if (typeof mod === 'function') return mod;
      if (typeof mod.default === 'function') return mod.default;
      if (mod.PDFParse && typeof mod.PDFParse === 'function') return mod.PDFParse;
    } catch (e) { }

    try {
      // 2. Try dynamic import
      const mod = await import('pdf-parse');
      if (typeof mod.default === 'function') return mod.default;
      if (typeof mod === 'function') return mod;
    } catch (e) { }

    return null;
  };

  const PDFParseCtor = await resolveCtor();
  if (!PDFParseCtor) {
    console.warn('[PDF Parser] Fallback empty parser used.');
    return async () => ({ text: '', numpages: 0 });
  }

  cachedPdfParseFn = async (buffer) => {
    try {
      // Ensure we have a strictly pure Uint8Array. Node's Buffer is a subclass of Uint8Array,
      // but some modern libraries (like the Kozan's pdf-parse) strictly enforce "just" Uint8Array.
      const dataToParse = (buffer && buffer.buffer)
        ? new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength)
        : new Uint8Array(buffer);

      // Attempt 1: Classic functional call (pdf-parse v1.x)
      let data;
      try {
        data = await PDFParseCtor(dataToParse);
        if (data && (data.text || data.numpages)) {
          return {
            text: String(data.text || '').trim(),
            numpages: Number(data.numpages || 0)
          };
        }
      } catch (err) {
        if (!err.message.includes("Class constructors cannot be invoked without 'new'")) {
          throw err;
        }
      }

      // Attempt 2: Modern class-based call (mehmet-kozan/pdf-parse v2.4.5)
      const parser = new PDFParseCtor(dataToParse);
      if (typeof parser.load === 'function' && typeof parser.getText === 'function') {
        await parser.load();
        const result = await parser.getText();
        return {
          text: String(result?.text || '').trim(),
          numpages: Number(result?.total || result?.pages?.length || 0)
        };
      }

      console.warn('[PDF Parser] Unknown parser class structure.');
      return { text: '', numpages: 0 };
    } catch (e) {
      console.error('[PDF Parser] Parse execution failed:', e);
      return { text: '', numpages: 0 };
    }
  };

  return cachedPdfParseFn;
}

import { EdgeTTS } from 'node-edge-tts';
import { GoogleGenAI, Type } from '@google/genai';
import { Readable } from 'node:stream';
import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import Groq from 'groq-sdk';


// Load environment variables. Prefer project root .env.local (../.env.local) if present,
// then fall back to the default .env in this folder.
try {
  const envLocalUrl = new URL('../.env.local', import.meta.url);
  const envLocalPath = fileURLToPath(envLocalUrl);
  if (envLocalPath && fs.existsSync(envLocalPath)) {
    dotenv.config({ path: envLocalPath, override: true });
    console.log('[Startup] Loaded env from', envLocalPath);
  }
} catch { }
// Also try current working directory .env.local
try {
  const cwdEnv = path.join(process.cwd(), '.env.local');
  if (fs.existsSync(cwdEnv)) {
    dotenv.config({ path: cwdEnv, override: true });
    console.log('[Startup] Loaded env from', cwdEnv);
  }
} catch { }
dotenv.config();

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '5mb' }));
app.use((req, res, next) => {
  console.log(`[Request] ${req.method} ${req.url}`);
  next();
});
app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date() }));

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/Lumo_AI';
const PORT = Number(process.env.PORT) || 8765;
const ADMIN_SECRET = process.env.ADMIN_SECRET || '';
const GEMINI_API_KEY = process.env.API_KEY || process.env.GEMINI_API_KEY || '';
console.log('[Startup] GEMINI_API_KEY present:', GEMINI_API_KEY ? 'yes' : 'no');
const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
console.log('[Startup] GROQ_API_KEY present:', GROQ_API_KEY ? 'yes' : 'no');
let ai = null;
let groq = null;

const getGroq = () => {
  if (groq) return groq;
  const key = process.env.GROQ_API_KEY || '';
  if (!key) return null;
  groq = new Groq({ apiKey: key });
  return groq;
};

const getAI = () => {
  if (ai) return ai;
  const key = process.env.API_KEY || process.env.GEMINI_API_KEY || '';
  if (!key) return null;
  try {
    ai = new GoogleGenAI({ apiKey: key });
    console.log('[Startup] Initialized AI client from env at runtime');
    return ai;
  } catch (e) {
    console.error('Failed to initialize AI client at runtime:', e?.message || e);
    return null;
  }
};

let db;
let projectDb;
let materialsBucket;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });
const pdfJobs = new Map();

const updateJob = (jobId, updates) => {
  const current = pdfJobs.get(jobId);
  if (!current) return;
  const next = { ...current, ...updates };
  pdfJobs.set(jobId, next);
};

const buildImageUrl = (prompt, idx = 0) => {
  const params = new URLSearchParams({
    prompt: prompt || 'educational visual',
    sig: String(idx)
  });
  return `/api/images/random?${params.toString()}`;
};

const generateSlidesFromAI = async (jobId, text, originalName, slideRange = '1-10', pdfBuffer = null) => {
  const groqClient = getGroq();
  const geminiClient = getAI();

  if (!groqClient && !geminiClient) {
    throw new Error('AI API key missing. Set GROQ_API_KEY or GEMINI_API_KEY.');
  }

  // Parse slide range
  const [startSlide, endSlide] = slideRange.split('-').map(Number);
  const requestedSlideCount = (endSlide - startSlide + 1) || 10;
  const isFullBatch = endSlide >= 30;

  const rawPages = (text || '')
    .split(/\f+|Page \d+|\[Page \d+\]/i)
    .map((page) => page.trim())
    .filter(page => page.length > 5);

  const pages = rawPages.length > 1 ? rawPages : (text || '').split('\n\n\n').filter(p => p.trim().length > 20);

  // If text is empty but we have a buffer, we'll rely on Gemini Vision
  let truncated = '';
  if (text && text.trim().length > 0) {
    // Improved mapping

    const startPageIndexFinal = pages.length > 10
      ? Math.floor(pages.length * Math.max(0, (startSlide - 1) / (isFullBatch ? Math.max(endSlide, 40) : 50)))
      : 0;

    const endPageIndexFinal = (pages.length > 10 && !isFullBatch)
      ? Math.ceil(pages.length * (endSlide / 50))
      : pages.length; // If 30+ slides, take all remaining pages to ensure no skipping

    const focusedPages = pages.slice(startPageIndexFinal, endPageIndexFinal);

    const pageSnippets = [];
    let usedChars = 0;
    const BUDGET = isFullBatch ? 25000 : 15000; // More context for more slides
    for (let i = 0; i < focusedPages.length; i += 1) {
      const snippet = focusedPages[i].slice(0, 2000);
      const chunk = `[PAGE ${startPageIndexFinal + i + 1}]:\n${snippet}`;
      if (usedChars + chunk.length > BUDGET) break;
      pageSnippets.push(chunk);
      usedChars += chunk.length + 2;
    }
    truncated = pageSnippets.length ? pageSnippets.join('\n\n') : text.slice(0, 10000);
  } else {
    truncated = "[Note: PDF text extraction found no readable text. Please use visual/OCR analysis if possible.]";
  }

  const systemPrompt = `You are a Lead Professor at a top-tier University teaching "${originalName}".
You are creating a HIGH-QUALITY, technical deep-dive lecture. This is for slides ${slideRange}.

Return STRICT JSON with this structure:
{
  "title": string,
  "summary": string,
  "slides": [
    {
      "heading": string,
      "description": string,
      "imagePrompt": string,
      "voiceover": string,
      "pdfExcerpt": string,
      "pdfPage": integer
    }
  ]
}

- SLIDE COUNT: You MUST create EXACTLY ${requestedSlideCount} slides to covers the concepts.
- SEQUENTIAL TEACHING: Go through the provided text PAGE BY PAGE. Do not skip any major sections or skip from Page 2 to Page 10. You are a meticulous professor.
- COMPREHENSIVENESS: Teach every concept deeply. If a page has complex logic, spend multiple slides on it.
- NO DECORATIVE IMAGES: Do NOT generate an "imagePrompt". Set "imagePrompt" to an empty string for all slides. We focus on the lecture content only.
- ACCURATE PDF MAPPING: Every slide MUST have the correct "pdfPage" integer. 
- MAPPING RULE: Slide 1 should map to the starting page of the content provided. Subsequent slides should progress through the pages. 
- ENSURE SYNC: If you are teaching Page 5 of the PDF on Slide 12, "pdfPage" must be 5.
- QUALITY: Every slide must be extremely detailed.
- REAL-LIFE EXAMPLES: Each slide's "voiceover" MUST contain at least one vivid real-life example or analogy to explain the concept.
- TECHNICAL PRECISION: "pdfPage" and "pdfExcerpt" should be as accurate as possible.
- "visualTheme" should be one of: "blackboard", "programming", "data-structures", "algorithms", "ai-ml".`;

  const userPrompt = `The PDF has ${pages.length || 1} pages. Here are excerpts to reference:
"""
${truncated}
"""`;

  if (groqClient) {
    console.log('[AI] Attempting slide generation with Groq...');
    try {
      const completion = await groqClient.chat.completions.create({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        model: 'llama-3.3-70b-versatile',
        response_format: { type: 'json_object' }
      });
      const content = completion.choices[0]?.message?.content;
      if (content) {
        console.log('[AI] Groq generation successful');
        const parsed = JSON.parse(content);
        // Randomly assign themes if not provided or to ensure variety
        if (parsed.slides) {
          parsed.slides = parsed.slides.map(s => ({
            ...s,
            visualTheme: s.visualTheme || (Math.random() > 0.5 ? 'blackboard' : 'programming')
          }));
        }
        return parsed;
      }
    } catch (err) {
      console.error('[AI] Groq generation failed:', err.message);
      // If Groq fails, we only fall back to Gemini if we don't have a known bad key
    }
  }

  if (geminiClient) {
    console.log('[AI] Attempting Gemini for slide generation...');
    try {
      const contents = [{ role: 'user', parts: [{ text: systemPrompt + '\n\n' + userPrompt }] }];

      // If we have a buffer and no text (or even if we have text), we can pass the PDF to Gemini 1.5+
      if (pdfBuffer && (!text || text.length < 500)) {
        contents[0].parts.push({
          inlineData: {
            mimeType: 'application/pdf',
            data: pdfBuffer.toString('base64')
          }
        });
        console.log('[AI] Attaching PDF buffer to Gemini request (Multimodal mode)');
      }

      const response = await geminiClient.models.generateContent({
        model: 'gemini-2.0-flash',
        contents,
        config: {
          responseMimeType: 'application/json'
        }
      });
      const payload = response.text?.trim() || '';
      if (payload) {
        console.log('[AI] Gemini generation successful');
        return JSON.parse(payload);
      }
    } catch (err) {
      console.error('[AI] Gemini failed:', err.message);
      if (!groqClient) throw new Error(`AI generation failed: ${err.message}`);
    }
  }

  throw new Error('Failed to generate slides with available AI models.');
};

const tts = new EdgeTTS({
  voice: 'en-US-AvaMultilingualNeural',
  lang: 'en-US'
});

const generateAudioDataUrl = async (text) => {
  const input = (text || '').trim();
  const speech = input || 'This slide is being prepared.';
  const tempFile = path.join(process.cwd(), `temp_audio_${Date.now()}.mp3`);
  try {
    // node-edge-tts writes to a file. We wait for it to finish.
    await tts.ttsPromise(speech, tempFile);

    // Read the file into a buffer
    if (fs.existsSync(tempFile)) {
      const audioBuffer = fs.readFileSync(tempFile);
      // Clean up the temp file
      try { fs.unlinkSync(tempFile); } catch (e) { }

      if (audioBuffer && audioBuffer.length > 0) {
        return `data:audio/mp3;base64,${audioBuffer.toString('base64')}`;
      }
    }
  } catch (err) {
    console.warn('[TTS] Edge TTS error, falling back:', err?.message || err);
    try { if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile); } catch (e) { }
  }

  // Fallback to a valid short silent MP3 chunk
  return `data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGFtZTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq`;
};

const processPdfExplainerJob = async (jobId, buffer, originalName, forcedTopic, slideRange = '1-10') => {
  const job = pdfJobs.get(jobId);
  const materialId = job?.materialId;
  try {
    updateJob(jobId, { status: 'analyzing', message: 'Analyzing PDF content…', progress: null });

    const parser = await getPdfParser();
    if (!parser) throw new Error('PDF parser not available. Ensure pdf-parse is installed.');
    const parsed = await parser(buffer).catch((err) => {
      throw new Error(`Failed to read PDF: ${err?.message || err}`);
    });
    const text = String(parsed.text || '').trim();
    if (!text && !getAI()) {
      throw new Error('No readable text found in PDF and no Multimodal AI (Gemini) available. Please upload a text-based PDF.');
    }

    const pdfDocumentBase64 = buffer.toString('base64');
    const totalPdfPages = Number.isFinite(parsed.numpages) ? Number(parsed.numpages) : 0;

    updateJob(jobId, { status: 'drafting', message: `Generating slide batch ${slideRange}…` });

    const outline = await generateSlidesFromAI(jobId, text, forcedTopic || originalName, slideRange, buffer);

    updateJob(jobId, { status: 'narrating', message: 'Creating narration audio…', progress: { current: 0, total: outline.slides.length } });

    const draft = {
      id: `draft-${jobId}`,
      title: outline.title || `${originalName} · Explainer`,
      summary: outline.summary || 'AI-generated explainer summary.',
      slides: [],
      quiz: [],
      pdfDocumentBase64,
      pdfId: materialId || jobId
    };
    updateJob(jobId, { draft });

    const totalPagesForAssignment = totalPdfPages > 0 ? totalPdfPages : outline.slides.length;
    const usedPages = new Set();
    let fallbackCursor = 1;

    const getNextFallbackPage = () => {
      if (totalPagesForAssignment <= 0) return null;
      for (let attempt = 0; attempt < totalPagesForAssignment; attempt += 1) {
        const candidate = ((fallbackCursor + attempt - 1) % totalPagesForAssignment) + 1;
        if (!usedPages.has(candidate)) {
          fallbackCursor = (candidate % totalPagesForAssignment) + 1;
          return candidate;
        }
      }
      const candidate = fallbackCursor;
      fallbackCursor = (fallbackCursor % totalPagesForAssignment) + 1;
      return candidate;
    };

    const rangeMatch = String(slideRange || '').match(/(\d+)-(\d+)/);
    const startRangePage = rangeMatch ? parseInt(rangeMatch[1], 10) : 1;

    // Process the first 4 slides sequentially to ensure the student has enough buffer
    // while the AI starts the heavy parallel processing for the rest.
    for (let i = 0; i < Math.min(4, outline.slides.length); i += 1) {
      const slide = outline.slides[i];
      const narration = (slide.voiceover && slide.voiceover.trim()) || (slide.description && slide.description.trim()) || '';
      const audioUrl = await generateAudioDataUrl(narration);
      const displayDescription = narration || slide.description;
      const fallbackImageUrl = buildImageUrl(slide.imagePrompt, i);

      let inferredPage = null;
      // Force linear progression if AI is being lazy with page numbers
      const aiPage = (typeof slide.pdfPage === 'number' && slide.pdfPage >= 1) ? slide.pdfPage : (startRangePage + i);
      inferredPage = Math.min(aiPage, totalPagesForAssignment);

      const newSlide = {
        description: displayDescription,
        imagePrompt: slide.imagePrompt,
        imageUrl: fallbackImageUrl,
        audioUrl,
        heading: slide.heading,
        pdfExcerpt: slide.pdfExcerpt,
        pdfPage: inferredPage,
        visualTheme: slide.visualTheme || (Math.random() > 0.5 ? 'blackboard' : 'programming'),
        voiceover: narration || undefined
      };

      draft.slides[i] = newSlide;
      updateJob(jobId, {
        draft: { ...draft },
        progress: { current: i + 1, total: outline.slides.length },
        status: 'narrating'
      });
    }

    // Pre-fill slots for parallel processing to preserve order
    for (let i = 4; i < outline.slides.length; i++) {
      draft.slides[i] = null;
    }

    // Process the remaining slides in parallel
    if (outline.slides.length > 4) {
      console.log(`[AI] Starting parallel production for topics 5 to ${outline.slides.length}...`);

      const processRemaining = async (slide, i) => {
        try {
          const narration = (slide.voiceover && slide.voiceover.trim()) || (slide.description && slide.description.trim()) || '';
          const audioUrl = await generateAudioDataUrl(narration);
          const displayDescription = narration || slide.description;
          const fallbackImageUrl = buildImageUrl(slide.imagePrompt, i);

          let inferredPage = null;
          const aiPage = (typeof slide.pdfPage === 'number' && slide.pdfPage >= 1) ? slide.pdfPage : (startRangePage + i);
          inferredPage = Math.min(aiPage, totalPagesForAssignment);

          const newSlide = {
            description: displayDescription,
            imagePrompt: slide.imagePrompt,
            imageUrl: fallbackImageUrl,
            audioUrl,
            heading: slide.heading,
            pdfExcerpt: slide.pdfExcerpt,
            pdfPage: inferredPage,
            visualTheme: slide.visualTheme || (Math.random() > 0.5 ? 'blackboard' : 'programming'),
            voiceover: narration || undefined
          };

          draft.slides[i] = newSlide;
          const readyCount = draft.slides.filter(s => s !== null).length;
          updateJob(jobId, {
            draft: { ...draft },
            progress: { current: readyCount, total: outline.slides.length },
            status: 'narrating'
          });
        } catch (e) {
          console.error(`[AI] Slide ${i} production failed:`, e);
        }
      };

      await Promise.all(outline.slides.slice(4).map((s, idx) => processRemaining(s, idx + 4)));

      updateJob(jobId, {
        draft: { ...draft },
        status: 'done'
      });
    } else {
      updateJob(jobId, { status: 'done' });
    }

    updateJob(jobId, { status: 'done', message: 'Explainer ready!', draft });
  } catch (error) {
    console.error('PDF explainer job failed:', error);
    updateJob(jobId, { status: 'error', message: 'Failed to generate explainer.', error: error?.message || 'Unknown error.' });
  }
};
async function initDb() {
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  // derive DB name from URI or default to Lumo_AI
  let dbName = 'Lumo_AI';
  try { const u = new URL(MONGODB_URI); dbName = (u.pathname || '/Lumo_AI').slice(1) || 'Lumo_AI'; } catch { }
  db = client.db(dbName);
  projectDb = client.db('project');
  await db.collection('users').createIndex({ email: 1 }, { unique: true });

  // Edit a course (teacher only): update title/description
  app.patch('/api/courses/:courseId', async (req, res) => {
    try {
      const user = await getUserFromAuth(req);
      if (!user || user.role !== 'teacher') return res.status(403).json({ error: 'Forbidden' });
      const { courseId } = req.params;
      const { title, description } = req.body || {};
      const set = {};
      if (typeof title === 'string' && title.trim()) set.title = title.trim();
      if (typeof description === 'string' && description.trim()) set.description = description.trim();
      if (!Object.keys(set).length) return res.status(400).json({ error: 'No changes' });
      const or = [{ id: courseId }];
      try { or.push({ _id: new ObjectId(courseId) }); } catch { }
      const r = await db.collection('courses').updateOne({ $or: or }, { $set: set });
      if (!r.matchedCount) return res.status(404).json({ error: 'Course not found' });
      return res.json({ success: true });
    } catch (e) {
      return res.status(500).json({ error: 'Failed to update course' });
    }
  });

  // Delete a course (teacher only)
  app.delete('/api/courses/:courseId', async (req, res) => {
    try {
      const user = await getUserFromAuth(req);
      if (!user || user.role !== 'teacher') return res.status(403).json({ error: 'Forbidden' });
      const { courseId } = req.params;
      const or = [{ id: courseId }];
      try { or.push({ _id: new ObjectId(courseId) }); } catch { }
      const course = await db.collection('courses').findOne({ $or: or });
      if (!course) return res.status(404).json({ error: 'Course not found' });
      await db.collection('courses').deleteOne({ $or: or });
      // Cleanup related data
      await db.collection('materials').deleteMany({ courseId: String(course.id || course._id?.toString()) });
      await db.collection('embeddings').deleteMany({ courseId: String(course.id || course._id?.toString()) });
      await db.collection('enrollments').deleteMany({ courseId: String(course.id || course._id?.toString()) });
      return res.json({ success: true });
    } catch (e) {
      return res.status(500).json({ error: 'Failed to delete course' });
    }
  });

  // -------- Enrollments (Student) ---------

  // List my enrollments (course IDs)
  app.get('/api/enrollments', async (req, res) => {
    try {
      const user = await getUserFromAuth(req);
      if (!user) return res.status(401).json({ error: 'Unauthorized' });
      const list = await db.collection('enrollments').find({ userId: user._id.toString() }).toArray();
      return res.json({ courseIds: list.map(e => e.courseId) });
    } catch {
      return res.status(500).json({ error: 'Failed to fetch enrollments' });
    }
  });

  // Enroll in a course
  app.post('/api/enrollments', async (req, res) => {
    try {
      const user = await getUserFromAuth(req);
      if (!user) return res.status(401).json({ error: 'Unauthorized' });
      if (user.role !== 'student') return res.status(403).json({ error: 'Only students can enroll' });
      const { courseId } = req.body || {};
      if (!courseId) return res.status(400).json({ error: 'courseId required' });
      await db.collection('enrollments').updateOne(
        { userId: user._id.toString(), courseId: String(courseId) },
        { $set: { userId: user._id.toString(), courseId: String(courseId), createdAt: new Date() } },
        { upsert: true }
      );
      return res.json({ success: true });
    } catch (e) {
      return res.status(500).json({ error: 'Failed to enroll' });
    }
  });

  // Withdraw from a course
  app.delete('/api/enrollments/:courseId', async (req, res) => {
    try {
      const user = await getUserFromAuth(req);
      if (!user) return res.status(401).json({ error: 'Unauthorized' });
      if (user.role !== 'student') return res.status(403).json({ error: 'Only students can withdraw' });
      const { courseId } = req.params;
      await db.collection('enrollments').deleteOne({ userId: user._id.toString(), courseId: String(courseId) });
      return res.json({ success: true });
    } catch {
      return res.status(500).json({ error: 'Failed to withdraw' });
    }
  });

  // -------- Notes (Student) ---------

  // List my notes for a specific course
  app.get('/api/notes/:courseId', async (req, res) => {
    try {
      const user = await getUserFromAuth(req);
      if (!user) return res.status(401).json({ error: 'Unauthorized' });
      const { courseId } = req.params;
      const list = await db.collection('notes').find({ userId: user._id.toString(), courseId: String(courseId) }).sort({ createdAt: -1 }).toArray();
      return res.json({ notes: list });
    } catch {
      return res.status(500).json({ error: 'Failed to fetch notes' });
    }
  });

  // Create a note
  app.post('/api/notes', async (req, res) => {
    try {
      const user = await getUserFromAuth(req);
      if (!user) return res.status(401).json({ error: 'Unauthorized' });
      const { courseId, title, content } = req.body || {};
      if (!courseId || !title || !content) return res.status(400).json({ error: 'Missing required fields' });
      const doc = {
        userId: user._id.toString(),
        courseId: String(courseId),
        title,
        content,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const r = await db.collection('notes').insertOne(doc);
      return res.json({ note: { ...doc, _id: r.insertedId } });
    } catch (e) {
      return res.status(500).json({ error: 'Failed to create note' });
    }
  });

  // Update a note
  app.patch('/api/notes/:noteId', async (req, res) => {
    try {
      const user = await getUserFromAuth(req);
      if (!user) return res.status(401).json({ error: 'Unauthorized' });
      const { noteId } = req.params;
      const { title, content } = req.body || {};
      const set = { updatedAt: new Date() };
      if (typeof title === 'string') set.title = title;
      if (typeof content === 'string') set.content = content;
      const r = await db.collection('notes').updateOne(
        { _id: new ObjectId(noteId), userId: user._id.toString() },
        { $set: set }
      );
      if (!r.matchedCount) return res.status(404).json({ error: 'Note not found' });
      return res.json({ success: true });
    } catch (e) {
      return res.status(500).json({ error: 'Failed to update note' });
    }
  });

  // Delete a note
  app.delete('/api/notes/:noteId', async (req, res) => {
    try {
      const user = await getUserFromAuth(req);
      if (!user) return res.status(401).json({ error: 'Unauthorized' });
      const { noteId } = req.params;
      const r = await db.collection('notes').deleteOne({ _id: new ObjectId(noteId), userId: user._id.toString() });
      if (!r.deletedCount) return res.status(404).json({ error: 'Note not found' });
      return res.json({ success: true });
    } catch {
      return res.status(500).json({ error: 'Failed to delete note' });
    }
  });

  // Update module topics (teacher only)
  app.patch('/api/courses/:courseId/modules/:moduleId/topics', async (req, res) => {
    try {
      const user = await getUserFromAuth(req);
      if (!user || user.role !== 'teacher') return res.status(403).json({ error: 'Forbidden' });
      const { courseId, moduleId } = req.params;
      const { topics, topicOutlines } = req.body || {};
      if (!Array.isArray(topics)) return res.status(400).json({ error: 'Invalid payload' });
      const or = [{ id: courseId }];
      try { or.push({ _id: new ObjectId(courseId) }); } catch { }
      const r = await db.collection('courses').updateOne(
        { $or: or, 'modules.id': moduleId },
        { $set: { 'modules.$.topics': topics, 'modules.$.topicOutlines': topicOutlines || {} } }
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
  await db.collection('quiz_attempts').createIndex({ userId: 1, courseId: 1, moduleId: 1, createdAt: 1 });
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
  // console.log(`[Auth Debug] Issuing token for user ${userId}. Token starts with: ${token.substring(0, 6)}...`);
  await db.collection('sessions').insertOne({ token, userId: new ObjectId(userId), createdAt: new Date() });
  return token;
}

async function getUserFromAuth(req) {
  const auth = req.headers['authorization'];
  // console.log('[Auth Debug] Header:', auth);
  if (!auth || !auth.startsWith('Bearer ')) {
    // console.log('[Auth Debug] Invalid/Missing Header');
    return null;
  }
  const token = auth.slice(7);
  const session = await db.collection('sessions').findOne({ token });
  // console.log('[Auth Debug] Token:', token.substring(0, 6) + '...', 'Session found:', !!session);
  if (!session) return null;
  const user = await db.collection('users').findOne({ _id: new ObjectId(session.userId) });
  // console.log('[Auth Debug] User found:', !!user, 'Role:', user?.role);
  return user;
}

app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password, role } = req.body || {};
    if (!name || !email || !password || !role || !['teacher', 'student'].includes(String(role))) {
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
        topicOutlines: m.topicOutlines || {},
        materialIds: m.materialIds || {},
        lectures: (m.lectures || []).map(l => ({
          ...l,
          pdfId: l.pdfId
        })),
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
    const defaultDesc = `A guided journey through ${title} across ${(modules || []).length || 'several'} modules. By the end, you will understand core concepts and be able to apply them in practical scenarios.`;
    const courseId = id || `course-${Date.now()}`;
    const doc = {
      id: courseId,  // Always store an ID in the document
      title,
      description: description || defaultDesc,
      modules: (modules || []).map(m => ({
        id: m.id,
        title: m.title,
        description: m.description,
        topics: m.topics || [],
        topicOutlines: m.topicOutlines || {},
        materialIds: m.materialIds || {},
        lectures: (m.lectures || []).map(l => ({
          ...l,
          pdfId: l.pdfId || undefined
        }))
      })),
      creatorId: user._id,
      createdAt: new Date(),
    };
    const r = await db.collection('courses').insertOne(doc);
    console.log('[Courses] CREATED _id=', r.insertedId?.toString?.(), 'id=', courseId);
    return res.json({ course: { id: courseId, title: doc.title, description: doc.description, modules: doc.modules } });
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

// -------- Student Projects (Collaboration) APIs ---------

// 1. Create Project
app.post('/api/projects', async (req, res) => {
  try {
    const user = await getUserFromAuth(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    const { title, description, repoUrl } = req.body || {};
    if (!title) return res.status(400).json({ error: 'Title required' });

    const project = {
      title,
      description: description || '',
      repoUrl: repoUrl || '',
      files: [
        { name: 'README.md', content: `# ${title}\n\nProject started with Lumo Studio.` },
        { name: 'index.html', content: `<!DOCTYPE html>\n<html>\n<head><title>${title}</title></head>\n<body><h1>${title}</h1></body>\n</html>` },
        { name: 'Main.js', content: `console.log("Welcome to ${title}!");` },
        { name: 'package.json', content: JSON.stringify({ name: title.toLowerCase().replace(/ /g, '-'), version: '1.0.0', dependencies: { 'lumoai': 'latest' } }, null, 2) }
      ],
      packages: ['lumoai'],
      terminalLogs: [`[SYSTEM] Repository initialized at ${new Date().toISOString()}`],
      ownerId: user._id.toString(),
      ownerName: user.name,
      collaborators: [{ userId: user._id.toString(), name: user.name, role: 'owner' }],
      createdAt: new Date(),
      lastUpdated: new Date()
    };
    const r = await projectDb.collection('projects').insertOne(project);
    return res.json({ success: true, project: { ...project, _id: r.insertedId.toString() } });
  } catch (e) {
    console.error('Create project error:', e);
    return res.status(500).json({ error: 'Failed to create project' });
  }
});

// 2. List Projects (My Projects)
app.get('/api/projects', async (req, res) => {
  try {
    const user = await getUserFromAuth(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    // Fetch all projects for now so students can see and collaborate
    const projects = await projectDb.collection('projects').find({}).sort({ createdAt: -1 }).toArray();

    const sanitized = projects.map(p => ({
      ...p,
      _id: p._id.toString(),
    }));

    return res.json({ projects: sanitized });
  } catch (e) {
    console.error('Fetch projects error:', e);
    return res.status(500).json({ error: 'Failed to fetch projects' });
  }
});

// 3. Invite User to Project
app.post('/api/projects/:id/invite', async (req, res) => {
  try {
    const user = await getUserFromAuth(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    const { id } = req.params;
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email required' });

    let oid;
    try { oid = new ObjectId(id); } catch { return res.status(400).json({ error: 'Invalid ID' }); }

    const project = await projectDb.collection('projects').findOne({ _id: oid });
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const isMember = project.collaborators.some(m => m.userId === user._id.toString());
    if (!isMember) return res.status(403).json({ error: 'Only members can invite' });

    const invitee = await db.collection('users').findOne({ email: String(email).toLowerCase() });
    if (!invitee) return res.status(404).json({ error: 'User with this email not found' });

    const alreadyMember = project.collaborators.some(m => m.userId === invitee._id.toString());
    if (alreadyMember) return res.status(400).json({ error: 'User is already a collaborator' });

    const invite = {
      projectId: project._id.toString(),
      projectTitle: project.title,
      senderId: user._id.toString(),
      senderName: user.name,
      receiverId: invitee._id.toString(),
      status: 'pending',
      createdAt: new Date()
    };
    await projectDb.collection('project_invites').insertOne(invite);

    return res.json({ success: true });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to invite user' });
  }
});

// 4. List Invites
app.get('/api/invites', async (req, res) => {
  try {
    const user = await getUserFromAuth(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const invites = await projectDb.collection('project_invites')
      .find({ receiverId: user._id.toString(), status: 'pending' })
      .sort({ createdAt: -1 })
      .toArray();

    return res.json({ invites });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to list invites' });
  }
});

// 5. Respond to Invite
app.post('/api/invites/:id/respond', async (req, res) => {
  try {
    const user = await getUserFromAuth(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    const { id } = req.params;
    const { accept } = req.body;

    let oid;
    try { oid = new ObjectId(id); } catch { return res.status(400).json({ error: 'Invalid ID' }); }

    const invite = await projectDb.collection('project_invites').findOne({ _id: oid });
    if (!invite) return res.status(404).json({ error: 'Invite not found' });
    if (invite.receiverId !== user._id.toString()) return res.status(403).json({ error: 'Not your invite' });

    if (accept) {
      await projectDb.collection('projects').updateOne(
        { _id: new ObjectId(invite.projectId) },
        { $push: { collaborators: { userId: user._id.toString(), name: user.name, role: 'member' } } }
      );
      await projectDb.collection('project_invites').updateOne({ _id: oid }, { $set: { status: 'accepted' } });
    } else {
      await projectDb.collection('project_invites').updateOne({ _id: oid }, { $set: { status: 'rejected' } });
    }

    return res.json({ success: true });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to respond to invite' });
  }
});

// 6. Update Project (Files)
app.patch('/api/projects/:id', async (req, res) => {
  try {
    const user = await getUserFromAuth(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    const { id } = req.params;
    const { files, title, description } = req.body;

    let oid;
    try { oid = new ObjectId(id); } catch { return res.status(400).json({ error: 'Invalid ID' }); }

    const project = await projectDb.collection('projects').findOne({ _id: oid });
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const isMember = project.collaborators.some(m => m.userId === user._id.toString());
    if (!isMember) return res.status(403).json({ error: 'Only members can update' });

    const set = { lastUpdated: new Date() };
    if (files) set.files = files;
    if (title) set.title = title;
    if (description) set.description = description;

    const r = await projectDb.collection('projects').findOneAndUpdate(
      { _id: oid },
      { $set: set },
      { returnDocument: 'after' }
    );
    const updatedProject = r.value || r;
    return res.json({ success: true, project: updatedProject });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to update project' });
  }
});

// 7. Simulated Terminal (Package Management)
app.post('/api/projects/:id/terminal', async (req, res) => {
  try {
    const user = await getUserFromAuth(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    const { id } = req.params;
    const { command } = req.body;

    let oid;
    try { oid = new ObjectId(id); } catch { return res.status(400).json({ error: 'Invalid ID' }); }

    const project = await projectDb.collection('projects').findOne({ _id: oid });
    if (!project) {
      console.log(`[Terminal] Project NOT found: ${id}`);
      return res.status(404).json({ error: 'Project not found' });
    }

    const mList = project.collaborators.map(c => c.userId);
    const currUid = user._id.toString();
    const isMember = project.collaborators.some(m => m.userId === currUid);

    console.log(`[Terminal] Project: ${project.title}, User: ${currUid}, IsMember: ${isMember}, Collaborator IDs: ${mList.join(', ')}`);

    if (!isMember) return res.status(403).json({ error: 'Forbidden' });

    let log = `> ${command}\n`;
    let updateFields = { lastUpdated: new Date() };
    let addToSet = {};

    if (command.startsWith('npm install') || command.startsWith('pip install')) {
      const parts = command.split(' ');
      const pkg = parts[2];
      if (pkg) {
        log += `Installing ${pkg}...\nDone. (Simulated for Lumo Environment)`;
        addToSet.packages = pkg;
      } else {
        log += `Installing dependencies from manifest...\nDone.`;
        if ((project.packages || []).length === 0) {
          addToSet.packages = { $each: ['express', 'lumoai'] };
        }
      }
      updateFields.terminalLogs = [...(project.terminalLogs || []), `> ${command}`, log];
    } else if (command === 'ls') {
      log += (project.files || []).map(f => f.name).join('  ') || '(Empty)';
      updateFields.terminalLogs = [...(project.terminalLogs || []), `> ${command}`, log];
    } else if (command === 'clear') {
      await projectDb.collection('projects').updateOne({ _id: oid }, { $set: { terminalLogs: [] } });
      return res.json({ success: true, log: '' });
    } else {
      log += `Command not found: ${command.split(' ')[0]}`;
      updateFields.terminalLogs = [...(project.terminalLogs || []), `> ${command}`, log];
    }

    const finalUpdate = { $set: updateFields };
    if (Object.keys(addToSet).length) finalUpdate.$addToSet = addToSet;

    await projectDb.collection('projects').updateOne({ _id: oid }, finalUpdate);
    return res.json({ success: true, log });
  } catch (e) {
    console.error('[Terminal Error]:', e);
    return res.status(500).json({ error: 'Terminal error' });
  }
});

// 8. AI Project Advisor (Co-Pilot)
app.post('/api/projects/:id/advisor', async (req, res) => {
  try {
    const user = await getUserFromAuth(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    const { id } = req.params;
    const { question } = req.body;

    let oid;
    try { oid = new ObjectId(id); } catch { return res.status(400).json({ error: 'Invalid ID' }); }

    const project = await projectDb.collection('projects').findOne({ _id: oid });
    if (!project) {
      console.error(`[Advisor] Project not found: ${id}`);
      return res.status(404).json({ error: 'Project not found' });
    }

    const isMember = project.collaborators.some(m => m.userId === user._id.toString());
    if (!isMember) {
      console.warn(`[Advisor] User ${user._id} is NOT a collaborator of ${project.title}`);
      return res.status(403).json({ error: 'Forbidden' });
    }

    const aiService = getAI();
    if (!aiService) {
      console.error('[Advisor] AI Service not initialized! (Key might be missing)');
      throw new Error('AI service initialization failed');
    }

    const filesStr = (project.files || []).map(f => `FILE: ${f.name}\nCONTENT:\n${f.content}`).join('\n\n');
    const pkgsStr = (project.packages || []).join(', ');

    const prompt = `You are Lumo Core AI Advisor. Project: ${project.title}. Description: ${project.description}. Installed: ${pkgsStr}. Files: ${filesStr}. Student Question: ${question}. Guidelines: Educational, explain fixes, don't just do it for them.`;
    const response = await aiService.models.generateContent({
      model: 'gemini-1.5-flash',
      contents: [{ role: 'user', parts: [{ text: prompt }] }]
    });
    return res.json({ response: response.text });
  } catch (e) {
    console.error('[Advisor Error]:', e.message || e);
    return res.status(500).json({ error: `Advisor error: ${e.message || 'Unknown failure'}` });
  }
});

// 8. AI Audit (Refined Technical Verdict)
app.post('/api/projects/:id/audit', async (req, res) => {
  try {
    const user = await getUserFromAuth(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    const { id } = req.params;

    let oid;
    try { oid = new ObjectId(id); } catch { return res.status(400).json({ error: 'Invalid ID' }); }

    const project = await projectDb.collection('projects').findOne({ _id: oid });
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const codeSummary = (project.files || []).map(f => `FILE: ${f.name}\nCONTENT:\n${f.content}`).join('\n\n');

    const prompt = `
      You are Lumo AI Audit. Your task is to perform a rigorous technical audit of the following student project.
      PROJECT TITLE: ${project.title}
      TARGET DESCRIPTION: ${project.description}
      CODEBASE:
      ${codeSummary}

      Perform the following analysis:
      1. Relevance Score: Provide a percentage (0-100) on how much the code aligns with the project description.
      2. Relevant Analysis: Briefly explain which parts of the code correctly implement the goals.
      3. Unrelated Parts: Identify any files or code blocks that are unnecessary, generic boilerplate not yet customized, or completely unrelated to the topic.
      4. Technical Verdict: A summary statement (1-2 sentences) about the project's current state.

      RETURN JSON ONLY:
      {
        "relevanceScore": number,
        "relevantAnalysis": "string",
        "unrelatedParts": ["string"],
        "technicalVerdict": "string"
      }
    `;

    const response = await groq.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      model: 'llama-3.3-70b-versatile',
      response_format: { type: 'json_object' }
    });

    const auditData = JSON.parse(response.choices[0].message.content);
    return res.json({ success: true, audit: auditData });
  } catch (e) {
    console.error('Audit error:', e);
    return res.status(500).json({ error: 'Audit failed' });
  }
});

app.post('/api/pdf-explainer/start', upload.single('file'), async (req, res) => {
  try {
    const { materialId, topic, slideRange } = req.body || {};
    let buffer;
    let originalName;

    if (materialId) {
      console.log('[PDF Explainer] Starting via materialId:', materialId, 'Range:', slideRange);
      let oid;
      try { oid = new ObjectId(materialId); } catch { }

      const or = [{ id: String(materialId) }, { materialId: String(materialId) }];
      if (oid) {
        or.push({ _id: oid });
        or.push({ fileId: oid });
      }

      let material = await db.collection('materials').findOne({ $or: or });

      // Fallback: GridFS check
      if (!material && oid) {
        const gridFile = await db.collection('materials.files').findOne({ _id: oid });
        if (gridFile) material = { fileId: oid, title: 'Lecture Material' };
      }

      if (!material || !material.fileId) {
        return res.status(404).json({ error: 'Material not found for explainer.' });
      }

      originalName = material.title || 'Lecture Material';
      const downloadStream = materialsBucket.openDownloadStream(new ObjectId(material.fileId));
      const chunks = [];
      for await (const chunk of downloadStream) chunks.push(chunk);
      buffer = Buffer.concat(chunks);
    } else {
      if (!req.file) {
        return res.status(400).json({ error: 'PDF file or materialId is required.' });
      }
      buffer = req.file.buffer;
      originalName = req.file.originalname || 'Uploaded PDF';
    }

    // Allow overriding API key per-request via header
    const headerKey = String(req.headers['x-api-key'] || '').trim();
    if (headerKey && !headerKey.startsWith('AIzaSyB86H')) {
      try {
        ai = new GoogleGenAI({ apiKey: headerKey });
      } catch (e) { }
    }
    const groqHeaderKey = String(req.headers['x-groq-key'] || '').trim();
    if (groqHeaderKey) {
      try {
        groq = new Groq({ apiKey: groqHeaderKey });
      } catch (e) { }
    }

    if (!getAI() && !getGroq()) {
      return res.status(500).json({ error: 'AI API keys not configured.' });
    }

    const jobId = crypto.randomBytes(12).toString('hex');
    const job = {
      id: jobId,
      status: 'analyzing',
      message: 'Analyzing PDF content…',
      draft: null,
      progress: null,
      error: null,
      materialId: materialId || null
    };
    pdfJobs.set(jobId, job);

    setImmediate(() => {
      processPdfExplainerJob(jobId, buffer, originalName, topic, slideRange || '1-10').catch((err) => {
        console.error('Job processing failed:', err);
      });
    });

    return res.json({ jobId, status: job.status, message: job.message });
  } catch (e) {
    console.error('Failed to start PDF explainer:', e);
    return res.status(500).json({ error: 'Unable to start explainer job.' });
  }
});

app.get('/api/images/random', async (req, res) => {
  try {
    const prompt = String(req.query.prompt || 'educational visual').trim();
    const sig = String(req.query.sig || Math.random());

    // Attempt Pollinations for high-quality AI generation
    const encodedPrompt = encodeURIComponent(prompt + ", digital art, educational, high resolution, 8k, professional lighting");
    const remoteUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=1280&height=720&seed=${sig}&model=flux`;

    console.log('[Images] Fetching from Pollinations:', prompt.slice(0, 50));
    const response = await fetch(remoteUrl, { redirect: 'follow' });

    if (response.ok) {
      res.set('Content-Type', response.headers.get('content-type') || 'image/jpeg');
      res.set('Cache-Control', 'public, max-age=3600');
      const stream = Readable.fromWeb(response.body);
      return stream.pipe(res);
    }
    throw new Error('Pollinations failed or returned non-ok');
  } catch (e) {
    console.warn('[Images] Pollinations failed, falling back to Unsplash:', e.message);
    try {
      const sig = String(req.query.sig || Math.random());
      const educFallbacks = [
        '1497633762261-4a1525aadab6', // students
        '1524995997946-a1c2e7159b98', // library
        '1503676260728-1c00da096a0b', // classroom
        '1523050853518-24097d7d063a', // university
        '1481627834876-b7833e8f5570', // books
        '1516321318423-f06f85e504b3', // research
        '1522202176988-66273c2fd55f', // study group
        '1434039390530-daa79a60c23f', // writing
        '1454165833467-03a66d7461a1', // workplace
        '1509062522246-3755977927d7'  // teacher
      ];
      const fallbackId = educFallbacks[Math.floor(Math.abs(parseFloat(sig) || 0)) % educFallbacks.length];
      const remoteUrl = `https://images.unsplash.com/photo-${fallbackId}?auto=format&fit=crop&q=80&w=1200&sig=${sig}`;

      const response = await fetch(remoteUrl, { redirect: 'follow' });
      if (!response.ok) {
        const finalUrl = `https://images.unsplash.com/photo-1503676260728-1c00da096a0b?auto=format&fit=crop&q=80&w=1200`;
        const finalResp = await fetch(finalUrl);
        res.set('Content-Type', finalResp.headers.get('content-type') || 'image/jpeg');
        const finalStream = Readable.fromWeb(finalResp.body);
        return finalStream.pipe(res);
      }

      res.set('Content-Type', response.headers.get('content-type') || 'image/jpeg');
      res.set('Cache-Control', 'public, max-age=3600');
      const stream = Readable.fromWeb(response.body);
      return stream.pipe(res);
    } catch (err) {
      console.error('Final image fallback failed:', err);
      return res.status(500).send('Image failed');
    }
  }
});

app.get('/api/pdf-explainer/status', (req, res) => {
  const jobId = String(req.query.jobId || '').trim();
  if (!jobId) {
    return res.status(400).json({ error: 'jobId is required.' });
  }
  const job = pdfJobs.get(jobId);
  if (!job) {
    return res.status(404).json({ error: 'Job not found.' });
  }
  return res.json({ status: job.status, message: job.message, draft: job.draft || undefined, error: job.error, progress: job.progress || undefined });
});

// -------- Marketplace APIs ---------

// 1. Get Wallet Balance
app.get('/api/marketplace/wallet', async (req, res) => {
  try {
    const user = await getUserFromAuth(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    return res.json({ balance: user.balance || 0, currency: 'PKR' });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to fetch wallet' });
  }
});

// 2. Post a Job
app.post('/api/marketplace/jobs', async (req, res) => {
  try {
    const user = await getUserFromAuth(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    const { title, description, offering } = req.body || {};
    if (!title || !description || !offering) return res.status(400).json({ error: 'Missing fields' });

    const job = {
      title, // Seeking
      offering, // Giving
      description,
      creatorId: user._id,
      creatorName: user.name,
      status: 'OPEN',
      createdAt: new Date()
    };
    const r = await db.collection('marketplace_jobs').insertOne(job);
    return res.json({ success: true, jobId: r.insertedId });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to post job' });
  }
});

// 3. List Jobs
app.get('/api/marketplace/jobs', async (req, res) => {
  try {
    const jobs = await db.collection('marketplace_jobs').find({ status: 'OPEN' }).sort({ createdAt: -1 }).toArray();
    return res.json({ jobs });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to list jobs' });
  }
});

// 4. List My Jobs (Posted or Working On)
app.get('/api/marketplace/my-jobs', async (req, res) => {
  try {
    const user = await getUserFromAuth(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    const posted = await db.collection('marketplace_jobs').find({ creatorId: user._id }).sort({ createdAt: -1 }).toArray();
    const working = await db.collection('marketplace_jobs').find({ freelancerId: user._id }).sort({ createdAt: -1 }).toArray();
    return res.json({ posted, working });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to list my jobs' });
  }
});

// 5. Accept a Job
app.post('/api/marketplace/jobs/:id/accept', async (req, res) => {
  try {
    const user = await getUserFromAuth(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    const { id } = req.params;

    const job = await db.collection('marketplace_jobs').findOne({ _id: new ObjectId(id) });
    if (!job) return res.status(404).json({ error: 'Job not found' });
    if (job.status !== 'OPEN') return res.status(400).json({ error: 'Job not available' });
    if (job.creatorId.toString() === user._id.toString()) return res.status(400).json({ error: 'Cannot accept own job' });

    await db.collection('marketplace_jobs').updateOne(
      { _id: new ObjectId(id) },
      { $set: { status: 'IN_PROGRESS', freelancerId: user._id, freelancerName: user.name, acceptedAt: new Date() } }
    );
    return res.json({ success: true });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to accept job' });
  }
});

// DELETE a job
app.delete('/api/marketplace/jobs/:id', async (req, res) => {
  try {
    const user = await getUserFromAuth(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    const { id } = req.params;
    
    const job = await db.collection('marketplace_jobs').findOne({ _id: new ObjectId(id) });
    if (!job) return res.status(404).json({ error: 'Job not found' });
    if (job.creatorId.toString() !== user._id.toString()) return res.status(403).json({ error: 'Not your job' });

    await db.collection('marketplace_jobs').deleteOne({ _id: new ObjectId(id) });
    return res.json({ success: true });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to delete job' });
  }
});

// UPDATE a job
app.put('/api/marketplace/jobs/:id', async (req, res) => {
  try {
    const user = await getUserFromAuth(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    const { id } = req.params;
    const { title, description, offering } = req.body;

    const job = await db.collection('marketplace_jobs').findOne({ _id: new ObjectId(id) });
    if (!job) return res.status(404).json({ error: 'Job not found' });
    if (job.creatorId.toString() !== user._id.toString()) return res.status(403).json({ error: 'Not your job' });

    await db.collection('marketplace_jobs').updateOne(
      { _id: new ObjectId(id) },
      { $set: { title, description, offering, updatedAt: new Date() } }
    );
    return res.json({ success: true });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to update job' });
  }
});

// UNCOLLABORATE
app.post('/api/marketplace/jobs/:id/uncollaborate', async (req, res) => {
  try {
    const user = await getUserFromAuth(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    const { id } = req.params;

    const job = await db.collection('marketplace_jobs').findOne({ _id: new ObjectId(id) });
    if (!job) return res.status(404).json({ error: 'Job not found' });
    if (job.freelancerId && job.freelancerId.toString() !== user._id.toString()) {
      return res.status(403).json({ error: 'Not assigned to you' });
    }

    await db.collection('marketplace_jobs').updateOne(
      { _id: new ObjectId(id) },
      { $set: { status: 'OPEN' }, $unset: { freelancerId: "", freelancerName: "", acceptedAt: "" } }
    );
    return res.json({ success: true });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to uncollaborate' });
  }
});

// 6. Submit Work (Trigger AI Arbitration)
app.post('/api/marketplace/jobs/:id/submit', async (req, res) => {
  try {
    const user = await getUserFromAuth(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    const { id } = req.params;
    const { submissionText } = req.body; // In real app, this would be a file URL too

    const job = await db.collection('marketplace_jobs').findOne({ _id: new ObjectId(id) });
    if (!job) return res.status(404).json({ error: 'Job not found' });
    if (job.freelancerId.toString() !== user._id.toString()) return res.status(403).json({ error: 'Not your job' });

    // AI Arbitration Logic
    const ai = getAI();
    let verdict = { approved: true, score: 100, reason: 'AI Check Bypassed (Key Missing)' };

    if (ai) {
      const prompt = `
        You are an AI arbitrator for a student freelancer platform. 
        Task: "${job.title}" - "${job.description}".
        Submission: "${submissionText}".
        
        Analyze the submission for:
        1. Relevance to the task.
        2. Quality (Is it gibberish? Is it a valid attempt?).
        3. Potential fraud (Is it just random text?).
        
        Return JSON:
        {
          "score": number (0-100),
          "isValid": boolean,
          "reason": "short explanation"
        }
      `;
      try {
        const resp = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: prompt,
          config: { responseMimeType: 'application/json' }
        });
        const json = JSON.parse(resp.text());
        verdict = {
          approved: json.isValid && json.score > 50,
          score: json.score,
          reason: json.reason
        };
      } catch (aiErr) {
        console.error('AI Arbitration failed:', aiErr);
        // Fallback to manual approval if AI fails? or auto-approve for prototype
      }
    }

    if (verdict.approved) {
      await db.collection('marketplace_jobs').updateOne(
        { _id: new ObjectId(id) },
        { $set: { status: 'COMPLETED', submissionText, aiVerdict: verdict, completedAt: new Date() } }
      );
    } else {
      await db.collection('marketplace_jobs').updateOne(
        { _id: new ObjectId(id) },
        { $set: { status: 'DISPUTED', submissionText, aiVerdict: verdict } }
      );
    }

    return res.json({ success: true, verdict });

  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Failed to submit work' });
  }
});

// Collaboration: Messages
app.post('/api/marketplace/jobs/:id/messages', async (req, res) => {
  try {
    const user = await getUserFromAuth(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    const { id } = req.params;
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: 'Message text required' });

    const job = await db.collection('marketplace_jobs').findOne({ _id: new ObjectId(id) });
    if (!job) return res.status(404).json({ error: 'Agreement not found' });
    
    // Auth check: part of agreement? 
    if (job.creatorId.toString() !== user._id.toString() && job.freelancerId?.toString() !== user._id.toString()) {
      return res.status(403).json({ error: 'Not part of this agreement' });
    }

    const newMessage = {
      senderId: user._id.toString(),
      senderName: user.name,
      text,
      createdAt: new Date().toISOString()
    };

    await db.collection('marketplace_jobs').updateOne(
      { _id: new ObjectId(id) },
      { $push: { messages: newMessage } }
    );
    return res.json({ success: true, message: newMessage });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to send message' });
  }
});

// Collaboration: Shared Plan
app.put('/api/marketplace/jobs/:id/plan', async (req, res) => {
  try {
    const user = await getUserFromAuth(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    const { id } = req.params;
    const { plan } = req.body;

    const job = await db.collection('marketplace_jobs').findOne({ _id: new ObjectId(id) });
    if (!job) return res.status(404).json({ error: 'Agreement not found' });
    
    if (job.creatorId.toString() !== user._id.toString() && job.freelancerId?.toString() !== user._id.toString()) {
      return res.status(403).json({ error: 'Not part of this agreement' });
    }

    await db.collection('marketplace_jobs').updateOne(
      { _id: new ObjectId(id) },
      { $set: { sharedPlan: plan } }
    );
    return res.json({ success: true });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to update plan' });
  }
});

// Collaboration: Manual Completion
app.post('/api/marketplace/jobs/:id/complete', async (req, res) => {
  try {
    const user = await getUserFromAuth(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    const { id } = req.params;

    const job = await db.collection('marketplace_jobs').findOne({ _id: new ObjectId(id) });
    if (!job) return res.status(404).json({ error: 'Agreement not found' });
    
    if (job.creatorId.toString() !== user._id.toString() && job.freelancerId?.toString() !== user._id.toString()) {
      return res.status(403).json({ error: 'Not part of this agreement' });
    }

    await db.collection('marketplace_jobs').updateOne(
      { _id: new ObjectId(id) },
      { $set: { status: 'COMPLETED', completedAt: new Date() } }
    );
    return res.json({ success: true });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to complete swap' });
  }
});

// Live Q&A Chatbot: Proxy Endpoint (Robust Fallback)
app.post('/api/chat', async (req, res) => {
  try {
    const { message, history } = req.body || {};
    if (!message) return res.status(400).json({ error: 'Message required' });

    const systemPrompt = "You are Lumo, a friendly and helpful AI study assistant for a learning platform. Keep your answers concise and focused on educational topics. When asked about non-academic subjects, politely steer the conversation back to learning.";

    // 1. Try Gemini Phase
    const aiService = getAI();
    if (aiService) {
      try {
        console.log('[Chat] Attempting Gemini...');
        const contents = [
          { role: 'user', parts: [{ text: systemPrompt }] },
          { role: 'model', parts: [{ text: 'Understood! I am Lumo, your AI study assistant. How can I help you today?' }] },
          ...(history || []).map((h) => ({
            role: h.role === 'user' ? 'user' : 'model',
            parts: [{ text: h.text }]
          })),
          { role: 'user', parts: [{ text: message }] }
        ];

        const response = await aiService.models.generateContent({
          model: 'gemini-1.5-flash',
          contents
        });

        const replyText = response.text ? (typeof response.text === 'function' ? response.text() : response.text) : "";
        if (replyText) {
          console.log('[Chat] Gemini Success');
          return res.json({ text: replyText, reply: replyText });
        }
      } catch (geminiErr) {
        console.warn('[Chat] Gemini failed, falling back to Groq:', geminiErr?.message || geminiErr);
      }
    }

    // 2. Try Groq Phase (Fallback)
    const groqClient = getGroq();
    if (groqClient) {
      try {
        console.log('[Chat] Attempting Groq fallback...');
        const messages = [
          { role: 'system', content: systemPrompt },
          ...(history || []).map((h) => ({
            role: h.role === 'user' ? 'user' : 'assistant',
            content: h.text
          })),
          { role: 'user', content: message }
        ];

        const completion = await groqClient.chat.completions.create({
          messages,
          model: 'llama-3.3-70b-versatile',
          max_tokens: 1000
        });

        const reply = completion.choices[0]?.message?.content?.trim();
        if (reply) {
          console.log('[Chat] Groq Success');
          return res.json({ text: reply, reply: reply });
        }
      } catch (groqErr) {
        console.error('[Chat] Groq also failed:', groqErr?.message || groqErr);
      }
    }

    return res.status(500).json({ error: 'Unable to get response from any AI service' });
  } catch (e) {
    console.error('Chat API Fatal Error:', e.message || e);
    return res.status(500).json({ error: 'Internal server error in chat' });
  }
});

// AI Game Generation Endpoints
app.post('/api/ai/game/coding', async (req, res) => {
  try {
    const { topics, focus } = req.body;
    const aiService = getAI();
    if (!aiService) throw new Error('AI not available');
    const model = 'gemini-1.5-flash';
    const topicsStr = Array.isArray(topics) ? topics.join(', ') : topics;

    const prompt = `You are a technical educational game designer for LumoAI. Generate 5 HIGHLY TECHNICAL coding challenges strictly for: ${topicsStr}.
    ${focus ? `The ESSENTIAL focused theme is: ${focus}.` : ''}
    IT IS CRITICAL that the scenarios, code snippets, and questions are DEEP and directly relate to ${topicsStr}${focus ? ` and specifically ${focus}` : ''}.
    NEVER generate generic math (like 1+1), NEVER generate generic "Hello World" or loop basic tests.
    If the topic is Machine Learning, the challenges MUST be about hyperparameter tuning (e.g., learning rate scheduler), loss functions (e.g., binary cross-entropy), or transformer layer normalization.
    Output JSON array of objects with keys: id, title, scenario, question, code, answer, difficulty, hint.`;

    const genModel = aiService.getGenerativeModel({
      model,
      generationConfig: { responseMimeType: 'application/json' }
    });

    const result = await genModel.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }]
    });
    const text = result.response.text();
    return res.json(JSON.parse(text));
  } catch (e) {
    console.error('AI Game Error', e);
    return res.json([
      { id: 1, title: "System Failure", scenario: "The AI agent could not generate content properly.", question: "Wait for the server to reboot. What is the command to reboot?", code: "sudo reboot", answer: "sudo reboot", difficulty: "Easy", hint: "Check connection." }
    ]);
  }
});

app.post('/api/ai/game/voxel', async (req, res) => {
  try {
    const { topics, focus } = req.body;
    const aiService = getAI();
    if (!aiService) throw new Error('AI not available');
    const topicsStr = Array.isArray(topics) ? topics.join(', ') : topics;

    const prompt = `You are a technical educational game designer for LumoAI. Generate 5 Minecraft-style technical quests strictly related to: ${topicsStr}.
    ${focus ? `The ESSENTIAL focused theme is: ${focus}.` : ''}
    NEVER generate generic math (like 1+1).
    If the theme is "Model Trainer", the questions must be about learning rates, epochs, or train-test splits.
    If the theme is "Bias", the questions must be about algorithmic fairness, demographic parity, or sampling bias.
    Output JSON exactly: { "quests": [ { "id": number, "blockType": "Diamond|Gold|Iron|Obsidian|Redstone", "questName": "string", "narrative": "string", "question": "string", "options": ["string","string","string","string"], "correctAnswer": "string", "reward": "string" } ] }`;

    const genModel = aiService.getGenerativeModel({
      model: 'gemini-1.5-flash',
      generationConfig: { responseMimeType: 'application/json' }
    });

    const result = await genModel.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }]
    });
    const resData = JSON.parse(result.response.text());
    const quests = Array.isArray(resData) ? resData : (resData.quests || []);
    return res.json(quests);
  } catch (e) {
    console.error('AI Voxel Error', e);
    return res.json([]);
  }
});

app.post('/api/ai/game/cards', async (req, res) => {
  try {
    const { topics, focus } = req.body;
    const aiService = getAI();
    if (!aiService) throw new Error('AI not available');
    const topicsStr = Array.isArray(topics) ? topics.join(', ') : topics;

    const prompt = `Generate 6 technical study cards (flashcards) strictly for: ${topicsStr}.
    ${focus ? `The ESSENTIAL focused theme is: ${focus}.` : ''}
    IT IS CRITICAL that content is DEEP and Technical. No 1+1 or generic logic.
    Output JSON exactly: { "cards": [ { "id": number, "front": "string", "back": "string", "powerUp": "string", "category": "string" } ] }`;

    const genModel = aiService.getGenerativeModel({
      model: 'gemini-1.5-flash',
      generationConfig: { responseMimeType: 'application/json' }
    });

    const result = await genModel.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }]
    });
    const resData = JSON.parse(result.response.text());
    const cards = Array.isArray(resData) ? resData : (resData.cards || []);
    return res.json(cards);
  } catch (e) {
    console.error('AI Cards Error', e);
    return res.json([]);
  }
});

// -------- End Student Projects APIs ---------

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
let embeddingsClient = null;
async function getEmbeddingsClient() {
  if (embeddingsClient) return embeddingsClient;
  const key = process.env.API_KEY || process.env.GEMINI_API_KEY || '';
  if (!key) return null;
  try {
    const mod = await import('@google/generative-ai');
    const GoogleGenerativeAI = mod?.GoogleGenerativeAI;
    if (!GoogleGenerativeAI) {
      console.warn('[Embeddings] @google/generative-ai not available');
      return null;
    }
    embeddingsClient = new GoogleGenerativeAI(key);
    return embeddingsClient;
  } catch (e) {
    console.warn('[Embeddings] Failed to init embeddings client:', e?.message || e);
    return null;
  }
}

async function embedTexts(texts) {
  const client = await getEmbeddingsClient();
  if (!client) throw new Error('GEMINI_API_KEY not configured');
  const model = client.getGenerativeModel({ model: embeddingModelName });
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

// -------- AI Generation Endpoints (Server-Side) --------

app.post('/api/ai/generate-course-outline', async (req, res) => {
  try {
    const user = await getUserFromAuth(req);
    console.log('[Auth Debug] User:', user ? `${user.name} (${user.role})` : 'null');
    if (!user || user.role !== 'teacher') {
      console.log('[Auth Debug] Forbidden access. Role:', user?.role);
      return res.status(403).json({ error: 'Forbidden' });
    }
    const { subject, count, numLectures } = req.body;
    if (!subject) return res.status(400).json({ error: 'Subject is required' });

    const ai = getAI();
    if (!ai) return res.status(500).json({ error: 'AI not configured' });

    console.log(`[AI] Generating outline for: ${subject} (${count || 4} modules, ${numLectures || 2} lectures each)`);
    // Use 1.5-flash for better stability
    const groq = getGroq();
    if (!groq) return res.status(500).json({ error: 'AI provider (Groq) not configured' });

    // Request modules AND lectures per module with outlines
    const prompt = `
      You are an expert curriculum designer. A teacher wants a course on: "${subject}".
      Create a structured outline with EXACTLY ${count || 4} modules.
      For EACH module, list EXACTLY ${numLectures || 2} specific lectures.
      CRITICAL: For EVERY SINGLE lecture, you MUST provide a detailed "outline" (3-4 sentences) describing the core concepts and examples covered in that specific lecture. DO NOT leave the outline empty.
      
      Example of the REQUIRED JSON format:
      {
        "modules": [
          {
            "title": "Module 1: Foundations",
            "description": "Short description of the weekly goal.",
            "topics": [
              { 
                "title": "Lecture 1: Intro to Key Concept", 
                "outline": "A 3-5 sentence detailed pedagogical summary of what will be taught in this specific lecture. This must be ready-to-use educational content." 
              }
            ]
          }
        ]
      }

      CRITICAL rules:
      1. EACH module should represent a WEEK of study.
      2. EACH topic MUST have a detailed "outline" (min 50 words). 
      3. Return ONLY pure JSON.
    `;

    const chatCompletion = await groq.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      model: 'llama-3.3-70b-versatile',
      response_format: { type: 'json_object' }
    });

    const text = chatCompletion.choices[0]?.message?.content || '{}';
    const data = JSON.parse(text);

    if (!data.modules || !Array.isArray(data.modules)) {
      throw new Error('Invalid AI response structure');
    }

    // Auto-heal & Normalize topics server-side
    for (let m of data.modules) {
      if (!m.topics) m.topics = [];
      // 1. Normalize strings to objects
      m.topics = m.topics.map(t => {
        if (typeof t === 'string') return { title: t, outline: "" };
        return t;
      });

      // 2. Deep healing for any empty or short outlines
      for (let t of m.topics) {
        if (!t.outline || t.outline.length < 40) {
          console.log(`[AI Heal] Architecting outline for: ${t.title}`);
          const healPrompt = `
            You are an expert Professor. Write a detailed 4-sentence educational outline for a lecture titled: "${t.title}".
            The lecture is part of a course on "${subject}".
            Focus on core learning objectives and specific technical or conceptual content.
            Return ONLY the 4 sentences. NO preamble.
          `;
          try {
            const healComp = await groq.chat.completions.create({
              messages: [{ role: 'user', content: healPrompt }],
              model: 'llama-3.2-3b-preview',
            });
            t.outline = (healComp.choices[0]?.message?.content || "Detailed curriculum content is being architected for this session.").trim();
          } catch (err) {
            console.error("[AI Heal Error]", err);
            t.outline = "Pending detailed architectural summary.";
          }
        }
      }
    }

    return res.json({ modules: data.modules });
  } catch (e) {
    console.error('Gen Outline error:', e);
    return res.status(500).json({ error: `Failed to generate outline: ${e.message || e}` });
  }
});

app.post('/api/ai/generate-topic-outlines', async (req, res) => {
  try {
    const user = await getUserFromAuth(req);
    if (!user || user.role !== 'teacher') return res.status(403).json({ error: 'Forbidden' });

    const { topics, subject } = req.body;
    if (!Array.isArray(topics) || topics.length === 0) return res.status(400).json({ error: 'Topics array is required' });

    const groq = getGroq();
    if (!groq) return res.status(500).json({ error: 'AI provider not configured' });

    const prompt = `
      You are an expert curriculum designer. For a course on "${subject || 'General Studies'}", 
      provide a 3-4 sentence detailed outline for each of the following lecture topics:
      ${topics.join(', ')}

      Return STRICT JSON with this structure:
      {
        "outlines": {
          "${topics[0]}": "Detailed outline text..."
        }
      }
      Ensure the keys in the "outlines" object match EXACTLY with the provided topic titles.
    `;

    const chatCompletion = await groq.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      model: 'llama-3.3-70b-versatile',
      response_format: { type: 'json_object' }
    });

    const data = JSON.parse(chatCompletion.choices[0]?.message?.content || '{}');
    if (!data.outlines || Object.keys(data.outlines).length === 0) {
      throw new Error('AI returned an empty outline set.');
    }
    return res.json({ outlines: data.outlines });
  } catch (e) {
    console.error('Topic Outline Gen error:', e);
    return res.status(500).json({ error: `AI Outline Generation Failed: ${e.message || 'Check your API limits'}` });
  }

});

const PDFDocument = require('pdfkit');

app.post('/api/courses/:courseId/modules/:moduleId/generate-notes', async (req, res) => {
  try {
    const user = await getUserFromAuth(req);
    if (!user || user.role !== 'teacher') return res.status(403).json({ error: 'Forbidden' });
    const { courseId, moduleId } = req.params;
    const { topic, outline } = req.body; // Topic or Lecture Title and optional outline
    if (!topic) return res.status(400).json({ error: 'Topic is required' });

    const ai = getAI();
    if (!ai) return res.status(500).json({ error: 'AI not configured' });

    console.log(`[PDF Gen] Generating notes for: ${topic}`);

    const groq = getGroq();
    if (!groq) return res.status(500).json({ error: 'AI provider not configured' });

    // 1. Generate Content
    const prompt = `
      You are an expert academic professor. Write a comprehensive lecture note document for the topic: "${topic}".
      ${outline ? `Following this specific outline: ${outline}` : ""}
      Context: This is for a university-level computer science course.
      Structure:
      1. Title
      2. Introduction (Brief overview)
      3. Core Concepts (Explain 3-5 key concepts in depth with examples. Expand clearly based on the provided outline points if any.)
      4. Practical Application (How this is used in real world)
      5. Summary
      
      Output Format: Pure JSON object with keys: "title", "introduction", "concepts" (array of { "heading": string, "content": string }), "application", "summary".
    `;

    const chatCompletion = await groq.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      model: 'llama-3.3-70b-versatile',
      response_format: { type: 'json_object' }
    });

    const content = JSON.parse(chatCompletion.choices[0]?.message?.content || '{}');

    // 2. Create PDF
    const doc = new PDFDocument();
    const chunks = [];
    doc.on('data', chunk => chunks.push(chunk));

    // PDF Styling
    doc.fontSize(24).text(content.title, { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).text(`Generated for course module: ${topic}`, { align: 'center', color: 'grey' });
    doc.moveDown(2);

    doc.fontSize(16).text('1. Introduction');
    doc.moveDown(0.5);
    doc.fontSize(12).text(content.introduction, { align: 'justify' });
    doc.moveDown(1.5);

    doc.fontSize(16).text('2. Core Concepts');
    doc.moveDown(0.5);
    content.concepts.forEach((c, i) => {
      doc.fontSize(14).text(`${String.fromCharCode(97 + i)}) ${c.heading}`, { indent: 20 });
      doc.fontSize(12).text(c.content, { indent: 20, align: 'justify' });
      doc.moveDown(1);
    });
    doc.moveDown(0.5);

    doc.fontSize(16).text('3. Practical Application');
    doc.moveDown(0.5);
    doc.fontSize(12).text(content.application, { align: 'justify' });
    doc.moveDown(1.5);

    doc.fontSize(16).text('4. Summary');
    doc.moveDown(0.5);
    doc.fontSize(12).text(content.summary, { align: 'justify' });

    doc.end();

    const pdfBuffer = await new Promise(resolve => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
    });

    // 3. Save to GridFS (reuse existing logic if possible, or manual insert)
    // We'll mimic the /upload flow but programmatically
    const filename = `${topic.replace(/[^a-zA-Z0-9]/g, '_')}_Notes.pdf`;

    const uploadStream = materialsBucket.openUploadStream(filename, {
      contentType: 'application/pdf',
      metadata: {
        courseId,
        moduleId,
        uploaderId: user._id,
        title: `lecture Note: ${topic}`,
        isAiGenerated: true
      }
    });
    uploadStream.end(pdfBuffer);

    await new Promise((resolve, reject) => {
      uploadStream.on('finish', resolve);
      uploadStream.on('error', reject);
    });

    // 4. Create Material Record
    const materialDoc = {
      fileId: uploadStream.id,
      courseId,
      moduleId,
      title: `Lecture Note: ${topic}`,
      mime: 'application/pdf',
      size: pdfBuffer.length,
      uploaderId: user._id,
      createdAt: new Date(),
      indexed: false, // Could index this later
      isAiGenerated: true
    };
    await db.collection('materials').insertOne(materialDoc);

    // 5. Link to Course Module
    const midStr = materialDoc._id.toString();
    const or = [{ id: courseId }];
    try { or.push({ _id: new ObjectId(courseId) }); } catch { }
    // Aggressive sanitization for MongoDB key
    const sanitizedTopic = topic.replace(/[^a-zA-Z0-9]/g, '_');
    console.log(`[Material] Linking topic "${topic}" (sanitized: "${sanitizedTopic}") to material ${midStr}`);

    await db.collection('courses').updateOne(
      { $or: or, 'modules.id': moduleId },
      { $set: { [`modules.$.materialIds.${sanitizedTopic}`]: midStr } }
    );

    return res.json({ success: true, material: { ...materialDoc, id: midStr } });

  } catch (e) {
    console.error('Gen PDF error:', e);
    return res.status(500).json({ error: 'Failed to generate PDF' });
  }
});

app.post('/api/materials/upload-raw', upload.single('file'), async (req, res) => {
  try {
    const user = await getUserFromAuth(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    if (!req.file) return res.status(400).json({ error: 'No file provided' });

    const { courseId, moduleId, title } = req.body || {};

    if (!materialsBucket) {
      console.error('[Materials] GridFS bucket not initialized!');
      return res.status(500).json({ error: 'File storage not initialized' });
    }

    console.log('[Materials] Upload request - courseId:', courseId, 'moduleId:', moduleId, 'title:', title, 'filename:', req.file.originalname);
    console.log('[Materials] User check - exists:', !!user, 'id:', user?._id?.toString());

    const filename = req.file.originalname || `upload_${Date.now()}.pdf`;
    const uploadStream = materialsBucket.openUploadStream(filename, {
      contentType: 'application/pdf',
      metadata: { uploaderId: user?._id || 'unknown', originalName: filename, courseId, moduleId }
    });

    const uploadPromise = new Promise((resolve, reject) => {
      uploadStream.on('finish', () => resolve(uploadStream));
      uploadStream.on('error', reject);
    });

    uploadStream.end(req.file.buffer);
    const saved = await uploadPromise;

    // Create Material Record
    const materialDoc = {
      fileId: saved.id,
      courseId: courseId || null,
      moduleId: moduleId || null,
      title: title || filename,
      mime: 'application/pdf',
      size: req.file.size,
      uploaderId: user._id,
      createdAt: new Date(),
      indexed: false,
    };
    const ins = await db.collection('materials').insertOne(materialDoc);
    const midStr = ins.insertedId.toString();

    // Link to Course Module if IDs are provided
    if (courseId && moduleId && title) {
      const sanitizedTopic = title.replace(/[^a-zA-Z0-9]/g, '_');
      const or = [{ id: courseId }];
      try { or.push({ _id: new ObjectId(courseId) }); } catch { }

      // Store under both sanitized and original title for better lookup
      const updateFields = {
        [`modules.$.materialIds.${sanitizedTopic}`]: midStr
      };
      // Also store under original title if it's different from sanitized
      if (sanitizedTopic !== title) {
        updateFields[`modules.$.materialIds.${title}`] = midStr;
      }

      const updateResult = await db.collection('courses').updateOne(
        { $or: or, 'modules.id': moduleId },
        { $set: updateFields }
      );

      console.log(`[Materials] Linked material ${midStr} to course ${courseId}, module ${moduleId}, title: "${title}" (sanitized: "${sanitizedTopic}"), matched: ${updateResult.matchedCount}, modified: ${updateResult.modifiedCount}`);

      if (updateResult.matchedCount === 0) {
        console.warn(`[Materials] WARNING: No course found with id="${courseId}" or _id="${courseId}" and moduleId="${moduleId}"`);
      }
    }

    return res.json({ id: midStr });
  } catch (e) {
    console.error('[Materials] Raw upload error:', e);
    console.error('[Materials] Error stack:', e.stack);
    return res.status(500).json({ error: `Failed to upload file: ${e.message}` });
  }
});

app.post('/api/materials/upload', upload.single('file'), async (req, res) => {
  try {
    const user = await getUserFromAuth(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    const { courseId, moduleId, title } = req.body || {};
    if (!courseId || !req.file) return res.status(400).json({ error: 'Missing courseId or file' });
    const file = req.file;
    const isPdfMime = /pdf$/i.test(file.mimetype || '');
    const isPdfName = /\.pdf$/i.test(file.originalname || '');
    if (!isPdfMime && !isPdfName) return res.status(400).json({ error: 'Only PDF is supported currently' });

    // Store file to GridFS
    const uploadStream = materialsBucket.openUploadStream(file.originalname, {
      contentType: file.mimetype,
      metadata: { courseId, moduleId: moduleId || null, uploaderId: user._id, title: title || file.originalname }
    });
    uploadStream.end(file.buffer);
    await new Promise((resolve, reject) => {
      uploadStream.on('finish', resolve);
      uploadStream.on('error', (err) => reject(err));
    }).catch((e) => {
      console.error('GridFS upload error:', e?.message || e);
      throw new Error('Failed to store file');
    });

    // Get the file ID from the upload stream
    const fileId = uploadStream.id;
    console.log('[Materials] Uploaded file to GridFS with ID:', fileId);

    const materialDoc = {
      fileId: fileId,
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
      const parser = await getPdfParser();
      if (!parser) throw new Error('PDF parser not available. Ensure pdf-parse is installed.');
      const parsed = await parser(file.buffer).catch(() => ({ text: '' }));
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
    console.error('Upload error:', e?.message || e);
    return res.status(500).json({ error: e?.message || 'Upload failed' });
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
    return res.json({
      materials: list.map(m => ({
        id: m._id.toString(),
        title: m.title,
        size: m.size,
        mime: m.mime,
        indexed: !!m.indexed,
        createdAt: m.createdAt,
      }))
    });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to list materials' });
  }
});

app.get('/api/materials/:id/download', async (req, res) => {
  try {
    const { id } = req.params;
    console.log('[Download] Request for material ID:', id);

    let materialId;
    try {
      materialId = new ObjectId(id);
    } catch (err) {
      console.error('[Download] Invalid ObjectId:', id, err);
      return res.status(400).send('Invalid ID');
    }

    const material = await db.collection('materials').findOne({ _id: materialId });
    console.log('[Download] Material found:', !!material, material ? `fileId: ${material.fileId}` : 'N/A');

    if (!material) {
      // Fallback: check if id is the fileId itself
      console.log('[Download] Trying fallback: checking materials.files collection');
      const file = await db.collection('materials.files').findOne({ _id: materialId });
      if (file) {
        console.log('[Download] Found in materials.files, streaming...');
        const contentType = file.contentType || 'application/pdf';
        const filename = (file.filename || 'download.pdf').replace(/[^\w\s.-]/g, '_');

        res.set('Content-Type', contentType);
        res.set('Content-Disposition', `inline; filename="${filename}"`);
        res.set('Cache-Control', 'no-cache');

        const downloadStream = materialsBucket.openDownloadStream(materialId);
        downloadStream.on('error', (err) => {
          console.error('[Download] Stream error:', err);
          if (!res.headersSent) {
            res.status(500).send('Failed to stream file');
          }
        });
        return downloadStream.pipe(res);
      }
      console.error('[Download] Material not found in either collection');
      return res.status(404).send('Material not found');
    }

    // Sanitize filename to prevent header injection
    const sanitizedTitle = (material.title || 'lecture_material.pdf')
      .replace(/[^\w\s.-]/g, '_')
      .replace(/\s+/g, '_');

    const contentType = material.mime || 'application/pdf';
    console.log('[Download] Streaming material:', material._id, 'fileId:', material.fileId, 'title:', sanitizedTitle);

    // Set headers for PDF display
    res.set('Content-Type', contentType);
    res.set('Content-Disposition', `inline; filename="${sanitizedTitle}"`);
    res.set('Cache-Control', 'no-cache');
    res.set('Accept-Ranges', 'bytes');

    // Stream the file from GridFS
    const fileId = new ObjectId(material.fileId);
    const downloadStream = materialsBucket.openDownloadStream(fileId);

    downloadStream.on('error', (err) => {
      console.error('[Download] GridFS stream error:', err);
      if (!res.headersSent) {
        res.status(500).send('Failed to stream file');
      }
    });

    downloadStream.on('end', () => {
      console.log('[Download] Stream completed successfully for:', id);
    });

    downloadStream.pipe(res);
  } catch (e) {
    console.error('[Download] Unexpected error:', e);
    if (!res.headersSent) {
      res.status(500).send('Download failed');
    }
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

// -------- Quizzes (Student) ---------

async function generateQuizWithGemini(subject, moduleTitle, topics) {
  const groq = getGroq();
  if (!groq) return null;
  const prompt = `Create a short 5-question multiple-choice quiz for a course on "${subject}".
Module: "${moduleTitle}".
${Array.isArray(topics) && topics.length ? `Focus ONLY on these topics: ${topics.join(', ')}.` : ''}
Strict requirements for options:
- Each option must be a concrete, topic-specific phrase or statement (3–12 words).
- Do NOT use generic placeholders like "Option A/B", "Definition A/B/C", "P1/P2/P3/P4", "Example A/B", etc.
- No duplicated options; all options must be distinct and meaningful.

Return STRICT JSON with key "quiz" as an array of 5 items, each with fields:
  - question: string
  - options: array of exactly 4 strings
  - correctAnswer: one string that exactly matches one of the options.
NO commentary, no markdown.`;

  try {
    const chatCompletion = await groq.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      model: 'llama-3.3-70b-versatile',
      response_format: { type: 'json_object' }
    });
    const text = (chatCompletion.choices[0]?.message?.content || '{}').trim();
    const obj = JSON.parse(text);
    if (Array.isArray(obj?.quiz) && obj.quiz.length === 5) return obj.quiz;
  } catch (e) { console.error("Quiz gen error:", e); }
  return null;
}

function fallbackQuiz(subject, moduleTitle, topics = []) {
  // Topic-aware fallback: questions and options come from module topics to avoid placeholders
  const ts = (Array.isArray(topics) ? topics : []).filter(Boolean);
  const pool = ts.length ? ts : [moduleTitle, subject].filter(Boolean);
  const pickDistinct = (n, avoid = []) => {
    const out = [];
    const used = new Set(avoid.map(s => String(s)));
    for (let i = 0; i < pool.length && out.length < n; i++) {
      const v = String(pool[i]);
      if (!used.has(v)) { out.push(v); used.add(v); }
    }
    let k = 0;
    while (out.length < n) {
      const v = `${moduleTitle} concept ${k + 1}`;
      if (!used.has(v)) { out.push(v); used.add(v); }
      k++;
    }
    return out;
  };

  const makeQ = (idx) => {
    const correct = pool[idx % pool.length];
    const distractors = pickDistinct(3, [correct]);
    const options = [correct, ...distractors].slice(0, 4);
    const question = `Which concept is most relevant to ${moduleTitle}?`;
    return { question, options, correctAnswer: correct };
  };

  const qs = [];
  for (let i = 0; i < 5; i++) qs.push(makeQ(i));
  return qs;
}

// Ensure MCQs are well-formed: 4 unique non-empty options and a valid correctAnswer
function sanitizeQuiz(quiz, courseTitle, moduleTitle, topics = []) {
  if (!Array.isArray(quiz)) return [];
  const makeDistractor = (i) => `${moduleTitle} concept ${i + 1}`;
  const placeholderRe = /^(option\s*[a-d]|definition\s*[a-d]|pitfall\s*[a-d]|ex(?:ample)?\s*[a-d]|p\d+)$/i;
  const topicPool = (Array.isArray(topics) ? topics : []).filter(Boolean);
  return quiz.map((q, idx) => {
    const question = (q?.question && String(q.question).trim()) || `Question ${idx + 1} on ${moduleTitle}`;
    const rawOpts = Array.isArray(q?.options) ? q.options : [];
    let trimmed = rawOpts.map(o => String(o || '').trim()).filter(Boolean);
    // Replace generic placeholders with topic-derived phrases if detected
    trimmed = trimmed.map((o, i2) => placeholderRe.test(o) ? (topicPool[i2 % Math.max(1, topicPool.length)] || makeDistractor(i2)) : o);
    // Deduplicate while keeping order
    const seen = new Set();
    let options = trimmed.filter(o => { if (seen.has(o)) return false; seen.add(o); return true; });
    let correct = String(q?.correctAnswer || '').trim();
    if (correct && !options.includes(correct)) options.push(correct);
    // Fill up to 4
    let padIdx = 0;
    while (options.length < 4) {
      const cand = makeDistractor(padIdx++);
      if (!options.includes(cand)) options.push(cand);
    }
    // Clip to 4 but keep correct if possible
    if (options.length > 4) {
      if (correct && options.includes(correct)) {
        const keep = [correct];
        for (const o of options) { if (keep.length === 4) break; if (o !== correct) keep.push(o); }
        options = keep;
      } else {
        options = options.slice(0, 4);
      }
    }
    if (!correct || !options.includes(correct)) correct = options[0];
    return { question, options, correctAnswer: correct };
  });
}

// Generate a quiz for a module (student)
app.post('/api/quizzes/generate', async (req, res) => {
  try {
    const user = await getUserFromAuth(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    const { courseId, moduleId } = req.body || {};
    if (!courseId || !moduleId) return res.status(400).json({ error: 'courseId and moduleId required' });
    // Relaxed: allow quiz generation without strict enrollment to avoid 403 in student UI
    // If you want to re-enable, restore the enrollment check below.
    // if (user.role === 'student') {
    //   const enr = await db.collection('enrollments').findOne({ userId: user._id.toString(), courseId: String(courseId) });
    //   if (!enr) return res.status(403).json({ error: 'Enroll in this course to generate quizzes' });
    // }
    const orCourse = [{ id: String(courseId) }];
    try { orCourse.push({ _id: new ObjectId(String(courseId)) }); } catch { }
    let course = await db.collection('courses').findOne({ $or: orCourse });
    if (!course) {
      // Fallback: locate by moduleId if courseId mapping changed
      course = await db.collection('courses').findOne({ 'modules.id': String(moduleId) });
      if (!course) return res.status(404).json({ error: 'Course not found' });
    }
    const mod = (course.modules || []).find(m => m.id === moduleId);
    if (!mod) return res.status(404).json({ error: 'Module not found' });
    // Build prompt context only from the module's teacher-defined topics (no materials)
    const topics = Array.isArray(mod.topics) ? mod.topics : [];
    let quiz = null;
    try {
      // Include topics and (if any) materials context
      const groq = getGroq();
      if (groq) {
        const prompt = `Create a short 5-question multiple-choice quiz for a course on "${course.title}".\nModule: "${mod.title}".\nFocus strictly on these teacher-defined topics: ${topics.join(', ')}.\nReturn strict JSON with key "quiz" as an array of 5 items, each with: question (string), options (array of 4 strings), correctAnswer (one of the options). No commentary.`;
        const chatCompletion = await groq.chat.completions.create({
          messages: [{ role: 'user', content: prompt }],
          model: 'llama-3.3-70b-versatile',
          response_format: { type: 'json_object' }
        });
        const text = (chatCompletion.choices[0]?.message?.content || '{}').trim();
        try { const obj = JSON.parse(text); if (Array.isArray(obj?.quiz) && obj.quiz.length === 5) quiz = obj.quiz; } catch { }
      }
    } catch { }
    if (!quiz) quiz = fallbackQuiz(course.title, mod.title, topics);
    // Sanitize to guarantee valid MCQs and remove placeholders
    quiz = sanitizeQuiz(quiz, course.title, mod.title, topics);
    const quizId = crypto.randomBytes(12).toString('hex');
    return res.json({ quiz: { id: quizId, courseId, moduleId, questions: quiz } });
  } catch (e) {
    console.error('Generate quiz error:', e);
    return res.status(500).json({ error: 'Failed to generate quiz' });
  }
});

// Generate detailed quiz from PDF content for a specific topic
app.post('/api/quizzes/generate-from-pdf', async (req, res) => {
  try {
    const user = await getUserFromAuth(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const { courseId, moduleId, topic, materialId, questionCount = 10 } = req.body || {};
    if (!courseId || !moduleId || !topic) {
      return res.status(400).json({ error: 'courseId, moduleId, and topic are required' });
    }

    console.log('[PDF Quiz] Generating quiz for topic:', topic, 'materialId:', materialId);

    // Get the course and module info
    const orCourse = [{ id: String(courseId) }];
    try { orCourse.push({ _id: new ObjectId(String(courseId)) }); } catch { }
    const course = await db.collection('courses').findOne({ $or: orCourse });
    if (!course) return res.status(404).json({ error: 'Course not found' });

    const module = (course.modules || []).find(m => m.id === moduleId);
    if (!module) return res.status(404).json({ error: 'Module not found' });

    // Read PDF content directly
    let pdfContext = '';
    try {
      if (materialId) {
        console.log('[PDF Quiz] Reading PDF directly from materialId:', materialId);

        // Get the material document
        let matId;
        try {
          matId = new ObjectId(materialId);
        } catch {
          matId = materialId;
        }

        let material = await db.collection('materials').findOne({ _id: matId });

        // Robust Fallback: 
        // 1. If not found by material _id, maybe matId is actually the fileId (GridFS ID)
        if (!material) {
          console.log('[PDF Quiz] Material not found by _id, searching by fileId:', materialId);
          material = await db.collection('materials').findOne({ fileId: matId });
        }

        // 2. If STILL not found, check if it exists directly in GridFS (last resort for broken links)
        if (!material) {
          console.log('[PDF Quiz] Still not found, checking GridFS directly:', materialId);
          const gridFile = await db.collection('materials.files').findOne({ _id: matId });
          if (gridFile) {
            console.log('[PDF Quiz] Found file directly in GridFS materials.files');
            material = { fileId: matId, title: topic }; // Mock material record to allow processing
          }
        }

        if (material && material.fileId) {
          console.log('[PDF Quiz] Found material, reading PDF file...');

          // Read the PDF file from GridFS
          const fileId = new ObjectId(material.fileId);
          const downloadStream = materialsBucket.openDownloadStream(fileId);

          // Collect PDF data
          const chunks = [];
          for await (const chunk of downloadStream) {
            chunks.push(chunk);
          }
          const pdfBuffer = Buffer.concat(chunks);

          // Parse PDF
          const pdfParse = await getPdfParser();
          if (pdfParse) {
            const pdfData = await pdfParse(pdfBuffer);
            pdfContext = pdfData.text || '';
            console.log('[PDF Quiz] Extracted', pdfContext.length, 'characters from PDF');
          } else {
            console.error('[PDF Quiz] PDF parser not available');
          }
        } else {
          console.log('[PDF Quiz] Material not found or has no fileId');
        }
      } else {
        console.log('[PDF Quiz] No materialId provided');
      }
    } catch (err) {
      console.error('[PDF Quiz] Error reading PDF:', err);
    }

    // Generate comprehensive quiz using AI
    const groq = getGroq();
    if (!groq) {
      return res.status(500).json({ error: 'AI service not configured' });
    }

    const contextSection = pdfContext
      ? `\n\nRELEVANT CONTENT FROM PDF:\n${pdfContext.slice(0, 8000)}\n\nUse this content to create specific, detailed questions.`
      : '\n\nNo PDF content available. Create questions based on the topic name and general knowledge.';

    const prompt = `You are an expert educator creating a comprehensive assessment quiz.

Course: "${course.title}"
Module: "${module.title}"
Topic: "${topic}"
${contextSection}

Create a detailed quiz with exactly ${questionCount} questions using the following distribution:
- ${Math.ceil(questionCount * 0.5)} Multiple Choice Questions (MCQs)
- ${Math.floor(questionCount * 0.3)} Short Answer Questions
- ${Math.floor(questionCount * 0.2)} Programming/Code Questions (if topic is programming-related, otherwise make them analytical questions)

CRITICAL REQUIREMENTS:
1. All questions MUST be based on the PDF content provided above (if available)
2. Questions should test deep understanding, not just memorization
3. For MCQs: Create 4 distinct options with only ONE correct answer
4. For Short Answer: Expect 2-3 sentence responses
5. For Programming: Provide clear problem statements with expected output/behavior
6. Make questions progressively harder (easy → medium → hard)
7. Include specific details, examples, or code snippets from the PDF content

Return STRICT JSON with this structure:
{
  "questions": [
    {
      "type": "mcq" | "short" | "programming",
      "question": "string",
      "options": ["string"] (only for MCQ, exactly 4 options),
      "correctAnswer": "string" (for MCQ: one of the options; for short/programming: the expected answer/solution),
      "explanation": "string (why this is the correct answer)",
      "difficulty": "easy" | "medium" | "hard",
      "points": number (1-5 based on difficulty)
    }
  ]
}

NO markdown, NO commentary, ONLY valid JSON.`;

    console.log('[PDF Quiz] Sending request to AI...');
    const chatCompletion = await groq.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      model: 'llama-3.3-70b-versatile',
      response_format: { type: 'json_object' }
    });

    const text = (chatCompletion.choices[0]?.message?.content || '{}').trim();
    let quizData;
    try {
      quizData = JSON.parse(text);
    } catch (parseErr) {
      console.error('[PDF Quiz] Failed to parse AI response:', parseErr);
      return res.status(500).json({ error: 'Failed to generate valid quiz' });
    }

    if (!quizData.questions || !Array.isArray(quizData.questions) || quizData.questions.length === 0) {
      console.error('[PDF Quiz] Invalid quiz structure from AI');
      return res.status(500).json({ error: 'AI returned invalid quiz structure' });
    }

    // Validate and sanitize questions
    const validatedQuestions = quizData.questions.map((q, idx) => {
      const validated = {
        type: q.type || 'mcq',
        question: q.question || `Question ${idx + 1}`,
        difficulty: q.difficulty || 'medium',
        points: q.points || 1,
        explanation: q.explanation || 'No explanation provided'
      };

      if (q.type === 'mcq') {
        validated.options = Array.isArray(q.options) && q.options.length === 4
          ? q.options
          : ['Option A', 'Option B', 'Option C', 'Option D'];
        validated.correctAnswer = q.correctAnswer || validated.options[0];
      } else {
        validated.correctAnswer = q.correctAnswer || 'Answer not provided';
      }

      return validated;
    });

    const quizId = crypto.randomBytes(12).toString('hex');
    const quiz = {
      id: quizId,
      courseId,
      moduleId,
      topic,
      materialId: materialId || null,
      questions: validatedQuestions,
      totalPoints: validatedQuestions.reduce((sum, q) => sum + (q.points || 1), 0),
      createdAt: new Date()
    };

    console.log('[PDF Quiz] Generated quiz with', validatedQuestions.length, 'questions');
    return res.json({ quiz });

  } catch (e) {
    console.error('[PDF Quiz] Error:', e);
    return res.status(500).json({ error: 'Failed to generate quiz from PDF' });
  }
});

app.post('/api/quizzes/submit', async (req, res) => {
  try {
    const user = await getUserFromAuth(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    const { courseId, moduleId, quizId, questions, answers } = req.body || {};
    if (!courseId || !moduleId || !quizId || !Array.isArray(questions) || !Array.isArray(answers)) {
      return res.status(400).json({ error: 'Invalid payload' });
    }

    let totalScore = 0;
    let maxScore = 0;
    const results = [];

    // Process each question
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      const userAnswer = answers[i];
      const points = q.points || 1;
      maxScore += points;

      let isCorrect = false;
      let earnedPoints = 0;
      let feedback = '';

      if (q.type === 'mcq') {
        // MCQ: exact match
        if (typeof userAnswer === 'string' && userAnswer === q.correctAnswer) {
          isCorrect = true;
          earnedPoints = points;
        } else if (typeof userAnswer === 'number' && q.options?.[userAnswer] === q.correctAnswer) {
          isCorrect = true;
          earnedPoints = points;
        }
        feedback = isCorrect ? 'Correct!' : `Incorrect. The correct answer is: ${q.correctAnswer}`;
      } else if (q.type === 'short' || q.type === 'programming') {
        // For short answer and programming, use AI to evaluate
        try {
          const groq = getGroq();
          if (groq && userAnswer && String(userAnswer).trim()) {
            const evalPrompt = `You are grading a student's answer. 
Question: ${q.question}
Expected Answer: ${q.correctAnswer}
Student's Answer: ${userAnswer}

Evaluate the student's answer and return STRICT JSON:
{
  "score": number (0 to ${points}, can be partial credit),
  "feedback": "string (brief explanation of the grade)"
}

Be fair but strict. Award partial credit for partially correct answers.`;

            const evalResponse = await groq.chat.completions.create({
              messages: [{ role: 'user', content: evalPrompt }],
              model: 'llama-3.3-70b-versatile',
              response_format: { type: 'json_object' }
            });

            const evalResult = JSON.parse(evalResponse.choices[0]?.message?.content || '{}');
            earnedPoints = Math.min(Math.max(0, evalResult.score || 0), points);
            feedback = evalResult.feedback || 'Answer evaluated';
            isCorrect = earnedPoints >= points * 0.7; // 70% threshold for "correct"
          } else {
            feedback = 'Answer not provided or AI evaluation unavailable';
          }
        } catch (err) {
          console.error('[Quiz Submit] AI evaluation error:', err);
          feedback = 'Could not evaluate answer automatically';
        }
      }

      totalScore += earnedPoints;
      results.push({
        questionIndex: i,
        isCorrect,
        earnedPoints,
        maxPoints: points,
        feedback,
        explanation: q.explanation
      });
    }

    const doc = {
      userId: user._id,
      courseId: String(courseId),
      moduleId: String(moduleId),
      quizId: String(quizId),
      total: questions.length,
      score: totalScore,
      maxScore,
      percentage: maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0,
      results,
      createdAt: new Date(),
    };
    await db.collection('quiz_attempts').insertOne(doc);

    return res.json({
      result: {
        score: totalScore,
        maxScore,
        total: questions.length,
        percentage: doc.percentage,
        results
      }
    });
  } catch (e) {
    console.error('Submit quiz error:', e);
    return res.status(500).json({ error: 'Failed to submit quiz' });
  }
});

// --- Exercise Generation & Savings ---

app.post('/api/exercises/generate', async (req, res) => {
  try {
    const user = await getUserFromAuth(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const { courseId, moduleId, topic, materialId } = req.body || {};
    if (!courseId || !moduleId || !topic) {
      return res.status(400).json({ error: 'Missing courseId, moduleId or topic' });
    }

    // Fetch Course and Module for better context
    let courseTitle = '';
    let moduleTitle = '';
    try {
      const or = [{ id: String(courseId) }];
      try { or.push({ _id: new ObjectId(courseId) }); } catch { }
      const course = await db.collection('courses').findOne({ $or: or });
      if (course) {
        courseTitle = course.title || '';
        const mod = course.modules?.find(m => m.id === moduleId);
        if (mod) moduleTitle = mod.title || '';
      }
    } catch (err) {
      console.error('[Exercise Gen] Error fetching course/module meta:', err);
    }

    // Fetch PDF context if available
    let pdfContext = '';
    try {
      if (materialId) {
        console.log('[Exercise Gen] Attempting to extract PDF content for materialId:', materialId);
        let oid;
        try { oid = new ObjectId(materialId); } catch { }

        const or = [{ id: String(materialId) }, { materialId: String(materialId) }];
        if (oid) {
          or.push({ _id: oid });
          or.push({ fileId: oid });
        }

        let material = await db.collection('materials').findOne({ $or: or });

        // Fallback: If no material record found, check if materialId is a direct GridFS file ID
        if (!material && oid) {
          console.log('[Exercise Gen] No material document found, checking GridFS directly for fileId:', materialId);
          const gridFile = await db.collection('materials.files').findOne({ _id: oid });
          if (gridFile) {
            console.log('[Exercise Gen] Found direct GridFS file match');
            material = { fileId: oid };
          }
        }

        if (material && material.fileId) {
          const downloadStream = materialsBucket.openDownloadStream(new ObjectId(material.fileId));
          const chunks = [];
          for await (const chunk of downloadStream) chunks.push(chunk);
          const buffer = Buffer.concat(chunks);
          const pdfParser = await getPdfParser();
          if (pdfParser) {
            const pdfData = await pdfParser(buffer);
            pdfContext = pdfData.text || '';
            console.log('[Exercise Gen] Successfully extracted', pdfContext.length, 'characters from PDF');
          }
        } else {
          console.warn('[Exercise Gen] Exhausted all lookups. Material not found in DB or GridFS:', materialId);
        }
      }
    } catch (err) {
      console.error('[Exercise Gen] Error reading PDF:', err);
    }

    const groq = getGroq();
    if (!groq) return res.status(500).json({ error: 'AI service not configured' });

    const contextSection = pdfContext
      ? `\n\nCRITICAL MATERIAL CONTENT FROM THE LECTURE PDF:\n${pdfContext.slice(0, 15000)}\n\nTHE EXERCISE MUST BE STRICTLY BASED ON THE TECHNICAL CONCEPTS, CODE EXAMPLES, OR METHODOLOGIES DEFINED IN THE ABOVE PDF TEXT. DO NOT SUGGEST GENERIC TASKS UNLESS THEY ARE DIRECTLY RELEVANT TO THIS CONTENT.`
      : '\n\nNo PDF content available. Design a highly relevant exercise based on the topic and course context.';

    const prompt = `You are an elite industry-leading software engineer and educator. Your goal is to design a high-impact "CV-Enhancer" mini-project.

Course: "${courseTitle}"
Module: "${moduleTitle}"
Lecture Topic: "${topic}"

${contextSection}

INSTRUCTIONS:
1. Design a practical, hands-on project that a student can complete in 2-4 hours.
2. The project MUST prove mastery of the specific technical details provided in the PDF context above. 
3. If the PDF contains code snippets, architectural patterns, or specific libraries, the exercise MUST require their use.
4. Avoid common placeholder projects (like "Todo List" or "Clock") unless the PDF specifically covers building one.
5. Provide a "Portfolio Tip" on how to describe this accomplishment effectively on a Resume or GitHub profile.

Return ONLY a STRICT JSON object:
{
  "title": "A compelling, unique industry-style project name",
  "description": "Clear explanation of the goal and technical significance",
  "requirements": ["Requirement 1 (specific technical task)", "Requirement 2 (another specific task)", ...],
  "learningObjectives": ["The specific core skill being learned", "Another key takeaway", ...],
  "portfolioTip": "A professional snippet for a resume/CV summarizing the achievement"
}

NO markdown syntax. ONLY the JSON object.`;

    const chatCompletion = await groq.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      model: 'llama-3.3-70b-versatile',
      response_format: { type: 'json_object' }
    });

    const exercise = JSON.parse(chatCompletion.choices[0]?.message?.content || '{}');
    console.log('[Exercise Gen] Successfully generated exercise:', exercise.title);
    return res.json({ exercise });
  } catch (e) {
    console.error('Generate exercise error:', e);
    return res.status(500).json({ error: 'Failed to generate exercise' });
  }
});

app.post('/api/exercises/save', async (req, res) => {
  try {
    const user = await getUserFromAuth(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const { courseId, moduleId, topic, exercise } = req.body || {};
    if (!exercise) return res.status(400).json({ error: 'Exercise data required' });

    const doc = {
      userId: user._id.toString(),
      courseId,
      moduleId,
      topic,
      ...exercise,
      status: 'saved',
      createdAt: new Date()
    };

    await db.collection('saved_exercises').insertOne(doc);
    return res.json({ success: true });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to save exercise' });
  }
});

app.get('/api/exercises', async (req, res) => {
  try {
    const user = await getUserFromAuth(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    const list = await db.collection('saved_exercises').find({ userId: user._id.toString() }).sort({ createdAt: -1 }).toArray();
    const sanitized = list.map(ex => ({ ...ex, _id: ex._id.toString() }));
    return res.json({ exercises: sanitized });
  } catch {
    return res.status(500).json({ error: 'Failed to list exercises' });
  }
});

app.post('/api/exercises/:id/evaluate', async (req, res) => {
  try {
    const user = await getUserFromAuth(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const { id } = req.params;
    const { solution } = req.body || {};
    if (!solution) return res.status(400).json({ error: 'Solution required' });

    const exercise = await db.collection('saved_exercises').findOne({
      _id: new ObjectId(id),
      userId: user._id.toString()
    });
    if (!exercise) return res.status(404).json({ error: 'Exercise not found' });

    const groq = getGroq();
    if (!groq) return res.status(500).json({ error: 'AI service not configured' });

    const prompt = `You are an expert technical mentor. Evaluate the following student solution for the given exercise.

EXERCISE TITLE: "${exercise.title}"
EXERCISE DESCRIPTION: "${exercise.description}"
REQUIREMENTS:
${exercise.requirements.map(r => `- ${r}`).join('\n')}

STUDENT SOLUTION:
"""
${solution}
"""

YOUR TASK:
1. Check if the solution matches the exercise requirements.
2. Identify any mistakes, anti-patterns, or missing features.
3. Suggest specific improvements to fix the mistakes.
4. DO NOT provide the complete corrected code immediately; guide the student so they learn.
5. If the solution is just a copy-paste of the description or very low effort, call it out.
6. Return your evaluation in a supportive but rigorous tone.

Return STRICT JSON:
{
  "feedback": "string (markdown allowed)",
  "status": "graded",
  "score": number (0-100)
}

NO markdown outside JSON.`;

    const chatCompletion = await groq.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      model: 'llama-3.3-70b-versatile',
      response_format: { type: 'json_object' }
    });

    const evalResult = JSON.parse(chatCompletion.choices[0]?.message?.content || '{}');

    // Update the exercise in DB
    await db.collection('saved_exercises').updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          solution,
          feedback: evalResult.feedback,
          score: evalResult.score,
          status: 'graded',
          updatedAt: new Date()
        }
      }
    );

    return res.json({
      feedback: evalResult.feedback,
      score: evalResult.score,
      status: 'graded'
    });
  } catch (e) {
    console.error('Evaluate exercise error:', e);
    return res.status(500).json({ error: 'Failed to evaluate exercise' });
  }
});

app.delete('/api/exercises/:id', async (req, res) => {
  try {
    const user = await getUserFromAuth(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const { id } = req.params;
    const result = await db.collection('saved_exercises').deleteOne({
      _id: new ObjectId(id),
      userId: user._id.toString()
    });

    if (result.deletedCount === 0) return res.status(404).json({ error: 'Exercise not found' });
    return res.json({ success: true });
  } catch (e) {
    console.error('Delete exercise error:', e);
    return res.status(500).json({ error: 'Failed to delete exercise' });
  }
});

// Summary of attempts per course for current user
app.get('/api/quizzes/attempts/summary', async (req, res) => {
  try {
    const user = await getUserFromAuth(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    const aggr = await db.collection('quiz_attempts').aggregate([
      { $match: { userId: user._id } },
      { $group: { _id: '$courseId', count: { $sum: 1 } } },
    ]).toArray();
    const byCourse = {};
    aggr.forEach(r => { byCourse[String(r._id)] = r.count; });
    return res.json({ attemptsByCourse: byCourse });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to get attempts' });
  }
});

function startServer(port) {
  const srv = app.listen(port, () => console.log(`Auth server listening on http://localhost:${port}`));
  // WebSocket: Class Chat
  try {
    const wss = new WebSocketServer({ server: srv, path: '/ws/class' });
    wss.on('error', (err) => console.warn('WebSocket server error:', err?.message));
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
        } catch { }
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
