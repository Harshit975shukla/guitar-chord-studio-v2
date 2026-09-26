import assert from 'node:assert/strict';

export async function checkCircle({ check, evaluate, send, until, screenshot }) {
  await check('Circle of Fifths explores key families and signatures without changing practice state', async () => {
    const data = await evaluate(() => {
      const snapshot = () => JSON.stringify({
        tuning: appState.effectiveTuning, capo: appState.capoState,
        frets: appState.currentFretboardState, song: appState.songStudio.activeSongId,
        root: appState.scalesStudio.activeRoot, scale: appState.scalesStudio.activeKey,
      });
      const before = snapshot();
      document.querySelector('.tools-menu').open = true;
      document.getElementById('tab-fifths').click();
      document.getElementById('fifths-key-2').click();
      const major = { title: document.getElementById('fifths-key-title').textContent, notes: document.getElementById('fifths-scale-notes').textContent,
        signature: document.getElementById('fifths-signature').textContent, relative: document.getElementById('fifths-relative').textContent };
      document.getElementById('fifths-key-11').click();
      document.getElementById('fifths-minor').click();
      const minor = { title: document.getElementById('fifths-key-title').textContent, notes: document.getElementById('fifths-scale-notes').textContent,
        signature: document.getElementById('fifths-signature').textContent, chords: [...document.querySelectorAll('#fifths-chords tr')].map(row => row.dataset.chord),
        cadence: document.getElementById('fifths-progressions').textContent };
      return { before, after: snapshot(), major, minor, count: document.querySelectorAll('#fifths-wheel button').length,
        focusable: document.querySelectorAll('#fifths-wheel button[tabindex="0"]').length, mic: appState.isListening };
    });
    assert.equal(data.before, data.after); assert.equal(data.count, 12); assert.equal(data.focusable, 1); assert.equal(data.mic, false);
    assert.equal(data.major.title, 'D major'); assert.match(data.major.notes, /F♯/); assert.match(data.major.signature, /2 sharps: F♯ · C♯/);
    assert.match(data.major.relative, /B minor/);
    assert.equal(data.minor.title, 'D natural minor'); assert.equal(data.minor.notes, 'D · E · F · G · A · B♭ · C · D');
    assert.equal(data.minor.signature, '1 flat: B♭');
    assert.deepEqual(data.minor.chords, ['Dm', 'Edim', 'F', 'Gm', 'Am', 'B♭', 'C']);
    assert.match(data.minor.cadence, /Dm → Gm → A → Dm/); assert.match(data.minor.cadence, /C♯/);
  });
  await check('circle keyboard navigation and enharmonic crossover preserve correct key spelling', async () => {
    await evaluate(() => document.getElementById('fifths-key-11').focus());
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 });
    assert.equal(await evaluate(() => document.activeElement.id), 'fifths-key-0');
    assert.equal(await evaluate(() => document.getElementById('fifths-key-title').textContent), 'A natural minor');
    const crossover = await evaluate(() => {
      document.getElementById('fifths-major').click();
      document.getElementById('fifths-key-6').click();
      const sharp = document.getElementById('fifths-scale-notes').textContent;
      const select = document.getElementById('fifths-spelling'); select.value = 'flat'; select.dispatchEvent(new Event('change'));
      return { sharp, flat: document.getElementById('fifths-scale-notes').textContent,
        title: document.getElementById('fifths-key-title').textContent, signature: document.getElementById('fifths-signature').textContent };
    });
    assert.match(crossover.sharp, /E♯/); assert.match(crossover.flat, /C♭/);
    assert.equal(crossover.title, 'G♭ major'); assert.match(crossover.signature, /6 flats/);
    await evaluate(() => { document.getElementById('fifths-key-11').click(); document.getElementById('fifths-minor').click(); });
  });
  await screenshot('circle-desktop');

  await check('circle reference sound uses exact concert pitches and respects Stop, key changes and active mic', async () => {
    await evaluate(async () => {
      await appState.songStudio.onPlayRequested();
      window.circleOriginalCreate = appState.audioContext.createBufferSource;
      window.circleSources = [];
      appState.audioContext.createBufferSource = function() {
        const source = circleOriginalCreate.call(this);
        circleSources.push(source);
        return source;
      };
      window.circleBeforeCapo = appState.capoState.fret;
      testMain.setCapo(2);
      document.getElementById('fifths-hear-scale').click();
    });
    try {
      await until('circleSources.length === 8');
      await until("document.getElementById('fifths-stop').disabled");
      const sounds = await evaluate(async () => {
        const { renderStringSamples } = await import('/src/audio/engine.ts');
        const expected = [50, 52, 53, 55, 57, 58, 60, 62];
        const standard = [64, 59, 55, 50, 45, 40];
        return { count: circleSources.length, capo: appState.capoState.fret, matching: circleSources.every((source, i) => {
          const samples = renderStringSamples(source.buffer.sampleRate, {
            freq: 440 * 2 ** ((expected[i] - 69) / 12),
            stringIndex: standard.findIndex(midi => expected[i] >= midi && expected[i] - midi <= 12),
            model: appState.acousticBus.model, startTime: 0, velocity: .8,
          });
          return source.buffer.getChannelData(0).every((sample, j) => sample === samples[j]);
        }) };
      });
      assert.equal(sounds.count, 8); assert.equal(sounds.matching, true); assert.equal(sounds.capo, 2);
      await evaluate(() => { circleSources.length = 0; document.querySelector('#fifths-progressions [data-progression="cadence"]').click(); });
      await until('circleSources.length === 12');
      await until("document.getElementById('fifths-stop').disabled");
      const chordAudio = await evaluate(async () => {
        const { renderStringSamples } = await import('/src/audio/engine.ts');
        const expected = [50, 53, 57, 55, 58, 62, 57, 61, 64, 50, 53, 57], tuning = [64, 59, 55, 50, 45, 40];
        return circleSources.every((source, i) => {
          const samples = renderStringSamples(source.buffer.sampleRate, { freq: 440 * 2 ** ((expected[i] - 69) / 12),
            stringIndex: tuning.findIndex(midi => expected[i] >= midi && expected[i] - midi <= 12), model: appState.acousticBus.model, startTime: 0, velocity: .65 });
          return source.buffer.getChannelData(0).every((sample, j) => sample === samples[j]);
        });
      });
      assert.equal(chordAudio, true, 'minor cadence must play major A, including C sharp');
      await evaluate(() => { circleSources.length = 0; document.getElementById('fifths-hear-scale').click(); });
      await until('circleSources.length > 0');
      await evaluate(() => document.getElementById('fifths-stop').click());
      const stoppedCount = await evaluate(() => circleSources.length);
      await evaluate(() => new Promise(resolve => setTimeout(resolve, 550)));
      assert.equal(await evaluate(() => circleSources.length), stoppedCount);
      await evaluate(() => {
        appState.isListening = true;
        circleSources.length = 0;
        document.getElementById('fifths-hear-interval').click();
      });
      await until("document.getElementById('fifths-audio-status').textContent.includes('Stop microphone')");
      assert.equal(await evaluate(() => circleSources.length), 0);
      assert.equal(await evaluate(() => appState.isListening), true);
      await evaluate(() => { appState.isListening = false; });
      const cancelled = await evaluate(async () => {
        const ctx = appState.audioContext, state = Object.getOwnPropertyDescriptor(ctx, 'state'), resume = ctx.resume;
        let release;
        Object.defineProperty(ctx, 'state', { configurable: true, get: () => 'suspended' });
        ctx.resume = () => new Promise(resolve => { release = resolve; });
        try {
          circleSources.length = 0;
          document.getElementById('fifths-hear-scale').click();
          document.getElementById('fifths-key-0').click();
          release(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
          return { voices: circleSources.length, stopDisabled: document.getElementById('fifths-stop').disabled };
        } finally { ctx.resume = resume; if (state) Object.defineProperty(ctx, 'state', state); else delete ctx.state; }
      });
      assert.deepEqual(cancelled, { voices: 0, stopDisabled: true });
    } finally {
      await evaluate(() => {
        appState.isListening = false;
        document.getElementById('fifths-stop').click();
        appState.audioContext.createBufferSource = circleOriginalCreate;
        testMain.setCapo(circleBeforeCapo);
      });
    }
  });
  await check('explicit Scales handoff applies only the chosen key and stops reference audio', async () => {
    const result = await evaluate(async () => {
      appState.scalesStudio.setRegister('middle'); appState.scalesStudio.setExerciseRange('two-octaves');
      document.getElementById('fifths-key-11').click();
      document.getElementById('fifths-minor').click();
      document.getElementById('fifths-hear-scale').click();
      await Promise.resolve();
      document.getElementById('fifths-open-scales').click();
      await Promise.resolve(); await Promise.resolve();
      return { tab: appState.activeTab, root: appState.scalesStudio.activeRoot, key: appState.scalesStudio.activeKey,
        range: appState.scalesStudio.exerciseRange, position: appState.scalesStudio.activeRegister,
        stopDisabled: document.getElementById('fifths-stop').disabled, listening: appState.isListening };
    });
    assert.deepEqual(result, { tab: 'scales', root: 'D', key: 'natural_minor', range: 'two-octaves', position: 'middle', stopDisabled: true, listening: false });
    await evaluate(() => {
      appState.scalesStudio.setExerciseRange('position'); appState.scalesStudio.setRegister('all');
      switchTab('fifths');
    });
  });
  await check('circle and chord references remain keyboard accessible at 320px and reduced motion', async () => {
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    await send('Emulation.setDeviceMetricsOverride', { width: 320, height: 760, deviceScaleFactor: 1, mobile: false });
    await evaluate(() => document.getElementById('fifths-heading').scrollIntoView({ block: 'start' }));
    await evaluate(async () => {
      await document.fonts.ready;
      await Promise.allSettled(document.getAnimations().filter(a => a.effect.getComputedTiming().iterations !== Infinity).map(a => a.finished));
    });
    const layout = await evaluate(() => {
      const buttons = [...document.querySelectorAll('#fifths-wheel button')].map(b => b.getBoundingClientRect());
      let overlaps = 0;
      for (let i = 0; i < buttons.length; i++) for (let j = i + 1; j < buttons.length; j++) {
        const a = buttons[i], b = buttons[j];
        if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > .5 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > .5) overlaps++;
      }
      return { width: document.documentElement.scrollWidth, viewport: innerWidth,
        largeTargets: buttons.every(b => b.width >= 44 && b.height >= 44), overlaps,
        refs: document.querySelectorAll('#fifths-chords button').length };
    });
    assert.ok(layout.width <= layout.viewport + 1); assert.equal(layout.largeTargets, true); assert.equal(layout.overlaps, 0); assert.equal(layout.refs, 7);
    await screenshot('circle-mobile');
    await send('Emulation.setEmulatedMedia', { features: [] });
    await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
    await evaluate(() => switchTab('detector'));
  });
}
