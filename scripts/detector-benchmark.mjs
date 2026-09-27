import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import ts from 'typescript';

const base = process.argv[2] || 'http://127.0.0.1:5173/';
const port = process.argv[3] || '9223';
const output = process.argv[4];
if (typeof WebSocket === 'undefined') throw new Error('The browser benchmark requires Node.js 22+ with built-in WebSocket support.');
const holdout = process.argv.includes('--holdout');
const full = process.argv.includes('--full') || holdout;
const baselineRef = 'ae8a29f05a9821fa268b0c9eebe07b3a30f4b205';
const baseline = execFileSync('git', ['show', `${baselineRef}:src/detection/engine.ts`], { encoding: 'utf8' });
const baselineJs = ts.transpileModule(baseline, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
  .replace(/from ['"]\.\.\/types['"]/, `from '${new URL('src/types/index.ts', base).href}'`);
const sourceHash = createHash('sha256').update(await readFile(new URL('../src/detection/engine.ts', import.meta.url))).digest('hex');
const provenance = Object.fromEntries(await Promise.all([
  '../src/detection/engine.ts', '../src/detection/harmonicChroma.ts', '../src/detection/inputHealth.ts',
  '../src/main.ts', './detector-recordings.ts', '../public/audio/musicca-guitar/SOURCE.json',
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
  await send('Page.navigate', { url: new URL('scripts/detector-benchmark.html', base).href });
  for (let i = 0; i < 100 && !await evaluate('!!window.runDetectorBenchmark'); i++) await new Promise(resolve => setTimeout(resolve, 50));
  assert.equal(await evaluate('!!window.runDetectorBenchmark'), true);
  await evaluate(`window.benchmarkDone=false; window.runDetectorBenchmark(${JSON.stringify(baselineJs)},${!full},${process.argv.includes('--negative')},${holdout}).then(result=>{window.benchmarkResult=result;window.benchmarkDone=true},error=>{window.benchmarkError=error.stack;window.benchmarkDone=true}); true`);
  for (let i = 0; i < 1200; i++) {
    if (await evaluate('window.benchmarkDone')) break;
    if (i % 10 === 0) console.log(await evaluate('window.benchmarkProgress || "Preparing recorded inputs"'));
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  const error = await evaluate('window.benchmarkError'); if (error) throw new Error(error);
  assert.equal(await evaluate('window.benchmarkDone'), true, 'Benchmark timed out');
  const result = { baselineRef, currentSourceSha256: sourceHash, provenance, ...(await evaluate('window.benchmarkResult')) };
  if (output) await writeFile(output, JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify({ baseline: result.baseline, current: result.current, conditions: result.conditions }, null, 2));
} finally {
  await fetch(`${endpoint}/json/close/${target.id}`); ws.close();
}
