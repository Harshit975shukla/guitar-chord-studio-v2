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
npm run preview
```

Microphone access requires HTTPS or localhost and browser permission. MIDI permission is requested only when opening MIDI settings under **More tools**. Microphone analysis happens locally; the app does not upload microphone audio.

## The live studio

- **Start listening** starts microphone capture and room calibration. Stay quiet briefly, then play. Choose **Chords**, **Notes**, or **Auto** to set the listening target.
- Try a chord without granting microphone access. Presets, library selections and both fretboard views share the same voicing and acoustic synthesizer.
- **3D**: drag to orbit, click a string/fret to select and pluck it, or click a selected position again to mute it. Use the camera buttons or `+`, `−`, and `R` while the canvas is focused to zoom/reset.
- **2D**: scroll horizontally through the neck. Each fret and string mute control is a native keyboard-accessible button.
- Amber markers are roots, cream markers are selected notes, and green markers show positions matching the detected pitch. A microphone cannot identify a unique string/fret from pitch alone: detected chords show a **suggested voicing**, and live notes show **possible positions**, not measured finger placement.
- View preference is saved locally. Reduced-motion users default to 2D on their first visit; WebGL or context failure also falls back to 2D.
- Sound settings and spectrum diagnostics are expandable. Additional practice tools and the working Audio recorder are in **More tools**. The unfinished transcriber, multi-track looper and video recorder are not advertised as available.

## Rendering and validation

The original Three.js scene is in `src/ui/fretboard3d.ts`. It generates its own neck, binding, nut, fret wires, six strings, inlays and labels—no third-party models, textures or reference-site assets. Three.js is dynamically imported only for the 3D view. Rendering is event-driven (no continuous animation loop), pixel ratio is capped, hidden/offscreen views stop drawing, and switching to 2D releases the WebGL context and GPU resources.

`src/ui/studio.ts` recomposes the existing controls and connects the two views; `src/ui/studio.css` supplies the responsive visual system. Detection algorithms are unchanged.

Before publishing, build and run the existing detection smoke tests, then check:

1. At 320px, 390px, tablet and desktop widths, microphone controls remain easy to reach and each functional tool fits the viewport.
2. Presets, 2D fretting/muting and 3D picking update the same state. Orbit, zoom and reset respond.
3. Live notes/chords update the hero and neck; stopping capture releases the microphone; denied permission offers a retry.
4. Switching views, navigating away, reduced-motion preference and unavailable WebGL preserve a usable interface.

Browser validation can verify UI wiring with synthetic inputs; it does not establish real-room detection accuracy. That requires recordings or microphone sessions with representative guitars and noise conditions.
