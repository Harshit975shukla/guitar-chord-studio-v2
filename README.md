# Guitar Studio

A browser-based guitar practice studio: live chord and note recognition, an interactive neck, song practice, scales, ear training, tuning, rhythm and audio recording.

## Run locally

Requires a Node.js version supported by Vite 8 (20.19+ or 22.12+).

```sh
npm ci
npm run dev
```

Production checks:

```sh
npm run build
npm run test:detection
npm run test:songs
npm run test:audio
npm run preview
```

Microphone access requires HTTPS or localhost and browser permission. MIDI permission is requested only when opening MIDI settings under **More tools**. Microphone analysis happens locally; the app does not upload microphone audio.

## The live studio

- **Start listening** starts microphone capture and room calibration. Stay quiet briefly, then play. Choose **Chords**, **Notes**, or **Auto** to set the listening target.
- Try a chord without granting microphone access. Each section's 2D and 3D views share its voicing and the existing acoustic synthesizer. Library and song selections stay independent of live detection.
- **3D**: drag to orbit, click a string/fret to select and pluck it, or click a selected position again to mute it. Use the camera buttons or `+`, `−`, and `R` while the canvas is focused to zoom/reset.
- **2D**: scroll horizontally through the neck. Each fret and string mute control is a native keyboard-accessible button.
- Amber markers are roots, cream markers are selected notes, and green markers show positions matching the detected pitch. A microphone cannot identify a unique string/fret from pitch alone: detected chords show a **suggested voicing**, and live notes show **possible positions**, not measured finger placement.
- View preference is saved locally. Reduced-motion users default to 2D on their first visit; WebGL or context failure also falls back to 2D.
- Sound settings and spectrum diagnostics are expandable. Additional practice tools and the working Audio recorder are in **More tools**. The unfinished transcriber, multi-track looper and video recorder are not advertised as available.

## Detection reliability

Strum capture still collects resonance from **30 through 320 ms** and expires **after 350 ms**. Incomplete or rejected attempts now expire even through silence, noise and single-note gates, discard their temporary samples/votes, and wait for another attack. A renewed strong attack restarts its own capture window. Capture timing, sensitivity, chord thresholds and harmonic processing have not been retuned.

Results distinguish **fresh**, **held** and **none**. A held note/chord retains its original evidence timestamp and last confidence, and is labeled **Last confirmed / held**. It can remain visible, but does not score practice or drills, emit MIDI, update session statistics, or paint a current live pitch/tuning verdict. Repeated genuinely supported frames and repeated strums still count as fresh; this is not chord-event deduplication. The existing five-second silence clearing behavior remains.

## Shared fretboards

**Live studio**, **Chord library**, **Play along** and **Scales** use the same original Three.js neck, lighting, markers, stage and camera controls. In the library, **Show** selects a shape, **Strum** selects and plays it, and the voicing selector offers shapes within frets 0–12. Clicking frets edits a local custom voicing; **Inspect** still opens the chord in Live studio. Play Along mirrors palette previews, current playback chords and lead notes onto both views. Picks use the existing audio-unlock path.

Tuning/capo changes update each view's note labels and playback tuning. Shapes retain their fret positions relative to the capo; they are not promises of the named chord under every alternate tuning. Each section saves its view preference separately, defaults to 3D unless reduced motion is requested, and retains a keyboard-accessible 2D fallback.

**Scales** shows the selected scale, not a chord voicing. Both views share the root, scale type, fret-register filter and note/degree labels. Amber marks roots, cream marks scale tones, blue marks the blues scale's ♭5, and green marks a playing/live note. Click or keyboard-play any fret: a synthesized pluck highlights its exact string/fret, including an explicitly labeled out-of-scale note. Live practice highlights matching pitch-class positions within the selected register, even in degree-label mode; it does not infer finger placement.

