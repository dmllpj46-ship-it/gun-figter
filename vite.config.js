import { defineConfig } from 'vite';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const TYPESAFE_ENDPOINT = 'https://api.typesafe.ai/v1/systemone';

/** Read the TypeSafe key for local dev only. Never exposed to the client. */
function readJevKey() {
  if (process.env.TYPESAFE_API_KEY) return process.env.TYPESAFE_API_KEY;
  const candidates = [
    path.join(process.cwd(), '.env.jev'),
    path.join(os.homedir(), '.workbuddy', '.secrets', 'jev.env'),
    path.join(process.cwd(), '.env'),
  ];
  for (const file of candidates) {
    try {
      const raw = fs.readFileSync(file, 'utf8');
      const line = raw.split(/\r?\n/).find((l) => l.trim().startsWith('TYPESAFE_API_KEY='));
      if (line) return line.slice(line.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '');
    } catch { /* try next */ }
  }
  return null;
}

/** Dev-only stand-in for functions/api/jev.js so local runs behave like production. */
function jevDevProxy() {
  return {
    name: 'jev-dev-proxy',
    configureServer(server) {
      server.middlewares.use('/api/jev', async (req, res) => {
        const send = (code, body) => {
          res.statusCode = code;
          res.setHeader('content-type', 'application/json; charset=utf-8');
          res.end(JSON.stringify(body));
        };
        if (req.method !== 'POST') return send(405, { ok: false, error: 'method_not_allowed' });

        const key = readJevKey();
        if (!key) return send(503, { ok: false, error: 'no_api_key' });

        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        let payload;
        try {
          payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        } catch {
          return send(400, { ok: false, error: 'bad_json' });
        }

        const started = Date.now();
        try {
          const upstream = await fetch(TYPESAFE_ENDPOINT, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${key}`,
              'Content-Type': 'application/json',
              'User-Agent': 'duel-arena-dev/1.0',
            },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(12000),
          });
          const text = await upstream.text();
          let data;
          try { data = JSON.parse(text); } catch { return send(502, { ok: false, error: 'bad_upstream_json', detail: text.slice(0, 300) }); }
          if (!upstream.ok) return send(upstream.status, { ok: false, error: 'upstream_error', detail: data });
          return send(200, { ok: true, data, latencyMs: Date.now() - started });
        } catch (err) {
          return send(504, { ok: false, error: 'upstream_timeout', detail: String(err && err.message || err) });
        }
      });
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [jevDevProxy()],
  build: {
    target: 'es2020',
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
  },
  server: {
    port: 5173,
    host: '127.0.0.1',
  },
});
