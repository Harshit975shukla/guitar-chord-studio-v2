// Run: npx tsx scripts/guitar-lab-smoke.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  EXPLODE_OVERLAP, GUITAR_LAB_CAVEAT, GUITAR_MODELS, GUITAR_OUTLINES, GUITAR_PART_GROUPS, createGuitarLabState, easeInOutCubic,
  guitarAssemblyOffset, guitarAssemblyProgress, guitarDisassemblyOrder, guitarFretY, guitarOutlinePath, guitarPart,
  selectGuitarPart, setGuitarExplode,
} from '../src/theory/guitarAnatomy.ts';

let checks = 0;
function check(name, fn) { fn(); checks++; console.log(`PASS ${name}`); }
const models = Object.values(GUITAR_MODELS);
const ids = kind => GUITAR_MODELS[kind].parts.map(p => p.id);
const info = (kind, id) => guitarPart(kind, id).info;

check('three instruments list every component with a specification line and a real explanation', () => {
  assert.deepEqual(models.map(m => m.id), ['steel', 'classical', 'electric']);
  assert.deepEqual(models.map(m => m.parts.length), [18, 15, 18]);
  for (const model of models) {
    assert.equal(new Set(ids(model.id)).size, model.parts.length, `${model.id} ids`);
    assert.equal(new Set(model.parts.map(p => p.name)).size, model.parts.length, `${model.id} names`);
    for (const part of model.parts) {
      assert.ok(part.spec.length >= 8 && part.spec.length <= 44, `${model.id}.${part.id} spec`);
      assert.ok(part.info.length >= 120 && part.info.length <= 330, `${model.id}.${part.id} info length ${part.info.length}`);
      assert.match(part.info, /[.!]$/);
      assert.ok(GUITAR_PART_GROUPS.includes(part.group));
      assert.ok(model.assemblies.some(a => a.id === part.assembly), `${model.id}.${part.id} assembly`);
    }
    for (const assembly of model.assemblies) assert.ok(model.parts.some(p => p.assembly === assembly.id), `${model.id}.${assembly.id} has parts`);
    assert.ok(model.specs.length >= 7 && model.specs.every(([k, v]) => k && v));
  }
});

check('instrument-specific anatomy matches what each model shows', () => {
  for (const kind of ['steel', 'classical']) {
    for (const id of ['back', 'sides', 'bracing', 'soundboard', 'soundhole', 'binding']) assert.ok(ids(kind).includes(id), `${kind} ${id}`);
    for (const id of ['body', 'neckPlate', 'neckPickup', 'bridgePickup', 'controls', 'selector', 'jack']) assert.ok(!ids(kind).includes(id), `${kind} ${id}`);
  }
  assert.ok(ids('steel').includes('pins') && ids('steel').includes('pickguard') && ids('steel').includes('strapPins'));
  assert.ok(!ids('classical').includes('pins') && !ids('classical').includes('pickguard') && !ids('classical').includes('strapPins'));
  for (const id of ['back', 'sides', 'bracing', 'soundboard', 'soundhole', 'pins']) assert.ok(!ids('electric').includes(id), `electric ${id}`);
  assert.equal(guitarPart('steel', 'bracing').name, 'X-bracing');
  assert.equal(guitarPart('classical', 'bracing').name, 'Fan bracing');
  assert.equal(guitarPart('classical', 'bridge').name, 'Tie-block bridge');
  assert.equal(guitarPart('classical', 'headstock').name, 'Slotted headstock');
  assert.match(info('classical', 'strings'), /never fit steel strings/);
  assert.match(info('classical', 'fretboard'), /no position dots/);
  assert.match(info('steel', 'pins'), /bridge plate/);
  assert.match(info('steel', 'bracing'), /between the soundhole and the bridge/);
  assert.match(info('electric', 'strings'), /magnetic pickup/);
  assert.match(info('electric', 'bridgePickup'), /brighter/);
  assert.match(info('electric', 'neckPickup'), /warm/);
  assert.match(info('electric', 'fretboard'), /3, 5, 7, 9, 15, 17, 19 and 21/);
  assert.match(info('steel', 'fretboard'), /3, 5, 7, 9, 15, 17 and 19/);
  assert.equal(GUITAR_MODELS.electric.frets, 22); assert.equal(GUITAR_MODELS.steel.frets, 20); assert.equal(GUITAR_MODELS.classical.frets, 19);
  // Corrected or softened claims from the source notes stay corrected.
  const all = models.flatMap(m => m.parts.map(p => p.info)).join(' ');
  for (const claim of [/tames the thin top end/, /triples the glue/, /never bolted/, /single biggest/, /thousandth of an inch/, /most repairable neck joint ever/]) assert.doesNotMatch(all, claim);
  assert.match(GUITAR_LAB_CAVEAT, /not a maintenance or disassembly guide/);
  assert.match(GUITAR_LAB_CAVEAT, /glued/);
  assert.match(GUITAR_LAB_CAVEAT, /varies by maker and model/);
});

