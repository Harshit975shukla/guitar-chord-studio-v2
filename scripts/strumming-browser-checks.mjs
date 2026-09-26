import assert from 'node:assert/strict';

export async function checkStrumming({ check, evaluate, send, until, screenshot }) {
  await check('authorized rhythmic audio yields suggestions that transfer to Chord Changes without autoplay', async () => {
    await evaluate(() => {
      switchTab('analysis');
      const sr = 22050, length = Math.ceil(10.1 * sr), pcm = new Float32Array(length);
      for (let bar = 0; bar < 4; bar++) for (const step of [0, 2, 3, 5, 6, 7]) {
        const start = Math.round((.2 + (bar * 8 + step) * .3) * sr);
        for (let i = 0; i < sr * .22 && start + i < length; i++) {
          const t = i / sr, envelope = Math.min(1, t / .003) * Math.exp(-t / .065);
          for (const f of [130.81, 164.81, 196]) pcm[start + i] += .1 * envelope * Math.sin(2 * Math.PI * f * t);
        }
      }
      const bytes = new ArrayBuffer(44 + length * 2), v = new DataView(bytes);
      const word = (at, text) => [...text].forEach((c, i) => v.setUint8(at + i, c.charCodeAt(0)));
      word(0, 'RIFF'); v.setUint32(4, 36 + length * 2, true); word(8, 'WAVE'); word(12, 'fmt ');
      v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
      v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
      word(36, 'data'); v.setUint32(40, length * 2, true);
      pcm.forEach((x, i) => v.setInt16(44 + i * 2, Math.round(x * 32767), true));
      const data = new DataTransfer(); data.items.add(new File([bytes], 'Original offbeat exercise.wav', { type: 'audio/wav' }));
      const input = document.getElementById('analysis-file'); input.files = data.files; input.dispatchEvent(new Event('change'));
      confirmAnalysisRights(); document.getElementById('analysis-start').click();
    });
    await until("document.getElementById('analysis-status').textContent.includes('Draft ready')");
    await evaluate(() => {
      const stale = document.querySelector('#analysis-strumming-results button[data-pattern-id="offbeat-lift"]');
      document.getElementById('analysis-rights').click();
      stale.click();
    });
    assert.equal(await evaluate(() => appState.activeTab), 'analysis');
    assert.equal(await evaluate(() => document.querySelectorAll('#analysis-strumming-results button').length), 0);
    await evaluate(() => { confirmAnalysisRights(); document.getElementById('analysis-start').click(); });
    await until("document.getElementById('analysis-status').textContent.includes('Draft ready')");
    const result = await evaluate(() => {
      const candidate = document.querySelector('#analysis-strumming-results button[data-pattern-id="offbeat-lift"]');
      const status = document.getElementById('analysis-strumming-status').textContent;
      const bpmBefore = document.getElementById('analysis-bpm').value;
      candidate.click();
      return { status, bpmBefore, bpmAfter: document.getElementById('analysis-bpm').value, tab: appState.activeTab,
        mode: document.getElementById('drill-practice-mode').value,
        pattern: document.getElementById('drill-pattern').value, bpm: document.getElementById('drill-bpm').value,
        active: appState.isDrillActive, mic: appState.isListening };
    });
    assert.match(result.status, /suggested, not detected/);
    assert.equal(result.bpmBefore, result.bpmAfter);
    assert.equal(result.tab, 'drill'); assert.equal(result.mode, 'rhythm'); assert.equal(result.pattern, 'offbeat-lift');
    assert.equal(result.bpm, '100'); assert.equal(result.active, false); assert.equal(result.mic, false);
  });

  await check('rhythm drill schedules count-in and every strum cue, changes on bars and cancels cleanly', async () => {
    const result = await evaluate(async () => {
      const ctx = appState.audioContext;
      const oldTime = Object.getOwnPropertyDescriptor(ctx, 'currentTime'), oldResume = ctx.resume;
      const set = window.setTimeout, clear = window.clearTimeout, create = ctx.createOscillator;
      const clicks = [], oscillators = [], timers = new Map();
      let clock = ctx.currentTime * 1000 + 10000, id = 400000;
      Object.defineProperty(ctx, 'currentTime', { configurable: true, get: () => clock / 1000 });
      window.setTimeout = (fn, delay) => { timers.set(++id, { fn, at: clock + delay }); return id; };
      window.clearTimeout = id => { if (!timers.delete(id)) clear(id); };
      ctx.createOscillator = function() {
        const oscillator = create.call(this), start = oscillator.start.bind(oscillator);
        oscillator.start = at => { clicks.push(at); start(at); };
        oscillators.push(oscillator); return oscillator;
      };
      const advance = ms => {
        const end = clock + ms;
        for (let guard = 0; guard < 2000; guard++) {
          const next = [...timers].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
          if (!next) break;
          timers.delete(next[0]); clock = next[1].at; next[1].fn();
        }
        clock = end;
      };
      const config = { progressionType: 'I-IV-V', key: 'C', mode: 'major', practiceMode: 'rhythm',
        strummingPatternId: 'offbeat-lift', bpm: 160, countInBars: 1, barsPerChord: 1, totalChords: 4, checkChords: false, rhythmClicks: true };
      try {
        const startAt = clock / 1000 + .1;
        await testMain.startDrill(config);
        advance(100);
        const countIn = document.getElementById('drill-rhythm-position').textContent;
        advance(1520);
        const firstChord = appState.drillCurrentIndex;
        advance(1500);
        const secondChord = appState.drillCurrentIndex;
        advance(6000);
        const completed = { active: appState.isDrillActive, results: appState.drillResults.chordResults.length,
          startEnabled: !document.getElementById('btn-start-drill').disabled,
          message: document.getElementById('drill-rhythm-status').textContent };
        const expected = [0, 2, 4, 6].map(step => startAt + step * .1875);
        for (let chord = 0; chord < 4; chord++) for (const step of [0, 2, 3, 5, 6, 7]) expected.push(startAt + (8 + chord * 8 + step) * .1875);
        const actual = [...clicks];
        await testMain.startDrill({ ...config, rhythmClicks: false });
        advance(1700);
        document.getElementById('btn-next-drill-chord').click(); advance(120);
        const next = appState.drillCurrentIndex;
        document.getElementById('btn-stop-drill').click();
        const callbacks = [...timers.values()].map(t => t.fn);
        callbacks.forEach(fn => fn()); advance(10000);
        const stopped = !appState.isDrillActive && timers.size === 0 && appState.drillCurrentIndex === next;

        const oldState = Object.getOwnPropertyDescriptor(ctx, 'state');
        let release;
        Object.defineProperty(ctx, 'state', { configurable: true, get: () => 'suspended' });
        ctx.resume = () => new Promise(resolve => { release = resolve; });
        const pending = testMain.startDrill({ ...config, rhythmClicks: false });
        switchTab('songs');
        release(); await pending;
        if (oldState) Object.defineProperty(ctx, 'state', oldState); else delete ctx.state;
        ctx.resume = oldResume;
        return { countIn, firstChord, secondChord, completed, actual, expected, next, stopped,
          pendingCancelled: !appState.isDrillActive && appState.activeTab === 'songs' };
      } finally {
        testMain.stopDrill(); oscillators.forEach(oscillator => oscillator.stop());
        ctx.createOscillator = create; ctx.resume = oldResume;
        if (oldTime) Object.defineProperty(ctx, 'currentTime', oldTime); else delete ctx.currentTime;
        window.setTimeout = set; window.clearTimeout = clear;
      }
    });
    assert.match(result.countIn, /Count-in/); assert.equal(result.firstChord, 0); assert.equal(result.secondChord, 1);
    assert.equal(result.completed.active, false); assert.equal(result.completed.results, 0); assert.equal(result.completed.startEnabled, true);
    assert.match(result.completed.message, /complete/);
    assert.equal(result.actual.length, 28);
    result.expected.forEach((time, i) => assert.ok(Math.abs(time - result.actual[i]) < 1e-6));
    assert.equal(result.next, 1); assert.equal(result.stopped, true); assert.equal(result.pendingCancelled, true);
  });

  await check('rhythm chord checking rejects count-in, held and wrong-quality evidence and handles mic failure', async () => {
    const result = await evaluate(async () => {
      const ctx = appState.audioContext, realNow = Date.now;
      const oldTime = Object.getOwnPropertyDescriptor(ctx, 'currentTime');
      const set = window.setTimeout, clear = window.clearTimeout;
      const timers = new Map(); let clock = ctx.currentTime * 1000 + 10000, id = 500000;
      Date.now = () => 1000000 + clock;
      Object.defineProperty(ctx, 'currentTime', { configurable: true, get: () => clock / 1000 });
      window.setTimeout = (fn, delay) => { timers.set(++id, { fn, at: clock + delay }); return id; };
      window.clearTimeout = id => { if (!timers.delete(id)) clear(id); };
      const advance = ms => {
        const end = clock + ms;
        for (let guard = 0; guard < 1000; guard++) {
          const next = [...timers].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
          if (!next) break; timers.delete(next[0]); clock = next[1].at; next[1].fn();
        }
        clock = end;
      };
      const frame = (symbol, fresh, performanceId, signal = true) => testMain.handleDetectionResult({
        mode: signal ? 'chord' : 'idle', freshness: fresh ? 'fresh' : signal ? 'held' : 'none', timestamp: Date.now(),
        chord: signal ? { symbol, root: 'D', quality: 'Major', confidence: 85, candidates: [{ symbol: 'D', confidence: 80 }], activeNotes: [], intervals: '' } : undefined,
        chroma: new Float32Array(12), peaks: [], spectrum: new Float32Array(0), signalLevelDb: -20,
        performance: { id: performanceId, attackAt: Date.now(), frameAt: Date.now(), signalPresent: signal },
      }, new Float32Array(0));
      try {
        testMain.setCapo(2); appState.isListening = true;
        await testMain.startDrill({ progressionType: 'I-IV-V', key: 'C', mode: 'major', bpm: 160,
          barsPerChord: 1, countInBars: 1, totalChords: 4, practiceMode: 'rhythm', strummingPatternId: 'quarter-down', checkChords: true, rhythmClicks: false });
        frame('', false, 0, false); advance(160); frame('', false, 0, false);
        frame('D', true, 1); const early = appState.drillResults.chordResults.length;
        advance(1500);
        frame('C', true, 2); frame('Dm', true, 3); frame('D', false, 4);
        const rejected = appState.drillResults.chordResults.length;
        frame('D', true, 5); frame('D', true, 5);
        const accepted = appState.drillResults.chordResults.length;
        const target = appState.drillResults.chordResults[0]?.targetChord;
        advance(1500);
        testMain.handleDetectionResult({ mode: 'idle', freshness: 'none', isCalibrating: true, calibrationProgress: 50,
          timestamp: Date.now(), chroma: new Float32Array(12), peaks: [], spectrum: new Float32Array(0), signalLevelDb: -120 }, new Float32Array(0));
        advance(1500);
        const afterCalibrationWindow = appState.drillResults.chordResults.length;
        testMain.stopMicrophone();
        advance(4000);
        return { early, rejected, accepted, target, afterCalibrationWindow, stopped: !appState.isDrillActive,
          status: document.getElementById('drill-rhythm-status').textContent };
      } finally {
        appState.isListening = false; testMain.stopDrill(); testMain.setCapo(0); Date.now = realNow;
        if (oldTime) Object.defineProperty(ctx, 'currentTime', oldTime); else delete ctx.currentTime;
        window.setTimeout = set; window.clearTimeout = clear;
      }
    });
    assert.equal(result.early, 0); assert.equal(result.rejected, 0); assert.equal(result.accepted, 1); assert.equal(result.target, 'C');
    assert.equal(result.afterCalibrationWindow, 1);
    assert.equal(result.stopped, true); assert.match(result.status, /Microphone stopped/);
    const denied = await evaluate(async () => {
      switchTab('drill');
      const media = navigator.mediaDevices.getUserMedia;
      navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('Test denial', 'NotAllowedError'); };
      try {
        await testMain.startDrill({ progressionType: 'I-IV-V', key: 'C', bpm: 100, barsPerChord: 1, countInBars: 1, totalChords: 4,
          practiceMode: 'rhythm', strummingPatternId: 'quarter-down', checkChords: true });
        return { active: appState.isDrillActive, status: document.getElementById('drill-rhythm-status').textContent,
          enabled: !document.getElementById('btn-start-drill').disabled };
      } finally { navigator.mediaDevices.getUserMedia = media; }
    });
    assert.equal(denied.active, false); assert.equal(denied.enabled, true); assert.match(denied.status, /Microphone unavailable/);
  });
  await check('stopping the original chord-match exercise invalidates delayed auto-advance', async () => {
    const result = await evaluate(async () => {
      const set = window.setTimeout, clear = window.clearTimeout;
      const callbacks = new Map(); let nextId = 600000;
      try {
        appState.isListening = true;
        await testMain.startDrill({ progressionType: 'I-IV-V', key: 'C', mode: 'major', bpm: 100, barsPerChord: 1, countInBars: 1, totalChords: 4, practiceMode: 'match' });
        window.setTimeout = (callback, delay) => { callbacks.set(++nextId, { callback, delay }); return nextId; };
        window.clearTimeout = id => { if (!callbacks.has(id)) clear(id); };
        testMain.handleDetectionResult({ mode: 'chord', freshness: 'fresh', timestamp: Date.now(),
          chord: { symbol: 'C', root: 'C', quality: 'Major', confidence: 90, activeNotes: [], intervals: '' },
          chroma: new Float32Array(12), peaks: [], spectrum: new Float32Array(0), signalLevelDb: -20 }, new Float32Array(0));
        testMain.stopDrill();
        for (const { callback } of callbacks.values()) callback();
        return { index: appState.drillCurrentIndex, active: appState.isDrillActive, pendingAdvance: [...callbacks.values()].some(c => c.delay === 750) };
      } finally { appState.isListening = false; testMain.stopDrill(); window.setTimeout = set; window.clearTimeout = clear; }
    });
    assert.equal(result.pendingAdvance, true); assert.equal(result.index, 0); assert.equal(result.active, false);
  });
  await evaluate(() => {
    document.getElementById('drill-practice-mode').value = 'rhythm';
    document.getElementById('drill-practice-mode').dispatchEvent(new Event('change'));
    document.getElementById('drill-total-chords').value = '4';
    document.getElementById('drill-bars-per-chord').value = '1';
    document.getElementById('btn-start-drill').click();
    document.getElementById('drill-pattern-grid').scrollIntoView({ block: 'center' });
  });
  await until('appState.isDrillActive');
  await screenshot('strumming-drill-desktop');
  await check('strumming exercise controls and pulse fit 320px', async () => {
    await send('Emulation.setDeviceMetricsOverride', { width: 320, height: 760, deviceScaleFactor: 1, mobile: false });
    await evaluate(() => {
      document.getElementById('drill-pattern-grid').scrollIntoView({ block: 'center' });
    });
    await evaluate(async () => {
      await document.fonts.ready;
      await Promise.allSettled(document.getAnimations().filter(a => a.effect.getComputedTiming().iterations !== Infinity).map(a => a.finished));
    });
    assert.equal(await evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
    assert.equal(await evaluate(() => document.querySelectorAll('#drill-pattern-grid .strumming-step').length), 8);
    await screenshot('strumming-drill-mobile');
    await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
    await evaluate(() => { testMain.stopDrill(); switchTab('songs'); });
  });
}
