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
npm run test:practice
npm run test:strumming
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

Scale patterns and sounding string labels follow the effective tuning/capo. In **Free play**, **Play up/down loop** starts on the lowest root from which a complete scale fits, climbs to the highest reachable root, and mirrors the same fingerings back to its exact starting point. It repeats until **Stop scale**, without double-striking either turnaround note. For D major in standard tuning with Full neck selected, that is D3 → D5 → D3; Open uses D3 → D4 → D3. The loop never starts on an arbitrary non-root scale tone.

In either **Guided** mode, **Play scale once** plays the target sequence in the selected direction and stops: one octave by default, or two with the range option below. Notes release at their beat boundary so earlier notes do not keep sounding after the last note. Reference runs and guided targets prefer the selected area, with labeled one-fret reaches allowed for Middle/Upper. If a complete run cannot fit, choose another position. Leaving Scales or hiding the page stops all reference sources/timers. **Check my playing** requests the existing microphone and selects Notes mode; disabling checking leaves the shared microphone under Live studio's listening control.

Note spelling follows the written root and scale degree, not a universal sharp-only list. For example, **D natural minor is D–E–F–G–A–B♭–C–D**; D harmonic minor raises C to C♯. The same spelling is used in the note ribbon, 2D/3D markers, string labels, played-note captions, guided targets and microphone feedback. Sharp and flat root buttons are separate spellings of the same pitch where appropriate; choosing B♭ major does not display the theoretical A♯-major spelling.

### Scale listening practice

The **Playing position** selector is beside the Scales neck and listening controls: **Full neck (0–12)**, **Open (0–4)**, **Middle (5–8)** and **Upper (9–12)**. Middle/Upper are preferred hand areas: melodic runs/targets can reach one adjacent fret when needed, bounded by the rendered neck (Middle: 4 or 9; Upper: 8). The base scale pattern stays in the preferred area; a needed reference/target reach is shown and labeled when used. This selection updates both views, reference playback and guided practice.

Choose **Free play** to check individual notes against the selected scale, in any order. The visible feedback panel reports the heard pitch and **Correct / Outside this scale**, distinguishes held results from fresh evidence, and asks for a clearer pluck when confidence is insufficient. A note may belong to the scale but have no possible location in the selected register; that is reported separately. Free play does not certify that a complete scale was performed.

Choose **Guided: ascending / descending** for a root-to-root run in the selected range and effective tuning/capo. The next target shows its sounding pitch and suggested string/fret, outlined in blue in both views; adjacent reaches and hand shifts are explicitly labeled. Each step needs two fresh supported frames of the exact octave/pitch and a new post-target attack, using the same performance gate as Wait for me. Wrong pitches, held results and frames from the previous ringing note do not advance. The run stops at completion; **Restart run** starts it again. Changing the scale/root/register/range/tuning resets progress. If the complete range cannot fit, the UI asks you to choose another—no scale notes are silently transposed.

Start/retry and reference playback require a brief quiet release before checking resumes. The app's plucks and reference runs are not graded as your performance; checking pauses during that sound and rearms afterward. Use headphones. Mic denial, calibration, unclear pitch and a stopped microphone are visible in the same panel. Guided checks assess note order and pitch, not timing accuracy or actual finger placement. Detection thresholds and capture timing are unchanged.

### Two-octave hand-shift patterns

Set **Exercise range → Two octaves — shift as needed**. The position selector becomes **Starting position**: it chooses the hand area of the ascending root, not a permanent ceiling on the rest of the exercise. **Automatic start** chooses a feasible low start. The default **In selected area** keeps the previous bounded-position behavior.

The planner preserves the complete scale over exactly 24 semitones, prefers a stable hand area and core frets, and plans adjacent upward hand shifts when needed. A visible cue announces the current/next hand area and shifts; expand **Ascending fingering pattern** for the ordered note/string/fret list. Both fretboards display the planned positions, with an active reference note or guided target. Descending and up/down loops reverse those same fingerings and announce the return shifts.

