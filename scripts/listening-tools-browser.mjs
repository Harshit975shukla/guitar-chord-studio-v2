import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Uses an existing CDP browser and, optionally, an already licensed isolated C-chord recording.
const url = process.argv[2] || 'http://127.0.0.1:5173/';
const endpoint = `http://127.0.0.1:${process.argv[3] || '9225'}`;
const target = await (await fetch(`${endpoint}/json/new?about:blank`, { method:'PUT' })).json();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
let id=0,checks=0;
const pending=new Map(),errors=[],requests=[];
ws.onmessage=event=>{
  const message=JSON.parse(event.data);
  if(message.method==='Runtime.exceptionThrown')errors.push(message.params.exceptionDetails.exception?.description||message.params.exceptionDetails.text);
  if(message.method==='Network.requestWillBeSent')requests.push(message.params.request);
  if(message.method==='Target.attachedToTarget'){
    const session=message.params.sessionId;
    void (async()=>{await send('Network.enable',{},session);await send('Runtime.enable',{},session);await send('Runtime.runIfWaitingForDebugger',{},session);})().catch(error=>errors.push(error.message));
  }
  const job=pending.get(message.id);
  if(job){clearTimeout(job.timer);pending.delete(message.id);message.error?job.reject(new Error(JSON.stringify(message.error))):job.resolve(message.result);}
};
function send(method,params={},sessionId){
  return new Promise((resolve,reject)=>{
    const request=++id;
    const timer=setTimeout(()=>{pending.delete(request);reject(new Error(`CDP timeout: ${method} ${params.expression?.slice(0,180)||''}`));},60000);
    pending.set(request,{resolve,reject,timer});ws.send(JSON.stringify({id:request,method,params,sessionId}));
  });
}
async function evaluate(fn){
  const result=await send('Runtime.evaluate',{expression:typeof fn==='string'?fn:`(${fn.toString()})()`,awaitPromise:true,returnByValue:true,userGesture:true});
  if(result.exceptionDetails)throw new Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);
  return result.result.value;
}
async function until(expression,ms=20000){
  const end=Date.now()+ms;
  do{if(await evaluate(expression))return;await new Promise(resolve=>setTimeout(resolve,100));}while(Date.now()<end);
  throw new Error(`Not ready: ${expression}\n${JSON.stringify(await evaluate(()=>({tools:window.getListeningToolsState?.(),enhanced:document.getElementById('enhanced-status')?.textContent,take:document.getElementById('take-status')?.textContent,replies:window.modelReplies?.slice(-3)})))}`);
}
async function check(name,fn){await fn();checks++;console.log(`PASS ${name}`);}
async function picture(name){
  if(!process.env.SCREENSHOT_DIR)return;
  const shot=await send('Page.captureScreenshot',{format:'png'});
  writeFileSync(resolve(process.env.SCREENSHOT_DIR,`${name}.png`),Buffer.from(shot.data,'base64'));
}
try{
  await send('Page.enable');await send('Runtime.enable');await send('Network.enable');
  await send('Target.setAutoAttach',{autoAttach:true,waitForDebuggerOnStart:true,flatten:true});
  await send('Network.setBypassServiceWorker',{bypass:true});
  await send('Page.addScriptToEvaluateOnNewDocument',{source:`{
    delete Navigator.prototype.serviceWorker;
    localStorage.clear();
    window.modelRequests=[];window.modelReplies=[];window.forceChord=null;window.failModel=null;
    const NativeWorker=Worker;
    window.Worker=class extends NativeWorker{
      set onmessage(handler){super.onmessage=event=>{
        if(event.data.result){modelReplies.push(structuredClone(event.data.result));if(forceChord)event.data.result.chord=forceChord;}
        handler(event);
      };}
      postMessage(message,...args){
        modelRequests.push(message.kind);
        if(failModel===message.kind){queueMicrotask(()=>this.onerror?.({message:'Controlled model failure'}));return;}
        super.postMessage(message,...args);
      }
    };
  }`});
  await send('Emulation.setDeviceMetricsOverride',{width:1280,height:960,deviceScaleFactor:1,mobile:false});
  await send('Page.navigate',{url});
  await until("!!window.appState?.currentSession && typeof getListeningToolsState==='function'");
  await evaluate(()=>{document.getElementById('neck-view-2d').click();setTargetMode('chords');});
  await check('Standard is the default and no model, WASM or raw worklet is downloaded before opting in',async()=>{
    assert.equal(await evaluate(()=>document.getElementById('enhanced-detection').checked),false);
    assert.deepEqual(await evaluate(()=>modelRequests),[]);
    assert.equal(requests.some(r=>/\/ml\/|model\.worker|inputTap\.worklet.*\.js/.test(r.url)),false);
    assert.equal(await evaluate(()=>document.getElementById('take-start').disabled),true);
  });
  const cFixture=process.env.ML_C_FIXTURE?readFileSync(process.env.ML_C_FIXTURE).toString('base64'):null;
  await evaluate(`(async()=>{
    window.oldMedia=navigator.mediaDevices.getUserMedia;window.permissionMode='normal';window.mediaCalls=0;
    window.fixtureContexts=[];window.fixtureStreams=[];window.fixtureGains=[];window.fixtureSources=[];
    const decoder=new OfflineAudioContext(1,1,48000),base=new URL('.',location.href);
    const load=async id=>decoder.decodeAudioData(await (await fetch(new URL('audio/musicca-guitar/steel/'+id+'.mp3',base))).arrayBuffer());
    window.eBuffer=await load('f1');
    ${cFixture?`window.cBuffer=await decoder.decodeAudioData(Uint8Array.from(atob(${JSON.stringify(cFixture)}),c=>c.charCodeAt(0)).buffer);`:`{
      const buffers=await Promise.all(['a4','d3','g1','h2','f1'].map(load)),context=new OfflineAudioContext(1,48000*4,48000);
      buffers.forEach((buffer,i)=>{const source=context.createBufferSource(),gain=context.createGain();source.buffer=buffer;gain.gain.value=.22;source.connect(gain);gain.connect(context.destination);source.start(i*.025);});
      window.cBuffer=await context.startRendering();
    }`}
    window.newFixture=async()=>{
      const context=new AudioContext({sampleRate:48000}),destination=context.createMediaStreamDestination(),gain=context.createGain();
      gain.gain.value=0;gain.connect(destination);await context.resume();
      fixtureContexts.push(context);fixtureStreams.push(destination.stream);fixtureGains.push(gain);
      return destination.stream;
    };
    navigator.mediaDevices.getUserMedia=async()=>{
      mediaCalls++;
      if(permissionMode==='deny')throw new DOMException('Controlled permission denial','NotAllowedError');
      if(permissionMode==='pending')return new Promise(resolve=>{window.resolvePermission=resolve;});
      return newFixture();
    };
    window.playFixture=buffer=>{
      for(const source of fixtureSources){source.stop();source.disconnect();}fixtureSources=[];
      const source=fixtureContexts.at(-1).createBufferSource();source.buffer=buffer;source.loop=true;
      source.connect(fixtureGains.at(-1));fixtureGains.at(-1).gain.value=.65;source.start();fixtureSources.push(source);
    };
    window.silenceFixture=()=>{fixtureGains.at(-1).gain.value=0;};
    window.prepareTake=()=>{
      document.getElementById('training-take').open=true;
      for(const id of ['take-record-consent','take-training-consent']){const input=document.getElementById(id);input.checked=true;input.dispatchEvent(new Event('change'));}
    };
  })()`);
  await check('two explicit consents gate recording and Stop cancels a pending microphone permission',async()=>{
    await evaluate(()=>{
      document.getElementById('training-take').open=true;
      document.getElementById('take-record-consent').click();
    });
    assert.equal(await evaluate(()=>document.getElementById('take-start').disabled),true);
    await evaluate(()=>{prepareTake();permissionMode='pending';document.getElementById('take-start').click();});
    await until("typeof resolvePermission==='function'");
    await evaluate(()=>document.getElementById('take-stop').click());
    await evaluate(async()=>resolvePermission(await newFixture()));
    await until("fixtureStreams.at(-1).getTracks().every(track=>track.readyState==='ended')");
    assert.equal(await evaluate(()=>getListeningToolsState().recording),false);
    assert.equal(await evaluate(()=>appState.isListening),false);
    assert.equal(await evaluate(()=>document.getElementById('take-download').hidden),true);
    await evaluate(()=>{permissionMode='normal';document.getElementById('training-take').open=false;});
  });
  await check('enhanced detection shares one microphone and runs the actual bundled worklet and WASM model',async()=>{
    const before=await evaluate(()=>mediaCalls);
    await evaluate(()=>{document.getElementById('enhanced-detection').click();document.getElementById('btn-toggle-mic').click();});
    await until("getListeningToolsState().modelReady && appState.detectionEngine.getNoiseProfile()?.calibrated && !appState.detectionEngine.isNoiseCalibrating()",45000);
    assert.equal(await evaluate(()=>mediaCalls),before+1);
    await evaluate(()=>playFixture(cBuffer));
    await until("modelReplies.some(reply=>reply.chord==='C')",35000);
    await until("['agree','recent'].includes(getListeningToolsState().comparison?.state) && document.getElementById('display-chord-name').textContent==='C'",25000);
    assert.doesNotMatch(await evaluate(()=>document.getElementById('display-chord-name').textContent),/DSP|ML|100%/);
    console.log('  Actual model result:',await evaluate(()=>JSON.stringify(modelReplies.at(-1))));
    await picture('enhanced-desktop');
  });
  await check('different current answers are shown as alternatives, not a forced confidence score',async()=>{
    await evaluate(()=>{forceChord='Am7';silenceFixture();});
    await until("getListeningToolsState().comparison?.state==='quiet'");
    await evaluate(()=>playFixture(cBuffer));
    await until("getListeningToolsState().comparison?.state==='different'",30000);
    assert.equal(await evaluate(()=>document.getElementById('display-chord-name').textContent),'Could be C or Am7');
    assert.equal(await evaluate(()=>getListeningToolsState().comparison.supported),false);
    await send('Emulation.setDeviceMetricsOverride',{width:320,height:850,deviceScaleFactor:1,mobile:false});
    await evaluate(()=>document.getElementById('enhanced-detection').scrollIntoView({block:'center'}));
    await until("document.documentElement.scrollWidth <= innerWidth + 1",5000);
    await picture('enhanced-mobile');
    const bounds=await evaluate(()=>({width:document.documentElement.scrollWidth,viewport:innerWidth,
      elements:[...document.querySelectorAll('body *')].filter(el=>el.checkVisibility()&&el.getBoundingClientRect().right>innerWidth+1).slice(0,12).map(el=>({id:el.id||el.className,right:el.getBoundingClientRect().right,width:el.getBoundingClientRect().width}))}));
    assert.ok(bounds.width<=bounds.viewport+1,JSON.stringify(bounds));
    await send('Emulation.setDeviceMetricsOverride',{width:1280,height:960,deviceScaleFactor:1,mobile:false});
    await evaluate(()=>{forceChord=null;silenceFixture();});
    await until("getListeningToolsState().comparison?.state==='quiet'");
    assert.doesNotMatch(await evaluate(()=>document.getElementById('display-chord-name').textContent),/Could be/);
  });
  await check('single notes retain the original exact-frequency tuner while the second check hears E4',async()=>{
    await evaluate(()=>setTargetMode('notes'));
    await until("getListeningToolsState().modelReady && appState.detectionEngine.getNoiseProfile()?.calibrated && !appState.detectionEngine.isNoiseCalibrating()");
    const count=await evaluate(()=>modelReplies.length);
    await evaluate(()=>playFixture(eBuffer));
    await until(`modelReplies.slice(${count}).some(reply=>reply.notes.length===1 && reply.notes[0].midi===64)`,25000);
    await until("document.getElementById('display-chord-name').textContent.includes('E4')");
    assert.match(await evaluate(()=>document.getElementById('info-notes').textContent),/Hz/);
    await evaluate(()=>silenceFixture());
  });
  await check('a runtime model failure leaves Standard listening, note detection and an explicit retry available',async()=>{
    await evaluate(()=>{failModel='live';playFixture(eBuffer);});
    await until("!getListeningToolsState().modelReady && !document.getElementById('enhanced-retry').hidden",25000);
    assert.equal(await evaluate(()=>appState.isListening),true);
    assert.match(await evaluate(()=>document.getElementById('enhanced-status').textContent),/Standard detection still works/);
    await until("document.getElementById('display-chord-name').textContent.includes('E4')");
    await evaluate(()=>{document.getElementById('enhanced-detection').click();silenceFixture();failModel=null;});
  });
  await check('a 12-second take exports raw mono WAV and consent/version metadata without grading its label',async()=>{
    await until("Number.parseFloat(document.getElementById('input-level').textContent) < -90");
    await evaluate(()=>{prepareTake();document.getElementById('take-start').click();});
    await until("document.getElementById('training-take').dataset.recording==='true'");
    assert.equal(await evaluate(()=>document.getElementById('take-download').hidden),true);
    await new Promise(resolve=>setTimeout(resolve,2300));
    await evaluate(()=>playFixture(eBuffer));
    await until("getListeningToolsState().retainedTake && !getListeningToolsState().recording",18000);
    const exported=await evaluate(async()=>{
      const bytes=new Uint8Array(await(await fetch(document.getElementById('take-download').href)).arrayBuffer()),view=new DataView(bytes.buffer),decoder=new TextDecoder();
      let offset=0;const files={};
      while(view.getUint32(offset,true)===0x04034b50){
        const length=view.getUint16(offset+26,true),size=view.getUint32(offset+18,true),start=offset+30+length;
        files[decoder.decode(bytes.subarray(offset+30,start))]=bytes.slice(start,start+size);offset=start+size;
      }
      const wav=new DataView(files['microphone.wav'].buffer),metadata=JSON.parse(decoder.decode(files['metadata.json']));
      window.exportMetadata=metadata;
      const digest=await crypto.subtle.digest('SHA-256',files['microphone.wav']);
      return{metadata,rate:wav.getUint32(24,true),channels:wav.getUint16(22,true),frames:wav.getUint32(40,true)/2,
        hash:Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join(''),
        keyboard:document.getElementById('take-download').tabIndex,download:document.getElementById('take-download').download};
    });
    assert.equal(exported.metadata.review.status,'unverified');assert.equal(exported.metadata.review.verifiedChord,null);
    assert.equal(exported.metadata.consent.upload,false);assert.equal(exported.channels,1);
    assert.equal(exported.frames,exported.rate*12);assert.equal(exported.hash,exported.metadata.audioSha256);
    assert.equal(exported.metadata.quality.quietLeadIn,true);assert.ok(exported.metadata.predictions.length>0);
    assert.equal(exported.metadata.engines.standard,'74340ba');assert.match(exported.download,/\.zip$/);
    assert.equal(exported.keyboard,0);
    assert.equal(await evaluate(()=>appState.isListening),true,'a borrowed microphone is not stopped');
    await evaluate(()=>silenceFixture());
    await evaluate(()=>document.getElementById('take-preview').play().catch(()=>{}));
    assert.equal(await evaluate(()=>document.getElementById('take-preview').paused),true);
    await send('Emulation.setDeviceMetricsOverride',{width:320,height:850,deviceScaleFactor:1,mobile:false});
    await evaluate(()=>document.getElementById('training-take').scrollIntoView({block:'center'}));
    await picture('training-mobile');
    await until("document.documentElement.scrollWidth <= innerWidth + 1",5000);
    const takeBounds=await evaluate(()=>({width:document.documentElement.scrollWidth,viewport:innerWidth,
      elements:[...document.querySelectorAll('body *')].filter(el=>el.checkVisibility()&&el.getBoundingClientRect().right>innerWidth+1).slice(0,12).map(el=>({id:el.id||el.className,right:el.getBoundingClientRect().right,width:el.getBoundingClientRect().width}))}));
    assert.ok(takeBounds.width<=takeBounds.viewport+1,JSON.stringify(takeBounds));
    await send('Emulation.setDeviceMetricsOverride',{width:1280,height:960,deviceScaleFactor:1,mobile:false});
    await evaluate(()=>document.getElementById('take-training-consent').click());
    assert.equal(await evaluate(()=>getListeningToolsState().retainedTake),false);
    assert.equal(await evaluate(()=>document.getElementById('take-download').hasAttribute('href')),false);
  });
  await check('leaving Live studio discards active takes and stops a microphone started solely for a take',async()=>{
    await evaluate(()=>{document.getElementById('btn-toggle-mic').click();prepareTake();document.getElementById('take-start').click();});
    await until("document.getElementById('training-take').dataset.recording==='true'");
    await evaluate(()=>switchTab('chords'));
    assert.equal(await evaluate(()=>getListeningToolsState().recording),false);
    assert.equal(await evaluate(()=>appState.isListening),false);
    assert.equal(await evaluate(()=>fixtureStreams.at(-1).getTracks().every(track=>track.readyState==='ended')),true);
    await evaluate(()=>switchTab('detector'));
  });
  await check('finishing an owned take stops its microphone, and deleting during export preparation cannot resurrect it',async()=>{
    await evaluate(()=>{prepareTake();document.getElementById('take-start').click();});
    await until("document.getElementById('training-take').dataset.recording==='true'");
    await new Promise(resolve=>setTimeout(resolve,1400));
    await evaluate(()=>document.getElementById('take-stop').click());
    await until("getListeningToolsState().retainedTake && !getListeningToolsState().recording");
    assert.equal(await evaluate(()=>appState.isListening),false);
    assert.equal(await evaluate(()=>fixtureStreams.at(-1).getTracks().every(track=>track.readyState==='ended')),true);
    await evaluate(()=>{
      document.getElementById('take-delete').click();prepareTake();
      window.originalDigest=crypto.subtle.digest;
      crypto.subtle.digest=(...args)=>new Promise((resolve,reject)=>{
        window.finishDigest=()=>originalDigest.apply(crypto.subtle,args).then(resolve,reject);
      });
      document.getElementById('take-start').click();
    });
    await until("document.getElementById('training-take').dataset.recording==='true'");
    await new Promise(resolve=>setTimeout(resolve,1400));
    await evaluate(()=>document.getElementById('take-stop').click());
    await until("typeof finishDigest==='function'");
    await evaluate(()=>{document.getElementById('take-delete').click();crypto.subtle.digest=originalDigest;return finishDigest();});
    assert.equal(await evaluate(()=>getListeningToolsState().retainedTake),false);
    assert.equal(await evaluate(()=>document.getElementById('take-download').hasAttribute('href')),false);
    assert.equal(await evaluate(()=>appState.isListening),false);
  });
  await check('hidden-page cancellation releases input and a late model cannot recreate a cleared result',async()=>{
    await evaluate(()=>{document.getElementById('enhanced-detection').click();document.getElementById('btn-toggle-mic').click();});
    await until("appState.isListening");
    await evaluate(()=>{
      Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));
      delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));
    });
    assert.equal(await evaluate(()=>appState.isListening),false);
    assert.equal(await evaluate(()=>getListeningToolsState().modelReady),false);
    assert.equal(await evaluate(()=>fixtureStreams.at(-1).getTracks().every(track=>track.readyState==='ended')),true);
    await evaluate(()=>document.getElementById('enhanced-detection').click());
  });
  assert.deepEqual(errors,[],'Unexpected page/worker errors');
  assert.equal(requests.some(r=>!['GET','HEAD'].includes(r.method)),false,'No upload requests');
  const enhancedRequests=requests.filter(r=>/\/ml\/|model\.worker|inputTap\.worklet/.test(r.url));
  assert.ok(enhancedRequests.some(r=>r.url.includes('.wasm')),'Actual WASM runtime was requested');
  assert.ok(enhancedRequests.every(r=>new URL(r.url).origin===new URL(url).origin),'Model and runtime are same-origin');
  assert.ok(enhancedRequests.filter(r=>r.url.includes('/ml/')).every(r=>new URL(r.url).pathname.startsWith(new URL('.',url).pathname+'ml/')),'Model assets preserve the deployment subpath');
  console.log(`\n${checks}/${checks} listening-tools browser checks passed; page and worker requests were monitored`);
}finally{
  await evaluate(async()=>{
    if(window.appState?.isListening)document.getElementById('btn-toggle-mic').click();
    navigator.mediaDevices.getUserMedia=window.oldMedia||navigator.mediaDevices.getUserMedia;
    for(const context of window.fixtureContexts||[])if(context.state!=='closed')await context.close();
  }).catch(error=>console.error('Fixture cleanup:',error.message));
  await fetch(`${endpoint}/json/close/${target.id}`);ws.close();
}
