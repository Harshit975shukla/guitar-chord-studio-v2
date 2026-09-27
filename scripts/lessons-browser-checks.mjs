import assert from 'node:assert/strict';

export async function checkLessons({ check, evaluate, send, until, show, screenshot }) {
  await evaluate(async () => {
    const moduleUrl = performance.getEntriesByType('resource').findLast(e => new URL(e.name).pathname === '/src/ui/theoryLessons.ts').name;
    const { TheoryLessons } = await import(moduleUrl);
    const active = TheoryLessons.prototype.setActive;
    TheoryLessons.prototype.setActive = function(value) { window.lessonController = this; active.call(this, value); };
    document.getElementById('tab-theory').click();
    TheoryLessons.prototype.setActive = active;
    window.lessonChange = (id, value) => {
      const select = document.getElementById(`lesson-${id}`); select.value = value; select.dispatchEvent(new Event('change'));
    };
    window.lessonSnapshot = () => JSON.stringify({
      frets: appState.currentFretboardState, root: appState.scalesStudio.activeRoot, key: appState.scalesStudio.activeKey,
      register: appState.scalesStudio.activeRegister, range: appState.scalesStudio.exerciseRange,
      mode: appState.scalesStudio.practiceMode, song: appState.songStudio.getSongForEditing(), listening: appState.isListening,
    });
  });
  await show('theory', 'lesson-3d');
  await check('theory navigation, shared renderer and complete lesson choices preserve other tools', async () => {
    const result = await evaluate(() => {
      const before = lessonSnapshot();
      lessonChange('root', 'D'); lessonChange('scale', 'natural_minor');
      const labels = [...document.querySelectorAll('#lesson-tones strong')].map(n => n.textContent);
      lessonChange('labels', 'degrees');
      const state = testScenes['lesson-3d'].state;
      return { before, after: lessonSnapshot(), labels, scaleCount: document.querySelectorAll('#lesson-scale option').length,
        chordCount: document.querySelectorAll('#lesson-chord option').length, positions: state.scalePositions,
        flat: [...document.querySelectorAll('#lesson-2d .finger-dot')].map(n => n.textContent),
        help: document.querySelector('#lesson-3d canvas').getAttribute('aria-describedby') };
    });
    assert.equal(result.before, result.after);
    assert.deepEqual(result.labels, ['D', 'E', 'F', 'G', 'A', 'B♭', 'C']);
    assert.equal(result.scaleCount, 12); assert.equal(result.chordCount, 27);
    assert.deepEqual(result.flat, result.positions.map(p => p.label));
    assert.ok(result.positions.some(p => p.label === '♭6'));
    assert.equal(result.help, 'lesson-help');
  });
  await screenshot('theory-scales-desktop');
  await check('all chord lesson diagrams match actual formula tones, voicing bounds and honest empty states', async () => {
    const result = await evaluate(() => {
      const before = lessonSnapshot();
      document.getElementById('lesson-chords').click(); lessonChange('root', 'Bb');
      let count = 0, empty = 0; const failures = [];
      for (const option of document.querySelectorAll('#lesson-chord option')) {
        lessonChange('chord', option.value);
        for (const position of ['open', 'middle', 'upper']) {
          lessonChange('position', position);
          const c = lessonController, state = testScenes['lesson-3d'].state;
          const flat = [...document.querySelectorAll('#lesson-2d .finger-dot')].map(n => n.textContent);
          if (JSON.stringify(flat) !== JSON.stringify(state.scalePositions.map(p => p.label))) failures.push(`${option.value} ${position}: flat/3D mismatch`);
          if (!c.frets) {
            empty++;
            if (state.scalePositions.length || !document.getElementById('lesson-shape').disabled || !document.getElementById('lesson-practice').disabled) failures.push('unavailable shape still playable');
          } else {
            count++;
            const actual = [...new Set(c.positions.map(p => p.midi % 12))].sort();
            if (JSON.stringify(actual) !== JSON.stringify(c.lesson.tones.map(t => t.pc).sort())) failures.push('missing chord tone');
            if (!state.scalePositions.some(p => p.role === 'root')) failures.push('flat root not marked');
          }
        }
      }
      lessonChange('chord', 'dim7'); lessonChange('position', 'open'); lessonChange('root', 'C'); lessonChange('labels', 'notes');
      return { count, empty, failures, before, after: lessonSnapshot(), seventh: document.querySelector('#lesson-tones button:last-child strong').textContent };
    });
    assert.deepEqual(result.failures, []); assert.ok(result.count > 0 && result.empty > 0);
    assert.equal(result.before, result.after); assert.equal(result.seventh, 'B♭♭');
  });
  await screenshot('theory-chords-desktop');
  await check('lesson construction and shape audio use exact pitches and displayed strings with synchronized highlights', async () => {
    await evaluate(async () => {
      await appState.songStudio.onPlayRequested();
      window.lessonOriginalCreate = appState.audioContext.createBufferSource;
      window.lessonSources = [];
      appState.audioContext.createBufferSource = function() {
        const source = lessonOriginalCreate.call(this); lessonSources.push(source); return source;
      };
      window.lessonOldCapo = appState.capoState.fret; testMain.setCapo(2);
      document.getElementById('lesson-scales').click(); lessonChange('root', 'D'); lessonChange('scale', 'natural_minor');
      document.getElementById('lesson-hear').click();
    });
    try {
      await until("document.querySelector('#lesson-tones [aria-pressed=\"true\"]')");
      assert.ok(await evaluate(() => testScenes['lesson-3d'].state.scalePositions.some(p => p.active)));
      await until('lessonSources.length === 8');
      await until("document.getElementById('lesson-stop').disabled");
      assert.equal(await evaluate(async () => {
        const expected = [50, 52, 53, 55, 57, 58, 60, 62], standard = [64, 59, 55, 50, 45, 40];
        return lessonSources.every((source, i) => {
          return matchesRecordedNote(source, expected[i], standard.findIndex(midi => expected[i] >= midi));
        });
      }), true);
      const stringLabels = await evaluate(() => ({
        flat: [...document.querySelectorAll('#lesson-2d [data-string-label]')].map(n => n.textContent),
        three: testScenes['lesson-3d'].state.stringLabels,
      }));
      assert.deepEqual(stringLabels.flat, ['F♯', 'C♯', 'A', 'E', 'B', 'F♯']);
      assert.deepEqual(stringLabels.three, stringLabels.flat);
      await evaluate(() => {
        document.getElementById('lesson-chords').click(); lessonChange('chord', 'Major'); lessonChange('root', 'C'); lessonChange('position', 'middle');
        window.lessonExpectedShape = [...lessonController.positions].reverse(); lessonSources.length = 0;
        document.getElementById('lesson-shape').click();
      });
      await until('lessonSources.length === lessonExpectedShape.length && lessonSources.length > 0');
      assert.equal(await evaluate(async () => {
        return lessonSources.every((source, i) => {
          const p = lessonExpectedShape[i];
          return matchesRecordedNote(source, p.midi, p.stringIndex);
        });
      }), true);
      await evaluate(() => { document.getElementById('lesson-stop').click(); lessonSources.length = 0; appState.isListening = true; document.querySelector('#lesson-tones button').click(); });
      await until("document.getElementById('lesson-status').textContent.includes('Stop microphone')");
      assert.equal(await evaluate(() => lessonSources.length), 0);
      assert.ok(await evaluate(() => testScenes['lesson-3d'].state.scalePositions.some(p => p.active)), 'silent exploration remains possible');
    } finally {
      await evaluate(() => {
        appState.isListening = false; document.getElementById('lesson-stop').click();
        appState.audioContext.createBufferSource = lessonOriginalCreate; testMain.setCapo(lessonOldCapo);
      });
    }
  });
  await check('lesson Stop, selection, navigation, tuning and page lifecycle cancel pending audio', async () => {
    const results = await evaluate(async () => {
      const original = lessonController.actions.audio;
      const results = [];
      try {
        for (const action of ['stop', 'root', 'position', 'topic', 'tab', 'tuning', 'pagehide']) {
          switchTab('theory');
          let release;
          lessonController.actions.audio = () => new Promise(resolve => { release = resolve; });
          document.getElementById('lesson-hear').click();
          if (action === 'stop') document.getElementById('lesson-stop').click();
          if (action === 'root') lessonChange('root', 'F#');
          if (action === 'position') lessonChange('position', 'upper');
          if (action === 'topic') document.getElementById('lesson-scales').click();
          if (action === 'tab') switchTab('chords');
          if (action === 'tuning') lessonController.setTuning(appState.effectiveTuning, appState.capoState.fret);
          if (action === 'pagehide') window.dispatchEvent(new Event('pagehide'));
          release({ context: appState.audioContext, bus: appState.acousticBus });
          await Promise.resolve(); await Promise.resolve();
          results.push({ action, pending: lessonController.pending, running: lessonController.transport.running, sources: lessonController.sources.size });
          if (action === 'pagehide') window.dispatchEvent(new Event('pageshow'));
        }
      } finally { lessonController.actions.audio = original; }
      return results;
    });
    for (const result of results) { assert.equal(result.pending, false); assert.equal(result.running, false); assert.equal(result.sources, 0); }
  });
  await check('lesson handoffs transfer only the chosen scale or exact chord shape and retain Circle practice', async () => {
    const scale = await evaluate(() => {
      switchTab('theory'); document.getElementById('lesson-scales').click(); lessonChange('root', 'Eb'); lessonChange('scale', 'melodic_minor');
      const s = appState.scalesStudio, before = [s.activeRegister, s.exerciseRange, s.practiceMode];
      document.getElementById('lesson-practice').click();
      return { before, after: [s.activeRegister, s.exerciseRange, s.practiceMode], root: s.activeRoot, key: s.activeKey, tab: appState.activeTab,
        selected: document.getElementById('scale-preset-select').value, listening: appState.isListening };
    });
    assert.deepEqual(scale.before, scale.after);
    assert.equal(scale.root, 'Eb'); assert.equal(scale.key, 'melodic_minor'); assert.equal(scale.selected, 'melodic_minor');
    assert.equal(scale.tab, 'scales'); assert.equal(scale.listening, false);
    const expected = await evaluate(() => {
      switchTab('theory'); document.getElementById('lesson-chords').click(); lessonChange('chord', 'Major'); lessonChange('root', 'C'); lessonChange('position', 'open');
      const frets = [...lessonController.frets]; document.getElementById('lesson-practice').click(); return frets;
    });
    await show('chords', 'library-neck-3d');
    assert.deepEqual(await evaluate(() => testScenes['library-neck-3d'].state.frets), expected);
    const back = await evaluate(() => {
      switchTab('theory'); const title = document.getElementById('lesson-title').textContent;
      document.getElementById('lesson-circle').click();
      const circle = appState.activeTab === 'fifths' && document.getElementById('fifths-practice-start').checkVisibility();
      document.getElementById('fifths-back-theory').click();
      return { circle, title, returned: document.getElementById('lesson-title').textContent, focus: document.activeElement.id, tab: appState.activeTab };
    });
    // The practice disclosure may be closed; its retained controls must still exist.
    assert.equal(back.title, back.returned); assert.equal(back.focus, 'lesson-circle'); assert.equal(back.tab, 'theory');
    assert.equal(await evaluate(() => !!document.getElementById('fifths-practice-start')), true);
  });
  await check('theory neck supports mobile camera controls, keyboard plucks and context-loss fallback', async () => {
    await send('Emulation.setDeviceMetricsOverride', { width: 320, height: 850, deviceScaleFactor: 1, mobile: false });
    await show('theory', 'lesson-3d');
    const result = await evaluate(async () => {
      await document.fonts.ready;
      await Promise.allSettled(document.getAnimations().filter(a => a.effect.getComputedTiming().iterations !== Infinity).map(a => a.finished));
      const scene = testScenes['lesson-3d'].scene, before = scene.camera.position.length();
      document.getElementById('lesson-zoom-in').click(); const zoomed = scene.camera.position.length();
      document.getElementById('lesson-reset').click();
      return { overflow: document.documentElement.scrollWidth > innerWidth + 1, before, zoomed, reset: scene.camera.position.length() };
    });
    assert.equal(result.overflow, false); assert.ok(result.zoomed < result.before); assert.ok(Math.abs(result.reset - result.before) < .001);
    await screenshot('theory-mobile');
    await evaluate(() => document.querySelector('#lesson-3d canvas').dispatchEvent(new Event('webglcontextlost', { cancelable: true })));
    assert.equal(await evaluate(() => document.getElementById('lesson-2d').hidden), false);
    assert.match(await evaluate(() => document.getElementById('lesson-help').textContent), /unavailable/);
    await evaluate(() => document.querySelector('#lesson-2d button:not(:disabled)').focus());
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
    await until("document.getElementById('lesson-status').textContent.includes('string')");
    assert.equal(await evaluate(() => document.querySelectorAll('#lesson-2d [aria-pressed="true"]').length), 1);
    await evaluate(() => document.getElementById('lesson-stop').click());
    await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  });
}
