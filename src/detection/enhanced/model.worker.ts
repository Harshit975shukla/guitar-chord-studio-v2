/// <reference lib="webworker" />
import * as tf from '@tensorflow/tfjs';
import { BasicPitch, outputToNotesPoly } from '@spotify/basic-pitch';
import { setWasmPaths } from '@tensorflow/tfjs-backend-wasm';
import { decodeWindow } from './core';
import { MODEL_WINDOW, ML_ASSET_VERSION, type ModelRequest, type ModelReply } from './types';

declare const self: DedicatedWorkerGlobalScope;
let model: BasicPitch | null = null;
let busy = false;
self.onmessage = async ({ data }: MessageEvent<ModelRequest>) => {
  const { id, kind, pcm, assets, targetMode } = data;
  const reply = (message: ModelReply) => self.postMessage(message);
  if (busy) { reply({ id, error: 'Enhanced detection is already processing audio.' }); return; }
  busy = true; let scope = false;
  try {
    const address = new URL(assets);
    if (address.origin !== self.location.origin || !address.pathname.endsWith(`/ml/${ML_ASSET_VERSION}/`)) throw new Error('Invalid local model location.');
    if (kind !== 'load' && kind !== 'live') throw new Error('Unknown detection operation.');
    if (!['chords', 'notes', 'auto'].includes(targetMode)) throw new Error('Invalid listening target.');
    if (kind === 'live' && (!(pcm instanceof Float32Array) || pcm.length !== MODEL_WINDOW || !pcm.every(Number.isFinite))) throw new Error('Invalid model audio window.');
    if (!model) {
      setWasmPaths(address.href);
      if (!await tf.setBackend('wasm')) throw new Error('WebAssembly inference is unavailable on this browser.');
      await tf.ready();
      model = new BasicPitch(new URL('model.json', address).href);
      await model.model;
    }
    if (kind === 'load') { reply({ id, ready: true }); return; }
    tf.engine().startScope(); scope = true;
    const started = performance.now();
    const input = tf.tensor3d(pcm!, [1, MODEL_WINDOW, 1], 'float32');
    const [activation, onset] = await model.evaluateSingleFrame(input, 0);
    const frames = (await activation.array())[0];
    let decoded = decodeWindow(frames);
    if (targetMode !== 'notes' && new Set(decoded.notes.map(note => note.midi % 12)).size >= 2 && (!decoded.chord || decoded.chord.endsWith('5'))) {
      const onsets = (await onset.array())[0];
      decoded = decodeWindow(frames, outputToNotesPoly(frames.map(frame => [...frame]), onsets, .5, .25, 5));
    }
    reply({ id, result: { ...decoded, inferenceMs: performance.now() - started } });
  } catch (error) {
    model = null;
    reply({ id, error: error instanceof Error ? error.message : String(error) });
  } finally { if (scope) tf.engine().endScope(); busy = false; }
};
