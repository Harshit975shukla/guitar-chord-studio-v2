import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { RHYTHM_PRESETS } from '../src/tabs/rhythm.ts';
import { DEFAULT_PERCUSSION_LEVELS, PERCUSSION_KITS, PERCUSSION_VOICES, PERCUSSION_CEILING,
  percussionHits, percussionLimiterCurve, renderPercussionVoice, validatePercussionLevels } from '../src/audio/percussion.ts';

let checks = 0;
const check = (name, fn) => { fn(); checks++; console.log(`PASS ${name}`); };
check('fifteen existing patterns and three original percussion grooves keep valid ordered pulses', () => {
  assert.equal(RHYTHM_PRESETS.length, 18);
  assert.equal(new Set(RHYTHM_PRESETS.map(p => p.id)).size, 18);
  assert.deepEqual(RHYTHM_PRESETS.find(p => p.id === 'keharwa').pattern.map(p => p.name), ['Dha', 'Ge', 'Na', 'Ti', 'Na', 'Ke', 'Dhi', 'Na']);
  for (const preset of RHYTHM_PRESETS) {
    assert.equal(preset.pattern.length, preset.beats);
    for (const stroke of preset.pattern) {
      assert.ok(stroke.vel > 0 && stroke.vel <= 1);
      for (const kit of Object.keys(PERCUSSION_KITS)) {
        assert.ok(percussionHits(stroke.type, kit).every(hit => Object.hasOwn(PERCUSSION_VOICES, hit.voice)));
      }
    }
  }
});
check('original tabla articulations remain distinct and instrument changes preserve low/high layering', () => {
  assert.deepEqual(percussionHits('bayan_dayan', 'original'), [{ voice: 'bayan', channel: 'bass' }, { voice: 'dayan_na', channel: 'treble' }]);
  assert.deepEqual(percussionHits('bayan_dayan', 'conga'), [{ voice: 'conga_low', channel: 'bass' }, { voice: 'conga_open', channel: 'treble' }]);
  assert.equal(percussionHits('dayan_tin', 'tabla')[0].voice, 'dayan_tin');
  assert.equal(percussionHits('dayan_ta', 'tabla')[0].voice, 'dayan_ta');
  assert.equal(percussionHits('shaker', 'drums')[0].voice, 'hihat');
  assert.equal(percussionHits('conga_slap', 'original')[0].voice, 'conga_slap');
});
check('all fifteen original voices are deterministic, finite, audible and click-safe at the endpoints', () => {
  for (const rate of [44100, 48000, 96000]) for (const voice of Object.keys(PERCUSSION_VOICES)) {
    const samples = renderPercussionVoice(voice, rate);
    assert.deepEqual(samples, renderPercussionVoice(voice, rate));
    assert.ok(samples.every(Number.isFinite)); assert.ok(samples[0] === 0 && samples.at(-1) === 0);
    let peak = 0, sum = 0, mean = 0;
    for (const s of samples) { peak = Math.max(peak, Math.abs(s)); sum += s * s; mean += s; }
    assert.ok(peak >= .7999 && peak <= .80001);
    assert.ok(Math.sqrt(sum / samples.length) > .035, voice);
    assert.ok(Math.abs(mean / samples.length) < .01, `DC bias: ${voice}`);
    assert.ok(samples.length <= rate * .66);
  }
});
check('tabla, congas, bongos, cajon and drum-kit voices are not reused copies of one tone', () => {
  const hashes = Object.keys(PERCUSSION_VOICES).map(voice => createHash('sha256').update(Buffer.from(renderPercussionVoice(voice, 48000).buffer)).digest('hex'));
  assert.equal(new Set(hashes).size, Object.keys(PERCUSSION_VOICES).length);
});
check('percussion soft limiter is symmetric, monotonic and bounded with unity small-signal slope', () => {
  const curve = percussionLimiterCurve();
  assert.equal(curve[2048], 0);
  for (let i = 1; i < curve.length; i++) {
    assert.ok(curve[i] >= curve[i - 1]);
    assert.ok(Math.abs(curve[i]) < PERCUSSION_CEILING);
    assert.ok(curve[i] === -curve[curve.length - 1 - i]);
  }
  // The bus's half gain is restored by the limiter slope near silence.
  assert.ok(Math.abs((curve[2049] - curve[2048]) * 2048 * .5 - 1) < .001);
});
check('volume supports mute and a bounded 150-percent boost without changing guitar settings', () => {
  assert.deepEqual(DEFAULT_PERCUSSION_LEVELS, { volume: 1, bass: .8, treble: .75 });
  for (const volume of [0, .5, 1, 1.5]) validatePercussionLevels({ volume, bass: .8, treble: .75 });
  for (const key of ['volume', 'bass', 'treble']) {
    for (const value of [-1, NaN, Infinity, 2]) assert.throws(() => validatePercussionLevels({ ...DEFAULT_PERCUSSION_LEVELS, [key]: value }), /must be between/);
  }
});
check('unknown instruments, strokes and invalid sample rates fail explicitly', () => {
  assert.throws(() => percussionHits('bayan', 'missing'), /Unknown percussion instrument/);
  assert.throws(() => percussionHits('missing', 'original'), /Unknown percussion stroke/);
  assert.throws(() => renderPercussionVoice('missing', 48000), /Unknown percussion voice/);
  for (const rate of [0, 4000, NaN, Infinity, 300000]) assert.throws(() => renderPercussionVoice('bayan', rate), /sample rate/);
});
console.log(`\n${checks}/${checks} percussion checks passed`);
