import assert from 'node:assert/strict';

export async function checkPercussion({ check, evaluate, send, until, screenshot }) {
  await evaluate(async () => {
    const url = performance.getEntriesByType('resource').findLast(e => new URL(e.name).pathname === '/src/ui/percussionPlayer.ts').name;
    const { PercussionPlayer } = await import(url), original = PercussionPlayer.prototype.setActive;
    PercussionPlayer.prototype.setActive = function(active) { window.percussion = this; original.call(this, active); };
    document.getElementById('tab-rhythm').click(); PercussionPlayer.prototype.setActive = original;
    window.percussionSelect = (id, value, event = 'change') => { const el = document.getElementById(id); el.value = value; el.dispatchEvent(new Event(event)); };
  });
  await check('actual percussion output is louder than the legacy tabla graph with bounded layered peaks', async () => {
    const levels = await evaluate(async () => {
      const { PercussionBus } = await import('/src/audio/percussion.ts');
      window.percussionRender = async (type, options = {}) => {
        const ctx = new OfflineAudioContext(1, 48000, 48000);
        const bus = new PercussionBus(ctx, { volume: options.volume ?? 1, bass: options.bass ?? .8, treble: options.treble ?? .75 });
        for (let i = 0; i < (options.hits ?? 1); i++) bus.play(type, options.kit ?? 'original', 1, .02 + i * .02);
        if (options.cancelFuture) bus.stop();
        const rendered = await ctx.startRendering(), samples = rendered.getChannelData(0);
        let peak = 0, sum = 0;
        for (const sample of samples) { peak = Math.max(peak, Math.abs(sample)); sum += sample * sample; }
        bus.dispose(); return { peak, rms: Math.sqrt(sum / samples.length), finite: samples.every(Number.isFinite) };
      };
      const legacy = async type => {
        const ctx = new OfflineAudioContext(1, 48000, 48000), at = .02;
        if (type === 'bayan' || type === 'bayan_dayan') {
          const osc = ctx.createOscillator(), gain = ctx.createGain();
          osc.type = 'sine'; osc.frequency.setValueAtTime(140, at); osc.frequency.exponentialRampToValueAtTime(55, at + .16);
          gain.gain.setValueAtTime(.8 * .5, at); gain.gain.exponentialRampToValueAtTime(.0001, at + .22);
          osc.connect(gain); gain.connect(ctx.destination); osc.start(at); osc.stop(at + .24);
        }
        if (type !== 'bayan') {
          const osc = ctx.createOscillator(), bp = ctx.createBiquadFilter(), gain = ctx.createGain();
          bp.type = 'bandpass'; bp.frequency.value = 340; bp.Q.value = 6;
          osc.type = 'triangle'; osc.frequency.setValueAtTime(360, at); osc.frequency.exponentialRampToValueAtTime(180, at + .08);
          gain.gain.setValueAtTime(.75 * .32, at); gain.gain.exponentialRampToValueAtTime(.0001, at + .12);
          osc.connect(bp); bp.connect(gain); gain.connect(ctx.destination); osc.start(at); osc.stop(at + .14);
        }
        const samples = (await ctx.startRendering()).getChannelData(0);
        return Math.sqrt(samples.reduce((sum, x) => sum + x * x, 0) / samples.length);
      };
      const result = [];
      for (const voice of ['bayan', 'dayan_na', 'dayan_tin', 'dayan_ta', 'bayan_dayan']) {
        const old = await legacy(voice), current = await percussionRender(voice);
        result.push({ voice, oldRms: old, newRms: current.rms, gainDb: 20 * Math.log10(current.rms / old), peak: current.peak });
      }
      window.percussionMeasurements = result;
      return result;
    });
    console.log('  Percussion RMS comparison:', JSON.stringify(levels));
    for (const level of levels) { assert.ok(level.gainDb >= 3, `${level.voice} must gain at least 3 dB`); assert.ok(level.peak < .88); }
    const bounds = await evaluate(async () => {
      const results = [];
      for (const kit of ['original', 'tabla', 'conga', 'bongos', 'cajon', 'drums']) {
        results.push({ kit, ...(await percussionRender('bayan_dayan', { kit, volume: 1.5, bass: 1, treble: 1, hits: 12 })) });
      }
      return results;
    });
    assert.ok(bounds.every(x => x.finite && x.peak > .1 && x.peak < .88));
  });
  await check('percussion gain provides true mute, independent low/high levels, boost and cancelled sources', async () => {
    const result = await evaluate(async () => {
      const normal = await percussionRender('bayan_dayan');
      const boosted = await percussionRender('bayan_dayan', { volume: 1.5 });
      const muted = await percussionRender('bayan_dayan', { volume: 0 });
      const lowMuted = await percussionRender('bayan', { bass: 0 });
      const highMuted = await percussionRender('dayan_na', { treble: 0 });
      const cancelled = await percussionRender('bayan_dayan', { cancelFuture: true });
      const { PercussionBus } = await import('/src/audio/percussion.ts');
      const ctx = new OfflineAudioContext(1, 24000, 48000), bus = new PercussionBus(ctx);
      bus.play('bayan_dayan', 'original', 1, .01);
      const suspended = ctx.suspend(.1).then(async () => { bus.stop(); await ctx.resume(); });
      const rendered = await ctx.startRendering(); await suspended;
      const tail = rendered.getChannelData(0).slice(Math.ceil(.13 * 48000));
      const stoppedTail = tail.reduce((peak, value) => Math.max(peak, Math.abs(value)), 0);
      bus.dispose();
      return { normal, boosted, muted, lowMuted, highMuted, cancelled, stoppedTail };
    });
    assert.ok(result.boosted.rms > result.normal.rms * 1.15);
    for (const name of ['muted', 'lowMuted', 'highMuted', 'cancelled']) assert.equal(result[name].peak, 0, name);
    assert.ok(result.stoppedTail < 1e-6);
  });
  await check('percussion controls preview each instrument and adjust only the percussion bus', async () => {
    await evaluate(async () => {
      await appState.songStudio.onPlayRequested();
      window.percussionBefore = JSON.stringify({ settings: appState.settings, frets: appState.currentFretboardState });
    });
    assert.equal(await evaluate(() => document.querySelectorAll('#dock-rhythm-select option').length), 18);
    assert.equal(await evaluate(() => document.getElementById('btn-rhythm-master-toggle')), null);
    for (const kit of ['original', 'tabla', 'conga', 'bongos', 'cajon', 'drums']) {
      await evaluate(`percussionSelect('percussion-instrument','${kit}');document.getElementById('percussion-preview').click()`);
      await until("document.getElementById('rhythm-dock').dataset.state === 'preview'");
      assert.equal(await evaluate(() => percussion.bus.sources.size), 2);
      await evaluate(() => document.getElementById('btn-dock-rhythm-toggle').click());
      assert.equal(await evaluate(() => percussion.bus.sources.size), 0);
    }
    await evaluate(() => {
      percussionSelect('percussion-volume', '1.5', 'input'); percussionSelect('dock-bass-vol', '.4', 'input'); percussionSelect('dock-treble-vol', '.6', 'input');
      // AudioParam getters can retain their last rendered value while a branch is idle.
      document.getElementById('percussion-preview').click();
      window.percussionLevelAt = appState.audioContext.currentTime + .1;
    });
    await until("percussion.mode === 'preview' && appState.audioContext.currentTime > percussionLevelAt");
    const controls = await evaluate(() => {
      return { gains: [percussion.bus.master.gain.value, percussion.bus.bass.gain.value, percussion.bus.treble.gain.value],
        labels: ['percussion-volume-readout','percussion-bass-readout','percussion-treble-readout'].map(id => document.getElementById(id).value),
        unchanged: percussionBefore === JSON.stringify({ settings: appState.settings, frets: appState.currentFretboardState }),
        mic: appState.isListening };
    });
    controls.gains.forEach((gain, i) => assert.ok(Math.abs(gain - [.75, .4, .6][i]) < 1e-5, JSON.stringify(controls)));
    assert.deepEqual(controls.labels, ['150%', '40%', '60%']); assert.equal(controls.unchanged, true); assert.equal(controls.mic, false);
    await evaluate(() => {
      document.getElementById('btn-dock-rhythm-toggle').click();
      percussionSelect('percussion-volume', '1', 'input'); percussionSelect('dock-bass-vol', '.8', 'input'); percussionSelect('dock-treble-vol', '.75', 'input');
      percussionSelect('percussion-instrument', 'tabla');
      document.getElementById('percussion-heading').scrollIntoView({ block: 'start' });
    });
    await screenshot('percussion-desktop');
  });
  await check('percussion timing, instrument changes and cancelled audio starts never duplicate or leak playback', async () => {
    const timing = await evaluate(async () => {
      const timeout = window.setTimeout, clear = window.clearTimeout;
      const timers = new Map(); let timerId = 90000;
      window.setTimeout = (fn, delay) => { const id = ++timerId; timers.set(id, { fn, delay }); return id; };
      window.clearTimeout = id => { timers.delete(id); };
      const flush = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };
      try {
        document.getElementById('btn-dock-rhythm-toggle').click(); await flush();
        const first = { step: percussion.step, timers: timers.size, delay: [...timers.values()][0]?.delay };
        percussionSelect('dock-tempo-slider', '160', 'input');
        const [id, timer] = [...timers][0]; timers.delete(id); timer.fn();
        const faster = { step: percussion.step, timers: timers.size, delay: [...timers.values()][0]?.delay };
        percussionSelect('percussion-instrument', 'conga');
        const unchangedStep = percussion.step;
        const [nextId, next] = [...timers][0]; timers.delete(nextId); next.fn();
        const changedVoice = document.getElementById('percussion-pulse').textContent;
        document.getElementById('btn-dock-rhythm-toggle').click();
        const stopped = { timers: timers.size, sources: percussion.bus.sources.size, state: percussion.mode };
        document.getElementById('btn-dock-rhythm-toggle').click(); await flush(); switchTab('chords');
        return { first, faster, unchangedStep, changedVoice, stopped, exit: { timers: timers.size, sources: percussion.bus.sources.size, state: percussion.mode } };
      } finally { percussion.stop(); window.setTimeout = timeout; window.clearTimeout = clear; }
    });
    assert.deepEqual(timing.first, { step: 1, timers: 1, delay: 750 });
    assert.deepEqual(timing.faster, { step: 2, timers: 1, delay: 375 });
    assert.equal(timing.unchangedStep, 2); assert.match(timing.changedVoice, /conga/i);
    assert.deepEqual(timing.stopped, { timers: 0, sources: 0, state: 'idle' }); assert.deepEqual(timing.exit, timing.stopped);
    const cancelled = await evaluate(async () => {
      const original = percussion.getAudio; const results = [];
      try {
        for (const action of ['stop','tab','instrument','pattern','pagehide']) {
          switchTab('rhythm'); let resolve;
          percussion.getAudio = () => new Promise(done => { resolve = done; });
          document.getElementById('btn-dock-rhythm-toggle').click();
          if (action === 'stop') document.getElementById('btn-dock-rhythm-toggle').click();
          if (action === 'tab') switchTab('detector');
          if (action === 'instrument') percussionSelect('percussion-instrument', 'bongos');
          if (action === 'pattern') percussionSelect('dock-rhythm-select', 'conga_practice');
          if (action === 'pagehide') window.dispatchEvent(new Event('pagehide'));
          resolve(appState.audioContext); await Promise.resolve(); await Promise.resolve();
          results.push({ action, state: percussion.mode, timer: percussion.timer, sources: percussion.bus.sources.size });
          if (action === 'pagehide') window.dispatchEvent(new Event('pageshow'));
        }
        switchTab('rhythm'); percussion.getAudio = async () => { throw new Error('Synthetic audio refusal'); };
        document.getElementById('btn-dock-rhythm-toggle').click(); await Promise.resolve(); await Promise.resolve();
        const error = document.getElementById('percussion-status').textContent;
        return { results, error };
      } finally { percussion.getAudio = original; percussion.stop(); }
    });
    for (const result of cancelled.results) { assert.equal(result.state, 'idle'); assert.equal(result.timer, null); assert.equal(result.sources, 0); }
    assert.match(cancelled.error, /Synthetic audio refusal/);
    await evaluate(() => { percussionSelect('dock-tempo-slider', '80', 'input'); document.getElementById('btn-dock-rhythm-toggle').click(); });
    await until("percussion.mode === 'playing'");
    await evaluate(() => appState.audioContext.suspend());
    await until("percussion.mode === 'idle'");
    await evaluate(() => appState.audioContext.resume());
  });
  await check('percussion has one keyboard-accessible control set and fits 320px with sixteen pulses', async () => {
    await send('Emulation.setDeviceMetricsOverride', { width: 320, height: 850, deviceScaleFactor: 1, mobile: false });
    await evaluate(() => {
      percussionSelect('dock-rhythm-select', 'teentaal');
      document.getElementById('percussion-heading').scrollIntoView({ block: 'start' });
    });
    await screenshot('percussion-mobile');
    assert.equal(await evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
    assert.equal(await evaluate(() => document.querySelectorAll('#dock-beat-dots span').length), 16);
    await evaluate(() => document.getElementById('btn-dock-rhythm-toggle').focus());
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
    await until("percussion.mode === 'playing'");
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    assert.equal(await evaluate(() => percussion.mode), 'idle');
    assert.equal(await evaluate(() => document.querySelectorAll('#percussion-volume').length), 1);
    await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  });
}
