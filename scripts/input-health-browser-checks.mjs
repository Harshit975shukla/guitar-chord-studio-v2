import assert from 'node:assert/strict';

export async function checkInputHealth({ check, evaluate, send, until, screenshot }) {
  await check('old synth preferences migrate to recorded guitar without losing other settings', async () => {
    const results = await evaluate(async () => {
      const storage = await import('/src/storage/index.ts');
      const saved = localStorage.getItem('guitar_studio_settings');
      try {
        const results = [];
        for (const bank of [undefined, 'electric']) {
          localStorage.setItem('guitar_studio_settings', JSON.stringify({ ...appState.settings, guitarSampleBank: bank, guitarSoundSource: 'synth', acousticModel: 'twelve', micGain: 2.5 }));
          const loaded = storage.loadSettings(), stored = JSON.parse(localStorage.getItem('guitar_studio_settings'));
          results.push({ bank: loaded.guitarSampleBank, gain: loaded.micGain, obsolete: 'guitarSoundSource' in stored || 'acousticModel' in stored });
        }
        localStorage.setItem('guitar_studio_settings', 'null');
        const nullBank = storage.loadSettings().guitarSampleBank;
        return { results, nullBank, oldControls: document.querySelectorAll('#guitar-sound-source, #guitar-synth-options, .sound-btn').length };
      } finally { if (saved === null) localStorage.removeItem('guitar_studio_settings'); else localStorage.setItem('guitar_studio_settings', saved); }
    });
    assert.deepEqual(results.results, [{ bank: 'steel', gain: 2.5, obsolete: false }, { bank: 'electric', gain: 2.5, obsolete: false }]);
    assert.equal(results.oldControls, 0);
    assert.equal(results.nullBank, 'steel');
  });
  await evaluate(async () => {
    switchTab('detector');
    window.inputOldGain = appState.settings.micGain;
    window.inputOldTarget = appState.settings.targetMode;
    window.inputOriginalGetUserMedia = navigator.mediaDevices.getUserMedia;
    const ctx = appState.audioContext;
    window.inputFixtureGain = ctx.createGain(); inputFixtureGain.gain.value = 0;
    window.inputFixtureOsc = ctx.createOscillator(); inputFixtureOsc.frequency.value = 220;
    const destination = ctx.createMediaStreamDestination();
    inputFixtureOsc.connect(inputFixtureGain); inputFixtureGain.connect(destination); inputFixtureOsc.start();
    navigator.mediaDevices.getUserMedia = async () => destination.stream;
    testMain.updateMicGain(4); testMain.setTargetMode('chords');
  });
  try {
    await check('live room check measures input before app gain and shows the selected microphone', async () => {
      assert.equal(await evaluate(() => testMain.startMicrophone()), true);
      await until("!!appState.detectionEngine.getNoiseProfile()?.calibrated && !appState.detectionEngine.isNoiseCalibrating()");
      const result = await evaluate(() => ({
        state: document.getElementById('input-check').dataset.state,
        device: document.getElementById('input-device').textContent,
        room: document.getElementById('input-room').textContent,
        enabled: !document.getElementById('btn-input-recheck').disabled,
      }));
      assert.equal(result.state, 'waiting'); assert.ok(result.device.length > 0 && result.device !== '—');
      assert.match(result.room, /dBFS/); assert.equal(result.enabled, true);
    });
    await check('live input feedback distinguishes near-limit capture from a weak signal', async () => {
      await evaluate(() => inputFixtureGain.gain.setValueAtTime(1.2, appState.audioContext.currentTime));
      await until("document.getElementById('input-check').dataset.state === 'headroom'");
      assert.match(await evaluate(() => document.getElementById('input-check-status').textContent), /device\/interface input gain/);
      await evaluate(() => inputFixtureGain.gain.setValueAtTime(.005, appState.audioContext.currentTime));
      await until("document.getElementById('input-check').dataset.state === 'signal'");
      await evaluate(() => inputFixtureGain.gain.setValueAtTime(.0002, appState.audioContext.currentTime));
      await until("document.getElementById('input-check').dataset.state === 'weak'");
      assert.match(await evaluate(() => document.getElementById('input-check-status').textContent), /below the detection gate/);
    });
    await check('sensitivity changes resume automatically and optional room checks remain protected', async () => {
      await evaluate(() => { testMain.updateMicGain(6); inputFixtureGain.gain.setValueAtTime(.05, appState.audioContext.currentTime); });
      await until("!appState.detectionEngine.isInputSettling()");
      assert.equal(await evaluate(() => appState.detectionEngine.needsNoiseCalibration()), false);
      assert.equal(await evaluate(() => appState.detectionEngine.getNoiseProfile()?.calibrated), true);
      await evaluate(() => {
        inputFixtureGain.gain.setValueAtTime(0, appState.audioContext.currentTime);
        document.getElementById('btn-input-recheck').click();
      });
      const blocked = await evaluate(() => testMain.playTestSound().then(() => '', error => error.message));
      assert.match(blocked, /room check is running/);
      await evaluate(() => { switchTab('rhythm'); document.getElementById('percussion-preview').click(); });
      await until("document.getElementById('percussion-status').textContent.includes('room check')");
      assert.equal(await evaluate(() => document.getElementById('rhythm-dock').dataset.state), 'idle');
      await evaluate(() => document.querySelector('.groove [data-groove-play]').click());
      await until("document.querySelector('.groove [data-groove-status]').textContent.includes('room check')");
      assert.equal(await evaluate(() => document.querySelector('.groove').dataset.state), 'idle');
      await evaluate(() => switchTab('detector'));
      await until("!!appState.detectionEngine.getNoiseProfile()?.calibrated && !appState.detectionEngine.isNoiseCalibrating()");
      assert.equal(await evaluate(() => appState.detectionEngine.getNoiseProfile().warning ?? null), null);
      assert.equal(await evaluate(() => appState.detectionEngine.needsNoiseCalibration()), false);
    });
    await evaluate(() => document.getElementById('input-check').scrollIntoView({ block: 'center' }));
    await screenshot('input-check-desktop');
    await check('input diagnostics fit narrow screens and stopping releases both microphone analysers', async () => {
      await send('Emulation.setDeviceMetricsOverride', { width: 320, height: 850, deviceScaleFactor: 1, mobile: false });
      await evaluate(() => { document.getElementById('input-check').scrollIntoView({ block: 'center' }); document.querySelector('#input-check details').open = true; });
      await screenshot('input-check-mobile');
      await evaluate(async () => {
        await document.fonts.ready;
        await Promise.allSettled(document.getAnimations().filter(animation => animation.effect.getComputedTiming().iterations !== Infinity).map(animation => animation.finished));
      });
      assert.equal(await evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
      await evaluate(() => testMain.stopMicrophone());
      const result = await evaluate(() => ({
        listening: appState.isListening, source: appState.micSource, raw: appState.inputAnalyser, analyser: appState.analyser,
        state: document.getElementById('input-check').dataset.state, disabled: document.getElementById('btn-input-recheck').disabled,
      }));
      assert.deepEqual(result, { listening: false, source: null, raw: null, analyser: null, state: 'off', disabled: true });
    });
  } finally {
    await evaluate(() => {
      testMain.stopMicrophone(); inputFixtureOsc.stop(); inputFixtureOsc.disconnect(); inputFixtureGain.disconnect();
      navigator.mediaDevices.getUserMedia = inputOriginalGetUserMedia;
      testMain.updateMicGain(inputOldGain); testMain.setTargetMode(inputOldTarget);
      document.querySelector('#input-check details').open = false;
    });
    await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  }
}
