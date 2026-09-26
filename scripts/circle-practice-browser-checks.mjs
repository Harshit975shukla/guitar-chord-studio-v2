import assert from 'node:assert/strict';

export async function checkCirclePractice({ check, evaluate, send, until, screenshot }) {
  await evaluate(async () => {
    await appState.songStudio.onPlayRequested();
    switchTab('fifths');
    document.getElementById('fifths-practice-panel').open = true;
    document.getElementById('fifths-major').click();
    document.getElementById('fifths-key-0').click();
    window.circleOriginalMedia = navigator.mediaDevices.getUserMedia;
    window.circleOriginalNow = Date.now;
    window.circleClock = circleOriginalNow() + 10000;
    window.circleAttackTimes = new Map();
    Date.now = () => circleClock;
    window.circleMicRequests = 0;
    window.circleMicMode = 'deny';
    window.circleMicReleases = [];
    window.circleDestinations = [];
    window.circleStreams = [];
    window.makeCircleStream = () => {
      const destination = appState.audioContext.createMediaStreamDestination();
      circleDestinations.push(destination); circleStreams.push(destination.stream);
      return destination.stream;
    };
    navigator.mediaDevices.getUserMedia = async () => {
      circleMicRequests++;
      if (circleMicMode === 'deny') throw new DOMException('Test microphone denial', 'NotAllowedError');
      if (circleMicMode === 'pending') return new Promise(resolve => circleMicReleases.push(() => resolve(makeCircleStream())));
      return makeCircleStream();
    };
    window.pauseCircleDsp = () => {
      if (appState.animationFrameId) cancelAnimationFrame(appState.animationFrameId);
      appState.animationFrameId = null;
    };
    window.feedCircle = ({ symbol, midi, id = 0, freshness = 'fresh', confidence = 90, signal = true, calibrating = false, calibrated = false }) => {
      circleClock += 40;
      if (!circleAttackTimes.has(id)) circleAttackTimes.set(id, circleClock);
      const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
      testMain.handleDetectionResult({
        mode: !signal ? 'idle' : symbol !== undefined ? 'chord' : 'single-note', freshness,
        isCalibrating: calibrating, calibrationComplete: calibrated, calibrationProgress: 50,
        timestamp: circleClock, chroma: new Float32Array(12), peaks: [], spectrum: new Float32Array(0), signalLevelDb: signal ? -20 : -120,
        chord: signal && symbol !== undefined ? { symbol, root: symbol.match(/^[A-G][#b]?/)[0],
          quality: symbol.endsWith('m') ? 'Minor' : symbol.includes('maj7') ? 'maj7' : 'Major', confidence, activeNotes: [], intervals: '', candidates: [{ symbol: 'C', confidence: 90 }] } : undefined,
        note: signal && midi !== undefined ? { pitch: { midi, note: names[midi % 12], octave: Math.floor(midi / 12) - 1,
          freq: 440 * 2 ** ((midi - 69) / 12), cents: 0 }, confidence, tunerVerdict: 'in-tune' } : undefined,
        performance: { id, attackAt: circleAttackTimes.get(id), frameAt: circleClock, signalPresent: signal },
      }, new Float32Array(0));
    };
    window.quietCircle = () => { for (let i = 0; i < 5; i++) feedCircle({ signal: false, freshness: 'none' }); };
  });
  try {
    await check('circle guitar practice requests the mic only on Start and handles denial visibly', async () => {
      assert.equal(await evaluate(() => circleMicRequests), 0);
      await evaluate(() => document.getElementById('fifths-practice-start').focus());
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', text: '\r', windowsVirtualKeyCode: 13 });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
      await until("document.getElementById('fifths-practice-message').textContent.includes('Microphone unavailable')");
      assert.equal(await evaluate(() => circleMicRequests), 1);
      assert.equal(await evaluate(() => appState.isListening), false);
      assert.equal(await evaluate(() => document.getElementById('fifths-practice-start').disabled), false);
    });

    await check('owned microphone chord round rejects held/wrong evidence and completes all twelve keys once', async () => {
      await evaluate(() => {
        testMain.setTargetMode('auto');
        circleMicMode = 'success';
        const goal = document.getElementById('fifths-practice-goal'); goal.value = 'chord'; goal.dispatchEvent(new Event('change'));
        const direction = document.getElementById('fifths-practice-direction'); direction.value = 'clockwise'; direction.dispatchEvent(new Event('change'));
        document.getElementById('fifths-key-0').click();
        document.getElementById('fifths-practice-start').click();
      });
      await until("document.getElementById('fifths-practice-panel').dataset.state === 'listening'");
      const data = await evaluate(() => {
        pauseCircleDsp();
        const modeDuring = appState.settings.targetMode;
        const referenceBlocked = document.getElementById('fifths-hear-scale').disabled;
        document.getElementById('fifths-key-0').click();
        const sameKeyKeepsRound = document.getElementById('fifths-practice-panel').dataset.state === 'listening';
        feedCircle({ signal: false, freshness: 'none', calibrating: true });
        const calibration = document.getElementById('fifths-practice-message').textContent;
        feedCircle({ signal: false, freshness: 'none', calibrated: true });
        quietCircle();
        feedCircle({ symbol: 'Cm', id: 1 });
        feedCircle({ symbol: 'Cmaj7', id: 2 });
        feedCircle({ symbol: 'C', id: 3, freshness: 'held' });
        const rejected = document.getElementById('fifths-practice-progress').textContent;
        feedCircle({ symbol: 'C', id: 4 });
        const first = document.getElementById('fifths-practice-target').textContent;
        const rotation = document.getElementById('fifths-practice-cursor').style.transform;
        feedCircle({ symbol: 'G', id: 4 });
        const duplicate = document.getElementById('fifths-practice-progress').textContent;
        const chords = ['G', 'D', 'A', 'E', 'B', 'F#', 'C#', 'G#', 'D#', 'A#', 'F'];
        chords.forEach((symbol, index) => feedCircle({ symbol, id: 5 + index }));
        return {
          modeDuring, referenceBlocked, sameKeyKeepsRound, calibration, rejected, first, rotation, duplicate,
          result: document.getElementById('fifths-practice-message').textContent,
          progress: document.getElementById('fifths-practice-progress').textContent,
          selected: document.getElementById('fifths-key-title').textContent,
          correct: document.querySelectorAll('#fifths-wheel [data-round-result="correct"]').length,
          mic: appState.isListening, restoredMode: appState.settings.targetMode,
          track: circleStreams.at(-1).getAudioTracks()[0].readyState,
          meter: document.getElementById('fifths-round-progress').getAttribute('stroke-dashoffset'),
        };
      });
      assert.equal(data.modeDuring, 'chords'); assert.equal(data.referenceBlocked, true); assert.equal(data.sameKeyKeepsRound, true); assert.match(data.calibration, /Calibrating/);
      assert.match(data.rejected, /^0\/12/); assert.match(data.first, /G major chord/); assert.equal(data.rotation, 'rotate(30deg)');
      assert.match(data.duplicate, /^1\/12/); assert.match(data.result, /12 matched, 0 skipped/); assert.equal(data.correct, 12);
      assert.equal(data.selected, 'C major'); assert.equal(data.mic, false); assert.equal(data.restoredMode, 'auto'); assert.equal(data.track, 'ended');
      assert.equal(Number(data.meter), 0);
    });

    await check('counterclockwise root-note round supports octaves, records skips honestly and preserves a borrowed mic', async () => {
      await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
      await evaluate(() => {
        appState.micStream = makeCircleStream(); appState.isListening = true;
        testMain.setTargetMode('auto');
        const goal = document.getElementById('fifths-practice-goal'); goal.value = 'root'; goal.dispatchEvent(new Event('change'));
        const direction = document.getElementById('fifths-practice-direction'); direction.value = 'counterclockwise'; direction.dispatchEvent(new Event('change'));
        circleAttackTimes.clear();
        window.borrowedRequestCount = circleMicRequests;
        document.getElementById('fifths-practice-start').click();
      });
      await until("document.getElementById('fifths-practice-panel').dataset.state === 'listening'");
      const data = await evaluate(() => {
        quietCircle();
        feedCircle({ midi: 60, id: 31, freshness: 'held' });
        feedCircle({ midi: 60, id: 32, confidence: 20 });
        feedCircle({ midi: 60, id: 33 });
        const oneFrame = document.getElementById('fifths-practice-progress').textContent;
        feedCircle({ midi: 48, id: 33 });
        const next = document.getElementById('fifths-practice-target').textContent;
        const animations = document.getElementById('fifths-key-0').getAnimations().length;
        const transition = getComputedStyle(document.getElementById('fifths-practice-cursor')).transitionDuration;
        const meterDirection = document.getElementById('fifths-round-progress').getAttribute('transform');
        feedCircle({ midi: 65, id: 33 }); feedCircle({ midi: 53, id: 33 });
        const sameAttack = document.getElementById('fifths-practice-progress').textContent;
        feedCircle({ midi: 65, id: 34 }); feedCircle({ midi: 53, id: 34 });
        for (let i = 0; i < 10; i++) document.getElementById('fifths-wheel-skip').click();
        return { oneFrame, next, sameAttack, animations, transition, meterDirection,
          progress: document.getElementById('fifths-practice-progress').textContent,
          message: document.getElementById('fifths-practice-message').textContent,
          requestsUnchanged: circleMicRequests === borrowedRequestCount,
          mic: appState.isListening, track: appState.micStream.getAudioTracks()[0].readyState, mode: appState.settings.targetMode };
      });
      assert.match(data.oneFrame, /^0\/12/); assert.match(data.next, /F root note/); assert.match(data.sameAttack, /^1\/12/);
      assert.equal(data.animations, 0); assert.equal(data.transition, '0s');
      assert.match(data.meterDirection, /scale\(1 -1\)/);
      assert.match(data.message, /2 matched, 10 skipped/); assert.match(data.progress, /^12\/12/);
      assert.equal(data.requestsUnchanged, true); assert.equal(data.mic, true); assert.equal(data.track, 'live'); assert.equal(data.mode, 'auto');
      await evaluate(() => testMain.stopMicrophone());
      await send('Emulation.setEmulatedMedia', { features: [] });
    });

    await check('pending, stopped, changed-key and disconnected rounds cannot reactivate themselves', async () => {
      for (const action of ['stop', 'key', 'leave']) {
        await evaluate(() => {
          switchTab('fifths');
          circleMicMode = 'pending';
          document.getElementById('fifths-practice-panel').open = true;
          document.getElementById('fifths-key-0').click();
          document.getElementById('fifths-practice-start').click();
        });
        await until('circleMicReleases.length > 0');
        await evaluate(`(() => {
          if ('${action}' === 'stop') document.getElementById('fifths-practice-stop').click();
          else if ('${action}' === 'key') document.getElementById('fifths-key-1').click();
          else switchTab('songs');
          circleMicReleases.shift()();
        })()`);
        await until('!appState.isListening && circleStreams.at(-1).getAudioTracks()[0].readyState === "ended"');
        assert.equal(await evaluate(() => document.getElementById('fifths-practice-stop').disabled), true);
      }
      await evaluate(() => {
        switchTab('fifths'); circleMicMode = 'success';
        document.getElementById('fifths-practice-start').click();
      });
      await until("document.getElementById('fifths-practice-panel').dataset.state === 'listening'");
      await evaluate(() => { pauseCircleDsp(); testMain.stopMicrophone(); });
      assert.match(await evaluate(() => document.getElementById('fifths-practice-message').textContent), /stopped or disconnected/);
      const before = await evaluate(() => document.getElementById('fifths-practice-progress').textContent);
      await evaluate(() => { quietCircle(); feedCircle({ midi: 60, id: 90 }); feedCircle({ midi: 60, id: 90 }); });
      assert.equal(await evaluate(() => document.getElementById('fifths-practice-progress').textContent), before);
    });

    await check('mobile practice keeps the circle, feedback and Stop accessible; Escape cancels', async () => {
      await send('Emulation.setDeviceMetricsOverride', { width: 320, height: 760, deviceScaleFactor: 1, mobile: false });
      await evaluate(() => {
        circleMicMode = 'success';
        document.getElementById('fifths-practice-start').click();
      });
      await until("document.getElementById('fifths-practice-panel').dataset.state === 'listening'");
      await evaluate(() => {
        pauseCircleDsp(); quietCircle();
        feedCircle({ midi: 60, id: 101 }); feedCircle({ midi: 60, id: 101 });
      });
      await evaluate(async () => {
        await document.fonts.ready;
        await Promise.allSettled(document.getAnimations().filter(a => a.effect.getComputedTiming().iterations !== Infinity).map(a => a.finished));
        document.getElementById('fifths-wheel').scrollIntoView({ block: 'center', behavior: 'instant' });
      });
      assert.equal(await evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
      assert.equal(await evaluate(() => document.getElementById('fifths-wheel-actions').hidden), false);
      assert.equal(await evaluate(() => document.getElementById('fifths-wheel-stop').disabled), false);
      await screenshot('circle-guitar-mobile');
      await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
      await evaluate(() => document.getElementById('fifths-wheel').scrollIntoView({ block: 'center' }));
      await screenshot('circle-guitar-desktop');
      await evaluate(() => document.getElementById('fifths-wheel-stop').focus());
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
      assert.equal(await evaluate(() => appState.isListening), false);
      assert.equal(await evaluate(() => document.getElementById('fifths-practice-start').disabled), false);
    });
  } finally {
    await evaluate(() => {
      document.getElementById('fifths-practice-stop').click();
      testMain.stopMicrophone();
      navigator.mediaDevices.getUserMedia = circleOriginalMedia; Date.now = circleOriginalNow;
      circleStreams.forEach(stream => stream.getTracks().forEach(track => track.stop()));
      circleDestinations.forEach(node => node.disconnect());
      document.getElementById('fifths-practice-panel').open = false;
      document.getElementById('fifths-major').click();
      document.getElementById('fifths-key-0').click();
      switchTab('detector');
    });
    await send('Emulation.setEmulatedMedia', { features: [] });
    await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  }
}
