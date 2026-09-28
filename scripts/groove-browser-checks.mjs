import assert from 'node:assert/strict';

export async function checkGrooves({ check, evaluate, send, until, screenshot }) {
  await evaluate(async () => {
    const url = performance.getEntriesByType('resource').findLast(e => new URL(e.name).pathname === '/src/ui/grooveTrainer.ts').name;
    const { GrooveTrainer } = await import(url), original = GrooveTrainer.prototype.setActive;
    GrooveTrainer.prototype.setActive = function(active) { window.groove = this; original.call(this, active); };
    switchTab('rhythm'); GrooveTrainer.prototype.setActive = original;
    const pulseUrl = performance.getEntriesByType('resource').findLast(e => new URL(e.name).pathname === '/src/ui/percussionPlayer.ts').name;
    const { PercussionPlayer } = await import(pulseUrl), pulseActive = PercussionPlayer.prototype.setActive;
    PercussionPlayer.prototype.setActive = function(active) { window.percussion = this; pulseActive.call(this, active); };
    switchTab('chords'); switchTab('rhythm'); PercussionPlayer.prototype.setActive = pulseActive;
    window.grooveEl = selector => document.querySelector(`.groove ${selector}`);
    window.grooveSet = (selector, value, type = 'change') => { const el = grooveEl(selector); el.value = value; el.dispatchEvent(new Event(type, { bubbles: true })); };
    window.grooveErrors = [];
    window.addEventListener('error', event => grooveErrors.push(String(event.message)));
  });

  await check('drum grooves load the studio kit, count in and schedule ahead of the audio clock', async () => {
    const initial = await evaluate(() => ({
      options: document.querySelectorAll('.groove [data-groove-select] option').length,
      groups: document.querySelectorAll('.groove [data-groove-select] optgroup').length,
      kits: [...document.querySelectorAll('.groove [data-groove-kit] option')].map(o => o.value),
      rows: document.querySelectorAll('.groove .groove-row').length, cells: document.querySelectorAll('.groove .groove-cell').length,
      state: groove.mode, pulses: document.querySelectorAll('#dock-beat-dots span').length,
    }));
    assert.ok(initial.options >= 24 && initial.groups >= 6, JSON.stringify(initial));
    assert.deepEqual(initial.kits.slice(0, 2), ['studio', 'drums']);
    assert.equal(initial.state, 'idle'); assert.equal(initial.rows, 3); assert.equal(initial.cells, 48);
    await evaluate(() => { grooveSet('[data-groove-select]', 'rock'); grooveSet('[data-groove-bpm]', '150'); grooveEl('[data-groove-play]').click(); });
    await until("groove.mode === 'playing'");
    const early = await evaluate(() => ({ kit: groove.kit, bar: groove.sequencer.bar, bpm: groove.sequencer.bpm,
      lead: Math.max(...groove.cues.map(c => c.time)) - groove.bus.context.currentTime }));
    assert.equal(early.kit, 'studio'); assert.equal(early.bpm, 150); assert.ok(early.bar <= 0);
    assert.ok(early.lead > 0 && early.lead <= .2, `lookahead ${early.lead}`);
    await until("groove.sequencer && groove.sequencer.bar >= 2 && document.querySelector('.groove [data-groove-bar]').textContent.startsWith('Bar')");
    const running = await evaluate(() => ({
      now: document.querySelectorAll('.groove .groove-cell[data-now]').length, beat: document.querySelector('.groove [data-groove-beats] li[data-now]')?.textContent,
      sources: groove.bus.sources.size, bar: document.querySelector('.groove [data-groove-bar]').textContent,
      pressed: grooveEl('[data-groove-play]').getAttribute('aria-pressed'), label: grooveEl('[data-groove-play]').textContent, errors: grooveErrors,
    }));
    assert.ok(running.now >= 3, JSON.stringify(running)); assert.ok(running.sources > 0); assert.match(running.bar, /^Bar \d+/);
    assert.equal(running.pressed, 'true'); assert.equal(running.label, 'Stop drums'); assert.deepEqual(running.errors, []);
  });

  await check('fills, chorus, tempo and kit changes apply at bar lines without stopping the groove', async () => {
    await evaluate(() => grooveEl('[data-groove-fill]').click());
    assert.equal(await evaluate(() => groove.sequencer.fillPending || document.querySelector('.groove [data-groove-stage]').dataset.kind === 'fill'), true);
    await until("document.querySelector('.groove [data-groove-stage]').dataset.kind === 'fill'");
    await until("document.querySelector('.groove [data-groove-stage]').dataset.kind === 'groove'");
    await evaluate(() => grooveEl('[data-groove-section="chorus"]').click());
    assert.equal(await evaluate(() => groove.sequencer.pendingSection), 'chorus');
    await until("groove.sequencer.section === 'chorus' && document.querySelector('.groove [data-groove-phase]').textContent.startsWith('Chorus')");
    assert.ok(await evaluate(() => [...document.querySelectorAll('.groove .groove-lane')].some(e => e.textContent === 'Open hat')));
    await evaluate(() => grooveSet('[data-groove-bpm]', '96'));
    assert.equal(await evaluate(() => groove.sequencer.bpm), 96);
    await evaluate(() => grooveSet('[data-groove-kit]', 'drums-smooth'));
    await until("groove.playingKit === 'drums-smooth'");
    assert.equal(await evaluate(() => groove.mode), 'playing');
    await evaluate(() => { grooveEl('[data-groove-play]').click(); });
    const stopped = await evaluate(() => ({ mode: groove.mode, timer: groove.timer, sources: groove.bus.sources.size, frame: groove.frame, sequencer: groove.sequencer }));
    assert.deepEqual(stopped, { mode: 'idle', timer: null, sources: 0, frame: 0, sequencer: null });
    await evaluate(() => grooveSet('[data-groove-kit]', 'studio'));
  });

  await check('rapid kit changes keep the newest kit, a failed kit keeps the playing one, and playing kits stay cached', async () => {
    await evaluate(() => grooveEl('[data-groove-play]').click());
    await until("groove.mode === 'playing' && groove.playingKit === 'studio'");
    const race = await evaluate(async () => {
      const bus = groove.bus, real = bus.prepareVoices.bind(bus), loads = [];
      const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
      // Hold each kit load so completion order can be controlled.
      bus.prepareVoices = (voices, kit) => new Promise((resolve, reject) => loads.push({ voices: [...voices], kit, resolve, reject }));
      try {
        grooveSet('[data-groove-kit]', 'drums-energetic');
        grooveSet('[data-groove-kit]', 'drums-minimalistic');
        const pending = { kit: groove.kit, playing: groove.playingKit, select: grooveEl('[data-groove-kit]').value };
        await real(loads[1].voices, loads[1].kit); loads[1].resolve(); await flush();
        const latest = groove.playingKit;
        await real(loads[0].voices, loads[0].kit); loads[0].resolve(); await flush();
        const stale = groove.playingKit;
        grooveSet('[data-groove-kit]', 'drums-monumental');
        loads[2].reject(new Error('Synthetic kit failure')); await flush();
        return { pending, latest, stale, failed: { kit: groove.kit, playing: groove.playingKit, select: grooveEl('[data-groove-kit]').value, mode: groove.mode },
          status: grooveEl('[data-groove-status]').textContent };
      } finally { delete bus.prepareVoices; }
    });
    assert.deepEqual(race.pending, { kit: 'drums-minimalistic', playing: 'studio', select: 'drums-minimalistic' });
    assert.equal(race.latest, 'drums-minimalistic'); assert.equal(race.stale, 'drums-minimalistic');
    assert.deepEqual(race.failed, { kit: 'drums-minimalistic', playing: 'drums-minimalistic', select: 'drums-minimalistic', mode: 'playing' });
    assert.match(race.status, /could not load, so Minimal keeps playing\. Synthetic kit failure/);
    const bar = await evaluate(() => groove.sequencer.bar);
    await until(`groove.sequencer && groove.sequencer.bar >= ${bar + 1} && groove.mode === 'playing'`);
    await evaluate(() => { grooveEl('[data-groove-play]').click(); grooveSet('[data-groove-kit]', 'studio'); });
    const cache = await evaluate(async () => {
      const { PercussionBus } = await import('/src/audio/percussion.ts');
      const context = new OfflineAudioContext(1, 48000, 48000), bus = new PercussionBus(context);
      const play = (kit, at) => { try { bus.playVoice('kick', kit, .8, at); return true; } catch { return false; } };
      await bus.prepareVoices(['kick'], 'drums'); await bus.prepareVoices(['kick'], 'drums-smooth');
      const started = play('drums', .01);
      // Two later loads used to evict the oldest bank even while it was playing.
      await bus.prepareVoices(['kick'], 'drums-energetic'); await bus.prepareVoices(['kick'], 'drums-powerful');
      const kept = play('drums', .2);
      bus.stop();
      await bus.prepareVoices(['kick'], 'drums-monumental');
      const released = !play('drums', .3);
      bus.dispose();
      return { started, kept, released };
    });
    assert.deepEqual(cache, { started: true, kept: true, released: true });
  });

  await check('studio kit layers keep recorded dynamics and balance with the Musicca kick', async () => {
    const levels = await evaluate(async () => {
      const { PercussionBus } = await import('/src/audio/percussion.ts');
      const context = new OfflineAudioContext(1, 48000 * 4, 48000), bus = new PercussionBus(context, { volume: 1, bass: 1, treble: 1 });
      await bus.prepareVoices(['snare', 'hihat', 'kick'], 'studio');
      const buffers = [], create = context.createBufferSource.bind(context);
      context.createBufferSource = () => { const source = create(); const set = Object.getOwnPropertyDescriptor(AudioBufferSourceNode.prototype, 'buffer').set;
        Object.defineProperty(source, 'buffer', { set(value) { buffers.push(value); set.call(this, value); }, get() { return buffers.at(-1); } }); return source; };
      const plan = [['snare', .3], ['snare', .8], ['snare', 1], ['hihat', .3], ['hihat', .8], ['kick', 1]];
      plan.forEach(([voice, velocity], i) => bus.playVoice(voice, 'studio', velocity, .05 + i * .6));
      const samples = (await context.startRendering()).getChannelData(0);
      const peaks = plan.map((_, i) => { let peak = 0; for (let s = Math.floor((.05 + i * .6) * 48000); s < Math.floor((.6 + i * .6) * 48000); s++) peak = Math.max(peak, Math.abs(samples[s])); return peak; });
      bus.dispose();
      return { peaks, distinct: new Set(buffers.slice(0, 3)).size, finite: samples.every(Number.isFinite) };
    });
    console.log('  Studio kit peaks (ghost/normal/accent snare, soft/normal hat, kick):', levels.peaks.map(p => p.toFixed(3)).join(', '));
    const [ghost, normal, accent, softHat, hat, kick] = levels.peaks, db = (a, b) => 20 * Math.log10(a / b);
    assert.equal(levels.distinct, 3); assert.equal(levels.finite, true);
    assert.ok(ghost < normal && normal < accent, 'snare layers keep their order');
    assert.ok(db(ghost, accent) < -8 && db(ghost, accent) > -26, `ghost ${db(ghost, accent).toFixed(1)} dB`);
    assert.ok(softHat < hat && hat > .05);
    assert.ok(Math.abs(db(accent, kick)) < 7, `snare accent vs kick ${db(accent, kick).toFixed(1)} dB`);
    assert.ok(Math.max(...levels.peaks) < .88);
  });

  await check('your own loop decodes locally, derives its tempo, counts in and loops on the bar', async () => {
    await evaluate(() => {
      grooveEl('[data-groove-source="loop"]').click();
      const rate = 48000, frames = rate * 2, pcm = new Int16Array(frames);
      for (let beat = 0; beat < 4; beat++) for (let i = 0; i < 2400; i++) pcm[beat * rate / 2 + i] = Math.round(Math.sin(i / 3) * Math.exp(-i / 400) * 20000);
      const header = new DataView(new ArrayBuffer(44)), text = (at, value) => [...value].forEach((c, i) => header.setUint8(at + i, c.charCodeAt(0)));
      text(0, 'RIFF'); header.setUint32(4, 36 + frames * 2, true); text(8, 'WAVEfmt '); header.setUint32(16, 16, true); header.setUint16(20, 1, true);
      header.setUint16(22, 1, true); header.setUint32(24, rate, true); header.setUint32(28, rate * 2, true); header.setUint16(32, 2, true);
      header.setUint16(34, 16, true); text(36, 'data'); header.setUint32(40, frames * 2, true);
      const transfer = new DataTransfer();
      transfer.items.add(new File([header.buffer, pcm.buffer], 'my-drum-loop.wav', { type: 'audio/wav' }));
      const input = grooveEl('[data-groove-file]'); input.files = transfer.files; input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await until("/120\\.0 BPM as 1 bar of 4\\/4/.test(document.querySelector('.groove [data-groove-loop-info]').textContent)");
    const panel = await evaluate(() => ({ fill: grooveEl('[data-groove-fill]').hidden, sections: grooveEl('[data-groove-sections]').hidden,
      bpm: grooveEl('[data-groove-bpm]').value, disabled: grooveEl('[data-groove-bpm]').disabled,
      privacy: document.querySelector('.groove [data-groove-panel="loop"]').textContent }));
    assert.equal(panel.fill, true); assert.equal(panel.sections, true); assert.equal(panel.bpm, '120.0'); assert.equal(panel.disabled, true);
    assert.match(panel.privacy, /not uploaded, saved or shared/);
    const outOfRange = await evaluate(() => {
      grooveSet('[data-groove-loop-bars]', '8');
      const info = document.querySelector('.groove [data-groove-loop-info]').textContent;
      grooveEl('[data-groove-play]').click();
      const result = { info, status: grooveEl('[data-groove-status]').textContent, mode: groove.mode };
      grooveSet('[data-groove-loop-bars]', '1');
      return result;
    });
    assert.match(outOfRange.info, /960\.0 BPM as 8 bars of 4\/4 · outside 30–260 BPM/);
    assert.match(outOfRange.status, /would be 960\.0 BPM\. Choose a bar count or time signature that gives 30–260 BPM/);
    assert.equal(outOfRange.mode, 'idle');
    await evaluate(() => { grooveSet('[data-groove-gap]', 'off'); grooveEl('[data-groove-play]').click(); });
    await until("groove.mode === 'playing' && groove.loopSource !== null");
    const loop = await evaluate(() => ({ loop: groove.loopSource.loop, duration: groove.loopSource.buffer.duration, kind: groove.sequencer.groove.loop,
      startedAfter: groove.sequencer.musicStart - groove.sequencer.startTime }));
    assert.equal(loop.loop, true); assert.equal(loop.duration, 2); assert.equal(loop.kind, true); assert.ok(Math.abs(loop.startedAfter - 2) < 1e-9);
    await until('groove.sequencer.bar >= 1');
    assert.notEqual(await evaluate(() => document.querySelector('.groove [data-groove-stage]').dataset.kind), 'gap');
    // Silent bars chosen while the loop plays take effect at the next bar line.
    await evaluate(() => grooveSet('[data-groove-gap]', '1-1'));
    await until("document.querySelector('.groove [data-groove-stage]').dataset.kind === 'gap'");
    await evaluate(() => grooveEl('[data-groove-play]').click());
    assert.deepEqual(await evaluate(() => ({ mode: groove.mode, loop: groove.loopSource, gain: groove.loopGain })), { mode: 'idle', loop: null, gain: null });
    await evaluate(() => { grooveSet('[data-groove-gap]', 'off'); grooveEl('[data-groove-source="grooves"]').click(); });
  });

  await check('pulse patterns, tab changes, Escape, hidden pages, the room-check hook and refused audio stop the drums', async () => {
    const results = await evaluate(async () => {
      const waitFor = test => new Promise(resolve => { const tick = () => test() ? resolve() : setTimeout(tick, 20); tick(); });
      const wait = () => waitFor(() => groove.mode === 'playing');
      const result = {};
      grooveEl('[data-groove-play]').click(); await wait();
      document.getElementById('btn-dock-rhythm-toggle').click();
      result.pulseStart = groove.mode;
      await waitFor(() => percussion.mode === 'playing');
      result.pulse = { groove: groove.mode, pulse: percussion.mode };
      grooveEl('[data-groove-play]').click(); await wait();
      result.pulseAfterGroove = percussion.mode;
      switchTab('chords');
      result.tab = { mode: groove.mode, sources: groove.bus.sources.size, timer: groove.timer };
      switchTab('rhythm'); grooveEl('[data-groove-play]').click(); await wait();
      grooveEl('[data-groove-play]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      result.escape = groove.mode;
      grooveEl('[data-groove-play]').click(); await wait();
      window.dispatchEvent(new Event('pagehide'));
      result.pagehide = groove.mode;
      // Other page-lifecycle owners (shared 3D necks) wait for the matching pageshow.
      window.dispatchEvent(new Event('pageshow'));
      grooveEl('[data-groove-play]').click(); await wait();
      groove.stopIfActive('Drums stopped for the room check. Start them again after calibration finishes.');
      result.room = { mode: groove.mode, status: grooveEl('[data-groove-status]').textContent };
      const original = groove.getAudio;
      groove.getAudio = async () => { throw new Error('Wait for the room check to finish before playing percussion.'); };
      grooveEl('[data-groove-play]').click();
      await new Promise(resolve => setTimeout(resolve, 30));
      result.refused = { mode: groove.mode, status: grooveEl('[data-groove-status]').textContent };
      groove.getAudio = original;
      return result;
    });
    assert.equal(results.pulseStart, 'idle');
    assert.deepEqual(results.pulse, { groove: 'idle', pulse: 'playing' });
    assert.equal(results.pulseAfterGroove, 'idle');
    assert.deepEqual(results.tab, { mode: 'idle', sources: 0, timer: null });
    assert.equal(results.escape, 'idle'); assert.equal(results.pagehide, 'idle');
    assert.equal(results.room.mode, 'idle'); assert.match(results.room.status, /room check/);
    assert.equal(results.refused.mode, 'idle'); assert.match(results.refused.status, /Wait for the room check/);
  });

  await check('drum grooves are keyboard-operable and fit desktop and 320px without overflow', async () => {
    await evaluate(() => {
      grooveSet('[data-groove-select]', 'funk');
      grooveSet('[data-groove-progression]', 'pop'); grooveSet('[data-groove-key]', 'G');
      document.querySelectorAll('.groove details').forEach(details => { details.open = true; });
      document.getElementById('percussion-heading').scrollIntoView({ block: 'start' });
    });
    assert.equal(await evaluate(() => document.querySelector('.groove [data-groove-chord-now]').textContent), 'G');
    await evaluate(() => grooveEl('[data-groove-play]').focus());
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
    await until("groove.mode === 'playing' && groove.sequencer.bar >= 1");
    await screenshot('grooves-desktop');
    await send('Emulation.setDeviceMetricsOverride', { width: 320, height: 900, deviceScaleFactor: 1, mobile: false });
    await evaluate(() => document.querySelector('.groove').scrollIntoView({ block: 'start' }));
    await screenshot('grooves-mobile');
    const layout = await evaluate(() => {
      const root = document.querySelector('.groove').getBoundingClientRect(), grid = document.querySelector('.groove .groove-grid').getBoundingClientRect();
      const overflowing = [...document.querySelectorAll('.groove *')].filter(el => el.getBoundingClientRect().right > innerWidth + 1 && el.offsetParent).map(el => el.className || el.tagName).slice(0, 5);
      return { page: document.documentElement.scrollWidth > innerWidth + 1, root: root.right <= innerWidth + .5, grid: grid.right <= root.right + .5, overflowing };
    });
    assert.deepEqual(layout, { page: false, root: true, grid: true, overflowing: [] });
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    assert.equal(await evaluate(() => groove.mode), 'idle');
    await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
    await evaluate(() => { grooveSet('[data-groove-progression]', 'off'); document.querySelectorAll('.groove details').forEach(details => { details.open = false; }); });
  });
}
