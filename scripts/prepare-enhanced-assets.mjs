import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const version = 'basic-pitch-1.0.1-tfjs-3.21.0';
const destination = resolve(root, 'public', 'ml', version);
const files = [
  ['@spotify/basic-pitch', 'model/model.json', 'model.json'],
  ['@spotify/basic-pitch', 'model/group1-shard1of1.bin', 'group1-shard1of1.bin'],
  ['@spotify/basic-pitch', 'LICENSE', 'LICENSE-basic-pitch.txt'],
  ...['tfjs-backend-wasm.wasm', 'tfjs-backend-wasm-simd.wasm', 'tfjs-backend-wasm-threaded-simd.wasm']
    .map(file => ['@tensorflow/tfjs-backend-wasm', `dist/${file}`, file]),
];
for (const [name, expected] of [['@spotify/basic-pitch', '1.0.1'], ['@tensorflow/tfjs', '3.21.0'], ['@tensorflow/tfjs-backend-wasm', '3.21.0']]) {
  const installed = JSON.parse(readFileSync(resolve(root, 'node_modules', name, 'package.json')));
  if (installed.version !== expected) throw new Error(`Unexpected ${name} version ${installed.version}; expected ${expected}.`);
}
const assets = files.map(([pkg, source, output]) => {
  const input = resolve(root, 'node_modules', pkg, source), path = resolve(destination, output);
  mkdirSync(dirname(path), { recursive: true }); copyFileSync(input, path);
  const bytes = readFileSync(path);
  return { file: output, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
});
writeFileSync(resolve(destination, 'SOURCE.json'), JSON.stringify({
  version, model: '@spotify/basic-pitch@1.0.1', runtime: '@tensorflow/tfjs@3.21.0',
  licence: 'Apache-2.0', source: 'https://github.com/spotify/basic-pitch-ts', assets,
  note: 'On-device optional inference. Model/runtime files are served from this site, not fetched from an external inference API.',
}, null, 2) + '\n');
writeFileSync(resolve(destination, 'NOTICE.txt'),
  'Basic Pitch: Copyright 2022 Spotify AB. https://github.com/spotify/basic-pitch-ts\n' +
  'TensorFlow.js and its WebAssembly backend: Copyright Google LLC. https://github.com/tensorflow/tfjs\n' +
  'Both are distributed under Apache License 2.0. A copy is included in LICENSE-basic-pitch.txt.\n' +
  'Model weights are unmodified; local chord post-processing is part of Guitar Studio.\n');
console.log(`[enhanced-assets] staged ${assets.length} pinned assets (${assets.reduce((sum, file) => sum + file.bytes, 0)} bytes)`);
