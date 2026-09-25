import assert from 'node:assert/strict';

export async function checkSongs({ check, evaluate, send, until, show, screenshot }) {
  await show('songs', 'song-neck-3d');
  await evaluate(async () => {
    const storageUrl = performance.getEntriesByType('resource').findLast(e => new URL(e.name).pathname === '/src/storage/index.ts').name;
    window.songStorage = await import(storageUrl);
    songStorage.saveCustomSong({
      id: 'browser-original-timing', title: 'Copper Timing Exercise', artist: 'Original test author',
      key: 'C', bpm: 120, strum: '', strumPatternVisual: '', chordsUsed: [], lines: [], isCustom: true,
      source: 'Original browser fixture', versionLabel: 'Study 1',
      timing: { version: 1, bpm: 120, tempos: [{ beat: .75, bpm: 60 }], events: [
        { type: 'note', string: 1, fret: 0, beats: .25 },
        { type: 'rest', beats: .5 },
        { type: 'note', string: 1, fret: 3, beats: 1 },
        { type: 'note', string: 2, fret: 1, beats: .25 },
      ] },
    });
    appState.songStudio.loadSong('browser-original-timing');
    await appState.songStudio.onPlayRequested();
    const ctx = appState.audioContext;
    const create = ctx.createBufferSource.bind(ctx);
    window.scheduledSongAudio = [];
    ctx.createBufferSource = () => {
      const source = create();
      const start = source.start.bind(source), stop = source.stop.bind(source);
      const record = { start: null, stops: [] };
      source.start = time => { record.start = time; scheduledSongAudio.push(record); start(time); };
      source.stop = time => { record.stops.push(time ?? ctx.currentTime); stop(time); };
      return source;
    };
  });
  await check('Song timing, speed and fixed tempo schedule actual sound with unequal beats and silence', async () => {
    for (const [mode, rate, durations, starts] of [
      ['song', 100, [.125, 1, .25], [0, .375, 1.375]],
      ['song', 50, [.25, 2, .5], [0, .75, 2.75]],
      ['fixed', 120, [.125, .5, .125], [0, .375, .875]],
    ]) {
      await evaluate(`(() => {
        const s = appState.songStudio;
        s.loadSong('browser-original-timing'); s.setTimingMode('${mode}'); s.setTempo(${rate});
        scheduledSongAudio.length = 0;
      })()`);
      await evaluate(() => appState.songStudio.startPlayback());
      await until('!appState.songStudio.isPlaying');
      const sounds = await evaluate(() => scheduledSongAudio);
      assert.equal(sounds.length, 3, 'Rest must not synthesize audio');
      sounds.forEach((sound, i) => {
        assert.ok(Math.abs(sound.start - sounds[0].start - starts[i]) < .005, 'Authored onset changed');
        assert.ok(Math.abs(sound.stops[0] - sound.start - durations[i]) < .005, 'Authored duration changed');
      });
      assert.match(await evaluate(() => document.getElementById('song-current-target').textContent), /4\/4/);
      assert.equal(await evaluate(() => testScenes['song-neck-3d'].state.frets[1]), 1);
    }
  });
  await check('timed navigation and pending starts cancel scheduled audio without stale advancement', async () => {
    const result = await evaluate(async () => {
      const s = appState.songStudio;
      s.loadSong('browser-original-timing');
      const ready = s.onPlayRequested;
      let release;
      s.onPlayRequested = () => new Promise(resolve => { release = resolve; });
      const started = s.startPlayback();
      s.stepNext();
      release(); await started;
      const stale = { playing: s.isPlaying, index: s.currentEventIndex };
      s.onPlayRequested = ready;
      s.restartPlayback(); await s.startPlayback();
      await new Promise(resolve => setTimeout(resolve, 160));
      const before = scheduledSongAudio.length;
      s.stepNext();
      const afterSeek = { playing: s.isPlaying, index: s.currentEventIndex, timers: s.transport.timer };
      await new Promise(resolve => setTimeout(resolve, 200));
      return { stale, afterSeek, extra: scheduledSongAudio.length - before };
    });
    assert.deepEqual(result.stale, { playing: false, index: 1 });
    assert.deepEqual(result.afterSeek, { playing: false, index: 1, timers: null });
    assert.equal(result.extra, 0);
  });
  await check('Wait mode handles denial, rests, fresh/held/wrong/repeated performances and capo', async () => {
    const data = await evaluate(async () => {
      const s = appState.songStudio;
      const mic = s.onMicStartRequested;
      const realNow = Date.now;
      let clock = realNow() + 1000;
      Date.now = () => clock;
      const frame = (symbol, id, fresh = true, midi) => {
        const result = {
          mode: midi === undefined ? 'chord' : 'single-note', freshness: fresh ? 'fresh' : 'held',
          timestamp: clock, chroma: new Float32Array(12), peaks: [], spectrum: new Float32Array(0), signalLevelDb: -20,
          chord: midi === undefined ? { symbol, root: symbol[0], quality: 'Major', confidence: 85, activeNotes: [], intervals: '' } : undefined,
          note: midi === undefined ? undefined : { pitch: { note: 'E', octave: 4, midi, freq: 329.63, cents: 0 }, confidence: 90, tunerVerdict: 'in-tune' },
          performance: { id, attackAt: clock, frameAt: clock, signalPresent: true },
        };
        s.evaluatePractice(result);
      };
      const quiet = id => {
        for (const delta of [0, 120]) {
          clock += delta;
          s.evaluatePractice({ mode: 'idle', freshness: 'none', timestamp: clock,
            performance: { id, attackAt: 0, frameAt: clock, signalPresent: false } });
        }
      };
      try {
        s.loadSong('original-timing-study'); s.setTimingMode('wait');
        s.onMicStartRequested = async () => false;
        const beforeSounds = scheduledSongAudio.length;
        await s.startPlayback();
        const denied = document.getElementById('song-transport-status').textContent;
        const deniedIndex = s.currentEventIndex;
        s.stepNext(); const manual = s.currentEventIndex; s.stepPrev();
        s.onMicStartRequested = async () => true;
        await s.togglePracticeMic();
        quiet(0); clock += 50;
        frame('Cm', 1); frame('Cmaj7', 2); frame('C', 3, false);
        const wrong = s.currentEventIndex;
        frame('C', 4); const first = s.currentEventIndex;
        clock += 32; frame('C', 4); frame('C', 5, false);
        const repeated = s.currentEventIndex;
        clock += 40; frame('C', 6); const second = s.currentEventIndex;
        clock += 40; frame('C', 7); const rest = s.currentEventIndex;
        s.stepNext(); quiet(7);
        clock += 20; frame('', 8, true, 64);
        const oneNote = s.currentEventIndex;
        clock += 32; frame('', 8, true, 64);
        const twoNotes = s.currentEventIndex;
        s.stopPlayback(); clock += 30; frame('', 9, true, 67); frame('', 9, true, 67);
        const paused = s.currentEventIndex;
        const noAutoSound = scheduledSongAudio.length === beforeSounds;

        s.restartPlayback(); s.setTranspose(2); testMain.setCapo(2); await s.startPlayback();
        quiet(9); clock += 20; frame('D', 10);
        const wrongCapo = s.currentEventIndex;
        clock += 30; frame('E', 11); const capoMatch = s.currentEventIndex;
        s.onMicrophoneStopped();
        clock += 30; frame('E', 12); const stoppedMicIndex = s.currentEventIndex;
        const stoppedMicStatus = document.getElementById('song-transport-status').textContent;
        s.stopPlayback(); testMain.setCapo(0); s.setTranspose(0);
        return { denied, deniedIndex, manual, wrong, first, repeated, second, rest, oneNote, twoNotes, paused,
          noAutoSound, wrongCapo, capoMatch, stoppedMicIndex, stoppedMicStatus, score: s.practiceScore };
      } finally { Date.now = realNow; s.onMicStartRequested = mic; s.onMicrophoneStopped(); s.stopPlayback(); }
    });
    assert.match(data.denied, /denied|unavailable/i);
    assert.equal(data.deniedIndex, 0); assert.equal(data.manual, 1);
    assert.equal(data.wrong, 0); assert.equal(data.first, 1); assert.equal(data.repeated, 1);
    assert.equal(data.second, 2); assert.equal(data.rest, 2);
    assert.equal(data.oneNote, 3); assert.equal(data.twoNotes, 4); assert.equal(data.paused, 4);
    assert.equal(data.noAutoSound, true);
    assert.equal(data.wrongCapo, 0); assert.equal(data.capoMatch, 1); assert.equal(data.stoppedMicIndex, 1);
    assert.match(data.stoppedMicStatus, /Retry|manual Next/);
  });
  await check('Wait auditions and pending microphone/mode changes cannot grade or restart themselves', async () => {
    const result = await evaluate(async () => {
      const s = appState.songStudio, mic = s.onMicStartRequested;
      let release;
      s.loadSong('original-timing-study'); s.setTimingMode('wait');
      s.onMicStartRequested = () => new Promise(resolve => { release = resolve; });
      const pending = s.startPlayback();
      s.setTimingMode('fixed'); release(true); await pending;
      const staleMic = { playing: s.isPlaying, mode: s.timingMode, index: s.currentEventIndex };
      s.setTimingMode('wait'); s.onMicStartRequested = async () => true; await s.startPlayback();
      const before = s.practiceScore;
      await s.audition();
      const now = Date.now();
      for (const time of [now, now + 200]) s.evaluatePractice({ freshness: 'none', performance: { id: 1, attackAt: 0, frameAt: time, signalPresent: false } });
      s.evaluatePractice({ mode: 'chord', freshness: 'fresh', chord: { symbol: 'C', confidence: 90 }, performance: { id: 2, attackAt: now + 220, frameAt: now + 220, signalPresent: true } });
      const selfGrade = s.practiceScore - before;
      window.switchTab('chords');
      const stopped = !s.isPlaying && s.sources.size === 0 && !s.transport.running;
      s.onMicStartRequested = mic; s.onMicrophoneStopped();
      return { staleMic, selfGrade, stopped };
    });
    assert.deepEqual(result.staleMic, { playing: false, mode: 'fixed', index: 0 });
    assert.equal(result.selfGrade, 0); assert.equal(result.stopped, true);
  });

  await check('Finder imports, searches and opens the exact original chart with truthful capabilities', async () => {
    const result = await evaluate(() => {
      window.switchTab('search');
      document.querySelector('#pane-search [data-open-song-import]').click();
      document.getElementById('custom-song-title-input').value = 'Copper Lantern Walk';
      document.getElementById('custom-song-artist-input').value = 'नील Original';
      document.getElementById('custom-song-source').value = 'My practice notebook';
      document.getElementById('custom-song-version').value = 'Version 1';
      document.getElementById('custom-song-lyrics').value = '[Verse]\n[C]Two steps [G]then pause\nC C G C';
      document.getElementById('btn-save-custom-song').click();
      const id = appState.songStudio.activeSongId;
      const order = appState.songStudio.timeline.events.map(e => e.chord);
      const source = document.getElementById('song-source-text').textContent;
      window.switchTab('search');
      document.getElementById('search-song-input').value = 'Coper Lantern Walk';
      document.getElementById('song-search-content').value = 'imported';
      document.getElementById('btn-search-song').click();
      const resultId = document.querySelector('#search-results button')?.dataset.songId;
      const capability = document.getElementById('search-results').textContent;
      document.querySelector('#search-results button').click();
      const opened = appState.songStudio.activeSongId;
      const selector = document.getElementById('song-selector-select').value;
      window.switchTab('search');
      document.getElementById('song-search-content').value = 'chords';
      document.getElementById('search-song-input').value = 'Copper Timing Exercise';
      document.getElementById('btn-search-song').click();
      const tabsResults = document.querySelectorAll('#search-results button').length;
      document.getElementById('search-song-input').value = '...';
      document.getElementById('btn-search-song').click();
      const noMatch = document.getElementById('song-search-status').textContent;
      return { id, order, source, resultId, capability, opened, selector, tabsResults, noMatch };
    });
    assert.deepEqual(result.order, ['C', 'G', 'C', 'C', 'G', 'C']);
    assert.match(result.source, /\[C\]Two steps/);
    assert.equal(result.id, result.resultId); assert.equal(result.id, result.opened); assert.equal(result.id, result.selector);
    assert.match(result.capability, /Imported chord chart/); assert.match(result.capability, /Approximate timing/);
    assert.equal(result.tabsResults, 0); assert.match(result.noMatch, /No local matches/);
  });
  await screenshot('song-finder-desktop');
  await check('Timing editor validates, saves/reloads and exports authored musical events', async () => {
    const result = await evaluate(async () => {
      window.switchTab('songs');
      appState.songStudio.loadSong('browser-original-timing');
      document.getElementById('song-edit-timing').click();
      const editor = document.getElementById('song-timing-editor');
      const textarea = document.getElementById('song-timing-json');
      textarea.value = '{bad';
      document.getElementById('song-editor-save').click();
      const invalid = editor.open && document.getElementById('song-editor-status').textContent.includes('Invalid JSON');
      textarea.value = JSON.stringify({ version: 1, bpm: 90, tempos: [{ beat: 1, bpm: 120 }],
        events: [{ type: 'note', string: 1, fret: 3, beats: .75 }, { type: 'rest', beats: .5 }, { type: 'chord', chord: 'G', beats: 2 }] });
      document.getElementById('song-editor-save').click();
      const closed = !editor.open;
      const id = appState.songStudio.activeSongId;
      appState.songStudio.loadSong(id);
      const beats = appState.songStudio.timeline.events.map(e => e.beats);
      document.getElementById('song-edit-timing').click();
      const create = URL.createObjectURL, click = HTMLAnchorElement.prototype.click;
      let exported;
      URL.createObjectURL = blob => { exported = blob; return create(blob); };
      HTMLAnchorElement.prototype.click = function() {};
      try {
        document.getElementById('song-editor-export').click();
        const exportedSong = JSON.parse(await exported.text());
        editor.close();
        return { invalid, closed, beats, exported: exportedSong.timing.events.map(e => e.beats), source: exportedSong.source };
      } finally { URL.createObjectURL = create; HTMLAnchorElement.prototype.click = click; }
    });
    assert.equal(result.invalid, true); assert.equal(result.closed, true);
    assert.deepEqual(result.beats, [.75, .5, 2]); assert.deepEqual(result.exported, result.beats);
    assert.equal(result.source, 'Original browser fixture');
  });
  await check('unsupported tabs and unknown IDs are explicit, and song tools fit 320px', async () => {
    await evaluate(() => {
      document.querySelector('#pane-songs [data-open-song-import]').click();
      document.getElementById('custom-song-title-input').value = 'Original tab source';
      document.getElementById('custom-song-lyrics').value = 'e|--0h2--3~--|';
      document.getElementById('btn-save-custom-song').click();
    });
    assert.match(await evaluate(() => document.getElementById('song-source-text').textContent), /0h2/);
    assert.equal(await evaluate(() => document.getElementById('btn-song-play').disabled), true);
    assert.equal(await evaluate(() => appState.songStudio.loadSong('unknown-song-id')), false);
    assert.match(await evaluate(() => document.getElementById('song-transport-status').textContent), /not in the local library/);
    await evaluate(() => appState.songStudio.loadSong('original-timing-study'));
    await send('Emulation.setDeviceMetricsOverride', { width: 320, height: 760, deviceScaleFactor: 1, mobile: false });
    for (const tab of ['songs', 'search']) {
      await evaluate(`window.switchTab('${tab}'); window.scrollTo(0,0);`);
      await evaluate(async () => {
        await document.fonts.ready;
        await Promise.allSettled(document.getAnimations().filter(a => a.effect.getComputedTiming().iterations !== Infinity).map(a => a.finished));
      });
      assert.equal(await evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, `${tab} overflow`);
      await screenshot(`song-tools-${tab}-mobile`);
    }
    await evaluate(() => { window.switchTab('songs'); document.getElementById('song-edit-timing').click(); });
    assert.ok(await evaluate(() => document.getElementById('song-timing-editor').getBoundingClientRect().width <= 320));
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    assert.equal(await evaluate(() => document.getElementById('song-timing-editor').open), false);
    await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
    await show('songs', 'song-neck-3d');
  });
}
