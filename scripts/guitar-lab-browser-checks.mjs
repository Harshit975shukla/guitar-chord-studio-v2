import assert from 'node:assert/strict';

/**
 * CDP suite for the Guitar Lab. Mounts its own disposable lab; does not depend on app globals or alter settings.
 * Call with { check, evaluate, send, until, screenshot }.
 */
export async function checkGuitarLab({ check, evaluate, send, until, screenshot = async () => {} }) {
  const frames = () => evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const mount = async withAudio => {
    await evaluate(`(async () => {
      const { GuitarLab } = await import('/src/ui/guitarLab.ts');
      window.labTestClass = GuitarLab;
      if (!window.labTestHost) {
        window.labTestHost = document.createElement('section');
        labTestHost.style.cssText = 'max-width:1120px;margin:24px auto;';
        document.body.append(labTestHost);
      }
      window.labTestAudioRequests = 0;
      window.labTest = new GuitarLab(labTestHost, ${withAudio} ? () => { labTestAudioRequests++; return new Promise(resolve => { window.labTestReleaseAudio = resolve; }); } : undefined);
      window.labTestRoot = labTestHost.querySelector('[data-guitar-lab]');
      window.lab$ = selector => labTestRoot.querySelector(selector);
      window.labSlide = value => { const input = lab$('[data-lab-explode]'); input.value = String(value); input.dispatchEvent(new Event('input', { bubbles: true })); };
      window.labModel = value => { const select = lab$('[data-lab-model]'); select.value = value; select.dispatchEvent(new Event('change', { bubbles: true })); };
      window.labPartNames = () => [...labTestRoot.querySelectorAll('[data-lab-part]')].map(button => button.textContent.trim());
      window.labMeshes = part => { const meshes = []; labTest.scene.root.traverse(o => { if (o.isMesh && o.userData.part === part) meshes.push(o); }); return meshes; };
    })()`);
  };
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
  await mount(true);
  try {
    await check('Guitar Lab is optional, closed by default and silent before an explicit action', async () => {
      assert.deepEqual(await evaluate(() => ({
        open: labTestRoot.open, canvas: labTestRoot.querySelectorAll('canvas').length,
        audio: labTestAudioRequests, ids: labTestRoot.querySelectorAll('[id]').length,
      })), { open: false, canvas: 0, audio: 0, ids: 0 });
      await evaluate(() => { lab$('[data-lab-view="2d"]').click(); labTestRoot.open = true; labTestRoot.scrollIntoView({ block: 'start' }); });
      await until('labTestRoot.open && !!labTestRoot.querySelector("svg")');
      const listed = await evaluate(() => ({ names: labPartNames(), groups: [...labTestRoot.querySelectorAll('.gl-part-group h4')].map(h => h.textContent),
        count: lab$('[data-lab-part-count]').textContent, specs: labTestRoot.querySelectorAll('[data-lab-specs] div').length, canvas: labTestRoot.querySelectorAll('canvas').length }));
      assert.equal(listed.names.length, 18); assert.equal(listed.count, '18 parts'); assert.equal(listed.specs, 8); assert.equal(listed.canvas, 0);
      assert.deepEqual(listed.groups, ['Body', 'Neck', 'Headstock', 'Bridge', 'Strings']);
      for (const name of ['X-bracing', 'Soundboard', 'Bridge pins', 'Binding & purfling', 'End pin & strap button']) assert.ok(listed.names.includes(name), name);
    });

    await check('the 2D diagram isolates a part, explains it and follows the disassembly slider', async () => {
      const result = await evaluate(() => {
        [...labTestRoot.querySelectorAll('[data-lab-part]')].find(b => b.textContent.includes('Soundhole')).click();
        const detail = { name: lab$('[data-lab-part-name]').textContent, spec: lab$('[data-lab-part-spec]').textContent, info: lab$('[data-lab-part-info]').textContent,
          pressed: lab$('[data-lab-part="soundhole"]').getAttribute('aria-pressed'), empty: lab$('[data-lab-detail-empty]').hidden,
          selected: lab$('svg [data-lab-pick="soundhole"]').dataset.selected, faded: lab$('svg [data-lab-pick="neck"]').dataset.faded,
          status: lab$('[data-lab-status]').textContent };
        const before = lab$('svg [data-lab-pick="soundboard"]').getAttribute('transform');
        labSlide(60);
        const apart = { transform: lab$('svg [data-lab-pick="soundboard"]').getAttribute('transform'), anchor: lab$('svg [data-lab-pick="sides"]').getAttribute('transform'),
          label: lab$('[data-lab-stage-label]').textContent, out: lab$('[data-lab-explode-out]').textContent, text: lab$('[data-lab-explode]').getAttribute('aria-valuetext'),
          viewBox: lab$('svg').getAttribute('viewBox') };
        lab$('[data-lab-explode-to="0"]').click();
        return { detail, before, apart, reset: lab$('svg [data-lab-pick="soundboard"]').getAttribute('transform'), status: lab$('[data-lab-status]').textContent,
          assembleDisabled: lab$('[data-lab-explode-to="0"]').disabled };
      });
      assert.deepEqual({ ...result.detail, info: undefined, status: undefined }, { name: 'Soundhole & rosette', spec: 'About 100 mm opening, inlaid rings', info: undefined,
        pressed: 'true', empty: true, selected: 'true', faded: 'true', status: undefined });
      assert.match(result.detail.info, /not out of the hole/); assert.match(result.detail.status, /Soundhole & rosette isolated/);
      assert.equal(result.before, 'translate(0.000 0.000)');
      assert.notEqual(result.apart.transform, result.before); assert.equal(result.apart.anchor, 'translate(0.000 0.000)', 'the rim stays as the anchor');
      assert.deepEqual([result.apart.label, result.apart.out, result.apart.text], ['60% apart · Soundhole & rosette isolated', '60%', '60% apart']);
      assert.notEqual(result.apart.viewBox, '-3.300 -8.300 6.600 13.000');
      assert.equal(result.reset, 'translate(0.000 0.000)'); assert.equal(result.status, 'Assembled.'); assert.equal(result.assembleDisabled, true);
      await evaluate(() => lab$('[data-lab-part="soundhole"]').focus());
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
      assert.deepEqual(await evaluate(() => ({ empty: !lab$('[data-lab-detail-empty]').hidden, faded: labTestRoot.querySelectorAll('svg [data-faded="true"]').length })), { empty: true, faded: 0 });
    });

    await check('each instrument lists its own components and keeps its own disassembly and selection', async () => {
      const result = await evaluate(() => {
        lab$('[data-lab-part="neck"]').click(); labSlide(50);
        labModel('classical');
        const classical = { names: labPartNames(), selected: labTestRoot.querySelectorAll('[data-lab-part][aria-pressed="true"]').length, explode: lab$('[data-lab-explode]').value };
        labModel('electric');
        const electric = { names: labPartNames(), groups: [...labTestRoot.querySelectorAll('.gl-part-group h4')].map(h => h.textContent) };
        labSlide(100);
        labModel('steel');
        return { classical, electric, steel: { selected: lab$('[data-lab-part-name]').textContent, explode: lab$('[data-lab-explode]').value },
          electricAgain: (labModel('electric'), lab$('[data-lab-explode]').value) };
      });
      assert.equal(result.classical.names.length, 15); assert.equal(result.classical.selected, 0); assert.equal(result.classical.explode, '0');
      for (const name of ['Fan bracing', 'Slotted headstock', 'Roller tuners', 'Tie-block bridge', 'Nylon strings']) assert.ok(result.classical.names.includes(name), name);
      assert.ok(!result.classical.names.includes('Bridge pins') && !result.classical.names.includes('Pickguard'));
      assert.equal(result.electric.names.length, 18);
      for (const name of ['Neck pickup', 'Bridge pickup', 'Volume & tone', 'Pickup selector', 'Output jack', 'Neck plate', 'Saddles']) assert.ok(result.electric.names.includes(name), name);
      assert.ok(!result.electric.names.includes('Soundhole & rosette'));
      assert.deepEqual(result.electric.groups, ['Body', 'Neck', 'Headstock', 'Electronics', 'Bridge', 'Strings']);
      assert.deepEqual(result.steel, { selected: 'Neck', explode: '50' }); assert.equal(result.electricAgain, '100');
      await evaluate(() => { labModel('steel'); lab$('[data-lab-clear]').click(); lab$('[data-lab-explode-to="0"]').click(); });
    });

    await check('3D loads lazily; isolation fades the other parts and the chosen part glows', async () => {
      await evaluate(() => { lab$('[data-lab-view="3d"]').click(); lab$('.gl-stage').scrollIntoView({ block: 'center' }); });
      await until('!!labTestRoot.querySelector("canvas") || lab$("[data-lab-view=\\"2d\\"]").getAttribute("aria-pressed") === "true"');
      assert.equal(await evaluate(() => !!labTestRoot.querySelector('canvas')), true, 'this browser provides WebGL');
      await until('!labTest.scene.rendering');
      const isolated = await evaluate(() => {
        lab$('[data-lab-part="bracing"]').click();
        const brace = labMeshes('bracing'), top = labMeshes('soundboard'), pins = labMeshes('pins');
        return { state: labTest.scene.state.selected, braces: brace.length, glow: brace.every(m => m.material.emissiveIntensity >= .5 && m.renderOrder === 2),
          topFaded: top.every(m => m.material.transparent && m.material.opacity < .2 && !m.material.depthWrite),
          pinsFaded: pins.length === 12 && pins.every(m => m.material.opacity < .2), stage: lab$('[data-lab-stage-label]').textContent };
      });
      assert.deepEqual(isolated, { state: 'bracing', braces: 2, glow: true, topFaded: true, pinsFaded: true, stage: 'Assembled · X-bracing isolated' });
      const cleared = await evaluate(() => {
        lab$('[data-lab-clear]').click();
        const top = labMeshes('soundboard');
        return { opaque: top.every(m => m.material === m.userData.base && !m.material.transparent), glow: labMeshes('bracing').every(m => m.material.emissiveIntensity === 0) };
      });
      assert.deepEqual(cleared, { opaque: true, glow: true });
    });

    await check('disassembly animates in build order, follows with the camera, labels groups, then stops drawing', async () => {
      await until('!labTest.scene.rendering');
      const before = await evaluate(() => labTest.scene.camera.position.distanceTo(labTest.scene.controls.target));
      const early = await evaluate(async () => {
        lab$('[data-lab-explode-to="100"]').click();
        await new Promise(resolve => setTimeout(resolve, 180));
        const scene = labTest.scene, groups = scene.groups;
        const moved = id => groups.get(id).position.length();
        return { shown: scene.explodeShown, rendering: scene.rendering, strings: moved('strings'), back: moved('back'), body: moved('body') };
      });
      assert.ok(early.shown > 0 && early.shown < 1, `animates: ${early.shown}`); assert.equal(early.rendering, true);
      assert.ok(early.strings > early.back, 'the strings come off before the back'); assert.equal(early.body, 0);
      await until('!labTest.scene.rendering && labTest.scene.explodeShown === 1');
      const apart = await evaluate(async () => {
        const scene = labTest.scene, frame = scene.renderer.info.render.frame;
        await new Promise(resolve => setTimeout(resolve, 400));
        const tags = [...labTestRoot.querySelectorAll('.gl-tag')].filter(tag => !tag.hidden).map(tag => tag.textContent);
        return { idle: scene.renderer.info.render.frame - frame, distance: scene.camera.position.distanceTo(scene.controls.target), tags,
          stage: lab$('[data-lab-stage-label]').textContent, disabled: lab$('[data-lab-explode-to="100"]').disabled };
      });
      assert.equal(apart.idle, 0, 'no frames are drawn while nothing moves');
      assert.ok(apart.distance > before * 1.15, `camera pulls back: ${before.toFixed(2)} -> ${apart.distance.toFixed(2)}`);
      assert.ok(apart.tags.length >= 9 && apart.tags.includes('Soundboard & rosette') && apart.tags.includes('Back'), JSON.stringify(apart.tags));
      assert.equal(apart.stage, 'Fully apart'); assert.equal(apart.disabled, true);
      await evaluate(() => lab$('[data-lab-part="saddle"]').click());
      await frames();
      const after = await evaluate(() => [...labTestRoot.querySelectorAll('.gl-tag')].filter(tag => !tag.hidden).map(tag => [tag.textContent, tag.dataset.selected, tag.dataset.dim]));
      assert.deepEqual(after.find(([name]) => name === 'Bridge, saddle & pins'), ['Bridge, saddle & pins', 'true', 'false']);
      assert.ok(after.filter(([, , dim]) => dim === 'true').length >= 8);
      await screenshot('guitar-lab-desktop');
      await evaluate(() => { lab$('[data-lab-clear]').click(); labSlide(0); });
      await until('!labTest.scene.rendering && labTest.scene.explodeShown === 0');
      assert.ok(await evaluate(() => [...labTestRoot.querySelectorAll('.gl-tag')].every(tag => tag.hidden)), 'tags hide when assembled');
      const overlaps = [];
      for (const [kind, value] of [['steel', 45], ['steel', 100], ['classical', 100], ['electric', 60], ['electric', 100]]) {
        await evaluate(`(() => { labModel('${kind}'); labSlide(${value}); })()`);
        await until('!labTest.scene.rendering');
        overlaps.push(...await evaluate(`(() => {
          const tags = [...labTestRoot.querySelectorAll('.gl-tag')].filter(tag => !tag.hidden).map(tag => ({ name: tag.textContent, r: tag.getBoundingClientRect() }));
          const found = [];
          for (let i = 0; i < tags.length; i++) for (let j = i + 1; j < tags.length; j++) {
            const a = tags[i].r, b = tags[j].r;
            if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) found.push('${kind} ${value}%: ' + tags[i].name + ' / ' + tags[j].name);
          }
          return found;
        })()`));
      }
      assert.deepEqual(overlaps, [], 'exploded-view name tags never cover each other');
      await evaluate(() => { for (const kind of ['electric', 'classical', 'steel']) { labModel(kind); labSlide(0); } });
      await until('!labTest.scene.rendering');
    });

    await check('the model is clickable and hoverable; camera views, buttons and the turntable work', async () => {
      const point = await evaluate(() => {
        const scene = labTest.scene, bounds = scene.renderer.domElement.getBoundingClientRect();
        for (let y = .2; y <= .9; y += .03) for (let x = .2; x <= .8; x += .03) {
          const clientX = bounds.left + bounds.width * x, clientY = bounds.top + bounds.height * y, part = scene.partAt(clientX, clientY);
          if (part) return { x: clientX, y: clientY, part };
        }
        return null;
      });
      assert.ok(point, 'a part is under the stage centre');
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: point.x, y: point.y });
      await frames();
      const hover = await evaluate(`({ tip: lab$('.gl-hover').hidden ? null : lab$('.gl-hover').textContent, row: !!lab$('[data-lab-part="${point.part}"][data-hover]'), cursor: lab$('canvas').style.cursor })`);
      assert.ok(hover.tip && hover.tip.length > 4, JSON.stringify(hover)); assert.equal(hover.row, true); assert.equal(hover.cursor, 'pointer');
      for (const type of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x: point.x, y: point.y, button: 'left', clickCount: 1 });
      assert.equal(await evaluate(() => labTest.state.selected), point.part);
      const corner = await evaluate(() => { const r = lab$('canvas').getBoundingClientRect(); return { x: r.left + 6, y: r.top + 40 }; });
      for (const type of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x: corner.x, y: corner.y, button: 'left', clickCount: 1 });
      assert.equal(await evaluate(() => labTest.state.selected), null, 'clicking empty space shows all parts');
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: corner.x, y: corner.y });
      const camera = await evaluate(async () => {
        const scene = labTest.scene, select = lab$('[data-lab-camera-view]'), positions = {};
        for (const view of ['headstock', 'back', 'side', 'bridge', 'three-quarter']) {
          select.value = view; select.dispatchEvent(new Event('change', { bubbles: true }));
          await new Promise(resolve => setTimeout(resolve, 760));
          positions[view] = { camera: scene.camera.position.toArray(), target: scene.controls.target.toArray(), current: scene.cameraView };
        }
        const start = scene.camera.position.clone();
        for (const action of ['left', 'right', 'in', 'out']) lab$(`[data-lab-camera="${action}"]`).click();
        const returned = scene.camera.position.distanceTo(start);
        lab$('[data-lab-turntable]').click();
        await new Promise(resolve => setTimeout(resolve, 300));
        const spinning = { pressed: lab$('[data-lab-turntable]').getAttribute('aria-pressed'), rendering: scene.rendering, moved: scene.camera.position.distanceTo(start) };
        lab$('[data-lab-camera="reset"]').click();
        await new Promise(resolve => setTimeout(resolve, 760));
        return { positions, returned, spinning, reset: { pressed: lab$('[data-lab-turntable]').getAttribute('aria-pressed'), view: select.value, distance: scene.camera.position.distanceTo(start) } };
      });
      const distance = (a, b) => Math.hypot(...a.map((value, i) => value - b[i]));
      assert.equal(camera.positions.headstock.current, 'headstock');
      assert.ok(distance(camera.positions.headstock.target, camera.positions.bridge.target) > 4, 'close-ups aim at different parts');
      assert.ok(distance(camera.positions.back.camera, camera.positions['three-quarter'].camera) > 10, 'the back view moves around the guitar');
      assert.ok(camera.returned < 1e-6, 'rotate/zoom out and back return exactly');
      assert.deepEqual(camera.spinning.pressed, 'true'); assert.equal(camera.spinning.rendering, true); assert.ok(camera.spinning.moved > .05);
      assert.equal(camera.reset.pressed, 'false'); assert.equal(camera.reset.view, 'three-quarter'); assert.ok(camera.reset.distance < .5);
    });

    await check('a close-up steps back out when the parts move, and context loss keeps state in the diagram', async () => {
      const result = await evaluate(async () => {
        const select = lab$('[data-lab-camera-view]');
        select.value = 'headstock'; select.dispatchEvent(new Event('change', { bubbles: true }));
        await new Promise(resolve => setTimeout(resolve, 700));
        lab$('[data-lab-part="frets"]').click(); labSlide(35);
        return { view: labTest.scene.cameraView, select: select.value };
      });
      assert.deepEqual(result, { view: 'three-quarter', select: 'three-quarter' });
      await evaluate(() => labTestRoot.querySelector('canvas').dispatchEvent(new Event('webglcontextlost', { cancelable: true })));
      await until('lab$("[data-lab-view=\\"2d\\"]").getAttribute("aria-pressed") === "true"');
      const fallback = await evaluate(() => ({ canvas: labTestRoot.querySelectorAll('canvas').length, diagram: !lab$('[data-lab-diagram]').hidden,
        status: lab$('[data-lab-status]').textContent, selected: lab$('svg [data-lab-pick="frets"]').dataset.selected, explode: lab$('[data-lab-explode]').value,
        camera: lab$('.gl-camera').hidden }));
      assert.deepEqual({ ...fallback, status: undefined }, { canvas: 0, diagram: true, status: undefined, selected: 'true', explode: '35', camera: true });
      assert.match(fallback.status, /3D is unavailable/);
      await evaluate(() => { lab$('[data-lab-clear]').click(); labSlide(0); });
    });

    await check('closing, navigating, stopping and changing instruments cancel pending private audio', async () => {
      for (const action of ['stop', 'model', 'close', 'navigation']) {
        await evaluate(() => { labTest.setActive(true); labTestRoot.open = true; lab$('.gl-stage').scrollIntoView({ block: 'center' }); window.labTestReleaseAudio = null; });
        await frames();
        await evaluate(() => lab$('[data-lab-audio="hear"]').click());
        await until('typeof labTestReleaseAudio === "function"');
        await evaluate(`(() => {
          const action = ${JSON.stringify(action)};
          if (action === 'stop') lab$('[data-lab-audio="stop"]').click();
          if (action === 'model') labModel(lab$('[data-lab-model]').value === 'steel' ? 'classical' : 'steel');
          if (action === 'close') labTestRoot.open = false;
          if (action === 'navigation') labTest.setActive(false);
        })()`);
        await evaluate(() => new Promise(resolve => setTimeout(resolve, 30)));
        const result = await evaluate(async () => {
          // A cancelled getAudio result must not be used, even when it is unusable.
          labTestReleaseAudio(null);
          await new Promise(resolve => setTimeout(resolve, 20));
          return { stopped: lab$('[data-lab-audio="stop"]').disabled, ready: !lab$('[data-lab-audio="hear"]').disabled, text: lab$('[data-lab-audio-status]').textContent };
        });
        assert.equal(result.stopped, true, action); assert.equal(result.ready, true, action); assert.match(result.text, /Preview stopped/, action);
      }
      assert.deepEqual(await evaluate(() => ({ canvas: labTestRoot.querySelectorAll('canvas').length, scene: labTest.scene })), { canvas: 0, scene: null },
        'leaving Live Studio releases the WebGL scene');
    });

    await check('reduced motion starts in 2D; 3D then jumps without animation; the 320px lab fits and works by keyboard', async () => {
      await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
      await send('Emulation.setDeviceMetricsOverride', { width: 320, height: 850, deviceScaleFactor: 1, mobile: true });
      await evaluate(() => labTest.dispose());
      await mount(false);
      await evaluate(() => { labTestRoot.open = true; labTestRoot.scrollIntoView({ block: 'start' }); });
      await frames();
      const layout = await evaluate(() => {
        const rootBounds = labTestRoot.getBoundingClientRect();
        return {
          diagram: lab$('[data-lab-view="2d"]').getAttribute('aria-pressed'), canvas: labTestRoot.querySelectorAll('canvas').length,
          overflow: [...labTestRoot.querySelectorAll('button, select, input, .gl-stage')].filter(el => {
            const r = el.getBoundingClientRect();
            return r.width && (r.left < rootBounds.left - 1 || r.right > rootBounds.right + 1);
          }).map(el => el.textContent || el.className),
          page: document.documentElement.scrollWidth > innerWidth + 1, ids: labTestRoot.querySelectorAll('[id]').length,
          list: getComputedStyle(lab$('[data-lab-parts]')).overflowY,
        };
      });
      assert.deepEqual(layout, { diagram: 'true', canvas: 0, overflow: [], page: false, ids: 0, list: 'visible' });
      await screenshot('guitar-lab-mobile');
      assert.equal(await evaluate(() => { const button = lab$('[data-lab-part="strings"]'); button.focus(); return document.activeElement === button; }), true);
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', text: '\r', windowsVirtualKeyCode: 13 });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
      assert.equal(await evaluate(() => lab$('[data-lab-part="strings"]').getAttribute('aria-pressed')), 'true');
      await evaluate(() => { lab$('[data-lab-view="3d"]').click(); lab$('.gl-stage').scrollIntoView({ block: 'center' }); });
      await until('!!labTestRoot.querySelector("canvas")');
      const reduced = await evaluate(() => { lab$('[data-lab-explode-to="100"]').click();
        return { shown: labTest.scene.explodeShown, turntable: lab$('[data-lab-turntable]').disabled, turntableText: lab$('[data-lab-turntable]').textContent }; });
      assert.deepEqual(reduced, { shown: 1, turntable: true, turntableText: 'Turntable (reduced motion)' });
      await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
      await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
    });

    await check('disposing removes only the lab and leaves no owned canvas', async () => {
      assert.deepEqual(await evaluate(() => {
        labTest.dispose(); labTest.dispose();
        return { labs: labTestHost.querySelectorAll('[data-guitar-lab]').length, canvas: labTestHost.querySelectorAll('canvas').length };
      }), { labs: 0, canvas: 0 });
    });
  } finally {
    await evaluate(() => {
      window.labTest?.dispose();
      window.labTestHost?.remove();
      for (const key of ['labTest', 'labTestClass', 'labTestHost', 'labTestRoot', 'lab$', 'labSlide', 'labModel', 'labPartNames', 'labMeshes', 'labTestReleaseAudio', 'labTestAudioRequests']) delete window[key];
    });
  }
}
