import assert from 'node:assert/strict';

/**
 * Optional CDP suite for the existing browser-smoke helper contract.
 * Mounts its own disposable lab; does not depend on app globals or alter settings.
 * Import checkGuitarLab and call it with { check, evaluate, send, until, screenshot }.
 */
export async function checkGuitarLab({ check, evaluate, send, until, screenshot = async () => {} }) {
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
  await evaluate(async () => {
    const { GuitarLab } = await import('/src/ui/guitarLab.ts');
    window.labTestClass = GuitarLab;
    window.labTestHost = document.createElement('section');
    labTestHost.style.cssText = 'max-width:1120px;margin:24px auto;';
    document.body.append(labTestHost);
    window.labTestAudioRequests = 0;
    window.labTest = new GuitarLab(labTestHost, () => {
      labTestAudioRequests++;
      return new Promise(resolve => { window.labTestReleaseAudio = resolve; });
    });
    window.labTestRoot = labTestHost.querySelector('[data-guitar-lab]');
    window.labTestButton = selector => labTestRoot.querySelector(selector);
  });
  try {
    await check('Guitar Lab is optional, closed by default and silent before an explicit action', async () => {
      assert.deepEqual(await evaluate(() => ({
        open: labTestRoot.open, canvas: labTestRoot.querySelectorAll('canvas').length,
        audio: labTestAudioRequests, ids: labTestRoot.querySelectorAll('[id]').length,
      })), { open: false, canvas: 0, audio: 0, ids: 0 });
      await evaluate(() => {
        labTestButton('[data-lab-view="2d"]').click();
        labTestRoot.open = true;
        labTestRoot.scrollIntoView({ block: 'start' });
      });
      await until('labTestRoot.open && !!labTestRoot.querySelector("svg")');
    });

    await check('diagram part selection, grouped detach and reassembly report meaningful progress', async () => {
      const result = await evaluate(() => {
        labTestButton('[data-lab-part="soundhole"]').click();
        const selected = labTestButton('[data-lab-part-name]').textContent;
        labTestButton('[data-lab-action="part"]').click();
        const detached = labTestButton('[data-lab-progress]').value;
        const state = labTestButton('[data-lab-part-state]').textContent;
        labTestButton('[data-lab-action="explode"]').click();
        const exploded = labTestButton('[data-lab-progress]').value;
        labTestButton('[data-lab-action="part"]').click();
        const attached = labTestButton('[data-lab-progress]').value;
        labTestButton('[data-lab-action="reassemble"]').click();
        return { selected, detached, state, exploded, attached,
          total: labTestButton('[data-lab-progress]').max,
          final: labTestButton('[data-lab-progress]').value,
          explosion: labTestButton('[data-lab-action="explode"]').getAttribute('aria-pressed') };
      });
      assert.equal(result.selected, 'Soundhole & rosette');
      assert.equal(result.state, 'Detached');
      assert.equal(result.detached, result.total - 3);
      assert.equal(result.exploded, result.detached);
      assert.equal(result.attached, result.total - 2);
      assert.equal(result.final, result.total);
      assert.equal(result.explosion, 'false');
    });

    await check('all three models expose their correct parts and preserve independent assembly states', async () => {
      const result = await evaluate(() => {
        const select = labTestButton('[data-lab-model]');
        const setModel = value => { select.value = value; select.dispatchEvent(new Event('change', { bubbles: true })); };
        labTestButton('[data-lab-part="neck"]').click();
        labTestButton('[data-lab-action="part"]').click();
        const steel = labTestButton('[data-lab-progress]').value;
        setModel('classical');
        const classical = [...labTestRoot.querySelectorAll('[data-lab-part]')].map(b => b.textContent);
        setModel('electric');
        const electric = [...labTestRoot.querySelectorAll('[data-lab-part]')].map(b => b.textContent);
        labTestButton('[data-lab-action="detach-all"]').click();
        const electricDetached = labTestButton('[data-lab-progress]').value;
        setModel('steel');
        return { steel, restored: labTestButton('[data-lab-progress]').value, classical, electric, electricDetached };
      });
      assert.equal(result.steel, result.restored);
      assert.equal(result.electricDetached, 1);
      assert.ok(result.classical.includes('Slotted headstock') && result.classical.includes('Tie-block bridge'));
      assert.ok(result.electric.includes('Magnetic pickups') && !result.electric.includes('Soundhole & rosette'));
    });

    await check('3D is lazy, model/view switching preserves state and context loss returns to the diagram', async () => {
      await evaluate(() => {
        labTestButton('[data-lab-action="reassemble"]').click();
        labTestButton('[data-lab-part="bridge"]').click();
        labTestButton('[data-lab-action="part"]').click();
        labTestButton('[data-lab-view="3d"]').click();
        labTestButton('.gl-stage').scrollIntoView({ block: 'center' });
      });
      await until('!!labTestRoot.querySelector("canvas") || labTestButton("[data-lab-view=\\"2d\\"]").getAttribute("aria-pressed") === "true"');
      const hasWebGL = await evaluate(() => !!labTestRoot.querySelector('canvas'));
      if (hasWebGL) {
        await evaluate(() => {
          for (const action of ['left', 'right', 'in', 'out', 'reset']) labTestButton(`[data-lab-camera="${action}"]`).click();
        });
        const views = await evaluate(async () => {
          const frame = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          const scene = labTest.scene, select = labTestButton('[data-lab-camera-view]'), positions = {};
          for (const view of ['headstock', 'back', 'side', 'bridge', 'three-quarter']) {
            select.value = view; select.dispatchEvent(new Event('change', { bubbles: true }));
            await new Promise(resolve => setTimeout(resolve, 760)); await frame();
            positions[view] = { camera: scene.camera.position.toArray(), target: scene.controls.target.toArray(), current: scene.cameraView };
          }
          const tagsBefore = [...labTestRoot.querySelectorAll('.gl-tag')].filter(tag => !tag.hidden).length;
          labTestButton('[data-lab-action="explode"]').click();
          await new Promise(resolve => setTimeout(resolve, 760)); await frame();
          const tags = [...labTestRoot.querySelectorAll('.gl-tag')].filter(tag => !tag.hidden).map(tag => tag.textContent);
          const selectedTag = labTestRoot.querySelector('.gl-tag[data-selected="true"]')?.textContent;
          labTestButton('[data-lab-action="explode"]').click();
          await new Promise(resolve => setTimeout(resolve, 760)); await frame();
          const tagsAfter = [...labTestRoot.querySelectorAll('.gl-tag')].filter(tag => !tag.hidden).length;
          const canvas = labTestRoot.querySelector('canvas'), bounds = canvas.getBoundingClientRect();
          let hover = null;
          for (let y = .3; y <= .8 && !hover; y += .05) for (let x = .3; x <= .7 && !hover; x += .05) {
            canvas.dispatchEvent(new PointerEvent('pointermove', { pointerType: 'mouse', clientX: bounds.left + bounds.width * x, clientY: bounds.top + bounds.height * y, bubbles: true }));
            await frame();
            const tip = labTestRoot.querySelector('.gl-hover');
            if (!tip.hidden) hover = { text: tip.textContent, cursor: canvas.style.cursor };
          }
          canvas.dispatchEvent(new PointerEvent('pointerleave', { pointerType: 'mouse' }));
          await frame();
          return { positions, tagsBefore, tags, selectedTag, tagsAfter, hover, tipHidden: labTestRoot.querySelector('.gl-hover').hidden,
            pose: scene.root.rotation.z, aspect: scene.camera.aspect };
        });
        const distance = (a, b) => Math.hypot(...a.map((value, i) => value - b[i]));
        assert.equal(views.positions.headstock.current, 'headstock');
        assert.ok(distance(views.positions.headstock.target, views.positions.bridge.target) > 4, 'close-ups aim at different parts');
        assert.ok(distance(views.positions.back.camera, views.positions['three-quarter'].camera) > 10, 'back view moves around the guitar');
        assert.ok(distance(views.positions.headstock.camera, views.positions.headstock.target) < 8);
        assert.ok(views.tagsBefore >= 2, 'detached groups and the anchor body are named'); assert.equal(views.tagsAfter, views.tagsBefore);
        assert.ok(views.tags.length >= 8 && views.tags.includes('Neck & headstock'), JSON.stringify(views.tags));
        assert.equal(views.selectedTag, 'Bridge & saddle');
        assert.ok(views.hover && views.hover.text.length > 2 && views.hover.cursor === 'pointer', JSON.stringify(views.hover));
        assert.equal(views.tipHidden, true);
        assert.equal(views.pose, views.aspect >= 1.2 ? -.92 : -.18);
        await screenshot('guitar-lab-desktop');
        await evaluate(() => labTestRoot.querySelector('canvas').dispatchEvent(new Event('webglcontextlost', { cancelable: true })));
        await until('labTestButton("[data-lab-view=\\"2d\\"]").getAttribute("aria-pressed") === "true"');
      }
      const result = await evaluate(() => ({
        state: labTestButton('[data-lab-part-state]').textContent,
        canvas: labTestRoot.querySelectorAll('canvas').length,
        fallback: !labTestButton('[data-lab-diagram]').hidden,
        status: labTestButton('[data-lab-status]').textContent,
      }));
      assert.equal(result.state, 'Detached');
      assert.equal(result.canvas, 0);
      assert.equal(result.fallback, true);
      assert.match(result.status, /3D is unavailable/);
    });

    await check('closing, navigating, stopping and changing instruments cancel pending private audio', async () => {
      for (const action of ['stop', 'model', 'close', 'navigation']) {
        await evaluate(() => {
          labTest.setActive(true);
          labTestRoot.open = true;
          labTestButton('.gl-stage').scrollIntoView({ block: 'center' });
          window.labTestReleaseAudio = null;
        });
        await evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        await evaluate(() => labTestButton('[data-lab-audio="hear"]').click());
        await until('typeof labTestReleaseAudio === "function"');
        await evaluate(`(() => {
          const action = ${JSON.stringify(action)};
          if (action === 'stop') labTestButton('[data-lab-audio="stop"]').click();
          if (action === 'model') {
            const model = labTestButton('[data-lab-model]');
            model.value = model.value === 'steel' ? 'classical' : 'steel';
            model.dispatchEvent(new Event('change', { bubbles: true }));
          }
          if (action === 'close') labTestRoot.open = false;
          if (action === 'navigation') labTest.setActive(false);
        })()`);
        await evaluate(() => new Promise(resolve => setTimeout(resolve, 30)));
        const result = await evaluate(async () => {
          // A cancelled getAudio result must not be used, even when it is unusable.
          labTestReleaseAudio(null);
          await new Promise(resolve => setTimeout(resolve, 20));
          return {
            stopped: labTestButton('[data-lab-audio="stop"]').disabled,
            ready: !labTestButton('[data-lab-audio="hear"]').disabled,
            text: labTestButton('[data-lab-audio-status]').textContent,
          };
        });
        assert.equal(result.stopped, true, action);
        assert.equal(result.ready, true, action);
        assert.match(result.text, /Preview stopped/, action);
      }
    });

    await check('reduced motion defaults to 2D; the 320px lab has keyboard controls and no overflow', async () => {
      await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
      await send('Emulation.setDeviceMetricsOverride', { width: 320, height: 850, deviceScaleFactor: 1, mobile: true });
      await evaluate(() => {
        labTest.dispose();
        window.labTest = new labTestClass(labTestHost);
        window.labTestRoot = labTestHost.querySelector('[data-guitar-lab]');
        labTestRoot.open = true;
        labTestRoot.scrollIntoView({ block: 'start' });
      });
      await evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const result = await evaluate(() => {
        const rootBounds = labTestRoot.getBoundingClientRect();
        return {
          diagram: labTestButton('[data-lab-view="2d"]').getAttribute('aria-pressed'),
          animated: labTestButton('[data-lab-animate]').checked,
          animationDisabled: labTestButton('[data-lab-animate]').disabled,
          canvas: labTestRoot.querySelectorAll('canvas').length,
          overflow: [...labTestRoot.querySelectorAll('button, select, .gl-stage')].filter(el => {
            const r = el.getBoundingClientRect();
            return r.width && (r.left < rootBounds.left - 1 || r.right > rootBounds.right + 1);
          }).map(el => el.textContent),
          parts: labTestRoot.querySelectorAll('button[data-lab-part]').length,
          ids: labTestRoot.querySelectorAll('[id]').length,
        };
      });
      assert.equal(result.diagram, 'true');
      assert.equal(result.animated, false);
      assert.equal(result.animationDisabled, true);
      assert.equal(result.canvas, 0);
      assert.deepEqual(result.overflow, []);
      assert.ok(result.parts >= 12);
      assert.equal(result.ids, 0);
      await screenshot('guitar-lab-mobile');
      assert.equal(await evaluate(() => {
        const button = labTestButton('[data-lab-part="strings"]');
        button.focus();
        return document.activeElement === button;
      }), true, 'The strings button receives keyboard focus');
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', text: '\r', windowsVirtualKeyCode: 13 });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
      assert.equal(await evaluate(() => labTestButton('[data-lab-part="strings"]').getAttribute('aria-pressed')), 'true');
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
      for (const key of ['labTest', 'labTestClass', 'labTestHost', 'labTestRoot', 'labTestButton', 'labTestReleaseAudio', 'labTestAudioRequests']) delete window[key];
    });
    await send('Emulation.setEmulatedMedia', { features: [] });
    await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  }
}
