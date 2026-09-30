import assert from 'node:assert/strict';

export async function checkChordLibrary({ check, evaluate, show, until }) {
  await show('chords', 'library-neck-3d');
  await check('all 228 library cards select complete frets and schedule the matching recorded strings', async () => {
    const result = await evaluate(async () => {
      const ctx = appState.audioContext, bus = appState.acousticBus;
      const engineUrl = performance.getEntriesByType('resource').findLast(e => new URL(e.name).pathname === '/src/audio/engine.ts').name;
      const audio = await import(engineUrl);
      const definitions = testMain.getChordDefinitions();
      const cards = [...document.querySelectorAll('.library-chord-card')];
      const create = ctx.createBufferSource;
      let played = [], checked = 0;
      bus.masterOut.disconnect();
      ctx.createBufferSource = function() {
        const source = BaseAudioContext.prototype.createBufferSource.call(this), start = source.start.bind(source);
        source.start = (...args) => { played.push(source); start(...args); };
        return source;
      };
      try {
        for (const [index, card] of cards.entries()) {
          played = [];
          card.querySelector('[data-library-strum]').click();
          for (let wait = 0; !played.length && wait < 100; wait++) await new Promise(resolve => setTimeout(resolve, 0));
          const state = testScenes['library-neck-3d'].state;
          const wanted = new Set(definitions[index].notes);
          const actual = new Set(state.frets.flatMap((f,s)=>f===null?[]:[['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'][(state.tuning[s].midi+f)%12]]));
          if (actual.size !== wanted.size || [...wanted].some(note=>!actual.has(note))) throw Error(`Wrong library notes for ${card.dataset.chord}`);
          const strings = state.frets.flatMap((f,s)=>f===null?[]:[{s,f}]).reverse();
          if (played.length !== strings.length) throw Error(`Missing audio for ${card.dataset.chord}: ${played.length}/${strings.length}`);
          for (let i=0;i<played.length;i++) {
            const expected = recordedGuitar.guitarSamplePlayback(ctx,bus.sampleBank,440*2**((state.tuning[strings[i].s].midi+strings[i].f-69)/12),strings[i].s);
            if (played[i].buffer !== expected.buffer || Math.abs(played[i].playbackRate.value-expected.rate)>.00001) throw Error(`Wrong recorded pitch for ${card.dataset.chord}`);
          }
          audio.stopAcousticSources(bus); checked++;
        }
      } finally {
        audio.stopAcousticSources(bus); ctx.createBufferSource=create;
        await new Promise(resolve => setTimeout(resolve,50));
        bus.masterOut.connect(ctx.destination);
      }
      return {checked, count:cards.length};
    });
    assert.deepEqual(result,{checked:228,count:228});
  });
  await check('C6 and Cm6 produce non-silent audio with their complete selected voicings', async () => {
    const values = await evaluate(async () => {
      const engineUrl = performance.getEntriesByType('resource').findLast(e => new URL(e.name).pathname === '/src/audio/engine.ts').name;
      const audio = await import(engineUrl);
      const rows = [];
      for (const symbol of ['C6','Cm6']) {
        document.querySelector(`.library-chord-card[data-chord="${symbol}"] [data-library-select]`).click();
        const state = testScenes['library-neck-3d'].state;
        const offline = new OfflineAudioContext(2,26460,44100);
        await recordedGuitar.loadGuitarBank(offline,'steel');
        const bus = audio.createAcousticBus(offline,{...audio.DEFAULT_ENGINE_CONFIG,bank:'steel'});
        const voices = audio.strumChord(offline,bus,{frets:state.frets,tuning:state.tuning,style:'down',velocity:.8,humanize:false,startTime:.01,endTime:.5});
        const buffer=await offline.startRendering(), samples=buffer.getChannelData(0);
        const rms=Math.sqrt(samples.reduce((sum,value)=>sum+value*value,0)/samples.length);
        rows.push({symbol,voices:voices.length,rms});
      }
      return rows;
    });
    for (const row of values) { assert.ok(row.voices>=4,row.symbol);assert.ok(row.rms>.0001,`${row.symbol} is silent`); }
  });
  await check('sixth and seventh filters use real quality keys; tuning/capo regenerate selected chord pitches', async () => {
    await evaluate(() => document.querySelector('#lib-quality-filters [data-quality="m6"]').click());
    assert.equal(await evaluate(() => document.querySelectorAll('.library-chord-card').length),12);
    await evaluate(() => document.querySelector('#lib-quality-filters [data-quality="7"]').click());
    assert.equal(await evaluate(() => document.querySelectorAll('.library-chord-card').length),12);
    await evaluate(() => {
      document.querySelector('#lib-quality-filters [data-quality="All"]').click();
      document.querySelector('.library-chord-card[data-chord="C6"] [data-library-select]').click();
      testMain.setCapo(2);
    });
    await until("testScenes['library-neck-3d'].state.tuning[0].midi === 66");
    const pcs = await evaluate(() => {
      const state=testScenes['library-neck-3d'].state;
      return [...new Set(state.frets.flatMap((f,s)=>f===null?[]:[(state.tuning[s].midi+f)%12]))].sort((a,b)=>a-b);
    });
    assert.deepEqual(pcs,[0,4,7,9]);
    await evaluate(() => testMain.setCapo(0));
    await evaluate(() => testMain.setTuningPreset('half_step_down'));
    const flatTuning = await evaluate(() => {
      const state=testScenes['library-neck-3d'].state;
      return { midis:state.tuning.map(s=>s.midi),
        notes:[...new Set(state.frets.flatMap((f,s)=>f===null?[]:[(state.tuning[s].midi+f)%12]))].sort((a,b)=>a-b) };
    });
    assert.deepEqual(flatTuning.midis,[63,58,54,49,44,39]);
    assert.deepEqual(flatTuning.notes,[0,4,7,9]);
    await evaluate(() => testMain.setTuningPreset('standard'));
  });
}
