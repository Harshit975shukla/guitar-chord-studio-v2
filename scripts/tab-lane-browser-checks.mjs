import assert from 'node:assert/strict';

export async function checkTabLane({ check, evaluate, send, until, show, screenshot }) {
  await show('songs', 'song-neck-3d');
  await evaluate(async () => {
    const storageUrl = performance.getEntriesByType('resource').findLast(e => new URL(e.name).pathname === '/src/storage/index.ts').name;
    const storage = await import(storageUrl);
    storage.saveCustomSong({
      id: 'browser-tab-lane', title: 'Tab lane fixture', artist: 'Original test author', key: 'G', bpm: 120,
      strum: '', strumPatternVisual: '', chordsUsed: ['G'], lines: [], isCustom: true, source: 'Original browser fixture', versionLabel: 'Tab 1',
      timing: { version: 1, bpm: 120, tempos: [], events: [
        { type: 'note', string: 1, fret: 0, beats: 1 },
        { type: 'note', string: 1, fret: 3, beats: 1 },
        { type: 'chord', chord: 'G', beats: 2 },
        { type: 'note', string: 2, fret: 1, beats: 1 },
        { type: 'rest', beats: 1 },
        { type: 'note', string: 1, fret: 5, beats: 1 },
      ] },
    });
    appState.songStudio.refreshCatalog();
    await appState.songStudio.onPlayRequested();
    window.tabLaneView = () => {
      const s = appState.songStudio, lane = s.lane, canvas = document.querySelector('#song-tab-lane canvas');
      return { index: s.currentEventIndex, summary: document.getElementById('song-next-summary').textContent,
        now: canvas.getAttribute('aria-valuenow'), max: canvas.getAttribute('aria-valuemax'), text: canvas.getAttribute('aria-valuetext'),
        ghosts: [...document.querySelectorAll('#song-fretboard-strings-rows .next-dot')].map(dot => dot.parentElement.id),
        upcoming: testScenes['song-neck-3d']?.state.upcoming ?? null, following: lane.following, beat: lane.beat };
    };
  });

  await check('Play Along tab shows now and next, previews the next note on both necks and seeks by keyboard and click', async () => {
    const start = await evaluate(() => { appState.songStudio.loadSong('original-timing-study'); return tabLaneView(); });
    assert.equal(start.index, 0); assert.equal(start.max, '7'); assert.equal(start.now, '1');
    assert.match(start.summary, /^Now C · 2 beats\. Next C again after 2 beats\./);
    assert.deepEqual(start.ghosts, [], 'a repeated chord needs no ghost');
    const rest = await evaluate(() => { appState.songStudio.seek(2); return tabLaneView(); });
    assert.match(rest.summary, /^Now rest · ½ beats\. Next E4 · string 1, open after ½ beats\./);
    assert.deepEqual(rest.ghosts, ['song-fret-cell-0-0']);
    assert.deepEqual(rest.upcoming, [{ stringIndex: 0, fret: 0, label: 'E' }]);
    assert.match(rest.text, /^Event 3 of 7: rest/);
    const note = await evaluate(() => { appState.songStudio.seek(3); return tabLaneView(); });
    assert.deepEqual(note.ghosts, ['song-fret-cell-0-3']);
    assert.deepEqual(note.upcoming, [{ stringIndex: 0, fret: 3, label: 'G' }]);
    const beforeChord = await evaluate(() => { appState.songStudio.seek(5); return tabLaneView(); });
    assert.match(beforeChord.summary, /Next G after ½ beats/);
    assert.ok(beforeChord.ghosts.length >= 3, `chord ghosts: ${beforeChord.ghosts}`);
    assert.equal(beforeChord.upcoming.length, beforeChord.ghosts.length);
    await evaluate(() => document.querySelector('#song-tab-lane canvas').focus());
    for (const [key, expected] of [['ArrowRight', 6], ['Home', 0], ['End', 6], ['ArrowLeft', 5]]) {
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code: key, windowsVirtualKeyCode: { ArrowRight: 39, ArrowLeft: 37, Home: 36, End: 35 }[key] });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code: key, windowsVirtualKeyCode: { ArrowRight: 39, ArrowLeft: 37, Home: 36, End: 35 }[key] });
      assert.equal(await evaluate(() => appState.songStudio.currentEventIndex), expected, key);
    }
    const clicked = await evaluate(() => {
      const s = appState.songStudio, lane = s.lane, canvas = document.querySelector('#song-tab-lane canvas');
      s.seek(0);
      const rect = canvas.getBoundingClientRect(), target = s.laneItems[3];
      const x = rect.left + lane.playheadX() + (target.beat + target.beats / 2 - lane.beat) * lane.scale();
      const y = rect.top + 40;
      canvas.dispatchEvent(new PointerEvent('pointerdown', { clientX: x, clientY: y, bubbles: true }));
      canvas.dispatchEvent(new PointerEvent('pointerup', { clientX: x, clientY: y, bubbles: true }));
      return s.currentEventIndex;
    });
    assert.equal(clicked, 3);
    const hidden = await evaluate(() => {
      const box = document.getElementById('song-show-next'); box.checked = false; box.dispatchEvent(new Event('change'));
      appState.songStudio.seek(2);
      const result = tabLaneView();
      box.checked = true; box.dispatchEvent(new Event('change'));
      return result;
    });
    assert.deepEqual(hidden.ghosts, []); assert.equal(hidden.upcoming, null);
    assert.match(hidden.summary, /Next E4/, 'the tab summary still shows what comes next');
    await evaluate(() => document.getElementById('song-tab-heading').scrollIntoView({ block: 'center' }));
    await screenshot('tab-lane-desktop');
  });

  await check('timed playback scrolls the tab with the audio clock and a loop section repeats only its events', async () => {
    const result = await evaluate(async () => {
      const s = appState.songStudio;
      s.loadSong('browser-tab-lane'); s.setTimingMode('song'); s.setTempo(200);
      s.seek(1); document.getElementById('song-loop-start').click();
      const byDefault = { ...s.section };
      s.seek(3); document.getElementById('song-loop-end').click();
      const section = { ...s.section }, loopText = document.getElementById('song-loop-status').textContent;
      const visited = new Set(), beats = [];
      const show = s.showEvent.bind(s);
      s.showEvent = index => { visited.add(index); show(index); };
      s.seek(0);
      await s.startPlayback();
      const firstIndex = s.currentEventIndex, following = s.lane.following;
      for (let i = 0; i < 26; i++) { await new Promise(resolve => setTimeout(resolve, 100)); beats.push(s.lane.beat); }
      s.stopPlayback();
      s.showEvent = show;
      return { byDefault, section, loopText, firstIndex, following, visited: [...visited].sort(), beats, afterStop: s.lane.following };
    });
    assert.deepEqual(result.byDefault, { start: 1, end: 4 });
    assert.deepEqual(result.section, { start: 1, end: 3 });
    assert.match(result.loopText, /Looping events 2–4 \(4 beats\)/);
    assert.equal(result.firstIndex, 1, 'Play starts at the loop start when outside it');
    assert.equal(result.following, true);
    assert.deepEqual(result.visited, [0, 1, 2, 3], `visited ${result.visited}`);
    assert.ok(result.beats.every(beat => beat >= 1 - 1e-6 && beat <= 5 + 1e-6), `beats ${result.beats.map(b => b.toFixed(2))}`);
    assert.ok(result.beats.some((beat, i) => i && beat < result.beats[i - 1] - .5), 'the playhead wraps back to the loop start');
    assert.ok(new Set(result.beats.map(beat => Math.round(beat * 4))).size > 8, 'the playhead moves smoothly between events');
    assert.equal(result.afterStop, false);
    const wait = await evaluate(() => {
      const s = appState.songStudio;
      s.setTimingMode('wait'); s.seek(3); s.stepNext();
      const wrapped = s.currentEventIndex;
      document.getElementById('song-loop-clear').click();
      const cleared = { section: s.section, text: document.getElementById('song-loop-status').textContent, disabled: document.getElementById('song-loop-clear').disabled };
      s.seek(3); s.stepNext();
      const normal = s.currentEventIndex;
      s.setTimingMode('song'); s.setTempo(100);
      return { wrapped, cleared, normal };
    });
    assert.equal(wait.wrapped, 1);
    assert.deepEqual(wait.cleared, { section: null, text: '', disabled: true });
    assert.equal(wait.normal, 4);
    const reset = await evaluate(() => {
      const s = appState.songStudio;
      s.seek(1); document.getElementById('song-loop-start').click();
      s.loadSong('original-timing-study');
      return s.section;
    });
    assert.equal(reset, null, 'a different chart clears the loop section');
  });

  await check('the tab fits 320px, keeps controls reachable and pauses drawing when Play Along is hidden', async () => {
    await send('Emulation.setDeviceMetricsOverride', { width: 320, height: 900, deviceScaleFactor: 1, mobile: false });
    await evaluate(() => document.getElementById('song-tab-heading').scrollIntoView({ block: 'start' }));
    await screenshot('tab-lane-mobile');
    const layout = await evaluate(() => {
      const lane = document.getElementById('song-tab-lane').getBoundingClientRect(), canvas = document.querySelector('#song-tab-lane canvas').getBoundingClientRect();
      const offenders = [...document.querySelectorAll('.tab-lane-block *')].filter(el => el.getBoundingClientRect().right > innerWidth + 1).map(el => el.id || el.className).slice(0, 5);
      return { page: document.documentElement.scrollWidth > innerWidth + 1, fits: Math.abs(canvas.width / devicePixelRatio - lane.width) < 3, offenders,
        buttons: [...document.querySelectorAll('.tab-lane-loop button')].every(b => b.getBoundingClientRect().height >= 36) };
    });
    assert.deepEqual(layout, { page: false, fits: true, offenders: [], buttons: true });
    const paused = await evaluate(async () => {
      const s = appState.songStudio;
      s.loadSong('browser-tab-lane'); await s.startPlayback();
      await new Promise(resolve => setTimeout(resolve, 150));
      const running = s.lane.frame !== 0;
      switchTab('chords');
      const hidden = { frame: s.lane.frame, playing: s.isPlaying, following: s.lane.following };
      switchTab('songs');
      return { running, hidden };
    });
    assert.equal(paused.running, true);
    assert.deepEqual(paused.hidden, { frame: 0, playing: false, following: false });
    await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  });
}
