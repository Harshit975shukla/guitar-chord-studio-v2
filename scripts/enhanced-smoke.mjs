import assert from 'node:assert/strict';
import { Agreement, AudioWindow, chordFromNotes, decodeWindow } from '../src/detection/enhanced/core.ts';
import { WINDOW_SECONDS, DSP_VERSION } from '../src/detection/enhanced/types.ts';
import { DetectionEngine } from '../src/detection/engine.ts';
import { detectorSnapshot } from './detector-snapshot.mjs';

let checks = 0;
const test = (name, fn) => { fn(); checks++; console.log(`PASS ${name}`); };
const identity = label => ({ key: `chord:${label}`, label });
const frame = (at, overrides = {}) => ({
  at, attackAt: 1, attackId: 1, ready: true, signalPresent: true, clipped: false,
  fresh: true, identity: identity('Am'), ...overrides,
});
const ml = (chord = 'Am', overrides = {}) => ({
  chord, notes: [], inferenceMs: 200, evidenceStartOffset: 1.68, evidenceOffset: 1.74, evidenceEndOffset: 1.82,
  evidenceStart: 1.2, evidenceAt: 1.26, evidenceEnd: 1.32, receivedAt: 1.5, ...overrides,
});
test('exact chord decoding keeps Am, Am7, Amaj7 and Cmaj7 distinct without invented notes', () => {
  assert.equal(chordFromNotes([45,48,52]), 'Am');
  assert.equal(chordFromNotes([45,48,52,55]), 'Am7');
  assert.equal(chordFromNotes([45,49,52,56]), 'Amaj7');
  assert.equal(chordFromNotes([48,52,55,59]), 'Cmaj7');
  assert.equal(chordFromNotes([48,49,54]), null);
  assert.equal(chordFromNotes([45,57]), null);
  assert.throws(() => chordFromNotes([NaN]), /Invalid/);
});
test('raw microphone ring stays bounded and resets on interrupted timing', () => {
  for (const rate of [22050,44100,48000]) {
    const ring = new AudioWindow(rate), n = Math.round(rate * WINDOW_SECONDS);
    const data = Float32Array.from({ length: n }, (_, i) => i / n);
    ring.push(data, n/rate); assert.equal(ring.ready, true); assert.deepEqual(ring.snapshot(), data);
    ring.push(new Float32Array([.1,.2]), (n+2)/rate);
    assert.ok(Math.abs(ring.snapshot()[0]-2/n)<1e-6);
    assert.equal(ring.push(new Float32Array(1024), 10), true); assert.equal(ring.ready, false);
    ring.clear(); assert.equal(ring.count,0);
  }
});
test('the model reads recent stable notes, not the old dominant chord or a one-frame seventh', () => {
  const frames = Array.from({length:172},()=>Array(88).fill(0));
  for(let i=0;i<100;i++)for(const midi of [48,52,55,59])frames[i][midi-21]=.9;
  for(let i=145;i<157;i++)for(const midi of [45,48,52])frames[i][midi-21]=.9;
  frames[156][55-21]=.9;
  assert.equal(decodeWindow(frames).chord,'Am');
  assert.deepEqual(decodeWindow(frames).notes.map(n=>n.midi),[45,48,52]);
  assert.throws(()=>decodeWindow([]),/Unexpected/);
});
test('onset-backed weak thirds refine power guesses but never overwrite a complete chord', () => {
  const frames=Array.from({length:172},()=>Array(88).fill(0));
  for(let i=145;i<157;i++)for(const midi of [45,52])frames[i][midi-21]=.9;
  const events=[45,52,60].map(pitchMidi=>({pitchMidi,startFrame:130,durationFrames:40}));
  assert.equal(decodeWindow(frames).chord,'A5');
  assert.equal(decodeWindow(frames,events).chord,'Am');
  for(let i=145;i<157;i++)frames[i][60-21]=.9;
  assert.equal(decodeWindow(frames,[...events,{pitchMidi:55,startFrame:130,durationFrames:40}]).chord,'Am');
});
test('agreement and alternatives require the same fresh performance', () => {
  const c=new Agreement(); c.observe(frame(1.1));c.update(ml());c.observe(frame(1.5,{fresh:false}));
  assert.equal(c.compare(1.5).state,'agree');assert.equal(c.compare(1.5).label,'Am');
  c.update(ml('Am7',{evidenceStart:1.25,evidenceAt:1.3,evidenceEnd:1.35,receivedAt:1.6}));
  c.observe(frame(1.6,{fresh:false}));
  assert.equal(c.compare(1.6).label,'Could be Am or Am7');
  assert.equal(c.compare(1.6).supported,false);
  c.observe(frame(1.7,{attackId:2,attackAt:1.7,fresh:false}));
  assert.notEqual(c.compare(1.7).state,'agree');
  assert.notEqual(c.compare(1.7).state,'different','old ML is not a candidate for a new attack');
});
test('silence, clipping, missing input and old held evidence never create fresh agreement', () => {
  for(const overrides of [{signalPresent:false},{clipped:true},{ready:false}]) {
    const c=new Agreement();c.observe(frame(1.1));c.update(ml());c.observe(frame(1.5,overrides));
    assert.equal(c.compare(1.5).supported,false);
  }
  const c=new Agreement();c.observe(frame(1.1));c.update(ml());c.observe(frame(3,{fresh:false}));
  assert.notEqual(c.compare(3).state,'agree');
});
test('recent harmony agreement is explicitly not a new performance confirmation', () => {
  const c=new Agreement();c.observe(frame(1.1));
  for(const at of [1.22,1.25,1.28,1.31]) c.observe(frame(at,{verified:{at,identity:identity('Am')}}));
  c.update(ml());c.observe(frame(1.5,{attackId:2,attackAt:1.5,fresh:false,verified:{at:1.45,identity:identity('Am')}}));
  assert.equal(c.compare(1.5).state,'recent');assert.equal(c.compare(1.5).supported,false);
  c.observe(frame(1.55,{identity:identity('C'),verified:{at:1.5,identity:identity('C')}}));
  assert.notEqual(c.compare(1.55).state,'recent');
});
const originalNow = Date.now;
Date.now = () => 10000;
try {
  const snapshot=detectorSnapshot(DSP_VERSION);
  const {DetectionEngine:Baseline}=await import('data:text/javascript;base64,'+Buffer.from(snapshot.js).toString('base64'));
  test('Standard production chord behavior matches the dated deployed baseline exactly', () => {
    const a=new DetectionEngine(),b=new Baseline();
    for(let root=0;root<12;root++)for(const tones of [[0,4,7],[0,3,7],[0,4,7,11],[0,3,7,10],[0,5,7],[0,7]]) {
      const chroma=new Float32Array(12);tones.forEach(i=>{chroma[(root+i)%12]=.85;});chroma[root]=1;
      for(const faint of [0,.25,.55,.75]) {
        const input=chroma.slice();input[(root+10)%12]+=faint;
        assert.deepEqual(a.processChord(input,[]),b.processChord(input,[]));
      }
    }
  });
} finally {Date.now=originalNow;}
console.log(`\n${checks}/${checks} enhanced/default-detector checks passed`);
