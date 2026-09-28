// Run: npx tsx scripts/guitar-lab-smoke.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  GUITAR_LAB_CAVEAT, GUITAR_MODELS, GUITAR_OUTLINES, createGuitarLabState, guitarAssemblyOffset,
  guitarAssemblyProgress, guitarFretY, guitarOutlinePath, transitionGuitarLab,
} from '../src/theory/guitarAnatomy.ts';

let checks = 0;
function check(name, fn) { fn(); checks++; console.log(`PASS ${name}`); }
const models = Object.values(GUITAR_MODELS);
function assertConsistent(state) {
  const model = GUITAR_MODELS[state.kind];
  assert.ok(!state.detached.includes('body'));
  assert.equal(new Set(state.detached).size, state.detached.length);
  assert.ok(model.parts.some(p => p.id === state.selected));
  for (const assembly of model.assemblies) {
    if (!state.detached.includes(assembly.id)) for (const required of assembly.requires) {
      assert.ok(!state.detached.includes(required), `${state.kind}/${assembly.id} needs ${required}`);
    }
  }
}

check('three representative instruments have complete, unique anatomy and acyclic assembly graphs', () => {
  assert.deepEqual(models.map(m => m.id), ['steel', 'classical', 'electric']);
  for (const model of models) {
    assert.equal(new Set(model.parts.map(p => p.id)).size, model.parts.length);
    assert.equal(new Set(model.assemblies.map(a => a.id)).size, model.assemblies.length);
    for (const part of model.parts) {
      assert.ok(part.function.length > 30 && part.detail.length > 50);
      assert.ok(model.assemblies.some(a => a.id === part.assembly));
    }
    const visit = (id, path = []) => {
      assert.ok(!path.includes(id), `cycle ${path.join(',')} -> ${id}`);
      const assembly = model.assemblies.find(a => a.id === id);
      assert.ok(assembly);
      assert.ok(assembly.offset.length === 3 && assembly.offset.every(Number.isFinite));
      assembly.requires.forEach(required => visit(required, [...path, id]));
    };
    model.assemblies.forEach(a => visit(a.id));
  }
});

check('instrument differences and educational safety caveats are explicit', () => {
  for (const kind of ['steel', 'classical']) {
    const model = GUITAR_MODELS[kind], ids = model.parts.map(p => p.id);
    assert.ok(ids.includes('soundboard') && ids.includes('soundhole'));
    assert.ok(!ids.includes('pickups') && !ids.includes('controls'));
    assert.equal(model.parts.find(p => p.id === 'soundhole').assembly, 'soundboard');
  }
  const electric = GUITAR_MODELS.electric.parts.map(p => p.id);
  assert.ok(!electric.includes('soundhole') && !electric.includes('soundboard'));
  assert.ok(electric.includes('pickups') && electric.includes('controls'));
  assert.match(GUITAR_MODELS.classical.parts.find(p => p.id === 'bridge').name, /Tie-block/);
  assert.match(GUITAR_MODELS.classical.parts.find(p => p.id === 'headstock').name, /Slotted/);
  assert.match(GUITAR_MODELS.classical.parts.find(p => p.id === 'strings').detail, /Never substitute/);
  assert.match(GUITAR_MODELS.steel.parts.find(p => p.id === 'bridge').detail, /bridge plate/);
  assert.match(GUITAR_LAB_CAVEAT, /not a maintenance or disassembly guide/);
  assert.match(GUITAR_LAB_CAVEAT, /glued assemblies/);
  assert.match(GUITAR_LAB_CAVEAT, /varies by maker and model/);
});

check('selection is validated, immutable and independent of assembly state', () => {
  for (const model of models) {
    const original = createGuitarLabState(model.id);
    Object.freeze(original.detached); Object.freeze(original);
    for (const part of model.parts) {
      const selected = transitionGuitarLab(original, { type: 'select', part: part.id });
      assert.equal(selected.selected, part.id);
      assert.deepEqual(selected.detached, []);
    }
    assert.equal(transitionGuitarLab(original, { type: 'select', part: 'not-a-part' }), original);
    assert.equal(transitionGuitarLab(original, { type: 'detach', assembly: 'body' }), original);
    assert.equal(transitionGuitarLab(original, { type: 'detach', assembly: 'not-an-assembly' }), original);
  }
});

check('explosion changes layout, never attachment progress', () => {
  for (const model of models) {
    const initial = createGuitarLabState(model.id);
    const exploded = transitionGuitarLab(initial, { type: 'explode', value: true });
    assert.deepEqual(guitarAssemblyProgress(exploded), guitarAssemblyProgress(initial));
    assert.deepEqual(exploded.detached, []);
    for (const assembly of model.assemblies) {
      assert.deepEqual(guitarAssemblyOffset(initial, assembly.id), [0, 0, 0].map((_, i) => assembly.offset[i] * 0));
      assert.deepEqual(guitarAssemblyOffset(exploded, assembly.id), assembly.offset);
    }
    assert.deepEqual(transitionGuitarLab(exploded, { type: 'explode', value: false }), initial);
  }
});

