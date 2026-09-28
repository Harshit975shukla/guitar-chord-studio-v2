import assert from 'node:assert/strict';

export async function checkPracticeAddons({ check, evaluate, send, until, screenshot }) {
  await check('fast preview follows short recorded-note changes without modifying stable results', async () => {
    const result = await evaluate(async () => (await import('/scripts/fast-preview-case.ts')).runFastPreviewCase());
    console.log('  Fast preview comparison:', JSON.stringify(result));
    assert.equal(result.stableUnchanged,true);
    assert.ok(result.fastHits>result.stableHits);
    assert.ok(result.wrong.fast<=result.wrong.stable);
  });
  await evaluate(async () => {
    const moduleUrl = path => performance.getEntriesByType('resource').findLast(e => new URL(e.name).pathname === path).name;
    const {JamLoop}=await import(moduleUrl('/src/ui/jamLoop.ts')), original=JamLoop.prototype.setActive;
    JamLoop.prototype.setActive=function(active){window.jam=this;original.call(this,active);};switchTab('detector');JamLoop.prototype.setActive=original;
    const {FastDetectionPreview}=await import(moduleUrl('/src/detection/fastPreview.ts')), enable=FastDetectionPreview.prototype.setEnabled;
    FastDetectionPreview.prototype.setEnabled=function(...args){window.fastPreviewTest=this;return enable.apply(this,args);};
    const toggle=document.getElementById('fast-follow-preview');toggle.checked=false;toggle.dispatchEvent(new Event('change'));
    FastDetectionPreview.prototype.setEnabled=enable;
    window.jamWav=()=>{const rate=22050,frames=rate*2,bytes=new ArrayBuffer(44+frames*2),view=new DataView(bytes);
      const word=(at,text)=>[...text].forEach((letter,i)=>view.setUint8(at+i,letter.charCodeAt(0)));
      word(0,'RIFF');view.setUint32(4,36+frames*2,true);word(8,'WAVE');word(12,'fmt ');view.setUint32(16,16,true);
      view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,rate,true);view.setUint32(28,rate*2,true);
      view.setUint16(32,2,true);view.setUint16(34,16,true);word(36,'data');view.setUint32(40,frames*2,true);
      for(let i=0;i<frames;i++)view.setInt16(44+i*2,Math.sin(i*2*Math.PI*220/rate)*10000,true);
      return new Blob([bytes],{type:'audio/wav'});};
  });
  await check('backing loop trims sample-accurately, changes volume and cancels on navigation', async () => {
    await evaluate(async()=>{await jam.load(jamWav(),'Original backing fixture',2000);
      document.querySelector('[data-jam="start"]').value='.25';document.querySelector('[data-jam="end"]').value='1.25';
      document.querySelector('[data-jam="play"]').click();});
    await until("document.getElementById('jam-loop-host').dataset.state==='playing'");
    const data=await evaluate(()=>({duration:jam.transport.source.buffer.duration,loop:jam.transport.source.loop,source:appState.settings.guitarSampleBank,mic:appState.isListening}));
    assert.equal(data.duration,1);assert.equal(data.loop,true);assert.equal(data.mic,false);
    await evaluate(()=>{const v=document.querySelector('[data-jam="volume"]');v.value='0';v.dispatchEvent(new Event('input'));switchTab('chords')});
    assert.equal(await evaluate(()=>jam.transport.source),null);
    await evaluate(()=>switchTab('detector'));
  });
  await check('invalid and cancelled backing loads cannot overwrite a valid take or start audio', async()=>{
    const result=await evaluate(async()=>{
      const title=document.querySelector('[data-jam="title"]').textContent;
      await jam.load(jamWav(),'Too long',121000).catch(()=>{});
      const kept=document.querySelector('[data-jam="title"]').textContent===title;
      const original=jam.options.audio;let release;jam.options.audio=()=>new Promise(resolve=>{release=resolve});
      const loading=jam.load(jamWav(),'Cancelled take',2000);jam.stop();release(appState.audioContext);await loading;jam.options.audio=original;
      return {kept,title:document.querySelector('[data-jam="title"]').textContent,state:jam.host.dataset.state,source:jam.transport.source};
    });
    assert.equal(result.kept,true);assert.equal(result.title,'Original backing fixture');assert.equal(result.state,'idle');assert.equal(result.source,null);
  });
  await check('fast preview output cannot update confirmed notes, MIDI or practice state', async()=>{
    const result=await evaluate(()=>{
      const before=JSON.stringify({chord:appState.currentChord,stats:appState.currentSession,frets:appState.currentFretboardState});
      const title=document.getElementById('display-chord-name').textContent;
      const toggle=document.getElementById('fast-follow-preview');toggle.checked=true;toggle.dispatchEvent(new Event('change'));
      fastPreviewTest.display({mode:'single-note',freshness:'fresh',note:{pitch:{note:'F#',octave:4,midi:66},confidence:99}});
      const hint=document.getElementById('fast-follow-output').textContent;
      const same=before===JSON.stringify({chord:appState.currentChord,stats:appState.currentSession,frets:appState.currentFretboardState})&&title===document.getElementById('display-chord-name').textContent;
      toggle.checked=false;toggle.dispatchEvent(new Event('change'));return {hint,same,hidden:document.getElementById('fast-follow-output').hidden};
    });
    assert.match(result.hint,/F#4.*tentative, not scored/);assert.equal(result.same,true);assert.equal(result.hidden,true);
  });
  await check('recorder current-take handoff opens the same local backing workspace', async()=>{
    const result=await evaluate(async()=>{
      const {audioRecorder}=await import('/src/audio/recorder.ts'), blob=audioRecorder.getRecordedBlob,duration=audioRecorder.getDuration;
      try {audioRecorder.getRecordedBlob=()=>jamWav();audioRecorder.getDuration=()=>2000;switchTab('recorder');document.getElementById('rec-use-backing').click();
        for(let i=0;i<30;i++)await Promise.resolve();
        return {tab:appState.activeTab};
      }finally{audioRecorder.getRecordedBlob=blob;audioRecorder.getDuration=duration;}
    });
    assert.equal(result.tab,'detector');
    await until("!jam.loading && document.querySelector('[data-jam=\"title\"]').textContent==='Latest recorded backing'");
  });
  await check('microphone-backed jamming requires headphones and switches only the chosen live target', async()=>{
    const result=await evaluate(async()=>{
      const listening=jam.options.listening,target=jam.options.target,selected=[];
      try{
        jam.options.listening=()=>true;jam.options.target=mode=>selected.push(mode);
        document.querySelector('[data-jam="headphones"]').checked=false;
        await jam.start();const blocked=jam.host.dataset.state==='idle'&&document.querySelector('[data-jam="status"]').textContent.includes('headphones');
        document.querySelector('[data-jam="headphones"]').checked=true;document.querySelector('[data-jam="target"]').value='notes';
        await jam.start();jam.stop();document.querySelector('[data-jam="target"]').value='chords';await jam.start();jam.stop();
        return {blocked,selected};
      }finally{jam.options.listening=listening;jam.options.target=target;document.querySelector('[data-jam="headphones"]').checked=false;}
    });
    assert.deepEqual(result,{blocked:true,selected:['notes','chords']});
  });
  await check('a real browser recording is saved and can become a decoded backing loop', async()=>{
    await evaluate(async()=>{
      const {audioRecorder}=await import('/src/audio/recorder.ts');window.jamRecorder=audioRecorder;
      switchTab('recorder');audioRecorder.setCountIn(false);
      window.jamOriginalMedia=navigator.mediaDevices.getUserMedia;
      const context=appState.audioContext,destination=context.createMediaStreamDestination();
      window.jamRecordingTone=context.createOscillator();const gain=context.createGain();gain.gain.value=.1;
      jamRecordingTone.frequency.value=220;jamRecordingTone.connect(gain);gain.connect(destination);jamRecordingTone.start();
      navigator.mediaDevices.getUserMedia=async()=>destination.stream;
      document.getElementById('rec-btn-main').click();
    });
    try{
      await until('jamRecorder.isRecording()');
      await until('jamRecorder.getDuration()>=800');
      await evaluate(()=>document.getElementById('rec-btn-main').click());
      await until('!jamRecorder.isRecording() && !!jamRecorder.getRecordedBlob()');
      await until("document.querySelectorAll('[data-jam-take]').length>0");
      await evaluate(()=>document.querySelector('[data-jam-take]').click());
      await until("appState.activeTab==='detector' && !jam.loading && !!jam.buffer");
      const loaded=await evaluate(()=>({duration:jam.buffer.duration,title:document.querySelector('[data-jam=\"title\"]').textContent}));
      assert.ok(loaded.duration>.5 && loaded.duration<2);assert.match(loaded.title,/Take/);
    }finally{
      await evaluate(()=>{if(jamRecorder.isRecording())void jamRecorder.stopRecording();jamRecordingTone.stop();jamRecordingTone.disconnect();navigator.mediaDevices.getUserMedia=jamOriginalMedia;});
    }
  });
  await check('jam controls remain usable at 320px and Stop/Clear release the backing', async()=>{
    await send('Emulation.setDeviceMetricsOverride',{width:320,height:850,deviceScaleFactor:1,mobile:false});
    await evaluate(()=>document.getElementById('jam-loop-host').scrollIntoView({block:'start'}));
    await screenshot('record-and-jam-mobile');
    await evaluate(async()=>{await document.fonts.ready;await Promise.allSettled(document.getAnimations().filter(a=>a.effect.getComputedTiming().iterations!==Infinity).map(a=>a.finished))});
    assert.equal(await evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
    await evaluate(()=>jam.clear());assert.equal(await evaluate(()=>jam.buffer),null);
    await send('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});
  });
}
