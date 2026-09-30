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
npm run test:tab
npm run test:audio
npm run test:practice
npm run test:strumming
npm run test:theory
npm run test:percussion
npm run test:groove
npm run test:guitar
npm run test:library
npm run test:enhanced
npm run preview
```

Microphone access requires HTTPS or localhost and browser permission. MIDI permission is requested only when opening MIDI settings under **More tools**. Microphone analysis happens locally; the app does not upload microphone audio.

## The live studio

- **Start listening** starts microphone capture and room calibration. Stay quiet briefly, then play. Choose **Chords**, **Notes**, or **Auto** to set the listening target.
- **Enhanced detection** is an optional, experimental second check in Live studio. It is off on each new page visit; Standard detection remains the default and fallback. Matching answers appear once; different current answers appear as **Could be Am or Am7**, without engine jargon or a claimed certainty score.
- Try a chord without granting microphone access. Each section's 2D and 3D views share its voicing and the selected guitar sound source. Library and song selections stay independent of live detection.
- **3D**: drag to orbit, click a string/fret to select and pluck it, or click a selected position again to mute it. Use the camera buttons or `+`, `−`, and `R` while the canvas is focused to zoom/reset.
- **2D**: scroll horizontally through the neck. Each fret and string mute control is a native keyboard-accessible button.
- Amber markers are roots, cream markers are selected notes, and green markers show positions matching the detected pitch. A microphone cannot identify a unique string/fret from pitch alone: detected chords show a **suggested voicing**, and live notes show **possible positions**, not measured finger placement.
- View preference is saved locally. Reduced-motion users default to 2D on their first visit; WebGL or context failure also falls back to 2D.
- Sound settings and spectrum diagnostics are expandable. Additional practice tools and the working Audio recorder are in **More tools**. The unfinished transcriber, multi-track looper and video recorder are not advertised as available.

## Detection reliability

**Strum capture** collects resonance from **30 through 320 ms** and expires **after 350 ms**. Incomplete or rejected attempts expire through silence, noise and single-note gates, discard temporary samples/votes, and wait for another attack. A renewed strong attack restarts its own capture window. This capture window is unchanged; calibrated level handling and chord evidence have been improved as described below. The saved trigger identifier remains `guitartuna` for compatibility, but this is our detector, not a GuitarTuna integration.

**First-strum patience.** Most chords are confirmed after three analysis frames (about 0.1 s). A *new* power-chord or sus2/sus4 reading, or a 7th whose 7th is weak (below 0.75 of the triad average), instead waits until 190 ms after the attack, still inside the window above. On real recordings such early readings were sometimes a strum whose third had not sounded yet (C#m read as C#5, D as Dsus2) or a bright attack overtone that fades within ~0.1 s (Em read as Em7). While it waits, the reading is replaced by a same-root reading (C#5 → C#m), by a fuller reading that keeps all its notes, or by a new chord after a fresh attack; if the evidence only fades, the earlier reading is kept. A reading whose strum stops sounding like a chord before the deadline is not confirmed. Re-strumming the chord already shown, triads (major, minor, diminished, augmented) and clear 7ths keep the three-frame path. Waiting frames show the previous chord as held. Equivalent spellings of one pitch set (for example Dsus2/Asus4) keep their first bass-based name. Thresholds, sensitivity and the capture window are unchanged.

Results distinguish **fresh**, **held** and **none**. A held note/chord retains its original evidence timestamp and last confidence, and is labeled **Last confirmed / held**. It can remain visible, but does not score practice or drills, emit MIDI, update session statistics, or paint a current live pitch/tuning verdict. Repeated genuinely supported frames and repeated strums still count as fresh; this is not chord-event deduplication. The existing five-second silence clearing behavior remains.

**Seventh-note research, not enabled in the shipped default:** the retained candidate checks current note evidence alongside the strum average, using `src/detection/chordNoteEvidence.ts` for a bounded, per-engine 320 ms pitch/onset history. It investigates fading extra roots/sevenths, independent upstroke/downstroke plucks and unresolved neighboring fundamentals. It requires the explicit `experimentalNoteEvidence: true` engine configuration; only its dedicated research regressions opt in. The application, fast preview and Enhanced mode's Standard branch retain the deployed `74340ba` behavior, including the same timing, sensitivity and single-note estimator. The production release does not silently promote this candidate.

### Optional enhanced checking

Standard and Enhanced share the existing microphone and audio clock. The second path uses [Spotify Basic Pitch](https://github.com/spotify/basic-pitch-ts) 1.0.1 and TensorFlow.js/WASM 3.21.0 in an isolated browser worker, not a paid API. Its model predicts notes; conservative exact pitch-set matching supplies chord names. Matching requires current, time-aligned evidence, not two old labels left on screen. Repeated strums remain distinct. A separate **Matching recent audio** message describes historical overlap, never a new-strum confirmation. Quiet input, clipping, suspect room calibration and stale results cannot create agreement.

Model weights are unchanged. Incomplete/power outputs can use onset-backed note events to recover a missing third; this does not replace an already complete chord or invent a seventh from a power chord. Notes/tuner, MIDI, practice grading and statistics remain on the original fresh-evidence path; this option is a Live studio display second opinion only. Agreement is **not 100% certainty**. Playable library coverage is broader than detector coverage: fixing C6/Cm6 playback does not add those qualities to the live detector's vocabulary, and related pitch sets can still be confused.

The model needs about two seconds of audio context and processes only the latest window, without a queue. Results older than 1.5 seconds are suppressed. Slow devices, missing AudioWorklet/WASM support and model failures fall back to Standard with an explicit status and Retry control. Turning the option off, leaving Live studio, stopping listening or hiding the page releases its extra capture/worker resources. Stop also cancels a pending microphone permission request and releases a stream if permission arrives late.

`npm run dev` and `npm run build` stage pinned model, WASM, source hashes and Apache-2.0 notices under `public/ml/basic-pitch-1.0.1-tfjs-3.21.0/` from the installed packages. The generated folder is ignored by Git and copied into the build. The model/runtime are same-origin and downloaded only after opt-in and microphone start; no CDN inference or audio upload is used. The generated assets total about 2 MB, in addition to the lazy worker bundle.

### Consent-based local training takes

Open **Help improve detection · record a local take** in Live studio. The first recording targets are Am, Am7, C, Cmaj7, A and Amaj7. Choose the intended chord and guitar type, then separately consent to recording and local training review. Adult or appropriate parent/guardian consent is required. Microphone permission alone does not start or authorize a training take.

A take records up to 12 seconds of browser-provided mono input **before the app's filters and sensitivity gain**. Browser/device processing may still occur. Keep quiet for the first two seconds, then play a few slow strums without speech or personal information. App guitar references are stopped/blocked during capture. Stop finishes a sufficiently long take; Delete, permission withdrawal, leaving Live studio or changing tuning/settings discards unfinished capture. A microphone started solely for a take is released afterward; an already-running microphone is borrowed, not stopped. Preview requires listening to be off to prevent the recording becoming its own detection input.

**Export WAV + metadata (.zip)** is one deliberate download containing `microphone.wav` and `metadata.json`: actual sample rate/duration, audio SHA256, selected chord/instrument, effective sounding open-string MIDI tuning (including capo), capo, engine/app versions, detection target/trigger/sensitivity/gate/seventh settings, consent version, basic quality warnings and timestamped predictions. No device/user identifiers are collected. Labels are always **unverified**; neither the selected target nor detector agreement is ground truth.

The page retains only one in-memory take. Reload/Delete removes the page's copy, not previously exported files. An automatic website-update reload is deferred while a take is recording or retained; a notice asks you to export/delete and reload manually. There is **no automatic upload, background daily recording, automatic model training or backend collection**. A teacher should verify actual notes/chords first, obtain appropriate rights for the intended training use, and keep independent player/session/device evaluation data out of training.

`npm run test:enhanced` covers timing/identity agreement, bounded capture, held/stale evidence, consent, WAV/ZIP export, pinned asset integrity and comparison with the frozen Standard baseline. `node scripts/listening-tools-browser.mjs <app-url> <cdp-port>` runs integrated browser checks against dev or a subpath production preview. Optionally set `ML_C_FIXTURE` to an existing licensed isolated C recording; otherwise it assembles a C fixture from the bundled guitar recordings. These are integration/safety checks, not a measured real-room accuracy improvement.

### Dated restore point

Before this release, source `74340ba567ef82171f7caef7480b049726fcbeda` and the exact Pages build `683225883e002b9085975c248a40de63881fd529` were preserved as tags `restore-2026-09-30` and `restore-pages-2026-09-30`. The [30 September 2026 backup release](https://github.com/Harshit975shukla/guitar-chord-studio-v2/releases/tag/restore-2026-09-30) contains source and website ZIPs plus a SHA256 manifest. For an exact website rollback, verify the website ZIP against that manifest and publish its contents to `gh-pages` in a new commit; do not force-rewrite shared history. The backup does not contain or restore users' browser-local recordings/settings.

### Single notes and tuner

Notes use a recent-window normalized-periodicity estimate, corroborated by an observed fundamental and harmonic spectral support. Two consecutive supported estimates are required before a new note is confirmed. Uncertain input stays unconfirmed or holds the original evidence timestamp; the previous loudest-peak fallback that could fabricate a confident note has been removed. Frequency and cents remain continuous, while fretboard highlights, Sargam lookup and MIDI note numbers use the nearest integer pitch.

Entering Tuner selects Notes mode; leaving restores the previous target unless the user changed it. The note/tuner path covers 60–1400 Hz, including detuning around low C and upper-register guitar notes; the chord path retains its existing frequency bounds. `src/detection/notePitch.ts` owns this estimator. `scripts/note-pitch-smoke.mjs` checks sample rates, detuning, recent versus stale input and uncertain/held behavior. Add `--notes` to the browser benchmark to compare against deployed `bbb8fdbc228ee773b7f333a08bb7903181232a1d`; `--quick` bounds the corpus and `--holdout --quick` uses additional pitches at 48 kHz. These are recorded-note tests, not a claim of perfect human-room recognition.

### Microphone and room check

The Live Studio **Microphone & room check** shows the actual input device, raw microphone RMS level, room reference and level above that reference. The raw analyser is before the app's sensitivity gain, so near-limit input can be distinguished from simply increasing software gain. Values are digital dBFS/level differences, not sound-pressure measurements, true signal-to-noise ratios, chord confidence or an accuracy score. Raw diagnostic frames are not recorded, persisted or uploaded.

On startup and **Recheck room noise**, calibration first discards one FFT window plus settling frames, then collects the existing 45 reference frames (about two seconds overall at the normal processing rate). This prevents an already-muted strum still in the analyser from becoming the room profile. Mute strings and remain quiet. Guitar/percussion previews are blocked during the check; current guitar references and backing percussion are stopped. Song Wait mode can remain armed without playing a reference.

In Standard mode, changing microphone sensitivity rescales the existing noise spectrum and RMS reference by the known gain change, then briefly ignores attack decisions while one analysis window settles. **Listening resumes automatically**; the previous mandatory-recheck block has been removed. If sensitivity changes during calibration, that measurement restarts automatically. A new input/analyser cannot reuse another input's profile. With Enhanced enabled, configuration changes restart both room checks so their evidence stays aligned.

Calibration uses temporal medians and a bounded peak estimate so a brief loud event does not dominate the entire room reference. Sustained talking or playing through most of the measurement can still spoil it; quiet calibration remains important. Suspect input produces an advisory recheck warning, not a permanent detection lock.

After calibration, the noise-gate margin is checked in individual frequency bins instead of against the loudest noise anywhere in the spectrum. The level floor follows measured noise RMS (with a small absolute floor), and quiet eligible input is normalized only inside analysis, with bounded gain. This does not change microphone monitoring, guitar playback volume or browser voice processing. Without a calibrated RMS reference, the conservative uncalibrated level floor remains.

Chord evidence now comes from an original sparse non-negative harmonic fit: observed note candidates explain their partials before energy is folded into pitch classes. A coherent single-note harmonic series, including weak low body resonances, is not treated as a multi-note chord. Each quality must have its own required tones; diminished chords no longer depend on a major third or perfect fifth being present. Within equivalent suspended/augmented pitch sets, observed bass guides the suggested naming, while alternatives remain visible. This cannot resolve all musical-context ambiguities.

Near-limit raw input suggests lowering the operating-system/interface input gain or moving the mic back; reducing app sensitivity cannot undo capture clipping. Weak input suggests moving the guitar closer and making a clear full strum, rather than amplifying the entire room. Prefer headphones, reduce nearby speech/music/fan noise where possible, and check for a voice-call headset or unwanted operating-system voice processing. A clean interface input is often preferable for electric guitar.

Current chord targets cover **major, minor, 7, maj7, m7, sus2, sus4, power, diminished and augmented**. The library contains additional chord types that the detector does not yet target. Stationary-noise estimation cannot reliably remove arbitrary speech or other music, and some chord names share pitch collections. No “world-best” or perfect-accuracy claim is made. Improving comparative accuracy requires labeled real-guitar recordings across guitars, microphones and noise conditions, measuring exact supported chord identity, silent/noise false positives, rejection rates and time to a correct result against the same competitor inputs.

`scripts/input-health-smoke.mjs` covers calibration settling, automatic gain recovery, robust profiles and input advice alongside the capture/freshness tests. `scripts/harmonic-detection-smoke.mjs` covers quiet chords, harmonic/body-resonance rejection and quality-specific evidence. The browser checks exercise raw input, level/headroom feedback, automatic sensitivity recovery, quiet-reference guards, microphone cleanup, preference migration and narrow layouts using generated microphone streams.

### Recorded-input comparison and external references

For focused A/C triad-versus-seventh checks, run `node scripts/detector-benchmark.mjs http://127.0.0.1:5173/ 9223 focused-results.json --focus --baseline=74340ba` with the local Vite server and isolated Chromium endpoint running. This adds a +10 dB high shelf, a 250–4500 Hz speaker-bandwidth simulation, and +10-cent detuning to the existing clean, quiet, noise and gain-change cases. These are controlled transformations of recorded notes, not measurements of a physical phone or room. The snapshot loader freezes the baseline's helper modules as well as its engine, so working-tree changes cannot contaminate both sides of a comparison.

