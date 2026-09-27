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
npm run test:theory
npm run test:percussion
npm run test:guitar
npm run preview
```

Microphone access requires HTTPS or localhost and browser permission. MIDI permission is requested only when opening MIDI settings under **More tools**. Microphone analysis happens locally; the app does not upload microphone audio.

## The live studio

- **Start listening** starts microphone capture and room calibration. Stay quiet briefly, then play. Choose **Chords**, **Notes**, or **Auto** to set the listening target.
- Try a chord without granting microphone access. Each section's 2D and 3D views share its voicing and the selected guitar sound source. Library and song selections stay independent of live detection.
- **3D**: drag to orbit, click a string/fret to select and pluck it, or click a selected position again to mute it. Use the camera buttons or `+`, `−`, and `R` while the canvas is focused to zoom/reset.
- **2D**: scroll horizontally through the neck. Each fret and string mute control is a native keyboard-accessible button.
- Amber markers are roots, cream markers are selected notes, and green markers show positions matching the detected pitch. A microphone cannot identify a unique string/fret from pitch alone: detected chords show a **suggested voicing**, and live notes show **possible positions**, not measured finger placement.
- View preference is saved locally. Reduced-motion users default to 2D on their first visit; WebGL or context failure also falls back to 2D.
- Sound settings and spectrum diagnostics are expandable. Additional practice tools and the working Audio recorder are in **More tools**. The unfinished transcriber, multi-track looper and video recorder are not advertised as available.

## Detection reliability

**Strum capture** collects resonance from **30 through 320 ms** and expires **after 350 ms**. Incomplete or rejected attempts expire through silence, noise and single-note gates, discard temporary samples/votes, and wait for another attack. A renewed strong attack restarts its own capture window. This capture window is unchanged; calibrated level handling and chord evidence have been improved as described below. The saved trigger identifier remains `guitartuna` for compatibility, but this is our detector, not a GuitarTuna integration.

Results distinguish **fresh**, **held** and **none**. A held note/chord retains its original evidence timestamp and last confidence, and is labeled **Last confirmed / held**. It can remain visible, but does not score practice or drills, emit MIDI, update session statistics, or paint a current live pitch/tuning verdict. Repeated genuinely supported frames and repeated strums still count as fresh; this is not chord-event deduplication. The existing five-second silence clearing behavior remains.

### Microphone and room check

The Live Studio **Microphone & room check** shows the actual input device, raw microphone RMS level, room reference and level above that reference. The raw analyser is before the app's sensitivity gain, so near-limit input can be distinguished from simply increasing software gain. Values are digital dBFS/level differences, not sound-pressure measurements, true signal-to-noise ratios, chord confidence or an accuracy score. Raw diagnostic frames are not recorded, persisted or uploaded.

On startup and **Recheck room noise**, calibration first discards one FFT window plus settling frames, then collects the existing 45 reference frames (about two seconds overall at the normal processing rate). This prevents an already-muted strum still in the analyser from becoming the room profile. Mute strings and remain quiet. Guitar/percussion previews are blocked during the check; current guitar references and backing percussion are stopped. Song Wait mode can remain armed without playing a reference.

Changing microphone sensitivity rescales the existing noise spectrum and RMS reference by the known gain change, then briefly ignores attack decisions while one analysis window settles. **Listening resumes automatically**; the previous mandatory-recheck block has been removed. If sensitivity changes during calibration, that measurement restarts automatically. A new input/analyser cannot reuse another input's profile.

Calibration uses temporal medians and a bounded peak estimate so a brief loud event does not dominate the entire room reference. Sustained talking or playing through most of the measurement can still spoil it; quiet calibration remains important. Suspect input produces an advisory recheck warning, not a permanent detection lock.

After calibration, the noise-gate margin is checked in individual frequency bins instead of against the loudest noise anywhere in the spectrum. The level floor follows measured noise RMS (with a small absolute floor), and quiet eligible input is normalized only inside analysis, with bounded gain. This does not change microphone monitoring, guitar playback volume or browser voice processing. Without a calibrated RMS reference, the conservative uncalibrated level floor remains.

Chord evidence now comes from an original sparse non-negative harmonic fit: observed note candidates explain their partials before energy is folded into pitch classes. A coherent single-note harmonic series, including weak low body resonances, is not treated as a multi-note chord. Each quality must have its own required tones; diminished chords no longer depend on a major third or perfect fifth being present. Within equivalent suspended/augmented pitch sets, observed bass guides the suggested naming, while alternatives remain visible. This cannot resolve all musical-context ambiguities.

Near-limit raw input suggests lowering the operating-system/interface input gain or moving the mic back; reducing app sensitivity cannot undo capture clipping. Weak input suggests moving the guitar closer and making a clear full strum, rather than amplifying the entire room. Prefer headphones, reduce nearby speech/music/fan noise where possible, and check for a voice-call headset or unwanted operating-system voice processing. A clean interface input is often preferable for electric guitar.

Current chord targets cover **major, minor, 7, maj7, m7, sus2, sus4, power, diminished and augmented**. The library contains additional chord types that the detector does not yet target. Stationary-noise estimation cannot reliably remove arbitrary speech or other music, and some chord names share pitch collections. No “world-best” or perfect-accuracy claim is made. Improving comparative accuracy requires labeled real-guitar recordings across guitars, microphones and noise conditions, measuring exact supported chord identity, silent/noise false positives, rejection rates and time to a correct result against the same competitor inputs.

`scripts/input-health-smoke.mjs` covers calibration settling, automatic gain recovery, robust profiles and input advice alongside the capture/freshness tests. `scripts/harmonic-detection-smoke.mjs` covers quiet chords, harmonic/body-resonance rejection and quality-specific evidence. The browser checks exercise raw input, level/headroom feedback, automatic sensitivity recovery, quiet-reference guards, microphone cleanup, preference migration and narrow layouts using generated microphone streams.

### Recorded-input comparison and external references

`scripts/detector-benchmark.mjs` compares against deployed commit `ae8a29f05a9821fa268b0c9eebe07b3a30f4b205`. It uses the browser's real offline audio graph (65 Hz high-pass, 2200 Hz low-pass, gain, 8192-point analyser) and default strum capture. Inputs are strums assembled from the authorized Musicca note recordings plus controlled noise—not human strum recordings or competitor measurements.

With Node.js 22+, Vite and an isolated Chromium debugging endpoint running:

```sh
node scripts/detector-benchmark.mjs http://127.0.0.1:5173/ 9223 results.json --full
node scripts/detector-benchmark.mjs http://127.0.0.1:5173/ 9223 additional-roots.json --holdout
node scripts/check-detector-benchmark.mjs results.json additional-roots.json
```

The second suite changes roots, strum direction/spacing, noise seeds and sample rate (48 kHz rather than 44.1 kHz), and adds calibration transients and non-chord bursts. It is an additional stress suite, not a claim of independent real-world validation. Results include exact first answers, wrong answers, no answers, negative-input false positives, latency, processing timing, and hashes of detector/fixture sources.

Measured before release on this controlled corpus:

| Suite | Deployed exact first answers | Updated exact first answers |
| --- | ---: | ---: |
| 44.1 kHz, 765 chord cases | 347 (45.4%) | 627 (82.0%) |
| Additional roots/strokes, 945 chord cases | 376 (39.8%) | 768 (81.3%) |
| Non-chord inputs, 72 cases | 1 false positive | 0 false positives |

Across chord cases, correct first answers increased from 723 to 1,395 and no-answer cases decreased from 771 to 28. Wrong first answers increased from 216 to 287 as coverage expanded; precision among answered cases nevertheless increased from 77.0% to 82.9%. Some individual clean voicings still regressed, so these results must not be presented as “better on every chord” or real-room accuracy. Median correct latency was about one 32 ms processing frame lower. A real recording collection across players/devices and an independent listening comparison are still needed.

Relevant primary sources:

- [Chord ai](https://www.chordai.net/) advertises on-device deep learning, microphone recognition and a broad chord vocabulary. Its model and training set are proprietary; its accuracy claims are not an independent ranking.
- [GuitarTuna's tuning guidance](https://guitartuna.com/online-guitar-tuner) emphasizes clean input and steady plucks. Tuning a single string is not the same task as unconstrained chord recognition.
- [NNLS Chroma / Chordino documentation](https://isophonics.net/nnls-chroma) describes harmonic note dictionaries, whitening and temporal chord smoothing. Chordino is explicitly described there as a simple, non-state-of-the-art transcription approach. We used the general harmonic-fit idea, not its source code or a downloaded model.
- [mir_eval chord evaluation](https://mir-eval.readthedocs.io/latest/api/chord.html) explains why chord vocabulary, root/quality conventions and no-chord handling must be specified for a meaningful comparison.

## Shared fretboards

**Live studio**, **Chord library**, **Play along**, **Scales** and **Theory lessons** use the same original Three.js neck, lighting, markers, stage and camera controls. In the library, **Show** selects a shape, **Strum** selects and plays it, and the voicing selector offers shapes within frets 0–12. Clicking frets edits a local custom voicing; **Inspect** still opens the chord in Live studio. Play Along mirrors palette previews, current playback chords and lead notes onto both views. Picks use the existing audio-unlock path.

Tuning/capo changes update each view's note labels and playback tuning. Shapes retain their fret positions relative to the capo; they are not promises of the named chord under every alternate tuning. Each section saves its view preference separately, defaults to 3D unless reduced motion is requested, and retains a keyboard-accessible 2D fallback.

**Scales** shows the selected scale, not a chord voicing. Both views share the root, scale type, fret-register filter and note/degree labels. Amber marks roots, cream marks scale tones, blue marks the blues scale's ♭5, and green marks a playing/live note. Click or keyboard-play any fret: its pluck highlights the exact string/fret, including an explicitly labeled out-of-scale note. Live practice highlights matching pitch-class positions within the selected register, even in degree-label mode; it does not infer finger placement.

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

Run it against the Vite dev server and an isolated Chrome/Edge profile started with `--remote-debugging-port=9223`; it resets test-origin preferences/service-worker caches and creates/closes its own test tab. Service-worker registration is disabled in this isolated UI test tab to prevent update-driven reloads; PWA update behavior is not covered. It checks downstream freshness handling, all five views, voicing independence, song updates, 320px layout, pointer/camera controls, offscreen and loading cleanup, WebGL failure fallback and reduced-motion defaults. `scripts/scales-browser-checks.mjs` adds 96 scale/root/register/label combinations, tuning/capo, exact plucks, keyboard playing, clock-controlled run/highlight races and generated mic feedback. `scripts/songs-browser-checks.mjs` checks actual Web Audio start/stop scheduling, the three timing modes, cancellation, per-performance scoring, Play Along import/editor roundtrips and mobile layouts. `scripts/two-octave-browser-checks.mjs` checks planned notes, recorded buffers and playback rates, shift cues in both directions, guided completion, unavailable starts, cancellation and narrow layouts. `scripts/lessons-browser-checks.mjs` checks formulas, complete voicings, actual audio buffers, cancellation, explicit handoffs and mobile lesson controls. Playback uses the authorized guitar samples; detection inputs are generated fixtures, not real-room microphone recordings. Optional `SCREENSHOT_DIR` saves inspection images.

## Theory lessons

Open **More tools → Theory lessons**. The recommended path is major and natural minor, pentatonics/blues, chord construction, then Circle of Fifths. Each lesson explains **how it is built**, **where it is useful**, and a short original idea to try. These are general musical examples, not copied song arrangements.

**Scales & modes** covers major/Ionian, natural minor/Aeolian, major/minor pentatonic, minor blues, harmonic minor, melodic minor and the remaining diatonic modes: Dorian, Phrygian, Lydian, Mixolydian and Locrian. All roots are available, with correctly spelled degrees and whole/half/three-semitone steps. **Melodic minor uses its fixed ascending form in both directions**, including in Scales practice; the lesson explains the classical natural-minor descending convention.

**Chord construction** covers all 27 qualities currently supported by the app: triads, power, suspended, added-tone, sixth, seventh, extended and altered chords. Compound degrees retain their names; Cdim7 spells its diminished seventh B♭♭, not A. The practical dominant-13 formula explicitly omits 11. This is the app's supported vocabulary, not a claim to contain every possible chord.

Select a formula tone to hear and highlight it, or **Hear construction** for a note-by-note reference with synchronized highlights. **Play shown shape** sounds the actual displayed chord voicing. The lessons reuse the original interactive 2D/3D renderer, camera controls, reduced-motion default, offscreen cleanup and WebGL fallback. Marked frets are keyboard-playable. Construction uses a concert reference octave; diagrams and shape playback use the effective tuning/capo and sounding note names.

Open/Middle/Upper chord diagrams use the existing complete-tone position solver, with strict fret bounds and conservative four-finger filtering. The lowest sounding tone and root-position/inversion status are shown. When no complete shape fits, the lesson says so instead of omitting a tone. Suggested positions are not a guarantee of physical comfort. Lessons recalculate shapes on tuning/capo changes; other sections retain their existing behavior.

**Practise this scale in Scales** transfers only root and scale type, keeping the existing range/position/mode choices. Choose Guided there for exact-pitch guitar checking or Free play for scale membership. **Explore this shape in Chord library** transfers the exact selected voicing without autoplay or microphone access; Library does not grade a performance. Exploring lessons alone does not modify these other tools, the detector, or Play Along.

Reference sound is blocked while microphone listening is active or starting; silent formula exploration still works. Stop/Escape, changing the lesson/root/position/tuning, navigation and hiding/leaving the page cancel owned audio and pending starts. These references do not score practice. No cloud lesson-progress tracking is introduced.

`src/theory/lessons.ts` joins educational copy to the shared formulas and verified positions; `src/ui/theoryLessons.ts` owns isolated lesson UI/audio state. `npm run test:theory` includes lesson formula/spelling, all supported qualities, tuning/capo positions and new-scale practice regressions alongside the Circle tests.

## Percussion

Open **More tools → Percussion**. One connected set of controls replaces the old duplicate Start/volume controls. **Percussion volume** controls only this output: 0% is mute, 100% is the new default, and up to 150% adds a boost. **Low drums** and **High drums & shaker** balance the two groups and affect sounding tails as well as later hits. Guitar volume, guitar tone, microphone gain and detector thresholds are unchanged.

**Pattern instruments** preserves each pattern's own sound choices. Select **Tabla**, **Congas**, **Bongos**, **Cajón** or **Drum kit** to reinterpret its strokes. Tabla has separate Bayan, Na, Tin and muted Ta voices; congas have low, open and slap sounds; bongos have low/high voices; the kit adds kick, snare and hi-hat. Shaker accompaniment remains a shaker except in Drum kit, where it becomes hi-hat. **Hear sound** previews the selected pattern's first pulse without starting a loop or microphone.

The fifteen existing patterns retain their pulse order, velocities and timing. Three new original practice grooves introduce congas, bongos and a drum kit. Each displayed pulse follows one tempo tick; changing instruments does not change the rhythm or claim an authentic traditional performance. The active pulse names the actual sounding instruments. Pattern changes restart the loop from its first pulse; instrument changes during a loop apply to the next pulse.

Sounds are original deterministic modal/noise synthesis, not borrowed recordings or samples. The new voices have fuller decays and a stronger output than the old short, heavily filtered tabla tone. A dedicated soft limiter bounds percussion peaks, including layered hits and boost; it is not a guarantee against clipping when combined with every other sound/device output. Start with a comfortable speaker/headphone volume. Small speakers can still reproduce low bass poorly.

Start waits for audio permission/resume. Stop/Escape, leaving Percussion, hiding/leaving the page, an interrupted audio context or cancelled pending starts release the percussion sources and timers. Source stops fade over 12 ms; level changes ramp over 15 ms to avoid clicks. No percussion microphone access is requested. Use headphones when the existing Live studio microphone is listening.

`src/audio/percussion.ts` owns the voices, bounded buffer cache and independent output bus; `src/ui/percussionPlayer.ts` owns the controls and playback lifecycle. `npm run test:percussion` covers valid patterns, mapping, deterministic voices, envelopes, limiter bounds and inputs. Browser coverage also renders the actual Web Audio graph to compare output level with the previous implementation, checks mute/boost/headroom and verifies controls, cancellation and narrow layouts. Synthetic checks do not replace listening on physical speakers or establish acoustic-instrument realism.

## Circle of Fifths

Open **More tools → Theory lessons → Circle of fifths & guitar practice** to explore key relationships without changing your active practice settings. Each circle position pairs a major key with its relative natural minor. **Major keys / Relative minor keys** selects which family the wheel explores; it does not switch to the parallel key. Arrow keys move around the wheel, Home selects C/A minor, and native controls remain usable with reduced motion.

The selected-key panel shows the key signature in conventional sharp/flat order, correctly spelled scale notes, relative and parallel keys, neighboring key pitch classes, and all seven diatonic triads. The F♯/G♭ selector changes the six-accidental spelling without changing pitches. At this crossover, some neighboring names are enharmonic; the wheel describes sounding pitch-class relationships.

Use **Hear scale**, **Hear a fifth**, chord **Hear** buttons and **Hear progression** to compare generic harmony examples. Natural-minor triads retain a minor v; the separate minor cadence explicitly raises the seventh to make a major V. For D minor, B♭ remains in the key signature while A major uses C♯ as an accidental. The expandable lessons explain fifths/fourths, relative versus parallel keys, signatures and cadences.

Reference audio uses the selected guitar sound at concert pitch, independently of current capo/tuning. It starts only on request and stops on Stop, key/mode/spelling changes, navigation or page exit. Pending audio starts are invalidated too. Stop global microphone listening before auditioning: reference sound is refused while listening is active. Reference examples are not scored and do not add song content.

### Guitar Practice in the circle

Expand **Practise the circle with your guitar**, choose **Tonic chords** or **Root notes**, and choose clockwise fifths or counterclockwise fourths. **Start guitar practice** requests the microphone only when needed. A round visits each of the 12 key positions once, from the selected major/relative-minor key. After the twelfth target it completes and the circle returns visually to its starting key.

Tonic chords must match the exact major/minor quality; root notes may be played in any detectable octave and need two fresh supported frames. The existing detector's new-attack metadata prevents repeated ringing or held frames from clearing later targets. Quiet release is required at the start/retry and after manual Skip. Targets are sounding keys, not capo shape names: a C shape with capo 2 sounds D, so it does not satisfy a C target. This does not verify fingering, strum direction or rhythmic accuracy.

Accepted targets mark the key, advance a moving cursor, and fill the visited-target ring. Skips are separately marked and never counted as correct. Progress reports visited/matched/skipped totals; a full ring is not a claim of perfect accuracy. Animation is short and cancelled on Stop/navigation; reduced-motion preference removes the motion while keeping feedback and progress. Compact Stop/Skip controls remain beside the wheel on small screens.

Stop, Escape, another key/family/spelling selection or leaving the page ends the round. A microphone started by the circle is stopped on exit/completion; a pre-existing Live studio microphone is kept running. The previous listening target is restored. Denial, calibration, unclear input and disconnection are shown explicitly, and cancelled permission requests cannot reactivate a stopped round. Reference-audio buttons are disabled while a round is starting/running so the app cannot play its target as the answer. Round results are session-local, not a cloud progress service.

**Open this key in Scales** explicitly applies only the selected root and major/natural-minor scale. Existing range, position and practice-mode choices remain; the normal Scales key-change behavior resets its progress. No setting is transferred just by exploring the circle.

`src/theory/circleOfFifths.ts` owns the key/triad/cadence model; `circlePractice.ts` owns round ordering and target construction. The tool reuses scale spelling and the existing performance gate. `npm run test:theory` checks signatures, equivalents, chord tones, both round directions and root-note versus exact-octave matching. `scripts/circle-browser-checks.mjs` checks Explore/reference behavior; `circle-practice-browser-checks.mjs` adds full rounds, held/wrong/ambiguous streams, owned/borrowed microphone cleanup, cancelled permissions, skips, mobile controls and reduced motion. Browser tests use silent generated streams and synthetic detector results, not measured real-room guitar accuracy.

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

`npm run test:practice` covers exact-pitch position mapping, chord tones/bass, unavailable positions, tuning/capo, one-octave guided runs and two-octave hand-shift plans across the supported roots/scales. `scripts/practice-browser-checks.mjs` verifies the corresponding controls, recorded pitch selection versus both necks, fresh/held/free/guided feedback, octave/order errors, reference-audio suppression, completion/restart and mobile layouts. As with the other checks, generated streams do not establish real-room microphone accuracy.

## Analyze Audio and recording permissions

In **More tools → Analyze Audio**, choose an **MP3 or WAV** recording, confirm that you hold the necessary rights or have permission to analyze it, then choose **Analyze on this device**. The confirmation starts unchecked and applies only to the selected file. Choosing another file (even with the same name) resets it. Before confirmation there is no audio preview, file-byte read or analysis in the app's workflow, and the analysis/save controls are disabled.

Withdrawing confirmation cancels the worker, invalidates pending work/results, releases the preview URL and disables draft saving. Browser decoding that has already started cannot always be interrupted, but its result is discarded; a byte-read that completes after withdrawal cannot start decoding. Confirmation is not saved to local storage and is not a license grant, permission to redistribute music, or a blanket liability waiver. Existing bundled Play Along content still needs appropriate rights review before commercial distribution.

The section supports up to **30 MB / 5 minutes** and rejects larger files rather than truncating them. After confirmation, browser-native decoding resamples the audio, then a cancellable Web Worker runs our own FFT and the app's existing chroma/chord-template helpers. No audio is uploaded and the analyzer needs no AI service, account or third-party model. Guitar playback recordings are described separately below.

The output uses **Suggested key** and **Estimated chords** headings. It is an **unverified draft**, not tablature or a licensed song arrangement. It includes estimated chord regions, silence, uncertain regions, template match scores (not accuracy percentages), and global major/minor key candidates. Relative keys can be ambiguous; modal music, key changes, vocals, dense mixes, unusual tunings and poor recordings can mislead this lightweight analyzer. An uncertain key stays unconfirmed in Play Along rather than being presented as C major.

### Suggested strumming pattern

The same permission-gated, on-device analysis can suggest a few common strumming patterns from repeated attack timing. The first release compares **4/4 eighth-note grids at 50–160 BPM**, with at least eight attacks spanning four seconds in a recording of at least six seconds. A clean 10–20 second guitar rhythm is a better input than a full band mix. Silence, sustained tones, too few attacks and irregular evidence return an explicit unavailable message rather than a fabricated pattern.

**Down/up directions are suggested practice motions, not detected hand movements.** The first beat, meter and half/double-tempo interpretation can be ambiguous, and drums may dominate the attacks. “Rhythm fit” is a template score, not an accuracy probability. Review the suggestion by listening. These suggestions do not automatically overwrite the draft's Reference BPM, chord timing or saved song metadata.

**Practise this pattern in Chord Changes** copies that pattern and its estimated BPM into the exercise controls. It does not start playback or request the microphone; choose the key/progression and review the settings first. The pattern library is also available manually even when analysis cannot suggest a rhythm.

Listen using the local recording control and correct region chord names directly. Enter `Rest` for silence or `?` for uncertainty. Saving remaining uncertain regions as rests requires explicit acknowledgement. **Reference BPM is selected by the user, not detected**: it maps seconds into the timing editor's beat units. Song timing preserves the draft's durations at that reference BPM. Unsupported region lengths/counts are reported rather than silently reshaped. The saved draft includes source filename, key candidates and uncertainty notes; the audio file itself is not persisted in the app catalog. Use **Clear recording** to release the preview, or reselect the file after reloading.

Analysis can be cancelled, and leaving the section cancels in-flight work and pauses reference playback. Confirmation for the same selected file can be used for retry during that visit; changing/clearing the file or reloading requires a fresh confirmation. Decode failures, oversized files and worker errors are reported without restoring stale results. Pure silence/noise does not create a playable song.

**YouTube reference** accepts standard HTTPS video, short, live and youtu.be links. It loads YouTube's official privacy-enhanced embed only after **Load reference**; it does not auto-play. This does contact YouTube, unlike local file analysis. Cross-origin player audio cannot be read by this app, so a YouTube link alone does **not** generate chords or a scale. There is no ripping/downloading service or automatic synchronization. Use a matching recording you are allowed to analyze, and open the video on YouTube if embedding is unavailable. Removing the video or leaving the section unloads its player.

## Recorded guitar

In **Live studio → Sound & detection settings → Recorded instrument**, choose a Musicca steel-string, classical or electric guitar. Recorded guitar is the only guitar playback source, with steel-string as the default. These banks contain 44 recordings each (132 files, 2,888,700 compressed bytes total), covering every semitone from D♯2 through F5 with a few string-specific duplicates. A recording is reused for other string positions at the same pitch; out-of-range pitches use the nearest recording with an exact playback-rate conversion, never octave wrapping. These are single-attack banks, not multiple velocity layers or round-robin takes.

The recordings are served from this app's own `public/audio/musicca-guitar` directory, not hotlinked to Musicca at runtime. They were downloaded for local development after the project owner explicitly reported permission and requested their use. **Musicca retains rights to the recordings.** `SOURCE.json` records the original URLs, sizes, SHA-256 hashes and the user-reported authorization; it is not a public license or independent verification of redistribution rights. Review applicable permission/attribution conditions before publishing or distributing this sample bank. No Musicca application code, unrelated sound banks, credentials or account data were copied.

Only the requested instrument is fetched and decoded on first guitar playback. Loading is coalesced, progress/errors are visible, and a partial or failed bank is never treated as ready. The cache retains at most two decoded banks with a 64 MiB limit per bank (these stereo banks use roughly 48–52 MiB each at 48 kHz). Output devices above 48 kHz use a 48 kHz sample decoder to avoid multiplying memory use. The browser resamples buffers for the output device. Native decode work can finish after cancellation, but cancelled interactions cannot start late audio.

Recorded plucks retain their recorded attacks and decay. They bypass the synthetic wood-resonance/EQ chain and use the shared level/compression output, with short click-safe attacks/releases and the existing strum ordering. Live Studio, Library, Scales, Play Along, Circle, Theory lessons and Ear Training all use the selected source. Loading completes before reference transports start. Stop, navigation, sound changes, tuning changes or Clear invalidate pending guitar requests; rapid instant-play requests during loading do not burst into a queued pile of notes. Ear Training now waits for audio readiness and owns/cancels its reference timers and sources.

The old guitar synthesizer, its wood-resonance processing and its selectable models have been removed. Existing saved synth preferences migrate to a valid recorded instrument without losing other settings. Missing recordings stay silent and show an error; **Load / retry recordings** retries without automatic playback. Percussion, metronome clicks and the optional MIDI monitor are separate features and are not removed. Automated pitch/routing/level checks do not establish subjective realism.

`node scripts/download-guitar-samples.mjs --authorized` retrieves only the explicitly listed guitar files and writes provenance; run it only with the necessary permission. `npm run test:guitar` verifies file integrity, mapping, cache behavior, load failures and exact pitch conversion. Browser playback checks compare the expected recorded buffers and playback rates across every guitar-playing section, including cancellation, explicit retry, output headroom and narrow controls. Set `BROWSER_SUITE=guitar` for the sample-focused cases or `BROWSER_SUITE=input` for microphone diagnostics.

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
