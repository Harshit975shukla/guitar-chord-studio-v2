import assert from 'node:assert/strict';
import { loopFrames, makeLoopBuffer, MAX_JAM_SECONDS } from '../src/audio/jamLoop.ts';
import { FastDetectionPreview } from '../src/detection/fastPreview.ts';

let checks = 0;
const check = (name, fn) => { fn(); checks++; console.log(`PASS ${name}`); };
check('loop range preserves exact sample count and rejects invalid bounds', () => {
  assert.deepEqual(loopFrames(.25, 1.25, 48000, 96000), { first: 12000, last: 60000 });
  for (const [start, end] of [[-1,1],[1,1],[2,1],[0,.01],[0,3],[NaN,1]]) assert.throws(() => loopFrames(start,end,48000,96000));
  assert.equal(MAX_JAM_SECONDS,120);
});
check('loop edges fade without shortening the loop or modifying the original take', () => {
  const original = new Float32Array(2000).fill(.5);
  const recording = { length:2000, sampleRate:1000, duration:2, numberOfChannels:1, getChannelData:()=>original };
  const context = { createBuffer(channels,length,rate) { const data=new Float32Array(length);return {numberOfChannels:channels,length,sampleRate:rate,duration:length/rate,getChannelData:()=>data}; } };
  const loop=makeLoopBuffer(context,recording,.25,1.25);
  assert.equal(loop.length,1000);assert.equal(loop.duration,1);
  assert.equal(loop.getChannelData(0)[0],0);assert.equal(loop.getChannelData(0).at(-1),0);
  assert.equal(loop.getChannelData(0)[100],.5);assert.ok(original.every(value=>value===.5));
});
check('fast preview is opt-in, uses its own analyser and does not mutate the connected source', () => {
  let connections=0,disconnections=0,created=0;const outputs=[];
  const context={sampleRate:48000,createAnalyser(){created++;return {context,fftSize:2048,frequencyBinCount:2048,smoothingTimeConstant:.1,disconnect(){},getFloatFrequencyData(data){data.fill(-120)},getFloatTimeDomainData(data){data.fill(0)}}}};
  const source={context,connect(){connections++},disconnect(){disconnections++}};
  const preview=new FastDetectionPreview(value=>outputs.push(value));
  preview.setEnabled(false,source);preview.tick(100,[]);assert.equal(created,0);
  preview.configure({targetMode:'notes'});preview.setEnabled(true,source);
  assert.equal(created,2);assert.equal(connections,2);assert.equal(preview.analyser.fftSize,4096);assert.equal(preview.noteAnalyser.fftSize,2048);
  preview.setVisible(false);const before=outputs.length;preview.tick(1000,[]);assert.equal(outputs.length,before);
  preview.setEnabled(false);assert.equal(disconnections,2);assert.equal(preview.analyser,null);
});
console.log(`\n${checks}/${checks} backing-loop and preview checks passed`);