For **D natural minor, Middle start**, the pattern runs **D3 (string 5, fret 5) → D5 (string 1, fret 10)**, shifting to Upper for the top root. On the way back, it shifts to Middle and passes **E4 on string 2, fret 5** before returning to its starting D3. The scale uses B♭ throughout. Free play loops the two-octave route up/down until Stop; Guided mode checks all 15 notes in the chosen direction and then completes.

Patterns stay within the existing 0–12 fret neck. Some high starting areas cannot contain two complete octaves; the UI reports this and asks for a lower start rather than dropping notes, inventing pitches or silently changing the octave. Tuning/capo changes recalculate the route. Physical comfort and actual hand placement remain the player's judgment; microphone checking verifies pitch, not which fingering was used.

## Rendering and validation

The original Three.js scene is in `src/ui/fretboard3d.ts`. It generates its own neck, binding, nut, fret wires, six strings, inlays and labels—no third-party models, textures or reference-site assets. Three.js is dynamically imported only for the 3D view. Rendering is event-driven (no continuous animation loop), pixel ratio is capped, hidden/offscreen views stop drawing, and switching to 2D releases the WebGL context and GPU resources.

`src/ui/studio.ts` recomposes the live controls; `src/ui/paneNeck3d.ts` shares lazy loading, visibility, cleanup and fallback behavior across sections. `src/ui/studio.css` supplies the responsive visual system. Leaving a tab or switching to 2D releases that scene; offscreen rendering pauses and returning restores the section's latest state.

`npm run test:detection` includes the original synthetic smoke checks plus deterministic clock-controlled capture/freshness regressions. No real-time sleeps or unseeded randomness are used. `scripts/browser-smoke.mjs` exercises the actual app via an already-running local Chromium debugging endpoint (no extra packages):

```sh
node scripts/browser-smoke.mjs http://127.0.0.1:5173/ 9223
```

Run it against the Vite dev server and an isolated Chrome/Edge profile started with `--remote-debugging-port=9223`; it resets test-origin preferences/service-worker caches and creates/closes its own test tab. It checks downstream freshness handling, all four views, voicing independence, song updates, 320px layout, pointer/camera controls, offscreen and loading cleanup, WebGL failure fallback and reduced-motion defaults. `scripts/scales-browser-checks.mjs` adds 64 scale/root/register/label combinations, tuning/capo, exact plucks, keyboard playing, clock-controlled run/highlight races and synthetic mic feedback. `scripts/songs-browser-checks.mjs` checks actual Web Audio start/stop scheduling, the three timing modes, cancellation, per-performance scoring, Finder/import/editor roundtrips and mobile layouts. `scripts/two-octave-browser-checks.mjs` checks planned notes, actual synthesized buffers, shift cues in both directions, guided completion, unavailable starts, cancellation and narrow layouts. These use original fixtures and synthetic detection inputs, never microphone recordings. Optional `SCREENSHOT_DIR` saves inspection images.

## Song timing and self-paced practice

**Playing position** chooses **Original / Auto (0–12)**, **Open (0–4)**, **Middle (5–8)** or **Upper (9–12)**. Melodies prefer the core area, then allow one adjacent fret for Middle/Upper when needed (Middle: 4 or 9; Upper: 8, staying within the 0–12 neck). Reaches are labeled in the target, neck caption and song summary. The exact fitted pitch is preserved—notes are never individually octave-wrapped. Chords keep complete chord-tone voicings inside the core range, honoring slash bass where available. Position labels/frets are relative to the capo.

Melodies **automatically fit the selected position** when the song, part, position, transpose or tuning/capo changes. The nearest single octave shift that fits **every melody note** is used, preserving the tune's intervals/key and all event durations. Any shift is labeled (for example, **Automatically fitted: Melody 1 octave lower**). It affects note playback, both necks, audition and Wait targets together—not chord events or direct fret clicks. **Restore original octave** opts out until **Use automatic melody fitting** or a new song/part/position/transpose/tuning choice. The adjustment is for playback during this visit; the saved/exported source chart remains unchanged. If no uniform shift fits, the app reports that rather than skipping or individually shifting notes.

