import 'dotenv/config';
import express from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs';
import { buildApiRouter } from './routes.js';

const PORT = Number(process.env.PORT ?? 5000);
const HOST = '0.0.0.0';
const isDev = process.env.NODE_ENV !== 'production';

// ── Filesystem error logger ───────────────────────────────────────────────────
// Writes timestamped errors to logs/stderr.log so cPanel / VPS operators can
// diagnose startup failures without a live terminal session.
const LOG_DIR = path.resolve(process.cwd(), 'logs');
const LOG_FILE = path.join(LOG_DIR, 'stderr.log');

function ensureLogDir() {
  try {
    if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
  } catch { /* best-effort */ }
}

function writeLog(level: 'ERROR' | 'WARN', message: string, detail?: unknown) {
  ensureLogDir();
  const ts = new Date().toISOString();
  const extra = detail
    ? '\n  ' + (detail instanceof Error
        ? `${detail.message}\n  ${detail.stack ?? ''}`
        : String(detail))
    : '';
  const line = `[${ts}] [${level}] ${message}${extra}\n`;
  try { fs.appendFileSync(LOG_FILE, line); } catch { /* best-effort */ }
  if (level === 'ERROR') console.error(line.trimEnd());
  else console.warn(line.trimEnd());
}

process.on('uncaughtException', (err) => {
  writeLog('ERROR', 'Uncaught exception — process will exit', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  writeLog('ERROR', 'Unhandled promise rejection', reason);
});
// ────────────────────────────────────────────────────────────────────────────

// ── Production security check ────────────────────────────────────────────────
if (!isDev && !process.env.DEPLOY_TOKEN) {
  const msg =
    'DEPLOY_TOKEN is not set. /api/deploy/setup will accept the admin ' +
    'password as a token. Set DEPLOY_TOKEN in Replit Secrets or .env.';
  writeLog('WARN', msg);
  console.warn('\n⚠️  [security]', msg, '\n');
}
// ────────────────────────────────────────────────────────────────────────────

async function start() {
  const app = express();

  // Serve uploaded files (logos, principal photos, gallery photos).
  // API returns relative paths like "branding/foo.png" → /uploads/branding/foo.png
  const uploadRoot = path.resolve(process.cwd(), 'server', 'uploads');
  if (!fs.existsSync(uploadRoot)) fs.mkdirSync(uploadRoot, { recursive: true });
  app.use('/uploads', express.static(uploadRoot, { maxAge: '7d' }));

  // Mount the entire JSON API.
  app.use('/api', buildApiRouter());

  const httpServer = http.createServer(app);

  if (isDev) {
    // Vite in middleware mode — single port, single process, full HMR.
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: { server: httpServer },
        allowedHosts: true,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // Production: serve the pre-built SPA from dist/public.
    // Vite is configured to output there (vite.config.ts → build.outDir).
    const distPublic = path.resolve(process.cwd(), 'dist', 'public');
    if (!fs.existsSync(distPublic)) {
      writeLog('ERROR', `dist/public not found at ${distPublic}. Run 'npm run build' first.`);
      throw new Error(`dist/public not found. Run 'npm run build' first.`);
    }
    app.use(express.static(distPublic, { maxAge: '1d' }));
    // SPA fallback — all unknown routes return index.html so client-side
    // routing (e.g. /panel-admin) works correctly.
    app.get('*', (_req, res) => res.sendFile(path.join(distPublic, 'index.html')));
  }

  httpServer.listen(PORT, HOST, () => {
    const appUrl = process.env.APP_URL || `http://${HOST}:${PORT}`;
    console.log(`[server] ready on http://${HOST}:${PORT} (APP_URL=${appUrl})`);
    writeLog('WARN', `Server started — port=${PORT} env=${process.env.NODE_ENV ?? 'development'}`);
  });
}

start().catch((err) => {
  writeLog('ERROR', 'Fatal startup error', err);
  process.exit(1);
});
