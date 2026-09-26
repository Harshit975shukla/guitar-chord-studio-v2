import assert from 'node:assert/strict';

export async function checkPractice({ check, evaluate, send, until, show, screenshot }) {
  await show('songs', 'song-neck-3d');
  await evaluate(() => {
    songStorage.saveCustomSong({
      id: 'position-study', title: 'Original position study', artist: 'Original test fixture', key: 'E', bpm: 120,
      strum: '', strumPatternVisual: '', chordsUsed: [], lines: [], isCustom: true,
      timing: { version: 1, bpm: 120, tempos: [], events: [{ type: 'note', string: 1, fret: 0, beats: .5 }] },
    });
    window.positionAudioSources = [];
    const create = appState.audioContext.createBufferSource.bind(appState.audioContext);
    appState.audioContext.createBufferSource = () => {
      const source = create();
      positionAudioSources.push(source);
      return source;
    };
  });
  await check('Play Along positions synchronize selected fingering, actual sound and both necks', async () => {
    for (const [register, string, fret] of [['all', 0, 0], ['open', 0, 0], ['middle', 1, 5], ['upper', 2, 9]]) {
      const data = await evaluate(`(() => {
        const s = appState.songStudio;
        s.loadSong('position-study');
        s.setTimingMode('song');
        const select = document.getElementById('song-position-filter');
        select.value = '${register}'; select.dispatchEvent(new Event('change'));
        const state = testScenes['song-neck-3d'].state;
        const frets = state.frets;
        const flat = document.querySelector('#song-fretboard-strings-rows .finger-dot')?.parentElement.id;
        positionAudioSources.length = 0;
        return { frets, flat, midi: s.practiceTarget().midi };
      })()`);
      const expected = [null, null, null, null, null, null]; expected[string] = fret;
      assert.deepEqual(data.frets, expected);
      assert.equal(data.flat, `song-fret-cell-${string}-${fret}`);
      assert.equal(data.midi, 64);
      await evaluate(() => appState.songStudio.startPlayback());
      await until('!appState.songStudio.isPlaying');
      const sound = await evaluate(async () => {
        const { DetectionEngine } = await import('/src/detection/engine.ts');
        const buffer = positionAudioSources[0]?.buffer;
        return { count: positionAudioSources.length, freq: buffer
          ? new DetectionEngine().fastAutocorrelate(buffer.getChannelData(0).slice(2205, 10397), buffer.sampleRate).freq : null };
      });
      assert.equal(sound.count, 1);
      assert.ok(Math.abs(sound.freq - 329.63) < 1, `${register} sound ${sound.freq}`);
    }
    const chords = await evaluate(() => {
      const s = appState.songStudio, out = [];
      s.loadSong('original-timing-study');
      for (const register of ['open', 'middle', 'upper']) {
        s.setPosition(register);
        const state = testScenes['song-neck-3d'].state;
        out.push({ register, frets: state.frets, pcs: [...new Set(state.frets.flatMap((f, i) => f === null ? [] : [(state.tuning[i].midi + f) % 12]))].sort() });
      }
      return out;
    });
    for (const { register, frets, pcs } of chords) {
      const [min, max] = { open: [0, 4], middle: [5, 8], upper: [9, 12] }[register];
      assert.ok(frets.every(f => f === null || f >= min && f <= max));
      assert.deepEqual(pcs, [0, 4, 7]);
    }
  });
  await check('unavailable positions are explicit and cancel audio, pending starts and Wait grading', async () => {
    const data = await evaluate(async () => {
      const s = appState.songStudio;
      songStorage.saveCustomSong({
        ...songStorage.loadCustomSongs().find(s => s.id === 'position-study'),
        id: 'low-position-study', timing: { version: 1, bpm: 120, tempos: [], events: [{ type: 'note', string: 6, fret: 0, beats: .5 }, { type: 'note', string: 1, fret: 12, beats: .5 }] },
      });
      s.loadSong('low-position-study'); s.setPosition('middle');
      positionAudioSources.length = 0;
      await s.startPlayback();
      const issue = document.getElementById('song-position-status').textContent;
      const blocked = !s.isPlaying && document.getElementById('btn-song-audition').disabled;
      const empty = testScenes['song-neck-3d'].state.frets.every(f => f === null);
      const mic = s.onMicStartRequested;
      s.onMicStartRequested = async () => true;
      s.setTimingMode('wait'); await s.startPlayback();
      const target = s.practiceTarget();
      const before = s.practiceScore;
      const now = Date.now();
      for (const at of [now, now + 120]) s.evaluatePractice({ freshness: 'none', performance: { id: 0, frameAt: at, signalPresent: false } });
      for (const at of [now + 140, now + 180]) s.evaluatePractice({
        mode: 'single-note', freshness: 'fresh', note: { pitch: { midi: 40 }, confidence: 90 },
        performance: { id: 3, attackAt: now + 140, frameAt: at, signalPresent: true },
      });
      const scored = s.practiceScore - before;
      s.onMicStartRequested = mic; s.onMicrophoneStopped();
      s.setTimingMode('song'); s.loadSong('position-study'); s.setPosition('open');
      const ready = s.onPlayRequested;
      let release;
      s.onPlayRequested = () => new Promise(resolve => { release = resolve; });
      const pending = s.startPlayback();
      s.setPosition('middle'); release(); await pending;
      s.onPlayRequested = ready;
      const cancelled = !s.isPlaying && !s.transport.running && s.sources.size === 0;
      const sourceCount = positionAudioSources.length;
      testMain.setCapo(2);
      const capoMidi = s.practiceTarget().midi;
      const capoFrets = [...testScenes['song-neck-3d'].state.frets];
      testMain.setCapo(0); s.setPosition('all');
      return { issue, blocked, empty, target, scored, cancelled, sourceCount, capoMidi, capoFrets };
    });
    assert.match(data.issue, /No fingering for this exact pitch/);
    assert.equal(data.blocked, true); assert.equal(data.empty, true);
    assert.deepEqual(data.target, { type: 'rest' }); assert.equal(data.scored, 0);
    assert.equal(data.cancelled, true); assert.equal(data.sourceCount, 0);
    assert.equal(data.capoMidi, 66); assert.equal(data.capoFrets[1], 5);
  });

  await check('Happy Birthday Open fit retains and plays all 25 notes at one uniform octave', async () => {
    const data = await evaluate(() => {
      const s = appState.songStudio;
      s.setPosition('open');
      const select = document.getElementById('song-selector-select');
      select.value = 'happy_birthday'; select.dispatchEvent(new Event('change'));
      const preselectedOpenShift = s.melodyOctaves;
      s.setPosition('open'); s.setTimingMode('fixed'); s.setTempo(400);
      const original = JSON.stringify(s.timeline);
      window.birthdayExpectedMidis = s.timeline.events.map(event => appState.effectiveTuning[event.string - 1].midi + event.fret - 12);
      const blocked = document.getElementById('song-melody-fit-status').textContent;
      window.birthdayNeckStates = new Map();
      window.birthdayShowEvent = s.showEvent;
      s.showEvent = function(index) {
        birthdayShowEvent.call(this, index);
        if (this.isPlaying) birthdayNeckStates.set(index, { midi: this.practiceTarget().midi, frets: [...testScenes['song-neck-3d'].state.frets] });
      };
      positionAudioSources.length = 0;
      return { count: s.timeline.events.length, original, after: JSON.stringify(s.timeline), shift: s.melodyOctaves, preselectedOpenShift, part: s.playMode,
        fitText: document.getElementById('song-melody-fit-status').textContent, blocked,
        expectedMidis: birthdayExpectedMidis };
    });
    assert.equal(data.count, 25); assert.equal(data.original, data.after); assert.equal(data.shift, -1);
    assert.equal(data.preselectedOpenShift, -1); assert.equal(data.part, 'notes');
    assert.match(data.fitText, /Automatically fitted.*1 octave lower/); assert.match(data.blocked, /Automatically fitted/);
    try {
      await evaluate(() => appState.songStudio.startPlayback());
      await until('!appState.songStudio.isPlaying');
      const audio = await evaluate(async () => {
        const { renderStringSamples } = await import('/src/audio/engine.ts');
        const states = [...birthdayNeckStates].sort((a, b) => a[0] - b[0]).map(([, state]) => state);
        return {
          count: positionAudioSources.length,
          // Exact scheduled waveform checks avoid autocorrelation's possible
          // subharmonic choices (notably B3 at 48 kHz).
          expectedWaveforms: positionAudioSources.map((source, index) => {
            const expected = renderStringSamples(source.buffer.sampleRate, {
              freq: 440 * 2 ** ((birthdayExpectedMidis[index] - 69) / 12),
              stringIndex: states[index].frets.findIndex(f => f !== null),
              model: appState.acousticBus.model, startTime: 0, velocity: .9,
            });
            return source.buffer.getChannelData(0).every((sample, i) => sample === expected[i]);
          }),
          states,
          current: document.getElementById('song-current-target').textContent,
        };
      });
      assert.equal(audio.count, 25); assert.equal(audio.states.length, 25);
      for (let i = 0; i < 25; i++) {
        assert.equal(audio.expectedWaveforms[i], true, `Happy Birthday scheduled waveform ${i + 1}`);
        assert.equal(audio.states[i].midi, data.expectedMidis[i]);
        assert.ok(audio.states[i].frets.every(f => f === null || f >= 0 && f <= 4));
      }
      assert.match(audio.current, /25\/25/); assert.match(audio.current, /1 octave lower/);
    } finally {
      await evaluate(() => { appState.songStudio.stopPlayback(); appState.songStudio.showEvent = birthdayShowEvent; });
    }
  });
  await check('fitted melody Wait targets use the shifted octave; restoring/source export preserves the original', async () => {
    const data = await evaluate(async () => {
      const s = appState.songStudio, now = Date.now, mic = s.onMicStartRequested;
      let clock = now() + 1000;
      Date.now = () => clock;
      const frame = (id, midi, present = true) => {
        clock += 40;
        s.evaluatePractice({ mode: present ? 'single-note' : 'idle', freshness: present ? 'fresh' : 'none',
          note: present ? { pitch: { midi }, confidence: 90 } : undefined,
          performance: { id, attackAt: clock, frameAt: clock, signalPresent: present } });
      };
      try {
        s.restartPlayback(); s.setTimingMode('wait'); s.onMicStartRequested = async () => true; s.onMicrophoneStopped();
        await s.startPlayback();
        for (let i = 0; i < 5; i++) frame(0, 0, false);
        frame(1, 67); frame(1, 67); const originalOctaveRejected = s.currentEventIndex;
        frame(2, 55); frame(2, 55); const shiftedAccepted = s.currentEventIndex;
        frame(2, 55); frame(2, 55); const repeatedRejected = s.currentEventIndex;
        frame(3, 55); frame(3, 55); const newPluckAccepted = s.currentEventIndex;
        const originalSourceNotes = s.getSongForEditing().timing.events.filter(e => e.type === 'note').length;
        const highSourceNotes = s.getSongForEditing().timing.events.filter(e => e.type === 'note' && e.fret > 12).length;
        document.getElementById('song-original-octave').click();
        const restored = { shift: s.melodyOctaves, playing: s.isPlaying, blocked: document.getElementById('song-melody-fit-status').textContent };
        s.setPosition('all'); s.loadSong('original-timing-study'); s.setTimingMode('song');
        return { originalOctaveRejected, shiftedAccepted, repeatedRejected, newPluckAccepted, originalSourceNotes, highSourceNotes, restored };
      } finally { Date.now = now; s.onMicStartRequested = mic; s.onMicrophoneStopped(); s.stopPlayback(); }
    });
    assert.equal(data.originalOctaveRejected, 0); assert.equal(data.shiftedAccepted, 1);
    assert.equal(data.repeatedRejected, 1); assert.equal(data.newPluckAccepted, 2);
    assert.equal(data.originalSourceNotes, 25); assert.equal(data.highSourceNotes, 3);
    assert.equal(data.restored.shift, 0); assert.equal(data.restored.playing, false); assert.match(data.restored.blocked, /do not fit/);
  });

  await check('Open completion to Middle to Upper and Play again each play the full 25-note melody', async () => {
    await evaluate(() => {
      const s = appState.songStudio;
      s.loadSong('happy_birthday');
      s.setTimingMode('fixed'); s.setTempo(400);
      window.replayOldShow = s.showEvent;
      window.replayStates = new Map();
      s.showEvent = function(index) {
        replayOldShow.call(this, index);
        if (this.isPlaying) replayStates.set(index, {
          frets: [...testScenes['song-neck-3d'].state.frets],
          target: document.getElementById('song-current-target').textContent,
          midi: this.practiceTarget().midi,
        });
      };
    });
    try {
      for (const position of ['open', 'middle', 'upper', 'replay']) {
        const initial = await evaluate(`(() => {
          const s = appState.songStudio;
          if ('${position}' !== 'replay') {
            const select = document.getElementById('song-position-filter');
            select.value = '${position}'; select.dispatchEvent(new Event('change'));
          }
          positionAudioSources.length = 0; replayStates.clear();
          return {index:s.currentEventIndex,completed:s.playbackComplete};
        })()`);
        assert.equal(initial.index, position === 'replay' ? 24 : 0);
        if (position === 'replay') assert.equal(initial.completed, true);
        await evaluate(() => document.getElementById('btn-song-play').click());
        await until('!appState.songStudio.isPlaying');
        const played = await evaluate(() => ({
          voices: positionAudioSources.length, states: [...replayStates].sort((a, b) => a[0] - b[0]),
          complete: appState.songStudio.playbackComplete,
          button: document.getElementById('song-play-text').textContent,
          reachSummary: document.getElementById('song-melody-fit-status').textContent,
        }));
        assert.equal(played.voices, 25, position); assert.equal(played.states.length, 25, position);
        assert.equal(played.states[0][0], 0); assert.equal(played.complete, true); assert.equal(played.button, 'Play again');
        if (position === 'middle') {
          const reaches = played.states.filter(([, state]) => state.target.includes('One-fret reach'));
          assert.equal(reaches.length, 2); assert.match(played.reachSummary, /2 notes use a one-fret reach at fret 4/);
          assert.ok(reaches.every(([, state]) => state.frets[2] === 4 && state.midi === 59));
        }
      }
    } finally {
      await evaluate(() => {
        appState.songStudio.stopPlayback();
        appState.songStudio.showEvent = replayOldShow;
        appState.songStudio.setPosition('all');
      });
    }
  });

  await show('scales', 'scale-neck-3d');
  await check('Scales position control is beside the neck and updates all four ranges', async () => {
    const result = await evaluate(() => {
      const control = document.getElementById('scale-position-filter');
      const s = appState.scalesStudio;
      const ranges = [];
      s.setPracticeMode('free');
      for (const register of ['all', 'open', 'middle', 'upper']) {
        control.value = register; control.dispatchEvent(new Event('change'));
        ranges.push({ register, frets: s.neck3d.state.scalePositions.map(p => p.fret) });
      }
      s.setRegister('middle');
      return { count: document.querySelectorAll('#scale-position-filter').length, byNeck: !!control.closest('#scale-neck'),
        label: document.querySelector('label[for=scale-position-filter]').textContent, ranges };
    });
    assert.equal(result.count, 1); assert.equal(result.byNeck, true); assert.match(result.label, /Playing position/);
    for (const { register, frets } of result.ranges) {
      const [min, max] = { all: [0, 12], open: [0, 4], middle: [5, 8], upper: [9, 12] }[register];
      assert.ok(frets.length); assert.ok(frets.every(f => f >= min && f <= max));
    }
  });
    await check('D scales and every reference pattern play tonic-to-tonic once with correctly spelled notes', async () => {
      const results = await evaluate(async () => {
        const s = appState.scalesStudio;
        const { WESTERN_SCALES } = await import(performance.getEntriesByType('resource').findLast(e => new URL(e.name).pathname === '/src/tabs/scales.ts').name);
        const set = window.setTimeout, clear = window.clearTimeout, audioTime = Object.getOwnPropertyDescriptor(appState.audioContext, 'currentTime');
        const play = s.playPosition;
        let clock = appState.audioContext.currentTime * 1000 + 10000, nextId = 700000;
        const timers = new Map(), results = [];
        window.setTimeout = (fn, delay) => { timers.set(++nextId, { fn, at: clock + delay }); return nextId; };
        window.clearTimeout = id => { if (!timers.delete(id)) clear(id); };
        Object.defineProperty(appState.audioContext, 'currentTime', { configurable: true, get: () => clock / 1000 });
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
          s.setMicPracticeActive(false); s.setLabelMode('note'); s.setRegister('all'); s.setBpm(240);
          for (const key of Object.keys(WESTERN_SCALES)) {
            s.setRoot('D'); s.setScaleKey(key); s.setPracticeMode('ascending');
            const played = [];
            s.playPosition = function(string, fret, duration) {
              play.call(this, string, fret, duration);
              played.push({ midi: this.tuning[string].midi + fret, text: document.getElementById('scale-neck-summary').textContent });
            };
            await s.startScaleAudioRun(); advance(10000);
            results.push({ key, played, expected: WESTERN_SCALES[key].intervals,
              running: s.isAudioRunning, timer: s.audioRunTimer, ribbon: document.getElementById('scale-ribbon-notes').textContent });
          }
          s.setRoot('D'); s.setScaleKey('natural_minor'); s.setPracticeMode('descending');
          const descending = [];
          s.playPosition = function(string, fret, duration) { play.call(this, string, fret, duration); descending.push(this.tuning[string].midi + fret); };
          await s.startScaleAudioRun(); advance(10000);
          const flatDots = [...document.querySelectorAll('#scale-neck-2d [data-pc=\"10\"]')].map(dot => dot.textContent);
          const flat3d = s.neck3d.state.scalePositions.filter(p => (s.tuning[p.stringIndex].midi + p.fret) % 12 === 10).map(p => p.label);
          s.setPracticeMode('free'); advance(500); s.setMicPracticeActive(true);
          for (const frameAt of [clock, clock + 120]) s.onDetectionResult({ freshness: 'none', performance: { id: 0, frameAt, signalPresent: false } });
          s.onDetectionResult({ mode: 'single-note', freshness: 'fresh',
            note: { pitch: { midi: 58, note: 'A#', octave: 3 }, confidence: 90 },
            performance: { id: 1, attackAt: clock + 160, frameAt: clock + 160, signalPresent: true } });
          const heard = document.getElementById('scale-practice-heard').textContent;
          const feedback = document.getElementById('scale-practice-message').textContent;
          s.setMicPracticeActive(false);
          document.getElementById('scale-root-btn-Bb').click();
          const flatRoot = { root: s.activeRoot, first: s.practiceRun[0]?.midi % 12, pressed: document.getElementById('scale-root-btn-Bb').getAttribute('aria-pressed') };
          s.setRoot('A'); s.setScaleKey('pentatonic_minor'); s.setPracticeMode('free');
          return { results, descending, flatDots, flat3d, flatRoot, heard, feedback };
        } finally {
          s.stopScaleAudioRun(); s.playPosition = play;
          window.setTimeout = set; window.clearTimeout = clear;
          if (audioTime) Object.defineProperty(appState.audioContext, 'currentTime', audioTime); else delete appState.audioContext.currentTime;
          s.auditionUntil = 0;
        }
      });
      for (const { key, played, expected, running, timer } of results.results) {
        assert.equal(played.length, expected.length + 1, key);
        assert.equal(played[0].midi % 12, 2, `${key} starts D`);
        assert.equal(played.at(-1).midi - played[0].midi, 12, `${key} ends next D`);
        assert.deepEqual(played.map(p => p.midi - played[0].midi), [...expected, 12]);
        assert.equal(running, false); assert.equal(timer, null);
      }
      const minor = results.results.find(r => r.key === 'natural_minor');
      assert.equal(minor.ribbon, 'D • E • F • G • A • B♭ • C • D');
      assert.ok(minor.played.some(p => p.text.startsWith('B♭')));
      assert.ok(results.flatDots.length && results.flatDots.every(n => n === 'B♭'));
      assert.ok(results.flat3d.length && results.flat3d.every(n => n === 'B♭'));
      assert.equal(results.heard, 'B♭3'); assert.match(results.feedback, /Correct: B♭3/);
      assert.deepEqual(results.descending, [...minor.played.map(p => p.midi)].reverse());
      assert.deepEqual(results.flatRoot, { root: 'Bb', first: 10, pressed: 'true' });
    });
  await check('Free-play D scale loops up and back to the same point until Stop without doubled turnarounds', async () => {
    const result = await evaluate(async () => {
      const s = appState.scalesStudio, play = s.playPosition;
      const set = window.setTimeout, clear = window.clearTimeout;
      const audioTime = Object.getOwnPropertyDescriptor(appState.audioContext, 'currentTime');
      let clock = appState.audioContext.currentTime * 1000 + 10000, nextId = 800000;
      const timers = new Map(), played = [];
      window.setTimeout = (fn, delay) => { timers.set(++nextId, { fn, at: clock + delay }); return nextId; };
      window.clearTimeout = id => { if (!timers.delete(id)) clear(id); };
      Object.defineProperty(appState.audioContext, 'currentTime', { configurable: true, get: () => clock / 1000 });
      s.playPosition = function(string, fret, duration) {
        play.call(this, string, fret, duration);
        played.push({ string, fret, midi: this.tuning[string].midi + fret, text: document.getElementById('scale-neck-summary').textContent });
      };
      const advance = milliseconds => {
        const end = clock + milliseconds;
        for (let guard = 0; guard < 500; guard++) {
          const next = [...timers].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
          if (!next) break;
          timers.delete(next[0]); clock = next[1].at; next[1].fn();
        }
        clock = end;
      };
      try {
        s.setMicPracticeActive(false); s.setRoot('D'); s.setScaleKey('major'); s.setRegister('all'); s.setPracticeMode('free'); s.setBpm(240);
        await s.startScaleAudioRun();
        advance(29 * 250);
        const firstCycle = played.slice(0, 29);
        const nextCycleNote = played[29].midi;
        advance(28 * 250);
        const looping = s.isAudioRunning;
        const count = played.length;
        document.getElementById('btn-scale-run').click();
        advance(10000);
        const stopped = { running: s.isAudioRunning, added: played.length - count, timer: s.audioRunTimer, timers: timers.size };
        played.length = 0;
        s.setRegister('middle'); await s.startScaleAudioRun(); advance(15 * 250);
        const middle = [...played]; s.stopScaleAudioRun();
        played.length = 0;
        s.setRegister('all'); s.setPracticeMode('ascending'); await s.startScaleAudioRun(); advance(9 * 250);
        const guided = { midis: played.map(p => p.midi), running: s.isAudioRunning };
        s.setPracticeMode('free'); await s.startScaleAudioRun();
        window.switchTab('chords'); const beforeExit = played.length; advance(10000);
        const exit = { running: s.isAudioRunning, added: played.length - beforeExit, sources: s.playbackSources.size };
        return { firstCycle, nextCycleNote, looping, stopped, middle, guided, exit };
      } finally {
        s.stopScaleAudioRun(); s.playPosition = play;
        window.setTimeout = set; window.clearTimeout = clear;
        if (audioTime) Object.defineProperty(appState.audioContext, 'currentTime', audioTime); else delete appState.audioContext.currentTime;
        s.auditionUntil = 0;
      }
    });
    const up = [50, 52, 54, 55, 57, 59, 61, 62, 64, 66, 67, 69, 71, 73, 74];
    assert.deepEqual(result.firstCycle.map(p => p.midi), [...up, ...up.slice(0, -1).reverse()]);
    assert.equal(result.firstCycle[0].string, result.firstCycle.at(-1).string);
    assert.equal(result.firstCycle[0].fret, result.firstCycle.at(-1).fret);
    assert.equal(result.nextCycleNote, 52); assert.equal(result.looping, true);
    assert.deepEqual(result.stopped, { running: false, added: 0, timer: null, timers: 0 });
    assert.ok(result.middle.every(p => p.fret >= 4 && p.fret <= 9));
    assert.ok(result.middle.some(p => p.text.includes('One-fret reach')));
    assert.deepEqual(result.guided, { midis: [50, 52, 54, 55, 57, 59, 61, 62], running: false });
    assert.deepEqual(result.exit, { running: false, added: 0, sources: 0 });
    await show('scales', 'scale-neck-3d');
  });
  await check('scale microphone feedback distinguishes correct, outside, unclear and held notes', async () => {
    const data = await evaluate(async () => {
      const s = appState.scalesStudio;
      const now = Date.now, audioTime = Object.getOwnPropertyDescriptor(appState.audioContext, 'currentTime');
      const mic = s.onMicStartRequested;
      let clock = now() + 10000;
      Date.now = () => clock;
      Object.defineProperty(appState.audioContext, 'currentTime', { configurable: true, get: () => clock / 1000 });
      const frame = (midi, freshness = 'fresh', signal = true, confidence = 90) => {
        clock += 40;
        const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        testMain.handleDetectionResult({
          mode: signal ? 'single-note' : 'idle', freshness, timestamp: clock,
          note: signal ? { pitch: { midi, note: names[midi % 12], octave: Math.floor(midi / 12) - 1, freq: 440 * 2 ** ((midi - 69) / 12), cents: 0 }, confidence, tunerVerdict: 'in-tune' } : undefined,
          chroma: new Float32Array(12), peaks: [], spectrum: new Float32Array(0), signalLevelDb: -20,
          performance: { id: 10, attackAt: clock, frameAt: clock, signalPresent: signal },
        }, new Float32Array(0));
      };
      const message = () => document.getElementById('scale-practice-message').textContent;
      try {
        s.setMicPracticeActive(false); s.setPracticeMode('free'); s.setRoot('A'); s.setScaleKey('pentatonic_minor'); s.setRegister('middle');
        s.onMicStartRequested = async () => false; await s.toggleMicPractice();
        const denied = message();
        s.onMicStartRequested = async () => true; await s.toggleMicPractice();
        testMain.setTargetMode('notes');
        testMain.setTuningPreset('drop_d');
        const modeAfterTuning = appState.detectionEngine.config.targetMode;
        testMain.setTuningPreset('standard');
        s.onDetectionResult({ isCalibrating: true });
        const calibration = message();
        for (let i = 0; i < 5; i++) frame(69, 'none', false);
        frame(69); const correct = message();
        const green = document.getElementById('scale-practice-feedback').dataset.verdict;
        frame(70); const wrong = message();
        const red = document.getElementById('scale-practice-feedback').dataset.verdict;
        frame(69, 'held'); const held = message();
        const liveAfterHeld = s.neck3d.state.scalePositions.filter(p => p.active).length;
        frame(69, 'fresh', true, 30); const unclear = message();
        frame(40); const unavailablePitch = message();
        s.setMicPracticeActive(false); frame(69);
        const stopped = message();
        return { denied, calibration, correct, wrong, held, unclear, green, red, liveAfterHeld, unavailablePitch, stopped, modeAfterTuning };
      } finally {
        s.onMicStartRequested = mic; Date.now = now;
        if (audioTime) Object.defineProperty(appState.audioContext, 'currentTime', audioTime); else delete appState.audioContext.currentTime;
      }
    });
    assert.match(data.denied, /unavailable/); assert.match(data.calibration, /Calibrating/);
    assert.match(data.correct, /Correct: A4/); assert.equal(data.green, 'correct');
    assert.match(data.wrong, /Outside this scale: A♯4/); assert.equal(data.red, 'wrong');
    assert.match(data.held, /not a new correct answer/); assert.equal(data.liveAfterHeld, 0);
    assert.match(data.unclear, /unclear/); assert.match(data.unavailablePitch, /no location/);
    assert.match(data.stopped, /off/);
    assert.equal(data.modeAfterTuning, 'notes');
  });
  await check('guided ascending/descending runs require exact new notes and never score reference sound', async () => {
    const data = await evaluate(async () => {
      const s = appState.scalesStudio;
      const now = Date.now, audioTime = Object.getOwnPropertyDescriptor(appState.audioContext, 'currentTime');
      let clock = now() + 10000, id = 0;
      Date.now = () => clock;
      Object.defineProperty(appState.audioContext, 'currentTime', { configurable: true, get: () => clock / 1000 });
      const frame = (midi, freshness = 'fresh', signal = true) => {
        clock += 40;
        s.onDetectionResult({
          mode: signal ? 'single-note' : 'idle', freshness, timestamp: clock,
          note: signal ? { pitch: { midi, note: 'A', octave: 3 }, confidence: 90 } : undefined,
          performance: { id, attackAt: clock, frameAt: clock, signalPresent: signal },
        });
      };
      const quiet = () => { for (let i = 0; i < 5; i++) frame(0, 'none', false); };
      try {
        s.setRoot('A'); s.setScaleKey('pentatonic_minor'); s.setRegister('middle'); s.setPracticeMode('ascending'); s.setMicPracticeActive(true);
        const up = s.practiceRun.map(p => p.midi);
        const targetCount = s.neck3d.state.scalePositions.filter(p => p.target).length;
        const first = s.practiceRun[0];
        quiet(); id++;
        frame(first.midi + 12); frame(first.midi + 12);
        const wrongOctave = s.practiceIndex;
        id++; frame(first.midi, 'held'); frame(first.midi, 'held');
        const held = s.practiceIndex;
        frame(first.midi); const partial = s.practiceIndex; frame(first.midi);
        const accepted = s.practiceIndex;
        const next = s.practiceRun[s.practiceIndex].midi;
        frame(next); frame(next); const noNewAttack = s.practiceIndex;
        for (let attempt = 0; attempt < 20 && s.practiceIndex < s.practiceRun.length; attempt++) {
          const wanted = s.practiceRun[s.practiceIndex].midi;
          id++; frame(wanted); frame(wanted);
        }
        const complete = document.getElementById('scale-practice-target').textContent;
        const noRemainingTarget = s.neck3d.state.scalePositions.every(p => !p.target);
        s.setPracticeMode('descending');
        const down = s.practiceRun.map(p => p.midi);
        quiet(); id++;
        const target = s.practiceRun[0];
        await s.pluckNote(target.stringIndex, target.fret);
        frame(target.midi); frame(target.midi);
        const selfScore = s.practiceIndex;
        const suppressed = document.getElementById('scale-practice-message').textContent;
        clock += 4000; quiet(); id++;
        frame(target.midi); frame(target.midi);
        const afterRearm = s.practiceIndex;
        s.setRegister('open');
        const reset = s.practiceIndex;
        const tuning = [...s.tuning];
        s.setTuning(tuning.map(string => ({ ...string, midi: 60 })));
        s.setRoot('C'); s.setScaleKey('major'); s.setRegister('upper');
        const unavailable = document.getElementById('scale-practice-target').textContent;
        s.setTuning(tuning);
        s.setRoot('A'); s.setScaleKey('pentatonic_minor'); s.setRegister('middle');
        s.setPracticeMode('ascending');
        window.switchTab('chords'); id++;
        frame(s.practiceRun[0].midi); frame(s.practiceRun[0].midi);
        const inactive = { index: s.practiceIndex, mic: s.isMicActive, sources: s.playbackSources.size };
        return { up, down, targetCount, wrongOctave, held, partial, accepted, noNewAttack, complete, noRemainingTarget, selfScore, suppressed, afterRearm, reset, unavailable, inactive };
      } finally {
        s.setMicPracticeActive(false); s.stopScaleAudioRun(); Date.now = now;
        if (audioTime) Object.defineProperty(appState.audioContext, 'currentTime', audioTime); else delete appState.audioContext.currentTime;
      }
    });
    assert.equal(data.targetCount, 1); assert.equal(data.wrongOctave, 0); assert.equal(data.held, 0);
    assert.equal(data.partial, 0); assert.equal(data.accepted, 1); assert.equal(data.noNewAttack, 1);
    assert.match(data.complete, /Complete: 6\/6/); assert.equal(data.noRemainingTarget, true);
    assert.deepEqual(data.down, [...data.up].reverse()); assert.equal(data.selfScore, 0);
    assert.match(data.suppressed, /checking is paused/); assert.equal(data.afterRearm, 1);
    assert.equal(data.reset, 0); assert.match(data.unavailable, /No complete/);
    assert.deepEqual(data.inactive, { index: 0, mic: false, sources: 0 });
  });

  await show('scales', 'scale-neck-3d');
  await evaluate(() => {
    appState.scalesStudio.setRoot('A'); appState.scalesStudio.setScaleKey('pentatonic_minor'); appState.scalesStudio.setRegister('middle'); appState.scalesStudio.setPracticeMode('ascending');
    document.getElementById('scale-practice-feedback').scrollIntoView({ block: 'start' });
  });
  await screenshot('scale-coach-desktop');
  await check('position and scale-coach controls are usable at 320px without cross-pane state leakage', async () => {
    await send('Emulation.setDeviceMetricsOverride', { width: 320, height: 760, deviceScaleFactor: 1, mobile: false });
    for (const [tab, target] of [['songs', 'song-position-filter'], ['scales', 'scale-practice-feedback']]) {
      await evaluate(`switchTab('${tab}'); document.getElementById('${target}').scrollIntoView({block:'center'});`);
      await evaluate(async () => {
        await document.fonts.ready;
        await Promise.allSettled(document.getAnimations().filter(a => a.effect.getComputedTiming().iterations !== Infinity).map(a => a.finished));
      });
      assert.equal(await evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
      await screenshot(`practice-${tab}-mobile`);
    }
    await evaluate(() => {
      appState.scalesStudio.setPracticeMode('free'); appState.songStudio.setPosition('all');
    });
    await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  });
}