For the bundled Happy Birthday melody, select the song and any playing position, then **Play** with a timed mode and Reference audio enabled. All 25 source notes are retained. Open and Upper fit the displayed one-octave-lower rendition without reaches; Middle uses two clearly labeled B3 reaches at string 3, fret 4. No extra fitting click is needed. Changing position restarts the chart from the beginning, and **Play again** after completion also starts at the first event—not the last note. Play Along's selector prefers an available melody; its Chords mode is still available where the chart contains chords. Existing catalog timing remains approximate. Wait for me intentionally has no automatic reference audio; “Start silent practice” makes disabled reference audio explicit in timed modes.

Both fretboards, audition audio and the practice target use the same selected fingering. Changing position cancels playback/pending starts and selects the first event. If a target cannot fit with the allowed octave shift and reach, the neck clears and a visible message asks for another position. Timed playback stops rather than silently skipping it; Wait mode allows manual Next without auto-grading an unavailable target. Position selection is kept when switching tabs/songs during the current visit. Pausing mid-song still resumes the selected event; a completed song replays from its beginning. Physical hand ergonomics still require player judgment.

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

Beats are quarter-note units, **1/64–128 per event**; BPM is 20–400 and up to 2,000 events are supported. `tempos` is optional and uses increasing, unique zero-based beat positions before the timeline ends. Changes can fall within events. There are no hidden playback-duration floors: accepted durations are integrated from beats/tempo. Source notes use strings 1–6 (1 is high E), with integer fret offsets 0–36 relative to the capo to preserve high source pitches. This does **not** extend the rendered neck beyond frets 0–12 or claim every source fingering is physically available. High pitches stay in the timeline with a warning and can use an explicit whole-melody octave fit; they are no longer discarded just because their source fret exceeds 12. Optional zero-based `line` associates an event with an imported chart line for seeking. Complex tab techniques and verified bass inversions are outside the detector's first-release grading scope.

## Play Along songs and imports

The former Song Finder interface and external chord-search links have been removed. **Analyze Audio** is now the dedicated recording-analysis section under **More tools**. The shared catalog, all bundled Play Along songs, custom imports and saved drafts remain available in Play Along's song selector; no song data or local storage was deleted by this change.

Play Along distinguishes simplified/imported charts, melody excerpts, and approximate versus explicitly authored timing. Explicit timing means supplied event data, not transcription accuracy verified against a recording. Unknown IDs show an error instead of opening a different song.

**Import your chart / timing JSON** accepts bracketed ChordPro-style chords, chord-only lines, chords above words, raw source-tab text, or the timing/export JSON above. Chord order and repetitions are retained across lines; `chordsUsed` is only an inventory, never an invented arrangement. Existing melody data uses per-line notes when supplied, otherwise its global lead-note list once. Chord sheets without authored timing use an explicitly approximate two beats per chord. ASCII tabs, bends/slides and other techniques are preserved as source text with an explicit limitation, not fabricated playable tabs; use the timing editor to author supported note events. `{title: ...}`, `{artist: ...}`, `{key: ...}`, `{source: ...}` and `{version: ...}` metadata are retained when supplied.

Custom song saving, searching and loading share the canonical `guitar_studio_custom_songs` store and read the legacy `guitar_custom_songs` store without deleting/migrating it. Conflicting versions receive distinct IDs rather than disappearing; a new save does not trim older imports. Malformed storage and save failures are surfaced instead of claiming success. No external scraping, AI title-to-chord guesses, online provider credentials or unlimited catalog coverage are implied.

`npm run test:songs` exercises pure timeline integration, transport boundaries/cancellation, performance rearming and matching, exact catalog IDs/metadata, non-destructive storage compatibility and import/export roundtrips with deterministic original fixtures.

