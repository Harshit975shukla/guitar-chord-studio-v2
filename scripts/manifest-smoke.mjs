// Run: node scripts/manifest-smoke.mjs — the install manifest must work under the GitHub Pages subpath.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

let checks = 0;
const check = (name, fn) => { fn(); checks++; console.log(`PASS ${name}`); };
const manifest = JSON.parse(readFileSync(new URL('../public/manifest.json', import.meta.url), 'utf8'));
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
// Resolve every URL as the browser does: relative to the manifest at the deployed subpath.
const MANIFEST_URL = 'https://example.github.io/guitar-chord-studio-v2/manifest.json';
const APP_ROOT = 'https://example.github.io/guitar-chord-studio-v2/';
const resolve = url => new URL(url, MANIFEST_URL).href;

check('start URL, scope and id stay inside the app folder', () => {
  for (const key of ['start_url', 'scope', 'id']) {
    assert.equal(typeof manifest[key], 'string', key);
    assert.ok(!manifest[key].startsWith('/'), `${key} must be relative, not site-root absolute`);
    assert.ok(resolve(manifest[key]).startsWith(APP_ROOT), `${key} resolves inside ${APP_ROOT}`);
  }
  assert.ok(resolve(manifest.start_url).startsWith(resolve(manifest.scope)), 'start_url is within scope');
});

check('install requirements: name, standalone display, 192 and 512 icons that exist', () => {
  assert.ok(manifest.name && manifest.short_name && manifest.short_name.length <= 12);
  assert.equal(manifest.display, 'standalone');
  for (const size of ['192x192', '512x512']) {
    const icon = manifest.icons.find(i => i.sizes === size);
    assert.ok(icon, `${size} icon listed`);
    assert.ok(resolve(icon.src).startsWith(APP_ROOT), `${size} icon resolves inside the app folder`);
    assert.ok(existsSync(new URL(`../public/${icon.src}`, import.meta.url)), `${icon.src} exists in public/`);
    assert.equal(icon.type, 'image/png');
    // Circular artwork: "maskable" would crop it on Android.
    assert.ok(!String(icon.purpose).includes('maskable'), `${size} is not declared maskable`);
  }
  for (const icon of manifest.icons) {
    const bytes = readFileSync(new URL(`../public/${icon.src}`, import.meta.url));
    assert.equal(bytes.toString('hex', 0, 8), '89504e470d0a1a0a', `${icon.src} is a PNG`);
    const [w, h] = icon.sizes.split('x').map(Number);
    assert.deepEqual([bytes.readUInt32BE(16), bytes.readUInt32BE(20)], [w, h], `${icon.src} really is ${icon.sizes}`);
  }
});

check('shortcuts, if any, point inside the app and to URLs the app handles', () => {
  for (const shortcut of manifest.shortcuts ?? []) {
    assert.ok(!shortcut.url.startsWith('/'), `${shortcut.name} is relative`);
    assert.ok(resolve(shortcut.url).startsWith(APP_ROOT));
    assert.ok(!shortcut.url.includes('?tab='), `${shortcut.name}: the app does not read ?tab= links`);
  }
});

check('the page links the manifest, touch icon and theme colour relatively', () => {
  assert.match(html, /<link rel="manifest" href="\.\/manifest\.json">/);
  assert.match(html, /<link rel="apple-touch-icon" href="\.\/icon-192\.png">/);
  const theme = html.match(/<meta name="theme-color" content="([^"]+)">/)?.[1];
  assert.equal(theme, manifest.theme_color, 'page and manifest theme colours match');
  assert.match(html, /navigator\.serviceWorker\.register\('\.\/sw\.js'\)/);
});

console.log(`\n${checks}/${checks} install manifest checks passed`);