check('assemblies have one fixed anchor, distinct build orders and finite outward offsets', () => {
  for (const model of models) {
    const anchors = model.assemblies.filter(a => a.order === 0);
    assert.equal(anchors.length, 1); assert.equal(anchors[0].id, 'body'); assert.deepEqual([...anchors[0].offset], [0, 0, 0]);
    const orders = model.assemblies.map(a => a.order);
    assert.equal(new Set(orders).size, orders.length, `${model.id} build orders`);
    for (const assembly of model.assemblies.filter(a => a.order > 0)) {
      assert.ok(assembly.offset.length === 3 && assembly.offset.every(Number.isFinite));
      assert.ok(Math.hypot(...assembly.offset) > .6, `${model.id}.${assembly.id} moves visibly`);
    }
    const order = guitarDisassemblyOrder(model.id);
    assert.equal(order[0], 'strings', 'strings come off first');
    assert.equal(order.length, model.assemblies.length - 1);
    assert.ok(!order.includes('body'));
  }
  assert.equal(guitarDisassemblyOrder('steel').at(-1), 'back');
  assert.equal(guitarDisassemblyOrder('electric').at(-1), 'neck');
});

check('the disassembly timeline is staggered in reverse build order, eased and monotonic', () => {
  for (const model of models) {
    const order = guitarDisassemblyOrder(model.id);
    for (const assembly of model.assemblies) {
      assert.equal(guitarAssemblyProgress(model.id, assembly.id, 0), 0);
      assert.equal(guitarAssemblyProgress(model.id, assembly.id, 1), assembly.order === 0 ? 0 : 1);
      assert.equal(guitarAssemblyProgress(model.id, assembly.id, -3), 0);
      assert.equal(guitarAssemblyProgress(model.id, assembly.id, 7), assembly.order === 0 ? 0 : 1);
      assert.equal(guitarAssemblyProgress(model.id, assembly.id, NaN), 0);
      let previous = 0;
      for (let t = 0; t <= 1.0001; t += .01) {
        const value = guitarAssemblyProgress(model.id, assembly.id, t);
        assert.ok(value >= previous - 1e-12 && value >= 0 && value <= 1, `${model.id}.${assembly.id} at ${t}`);
        previous = value;
      }
    }
    // Early in the timeline the first group to come off is ahead of the last.
    assert.ok(guitarAssemblyProgress(model.id, order[0], .2) > guitarAssemblyProgress(model.id, order.at(-1), .2));
    assert.equal(guitarAssemblyProgress(model.id, order.at(-1), .1), 0);
    const midway = order.map(id => guitarAssemblyProgress(model.id, id, .5));
    assert.ok(midway.some(v => v > 0 && v < 1), 'groups overlap mid-way');
    for (let i = 1; i < midway.length; i++) assert.ok(midway[i] <= midway[i - 1] + 1e-12);
    for (const assembly of model.assemblies) {
      const offset = guitarAssemblyOffset(model.id, assembly.id, .5), amount = guitarAssemblyProgress(model.id, assembly.id, .5);
      assembly.offset.forEach((value, i) => assert.ok(Math.abs(offset[i] - value * amount) < 1e-12));
    }
  }
  assert.ok(EXPLODE_OVERLAP > 0 && EXPLODE_OVERLAP < 1);
  assert.equal(easeInOutCubic(0), 0); assert.equal(easeInOutCubic(1), 1); assert.equal(easeInOutCubic(.5), .5);
});