check('detach cascades only to dependent groups and keeps independent groups attached', () => {
  for (const model of models) {
    const state = transitionGuitarLab(createGuitarLabState(model.id), { type: 'detach', assembly: 'neck' });
    for (const id of ['neck', 'fretboard', 'nut', 'tuners', 'strings']) assert.ok(state.detached.includes(id));
    assert.ok(!state.detached.includes('bridge'));
    assert.ok(!state.detached.includes('body'));
    if (model.id === 'electric') assert.ok(!state.detached.includes('electronics'));
    else assert.ok(!state.detached.includes('soundboard'));
    assertConsistent(state);
  }
  const acoustic = transitionGuitarLab(createGuitarLabState(), { type: 'detach', assembly: 'soundboard' });
  assert.deepEqual(acoustic.detached, ['soundboard', 'bridge', 'strings']);
  assert.ok(!acoustic.detached.includes('neck'));
});

check('attach restores required supports, but not unrelated detached groups', () => {
  for (const model of models) {
    const empty = transitionGuitarLab(createGuitarLabState(model.id), { type: 'detach-all' });
    assert.equal(guitarAssemblyProgress(empty).attached, 1);
    const neck = transitionGuitarLab(empty, { type: 'attach', assembly: 'neck' });
    assert.equal(guitarAssemblyProgress(neck).attached, 2);
    assert.ok(neck.detached.includes('strings'));
    const strung = transitionGuitarLab(empty, { type: 'attach', assembly: 'strings' });
    assertConsistent(strung);
    assert.deepEqual(strung.detached, model.id === 'electric' ? ['electronics'] : []);
    const complete = transitionGuitarLab(empty, { type: 'reassemble' });
    assert.deepEqual(complete, createGuitarLabState(model.id));
  }
});

check('all two-action combinations preserve dependency invariants and idempotency', () => {
  for (const model of models) {
    const actions = model.assemblies.flatMap(a => [{ type: 'detach', assembly: a.id }, { type: 'attach', assembly: a.id }]);
    actions.push({ type: 'detach-all' }, { type: 'reassemble' }, { type: 'explode', value: true }, { type: 'explode', value: false });
    for (const first of actions) for (const second of actions) {
      const once = transitionGuitarLab(transitionGuitarLab(createGuitarLabState(model.id), first), second);
      assertConsistent(once);
      assert.deepEqual(transitionGuitarLab(once, second), once);
      const progress = guitarAssemblyProgress(once);
      assert.ok(progress.attached >= 1 && progress.attached <= progress.total);
      assert.ok(model.assemblies.every(a => guitarAssemblyOffset(once, a.id).every(Number.isFinite)));
    }
  }
});

check('pure model outlines are closed, bounded, distinct and the twelfth fret halves the scale', () => {
  assert.equal(new Set(models.map(m => guitarOutlinePath(m.id))).size, 3);
  for (const model of models) {
    const curves = GUITAR_OUTLINES[model.id];
    assert.ok(curves.length >= 8);
    assert.deepEqual(curves.at(-1).slice(-2), [0, 1.5]);
    assert.ok(curves.flat().every(x => Number.isFinite(x) && Math.abs(x) <= 4.2));
    assert.ok(guitarOutlinePath(model.id).startsWith('M 0 1.5 C'));
    assert.ok(guitarOutlinePath(model.id).endsWith('Z'));
    assert.equal(guitarFretY(model.id, 0), model.nutY);
    assert.equal(guitarFretY(model.id, 12), model.nutY - model.scaleLength / 2);
    let previous = Infinity, spacing = Infinity;
    for (let fret = 0; fret <= model.frets; fret++) {
      const y = guitarFretY(model.id, fret), difference = previous - y;
      assert.ok(y < previous); assert.ok(difference <= spacing);
      previous = y; spacing = difference;
    }
  }
});

check('full-guitar proportions separate acoustic depth, classical width and electric body thickness', () => {
  assert.ok(GUITAR_MODELS.steel.bodyDepth > GUITAR_MODELS.electric.bodyDepth * 2);
  assert.ok(GUITAR_MODELS.classical.nutWidth > GUITAR_MODELS.steel.nutWidth);
  for (const model of models) {
    assert.ok(model.nutWidth / model.scaleLength > .06 && model.nutWidth / model.scaleLength < .09);
    assert.ok(model.bodyDepth > .4 && model.bodyDepth < 1.5);
  }
});

check('local integration stays lazy, scoped and independent of microphone or shared necks', () => {
  const ui = readFileSync(new URL('../src/ui/guitarLab.ts', import.meta.url), 'utf8');
  const scene = readFileSync(new URL('../src/ui/guitarLab3d.ts', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../src/ui/guitarLab.css', import.meta.url), 'utf8');
  assert.match(ui, /await import\('\.\/guitarLab3d'\)/);
  assert.doesNotMatch(ui, /import \{[^}]*GuitarLab3D[^}]*\} from/);
  assert.doesNotMatch(ui + scene, /getUserMedia|fretboard3d|paneNeck3d|localStorage|setGuitarSampleBank/);
  assert.doesNotMatch(ui, /id="/);
  assert.doesNotMatch(ui, /this\.root\.open\s*=\s*true/);
  assert.match(ui, /engine\.createAcousticBus/);
  assert.match(ui, /await samples\.loadGuitarBank/);
  assert.match(ui, /generation === this\.audioGeneration/);
  assert.match(scene, /if \(this\.animationStart\) this\.requestRender/);
  assert.match(scene, /forceContextLoss/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /max-width: 380px/);
});
console.log(`\n${checks}/${checks} Guitar Lab checks passed.`);
