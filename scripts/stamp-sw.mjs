/**
 * Post-build: stamp the service worker cache name with the built bundle hash so
 * each deploy automatically invalidates the old cache (no manual CACHE_NAME
 * bumps, no stale-bundle bugs). public/sw.js ships a __CACHE_VERSION__
 * placeholder; vite copies it to dist/sw.js, then this replaces the placeholder.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const indexPath = 'dist/index.html';
const swPath = 'dist/sw.js';

if (!existsSync(swPath)) {
  console.warn('[stamp-sw] dist/sw.js not found — skipping');
  process.exit(0);
}

let version = String(Date.now());
if (existsSync(indexPath)) {
  const html = readFileSync(indexPath, 'utf8');
  const m = html.match(/assets\/main-([A-Za-z0-9_-]+)\.js/);
  if (m) version = m[1];
}

let sw = readFileSync(swPath, 'utf8');
if (sw.includes('__CACHE_VERSION__')) {
  sw = sw.replaceAll('__CACHE_VERSION__', version);
  writeFileSync(swPath, sw);
  console.log(`[stamp-sw] cache version -> ${version}`);
} else {
  console.warn('[stamp-sw] no __CACHE_VERSION__ placeholder in dist/sw.js — left as-is');
}