Scale patterns and sounding string labels follow the effective tuning/capo. Scale runs keep the existing pitch-ordered, BPM-controlled loop and follow pattern/tuning changes. New notes replace old highlight timers, and leaving Scales or hiding the page stops the run and clears pending highlights. **Practice with Guitar** requests the existing microphone and selects Notes mode; disabling practice stops scale feedback but leaves the shared microphone under Live studio's listening control.

## Rendering and validation

The original Three.js scene is in `src/ui/fretboard3d.ts`. It generates its own neck, binding, nut, fret wires, six strings, inlays and labels—no third-party models, textures or reference-site assets. Three.js is dynamically imported only for the 3D view. Rendering is event-driven (no continuous animation loop), pixel ratio is capped, hidden/offscreen views stop drawing, and switching to 2D releases the WebGL context and GPU resources.

`src/ui/studio.ts` recomposes the live controls; `src/ui/paneNeck3d.ts` shares lazy loading, visibility, cleanup and fallback behavior across sections. `src/ui/studio.css` supplies the responsive visual system. Leaving a tab or switching to 2D releases that scene; offscreen rendering pauses and returning restores the section's latest state.

`npm run test:detection` includes the original synthetic smoke checks plus deterministic clock-controlled capture/freshness regressions. No real-time sleeps or unseeded randomness are used. `scripts/browser-smoke.mjs` exercises the actual app via an already-running local Chromium debugging endpoint (no extra packages):

```sh
node scripts/browser-smoke.mjs http://127.0.0.1:5173/ 9223
```

Run it against the Vite dev server and an isolated Chrome/Edge profile started with `--remote-debugging-port=9223`; it resets test-origin preferences and creates/closes its own test tab. It checks downstream freshness handling, all four views, voicing independence, song updates, 320px layout, pointer/camera controls, offscreen and loading cleanup, WebGL failure fallback and reduced-motion defaults. `scripts/scales-browser-checks.mjs` adds 64 scale/root/register/label combinations, tuning/capo, exact plucks, keyboard playing, clock-controlled run/highlight races and synthetic mic feedback. `scripts/songs-browser-checks.mjs` checks actual Web Audio start/stop scheduling, the three timing modes, cancellation, per-performance scoring, Finder/import/editor roundtrips and mobile layouts. These use original fixtures and synthetic detection inputs, never microphone recordings. Optional `SCREENSHOT_DIR` saves inspection images.

## Song timing and self-paced practice

Play Along offers three explicit timing modes:

- **Song timing** follows event durations, rests and authored BPM changes. Its practice-rate slider is an overall **25–200% speed** multiplier. The target shows the event's starting BPM; a tempo change inside an event is included in its duration.
- **Fixed tempo** uses the selected **20–400 BPM** throughout, ignoring authored BPM changes but preserving every event's beats/rests. Use it for steady rhythm practice.
- **Wait for me** does not play automatic target audio or advance on a clock. Start waiting, allow the mic, stay quiet briefly and play the target. Notes need two fresh matching frames at confidence 70 or above; chords need a fresh confirmed exact root/quality match. These are practice acceptance rules, not changes to detector sensitivity or capture timing. `C`, `Cm` and `Cmaj7` do not match each other. Notes are compared at sounding MIDI pitch, including transpose and capo. The neck labels chord shapes and their capo-shifted sound.

Each accepted target earns 10 points once. Repeated analysis frames and held displays do not count as another performance. A new target, including an identical repeated chord, requires a new detected attack after that target was shown. Start/retry/manual seek and auditions require at least 120 ms of below-gate signal before rearming. This uses the detector's existing onset/gate evidence; its 30–320 ms capture and >350 ms expiry are unchanged.

**Next** always offers manual progress in Wait mode, including rests, unsupported chord qualities/inversions and unavailable microphones. Rests wait for manual Next; the end stops unless **Loop chart** is checked. Previous/Next seek in timed modes pauses at the chosen event. Pause, restart, song/part/mode/rate/tuning changes and leaving the tab cancel pending transport starts and scheduled audio. Restart returns to the first event, paused.

