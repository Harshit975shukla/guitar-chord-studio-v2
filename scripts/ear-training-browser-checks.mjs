import assert from 'node:assert/strict';

/** Optional addition to the existing CDP browser harness; no microphone permission is requested. */
export async function checkEarTraining({ check, evaluate, send, screenshot }) {
  await check('returning to Ear Training restores usable reference controls without changing settings', async () => {
    const result = await evaluate(() => {
      switchTab('trainer');
      const before = document.getElementById('ear-tonic').value;
      switchTab('detector'); switchTab('trainer');
      return { before, after: document.getElementById('ear-tonic').value, disabled: document.getElementById('btn-play-cadence').disabled };
    });
    assert.equal(result.after, result.before); assert.equal(result.disabled, false);
  });
  await evaluate(() => {
    switchTab('trainer');
    window.earTest = {
      play: appState.trainerStudio.onPlayRequested,
      microphone: appState.trainerStudio.requestMicrophone,
    };
    window.earSelect = (id, value) => {
      const select = document.getElementById(id);
      select.value = value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    };
  });
  try {
    await check('ear training initializes once and exposes all roots, scales and three explicit activities', async () => {
      const result = await evaluate(() => {
        const studio = appState.trainerStudio;
        const original = document.getElementById('ear-type-chords');
        studio.init(); studio.init();
        document.getElementById('ear-type-scales').click();
        return {
          stable: original === document.getElementById('ear-type-chords'),
          roots: document.getElementById('ear-tonic').options.length,
          keys: document.getElementById('quiz-key-context').options.length,
          scales: document.getElementById('ear-scale').options.length,
          activities: [...document.querySelectorAll('[data-ear-activity]')].map(button => button.textContent),
          cadence: !!document.getElementById('btn-play-cadence'),
          status: !!document.getElementById('quiz-audio-status'),
        };
      });
      assert.equal(result.stable, true);
      assert.equal(result.roots, 12); assert.equal(result.keys, 24); assert.equal(result.scales, 12);
      assert.deepEqual(result.activities, ['Hear', 'Identify', 'Play-back with guitar']);
      assert.equal(result.cadence, true); assert.equal(result.status, true);
    });
    await check('Hear honors target selection; Identify hides solution pitches and positions until answered', async () => {
      const result = await evaluate(() => {
        document.getElementById('ear-activity-hear').click();
        earSelect('ear-tonic', 'D');
        earSelect('ear-scale', 'harmonic_minor');
        const selected = document.getElementById('quiz-target-chord-name').textContent;
        const run = [...document.querySelectorAll('#ear-playing-guide li')].map(item => item.textContent);
        document.getElementById('ear-activity-identify').click();
        const hidden = {
          name: document.getElementById('quiz-target-chord-name').textContent,
          guide: document.getElementById('ear-playing-guide').textContent,
          targetControl: document.getElementById('ear-scale-control').hidden,
          choices: document.querySelectorAll('.ear-choice').length,
          disabled: [...document.querySelectorAll('.ear-choice')].every(button => button.disabled),
        };
        const studio = appState.trainerStudio;
        studio.heard = true; studio.renderState();
        studio.handleChoice(studio.exercise.target.id);
        return { selected, run, hidden, revealed: document.getElementById('quiz-target-chord-name').textContent, answered: studio.answered };
      });
      assert.equal(result.selected, 'D Harmonic Minor');
      assert.equal(result.run.length, 8);
      assert.equal(result.hidden.name, 'Mystery scale');
      assert.equal(result.hidden.guide, '');
      assert.equal(result.hidden.targetControl, true); assert.equal(result.hidden.disabled, true);
      assert.equal(result.hidden.choices, 4); assert.equal(result.answered, true);
      assert.notEqual(result.revealed, 'Mystery scale');
    });
    await check('reference cancellation stops only owned sources and blocks late starts after navigation', async () => {
      const result = await evaluate(async () => {
        const studio = appState.trainerStudio;
        document.getElementById('ear-activity-hear').click();
        let resume, stopped = 0;
        studio.onPlayRequested = () => new Promise(resolve => { resume = resolve; });
        document.getElementById('btn-play-cadence').click();
        studio.sources.add({ stop() { stopped++; } });
        const pending = studio.audioPending;
        switchTab('detector');
        resume(); await Promise.resolve(); await Promise.resolve();
        const after = { sources: studio.sources.size, timers: studio.timers.size, pending: studio.audioPending, playing: studio.audioPlaying };
        switchTab('trainer');
        return { pending, stopped, after };
      });
      assert.equal(result.pending, true); assert.equal(result.stopped, 1);
      assert.deepEqual(result.after, { sources: 0, timers: 0, pending: false, playing: false });
    });
    await check('microphone requests are explicit, and calibration stopAudio does not invalidate their lease', async () => {
      const result = await evaluate(async () => {
        const studio = appState.trainerStudio;
        let requests = 0, released = 0, resolveLease, requestedTarget;
        studio.requestMicrophone = target => {
          requests++; requestedTarget = target;
          studio.stopAudio(); // The host stops references when room calibration begins.
          return new Promise(resolve => { resolveLease = resolve; });
        };
        document.getElementById('ear-type-notes').click();
        document.getElementById('ear-activity-play-back').click();
        earSelect('ear-tonic', 'D');
        const before = requests;
        const pending = studio.toggleMic();
        studio.stopAudio();
        const waiting = studio.practicePending;
        resolveLease({ release() { released++; } });
        await pending;
        const checking = studio.performance.checking;
        await studio.toggleMic();
        return { before, requests, requestedTarget, waiting, checking, released, stopped: !studio.performance.checking };
      });
      assert.equal(result.before, 0); assert.equal(result.requests, 1);
      assert.equal(result.requestedTarget, 'notes');
      assert.equal(result.waiting, true); assert.equal(result.checking, true);
      assert.equal(result.released, 1); assert.equal(result.stopped, true);
    });
    await check('late permissions release their lease after navigation, target changes and explicit cancellation', async () => {
      const result = await evaluate(async () => {
        const studio = appState.trainerStudio, outcomes = [];
        for (const action of ['navigation', 'target', 'cancel']) {
          switchTab('trainer');
          document.getElementById('ear-activity-play-back').click();
          let resolveLease, released = 0;
          studio.requestMicrophone = () => new Promise(resolve => { resolveLease = resolve; });
          const pending = studio.toggleMic();
          if (action === 'navigation') switchTab('detector');
          if (action === 'target') earSelect('ear-tonic', 'G');
          if (action === 'cancel') await studio.toggleMic();
          resolveLease({ release() { released++; } });
          await pending;
          outcomes.push({ action, released, checking: studio.performance.checking, lease: !!studio.lease });
        }
        switchTab('trainer');
        return outcomes;
      });
      for (const item of result) {
        assert.equal(item.released, 1, item.action);
        assert.equal(item.checking, false, item.action);
        assert.equal(item.lease, false, item.action);
      }
    });
    await check('reference auditions suspend grading; complete scales need every fresh pitch and release one lease', async () => {
      const result = await evaluate(async () => {
        const studio = appState.trainerStudio;
        document.getElementById('ear-type-scales').click();
        document.getElementById('ear-activity-play-back').click();
        earSelect('ear-scale', 'major');
        let released = 0, resolveReference;
        studio.requestMicrophone = async () => ({ release() { released++; } });
        studio.onPlayRequested = () => new Promise(resolve => { resolveReference = resolve; });
        await studio.toggleMic();
        studio.replayMysteryChord();
        const audition = { checking: studio.performance.checking, released, pending: studio.audioPending, micDisabled: document.getElementById('btn-quiz-mic').disabled };
        studio.stopAudio(); resolveReference(); await Promise.resolve(); await Promise.resolve();
        await studio.toggleMic();
        const before = studio.score;
        const start = performance.now() + 10;
        const quiet = frameAt => ({ mode: 'idle', freshness: 'none', performance: { id: 0, frameAt, signalPresent: false, attackAt: 0 } });
        studio.onDetectionResult(quiet(start));
        studio.onDetectionResult(quiet(start + 120));
        const pitches = studio.exercise.target.notes.map(note => note.midi);
        pitches.forEach((midi, index) => {
          const at = start + 200 + index * 100;
          const frame = { mode: 'single-note', freshness: 'fresh', note: { pitch: { midi }, confidence: 95 }, performance: { id: index + 1, frameAt: at, attackAt: at, signalPresent: true } };
          studio.onDetectionResult(frame);
          studio.onDetectionResult({ ...frame, performance: { ...frame.performance, frameAt: at + 32 } });
        });
        return { audition, before, after: studio.score, released, answered: studio.answered, checking: studio.performance.checking, feedback: document.getElementById('quiz-feedback-pill').textContent };
      });
      assert.deepEqual(result.audition, { checking: false, released: 1, pending: true, micDisabled: true });
      assert.ok(result.after > result.before);
      assert.equal(result.released, 2); assert.equal(result.answered, true); assert.equal(result.checking, false);
      assert.match(result.feedback, /complete root-to-octave sequence/);
    });
    await check('ear training stays inside desktop and narrow mobile viewports', async () => {
      for (const width of [1280, 390]) {
        await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 600 });
        await evaluate(() => { switchTab('trainer'); document.getElementById('pane-trainer').scrollIntoView({ block: 'start' }); });
        const result = await evaluate(() => ({
          width: innerWidth,
          outside: [...document.querySelectorAll('#pane-trainer button, #pane-trainer select, #pane-trainer .ear-exercise')].filter(element => {
            if (!element.getClientRects().length) return false;
            const bounds = element.getBoundingClientRect();
            return bounds.left < -1 || bounds.right > innerWidth + 1;
          }).map(element => element.id || element.className),
        }));
        assert.deepEqual(result.outside, [], `${width}px: ${JSON.stringify(result)}`);
        await screenshot?.(`ear-training-${width < 600 ? 'mobile' : 'desktop'}`);
      }
    });
  } finally {
    await evaluate(() => {
      const studio = appState.trainerStudio;
      studio.stopAudio(); studio.onMicrophoneStopped();
      studio.onPlayRequested = earTest.play;
      studio.requestMicrophone = earTest.microphone;
      document.getElementById('ear-activity-hear').click();
      delete window.earTest; delete window.earSelect;
    });
    await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  }
}