The September 29 follow-up reproduced C being labelled Cmaj7 under bright/speaker-filtered input and Am7 in some quieter/noisier cases. A blanket harmonic veto was rejected because it also removed genuine Fmaj7 notes. The retained, explicitly gated research candidate instead checks independent note onsets, current-versus-averaged evidence, unresolved neighboring fundamentals and recent root support. `scripts/seventh-chords-smoke.mjs` opts into that candidate and covers the Am/Am7 ambiguity, distinct Amaj7/Cmaj7 identities, all-key seventh identities, inversions, overlapping real notes, both strum directions, stale evidence and lifecycle cleanup. The historical candidate results below are not the shipped Standard configuration.

Add `--notes --quick --focus` to the browser benchmark for single-note checks including the same speaker-bandwidth simulation. Use `--full --cases=Fmaj7/,Dmaj7/` to repeat only those chord controls. These checks cannot certify physical phone playback: speaker frequency response, clipping, room reflections, microphone processing and accompanying instruments can change the result. Play one isolated chord/note, use moderate volume and calibrate while the phone is silent. A song mixed with vocals, bass and drums is not equivalent to an isolated guitar performance.

The onset-aware checks were compared with the deployed detector at `74340ba`, using identical inputs and an isolated snapshot of all baseline detector dependencies:

