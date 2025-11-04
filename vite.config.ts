import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
        // Dev-only middleware
        configureServer(server) {
          // Proxy /api/auth to separate Express server on port 8765
          server.middlewares.use('/api/auth', async (req, res, next) => {
            const path = (req as any).originalUrl || req.url; // handle both stripped and full paths
            const target = `http://localhost:8765${path}`;
            try {
              const body = await new Promise<string>((resolve) => {
                let data = '';
                req.on('data', (c) => (data += c));
                req.on('end', () => resolve(data));
              });
              const proxyRes = await fetch(target, {
                method: req.method,
                headers: { 'Content-Type': 'application/json', ...(req.headers.authorization ? { Authorization: req.headers.authorization } : {}) },
                body: body || undefined,
              });
              const json = await proxyRes.text();
              res.statusCode = proxyRes.status;
              res.setHeader('Content-Type', 'application/json');
              res.end(json);
            } catch (e: any) {
              res.statusCode = 502;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: 'Auth server unavailable' }));
            }
          });
          server.middlewares.use('/api/generate-image', async (req, res) => {
            if (req.method !== 'POST') {
              res.statusCode = 405;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: 'Method not allowed' }));
              return;
            }

            try {
              const body = await new Promise<any>((resolve, reject) => {
                let data = '';
                req.on('data', (chunk) => (data += chunk));
                req.on('end', () => {
                  try { resolve(JSON.parse(data || '{}')); } catch (e) { reject(e); }
                });
                req.on('error', reject);
              });

              const prompt: string = body?.prompt || '';
              const size: string = body?.size || '1280x720';
              const model: string = body?.model || env.OPENROUTER_IMAGE_MODEL || 'flux/dev';

              if (!prompt) {
                res.statusCode = 400;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: 'Missing prompt' }));
                return;
              }

              const apiKey = env.OPENROUTER_API_KEY;
              if (!apiKey) {
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: 'Server missing OPENROUTER_API_KEY' }));
                return;
              }

              const headers: Record<string, string> = {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                // Recommended by OpenRouter
                'HTTP-Referer': env.APP_URL || 'http://localhost:3000',
                'X-Title': 'LumoAI',
              };

              const resp = await fetch('https://openrouter.ai/api/v1/images', {
                method: 'POST',
                headers,
                body: JSON.stringify({ model, prompt, size }),
              });

              const json = await resp.json();
              if (!resp.ok) {
                res.statusCode = resp.status || 502;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: json?.error || 'Image generation failed' }));
                return;
              }

              // OpenRouter Images API is OpenAI-compatible: { data: [{ url | b64_json }] }
              const first = json?.data?.[0];
              let url: string | undefined = first?.url;
              if (!url && first?.b64_json) {
                url = `data:image/png;base64,${first.b64_json}`;
              }

              if (!url) {
                res.statusCode = 502;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: 'No image URL returned' }));
                return;
              }

              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ url }));
            } catch (err: any) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: err?.message || 'Proxy error' }));
            }
          });
          // Pexels image search proxy (dev-only)
          server.middlewares.use('/api/pexels-search', async (req, res) => {
            if (req.method !== 'POST') {
              res.statusCode = 405;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: 'Method not allowed' }));
              return;
            }
            try {
              const body = await new Promise<any>((resolve, reject) => {
                let data = '';
                req.on('data', (chunk) => (data += chunk));
                req.on('end', () => {
                  try { resolve(JSON.parse(data || '{}')); } catch (e) { reject(e); }
                });
                req.on('error', reject);
              });

              const query: string = body?.query || '';
              if (!query) {
                res.statusCode = 400;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: 'Missing query' }));
                return;
              }

              const apiKey = env.PEXELS_API_KEY;
              if (!apiKey) {
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: 'Server missing PEXELS_API_KEY' }));
                return;
              }

              const url = new URL('https://api.pexels.com/v1/search');
              url.searchParams.set('query', query);
              url.searchParams.set('orientation', 'landscape');
              url.searchParams.set('size', 'large');
              url.searchParams.set('per_page', '1');

              const resp = await fetch(url.toString(), {
                headers: { Authorization: apiKey },
              });
              const json = await resp.json();
              if (!resp.ok) {
                res.statusCode = resp.status || 502;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: json?.error || 'Pexels search failed' }));
                return;
              }

              const photo = json?.photos?.[0];
              const urlOut = photo?.src?.landscape || photo?.src?.large2x || photo?.src?.large || photo?.src?.original;
              if (!urlOut) {
                res.statusCode = 404;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: 'No results' }));
                return;
              }

              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ url: urlOut }));
            } catch (err: any) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: err?.message || 'Proxy error' }));
            }
          });
        }
      },
      plugins: [react()],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.OPENROUTER_IMAGE_MODEL': JSON.stringify(env.OPENROUTER_IMAGE_MODEL || 'flux/dev')
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