`npm run test:practice` covers exact-pitch position mapping, chord tones/bass, unavailable positions, tuning/capo, one-octave guided runs and two-octave hand-shift plans across the supported roots/scales. `scripts/practice-browser-checks.mjs` verifies the corresponding controls, real synthesized pitch versus both necks, fresh/held/free/guided feedback, octave/order errors, reference-audio suppression, completion/restart and mobile layouts. As with the other checks, synthetic streams do not establish real-room microphone accuracy.

## Analyze Audio and recording permissions

In **More tools → Analyze Audio**, choose an **MP3 or WAV** recording, confirm that you hold the necessary rights or have permission to analyze it, then choose **Analyze on this device**. The confirmation starts unchecked and applies only to the selected file. Choosing another file (even with the same name) resets it. Before confirmation there is no audio preview, file-byte read or analysis in the app's workflow, and the analysis/save controls are disabled.

Withdrawing confirmation cancels the worker, invalidates pending work/results, releases the preview URL and disables draft saving. Browser decoding that has already started cannot always be interrupted, but its result is discarded; a byte-read that completes after withdrawal cannot start decoding. Confirmation is not saved to local storage and is not a license grant, permission to redistribute music, or a blanket liability waiver. Existing bundled Play Along content still needs appropriate rights review before commercial distribution.

The section supports up to **30 MB / 5 minutes** and rejects larger files rather than truncating them. After confirmation, browser-native decoding resamples the audio, then a cancellable Web Worker runs our own FFT and the app's existing chroma/chord-template helpers. No audio is uploaded, no AI service or account is required, and no new model, sample pack or third-party dependency is included.

The output uses **Suggested key** and **Estimated chords** headings. It is an **unverified draft**, not tablature or a licensed song arrangement. It includes estimated chord regions, silence, uncertain regions, template match scores (not accuracy percentages), and global major/minor key candidates. Relative keys can be ambiguous; modal music, key changes, vocals, dense mixes, unusual tunings and poor recordings can mislead this lightweight analyzer. An uncertain key stays unconfirmed in Play Along rather than being presented as C major.

### Suggested strumming pattern

The same permission-gated, on-device analysis can suggest a few common strumming patterns from repeated attack timing. The first release compares **4/4 eighth-note grids at 50–160 BPM**, with at least eight attacks spanning four seconds in a recording of at least six seconds. A clean 10–20 second guitar rhythm is a better input than a full band mix. Silence, sustained tones, too few attacks and irregular evidence return an explicit unavailable message rather than a fabricated pattern.

**Down/up directions are suggested practice motions, not detected hand movements.** The first beat, meter and half/double-tempo interpretation can be ambiguous, and drums may dominate the attacks. “Rhythm fit” is a template score, not an accuracy probability. Review the suggestion by listening. These suggestions do not automatically overwrite the draft's Reference BPM, chord timing or saved song metadata.

**Practise this pattern in Chord Changes** copies that pattern and its estimated BPM into the exercise controls. It does not start playback or request the microphone; choose the key/progression and review the settings first. The pattern library is also available manually even when analysis cannot suggest a rhythm.

Listen using the local recording control and correct region chord names directly. Enter `Rest` for silence or `?` for uncertainty. Saving remaining uncertain regions as rests requires explicit acknowledgement. **Reference BPM is selected by the user, not detected**: it maps seconds into the timing editor's beat units. Song timing preserves the draft's durations at that reference BPM. Unsupported region lengths/counts are reported rather than silently reshaped. The saved draft includes source filename, key candidates and uncertainty notes; the audio file itself is not persisted in the app catalog. Use **Clear recording** to release the preview, or reselect the file after reloading.

Analysis can be cancelled, and leaving the section cancels in-flight work and pauses reference playback. Confirmation for the same selected file can be used for retry during that visit; changing/clearing the file or reloading requires a fresh confirmation. Decode failures, oversized files and worker errors are reported without restoring stale results. Pure silence/noise does not create a playable song.