| Controlled recorded-note suite | Deployed exact first answers | Onset-aware exact first answers |
| --- | ---: | ---: |
| A/C triads and sevenths, including brightness and speaker-bandwidth stress | 204/210 | 208/210 |
| Ten chord qualities, 44.1 kHz | 634/765 | 636/765 |
| Additional roots, strokes and calibration stress, 48 kHz | 775/945 | 779/945 |
| Genuine Fmaj7/Dmaj7 controls within the main suite | 24/24 | 24/24 |

No previously correct first answer regressed in the main or focused suite. One additional-root case regressed (quiet classical F#m7 → A); five others improved. Across the two broad suites, wrong first answers fell from 273 to 267; no-answer counts stayed at 28 and negative-input false positives stayed at 0/72. Median correct latency stayed at 290 ms and 288 ms respectively. These are assembled recorded-note fixtures, not an overall real-room accuracy percentage.

Human-recording checks were also repeated locally: first-answer counts were unchanged on the original 25 Freesound clips (18/25), 40 additional clips (28/40), and five separately sourced seventh-chord clips (2/5, including processed/effects recordings). On the last group, one later Cmaj7 answer became Em; it is not a universal improvement. Exact fresh outputs against GuitarSet lead-sheet labels changed from 46.6% to 46.8% on 30 takes and from 44.3% to 44.6% on 30 additional takes. Performed voicings can differ from the lead sheet, so these figures are not interchangeable with isolated-chord correctness. Speaker-filtered versions of the original 25 clips retained 16/25 exact first answers. The audio/provenance and raw paired results stay in the git-ignored local recording corpus, not in the application bundle.

Remaining limitations include a detuned C fixture still reading Am7, an unconfirmed detuned Cm7 fixture, weak/partially muted roots, heavily processed instruments and mixed recordings. Recognition on a particular guitar/phone/microphone still needs a labeled recording from that setup. The checks reduce reproduced errors; they do not establish perfect recognition or a competitor ranking.

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

**First-strum patience, measured against the previous release (`7f503e2`).** The same suites were rerun with `--baseline=7f503e2` (baselines that import `notePitch.ts` now load). Exact first answers went from 627 to 634 of 765 and from 768 to 775 of 945. Wrong first answers went from 132 to 125 and from 155 to 148. No-answer cases and false positives were unchanged (0/18 and 0/54). One case regressed: a quiet G#7 with a weak 7th now reads G#. Median correct latency rose by one 32 ms frame, and new power/sus first strums wait about 0.1 s longer.

It was also checked offline, through the same filters, analyser and default capture, on public recordings that are not shipped with the app:

- [GuitarSet](https://zenodo.org/records/3371780) (Xi et al., ISMIR 2018, CC BY 4.0): room-mic takes with chord and note annotations; one studio room, six players, five styles.
- 65 single-chord clips from Freesound (CC0 / CC BY 3.0–4.0; labels come from their uploaders).

The rules were designed on 30 takes and 25 clips, then checked once on 30 other takes and 40 other clips:

| Recordings | Measure | `7f503e2` | Now |
| --- | --- | ---: | ---: |
| Clean single-chord clips used for design (16) | Exact first answer | 13 | 16 |
| Unseen single-chord clips (40) | Exact first answer · exact across all answers | 28 · 85.7% | 28 · 88.4% |
| GuitarSet comping, design takes (30) | Answers matching the lead-sheet chord exactly | 43.4% | 46.6% |
| GuitarSet comping, unseen takes (30) | Answers matching the lead-sheet chord exactly | 39.9% | 44.3% |

- **Unseen clips:** the first answer did not change on any of them. In most misses the first stroke really held only root and fifth, and both versions report that power chord.
- **Displayed root:** on the unseen takes the root shown on screen was correct slightly less of the time (54.4% → 52.8%). The display holds the last confirmed chord while a new power/sus reading waits.
- **Limits:** studio-room recordings and uploader labels do not establish accuracy on your guitar, microphone or room.

Relevant primary sources:

- [Chord ai](https://www.chordai.net/) advertises on-device deep learning, microphone recognition and a broad chord vocabulary. Its model and training set are proprietary; its accuracy claims are not an independent ranking.
- [GuitarTuna's tuning guidance](https://guitartuna.com/online-guitar-tuner) emphasizes clean input and steady plucks. Tuning a single string is not the same task as unconstrained chord recognition.
- [NNLS Chroma / Chordino documentation](https://isophonics.net/nnls-chroma) describes harmonic note dictionaries, whitening and temporal chord smoothing. Chordino is explicitly described there as a simple, non-state-of-the-art transcription approach. We used the general harmonic-fit idea, not its source code or a downloaded model.
- [mir_eval chord evaluation](https://mir-eval.readthedocs.io/latest/api/chord.html) explains why chord vocabulary, root/quality conventions and no-chord handling must be specified for a meaningful comparison.

## Shared fretboards

**Live studio**, **Chord library**, **Play along**, **Scales** and **Theory lessons** use the same original Three.js neck, lighting, markers, stage and camera controls. In the library, **Show** selects a shape, **Strum** selects and plays it, and the voicing selector offers shapes within frets 0–12. Clicking frets edits a local custom voicing; **Inspect** still opens the chord in Live studio. Play Along mirrors palette previews, current playback chords and lead notes onto both views. Picks use the existing audio-unlock path.

The library covers **12 roots × 19 chord qualities (228 entries)**, including sixths, minor sixths and ninths. Offered shapes are checked against the chord's complete pitch-class set and the sounding tuning/capo. Missing legacy shapes are generated using bounded hand-position search with open strings and partial barres; invalid old templates are not shown as if they were that chord. Valid familiar C/Am/G shapes remain first. C6 and Cm6 now have complete playable shapes, so their existing recorded-guitar samples can actually sound. A muted string (`×`) is intentionally silent, not a missing recording.

Root and quality filters cover the full catalogue. Changing tuning/capo regenerates a selected named chord; custom fretting remains a custom shape. Flat-note tuning presets use the correct pitch classes (including true half-step-down tuning). Cached definitions are copied before use so manual fretting cannot corrupt another card or preset. This fixes library playback and does not expand the detector's supported chord vocabulary.

`npm run test:library` checks every standard-tuning entry and every offered voicing, all 16 tuning presets with capo 0/2/5, expected chord tones, fret limits, sample availability in all three banks, cache isolation and enharmonic roots. `BROWSER_SUITE=library` adds actual audio scheduling for all 228 cards, non-silent C6/Cm6 rendering, filters and capo regeneration.

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

Open **More tools → Percussion**. The page has two tools: **Drum grooves** (full drum-kit and hand-percussion grooves to play along with) and **Pulse patterns** (the existing one-sound-per-pulse patterns). Starting either one stops the other.

### Drum grooves

Pick one of 26 original practice grooves in seven style groups: rock & pop (straight eighths, half-time, sixteenth-hat pop, punk, double-kick metal), ballads (cross-stick, 6/8, waltz), funk/soul/dance (ghost-note funk, four on the snare, four on the floor, swung boom bap), blues & jazz (shuffle, slow 12/8, swing ride), country & folk (train beat, two-step, stomp & clap), Latin & Caribbean (one drop, bossa nova, son clave & tumbao, 6/8 bell, dembow) and acoustic & fusion (cajón groove, Keherwa and Dadra drum-kit interpretations). Each groove shows its meter, suggested tempo range, a short description and a guitar tip. The Indian-fusion grooves are drum-kit interpretations of eight- and six-pulse cycles, not tabla performances.

- **Transport:** Start/Stop, count-in (none, 1 or 2 bars; short meters always get at least three clicks), tempo from 30–260 BPM with −/+ (Shift for 5), a slider or **Tap**. Tempo changes take effect on the next step without restarting.
- **Song sections:** **Fill** plays a fill on the next bar; **Verse/Chorus** switches after a transition fill, with a crash on the new section's downbeat. Automatic fills can play every 2, 4 or 8 bars.
- **Practice tools:** a speed trainer (+N BPM every N bars up to a target), silent bars (for example play 3, silent 1) to test your internal clock, chord prompts for common progressions in any key (1, 2 or 4 bars per chord, with the next chord lit on the last beat), swing for straight grooves and an optional human feel (small, repeatable timing and dynamics variation).
- **Mix:** drum volume (0–150%) plus kick, snare/claps, hi-hat/cymbals, toms and hand-percussion levels.
- **Display:** bar number, current beat, section/fill/silent-bar status and a step grid of every lane with the playhead and stroke strengths.

The default **Studio** kit pairs multi-velocity VCSL snare, closed/open/foot hi-hat, cross-stick and tom recordings (several dynamic layers with alternate takes) with the Musicca kick, floor tom, ride and crash. The six Musicca banks are also available. Claps, cowbell, claves, woodblock and agogô come from VCSL. Each groove loads only the recordings it uses. Changing the kit while a groove plays keeps the current kit until the new recordings are ready; only the latest choice is applied, and a kit that fails to load leaves the current one playing. Hits are scheduled against the audio clock about 140 ms ahead, so timing does not depend on UI timers; step times are anchored to the last tempo change, avoiding rounding drift over long sessions.

**Your own loop** plays an audio file from your device (WAV, MP3 and other formats your browser can decode, up to 60 seconds and 30 MB). Choose how many bars it holds and its time signature; the tempo comes from its length. If that gives a tempo outside 30–260 BPM, the loop does not start and the app asks for another bar count or time signature. The count-in, silent bars and chord prompts work with loops, and silent bars can be changed while it plays. Loop tempo is not time-stretched. The file stays in the browser tab: it is not uploaded, saved or shared. Use recordings you have the right to use.

No Soundsnap recordings are included. Soundsnap's license allows sounds inside a finished work but forbids making them available "on a standalone basis or in a manner that allows the Sound to be extracted"; committing their files to this public repository and serving them as separate static files would do exactly that. Loops downloaded with your own subscription can be used privately through **Your own loop**.

### Pulse patterns and sounds

**Percussion volume** controls only the pulse-pattern output: 0% is mute, 100% is the default, and up to 150% adds a boost. **Low drums** and **High drums & shaker** balance the two groups and affect sounding tails as well as later hits. Guitar volume, guitar tone, microphone gain and detector thresholds are unchanged.

The default is **Drums · Standard**, using Musicca recordings under the project owner's reported permission. Six drum banks offer kick, snare/cross-stick, closed/open/foot hi-hats, high/low/floor toms, ride and crash. Individual sound buttons audition each voice. Open hi-hats stop when a closed/foot hit arrives.

Recorded congas, bongos, cajón, shaker and tambourine come from the **Versilian Community Sample Library (CC0)**. The selected hand-drum articulations have soft/hard recordings and alternate takes; the Musicca drum banks do not claim additional velocity layers. Conga accents use a recorded high conga (quinto), not a falsely labeled tom or fabricated slap recording. **Tabla remains explicitly labeled legacy synthesized** because no recorded tabla source was verified for this release. “Pattern instruments” is consequently labeled mixed-source. It is not the default.

The 18 existing patterns keep their pulse order, velocities and timing: one displayed pulse per tempo tick. Instrument changes reinterpret strokes and do not claim an authentic performance of another tradition. Changing kits stops the previous output, loads the selected recordings and restarts a playing pattern from its beginning. Sound previews retain their recorded decay rather than a fixed 750 ms cutoff.

### Sources, safety and tests

The 135 selected files and hashes are listed in `public/audio/percussion/SOURCE.json`; the VCSL license is included as `VCSL-CC0.txt`. The downloader pins VCSL to its recorded commit and imports only these named samples, not any source application code. The 37 groove-trainer VCSL files are stored as mono 16-bit PCM, trimmed with a 60 ms fade, which SOURCE.json records per file. They keep their natural level differences between dynamic layers; playback calibrates each voice's loudest layer and only partly lifts softer layers, so ghost notes stay quieter than accents. Samples load on demand, with bounded decoded-bank caching that never evicts a kit that is still playing, per-layer round robin and explicit loading failures. A dedicated soft limiter bounds each percussion bus, not every possible mixture with other outputs. Start at a comfortable speaker/headphone volume.

Start waits for audio permission/resume and is refused during a room check. Stop/Escape, leaving Percussion, hiding/leaving the page, a room check, an interrupted audio context or cancelled pending starts release the percussion sources and timers. Source stops fade over 12 ms; level changes ramp over 15 ms to avoid clicks. No percussion microphone access is requested. Use headphones when the existing Live studio microphone is listening.

`src/audio/percussion.ts` owns mapping and the output bus; `percussionSamples.ts` and `percussionSampleData.ts` own the recordings; `drumGrooves.ts` holds the groove library, fills, chorus variations and chord prompts; `grooveSequencer.ts` is the clock-injected scheduler; `src/ui/grooveTrainer.ts` owns the Drum grooves UI. `npm run test:percussion` covers source-file integrity, mapping, retained legacy voices and level bounds. `npm run test:groove` checks every groove, count-in and step timing, swing, fills and crashes, section changes, silent bars, the speed trainer, human-feel bounds, loop tempo and chord spelling with a deterministic clock. Browser coverage (`BROWSER_SUITE=percussion` and `BROWSER_SUITE=groove`) checks recorded layers and levels, alternate takes, hi-hat choking, live scheduling, loop import, controls, cancellation and 320px layout. These checks do not replace listening on physical speakers.

## Ear Training

Open **More tools → Ear Training**. **Chords / Notes / Scales** selects the exercise family; all 12 tonics and the 12 shared scale patterns are available. Chord context supports every major/minor key rather than only C, G, D and Am.

**Hear** uses the selected target. **Identify** draws a hidden question from the selected set and reveals the formula/positions only after the answer. **Play back** checks a guitar performance using the existing fresh-evidence gate. A tonic reference makes note/scale listening relational rather than a demand for perfect pitch. Complete scale playback is root-to-root in the sounding tuning/capo, never invented outside the available range.

Microphone checking starts explicitly, owns only the stream it started, and preserves an existing borrowed microphone on release. Held/ringing frames, wrong octaves, low-confidence input and calibration cannot advance targets. References and microphone grading are separated; stop global listening to hear an audition if it was borrowed from Live Studio. Leaving the tool cancels its sources, timers, pending starts and practice lease. `npm run test:ear` exercises all keys, targets and scoring rules.

## Record & jam

The single **Record & jam** panel lives on Live Studio. Record a chord progression or melody in Recorder, then choose **Use as backing loop** beside the current take or a saved take. Trim the start/end, set backing volume, choose the part you will play, and Start. The saved recording is not modified.

This first version is **one backing clip**, not multi-layer overdubbing or automatic chord transcription. Clips are limited to two minutes/8 MB before decoding and 48 MiB decoded audio. The selected range becomes a sample-count-preserving PCM loop, with short edge fades to avoid a discontinuity; this is not automatic beat alignment or time stretching.

If microphone listening is on, headphone confirmation is required before loop playback. Start listening and finish the room check first, then Start the loop. The chosen Notes/Chords target applies only when listening is active; improvised parts are not automatically scored. A room check, navigation away, page hiding, Clear or Stop ends backing playback. Changing profiles clears the backing selection. `npm run test:jam` covers range and buffer invariants.

## Optional fast follow preview

**Fast follow preview** is off by default. It is an isolated, tentative display in Live Studio: a separate shorter-spectrum note hint and continuous chord preview. It never feeds confirmed display state, practice scoring, MIDI or statistics. The existing detector implementations and fretboard models are unchanged.

The preview is deliberately selective and can still miss very short events. In one controlled sequence of six recorded 125 ms notes, it displayed two target notes within their windows versus none from the stable path, without changing any stable results or introducing a wrong hint in that check. This is limited prototype evidence, not a general fast-transcription accuracy claim. Keep stable confirmation authoritative.

## Optional Guitar Lab

One collapsed **Guitar Lab** entry appears on the Live Studio start page only. Opening it shows the app's own 3D steel-string acoustic (18 components), classical (15) or solid-body electric (18) guitar, which you can take apart and put back together.

- **Disassembly** is a slider from assembled to fully apart, with **Assemble** and **Disassemble** buttons. Groups come off in reverse build order (strings first, then tuners, nut, bridge…), each along the direction it is fitted, and the rim or solid body stays as the anchor. While the camera is following, it swings wider and pulls back so the separated layers stay visible; dragging or zooming hands the camera to you until **Reset view**. Name tags label each group once the parts are apart.
- **Components** lists every part by group (body, neck, headstock, electronics, bridge, strings). Choosing a part, or clicking it on the model, isolates it: the other parts fade and it glows gold. The panel shows its material or specification and explains what it does and why it matters. Clicking it again, clicking empty space, **Show all parts** or Escape shows everything. Pointing at the model shows the part's name and specification; pointing at a list row highlights that part.
- **Specification** lists representative scale length, woods, frets, nut width and strings. Each instrument keeps its own disassembly and selection while you switch.
- **View** offers three-quarter, front, back & sides, side profile, headstock and bridge close-ups; a close-up steps back out when the parts start to move. Camera buttons rotate and zoom, and **Turntable** spins the guitar.

The 3D guitars are the app's original procedural models. Their geometry and materials are unchanged, except that the strap pins now sit on the outside of the body (the classical, which usually has none, no longer shows them); each piece is now tagged with the component it belongs to so it can be isolated and separated. The disassemble-by-slider interaction and the style of the component notes follow the project owner's Atelier viewer; the notes were rewritten and extended for these three instruments (for example fan bracing, the tie-block bridge and roller tuners on the classical, and neck and bridge pickups on the electric). The 3D scene draws frames only while something moves, pauses when closed, hidden, off screen or on another tab, and releases every geometry, material and WebGL context on close.

This is an educational model, not a repair guide: soundboards, braces, bridges and many neck joints are glued, so separating them is a cutaway. It does not replace any fretboard in the app. The **2D diagram** follows the same disassembly and isolation; reduced motion starts in 2D, and in 3D it jumps straight to each state and disables the turntable. If 3D is unavailable or the graphics context is lost, the diagram keeps working with the same selection and disassembly. **Hear instrument** plays a recorded guitar on a private bus without changing the app's sound or tuning, and is cancelled by Stop, closing, switching instrument or leaving the tab.

`npm run test:lab` checks every part's specification and explanation, instrument-specific anatomy, the build order and staggered disassembly timeline, state validation, outlines and fret spacing, that every listed part exists in the 3D geometry, and render-on-demand integration. Browser coverage (`BROWSER_SUITE=lab`) checks the 2D and 3D views, isolation by list and by clicking the model, animated disassembly that then stops drawing, name tags that never cover each other, per-instrument state, hover, camera views and controls, the context-loss fallback, audio cancellation, reduced motion, a 320px layout, keyboard use and cleanup.

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

### Tab and what comes next

Under the Play Along fretboard, **Tab · what comes next** shows the chart as six-line tab (string 1 at the top) scrolling past a fixed playhead. Each note sits on its string with its fret number; chords show their name above the voicing's fret numbers; rests are marked; a line under each fret number shows how long it lasts. Past events dim, the current event is gold, and the next note or chord to play is outlined in blue with **NEXT** and, during timed playback, a countdown in beats. The tab uses the same transposition, capo, playing position, melody fit and chord voicings as the fretboards, so it never shows a fingering the necks would not. Dashed lines mark lyric-line changes; the tab does not draw bar lines because charts do not store a time signature.

During **Song timing** and **Fixed tempo** the playhead follows the audio clock, using the times each event was actually scheduled, so speed changes, authored tempo changes and loops stay in step with the sound. In **Wait for me** it moves one event at a time. Reduced motion also steps instead of scrolling, and drawing pauses while Play Along is hidden or off screen. A line above the tab reads the current event and the next one (skipping rests and counting their beats).

The next note or chord is also marked on both fretboards as a dashed blue ghost, so you can see where your hand goes next. Positions already in use by the current event are not repeated, and a repeated chord shows no ghost. **Show the next note on the fretboard** turns the ghosts off without changing the tab. Chord-palette previews never show ghosts.

Click an event in the tab to jump there, or focus the tab and use the arrow keys, Page Up/Down, Home and End (it is announced as a slider with the current and next event). Jumping pauses timed playback, like Previous/Next.

**Loop from here** and **…to here** set a loop section at the current event; the first press chooses the rest of its lyric line (or four events). While a section is set, Play starts at its first event, timed playback repeats only those events, Next and Wait for me wrap back to its start, and Restart returns to its start. It takes precedence over **Loop chart**. Setting a section stops timed playback so it can take effect; **Clear loop** removes it, and choosing another chart or part clears it too. Combine it with the 25–200% speed control to practice a hard passage slowly.

`src/songs/tabLane.ts` holds the tab layout, playhead, next-event and loop-section logic; `src/ui/tabLane.ts` draws the tab. `npm run test:tab` checks tab items, the audio-clock playhead (including tempo changes and loops), next-event selection across rests and chart ends, section wrapping and transport input, hit-testing and scaling. Browser coverage (`BROWSER_SUITE=tab`) checks the summary, ghost markers on both necks, keyboard and click seeking, a timed section loop that never leaves its events, Wait-mode wrapping, 320px layout and paused drawing when hidden. The design follows the general approach of tab players that show upcoming notes on the fretboard; no code or content from another app is used.

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

In **Live studio → Sound & detection settings → Recorded instrument**, choose a Musicca steel-string, classical or electric guitar. Recorded guitar is the only guitar playback source, with steel-string as the default. These banks contain 44 recordings each (132 files, 2,888,700 compressed bytes total), covering every semitone from E2 through F5 with alternate open-string recordings. Files ending in `0` and `1` both contain the open-string pitch; they are not one semitone apart. Playback prefers the `1` take and correctly shifts low notes such as Drop D from E2. Other positions reuse recordings at the same pitch; out-of-range pitches use the nearest recording with an exact playback-rate conversion, never octave wrapping.

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

## Experimental ML evaluation (local only)

The retained local research workspace `experiments/chord-ml` is separate from the production entry point and is **not imported by the main application**. Its developer pages and lockfile stay local; the application now uses the independently typed `src/detection/enhanced` integration described above. Both use [Spotify Basic Pitch TS](https://github.com/spotify/basic-pitch-ts) 1.0.1 (Apache-2.0) with TensorFlow.js/WASM 3.21.0. The graph and weights total 916,929 bytes, excluding the runtime. The production build stages its own pinned same-origin assets and required licence/notices, rather than serving the experimental pages.

Basic Pitch predicts notes, not chord names. Recorded-file mode uses the upstream note-event decoder with fixed thresholds, then conservatively matches exact pitch-class sets to the ten supported chord qualities. It reports first, dominant and observed chord labels separately. The model expects mono 22,050 Hz audio in 43,844-sample windows (about 1.99 seconds). Explicit float32 framing works around a TFJS 3.x WASM padding issue; tests compare its buffers exactly against the upstream CPU framing.

These developer-only commands require the retained local `experiments/chord-ml` workspace, which is not included in this production release. After installing the normal app dependencies, run them from that workspace's repository root:

```powershell
npm ci --prefix experiments\chord-ml --ignore-scripts
npm test --prefix experiments\chord-ml
npm run dev --prefix experiments\chord-ml
```

The experiment listens only on `http://127.0.0.1:5180/`. Choose **Start live guitar**, allow microphone access, wait for the model and audio context to be ready, then strum slowly or pluck a note. It shows tentative chord/note suggestions, input level, clipping advice, model processing time and the age of the audio described by the prediction. It is not a validated tuner or practice grader.

The live input uses an AudioWorklet, a bounded rolling PCM window and native resampling to the model's 22,050 Hz input. It runs one raw model window at a time, no more often than every 0.5 seconds, and checks recent interior prediction frames rather than the dominant label over the whole window. There is no backlog: if inference is busy, later input replaces older buffered audio. Predictions older than 1.5 seconds are discarded; quiet input clears the display and invalidates in-flight results. Initial buffering takes about two seconds and subsequent latency depends on the device. Microphone processing requests echo cancellation, noise suppression and automatic gain control off; browser/device support varies.

**Stop microphone** releases this page's tracks, worklet, model worker, audio context and watchdog. A cancelled permission request cannot start capture later. Device disconnection, mute, capture/model failure, audio suspension, hiding the page and page exit also stop listening. The worklet's speaker output is always zero: there is no microphone monitoring or feedback path. Audio is held only in rolling memory, never saved or uploaded. Recording-file controls and live listening are mutually exclusive.

Alternatively, select a recording or an available local example, confirm permission and choose **Analyse recording**. Selecting another file resets permission, and **Cancel**, permission withdrawal or **Clear** prevent stale results. Nothing is saved to the app catalog.

Restart the experiment server after editing code; reload/watch is disabled to avoid invalidating an in-flight inference. With an isolated Chromium debugging endpoint on port 9223, the developer runner can also compare against a frozen DSP baseline:

```powershell
node experiments\chord-ml\run.mjs --ids=26379,315706,705411,30171,439554,334622,704699
```

The default runner uses the existing git-ignored, permission-backed `.real-recordings` corpus. Alternatively, supply `--manifest=path-to-manifest.json --ids=id1,id2 --output=result.json`. Each manifest entry requires `id`, `file` (relative to the manifest), `expected`, `licence` and `page`; `title` and `user` are optional. Recordings must be inside this repository. The runner rejects remote evaluation servers, records audio/model/source hashes and monitors page and worker network traffic. Inputs are capped at 16 MiB and the first 12 seconds; cropping is reported, never hidden.

The first feasibility run used seven labeled public clips, not a blind validation set. The expected chord appeared somewhere in every ML transcription, but only two first labels and five dominant labels matched. For example, Am began as A5 before the third arrived; Gmaj7 appeared but G dominated the decay. The deployed DSP gave five correct first labels on this small selection. **These are not equivalent live metrics:** ML has future audio context, and duration-based dominant labels are not first-strum confirmations. There is no evidence here to promote this model over the live detector.

On the evaluation computer, plain browser CPU inference took about 30–43 seconds for the first two clips. WASM processed the seven 3.8–12-second clips in about 1.3–3.7 seconds each. These are offline computation times, **not microphone response latency** or phone performance guarantees. The experimental unit suite covers note decoding, framing, ring-buffer bounds, no-backlog scheduling, stale-result rejection, silent worklet output and model-client cleanup. Browser controls also verify silence rejection, cancellation before decoding completes, concurrent-call rejection, stable per-inference tensor counts and no external/upload requests. The application build remains unchanged by installing/running the experiment.

`node experiments\chord-ml\live.browser.test.mjs 9225` checks the actual worklet/resampling/WASM path using a generated microphone stream containing an authorized C-chord recording and an E4 recording. It covers permission denial, cancelling a pending permission prompt, quiet-input clearing, narrow layouts, Stop, disconnection, mute, visibility and pagehide cleanup. `browser.test.mjs` in the same folder checks that recorded-file analysis still works. These tests require the local server, the existing recording corpus and an isolated Chromium debugging endpoint; they are not physical-room accuracy measurements.

The optional production integration is not a claim that these accuracy limitations are resolved. Fresh teacher-verified microphone recordings (including Am/Am7, C/Cmaj7 and A/Amaj7), target phone/laptop/browser measurements and explicit accuracy/latency acceptance criteria are still needed before making it the default or claiming a recognition improvement. Code, model-weight and recording rights must cover the intended academy use. No paid AI API or inference server is needed.

### Local hybrid live detector

With the experiment server running, open `http://127.0.0.1:5180/hybrid.html`. This separate live-only page combines a frozen snapshot of the **deployed DSP detector at `74340ba`** (including its dependency files) with the ML worker. It does not use the uncommitted DSP candidate, replace the main application or change the ML-only page.

Choose **Chords**, **Single notes**, or **Auto**, then press **Start hybrid listening**. Stay quiet through the fast detector's room check, then play slowly. Both paths share one microphone and AudioContext clock; DSP retains its 65–2200 Hz filters, gain 4, 8192-point analyser and strum-capture settings, while ML receives its separately resampled input. Neither branch monitors audio through the speakers.

The page shows the fast estimate, ML estimate and a separate combined state:

The primary readout shows a matching name once. Different recent readings show both attributed names, such as **DSP: Am / ML: Am7**, without choosing a winner. If their timing is not aligned, the state remains **Checking**, with held evidence explicitly labelled; expired ML readings are suppressed. Individual detector details remain expandable instead of repeating matching names on the main display. These are presentation changes, not looser confirmation or scoring rules.

- **Both detectors agree:** exact chord root/quality or single-note MIDI/octave match, supported by a recent fresh DSP confirmation and an ML evidence interval within the same current performance.
- **Checking:** the ML interval overlaps a strum boundary, precedes DSP confirmation, or the fast label is only held from older evidence.
- **Disagree / ML uncertain:** the outputs differ or ML has no complete single chord/note result. No winner is silently selected.
- **DSP only:** ML is loading, unavailable, too slow or lacks a current second opinion. A model loading/runtime/capture failure leaves DSP running, explicitly labelled.

New attacks (including repeated identical chords), fresh identity changes and silence invalidate older comparisons. Clipping and a bad room reference suppress agreement. Held labels do not create new confirmations; note agreement requires the same octave. Model evidence times are reported on the audio clock, not matched to whichever labels happen to be on screen when a delayed result arrives. **Agreement is not 100% certainty**, and this page does not grade practice, emit MIDI or claim a measured accuracy improvement.

Stop, device interruption, hiding/leaving the page and failure of the fast path release owned microphone resources. The ML worker has no request backlog; a disabled/failed ML branch cannot restart itself from a late resampling callback. The model-only/file pages retain their previous behavior.

`npm test --prefix experiments\chord-ml` includes deterministic alignment and lifecycle tests. With an isolated Chromium endpoint on port 9225, `node experiments\chord-ml\hybrid.browser.test.mjs 9225` checks real DSP/ML agreement on a C recording and E4, one shared microphone, controlled disagreement, model loading/runtime failure fallback, mobile layout and cleanup. These are wiring and safety checks, not proof that the hybrid is more accurate on physical guitars or rooms.

### Chord recovery and recent-audio verification

The local chord path now uses Basic Pitch's official onset-and-frame note-event post-processing as a conservative fallback when strict frame thresholding leaves a chord incomplete. It uses onset threshold 0.5, frame threshold 0.25 and minimum event length 5 frames, and requires event coverage over at least 8 of the 12 recent interior frames. An already supported complete chord is not replaced. A power-chord guess may only become a same-root major/minor triad when the note events supply its missing third; no seventh is guessed from a power chord. Single-pitch results remain unchanged, and **Single notes** mode bypasses this chord refinement entirely. The model weights and main application's DSP code are not retuned.

For chord targets, a separate continuous instance of the same frozen DSP code verifies current audio frames. It shares the analyser and room check; it is not another independent vote, and does not replace the capture preview. Fresh verification history is bounded to three seconds and aligned to ML's recent evidence interval using estimated FFT-centre times.

The original **Both detectors agree** state still requires a fresh capture from the current performance. A new blue **Recent audio agreement** state instead requires matching fresh continuous-DSP observations throughout the overlapping ML interval, matching current verification and capture labels, valid input and a recent ML result. It explicitly describes past audio and has `currentPerformanceConfirmed: false`; it cannot grade a new strum. Silence, clipping, conflicting/newer chord evidence, model failure and stale input suppress it. This avoids presenting an old held capture as fresh simply to make the display agree.

The implementation follows these published approaches, without importing proprietary detector code:

- [Basic Pitch / NMP paper](https://arxiv.org/html/2203.09893): separate onset, note and pitch posteriorgrams, then note-event post-processing rather than a single per-frame cutoff.
- [NNLS Chroma / Chordino](https://isophonics.net/nnls-chroma): frame-wise note/chroma evidence and temporal chord decoding; the authors explicitly describe Chordino as non-state-of-the-art.
- [madmom chord recognition documentation](https://madmom.readthedocs.io/en/v0.16.1/modules/features/chords.html): learned chord features plus sequence decoding. Its documented major/minor-only recogniser was not substituted for our seventh-chord vocabulary.

**Paired local replay, not a real-room accuracy claim:** 70 existing public clips were sampled on a fixed 0.5-second streaming-window grid, limited to their first six seconds. Both versions used identical unrounded model activations and pinned DSP inputs. The original 25 clips were used during development; 40 additional clips and five seventh-chord clips were checked separately. Clip labels are uploader-provided, not adjudicated per-frame truth.

| ML chord-window result, 629 active-input windows | Before | Updated |
| --- | ---: | ---: |
| Exact chord label | 361 | 393 |
| Wrong chord label | 62 | 54 |
| No complete chord label | 206 | 182 |
| Clips with the correct first chord label | 52/70 | 53/70 |
| Clips with the expected chord at least once | 59/70 | 61/70 |

No previously correct window regressed on this corpus; existing complete-chord outputs and single-pitch outputs were unchanged. This does not resolve every triad/seventh ambiguity, and recordings with effects, incomplete voicings or weak roots remain difficult.

In the scheduling replay, strict current-performance agreement changed from 46 to 47 returns (43 and 44 matched the clip label). The separate recent-audio state was available on 185 more returns, of which 170 matched the clip label. **Do not pool these as new-strum confirmations or infer certainty from agreement.** Replay uses recorded model compute times and latest-only scheduling, but excludes new post-processing/resampling overhead; device latency still needs live measurement.

`stream-probe-run.mjs` in the experiment folder captures the local corpus once; `compare-chords.mjs` replays the frozen local baseline in `.real-recordings/hybrid-chords-before` against the candidate. Exact activations and reports are saved in the git-ignored `.real-recordings/results` directory, not bundled with the application. `chord-remediation.browser.test.mjs` verifies actual G5 → G and A5 → Am recovery through the WASM worker while confirming that Single notes mode retains its previous output. The approved release ports this conservative chord refinement into optional Enhanced checking, not the default detector. Representative microphone testing remains necessary for accuracy claims.
