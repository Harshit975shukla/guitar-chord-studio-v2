import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { TrainingTake, encodeWave, trainingPackage, TAKE_LIMIT_SECONDS } from '../src/audio/trainingTake.ts';

const setup = {intendedChord:'Am7',instrument:'steel',tuning:[64,59,55,50,45,40],capo:0,engines:{standard:'74340ba',enhanced:null,app:'test'},
  detection:{target:'chords',trigger:'guitartuna',sensitivity:4,noiseGateDb:18,seventhStrictness:.55}};
let checks=0;
const test=async(name,fn)=>{await fn();checks++;console.log(`PASS ${name}`);};
await test('capture cannot start without separate recording and training-use permissions',()=>{
  for(const [record,train] of [[false,false],[true,false],[false,true]])assert.throws(()=>new TrainingTake(44100,setup,record,train),/permissions/);
  assert.throws(()=>new TrainingTake(44100,{...setup,capo:-1},true,true),/valid/);
  assert.throws(()=>new TrainingTake(44100,{...setup,tuning:[NaN,59,55,50,45,40]},true,true),/valid/);
});
await test('a take is bounded, raw audio is preserved, and predictions before the take are excluded',async()=>{
  const take=new TrainingTake(8000,setup,true,true);
  take.push(new Float32Array(8000),11);
  take.addPrediction({at:10.5,evidenceAt:9.9,engine:'standard',label:'Am7',freshness:'held'});
  take.addPrediction({at:11,evidenceAt:10.5,engine:'standard',label:'Am',freshness:'fresh'});
  const data=Float32Array.from({length:12*8000},(_,i)=>Math.sin(i/20)*.1);
  assert.equal(take.push(data,23),true);assert.equal(take.seconds,TAKE_LIMIT_SECONDS);
  const result=await take.finish();
  assert.equal(result.metadata.review.status,'unverified');assert.equal(result.metadata.review.verifiedChord,null);
  assert.equal(result.metadata.consent.upload,false);assert.equal(result.metadata.predictions.length,1);
  assert.equal(result.metadata.predictions[0].at,1);assert.equal(result.metadata.predictions[0].label,'Am');
  assert.equal(result.wav.length,44+TAKE_LIMIT_SECONDS*8000*2);
  assert.equal(new DataView(result.wav.buffer).getUint32(24,true),8000);
  assert.equal(result.metadata.audioSha256.length,64);
  take.discard();assert.equal(take.seconds,0);await assert.rejects(take.finish(),/too short/);
});
await test('interruptions, invalid samples and short takes fail rather than export misleading audio',async()=>{
  const take=new TrainingTake(44100,setup,true,true);take.push(new Float32Array(1024),1);
  assert.throws(()=>take.push(new Float32Array(1024),2),/interrupted/);
  assert.throws(()=>encodeWave(new Float32Array([NaN]),44100),/Invalid/);
  await assert.rejects(take.finish(),/too short/);
});
await test('the single-download ZIP contains a valid WAV plus honest unverified metadata',async()=>{
  const take=new TrainingTake(8000,setup,true,true);take.push(new Float32Array(8000).fill(1),1);
  const result=await take.finish(),zip=trainingPackage(result.wav,result.metadata),view=new DataView(zip.buffer),decode=new TextDecoder();
  assert.equal(result.metadata.quality.clippedSamples,8000);
  assert.ok(result.metadata.quality.flags.includes('Clipping detected'));
  let offset=0;const files={};
  while(view.getUint32(offset,true)===0x04034b50){
    const size=view.getUint32(offset+18,true),length=view.getUint16(offset+26,true),extra=view.getUint16(offset+28,true);
    const name=decode.decode(zip.subarray(offset+30,offset+30+length));
    const start=offset+30+length+extra;files[name]=zip.slice(start,start+size);offset=start+size;
  }
  assert.deepEqual(Object.keys(files),['microphone.wav','metadata.json']);
  assert.equal(decode.decode(files['microphone.wav'].subarray(0,4)),'RIFF');
  assert.equal(JSON.parse(decode.decode(files['metadata.json'])).intendedChord,'Am7');
  assert.equal(view.getUint32(zip.length-22,true),0x06054b50);
  assert.equal(view.getUint16(zip.length-12,true),2);
  take.discard();
});
await test('automatic website updates cannot discard a recording or retained training take',async()=>{
  const html=readFileSync('index.html','utf8');
  const registration=html.match(/<!-- Service Worker Registration -->\s*<script>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(registration,'Service-worker registration script is present');
  for(const state of [{recording:true,retainedTake:false},{recording:false,retainedTake:true},{recording:false,retainedTake:false}]){
    const handlers={};let reloads=0,notices=0;
    const worker={state:'installed',addEventListener:(type,callback)=>{handlers[type]=callback;}};
    const registrationObject={installing:worker,addEventListener:(type,callback)=>{handlers[type]=callback;}};
    runInNewContext(registration,{
      navigator:{serviceWorker:{controller:{},register:async()=>registrationObject}},
      window:{addEventListener:(type,callback)=>{handlers[type]=callback;},getListeningToolsState:()=>state,
        location:{reload:()=>reloads++},dispatchEvent:event=>{if(event.type==='guitar-update-pending')notices++;}},
      Event:class{constructor(type){this.type=type;}},console:{log(){},warn(){},error(){}},
    });
    await handlers.load();await Promise.resolve();
    handlers.updatefound();handlers.statechange();
    assert.equal(reloads,state.recording||state.retainedTake?0:1);
    assert.equal(notices,state.recording||state.retainedTake?1:0);
  }
});
console.log(`\n${checks}/${checks} training-take consent/export checks passed`);
