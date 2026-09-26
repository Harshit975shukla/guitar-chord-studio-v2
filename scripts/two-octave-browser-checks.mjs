import assert from 'node:assert/strict';

export async function checkTwoOctaves({ check, evaluate, send, until, show, screenshot }) {
  await show('scales', 'scale-neck-3d');
  await check('two-octave controls plan D minor from Middle through Upper with the requested return fingering', async () => {
    const result = await evaluate(() => {
      const s = appState.scalesStudio;
      s.setRoot('D'); s.setScaleKey('natural_minor'); s.setRegister('middle'); s.setPracticeMode('free'); s.setLabelMode('note');
      const range = document.getElementById('scale-exercise-range');
      range.value = 'two-octaves'; range.dispatchEvent(new Event('change'));
      const pattern = s.shiftPattern;
      const positions = testScenes['scale-neck-3d'].state.scalePositions;
      document.querySelector('#scale-shift-guide summary').click();
      const data = {
        label: document.getElementById('scale-position-label').textContent,
        pattern, count: document.querySelectorAll('#scale-pattern-steps li').length,
        status: document.getElementById('scale-pattern-status').textContent,
        highMarker: positions.find(p => p.stringIndex === 0 && p.fret === 10),
        flatLabels: positions.filter(p => (s.tuning[p.stringIndex].midi + p.fret) % 12 === 10).map(p => p.label),
      };
      document.getElementById('scale-neck-view-2d').click();
      data.flatHigh = document.getElementById('scale-dot-0-10')?.textContent;
      document.getElementById('scale-neck-view-3d').click();
      return data;
    });
    assert.equal(result.label, 'Starting position'); assert.equal(result.count, 15);
    assert.equal(result.pattern[0].midi, 50); assert.equal(result.pattern.at(-1).midi, 74);
    assert.equal(result.pattern[0].stringIndex, 4); assert.equal(result.pattern[0].fret, 5);
    assert.equal(result.pattern.at(-1).shift, 'up'); assert.equal(result.highMarker.label, 'D'); assert.equal(result.flatHigh, 'D');
    assert.deepEqual(result.flatLabels, ['B♭', 'B♭']);
    assert.deepEqual(result.pattern.find(p => p.midi === 64), { stringIndex: 1, fret: 5, midi: 64, handPosition: 'middle' });
    assert.match(result.status, /D3 → D5/);
    await until("!!document.querySelector('#scale-neck-3d canvas')");
  });
  await screenshot('two-octave-pattern-desktop');

  await check('two-octave reference audio follows the planned route and announces shifts up and down', async () => {
    const result = await evaluate(async () => {
      const s = appState.scalesStudio, play = s.playPosition;
      const set = window.setTimeout, clear = window.clearTimeout;
      const audioTime = Object.getOwnPropertyDescriptor(appState.audioContext, 'currentTime');
      const create = appState.audioContext.createBufferSource;
      let clock = appState.audioContext.currentTime * 1000 + 20000, id = 900000;
      const timers = new Map(), played = [], sources = [];
      window.setTimeout = (fn, delay) => { timers.set(++id, { fn, at: clock + delay }); return id; };
      window.clearTimeout = id => { if (!timers.delete(id)) clear(id); };
      Object.defineProperty(appState.audioContext, 'currentTime', { configurable: true, get: () => clock / 1000 });
      appState.audioContext.createBufferSource = function() { const source = create.call(this); sources.push(source); return source; };
      s.playPosition = function(string, fret, duration) {
        play.call(this, string, fret, duration);
        played.push({ string, fret, midi: this.tuning[string].midi + fret,
          hand: this.referenceStep.handPosition, shift: this.referenceStep.shift,
          cue: document.getElementById('scale-shift-cue').textContent });
      };
      const advance = milliseconds => {
        const end = clock + milliseconds;
        for (let guard = 0; guard < 300; guard++) {
          const next = [...timers].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
          if (!next) break;
          timers.delete(next[0]); clock = next[1].at; next[1].fn();
        }
        clock = end;
      };
      try {
        s.setBpm(240); await s.startScaleAudioRun(); advance(7500);
        const firstCycle = played.slice(0, 29);
        const running = s.isAudioRunning;
        const { renderStringSamples } = await import('/src/audio/engine.ts');
        const waveformsMatch = firstCycle.every((p, i) => {
          const buffer = sources[i].buffer;
          const expected = renderStringSamples(buffer.sampleRate, {
            freq: 440 * 2 ** ((p.midi - 69) / 12), stringIndex: p.string,
            startTime: 0, velocity: .95, model: appState.acousticBus.model,
          });
          return buffer.getChannelData(0).every((sample, index) => sample === expected[index]);
        });
        document.getElementById('btn-scale-run').click();
        const count = played.length; advance(5000);
        const stopped = !s.isAudioRunning && s.audioRunTimer === null && played.length === count;
        played.length = 0;
        s.setPracticeMode('descending'); await s.startScaleAudioRun(); advance(5000);
        return { firstCycle, running, waveformsMatch, stopped, descending: [...played], descendingEnded: !s.isAudioRunning };
      } finally {
        s.stopScaleAudioRun(); s.playPosition = play;
        appState.audioContext.createBufferSource = create;
        window.setTimeout = set; window.clearTimeout = clear;
        if (audioTime) Object.defineProperty(appState.audioContext, 'currentTime', audioTime); else delete appState.audioContext.currentTime;
        s.auditionUntil = 0;
      }
    });
    const up = [50, 52, 53, 55, 57, 58, 60, 62, 64, 65, 67, 69, 70, 72, 74];
    assert.deepEqual(result.firstCycle.map(p => p.midi), [...up, ...up.slice(0, -1).reverse()]);
    assert.equal(result.running, true); assert.equal(result.waveformsMatch, true); assert.equal(result.stopped, true);
    assert.match(result.firstCycle[14].cue, /shift up to Upper/);
    assert.match(result.firstCycle[15].cue, /shift down to Middle/);
    assert.ok(result.firstCycle.filter(p => p.midi === 64).every(p => p.string === 1 && p.fret === 5));
    assert.deepEqual(result.descending.map(p => p.midi), [...up].reverse()); assert.equal(result.descendingEnded, true);
  });

  await check('two-octave guided practice checks all 15 notes, octave order, and the upper-position target', async () => {
    const data = await evaluate(() => {
      const s = appState.scalesStudio, realNow = Date.now;
      let clock = realNow() + 20000, id = 0;
      Date.now = () => clock;
      const frame = (midi, freshness = 'fresh', present = true) => {
        clock += 40;
        s.onDetectionResult({
          mode: present ? 'single-note' : 'idle', freshness,
          note: present ? { pitch: { midi, note: 'D', octave: 3 }, confidence: 90 } : undefined,
          performance: { id, attackAt: clock, frameAt: clock, signalPresent: present },
        });
      };
      try {
        s.setPracticeMode('ascending'); s.setMicPracticeActive(true); s.auditionUntil = 0;
        for (let i = 0; i < 5; i++) frame(0, 'none', false);
        id++; frame(62); frame(62); const wrongOctave = s.practiceIndex;
        id++; frame(50, 'held'); frame(50, 'held'); const held = s.practiceIndex;
        const cues = [];
        for (let i = 0; i < 15; i++) {
          const target = s.practiceRun[s.practiceIndex];
          if (!target) break;
          cues.push(document.getElementById('scale-shift-cue').textContent);
          id++; frame(target.midi); frame(target.midi);
        }
        const complete = document.getElementById('scale-practice-target').textContent;
        s.setMicPracticeActive(false);
        s.setRoot('F'); s.setScaleKey('major');
        const unavailable = document.getElementById('scale-pattern-status').textContent;
        const count = s.shiftPattern.length;
        s.setRoot('D'); s.setScaleKey('natural_minor');
        return { wrongOctave, held, cues, complete, unavailable, count };
      } finally { s.setMicPracticeActive(false); Date.now = realNow; }
    });
    assert.equal(data.wrongOctave, 0); assert.equal(data.held, 0);
    assert.equal(data.cues.length, 15); assert.match(data.cues[14], /shift up to Upper/);
    assert.match(data.complete, /Complete: 15\/15/);
    assert.equal(data.count, 0); assert.match(data.unavailable, /No complete two-octave pattern/);
  });

  await check('range changes cancel stale audio starts, preserve key/capo and fit a narrow viewport', async () => {
    const data = await evaluate(async () => {
      const s = appState.scalesStudio, ready = s.onPlayRequested;
      const releases = [];
      s.onPlayRequested = () => new Promise(resolve => releases.push(resolve));
      const pending = s.startScaleAudioRun();
      s.setExerciseRange('position');
      switchTab('chords');
      releases.forEach(release => release()); await pending; await Promise.resolve();
      s.onPlayRequested = ready;
      const cancelled = !s.isAudioRunning && s.audioRunTimer === null && s.playbackSources.size === 0;
      switchTab('scales'); s.setExerciseRange('two-octaves');
      testMain.setCapo(2);
      const first = s.shiftPattern[0], last = s.shiftPattern.at(-1);
      const capo = { first: first.midi, last: last.midi, correct: s.shiftPattern.every(p => s.tuning[p.stringIndex].midi + p.fret === p.midi) };
      testMain.setCapo(0);
      return { cancelled, capo };
    });
    assert.equal(data.cancelled, true); assert.equal(data.capo.correct, true);
    assert.equal(data.capo.first % 12, 2); assert.equal(data.capo.last - data.capo.first, 24);
    await send('Emulation.setDeviceMetricsOverride', { width: 320, height: 760, deviceScaleFactor: 1, mobile: false });
    await evaluate(() => document.getElementById('scale-exercise-range').scrollIntoView({ block: 'start' }));
    await evaluate(async () => {
      await document.fonts.ready;
      await Promise.allSettled(document.getAnimations().filter(a => a.effect.getComputedTiming().iterations !== Infinity).map(a => a.finished));
    });
    assert.equal(await evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
    assert.equal(await evaluate(() => document.querySelectorAll('#scale-exercise-range').length), 1);
    await screenshot('two-octave-pattern-mobile');
    await evaluate(() => {
      document.querySelector('#scale-shift-guide details').open = false;
      appState.scalesStudio.setExerciseRange('position');
      appState.scalesStudio.setPracticeMode('free');
    });
    assert.equal(await evaluate(() => document.getElementById('scale-shift-guide').hidden), true);
    await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  });
}