Reference audio is available in timed modes; scoring is disabled while it is enabled to avoid grading the app's own sound. Disable it for timed mic practice. Wait mode only plays sound after an explicit **Audition target**, palette or fret click; audition playback suppresses grading and requires quiet/rearm afterward. Headphones are recommended. Mic denial/disconnection leaves the target in place with Retry/manual Next, never a silent switch to timed playback. Stopping practice feedback does not shut down the shared microphone; Live studio controls microphone capture.

The default **Two steps and a pause** exercise is an original demonstration with repeated chords, unequal durations, rests, notes and a tempo change. Existing catalog songs remain labeled **approximate**: this release does not invent or certify named-song arrangements. Accurate named-song timing still requires an authorized arrangement/timing chart or an authorized reference recording/version.

### Author, save and export timing

Choose **Edit / export timing** in Play Along. Edit the JSON and optional source/version fields; **Save timing** creates an imported copy of a built-in item or updates the selected imported item. **Export song JSON** preserves timing, metadata and source text for re-import. Invalid input is rejected visibly without saving.

```json
{
  "version": 1,
  "bpm": 80,
  "tempos": [{ "beat": 4, "bpm": 120 }],
  "events": [
    { "type": "chord", "chord": "C", "beats": 2 },
    { "type": "chord", "chord": "C", "beats": 0.5 },
    { "type": "rest", "beats": 0.5 },
    { "type": "note", "string": 1, "fret": 0, "beats": 1 },
    { "type": "note", "string": 1, "fret": 3, "beats": 2 }
  ]
}
```

Beats are quarter-note units, **1/64–128 per event**; BPM is 20–400 and up to 2,000 events are supported. `tempos` is optional and uses increasing, unique zero-based beat positions before the timeline ends. Changes can fall within events. There are no hidden playback-duration floors: accepted durations are integrated from beats/tempo. Notes use strings 1–6 (1 is high E), frets 0–12 relative to the capo. Optional zero-based `line` associates an event with an imported chart line for seeking. Exact transposed notes outside this playable range are reported, not octave-wrapped. Complex tab techniques and verified bass inversions are outside the detector's first-release grading scope.

## Song Finder and imports

Finder searches **chord charts** in the local bundled catalog and device imports, with title/artist matching, typo tolerance, Unicode queries, and all/imported chord filters. Note-only excerpts and source-only tabs remain accessible through Play Along, not chord-search results. Punctuation-only input does not match everything. Results distinguish simplified/imported charts and approximate versus explicitly authored timing. Explicit timing means supplied event data, not transcription accuracy verified against a recording. Opening a result loads its exact ID with the chord part preferred; an explicitly authored mixed-event document retains its arrangement. Unknown IDs show an error instead of opening a different song. A meaningful query also offers a user-clicked Google chord search, clearly labeled as external; pages are not fetched or copied into the catalog.

**Import your chart / timing JSON** accepts bracketed ChordPro-style chords, chord-only lines, chords above words, raw source-tab text, or the timing/export JSON above. Chord order and repetitions are retained across lines; `chordsUsed` is only an inventory, never an invented arrangement. Existing melody data uses per-line notes when supplied, otherwise its global lead-note list once. Chord sheets without authored timing use an explicitly approximate two beats per chord. ASCII tabs, bends/slides and other techniques are preserved as source text with an explicit limitation, not fabricated playable tabs; use the timing editor to author supported note events. `{title: ...}`, `{artist: ...}`, `{key: ...}`, `{source: ...}` and `{version: ...}` metadata are retained when supplied.

Custom song saving, searching and loading share the canonical `guitar_studio_custom_songs` store and read the legacy `guitar_custom_songs` store without deleting/migrating it. Conflicting versions receive distinct IDs rather than disappearing; a new save does not trim older imports. Malformed storage and save failures are surfaced instead of claiming success. No external scraping, AI title-to-chord guesses, online provider credentials or unlimited catalog coverage are implied.

`npm run test:songs` exercises pure timeline integration, transport boundaries/cancellation, performance rearming and matching, catalog ranking/IDs, non-destructive storage compatibility and import/export roundtrips with deterministic original fixtures.

