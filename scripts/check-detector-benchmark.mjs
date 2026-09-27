import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

if (process.argv.length < 3) throw new Error('Pass one or more detector benchmark JSON result files.');
for (const path of process.argv.slice(2)) {
  const result = JSON.parse(await readFile(path, 'utf8'));
  const { baseline, current } = result;
  const precision = value => value.correctFirst / Math.max(1, value.correctFirst + value.wrongFirst);
  assert.equal(baseline.chordCases, current.chordCases);
  assert.equal(baseline.negativeCases, current.negativeCases);
  assert.ok(current.correctFirst > baseline.correctFirst, 'Exact first-answer coverage must improve');
  assert.ok(precision(current) >= precision(baseline), 'Precision among answered chord cases must not decline');
  assert.ok(current.falsePositiveCases <= baseline.falsePositiveCases, 'Negative-input false positives must not increase');
  assert.ok(current.medianCorrectLatencyMs <= baseline.medianCorrectLatencyMs + 32, 'Median correct latency must stay within one DSP frame of baseline');
  assert.ok(result.conditions.clean.current.correctFirst >= result.conditions.clean.baseline.correctFirst, 'Clean-case correctness must not decline overall');
  console.log(`PASS ${path}: ${current.correctFirst}/${current.chordCases} correct first answers; ${(precision(current) * 100).toFixed(1)}% precision among answers; ${current.falsePositiveCases}/${current.negativeCases} negative-input false positives`);
}
