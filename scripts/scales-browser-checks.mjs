import assert from 'node:assert/strict';

/** Focused Scales cases, run by browser-smoke.mjs against the real UI/renderer. */
export async function checkScales({ check, evaluate, send, until, show, screenshot }) {
  await show('scales', 'scale-neck-3d');
  await check('Scales renders all eight patterns with accurate roots, registers and degree labels', async () => {
    const result = await evaluate(async () => {
      const url = performance.getEntriesByType('resource').findLast(e => new URL(e.name).pathname === '/src/tabs/scales.ts').name;
      const { WESTERN_SCALES } = await import(url);
      const roots = ['C', 'F#', 'A'];
      const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
      const ranges = { all: [0, 12], open: [0, 4], middle: [5, 8], upper: [9, 12] };
      const scene = testScenes['scale-neck-3d'].scene;
      const label = scene.label;
      let labels = [];
      scene.label = function(text, x, y, ...rest) {
        if (y === 0.34) labels.push(text);
        return label.call(this, text, x, y, ...rest);
      };
      const select = (id, value) => {
        const el = document.getElementById(id);
        el.value = value; el.dispatchEvent(new Event('change'));
      };
      let cases = 0;
      try {
        for (const [i, [key, scale]] of Object.entries(WESTERN_SCALES).entries()) {
          const root = roots[i % roots.length], rootPc = names.indexOf(root);
          document.getElementById(`scale-root-btn-${root.replace('#', 's')}`).click();
          select('scale-preset-select', key);
          for (const [register, [min, max]] of Object.entries(ranges)) {
            select('scale-position-filter', register);
            for (const mode of ['note', 'degree']) {
              labels = [];
              document.getElementById(`scale-mode-${mode}`).click();
              // Force the same-state case to exercise label production too.
              if (!labels.length) scene.update(testScenes['scale-neck-3d'].state);
              const state = testScenes['scale-neck-3d'].state;
              const expected = [];
              for (let s = 0; s < 6; s++) {
                for (let f = min; f <= max; f++) {
                  const pc = (state.tuning[s].midi + f) % 12;
                  const interval = (pc - rootPc + 12) % 12;
                  const degree = scale.intervals.indexOf(interval);
                  if (degree < 0) continue;
                  expected.push({
                    stringIndex: s, fret: f, active: false,
                    role: interval === 0 ? 'root' : key === 'blues' && interval === 6 ? 'blue' : 'tone',
                    label: mode === 'note' ? names[pc] : scale.degrees[degree],
                  });
                }
              }
              const compact = positions => positions.map(p => [p.stringIndex, p.fret, p.label, p.role, p.active]);
              if (JSON.stringify(compact(state.scalePositions)) !== JSON.stringify(compact(expected))) throw new Error(`Wrong scale state: ${key}/${root}/${register}/${mode}`);
              const meshes = scene.markers.children.filter(o => o.isMesh);
              if (meshes.length !== expected.length || labels.join() !== expected.map(p => p.label).join()) throw new Error('3D positions/labels diverged from scale');
              for (const [j, p] of expected.entries()) {
                const mesh = meshes[j];
                const color = p.role === 'root' ? 0xefb56d : p.role === 'blue' ? 0x9ec5e8 : 0xf0dfc6;
                if (mesh.userData.stringIndex !== p.stringIndex || mesh.userData.fret !== p.fret || mesh.material.color.getHex() !== color) throw new Error('Wrong 3D position or role color');
                const dot = document.getElementById(`scale-dot-${p.stringIndex}-${p.fret}`);
                if (dot?.textContent !== p.label || !dot.classList.contains(p.role)) throw new Error('2D and 3D scale markers differ');
              }
              if (document.querySelectorAll('#scale-neck-2d .scale-dot').length !== expected.length) throw new Error('Unfiltered 2D positions');
              cases++;
            }
          }
        }
      } finally {
        scene.label = label;
      }
      appState.scalesStudio.setRoot('A');
      appState.scalesStudio.setScaleKey('blues');
      appState.scalesStudio.setRegister('middle');
      appState.scalesStudio.setLabelMode('degree');
      const host = document.getElementById('scale-neck-3d').getBoundingClientRect();
      const canvas = scene.renderer.domElement.getBoundingClientRect();
      return { cases, width: host.width, height: host.height, canvasWidth: canvas.width, canvasHeight: canvas.height,
        help: scene.renderer.domElement.getAttribute('aria-describedby'), blueLegend: !document.getElementById('scale-blue-legend').hidden };
    });
    assert.equal(result.cases, 64);
    assert.equal(result.width, result.canvasWidth);
    assert.equal(result.height, result.canvasHeight);
    assert.equal(result.height, 258);
    assert.equal(result.help, 'scale-neck-help');
    assert.equal(result.blueLegend, true);
  });
  await screenshot('scales-desktop');

  await check('Scales tuning/capo and view switching preserve independent scale selection', async () => {
    const result = await evaluate(() => {
      const scales = appState.scalesStudio;
      const before = [...appState.currentFretboardState];
      testMain.setTuningPreset('drop_d');
      testMain.setCapo(2);
      const tuned = structuredClone(scales.neck3d.state);
      const tuningText = document.getElementById('scale-tuning-label').textContent;
      document.getElementById('scale-neck-view-2d').click();
      const flat = [...document.querySelectorAll('#scale-neck-2d .scale-dot')].map(d => d.textContent);
      const flatButtons = document.querySelectorAll('#scale-neck-2d button').length;
      testMain.setCapo(0);
      testMain.setTuningPreset('standard');
      return { before, after: appState.currentFretboardState, tuned, tuningText, flat, flatButtons,
        root: scales.activeRoot, key: scales.activeKey, register: scales.activeRegister, mode: scales.activeLabelMode,
        saved: localStorage.getItem('gcs-scale-neck-view'),
        otherSaved: localStorage.getItem('gcs-neck-view') };
    });
    assert.deepEqual(result.before, result.after);
    assert.deepEqual(result.tuned.tuning.map(s => s.midi), [66, 61, 57, 52, 47, 40]);
    assert.match(result.tuningText, /E · B · E · A · C# · F#/);
    assert.deepEqual(result.flat, result.tuned.scalePositions.map(p => p.label));
    assert.equal(result.flatButtons, 78);
    assert.deepEqual([result.root, result.key, result.register, result.mode], ['A', 'blues', 'middle', 'degree']);
    assert.equal(result.saved, '2d');
    assert.equal(result.otherSaved, '3d');
    await evaluate(() => document.getElementById('scale-neck-view-3d').click());
    await show('scales', 'scale-neck-3d');
  });

  await check('Scales run and rapid plucks keep exact active positions; mic works in degree mode', async () => {
    const result = await evaluate(async () => {
      const scales = appState.scalesStudio;
      const originalSet = window.setTimeout, originalClear = window.clearTimeout;
      const micStart = scales.onMicStartRequested;
      const audioReady = scales.onPlayRequested;
      let now = 0, nextId = 100000;
      const timers = new Map();
      window.setTimeout = (fn, delay) => { const id = ++nextId; timers.set(id, { fn, at: now + delay }); return id; };
      window.clearTimeout = id => { if (!timers.delete(id)) originalClear(id); };
      const advance = ms => {
        const end = now + ms;
        for (;;) {
          const next = [...timers].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
          if (!next) break;
          timers.delete(next[0]); now = next[1].at; next[1].fn();
        }
        now = end;
      };
      const active = () => scales.neck3d.state.scalePositions.filter(p => p.active).map(p => [p.stringIndex, p.fret]);
      const settle = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
      try {
        await scales.pluckNote(0, 5); // A4 at a known string, not every A4 on the neck.
        const first = active();
        advance(250);
        await scales.pluckNote(1, 8);
        advance(100);
        const overlapping = active();
        advance(250);
        const expired = active();
        await scales.pluckNote(0, 6); // Off-scale is still playable and explicitly identified.
        const outside = document.getElementById('scale-neck-summary').textContent;
        const outsideRole = scales.neck3d.state.scalePositions.find(p => p.active)?.role;
        scales.stopScaleAudioRun();
        scales.setBpm(240);
        await scales.startScaleAudioRun();
        const run1 = active();
        advance(250);
        const run2 = active();
        advance(100);
        const run2Held = active();
        scales.setRoot('C');
        scales.setScaleKey('major');
        scales.setRegister('upper');
        await settle();
        const changedPattern = scales.neck3d.state.scalePositions.filter(p => p.active);
        const runningAfterChange = scales.isAudioRunning;
        scales.stopScaleAudioRun();
        const timersAfterStop = timers.size;

        scales.onMicStartRequested = async () => false;
        await scales.toggleMicPractice();
        const denied = !scales.isMicActive && document.getElementById('scale-neck-summary').textContent.includes('unavailable');
        scales.onMicStartRequested = async () => true;
        await scales.toggleMicPractice();
        scales.setRoot('A'); scales.setScaleKey('blues'); scales.setRegister('middle');
        scales.onSingleNoteDetected('A');
        const micPositions = scales.neck3d.state.scalePositions.filter(p => p.active);
        const micDots = [...document.querySelectorAll('#scale-neck-2d .active-pluck')].map(d => d.textContent);
        scales.onSingleNoteDetected('C');
        advance(350);
        const latestMicPc = scales.highlightedPc;
        advance(250);
        const micExpired = active();
        scales.setMicPracticeActive(false);

        // No late audio/highlight after leaving while audio unlock is pending.
        let release;
        scales.onPlayRequested = () => new Promise(resolve => { release = resolve; });
        const pendingRun = scales.startScaleAudioRun();
        window.switchTab('chords');
        release();
        await pendingRun;
        const stoppedOnLeave = !scales.isAudioRunning && scales.audioRunTimer === null && scales.highlightTimer === null;
        return { first, overlapping, expired, outside, outsideRole, run1, run2, run2Held, changedPattern,
          runningAfterChange, timersAfterStop, denied, micPositions, micDots, latestMicPc, micExpired, stoppedOnLeave };
      } finally {
        scales.stopScaleAudioRun();
        scales.onMicStartRequested = micStart;
        scales.onPlayRequested = audioReady;
        window.setTimeout = originalSet; window.clearTimeout = originalClear;
      }
    });
    assert.deepEqual(result.first, [[0, 5]]);
    assert.deepEqual(result.overlapping, [[1, 8]]);
    assert.deepEqual(result.expired, []);
    assert.match(result.outside, /Outside this scale/);
    assert.equal(result.outsideRole, 'outside');
    assert.notDeepEqual(result.run1, result.run2);
    assert.deepEqual(result.run2, result.run2Held);
    assert.equal(result.changedPattern.length, 1);
    assert.ok(result.changedPattern[0].fret >= 9);
    assert.equal(result.runningAfterChange, true);
    assert.equal(result.timersAfterStop, 0);
    assert.equal(result.denied, true);
    assert.ok(result.micPositions.length > 0);
    assert.ok(result.micPositions.every(p => p.role === 'root' && p.label === '1'));
    assert.ok(result.micDots.every(label => label === '1'));
    assert.equal(result.latestMicPc, 0);
    assert.deepEqual(result.micExpired, []);
    assert.equal(result.stoppedOnLeave, true);
    await show('scales', 'scale-neck-3d');
  });

  await check('Scales supports actual pointer orbit/pick and keyboard 2D playing', async () => {
    const pos = await evaluate(() => {
      const scene = testScenes['scale-neck-3d'].scene;
      scene.reset();
      window.scaleCameraBefore = scene.camera.position.toArray();
      const rect = scene.renderer.domElement.getBoundingClientRect();
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    });
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', ...pos, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pos.x + 45, y: pos.y + 20, button: 'left', buttons: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: pos.x + 45, y: pos.y + 20, button: 'left', clickCount: 1 });
    assert.notDeepEqual(await evaluate(() => testScenes['scale-neck-3d'].scene.camera.position.toArray()), await evaluate(() => scaleCameraBefore));
    const pick = await evaluate(() => {
      const scene = testScenes['scale-neck-3d'].scene;
      scene.reset(); scene.scene.updateMatrixWorld(true); scene.camera.updateMatrixWorld(true);
      const target = scene.targets.find(t => t.userData.string === 0 && t.userData.fret === 5);
      const point = target.position.clone().project(scene.camera);
      const rect = scene.renderer.domElement.getBoundingClientRect();
      return { x: rect.x + (point.x + 1) / 2 * rect.width, y: rect.y + (1 - point.y) / 2 * rect.height };
    });
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', ...pick, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...pick, button: 'left', clickCount: 1 });
    await until("appState.scalesStudio.highlightedPosition?.stringIndex === 0 && appState.scalesStudio.highlightedPosition?.fret === 5");
    await evaluate(() => {
      document.getElementById('scale-neck-view-2d').click();
      document.getElementById('scale-fret-cell-1-8').focus();
    });
    assert.equal(await evaluate(() => document.activeElement.id), 'scale-fret-cell-1-8');
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', text: '\r', windowsVirtualKeyCode: 13 });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
    await until("appState.scalesStudio.highlightedPosition?.stringIndex === 1 && appState.scalesStudio.highlightedPosition?.fret === 8");
    assert.equal(await evaluate(() => document.activeElement.id), 'scale-fret-cell-1-8');
    await evaluate(() => {
      appState.scalesStudio.stopScaleAudioRun();
      document.getElementById('scale-neck-view-3d').click();
    });
    await show('scales', 'scale-neck-3d');
    await send('Emulation.setDeviceMetricsOverride', { width: 320, height: 760, deviceScaleFactor: 1, mobile: false });
    await evaluate(() => window.scrollTo(0, 0));
    await until("!testScenes['scale-neck-3d'].scene.visible");
    await evaluate(() => {
      const scene = testScenes['scale-neck-3d'].scene;
      window.scaleHiddenDraws = 0;
      const render = scene.renderer.render.bind(scene.renderer);
      scene.renderer.render = (...args) => { scaleHiddenDraws++; return render(...args); };
      appState.scalesStudio.setRoot('D');
    });
    await evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.equal(await evaluate(() => scaleHiddenDraws), 0);
    await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
    await show('scales', 'scale-neck-3d');
    assert.equal(await evaluate(() => testScenes['scale-neck-3d'].state.root), 'D');
    await evaluate(() => {
      window.dispatchEvent(new PageTransitionEvent('pagehide'));
      window.dispatchEvent(new PageTransitionEvent('pageshow'));
      document.getElementById('scale-neck-view-2d').click();
      document.getElementById('scale-neck-view-3d').click();
      document.getElementById('scale-neck-view-2d').click();
    });
    await evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.equal(await evaluate(() => document.querySelectorAll('#scale-neck-3d canvas').length), 0);
    await evaluate(() => document.getElementById('scale-neck-view-3d').click());
  });
}