check('selection and disassembly state are validated, clamped and immutable', () => {
  for (const model of models) {
    const original = Object.freeze(createGuitarLabState(model.id));
    assert.deepEqual(original, { kind: model.id, selected: null, explode: 0 });
    for (const part of model.parts) {
      const selected = selectGuitarPart(original, part.id);
      assert.equal(selected.selected, part.id); assert.equal(selected.explode, 0);
      assert.equal(selectGuitarPart(selected, part.id), selected);
      assert.equal(selectGuitarPart(selected, null).selected, null);
    }
    assert.equal(selectGuitarPart(original, 'not-a-part'), original);
    assert.equal(setGuitarExplode(original, .4).explode, .4);
    assert.equal(setGuitarExplode(original, 3).explode, 1);
    assert.equal(setGuitarExplode(original, -1).explode, 0);
    assert.equal(setGuitarExplode(original, NaN), original);
    assert.equal(setGuitarExplode(original, 0), original);
  }
  assert.equal(selectGuitarPart(createGuitarLabState('classical'), 'pins').selected, null, 'parts of other instruments are rejected');
  assert.equal(guitarPart('steel', null), undefined);
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

check('the 3D scene tags every listed part, and only listed parts, on real geometry', () => {
  const scene = readFileSync(new URL('../src/ui/guitarLab3d.ts', import.meta.url), 'utf8');
  const tagged = new Set([...scene.matchAll(/this\.(?:add|box|rod|extrude|screw)\('([A-Za-z]+)', '([A-Za-z]+)'/g)].map(m => m[2]));
  for (const [, id] of scene.matchAll(/\[-?[.\d]+, '(neckPickup|bridgePickup)'\]/g)) tagged.add(id);
  const listed = new Set(models.flatMap(m => m.parts.map(p => p.id)));
  for (const id of listed) assert.ok(tagged.has(id), `3D geometry for ${id}`);
  for (const id of tagged) if (id !== 'pickup') assert.ok(listed.has(id), `unlisted 3D part ${id}`);
});

check('local integration stays lazy, scoped, render-on-demand and independent of the microphone', () => {
  const ui = readFileSync(new URL('../src/ui/guitarLab.ts', import.meta.url), 'utf8');
  const scene = readFileSync(new URL('../src/ui/guitarLab3d.ts', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../src/ui/guitarLab.css', import.meta.url), 'utf8');
  assert.match(ui, /await import\('\.\/guitarLab3d'\)/);
  assert.doesNotMatch(ui, /import \{[^}]*GuitarLab3D[^}]*\} from/);
  assert.doesNotMatch(ui + scene, /getUserMedia|fretboard3d|paneNeck3d|localStorage|setGuitarSampleBank|cdn\.jsdelivr/);
  assert.doesNotMatch(ui, /id="/);
  assert.doesNotMatch(ui, /this\.root\.open\s*=\s*true/);
  assert.match(ui, /engine\.createAcousticBus/);
  assert.match(ui, /await samples\.loadGuitarBank/);
  assert.match(ui, /generation === this\.audioGeneration/);
  assert.match(scene, /if \(busy\) this\.requestRender\(\); else this\.last = 0;/);
  assert.match(scene, /forceContextLoss/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /max-width: 380px/);
});
console.log(`\n${checks}/${checks} Guitar Lab checks passed.`);
