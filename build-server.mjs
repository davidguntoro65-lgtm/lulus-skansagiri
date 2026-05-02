/**
 * build-server.mjs
 *
 * Compiles the Express/TypeScript backend into a single ESM bundle at
 * dist/server.mjs. All npm packages are kept external (not inlined) so
 * node_modules must be present on the deployment server.
 *
 * Usage: node build-server.mjs
 * Called automatically by: npm run build
 */

import esbuild from 'esbuild';
import { existsSync, mkdirSync } from 'fs';

if (!existsSync('dist')) mkdirSync('dist', { recursive: true });

const result = await esbuild.build({
  entryPoints: ['server/index.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  outfile: 'dist/server.mjs',

  // Keep all npm packages external — they are resolved from node_modules at
  // runtime. This avoids bundling binary addons (pg-native, etc.).
  packages: 'external',

  // Inline source maps into the bundle for readable stack traces in logs.
  sourcemap: 'inline',

  // Suppress the "bundle is an ESM file" warning for dynamic require() calls
  // that may appear in transitive CJS dependencies.
  logLevel: 'info',
});

if (result.errors.length > 0) {
  console.error('[build-server] ❌ Build failed with errors:');
  result.errors.forEach((e) => console.error(' ', e.text));
  process.exit(1);
}

console.log('[build-server] ✅  dist/server.mjs compiled successfully.');
