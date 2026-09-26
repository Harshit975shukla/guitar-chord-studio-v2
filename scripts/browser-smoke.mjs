/**
 * Uses an already-running local Chromium CDP endpoint, without extra packages.
 * Start Vite and an isolated Chrome/Edge with --remote-debugging-port=9223.
 * Run: node scripts/browser-smoke.mjs [app-url] [cdp-port]
 * Optional SCREENSHOT_DIR saves the desktop/mobile inspection captures.
 */
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { checkScales } from './scales-browser-checks.mjs';
import { checkSongs } from './songs-browser-checks.mjs';
import { checkAudioAnalysis } from './analysis-browser-checks.mjs';
import { checkStrumming } from './strumming-browser-checks.mjs';
import { checkPractice } from './practice-browser-checks.mjs';
import { checkTwoOctaves } from './two-octave-browser-checks.mjs';
import { checkCircle } from './circle-browser-checks.mjs';

const appUrl = process.argv[2] || 'http://127.0.0.1:5173/';
const endpoint = `http://127.0.0.1:${process.argv[3] || '9223'}`;
const target = await (await fetch(`${endpoint}/json/new?about:blank`, { method: 'PUT' })).json();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
let id = 0;
const pending = new Map();
const errors = [];
const requests = [];
ws.onmessage = event => {
  const message = JSON.parse(event.data);
  if (message.id) {
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    clearTimeout(request.timer);
    if (message.error) request.reject(new Error(JSON.stringify(message.error)));
    else request.resolve(message.result);
  } else if (message.method === 'Runtime.exceptionThrown') {
    errors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
  } else if (message.method === 'Network.requestWillBeSent') {
    requests.push({ url: message.params.request.url, method: message.params.request.method });
  }
};
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const requestId = ++id;
    const timer = setTimeout(() => { pending.delete(requestId); reject(new Error(`CDP timed out: ${method}`)); }, 15000);
    pending.set(requestId, { resolve, reject, timer });
    ws.send(JSON.stringify({ id: requestId, method, params }));
  });
}
async function evaluate(fn) {
  const result = await send('Runtime.evaluate', {
    expression: typeof fn === 'string' ? fn : `(${fn.toString()})()`,
    awaitPromise: true, returnByValue: true, userGesture: true,
  });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result.value;
}
async function until(expression) {
  for (let i = 0; i < 100; i++) {
    if (await evaluate(expression)) return;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  const context = await evaluate(() => {
    const neck = window.appState?.scalesStudio?.neck3d;
    return { tab: window.appState?.activeTab, scaleNeck: neck && {
      mode: neck.mode, active: neck.active, inView: neck.inView, loading: neck.loading,
      bounds: neck.host.getBoundingClientRect().toJSON(), scrollY,
      help: document.getElementById('scale-neck-help')?.textContent,
    } };
  });
  throw new Error(`Browser condition not reached: ${expression}\n${JSON.stringify(context)}`);
}
let checks = 0;
async function check(name, fn) {
  await fn();
  checks++;
  console.log(`PASS  ${name}`);
}
async function show(tab, host) {
  await evaluate(`window.switchTab('${tab}');`);
  await evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await evaluate(`document.getElementById('${host}').scrollIntoView({block:'center'});`);
  await until(`!!document.querySelector('#${host} canvas')`);
}
async function screenshot(name) {
  if (!process.env.SCREENSHOT_DIR) return;
  await evaluate(async () => {
    await document.fonts.ready;
    await Promise.allSettled(document.getAnimations().filter(a => a.effect.getComputedTiming().iterations !== Infinity).map(a => a.finished));
  });
  const { data } = await send('Page.captureScreenshot', { format: 'png' });
  await writeFile(join(process.env.SCREENSHOT_DIR, `${name}.png`), Buffer.from(data, 'base64'));
}

try {
  await send('Runtime.enable');
  await send('Network.enable');
  await send('Storage.clearDataForOrigin', { origin: new URL(appUrl).origin, storageTypes: 'service_workers,cache_storage' });
  await send('Network.setBypassServiceWorker', { bypass: true });
  await send('Page.enable');
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `if (location.origin === ${JSON.stringify(new URL(appUrl).origin)}) localStorage.clear();` });
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: appUrl });
  await until('!!window.appState?.currentSession');
  await evaluate(() => document.getElementById('neck-view-3d').click());
  await show('detector', 'neck-3d');
  await evaluate(async () => {
    // Use the loaded module identity, including any Vite HMR timestamp.
    const moduleUrl = path => performance.getEntriesByType('resource').findLast(e => new URL(e.name).pathname === path).name;
    window.testMain = await import(moduleUrl('/src/main.ts'));
    const { Fretboard3D } = await import(moduleUrl('/src/ui/fretboard3d.ts'));
    window.testScenes = {};
    const update = Fretboard3D.prototype.update;
    Fretboard3D.prototype.update = function(state) {
      window.testScenes[this.host.id] = { scene: this, state: structuredClone(state) };
      return update.call(this, state);
    };
    document.getElementById('neck-view-2d').click();
    document.getElementById('neck-view-3d').click();
  });
  await show('detector', 'neck-3d');
  await until("!!window.testScenes['neck-3d']");
  await check('live renderer retains preset state and scoped accessible help', async () => {
    await evaluate(() => window.loadChordPreset('C', false));
    assert.equal(await evaluate(() => document.querySelector('#neck-3d canvas').getAttribute('aria-describedby')), 'neck-help');
    assert.deepEqual(await evaluate(() => window.testScenes['neck-3d'].state.frets), [0, 1, 0, 2, 3, null]);
  });
  await screenshot('live-desktop');

  await show('chords', 'library-neck-3d');
  await check('library shares renderer; selection, voicings and picks stay independent', async () => {
    const data = await evaluate(async () => {
      const before = [...appState.currentFretboardState];
      document.querySelector('[data-library-select]').click();
      const first = [...testScenes['library-neck-3d'].state.frets];
      const select = document.getElementById('library-neck-voicing');
      select.selectedIndex = 1;
      select.dispatchEvent(new Event('change'));
      const second = [...testScenes['library-neck-3d'].state.frets];
      const { scene } = testScenes['library-neck-3d'];
      const pickFret = second[0] === 8 ? 7 : 8;
      scene.onPick(0, pickFret);
      const picked = testScenes['library-neck-3d'].state.frets[0];
      return { before, after: appState.currentFretboardState, first, second, picked, pickFret,
        help: scene.renderer.domElement.getAttribute('aria-describedby'),
        liveCanvases: document.querySelectorAll('#neck-3d canvas').length };
    });
    assert.deepEqual(data.before, data.after);
    assert.notDeepEqual(data.first, data.second);
    assert.equal(data.picked, data.pickFret);
    assert.equal(data.help, 'library-neck-help');
    assert.equal(data.liveCanvases, 0);
  });
  await screenshot('library-desktop');

  await show('songs', 'song-neck-3d');
  await check('song palette, lead notes, playback chords and tuning reach both views', async () => {
    const data = await evaluate(() => {
      const song = appState.songStudio;
      song.renderChordOnFretboard('G');
      const palette = [...testScenes['song-neck-3d'].state.frets];
      const flat = Array.from({length: 6}, (_, s) => {
        const cell = document.querySelector(`#song-string-row-${s} .finger-dot`)?.parentElement;
        return cell ? Number(cell.id.split('-').at(-1)) : null;
      });
      song.loadSong('original-timing-study');
      const step1 = document.getElementById('song-neck-caption').textContent;
      song.stepNext(); song.stepNext(); song.stepNext();
      const lead = testScenes['song-neck-3d'].state.frets[0];
      song.stepNext(); song.stepNext(); song.stepNext();
      const step2 = document.getElementById('song-neck-caption').textContent;
      song.stopPlayback();
      const heldShape = [...testScenes['song-neck-3d'].state.frets];
      testMain.setCapo(2);
      const tuned = testScenes['song-neck-3d'].state.tuning[0].midi;
      const shapeAfterCapo = [...testScenes['song-neck-3d'].state.frets];
      testMain.setCapo(0);
      return { palette, flat, lead, step1, step2, tuned, heldShape, shapeAfterCapo };
    });
    assert.deepEqual(data.palette, data.flat);
    assert.equal(data.lead, 0);
    assert.match(data.step1, /^C /);
    assert.match(data.step2, /^G /);
    assert.equal(data.tuned, 66);
    assert.deepEqual(data.heldShape, data.shapeAfterCapo);
  });
  await screenshot('songs-desktop');

  await checkSongs({ check, evaluate, send, until, show, screenshot });
  await checkAudioAnalysis({ check, evaluate, send, until, show, screenshot, requests });
  await checkStrumming({ check, evaluate, send, until, screenshot });
  await checkScales({ check, evaluate, send, until, show, screenshot });
  await checkPractice({ check, evaluate, send, until, show, screenshot });
  await checkTwoOctaves({ check, evaluate, send, until, show, screenshot });
  await checkCircle({ check, evaluate, send, until, screenshot });

  await check('held results do not score, send MIDI, log chords or paint live pitches', async () => {
    const data = await evaluate(async () => {
      const { DetectionEngine } = await import('/src/detection/engine.ts');
      const chroma = new Float32Array(12); chroma[0] = 1; chroma[4] = 0.9; chroma[7] = 0.9;
      const chord = new DetectionEngine().processChord(chroma, []);
      const held = { ...chord, freshness: 'held', statusMessage: 'Last confirmed C · held' };
      const song = appState.songStudio;
      song.loadSong('original-timing-study');
      song.isPracticeMicActive = true; song.practiceScore = 0;
      appState.activeTab = 'songs';
      let midi = 0;
      appState.midiManager = { sendChord() { midi++; }, sendNoteOn() { midi++; } };
      appState.settings.midiConfig.sendChords = true;
      appState.settings.midiConfig.sendSingleNotes = true;
      appState.currentChord = null;
      appState.currentSession.chordsDetected = [];
      testMain.handleDetectionResult(held, new Float32Array(0));
      const afterHeld = { score: song.practiceScore, midi, logs: appState.currentSession.chordsDetected.length };
      testMain.handleDetectionResult(chord, new Float32Array(0));
      testMain.handleDetectionResult({ ...chord, timestamp: chord.timestamp + 32 }, new Float32Array(0));
      const afterFresh = { score: song.practiceScore, midi, logs: appState.currentSession.chordsDetected.length };
      const note = { ...chord, mode: 'single-note', chord: undefined,
        note: { pitch: { note: 'E', octave: 4, midi: 64, freq: 329.63, cents: 0 }, confidence: 90, tunerVerdict: 'in-tune' } };
      appState.settings.targetMode = 'notes';
      appState.activeTab = 'detector';
      testMain.handleDetectionResult(note, new Float32Array(0));
      testMain.handleDetectionResult({ ...note, freshness: 'held' }, new Float32Array(0));
      const heldTuner = document.getElementById('tuner-status-badge').textContent;
      const liveCells = document.querySelectorAll('#fretboard-board .live-note').length;
      const confidence = document.getElementById('info-confidence').textContent;
      song.practiceScore = 0;
      appState.activeTab = 'songs';
      midi = 0;
      testMain.handleDetectionResult({ ...note, freshness: 'held' }, new Float32Array(0));
      const heldNote = { score: song.practiceScore, midi };
      testMain.handleDetectionResult(note, new Float32Array(0));
      testMain.handleDetectionResult({ ...note, timestamp: note.timestamp + 32 }, new Float32Array(0));
      const freshNotes = { score: song.practiceScore, midi };
      let trainer = 0, scales = 0;
      appState.trainerStudio.onChordDetected = () => trainer++;
      appState.scalesStudio.onDetectionResult = result => { if (result.freshness === 'fresh') scales++; };
      appState.activeTab = 'trainer';
      testMain.handleDetectionResult(held, new Float32Array(0));
      testMain.handleDetectionResult(chord, new Float32Array(0));
      appState.activeTab = 'scales';
      testMain.handleDetectionResult({ ...note, freshness: 'held' }, new Float32Array(0));
      testMain.handleDetectionResult(note, new Float32Array(0));
      appState.isDrillActive = true;
      appState.drillConfig = { totalChords: 2 };
      appState.drillProgression = ['C', 'G'];
      appState.drillCurrentIndex = 0;
      appState.drillResults = { chordResults: [] };
      testMain.handleDetectionResult(held, new Float32Array(0));
      const drillHeld = appState.drillResults.chordResults.length;
      appState.isDrillActive = false;
      appState.midiManager = null;
      return { afterHeld, afterFresh, heldNote, freshNotes, heldTuner, liveCells, confidence, trainer, scales, drillHeld };
    });
    assert.deepEqual(data.afterHeld, { score: 0, midi: 0, logs: 0 });
    assert.deepEqual(data.afterFresh, { score: 0, midi: 2, logs: 1 });
    assert.deepEqual(data.heldNote, { score: 0, midi: 0 });
    assert.deepEqual(data.freshNotes, { score: 0, midi: 2 });
    assert.match(data.heldTuner, /held/i);
    assert.match(data.confidence, /held/i);
    assert.equal(data.liveCells, 0);
    assert.equal(data.trainer, 1); assert.equal(data.scales, 1); assert.equal(data.drillHeld, 0);
  });

  await check('pointer orbit/picking and hidden-scene lifecycle use the original renderer', async () => {
    await show('chords', 'library-neck-3d');
    const pos = await evaluate(() => {
      const scene = testScenes['library-neck-3d'].scene;
      scene.reset();
      const rect = scene.renderer.domElement.getBoundingClientRect();
      window.testCameraBefore = scene.camera.position.toArray();
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    });
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', ...pos, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pos.x + 45, y: pos.y + 20, button: 'left', buttons: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: pos.x + 45, y: pos.y + 20, button: 'left', clickCount: 1 });
    assert.notDeepEqual(await evaluate(() => testScenes['library-neck-3d'].scene.camera.position.toArray()),
      await evaluate(() => testCameraBefore));
    const pick = await evaluate(() => {
      const scene = testScenes['library-neck-3d'].scene;
      scene.reset();
      scene.scene.updateMatrixWorld(true);
      scene.camera.updateMatrixWorld(true);
      const target = scene.targets.find(t => t.userData.string === 0 && t.userData.fret === 4);
      const point = target.position.clone().project(scene.camera);
      const rect = scene.renderer.domElement.getBoundingClientRect();
      window.testPickBefore = testScenes['library-neck-3d'].state.frets[0];
      return { x: rect.x + (point.x + 1) / 2 * rect.width, y: rect.y + (1 - point.y) / 2 * rect.height };
    });
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', ...pick, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...pick, button: 'left', clickCount: 1 });
    assert.equal(await evaluate(() => testScenes['library-neck-3d'].state.frets[0]),
      await evaluate(() => testPickBefore === 4 ? null : 4));
    await evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await until("!testScenes['library-neck-3d'].scene.visible");
    await evaluate(() => {
      window.testHiddenScene = testScenes['library-neck-3d'].scene;
      window.testHiddenDraws = 0;
      const render = testHiddenScene.renderer.render.bind(testHiddenScene.renderer);
      testHiddenScene.renderer.render = (...args) => { testHiddenDraws++; return render(...args); };
      testHiddenScene.update(testScenes['library-neck-3d'].state);
    });
    await evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.equal(await evaluate(() => testHiddenDraws), 0);
    await show('chords', 'library-neck-3d');
    await until("testScenes['library-neck-3d'].scene.visible");
    await evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide')));
    assert.equal(await evaluate(() => document.querySelectorAll('#library-neck-3d canvas').length), 0);
    await evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow')));
    await until("!!document.querySelector('#library-neck-3d canvas')");
    await evaluate(() => {
      document.getElementById('library-neck-view-2d').click();
      document.getElementById('library-neck-view-3d').click();
      document.getElementById('library-neck-view-2d').click();
    });
    await evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.equal(await evaluate(() => document.querySelectorAll('#library-neck-3d canvas').length), 0);
    await evaluate(() => document.getElementById('library-neck-view-3d').click());
  });

  await check('all four necks resize, zoom/reset, release and fall back independently', async () => {
    const overflow = [];
    for (const [tab, prefix, host] of [['detector', 'neck', 'neck-3d'], ['chords', 'library-neck', 'library-neck-3d'], ['songs', 'song-neck', 'song-neck-3d'], ['scales', 'scale-neck', 'scale-neck-3d']]) {
      await show(tab, host);
      await send('Emulation.setDeviceMetricsOverride', { width: 320, height: 760, deviceScaleFactor: 1, mobile: false });
      await evaluate(`document.getElementById('${host}').scrollIntoView({block:'center'})`);
      await until(`document.querySelector('#${host} canvas').width > 0`);
      await evaluate(async () => {
        await document.fonts.ready;
        await Promise.allSettled(document.getAnimations().filter(a => a.effect.getComputedTiming().iterations !== Infinity).map(a => a.finished));
      });
      const camera = await evaluate(`(() => {
        const scene = testScenes['${host}'].scene;
        const start = scene.camera.position.length();
        document.getElementById('${prefix}-zoom-in').click();
        const zoomed = scene.camera.position.length();
        document.getElementById('${prefix}-reset').click();
        return { start, zoomed, reset: scene.camera.position.length(),
          width: document.getElementById('${host}').getBoundingClientRect().width,
          overflow: document.documentElement.scrollWidth > innerWidth + 1,
          overflowing: [...document.querySelectorAll('body *')].filter(el => el.getBoundingClientRect().right > innerWidth + 1 && el.getBoundingClientRect().width > 0 && el.checkVisibility()).slice(0, 12).map(el => ({id: el.id || el.className, right: el.getBoundingClientRect().right, width: el.getBoundingClientRect().width})),
          scrollWidth: document.documentElement.scrollWidth };
      })()`);
      assert.ok(camera.zoomed < camera.start);
      assert.ok(Math.abs(camera.reset - camera.start) < 0.001);
      assert.ok(camera.width <= 320);
      if (camera.overflow) overflow.push({ tab, width: camera.scrollWidth, elements: camera.overflowing });
      await screenshot(`${tab}-mobile`);
      await evaluate(`document.querySelector('#${host} canvas').dispatchEvent(new Event('webglcontextlost', {cancelable: true}))`);
      assert.equal(await evaluate(`document.getElementById('${prefix}-2d').hidden`), false);
      assert.match(await evaluate(`document.getElementById('${prefix}-help').textContent`), /unavailable/);
      assert.equal(await evaluate(`document.querySelectorAll('#${host} canvas').length`), 0);
      assert.ok(await evaluate(`document.querySelectorAll('#${prefix}-2d button').length >= 78`));
      await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
    }
    assert.deepEqual(overflow, []);
  });
  await check('reduced motion defaults all four views to keyboard-accessible 2D', async () => {
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    await evaluate(() => { localStorage.clear(); window.browserReloading = true; });
    await send('Page.reload');
    await until('!window.browserReloading && !!window.appState?.currentSession');
    for (const [tab, prefix] of [['detector', 'neck'], ['chords', 'library-neck'], ['songs', 'song-neck'], ['scales', 'scale-neck']]) {
      await evaluate(`window.switchTab('${tab}')`);
      assert.equal(await evaluate(`document.getElementById('${prefix}-view-2d').getAttribute('aria-pressed')`), 'true');
    }
    assert.equal(await evaluate(() => {
      const ids = [...document.querySelectorAll('[id]')].map(el => el.id);
      return ids.length === new Set(ids).size;
    }), true);
  });
  await check('unavailable WebGL at creation leaves all four 2D views usable', async () => {
    await evaluate(() => {
      const getContext = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function(kind, ...args) {
        if (kind === 'webgl2' || kind === 'webgl' || kind === 'experimental-webgl') return null;
        return getContext.call(this, kind, ...args);
      };
    });
    for (const [tab, prefix] of [['detector', 'neck'], ['chords', 'library-neck'], ['songs', 'song-neck'], ['scales', 'scale-neck']]) {
      await evaluate(`window.switchTab('${tab}'); document.getElementById('${prefix}-view-3d').click(); document.getElementById('${prefix}-3d').scrollIntoView({block:'center'})`);
      await until(`document.getElementById('${prefix}-help').textContent.includes('unavailable')`);
      assert.equal(await evaluate(`document.getElementById('${prefix}-2d').hidden`), false);
    }
  });
  assert.deepEqual(errors, [], 'Uncaught browser errors');
  console.log(`\n${checks}/${checks} browser checks passed`);
} finally {
  await fetch(`${endpoint}/json/close/${target.id}`);
  ws.close();
}
