import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { detectorSnapshot } from './detector-snapshot.mjs';

const base = process.argv[2] || 'http://127.0.0.1:5173/';
const port = process.argv[3] || '9223';
const output = process.argv[4];
if (typeof WebSocket === 'undefined') throw new Error('The browser benchmark requires Node.js 22+ with built-in WebSocket support.');
const holdout = process.argv.includes('--holdout');
const full = !process.argv.includes('--quick') && (process.argv.includes('--full') || holdout);
const notes = process.argv.includes('--notes');
const selectedCases = process.argv.find(arg => arg.startsWith('--cases='))?.slice('--cases='.length).split(',').filter(Boolean) ?? [];
const requestedBaseline = process.argv.find(arg => arg.startsWith('--baseline='))?.slice('--baseline='.length);
if (requestedBaseline && !/^[0-9a-f]{7,40}$/i.test(requestedBaseline)) throw new Error('Baseline must be a commit hash.');
const baselineRef = requestedBaseline ?? (notes ? 'bbb8fdbc228ee773b7f333a08bb7903181232a1d' : 'ae8a29f05a9821fa268b0c9eebe07b3a30f4b205');
const snapshot = detectorSnapshot(baselineRef);
const baselineJs = snapshot.js;
const sourceHash = createHash('sha256').update(await readFile(new URL('../src/detection/engine.ts', import.meta.url))).digest('hex');
const provenance = Object.fromEntries(await Promise.all([
  '../src/detection/engine.ts', '../src/detection/harmonicChroma.ts', '../src/detection/inputHealth.ts',
  '../src/detection/chordNoteEvidence.ts',
  '../src/main.ts', notes ? './note-recordings.ts' : './detector-recordings.ts', '../public/audio/musicca-guitar/SOURCE.json',
  '../src/audio/guitarSamples.ts', ...(notes ? ['../src/detection/notePitch.ts'] : []),
].map(async path => [path, createHash('sha256').update(await readFile(new URL(path, import.meta.url))).digest('hex')])));
const endpoint = `http://127.0.0.1:${port}`;
const target = await (await fetch(`${endpoint}/json/new?about:blank`, { method: 'PUT' })).json();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
let id = 0; const pending = new Map();
ws.onmessage = event => {
  const message = JSON.parse(event.data), request = pending.get(message.id);
  if (request) { pending.delete(message.id); message.error ? request.reject(message.error) : request.resolve(message.result); }
};
ws.onclose = () => { for (const request of pending.values()) request.reject(new Error('Benchmark browser connection closed.')); pending.clear(); };
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const key = ++id; pending.set(key, { resolve, reject }); ws.send(JSON.stringify({ id: key, method, params }));
});
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result.value;
}
try {
  await send('Page.enable'); await send('Runtime.enable');
  await send('Network.enable');
  await send('Network.setBypassServiceWorker', { bypass: true });
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `{
    const Socket = window.WebSocket;
    window.WebSocket = class extends Socket {
      constructor(...args) {
        super(...args);
        this.addEventListener('message', event => {
          if (typeof event.data !== 'string') return;
          let message; try { message = JSON.parse(event.data); } catch { return; }
          if (message.type === 'full-reload' || message.type === 'update') event.stopImmediatePropagation();
        });
      }
    };
  }` });
  await send('Page.navigate', { url: new URL('scripts/detector-benchmark.html', base).href });
  const runner = notes ? 'runNoteBenchmark' : 'runDetectorBenchmark';
  for (let i = 0; i < 100 && !await evaluate(`!!window.${runner}`); i++) await new Promise(resolve => setTimeout(resolve, 50));
  assert.equal(await evaluate(`!!window.${runner}`), true);
  await evaluate(`window.benchmarkDone=false; window.${runner}(${JSON.stringify(baselineJs)},${!full},${process.argv.includes('--negative')},${holdout},${process.argv.includes('--focus')},${JSON.stringify(selectedCases)}).then(result=>{window.benchmarkResult=result;window.benchmarkDone=true},error=>{window.benchmarkError=error.stack;window.benchmarkDone=true}); true`);
  for (let i = 0; i < 1200; i++) {
    if (i > 0 && !await evaluate('typeof window.benchmarkDone === "boolean"')) throw new Error('Benchmark page reloaded; rerun with stable source files.');
    if (await evaluate('window.benchmarkDone')) break;
    if (i % 10 === 0) console.log(await evaluate('window.benchmarkProgress || "Preparing recorded inputs"'));
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  const error = await evaluate('window.benchmarkError'); if (error) throw new Error(error);
  assert.equal(await evaluate('window.benchmarkDone'), true, 'Benchmark timed out');
  const result = { baselineRef: snapshot.revision, baselineProvenance: snapshot.hashes, currentSourceSha256: sourceHash, provenance, ...(await evaluate('window.benchmarkResult')) };
  if (output) await writeFile(output, JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify({ baseline: result.baseline, current: result.current, conditions: result.conditions }, null, 2));
} finally {
  await fetch(`${endpoint}/json/close/${target.id}`); ws.close();
}