**YouTube reference** accepts standard HTTPS video, short, live and youtu.be links. It loads YouTube's official privacy-enhanced embed only after **Load reference**; it does not auto-play. This does contact YouTube, unlike local file analysis. Cross-origin player audio cannot be read by this app, so a YouTube link alone does **not** generate chords or a scale. There is no ripping/downloading service or automatic synchronization. Use a matching recording you are allowed to analyze, and open the video on YouTube if embedding is unavailable. Removing the video or leaving the section unloads its player.

## Original synthesized guitar sound

The guitar still uses our own physical-model synthesis, **not copied Musicca samples**. All note and strum paths now default to the selected acoustic-bus model; changing nylon/steel/twelve-string also updates the body response. Deterministic excitation, DC removal, click-safe buffer edges, loop-filter pitch compensation and gentler resonant filtering replace the noisier/inconsistent paths. An 8 MB per-context LRU buffer cache avoids regenerating repeated notes. Timed notes release within their event boundary, and twelve-string octave sources are included in cancellation.

These changes improve measurable consistency, tuning and release behavior; they do not establish equivalence to a professionally sampled acoustic guitar. Listening comparisons should use matched volume and the same notes/strums.

`npm run test:audio` checks synthesis repeatability, pitch, waveform bounds, offline chord/key suggestions, silence/noise rejection, draft timing and YouTube URL validation using original synthetic signals. `scripts/analysis-browser-checks.mjs` adds per-file confirmation and keyboard access, blocked preview/decoding before permission, withdrawal during pending reads, actual browser MP3 decoding, WAV-to-worker-to-draft flow, no-upload checks, cancellation/errors, retained Play Along songs, model/cache/release checks, safe reference embeds and 320px controls. YouTube media availability and real-song recognition accuracy remain dependent on the recording/device and are not established by synthetic checks.

## Strumming in Chord Changes

**More tools → Chord changes → Exercise** offers two modes:

- **Chord match** retains the self-paced microphone exercise: match the chord, then advance.
- **Rhythm pattern** follows the selected BPM, count-in and bars per chord. The eight-slot **1 & 2 & 3 & 4 &** grid highlights down/up/no-stroke instructions and previews the next chord. Each chord stays for its full bar allocation; a match does not advance the clock early.

Rhythm mode starts with chord checking and audible clicks off. Optional **Audible rhythm clicks** play the count-in beats and the pattern's attack rhythm, not a synthesized target chord. Use headphones. Optional **Check chord matches with microphone** requests microphone access and checks one fresh, exact root/quality performance per chord window, including the sounding capo transposition. Alternate candidates, held displays and pre-target attacks do not count as matches. Chord windows overlapping microphone calibration are not penalized as misses.

The score measures **chord matches only**, not strumming direction, accents or rhythmic accuracy. With checking off, the score is blank rather than a claimed success/failure. Stop, Next, tab/page exit, tuning/capo changes and cancelled starts invalidate pending timers/clicks. Next begins the next chord's bar; it does not leave the old pulse running. Microphone denial or disconnection is shown explicitly; users can retry or choose rhythm practice without checking. The existing chord-match mode's delayed advancement is also cancelled on Stop/Next.

`npm run test:strumming` validates deterministic attack inference, unavailable/irregular input handling and count-in/bar schedules. `scripts/strumming-browser-checks.mjs` covers permission-gated recording → suggestion → exercise, exact click scheduling, bar transitions, cancellation, chord-checking boundaries, microphone failure and mobile layout. Real-guitar strum-direction or rhythm-grading accuracy is not claimed.

Before publishing, build and run the existing detection smoke tests, then check:

1. At 320px, 390px, tablet and desktop widths, microphone controls remain easy to reach and each functional tool fits the viewport.
2. Presets, 2D fretting/muting and 3D picking update the same state. Orbit, zoom and reset respond.
3. Live notes/chords update the hero and neck; stopping capture releases the microphone; denied permission offers a retry.
4. Switching views, navigating away, reduced-motion preference and unavailable WebGL preserve a usable interface.

Browser validation can verify UI wiring with synthetic inputs; it does not establish real-room detection accuracy. That requires recordings or microphone sessions with representative guitars and noise conditions.
