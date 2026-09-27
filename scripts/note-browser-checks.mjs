import assert from 'node:assert/strict';

export async function checkNotes({ check, evaluate, send, until, show }) {
  await check('Tuner selects note detection and restores the previous chord target', async () => {
    const result = await evaluate(() => {
      testMain.setTargetMode('chords'); switchTab('tuner');
      const inside = appState.settings.targetMode;
      switchTab('detector');
      return { inside, after: appState.settings.targetMode, listening: appState.isListening };
    });
    assert.deepEqual(result, { inside: 'notes', after: 'chords', listening: false });
  });
  await show('detector', 'neck-3d');
  await check('fractional pitch keeps cents but rounds fretboard, Sargam and MIDI identity', async () => {
    const result = await evaluate(() => {
      const midi = appState.midiManager, enabled = appState.settings.midiConfig.sendSingleNotes;
      const sent = [];
      try {
        testMain.setTargetMode('notes');
        appState.settings.midiConfig.sendSingleNotes = true;
        appState.midiManager = { sendNoteOn: note => sent.push(note) };
        const note = { mode: 'single-note', freshness: 'fresh', timestamp: Date.now(),
          note: { pitch: { midi: 64.08, note: 'E', octave: 4, freq: 440 * 2 ** ((64.08 - 69) / 12), cents: 8 }, confidence: 95, tunerVerdict: 'sharp' },
          chroma: new Float32Array(12), peaks: [], ringingNotes: [], spectrum: new Float32Array(4096), signalLevelDb: -20 };
        testMain.handleDetectionResult(note, note.spectrum);
        const live = testScenes['neck-3d'].state.liveMidi, sargam = document.getElementById('info-sargam').textContent;
        testMain.handleDetectionResult({ ...note, freshness: 'held' }, note.spectrum);
        return { live, sargam, sent, held: testScenes['neck-3d'].state.liveMidi, verdict: document.getElementById('tuner-status-badge').textContent };
      } finally { appState.midiManager = midi; appState.settings.midiConfig.sendSingleNotes = enabled; testMain.setTargetMode('chords'); }
    });
    assert.equal(result.live, 64); assert.ok(result.sargam && result.sargam !== 'undefined');
    assert.deepEqual(result.sent, [64]); assert.equal(result.held, null); assert.match(result.verdict, /held/);
  });
  await check('tuner pegs play the selected string rather than the test chord', async () => {
    await evaluate(async () => {
      switchTab('tuner'); await appState.songStudio.onPlayRequested();
      window.noteSources = [];
      window.noteCreateSource = appState.audioContext.createBufferSource;
      appState.audioContext.createBufferSource = function() { const s = noteCreateSource.call(this); noteSources.push(s); return s; };
      document.getElementById('tuner-peg-0').click();
    });
    try {
      await until('noteSources.length > 0');
      assert.equal(await evaluate(() => noteSources.length), 1);
      assert.equal(await evaluate(() => matchesRecordedNote(noteSources[0], appState.effectiveTuning[0].midi, 0)), true);
    } finally {
      await evaluate(() => { appState.audioContext.createBufferSource = noteCreateSource; document.getElementById('guitar-stop-audio').click(); switchTab('detector'); });
    }
  });
}
