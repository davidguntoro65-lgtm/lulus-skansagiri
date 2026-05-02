/**
 * app.js — cPanel Phusion Passenger entry point
 *
 * Phusion Passenger starts the Node.js app by running: node app.js
 * This file is the single entry point for production deployments on:
 *   - cPanel with Phusion Passenger (Node.js App)
 *   - Any VPS / PM2 / systemd setup that needs a plain `node app.js` start
 *
 * For Replit dev:   npm run dev   → runs tsx server/index.ts directly (no build needed)
 * For Replit prod:  npm run start → also runs this file via the build output
 * For cPanel:       Passenger calls `node app.js` automatically after deployment
 *
 * IMPORTANT: Run `npm run build` before starting this file in production.
 * The compiled server is expected at: dist/server.mjs
 * The compiled frontend is expected at: dist/public/
 */

// Set NODE_ENV before anything else so the server boots in production mode.
// Phusion Passenger may or may not set this — we default to production.
if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = 'production';
}

// ESM top-level await: dynamically import the compiled server bundle.
// Dynamic import is used so process.env.NODE_ENV is set first.
await import('./dist/server.mjs');
