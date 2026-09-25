import assert from 'node:assert/strict';

export async function checkAudioAnalysis({ check, evaluate, send, until, show, screenshot, requests }) {
  await check('original sound engine follows bus model, caches notes and releases without clipping', async () => {
    const results = await evaluate(async () => {
      const url = performance.getEntriesByType('resource').findLast(e => new URL(e.name).pathname === '/src/audio/engine.ts').name;
      const engine = await import(url);
      const tuning = appState.effectiveTuning;
      const results = [];
      for (const model of ['dreadnought', 'nylon', 'twelve']) {
        const ctx = new OfflineAudioContext(2, 44100, 44100);
        const bus = engine.createAcousticBus(ctx, { model, masterVolume: 1, strumStyle: 'down', sampleRate: 44100 });
        const a = engine.playAcousticString(ctx, bus, { freq: 220, stringIndex: 4, startTime: .8, velocity: .5 });
        const b = engine.playAcousticString(ctx, bus, { freq: 220, stringIndex: 4, startTime: .8, velocity: .5 });
        a.stop(0); b.stop(0);
        const sources = engine.strumChord(ctx, bus, { frets: [0, 1, 0, 2, 3, null], style: 'down',
          velocity: .85, tuning, startTime: .02, endTime: .5, humanize: false });
        const output = await ctx.startRendering();
        let peak = 0, tail = 0;
        for (const n of output.getChannelData(0)) peak = Math.max(peak, Math.abs(n));
        for (const n of output.getChannelData(0).slice(-1000)) tail = Math.max(tail, Math.abs(n));
        results.push({ model, cached: a.buffer === b.buffer, seconds: a.buffer.duration, voices: sources.length, peak, tail });
      }
      const ctx = new OfflineAudioContext(1, 44100, 44100);
      const bus = engine.createAcousticBus(ctx, { model: 'dreadnought', masterVolume: 1, strumStyle: 'down', sampleRate: 44100 });
      const old = bus.convolver.buffer;
      engine.updateAcousticBusSettings(bus, 'nylon');
      results.push({ changed: old !== bus.convolver.buffer, model: bus.model });
      return results;
    });
    for (const result of results.slice(0, 3)) {
      assert.equal(result.cached, true);
      assert.ok(Math.abs(result.seconds - (result.model === 'nylon' ? 3.2 : 2.8)) < .001);
      assert.equal(result.voices, result.model === 'twelve' ? 8 : 5);
      assert.ok(result.peak > .001 && result.peak < 1, `Output peak: ${result.peak}`);
      assert.ok(result.tail < .0001);
    }
    assert.deepEqual(results.at(-1), { changed: true, model: 'nylon' });
  });

  await evaluate(() => {
    window.chooseAnalysisFile = (kind = 'triad') => {
      let file;
      if (kind === 'bad') file = new File(['not audio'], 'Broken.mp3', { type: 'audio/mpeg' });
      else if (kind === 'large') file = new File([new Uint8Array(30 * 1024 * 1024 + 1)], 'Large.wav', { type: 'audio/wav' });
      else if (kind === 'mp3') {
        // Original silent MPEG-1 Layer III frames: zero main data, no copied recording.
        const bytes = new Uint8Array(417 * 50);
        for (let i = 0; i < 50; i++) bytes.set([0xff, 0xfb, 0x90, 0x00], i * 417);
        file = new File([bytes], 'Original silence.mp3', { type: 'audio/mpeg' });
      } else {
        const sr = 22050, length = sr * 3;
        const bytes = new ArrayBuffer(44 + length * 2), view = new DataView(bytes);
        const word = (offset, text) => [...text].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
        word(0, 'RIFF'); view.setUint32(4, 36 + length * 2, true); word(8, 'WAVE'); word(12, 'fmt ');
        view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
        view.setUint32(24, sr, true); view.setUint32(28, sr * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
        word(36, 'data'); view.setUint32(40, length * 2, true);
        for (let i = 0; i < length; i++) {
          let sample = 0;
          for (const f of [130.81, 164.81, 196]) sample += .08 * Math.sin(2 * Math.PI * f * i / sr);
          view.setInt16(44 + i * 2, Math.round(sample * 32767), true);
        }
        file = new File([bytes], 'Original C study.wav', { type: 'audio/wav' });
      }
      const transfer = new DataTransfer(); transfer.items.add(file);
      const input = document.getElementById('analysis-file'); input.files = transfer.files;
      input.dispatchEvent(new Event('change'));
    };
  });
  await check('local file analysis runs in a worker, produces editable chords and saves a truthful draft', async () => {
    const firstRequest = requests.length;
    await evaluate(() => { switchTab('search'); chooseAnalysisFile(); document.getElementById('analysis-start').click(); });
    await until("document.getElementById('analysis-status').textContent.includes('Draft ready')");
    const result = await evaluate(() => {
      const key = document.getElementById('analysis-key').textContent;
      const input = document.querySelector('#analysis-regions input');
      const chord = input.value;
      input.value = 'not-a-chord'; input.dispatchEvent(new Event('change'));
      const invalid = document.getElementById('analysis-save').disabled && input.getAttribute('aria-invalid') === 'true';
      input.value = 'C'; input.dispatchEvent(new Event('change'));
      document.getElementById('analysis-title').value = 'Original local analysis';
      document.getElementById('analysis-save').click();
      return { key, chord, invalid, activeTab: appState.activeTab, song: appState.songStudio.getSongForEditing().song,
        audioPaused: document.getElementById('analysis-audio').paused,
        transpose: document.getElementById('song-transpose-select').selectedOptions[0].textContent };
    });
    assert.match(result.key, /C major/); assert.equal(result.chord, 'C'); assert.equal(result.invalid, true);
    assert.equal(result.activeTab, 'songs'); assert.match(result.song.versionLabel, /unverified draft/);
    assert.deepEqual(result.song.timing.events.map(e => e.type), ['chord']);
    assert.ok(Math.abs(result.song.timing.events[0].beats - 6) < .001);
    assert.equal(result.audioPaused, true);
    if (result.song.key === 'Uncertain') assert.match(result.transpose, /key unconfirmed/);
    assert.equal(requests.slice(firstRequest).some(r => r.method === 'POST'), false, 'No audio upload');
  });
  await check('MP3 decoding is real, and silent input never becomes an invented song', async () => {
    await evaluate(() => { switchTab('search'); chooseAnalysisFile('mp3'); document.getElementById('analysis-start').click(); });
    await until("document.getElementById('analysis-status').textContent.includes('Draft ready')");
    const result = await evaluate(() => ({
      key: document.getElementById('analysis-key').textContent,
      chord: document.querySelector('#analysis-regions input').value,
      disabled: document.getElementById('analysis-save').disabled,
    }));
    assert.match(result.key, /No reliable/); assert.equal(result.chord, 'Rest'); assert.equal(result.disabled, true);
  });
  await check('cancel, new files, errors and tab exit cannot display stale analysis', async () => {
    await evaluate(() => {
      chooseAnalysisFile(); document.getElementById('analysis-start').click();
      document.getElementById('analysis-cancel').click();
    });
    await evaluate(() => new Promise(resolve => setTimeout(resolve, 250)));
    assert.equal(await evaluate(() => document.getElementById('analysis-results').hidden), true);
    assert.match(await evaluate(() => document.getElementById('analysis-status').textContent), /cancelled/i);
    await evaluate(() => { chooseAnalysisFile('bad'); document.getElementById('analysis-start').click(); });
    await until("document.getElementById('analysis-status').textContent.includes('Could not analyze')");
    assert.equal(await evaluate(() => document.getElementById('analysis-save').disabled), true);
    await evaluate(() => { chooseAnalysisFile('large'); document.getElementById('analysis-start').click(); });
    await until("document.getElementById('analysis-status').textContent.includes('30 MB')");
    await evaluate(() => { chooseAnalysisFile(); document.getElementById('analysis-start').click(); switchTab('detector'); });
    await evaluate(() => new Promise(resolve => setTimeout(resolve, 250)));
    assert.equal(await evaluate(() => document.getElementById('audio-analysis').getAttribute('aria-busy')), 'false');
    assert.equal(await evaluate(() => document.getElementById('analysis-results').hidden), true);
    await evaluate(() => {
      switchTab('search');
      window.dispatchEvent(new PageTransitionEvent('pagehide'));
      window.dispatchEvent(new PageTransitionEvent('pageshow'));
      document.getElementById('analysis-start').click();
    });
    await until("document.getElementById('analysis-status').textContent.includes('Draft ready')");
    await evaluate(() => document.getElementById('analysis-clear').click());
    assert.equal(await evaluate(() => document.getElementById('analysis-audio').getAttribute('src')), null);
  });
  await check('YouTube is an explicit official reference embed, never a URL audio analyzer', async () => {
    await send('Network.setBlockedURLs', { urls: ['*youtube-nocookie.com*'] });
    try {
      await evaluate(() => {
        document.getElementById('youtube-url').value = 'https://youtube.com.evil.test/watch?v=AbC_deF-123';
        document.getElementById('youtube-load').click();
      });
      assert.equal(await evaluate(() => document.querySelectorAll('#youtube-player iframe').length), 0);
      assert.match(await evaluate(() => document.getElementById('youtube-status').textContent), /valid HTTPS/);
      await evaluate(() => {
        document.getElementById('youtube-url').value = 'https://youtu.be/AbC_deF-123';
        document.getElementById('youtube-load').click();
      });
      const data = await evaluate(() => ({
        src: document.querySelector('#youtube-player iframe').src,
        text: document.getElementById('youtube-status').textContent,
        link: document.getElementById('youtube-external').href,
        saveDisabled: document.getElementById('analysis-save').disabled,
      }));
      assert.equal(data.src, 'https://www.youtube-nocookie.com/embed/AbC_deF-123');
      assert.match(data.text, /not downloaded or analyzed/); assert.equal(data.saveDisabled, true);
      assert.equal(data.link, 'https://www.youtube.com/watch?v=AbC_deF-123');
      await evaluate(() => switchTab('songs'));
      assert.equal(await evaluate(() => document.querySelectorAll('#youtube-player iframe').length), 0);
    } finally { await send('Network.setBlockedURLs', { urls: [] }); }
  });
  await check('audio-analysis and editable region controls fit 320px', async () => {
    await evaluate(() => { switchTab('search'); chooseAnalysisFile(); document.getElementById('analysis-start').click(); });
    await until("document.getElementById('analysis-status').textContent.includes('Draft ready')");
    await send('Emulation.setDeviceMetricsOverride', { width: 320, height: 760, deviceScaleFactor: 1, mobile: false });
    await evaluate(() => document.getElementById('analysis-results').scrollIntoView({ block: 'center' }));
    await evaluate(async () => {
      await document.fonts.ready;
      await Promise.allSettled(document.getAnimations().filter(a => a.effect.getComputedTiming().iterations !== Infinity).map(a => a.finished));
    });
    assert.equal(await evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
    assert.ok(await evaluate(() => document.querySelector('#analysis-regions input').getBoundingClientRect().width > 30));
    await screenshot('audio-analysis-mobile');
    await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
    await screenshot('audio-analysis-desktop');
    await evaluate(() => document.getElementById('analysis-clear').click());
    await show('songs', 'song-neck-3d');
  });
}