## Local recording analysis and YouTube references

In **Song finder**, choose an **MP3 or WAV** recording and **Analyze on this device**. The first release supports up to **30 MB / 5 minutes** and rejects larger files rather than truncating them. Browser-native decoding resamples the audio, then a cancellable Web Worker runs our own FFT and the app's existing chroma/chord-template helpers. No audio is uploaded, no AI service or account is required, and no new model, sample pack or third-party dependency is included.

The output is an **unverified draft**, not tablature or a licensed song arrangement. It shows estimated chord regions, silence, uncertain regions, template match scores (not accuracy percentages), and global **major/minor key / parent-scale candidates**. Relative keys can be ambiguous; modal music, key changes, vocals, dense mixes, unusual tunings and poor recordings can mislead this lightweight analyzer. An uncertain key stays unconfirmed in Play Along rather than being presented as C major.

Listen using the local recording control and correct region chord names directly. Enter `Rest` for silence or `?` for uncertainty. Saving remaining uncertain regions as rests requires explicit acknowledgement. **Reference BPM is selected by the user, not detected**: it maps seconds into the timing editor's beat units. Song timing preserves the draft's durations at that reference BPM. Unsupported region lengths/counts are reported rather than silently reshaped. The saved draft includes source filename, key candidates and uncertainty notes; the audio file itself is not persisted in the app catalog. Use **Clear recording** to release the preview, or reselect the file after reloading.

Analysis can be cancelled, and leaving the section cancels in-flight work and pauses reference playback. Decode failures, oversized files and worker errors are reported without restoring stale results. Pure silence/noise does not create a playable song.

**YouTube reference** accepts standard HTTPS video, short, live and youtu.be links. It loads YouTube's official privacy-enhanced embed only after **Load reference**; it does not auto-play. This does contact YouTube, unlike local file analysis. Cross-origin player audio cannot be read by this app, so a YouTube link alone does **not** generate chords or a scale. There is no ripping/downloading service or automatic synchronization. Use a matching recording you are allowed to analyze, and open the video on YouTube if embedding is unavailable. Removing the video or leaving the section unloads its player.

## Original synthesized guitar sound

The guitar still uses our own physical-model synthesis, **not copied Musicca samples**. All note and strum paths now default to the selected acoustic-bus model; changing nylon/steel/twelve-string also updates the body response. Deterministic excitation, DC removal, click-safe buffer edges, loop-filter pitch compensation and gentler resonant filtering replace the noisier/inconsistent paths. An 8 MB per-context LRU buffer cache avoids regenerating repeated notes. Timed notes release within their event boundary, and twelve-string octave sources are included in cancellation.

These changes improve measurable consistency, tuning and release behavior; they do not establish equivalence to a professionally sampled acoustic guitar. Listening comparisons should use matched volume and the same notes/strums.

`npm run test:audio` checks synthesis repeatability, pitch, waveform bounds, offline chord/key suggestions, silence/noise rejection, draft timing and YouTube URL validation using original synthetic signals. `scripts/analysis-browser-checks.mjs` adds real browser MP3 decoding with original silent frames, WAV-to-worker-to-draft flow, no-upload checks, cancellation/errors, model/cache/release checks, safe reference embeds and 320px controls. YouTube media availability and real-song recognition accuracy remain dependent on the recording/device and are not established by synthetic checks.

Before publishing, build and run the existing detection smoke tests, then check:

1. At 320px, 390px, tablet and desktop widths, microphone controls remain easy to reach and each functional tool fits the viewport.
2. Presets, 2D fretting/muting and 3D picking update the same state. Orbit, zoom and reset respond.
3. Live notes/chords update the hero and neck; stopping capture releases the microphone; denied permission offers a retry.
4. Switching views, navigating away, reduced-motion preference and unavailable WebGL preserve a usable interface.

Browser validation can verify UI wiring with synthetic inputs; it does not establish real-room detection accuracy. That requires recordings or microphone sessions with representative guitars and noise conditions.
