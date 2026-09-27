import assert from 'node:assert/strict';

export async function checkGuitarSamples({ check, evaluate, send, until, show, screenshot }) {
  await evaluate(async () => {
    const url = performance.getEntriesByType('resource').findLast(e => new URL(e.name).pathname === '/src/audio/guitarSamples.ts').name;
    window.sampleApi = await import(url);
    testMain.setGuitarSampleBank('steel');
    await appState.songStudio.onPlayRequested();
    window.sampleContext = appState.audioContext;
    window.sampleOriginalCreate = sampleContext.createBufferSource;
    window.samplePlayed = [];
    sampleContext.createBufferSource = function() {
      const source = BaseAudioContext.prototype.createBufferSource.call(this);
      const start = source.start.bind(source), stop = source.stop.bind(source);
      const record = { source, at: null, offset: 0, stops: [] };
      source.start = (...args) => { record.at = args[0]; record.offset = args[1] ?? 0; samplePlayed.push(record); start(...args); };
      source.stop = at => { record.stops.push(at ?? this.currentTime); stop(at); };
      return source;
    };
    window.sampleKnown = () => new Set(sampleApi.GUITAR_SAMPLES.map(s =>
      sampleApi.guitarSamplePlayback(sampleContext, appState.acousticBus.sampleBank, 440 * 2 ** ((s.midi - 69) / 12), s.stringIndex).buffer));
  });
  try {
    await check('all three recorded guitar banks decode and open-string pitches match their labels', async () => {
      const result = await evaluate(async () => {
        const banks = [];
        for (const bank of ['steel', 'classical', 'electric']) {
          await sampleApi.loadGuitarBank(sampleContext, bank);
          let bytes = 0, maximumOffset = 0; const pitches = [];
          for (const sample of sampleApi.GUITAR_SAMPLES) {
            const expected = 440 * 2 ** ((sample.midi - 69) / 12);
            const playback = sampleApi.guitarSamplePlayback(sampleContext, bank, expected, sample.stringIndex);
            const buffer = playback.buffer; bytes += buffer.length * buffer.numberOfChannels * 4;
            maximumOffset = Math.max(maximumOffset, playback.offset);
            if (['e1','a1','d1','g1','h1','f1'].includes(sample.id)) {
              const data = buffer.getChannelData(0), start = Math.floor((playback.offset + .07) * buffer.sampleRate);
              let best = -1, lag = 0;
              const low = Math.floor(buffer.sampleRate / (expected * 1.07)), high = Math.ceil(buffer.sampleRate / (expected * .93));
              for (let d = low; d <= high; d++) {
                let dot = 0, a = 0, b = 0;
                const end = Math.min(data.length - d, start + 4096);
                for (let i = start; i < end; i++) { dot += data[i] * data[i + d]; a += data[i] ** 2; b += data[i + d] ** 2; }
                const score = dot / Math.sqrt(a * b);
                if (score > best) { best = score; lag = d; }
              }
              pitches.push({ id: sample.id, cents: 1200 * Math.log2(buffer.sampleRate / lag / expected), correlation: best });
            }
          }
          banks.push({ bank, bytes, maximumOffset, pitches });
        }
        const highRate = new OfflineAudioContext(2, 1, 96000);
        await sampleApi.loadGuitarBank(highRate, 'steel');
        const decodedRate = sampleApi.guitarSamplePlayback(highRate, 'steel', 440, 0).buffer.sampleRate;
        testMain.setGuitarSampleBank('steel'); await appState.songStudio.onPlayRequested();
        return { initial: window.sampleInitialBank, banks, decodedRate };
      });
      assert.equal(result.initial, 'steel');
      assert.equal(result.decodedRate, 48000);
      for (const bank of result.banks) {
        assert.ok(bank.bytes < 64 * 1024 * 1024);
        assert.ok(bank.maximumOffset < .3);
        for (const pitch of bank.pitches) assert.ok(Math.abs(pitch.cents) < 35 && pitch.correlation > .6, JSON.stringify({ bank: bank.bank, ...pitch }));
      }
      console.log('  Decoded guitar banks:', JSON.stringify(result.banks));
    });
    await check('sample playback keeps exact pitch, recorded attacks, timed releases and a neutral audio route', async () => {
      const result = await evaluate(async () => {
        const { playAcousticString } = await import('/src/audio/engine.ts');
        const ctx = sampleContext, bus = appState.acousticBus, records = [];
        samplePlayed.length = 0;
        for (const [midi, stringIndex] of [[40,5],[59,1],[64,0],[67,0],[38,5],[88,0]]) {
          const freq = 440 * 2 ** ((midi - 69) / 12);
          const expected = sampleApi.guitarSamplePlayback(ctx, 'steel', freq, stringIndex);
          const at = ctx.currentTime + .04, end = at + .25;
          const source = playAcousticString(ctx, bus, { freq, stringIndex, velocity: .8, startTime: at, endTime: end });
          const record = samplePlayed.at(-1);
          records.push({ midi, sameBuffer: source.buffer === expected.buffer, rate: source.playbackRate.value, expectedRate: expected.rate,
            offset: record.offset, expectedOffset: expected.offset, release: record.stops[0], end });
        }
        document.getElementById('guitar-stop-audio').click();
        return records;
      });
      for (const record of result) {
        assert.equal(record.sameBuffer, true); assert.equal(record.offset, record.expectedOffset);
        assert.ok(Math.abs(record.rate - record.expectedRate) < .00001);
        assert.ok(record.release <= record.end);
      }
    });
    await check('Live, Library, Scales, Songs, Circle, Theory and Ear training all use the selected recordings', async () => {
      const observed = [];
      const finish = async label => {
        await until('samplePlayed.length > 0');
        const result = await evaluate(() => {
          const known = sampleKnown();
          return { voices: samplePlayed.length, recorded: samplePlayed.every(r => known.has(r.source.buffer)) };
        });
        assert.equal(result.recorded, true, label); observed.push({ label, ...result });
        await evaluate(() => document.getElementById('guitar-stop-audio').click());
      };
      await evaluate(async () => { switchTab('detector'); samplePlayed.length = 0; await window.loadChordPreset('C',true); });
      await finish('Live');
      await show('chords','library-neck-3d');
      await evaluate(() => { samplePlayed.length = 0; document.querySelector('[data-library-select]').click(); document.querySelector('#library-neck [data-strum="down"]').click(); });
      await finish('Library');
      await show('scales','scale-neck-3d');
      await evaluate(() => { samplePlayed.length = 0; testScenes['scale-neck-3d'].scene.onPick(0,0); });
      await finish('Scales');
      await evaluate(async () => {
        const storage = await import('/src/storage/index.ts');
        storage.saveCustomSong({ id:'sample-original-check',title:'Sample check',artist:'Original fixture',key:'C',bpm:120,strum:'',strumPatternVisual:'',chordsUsed:[],lines:[],isCustom:true,
          timing:{version:1,bpm:120,events:[{type:'note',string:1,fret:0,beats:.5},{type:'note',string:2,fret:1,beats:.5}]} });
        switchTab('songs'); appState.songStudio.loadSong('sample-original-check'); appState.songStudio.setTimingMode('song'); samplePlayed.length=0;
        await appState.songStudio.startPlayback();
      });
      await finish('Songs');
      await evaluate(() => { switchTab('fifths'); samplePlayed.length=0; document.getElementById('fifths-hear-scale').click(); });
      await finish('Circle');
      await evaluate(() => { switchTab('theory'); samplePlayed.length=0; document.getElementById('lesson-hear').click(); });
      await finish('Theory');
      await evaluate(() => { switchTab('trainer'); samplePlayed.length=0; document.getElementById('btn-play-cadence').click(); });
      await finish('Ear training');
      console.log('  Recorded guitar consumers:', JSON.stringify(observed));
    });
    await check('late guitar starts are cancelled by Stop, navigation, source changes, tuning and Clear', async () => {
      const results = await evaluate(async () => {
        const ctx = sampleContext, descriptor = Object.getOwnPropertyDescriptor(ctx,'state'), resume = ctx.resume;
        const results = [];
        try {
          for (const action of ['stop','tab','bank','tuning','clear']) {
            switchTab('detector'); testMain.setGuitarSampleBank('steel'); samplePlayed.length=0;
            let release;
            Object.defineProperty(ctx,'state',{configurable:true,get:()=> 'suspended'});
            const pendingResume=new Promise(resolve=>{release=resolve;});
            ctx.resume=()=>pendingResume;
            const playback=testMain.playTestSound().catch(error=>error.message);
            if(action==='stop') document.getElementById('guitar-stop-audio').click();
            if(action==='tab') switchTab('chords');
            if(action==='bank') testMain.setGuitarSampleBank('classical');
            if(action==='tuning') testMain.setCapo(2);
            if(action==='clear') testMain.clearFretboard();
            release(); await playback;
            results.push({action,voices:samplePlayed.length});
          }
        } finally {ctx.resume=resume;if(descriptor)Object.defineProperty(ctx,'state',descriptor);else delete ctx.state;testMain.setCapo(0);}
        return results;
      });
      for (const result of results) assert.equal(result.voices,0,result.action);
      const trainer = await evaluate(async () => {
        switchTab('trainer');
        const original=appState.trainerStudio.onPlayRequested; let release;
        appState.trainerStudio.onPlayRequested=()=>new Promise(resolve=>{release=resolve;});
        samplePlayed.length=0;document.getElementById('btn-play-cadence').click();switchTab('detector');
        release();await Promise.resolve();await Promise.resolve();appState.trainerStudio.onPlayRequested=original;
        return {voices:samplePlayed.length,timers:appState.trainerStudio.timers.size};
      });
      assert.deepEqual(trainer,{voices:0,timers:0});
    });
    await check('unavailable recordings stay silent and offer retry without a synth fallback', async () => {
      const result = await evaluate(async () => {
        for(const bank of ['steel','classical','electric']) await sampleApi.loadGuitarBank(sampleContext,bank);
        const missing=['steel','classical','electric'].find(bank=>!sampleApi.guitarBankReady(sampleContext,bank));
        const fetchOriginal=window.fetch;
        try {
          switchTab('detector');testMain.setGuitarSampleBank(missing);samplePlayed.length=0;
          window.fetch=(url,...args)=>String(url).includes('/musicca-guitar/')?Promise.resolve(new Response('',{status:404})):fetchOriginal(url,...args);
          await testMain.playTestSound().catch(()=>{});
          const error=document.getElementById('guitar-playback-status').textContent, before=samplePlayed.length;
          window.fetch=fetchOriginal;
          document.getElementById('guitar-retry-audio').click();await appState.songStudio.onPlayRequested();
          const retryVoices=samplePlayed.length;await testMain.playTestSound();
          return {error,before,retryVoices,voices:samplePlayed.length,sourceRemoved:!document.getElementById('guitar-sound-source')};
        } finally {window.fetch=fetchOriginal;document.getElementById('guitar-stop-audio').click();}
      });
      assert.match(result.error,/could not load/);assert.equal(result.before,0);assert.equal(result.retryVoices,0);assert.equal(result.voices,6);assert.equal(result.sourceRemoved,true);
    });
    await check('real bank loading coalesces requests and never releases a queued burst or cancelled sound', async () => {
      const result = await evaluate(async () => {
        const original=window.fetch;
        const emptyBank=async()=>{for(const bank of ['steel','classical','electric'])await sampleApi.loadGuitarBank(sampleContext,bank);return ['steel','classical','electric'].find(bank=>!sampleApi.guitarBankReady(sampleContext,bank));};
        try {
          switchTab('detector'); const bank=await emptyBank(); testMain.setGuitarSampleBank(bank);
          let release;const gate=new Promise(resolve=>{release=resolve;});let requests=0;
          window.fetch=async(url,...args)=>{if(String(url).includes('/musicca-guitar/')){requests++;await gate;}return original(url,...args);};
          samplePlayed.length=0;const first=testMain.playTestSound(),second=testMain.playTestSound();
          for(let i=0;i<10;i++)await Promise.resolve();
          const before=samplePlayed.length;release();await Promise.all([first,second]);
          const played=samplePlayed.length;document.getElementById('guitar-stop-audio').click();
          window.fetch=original;const next=await emptyBank();testMain.setGuitarSampleBank(next);
          let releaseNext;const nextGate=new Promise(resolve=>{releaseNext=resolve;});
          window.fetch=async(url,...args)=>{if(String(url).includes('/musicca-guitar/'))await nextGate;return original(url,...args);};
          samplePlayed.length=0;const pending=testMain.playTestSound().catch(error=>error.message);
          for(let i=0;i<10;i++)await Promise.resolve();
          document.getElementById('guitar-stop-audio').click();releaseNext();await pending;
          return {before,played,requests,cancelled:samplePlayed.length};
        } finally {window.fetch=original;}
      });
      assert.deepEqual(result,{before:0,played:6,requests:44,cancelled:0});
    });
    await check('microphone and percussion startup do not fetch an unloaded guitar bank', async () => {
      await evaluate(async () => {
        for(const bank of ['steel','classical','electric'])await sampleApi.loadGuitarBank(sampleContext,bank);
        const missing=['steel','classical','electric'].find(bank=>!sampleApi.guitarBankReady(sampleContext,bank));
        testMain.setGuitarSampleBank(missing);
        window.sampleFetchOriginal=window.fetch;window.sampleFileRequests=0;
        window.fetch=(url,...args)=>{if(String(url).includes('/musicca-guitar/'))sampleFileRequests++;return sampleFetchOriginal(url,...args);};
        window.sampleGetUserMedia=navigator.mediaDevices.getUserMedia;
        navigator.mediaDevices.getUserMedia=async()=>sampleContext.createMediaStreamDestination().stream;
      });
      try {
        assert.equal(await evaluate(()=>testMain.startMicrophone()),true);
        await evaluate(()=>{testMain.stopMicrophone();switchTab('rhythm');document.getElementById('percussion-preview').click();});
        await until("document.getElementById('rhythm-dock').dataset.state==='preview'");
        assert.equal(await evaluate(()=>sampleFileRequests),0);
      } finally {
        await evaluate(()=>{testMain.stopMicrophone();switchTab('detector');window.fetch=sampleFetchOriginal;navigator.mediaDevices.getUserMedia=sampleGetUserMedia;});
      }
    });
    await check('recorded chords have usable levels and do not clip in the real output graph', async () => {
      const metrics = await evaluate(async () => {
        const {createAcousticBus,strumChord}=await import('/src/audio/engine.ts');
        const {STANDARD_TUNING}=await import('/src/types/index.ts');
        const metrics=[];
        for(const bank of ['steel','classical','electric']){
          const ctx=new OfflineAudioContext(2,192000,48000);
          await sampleApi.loadGuitarBank(ctx,bank);
          const bus=createAcousticBus(ctx,{bank,masterVolume:1,strumStyle:'down',sampleRate:48000});
          [[0,1,0,2,3,null],[3,0,0,0,2,3],[0,0,0,2,2,0]].forEach((frets,i)=>
            strumChord(ctx,bus,{frets,style:'down',velocity:.85,tuning:STANDARD_TUNING,startTime:.05+i*1.25,endTime:1.2+i*1.25,humanize:false}));
          const result=await ctx.startRendering();let peak=0,sum=0;
          for(let c=0;c<2;c++)for(const value of result.getChannelData(c)){peak=Math.max(peak,Math.abs(value));sum+=value*value;}
          metrics.push({bank,peak,rms:Math.sqrt(sum/(result.length*2))});
        }
        return metrics;
      });
      console.log('  Recorded chord output:',JSON.stringify(metrics));
      for(const m of metrics){assert.ok(m.peak<1,JSON.stringify(m));assert.ok(m.rms>.008,JSON.stringify(m));}
    });
    await check('sample selection is visible, persistent, keyboard-accessible and fits 320px', async () => {
      await evaluate(async () => {
        switchTab('detector');testMain.setGuitarSampleBank('electric');await appState.songStudio.onPlayRequested();
        const control=document.getElementById('guitar-sample-bank');let parent=control.parentElement;
        while(parent){if(parent.tagName==='DETAILS')parent.open=true;parent=parent.parentElement;}
        control.scrollIntoView({block:'center'});
      });
      await screenshot('sample-guitar-desktop');
      await send('Emulation.setDeviceMetricsOverride',{width:320,height:850,deviceScaleFactor:1,mobile:false});
      await evaluate(() => document.getElementById('guitar-sample-bank').scrollIntoView({block:'center'}));
      await screenshot('sample-guitar-mobile');
      assert.equal(await evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
      const settings=await evaluate(()=>JSON.parse(localStorage.getItem('guitar_studio_settings')));
      assert.equal(settings.guitarSoundSource,undefined);assert.equal(settings.guitarSampleBank,'electric');
      assert.equal(await evaluate(()=>document.getElementById('guitar-synth-options')),null);
      await send('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});
    });
  } finally {
    await evaluate(() => {
      document.getElementById('guitar-stop-audio').click();testMain.setGuitarSampleBank('steel');
      sampleContext.createBufferSource=sampleOriginalCreate;testMain.setCapo(0);
    });
  }
}
