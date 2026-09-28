import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import {
  GUITAR_MODELS, GUITAR_OUTLINES, guitarAssemblyOffset, guitarFretY,
  type GuitarAssemblyId, type GuitarKind, type GuitarLabState, type GuitarLabView, type GuitarPartId,
} from '../theory/guitarAnatomy';

interface GuitarLab3DOptions {
  onPick: (part: GuitarPartId) => void;
  onUnavailable: () => void;
  reducedMotion: boolean;
}
type Wood = 'spruce' | 'cedar' | 'rosewood' | 'mahogany' | 'ebony' | 'maple';
type Finish = 'gloss' | 'satin' | 'oil';
interface CameraTween { from: THREE.Vector3; fromTarget: THREE.Vector3; to: THREE.Vector3; toTarget: THREE.Vector3; start: number }

const SELECTED = new THREE.Color('#c99552'), HOVERED = new THREE.Color('#8c7a58'), NONE = new THREE.Color('#000000');
/** Wide stages show a diagonal “hero” pose; narrow ones keep the guitar nearly upright. */
const WIDE_POSE = -.92, NARROW_POSE = -.18;
const VIEW_DIRECTIONS: Readonly<Record<Exclude<GuitarLabView, 'headstock' | 'bridge'>, readonly [number, number, number]>> = {
  'three-quarter': [.34, .14, 1], front: [0, .04, 1], back: [-.3, .1, -1], side: [1, .12, .04],
};

/** Original procedural full guitars. This module is imported only for an expanded 3D lab. */
export class GuitarLab3D {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(30, 1, .1, 150);
  private controls!: OrbitControls;
  private root = new THREE.Group();
  private groups = new Map<GuitarAssemblyId, THREE.Group>();
  private anchors = new Map<GuitarAssemblyId, THREE.Vector3>();
  private raycaster = new THREE.Raycaster();
  private resizeObserver!: ResizeObserver;
  private state: GuitarLabState;
  private active = true;
  private disposed = false;
  private frame = 0;
  private animationStart = 0;
  private tween: CameraTween | null = null;
  private starts = new Map<GuitarAssemblyId, THREE.Vector3>();
  private pointerStart: { x: number; y: number } | null = null;
  private hoverPoint: { x: number; y: number } | null = null;
  private hoverFrame = 0;
  private hovered: GuitarPartId | null = null;
  private initialized = false;
  private currentView: GuitarLabView = 'three-quarter';
  private abort = new AbortController();
  private textures = new Map<string, THREE.CanvasTexture>();
  private environment: THREE.WebGLRenderTarget | null = null;
  private stage: THREE.Mesh[] = [];
  private overlay = document.createElement('div');
  private tags = new Map<GuitarAssemblyId, HTMLSpanElement>();
  private tip = document.createElement('div');
  private collect: THREE.Mesh[] | null = null;

  constructor(private host: HTMLElement, state: GuitarLabState, private options: GuitarLab3DOptions) {
    this.state = state;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'low-power' });
    try {
      this.initialize(state);
    } catch (error) {
      this.dispose();
      throw error;
    }
  }

  private initialize(state: GuitarLabState): void {
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    // Neutral tone mapping keeps spruce, rosewood and paint colours true instead of shifting them orange.
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.02;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.makeStudio();
    this.scene.add(new THREE.HemisphereLight('#fff2de', '#232c27', .75));
    const key = new THREE.DirectionalLight('#fff1dc', 2.5);
    key.position.set(-6, 10, 9);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    Object.assign(key.shadow.camera, { left: -10, right: 10, top: 12, bottom: -10, near: .5, far: 45 });
    key.shadow.normalBias = .035;
    key.shadow.bias = -.0001;
    key.shadow.radius = 3;
    const rim = new THREE.DirectionalLight('#c9dcec', 1.7);
    rim.position.set(7, 6, -5);
    const fill = new THREE.DirectionalLight('#ffe9d2', .45);
    fill.position.set(5, -2, 8);
    this.scene.add(key, rim, fill);
    this.scene.add(this.root);
    const canvas = this.renderer.domElement;
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', 'Interactive full guitar. Use the named part buttons to explore with a keyboard.');
    this.overlay.className = 'gl-tags';
    this.overlay.setAttribute('aria-hidden', 'true');
    this.tip.className = 'gl-hover';
    this.tip.setAttribute('aria-hidden', 'true');
    this.tip.hidden = true;
    this.host.append(canvas, this.overlay, this.tip);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = false;
    this.controls.enablePan = false;
    this.controls.minDistance = 3.2;
    this.controls.maxDistance = 70;
    this.controls.maxPolarAngle = Math.PI * .9;
    this.controls.minPolarAngle = Math.PI * .1;
    this.controls.addEventListener('change', this.requestRender);
    this.controls.addEventListener('start', () => { this.tween = null; });
    const signal = this.abort.signal;
    canvas.addEventListener('pointerdown', e => { this.pointerStart = { x: e.clientX, y: e.clientY }; this.setHover(null); }, { signal });
    canvas.addEventListener('pointerup', this.pick, { signal });
    canvas.addEventListener('pointercancel', () => { this.pointerStart = null; }, { signal });
    canvas.addEventListener('pointermove', event => {
      if (event.pointerType !== 'mouse' || event.buttons) return;
      this.hoverPoint = { x: event.clientX, y: event.clientY };
      if (!this.hoverFrame) this.hoverFrame = requestAnimationFrame(this.updateHover);
    }, { signal });
    canvas.addEventListener('pointerleave', () => { this.hoverPoint = null; this.setHover(null); }, { signal });
    canvas.addEventListener('webglcontextlost', event => {
      event.preventDefault();
      if (!this.disposed) { this.setActive(false); this.options.onUnavailable(); }
    }, { signal });
    this.resizeObserver = new ResizeObserver(this.resize);
    this.resizeObserver.observe(this.host);
    this.build(state.kind);
    this.resize();
    this.update(state, false);
  }

  private canvasTexture(key: string, width: number, height: number, paint: (ctx: CanvasRenderingContext2D) => void, color = true): THREE.CanvasTexture {
    const cached = this.textures.get(key);
    if (cached) return cached;
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    paint(canvas.getContext('2d')!);
    const texture = new THREE.CanvasTexture(canvas);
    if (color) texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    this.textures.set(key, texture);
    return texture;
  }

  private makeStudio(): void {
    // A dark studio sweep with a warm pool of light behind the instrument.
    this.scene.background = this.canvasTexture('backdrop', 512, 512, ctx => {
      const glow = ctx.createRadialGradient(256, 210, 20, 256, 256, 420);
      glow.addColorStop(0, '#39443d'); glow.addColorStop(.45, '#232b26'); glow.addColorStop(1, '#101412');
      ctx.fillStyle = glow; ctx.fillRect(0, 0, 512, 512);
      const image = ctx.getImageData(0, 0, 512, 512);
      let seed = 911;
      for (let i = 0; i < image.data.length; i += 4) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        const dither = (seed / 4294967296 - .5) * 3;
        image.data[i] += dither; image.data[i + 1] += dither; image.data[i + 2] += dither;
      }
      ctx.putImageData(image, 0, 0);
    });
    const room = new THREE.Scene();
    room.add(new THREE.Mesh(new THREE.SphereGeometry(40, 32, 16), new THREE.MeshBasicMaterial({ color: '#1c231f', side: THREE.BackSide })));
    const panel = (x: number, y: number, z: number, w: number, h: number, intensity: number, color: string) => {
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), side: THREE.DoubleSide }));
      mesh.position.set(x, y, z); mesh.lookAt(0, 0, 0); room.add(mesh);
    };
    panel(-8, 9, 9, 10, 5, 5.2, '#fff3e3');
    panel(10, 3, 4, 1.8, 13, 3.4, '#edf3ff');
    panel(-10, 2, -7, 1.8, 13, 2.3, '#e7eefc');
    panel(0, 15, 0, 14, 7, 1.1, '#ffffff');
    // A low front bounce card gives lacquered tops and chrome a soft sheen from the default angle.
    panel(-5, -3, 11, 9, 6, 1.5, '#fff5e8');
    panel(0, -10, 4, 22, 16, .35, '#8a6a47');
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.environment = pmrem.fromScene(room, .035);
    this.scene.environment = this.environment.texture;
    this.scene.environmentIntensity = .85;
    room.traverse(object => {
      if (object instanceof THREE.Mesh) { object.geometry.dispose(); (object.material as THREE.Material).dispose(); }
    });
    pmrem.dispose();
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(90, 90), new THREE.ShadowMaterial({ opacity: .2 }));
    floor.rotation.x = -Math.PI / 2; floor.position.y = -4.9; floor.receiveShadow = true;
    const contact = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({
      transparent: true, depthWrite: false, opacity: .5,
      map: this.canvasTexture('contact', 128, 128, ctx => {
        const shade = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
        shade.addColorStop(0, 'rgba(0,0,0,.75)'); shade.addColorStop(.55, 'rgba(0,0,0,.28)'); shade.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = shade; ctx.fillRect(0, 0, 128, 128);
      }),
    }));
    contact.rotation.x = -Math.PI / 2; contact.position.y = -4.88; contact.renderOrder = -1;
    this.stage = [floor, contact];
    this.scene.add(floor, contact);
  }

  private woodTexture(kind: Wood): THREE.CanvasTexture {
    return this.canvasTexture(`wood:${kind}`, 512, 1024, ctx => {
      const image = ctx.createImageData(512, 1024);
      const colors: Record<Wood, number[]> = { spruce: [190, 158, 104], cedar: [160, 106, 64], rosewood: [66, 36, 24], mahogany: [124, 70, 38], ebony: [36, 26, 21], maple: [198, 154, 92] };
      const base = colors[kind], light = kind === 'spruce' || kind === 'cedar';
      let seed = 18723;
      const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
      const fibers = Array.from({ length: 512 }, () => random());
      for (let y = 0; y < 1024; y++) for (let x = 0; x < 512; x++) {
        const warp = light ? Math.sin(y / 250) * .8 : Math.sin(y / 90 + x / 70) * 4 + Math.sin(y / 350) * 12;
        const xx = (Math.floor(x + warp) + 1024) % 512;
        const annual = Math.sin((xx + Math.sin(xx / 43) * 4) * (light ? .48 : .14));
        const grain = (fibers[xx] - .5) * (light ? 13 : 23) + annual * (light ? 3 : 8);
        const pore = (random() - .5) * 3;
        const ray = light ? Math.sin(y * .71 + x * .08) * Math.sin(x * .018) * 1.8 : 0;
        // Maple necks carry a soft flame across the grain.
        const flame = kind === 'maple' ? Math.sin(y * .09 + Math.sin(x * .05) * 2) * 6 : 0;
        const i = (y * 512 + x) * 4;
        image.data[i] = base[0] + grain + pore + ray + flame;
        image.data[i + 1] = base[1] + grain * .8 + pore + ray + flame * .8;
        image.data[i + 2] = base[2] + grain * .56 + pore + ray + flame * .5;
        image.data[i + 3] = 255;
      }
      ctx.putImageData(image, 0, 0);
    });
  }

  private tortoiseTexture(): THREE.CanvasTexture {
    const texture = this.canvasTexture('tortoise', 256, 256, ctx => {
      ctx.fillStyle = '#1b0d07'; ctx.fillRect(0, 0, 256, 256);
      let seed = 4242;
      const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
      for (let i = 0; i < 140; i++) {
        const x = random() * 256, y = random() * 256, r = 7 + random() * 30, amber = random() > .42;
        const color = amber ? `rgba(${104 + random() * 40},${46 + random() * 24},${14 + random() * 10},.6)` : 'rgba(6,2,1,.7)';
        const squash = .3 + random() * .35, angle = .5 + (random() - .5) * .8;
        // Blobs are also drawn across the tile edges so the repeated texture has no seams.
        for (const dx of [-256, 0, 256]) for (const dy of [-256, 0, 256]) {
          const cx = x + dx, cy = y + dy;
          if (cx + r < 0 || cx - r > 256 || cy + r < 0 || cy - r > 256) continue;
          ctx.save(); ctx.translate(cx, cy); ctx.rotate(angle); ctx.scale(1, squash);
          const blob = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
          blob.addColorStop(0, color); blob.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = blob;
          ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
          ctx.restore();
        }
      }
    });
    // The guard's UVs span about a fifth of the texture, so repeat it to keep the mottling at a realistic scale.
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(4, 4);
    return texture;
  }

  private wood(kind: Wood, finish: Finish = 'satin'): THREE.MeshPhysicalMaterial {
    return new THREE.MeshPhysicalMaterial({
      color: '#ffffff', map: this.woodTexture(kind),
      roughness: finish === 'gloss' ? .4 : finish === 'satin' ? .55 : .72,
      clearcoat: finish === 'gloss' ? 1 : finish === 'satin' ? .25 : 0,
      clearcoatRoughness: finish === 'gloss' ? .05 : .38, envMapIntensity: .95,
    });
  }

  private material(color: string, metal = 0, roughness = .55): THREE.MeshPhysicalMaterial {
    return new THREE.MeshPhysicalMaterial({ color, metalness: metal, roughness, clearcoat: metal ? 0 : .2,
      clearcoatRoughness: .3, envMapIntensity: metal ? 1.45 : .75 });
  }

  private add(assembly: GuitarAssemblyId, part: GuitarPartId, geometry: THREE.BufferGeometry,
    material: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.userData.part = part;
    mesh.castShadow = part !== 'strings' && part !== 'frets';
    mesh.receiveShadow = true;
    this.groups.get(assembly)!.add(mesh);
    this.collect?.push(mesh);
    return mesh;
  }

  private box(assembly: GuitarAssemblyId, part: GuitarPartId, w: number, h: number, d: number,
    x: number, y: number, z: number, color: string, metal = 0, rounding = .18): THREE.Mesh {
    return this.add(assembly, part, new RoundedBoxGeometry(w, h, d, 3, Math.min(w, h, d) * rounding), this.material(color, metal, metal ? .2 : .46), x, y, z);
  }

  private rod(assembly: GuitarAssemblyId, part: GuitarPartId, from: THREE.Vector3, to: THREE.Vector3,
    radius: number, color: string, metal = .7, roughness = .28): THREE.Mesh {
    const delta = to.clone().sub(from);
    const mesh = this.add(assembly, part, new THREE.CylinderGeometry(radius, radius, delta.length(), 12),
      this.material(color, metal, roughness));
    mesh.position.copy(from).add(to).multiplyScalar(.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize());
    return mesh;
  }

  private outline(kind: GuitarKind, scale = 1): THREE.Shape {
    const shape = new THREE.Shape();
    shape.moveTo(0, 1.5 * scale);
    for (const c of GUITAR_OUTLINES[kind]) shape.bezierCurveTo(c[0] * scale, c[1] * scale,
      c[2] * scale, c[3] * scale, c[4] * scale, c[5] * scale);
    shape.closePath();
    return shape;
  }

  private extrude(assembly: GuitarAssemblyId, part: GuitarPartId, shape: THREE.Shape, depth: number,
    z: number, color: string, bevel = .035, metal = 0, bevelSegments = 6): THREE.Mesh {
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments, steps: 1, curveSegments: 64,
    });
    const uv = geometry.getAttribute('uv'), position = geometry.getAttribute('position');
    for (let i = 0; i < uv.count; i++) uv.setXY(i, position.getX(i) * .21 + .5, position.getY(i) * .13 + .52);
    return this.add(assembly, part, geometry, this.material(color, metal, metal ? .26 : .4), 0, 0, z);
  }

  private finishWood(mesh: THREE.Mesh, kind: Wood, finish: Finish = 'satin'): THREE.Mesh {
    (mesh.material as THREE.Material).dispose(); mesh.material = this.wood(kind, finish);
    return mesh;
  }

  private screw(assembly: GuitarAssemblyId, part: GuitarPartId, x: number, y: number, z: number, radius = .033): void {
    const screw = this.add(assembly, part, new THREE.SphereGeometry(radius, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), this.material('#c6cbca', .9, .2), x, y, z - radius * .35);
    screw.rotation.x = Math.PI / 2; screw.scale.y = .45;
    this.box(assembly, part, radius * 1.3, .007, .008, x, y, z + radius * .12, '#2f3634');
  }

  private roundedNeck(widthAtNut: number, jointY: number, nutY: number): THREE.BufferGeometry {
    const vertices: number[] = [], uv: number[] = [], indices: number[] = [], rings = 24, segments = 36;
    for (let j = 0; j <= rings; j++) {
      const t = j / rings, y = jointY + t * (nutY - jointY), width = .43 * (1 - t) + widthAtNut / 2 * t;
      for (let i = 0; i <= segments; i++) {
        const angle = i / segments * Math.PI * 2;
        vertices.push(Math.cos(angle) * width, y, .56 - Math.max(0, Math.sin(angle)) * (.35 - t * .10));
        uv.push(i / segments, t * 1.5);
      }
    }
    for (let j = 0; j < rings; j++) for (let i = 0; i < segments; i++) {
      const a = j * (segments + 1) + i, b = a + segments + 1;
      indices.push(a, a + 1, b, b, a + 1, b + 1);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geometry.setIndex(indices); geometry.computeVertexNormals();
    return geometry;
  }

  private headShape(kind: GuitarKind, halfNut: number, nutY: number, topY: number): THREE.Shape {
    const head = new THREE.Shape();
    head.moveTo(-halfNut, nutY);
    if (kind === 'electric') {
      // Six-in-line outline: straight bass edge, rounded tip, scooped treble edge.
      head.bezierCurveTo(-.44, nutY + .12, -.53, nutY + .42, -.53, nutY + .95);
      head.bezierCurveTo(-.55, nutY + 1.42, -.56, topY - .06, -.33, topY);
      head.bezierCurveTo(-.1, topY + .06, .14, topY - .02, .21, topY - .23);
      head.bezierCurveTo(.28, topY - .46, .12, topY - .62, .14, topY - .82);
      head.bezierCurveTo(.16, nutY + .74, .42, nutY + .55, .35, nutY + .22);
      head.quadraticCurveTo(.31, nutY + .05, halfNut, nutY);
    } else if (kind === 'classical') {
      // Nearly parallel sides carry the tuner plates; a shallow crest finishes the top.
      head.quadraticCurveTo(-.43, nutY + .05, -.43, nutY + .3);
      head.lineTo(-.43, topY - .2);
      head.bezierCurveTo(-.4, topY + .02, -.18, topY + .1, 0, topY - .02);
      head.bezierCurveTo(.18, topY + .1, .4, topY + .02, .43, topY - .2);
      head.lineTo(.43, nutY + .3);
      head.quadraticCurveTo(.43, nutY + .05, halfNut, nutY);
    } else {
      head.bezierCurveTo(-.36, nutY + .5, -.48, nutY + 1.1, -.5, topY - .14);
      head.quadraticCurveTo(-.5, topY + .02, -.34, topY + .02);
      head.lineTo(.34, topY + .02);
      head.quadraticCurveTo(.5, topY + .02, .5, topY - .14);
      head.bezierCurveTo(.48, nutY + 1.1, .36, nutY + .5, halfNut, nutY);
    }
    head.closePath();
    return head;
  }

  private build(kind: GuitarKind): void {
    this.clearModel();
    const model = GUITAR_MODELS[kind], acoustic = kind !== 'electric', classical = kind === 'classical';
    for (const assembly of model.assemblies) {
      const group = new THREE.Group();
      this.groups.set(assembly.id, group);
      this.root.add(group);
    }
    const backZ = .5 - model.bodyDepth;
    if (acoustic) {
      this.finishWood(this.extrude('body', 'body', this.outline(kind), .065, backZ, '#65402c'), 'rosewood', 'gloss');
      const sides = this.outline(kind);
      sides.holes.push(this.outline(kind, .955));
      this.finishWood(this.extrude('body', 'body', sides, model.bodyDepth - .06, backZ + .04, '#875130', .025), 'rosewood', 'gloss');
      const backBinding = this.outline(kind, 1.005);
      backBinding.holes.push(this.outline(kind, .983));
      this.extrude('body', 'body', backBinding, .025, backZ - .012, '#d4c6a3', .005);
      this.box('body', 'body', .032, 5.44, .008, 0, -1.28, backZ - .045, '#c0ac7e');
      const top = this.outline(kind);
      const hole = new THREE.Path();
      hole.absarc(0, -.1, .61, 0, Math.PI * 2, true);
      top.holes.push(hole);
      this.finishWood(this.extrude('soundboard', 'soundboard', top, .065, .5, model.topColor, .012), classical ? 'cedar' : 'spruce', 'gloss');
      const binding = this.outline(kind, 1.007);
      binding.holes.push(this.outline(kind, .984));
      this.extrude('soundboard', 'soundboard', binding, .04, .52, '#efe3bd', .005);
      for (const scale of [.974, .964]) {
        const purfling = this.outline(kind, scale); purfling.holes.push(this.outline(kind, scale - .004));
        const trim = this.extrude('soundboard', 'soundboard', purfling, .002, .585, '#473527', 0);
        trim.castShadow = false; trim.receiveShadow = false;
      }
      for (const [inner, outer, color] of [[.615, .628, '#382718'], [.632, .652, '#d7bd89'], [.654, .667, '#362919'], [.677, .687, '#35291b'], [.7, .716, '#4f3824'], [.729, .742, '#382719'], [.744, .75, '#dac299']] as const) {
        const ring = this.add('soundboard', 'soundhole', new THREE.RingGeometry(inner, outer, 128), this.material(color), 0, -.1, .59);
        ring.castShadow = false; ring.receiveShadow = false;
      }
      if (classical) {
        for (let i = 0; i < 96; i++) {
          const a = i * Math.PI * 2 / 96;
          const tile = this.box('soundboard', 'soundhole', .024, .048, .004,
            Math.sin(a) * .7, -.1 + Math.cos(a) * .7, .594, i % 3 === 0 ? '#dcc592' : '#513b2b');
          tile.rotation.z = -a + Math.PI / 4;
          tile.castShadow = false; tile.receiveShadow = false;
        }
      } else {
        const guard = new THREE.Shape();
        guard.moveTo(.59, .24);
        guard.bezierCurveTo(1.06, .26, 1.5, -.44, 1.37, -1.32);
        guard.bezierCurveTo(1.31, -1.66, .74, -1.62, .46, -1.47);
        guard.bezierCurveTo(.87, -1, .96, -.27, .59, .24);
        const pickguard = this.extrude('soundboard', 'soundboard', guard, .015, .585, '#271f1b', .009);
        (pickguard.material as THREE.Material).dispose();
        pickguard.material = new THREE.MeshPhysicalMaterial({ color: '#ffffff', map: this.tortoiseTexture(), roughness: .32, clearcoat: .8, clearcoatRoughness: .08, envMapIntensity: .9 });
      }
      const innerBack = this.add('body', 'body', new THREE.CircleGeometry(.64, 64), this.wood('mahogany'), 0, -.1, backZ + .086);
      (innerBack.material as THREE.MeshPhysicalMaterial).color.set('#5b4f3b');
      this.box('body', 'body', .09, 5.2, .08, 0, -1.25, backZ + .12, '#6b5034');
      for (const y of [.7, -1.15, -3.1]) this.box('body', 'body', y === -3.1 ? 3.5 : 2.7, .09, .12, 0, y, backZ + .15, '#775738');
      // Bracing is deliberately schematic, not a manufacturer-specific building plan.
      if (classical) {
        for (let i = -2; i <= 2; i++) this.rod('soundboard', 'soundboard', new THREE.Vector3(i * .13, -.9, .43),
          new THREE.Vector3(i * .63, -3.4, .43), .04, '#b58958', 0);
      } else {
        for (const sign of [-1, 1]) this.rod('soundboard', 'soundboard', new THREE.Vector3(sign * 1.24, .52, .43),
          new THREE.Vector3(-sign * 1.6, -3.3, .43), .055, '#bd925a', 0);
      }
    } else {
      const paintedBody = this.extrude('body', 'body', this.outline(kind), model.bodyDepth, backZ, model.topColor, .14, 0, 10);
      const lacquer = paintedBody.material as THREE.MeshPhysicalMaterial;
      Object.assign(lacquer, { roughness: .34, clearcoat: 1, clearcoatRoughness: .04, envMapIntensity: .8 });
      const guard = new THREE.Shape();
      guard.moveTo(-.5, 1.1); guard.bezierCurveTo(-1.1, 1.1, -1.3, -.1, -1.05, -.8);
      guard.bezierCurveTo(-.9, -1.3, -.6, -1.65, .7, -1.7);
      guard.lineTo(.92, -.1); guard.lineTo(.52, 1.1); guard.closePath();
      // Three-ply guard: a dark middle layer shows at the bevelled edge.
      this.extrude('body', 'body', guard, .012, .635, '#1d1c1a', .026);
      this.extrude('body', 'body', guard, .016, .649, '#e8e2cc', .016);
      for (const [x, y] of [[-.6, .9], [-1.01, -.15], [-.91, -.79], [-.38, -1.38], [.59, -1.53], [.72, -.18]]) {
        this.screw('body', 'body', x, y, .684, .026);
      }
      this.box('body', 'body', .72, .92, .035, 0, .76, backZ - .16, '#b9c3c3', .9);
      for (const x of [-.26, .26]) for (const y of [.46, 1.08]) this.screw('body', 'body', x, y, backZ - .185, .035);
    }

    const halfNut = model.nutWidth / 2, jointY = classical ? 1.57 : 1.25;
    const neckWood: Wood = acoustic ? 'mahogany' : 'maple';
    this.add('neck', 'neck', this.roundedNeck(model.nutWidth, jointY, model.nutY), this.wood(neckWood, acoustic ? 'satin' : 'gloss'));
    const heel = this.add('neck', 'neck', new THREE.SphereGeometry(.39, 36, 24), this.wood(neckWood, 'satin'), 0, jointY + .12, .06);
    heel.scale.set(1, 1.5, acoustic ? 1.42 : .8);
    const topY = model.nutY + 1.82;
    // Acoustic headstocks tilt back behind the nut; this electric keeps a flat six-in-line headstock.
    const tiltAngle = kind === 'steel' ? -13 : classical ? -11 : 0;
    const tilt = new THREE.Matrix4().makeTranslation(0, model.nutY, .47)
      .multiply(new THREE.Matrix4().makeRotationX(THREE.MathUtils.degToRad(tiltAngle)))
      .multiply(new THREE.Matrix4().makeTranslation(0, -model.nutY, -.47));
    this.collect = [];
    const head = this.headShape(kind, halfNut, model.nutY, topY);
    if (classical) {
      for (const x of [-.235, .235]) {
        const slot = new THREE.Path();
        slot.moveTo(x - .1, model.nutY + .45);
        slot.lineTo(x - .1, topY - .4); slot.absarc(x, topY - .4, .1, Math.PI, 0, true);
        slot.lineTo(x + .1, model.nutY + .45); slot.absarc(x, model.nutY + .45, .1, 0, Math.PI, true);
        slot.closePath(); head.holes.push(slot);
      }
    }
    this.finishWood(this.extrude('neck', 'headstock', head, .22, .25, '#ac7950', .025), neckWood, 'gloss');
    if (acoustic) this.finishWood(this.extrude('neck', 'headstock', head, .012, .489, '#443021', .015), 'rosewood', 'gloss');

    const posts: THREE.Vector3[] = [];
    for (let i = 0; i < 6; i++) {
      const left = i < 3, row = left ? i : 5 - i;
      const x = kind === 'electric' ? -.33 : classical ? (left ? -.235 : .235) : (left ? -.32 : .32);
      const y = model.nutY + (kind === 'electric' ? .35 + i * .235 : classical ? .5 + row * .42 : .35 + row * .5);
      posts.push(new THREE.Vector3(x, y, classical ? .36 : .57));
      const side = kind === 'electric' || left ? -1 : 1;
      if (classical) {
        this.rod('tuners', 'tuners', new THREE.Vector3(x - .125, y, .36), new THREE.Vector3(x + .125, y, .36), .054, '#efe6cf', .05, .35);
      } else {
        this.add('tuners', 'tuners', new THREE.RingGeometry(.061, .092, 32), this.material('#c3c9c8', .85, .3), x, y, .52);
        const post = this.add('tuners', 'tuners', new THREE.CylinderGeometry(.056, .061, .17, 20), this.material('#d8d9cf', .92, .18), x, y, .545);
        post.rotation.x = Math.PI / 2;
        this.box('tuners', 'tuners', .19, .25, .08, x, y, .22, '#a2aaa9', .92);
        this.screw('tuners', 'tuners', x, y - .17, .522, .02);
        for (let turn = 0; turn < 3; turn++) {
          this.add('strings', 'strings', new THREE.TorusGeometry(.064, .004, 6, 28), this.material('#c4b18c', .8, .28), x, y, .546 + turn * .014);
        }
      }
      const shaftEnd = side * (classical ? .6 : .62);
      this.rod('tuners', 'tuners', new THREE.Vector3(x, y, classical ? .36 : .34), new THREE.Vector3(shaftEnd, y, classical ? .36 : .34), .026, '#cfcfc2', .9, .22);
      const collar = this.add('tuners', 'tuners', new THREE.CylinderGeometry(.04, .046, .05, 20), this.material('#d9d8cb', .92, .2),
        shaftEnd + side * .02, y, classical ? .36 : .34);
      collar.rotation.z = Math.PI / 2;
      const button = this.add('tuners', 'tuners', new THREE.SphereGeometry(.1, 28, 16),
        classical ? new THREE.MeshPhysicalMaterial({ color: '#f1e6cb', roughness: .28, clearcoat: .7, clearcoatRoughness: .1, envMapIntensity: .9 })
          : this.material('#d3d3c6', .92, .16), shaftEnd + side * .11, y, classical ? .36 : .34);
      button.scale.set(1.05, .72, .5);
    }
    if (classical) {
      for (const sign of [-1, 1]) this.box('tuners', 'tuners', .03, 1.15, .16, sign * .445, model.nutY + .925, .36, '#d4ae5c', .85, .3);
    }
    posts.forEach(post => post.applyMatrix4(tilt));
    for (const mesh of this.collect) mesh.applyMatrix4(tilt);
    this.collect = null;

    const boardEnd = guitarFretY(kind, model.frets) - .12;
    const board = new THREE.Shape();
    board.moveTo(-.43, boardEnd); board.lineTo(.43, boardEnd);
    board.lineTo(halfNut, model.nutY); board.lineTo(-halfNut, model.nutY); board.closePath();
    this.finishWood(this.extrude('fretboard', 'fretboard', board, .095, .57, '#35271e', .012), kind === 'steel' ? 'ebony' : 'rosewood', 'oil');
    if (kind === 'steel') {
      for (const sign of [-1, 1]) this.rod('fretboard', 'fretboard', new THREE.Vector3(sign * .437, boardEnd, .62),
        new THREE.Vector3(sign * (halfNut + .007), model.nutY, .62), .012, '#efe3bf', 0, .4);
    }
    for (let fret = 1; fret <= model.frets; fret++) {
      const y = guitarFretY(kind, fret);
      const width = model.nutWidth + (1 - (y - boardEnd) / (model.nutY - boardEnd)) * (.86 - model.nutWidth);
      const wire = this.rod('fretboard', 'frets', new THREE.Vector3(-width / 2, y, .678), new THREE.Vector3(width / 2, y, .678), .014, '#d5dbdb', .95, .16);
      wire.scale.z = .75;
      if (!classical && [3, 5, 7, 9, 12, 15, 17, 19, 21].includes(fret)) {
        const center = (y + guitarFretY(kind, fret - 1)) / 2;
        for (const x of fret === 12 ? [-.15, .15] : [0]) {
          const inlay = new THREE.MeshPhysicalMaterial({ color: kind === 'steel' ? '#e9e6dc' : '#d8cfb4', roughness: .25, iridescence: kind === 'steel' ? .6 : 0,
            iridescenceIOR: 1.4, clearcoat: .6, envMapIntensity: 1 });
          this.add('fretboard', 'fretboard', new THREE.CircleGeometry(.042, 32), inlay, x, center, .6685);
        }
        const side = this.add('fretboard', 'fretboard', new THREE.CircleGeometry(.019, 16), this.material('#e2d8b8'), -width / 2 - (kind === 'steel' ? .02 : .005), center, .628);
        side.rotation.y = -Math.PI / 2;
      }
    }
    this.box('nut', 'nut', model.nutWidth + .025, .065, .064, 0, model.nutY + .012, .69, '#e0d6bd');
    for (let i = 0; i < 6; i++) this.box('nut', 'nut', .009, .072, .004, (i - 2.5) * ((model.nutWidth - .09) / 5), model.nutY + .012, .724, '#756f5a');

    const saddleY = model.nutY - model.scaleLength;
    if (acoustic) {
      const bridge = new THREE.Shape();
      if (classical) {
        bridge.moveTo(-1.02, saddleY - .3); bridge.lineTo(1.02, saddleY - .3);
        bridge.quadraticCurveTo(1.08, saddleY, 1.0, saddleY + .16); bridge.lineTo(-1.0, saddleY + .16);
        bridge.quadraticCurveTo(-1.08, saddleY, -1.02, saddleY - .3);
      } else {
        // Belly bridge: wings taper toward the ends, with a belly behind the pins.
        bridge.moveTo(-.98, saddleY - .12);
        bridge.bezierCurveTo(-.96, saddleY - .3, -.55, saddleY - .36, -.3, saddleY - .42);
        bridge.quadraticCurveTo(0, saddleY - .5, .3, saddleY - .42);
        bridge.bezierCurveTo(.55, saddleY - .36, .96, saddleY - .3, .98, saddleY - .12);
        bridge.bezierCurveTo(1.0, saddleY + .1, .9, saddleY + .2, .72, saddleY + .19);
        bridge.quadraticCurveTo(0, saddleY + .12, -.72, saddleY + .19);
        bridge.bezierCurveTo(-.9, saddleY + .2, -1.0, saddleY + .1, -.98, saddleY - .12);
      }
      this.finishWood(this.extrude('bridge', 'bridge', bridge, .10, .59, '#473023', .035), classical ? 'rosewood' : 'ebony', 'oil');
      if (classical) {
        const block = this.box('bridge', 'bridge', 1.05, .14, .1, 0, saddleY - .2, .745, '#72442b');
        this.finishWood(block, 'rosewood', 'oil');
        for (const x of [-.52, -.5, .5, .52]) this.box('bridge', 'bridge', .012, .13, .012, x, saddleY - .2, .8, '#e4d6b4');
      }
      const saddle = this.box('bridge', 'saddle', 1.04, .039, .065, 0, saddleY, .743, '#e6dcc3');
      saddle.rotation.z = classical ? -.015 : -.035;
      for (let i = 0; i < 6; i++) {
        const x = (i - 2.5) * .18;
        if (!classical) {
          const pin = this.add('bridge', 'bridge', new THREE.SphereGeometry(.034, 24, 14), this.material('#e8dfc6'), x, saddleY - .21, .715);
          pin.scale.z = .65;
          this.add('bridge', 'bridge', new THREE.CircleGeometry(.01, 12), this.material('#2c241c'), x, saddleY - .21, .738);
        } else {
          this.rod('strings', 'strings', new THREE.Vector3(x, saddleY - .12, .803),
            new THREE.Vector3(x + .035, saddleY - .27, .8), .008, '#d0c4a6', .1);
          this.add('strings', 'strings', new THREE.TorusGeometry(.028, .007, 8, 16), this.material(i < 3 ? '#cdbf9f' : '#f1e7cf', .1, .4), x + .02, saddleY - .2, .8);
        }
      }
    } else {
      this.box('bridge', 'bridge', 1.35, .57, .06, 0, saddleY - .12, .685, '#d8dcda', .9, .08);
      this.box('bridge', 'bridge', 1.35, .06, .16, 0, saddleY - .39, .72, '#d8dcda', .9, .25);
      for (let i = 0; i < 6; i++) {
        const x = (i - 2.5) * .18, y = saddleY - (i % 3) * .035;
        this.box('bridge', 'saddle', .15, .22, .09, x, y, .79, '#dedfd6', .95, .45);
        this.screw('bridge', 'saddle', x, y + .08, .837, .019);
        this.rod('bridge', 'saddle', new THREE.Vector3(x, saddleY - .4, .74), new THREE.Vector3(x, y - .1, .74), .016, '#aeb6b7', .9);
      }
      for (const x of [-.57, .57]) this.screw('bridge', 'bridge', x, saddleY - .3, .72);
      for (const y of [-.48, -1.12]) {
        this.box('electronics', 'pickups', 1.28, .26, .1, 0, y, .73, '#ede6d0', 0, .42);
        for (let i = 0; i < 6; i++) {
          const pole = this.add('electronics', 'pickups', new THREE.CylinderGeometry(.036, .036, .03, 18), this.material('#d3d8d7', .65, .3), (i - 2.5) * .18, y, .786);
          pole.rotation.x = Math.PI / 2;
        }
        for (const x of [-.56, .56]) this.screw('electronics', 'pickups', x, y, .792, .023);
      }
      for (const [x, y] of [[1.13, -1.74], [1.35, -2.37]]) {
        const knob = this.add('electronics', 'controls', new THREE.CylinderGeometry(.15, .18, .19, 32),
          this.material('#e8e1c9', 0, .32), x, y, .79);
        knob.rotation.x = Math.PI / 2;
        const cap = this.add('electronics', 'controls', new THREE.CylinderGeometry(.13, .15, .03, 32), this.material('#d8d0b6', 0, .3), x, y, .89);
        cap.rotation.x = Math.PI / 2;
        this.box('electronics', 'controls', .022, .11, .013, x, y + .03, .91, '#302f28');
        for (let i = 0; i < 24; i++) {
          const a = i * Math.PI / 12;
          this.rod('electronics', 'controls', new THREE.Vector3(x + Math.cos(a) * .168, y + Math.sin(a) * .168, .72),
            new THREE.Vector3(x + Math.cos(a) * .15, y + Math.sin(a) * .15, .875), .004, '#c9c1a6', .1, .4);
        }
      }
      this.rod('electronics', 'controls', new THREE.Vector3(.94, -.98, .7), new THREE.Vector3(1.07, -.81, .93), .026, '#e6e2d3', 0, .35);
      this.add('electronics', 'controls', new THREE.SphereGeometry(.05, 16, 12), this.material('#e6e2d3', 0, .35), 1.08, -.8, .945);
      const jack = this.add('electronics', 'controls', new THREE.CylinderGeometry(.16, .16, .03, 32), this.material('#c7cdca', .95, .16), .75, -3.14, .655);
      jack.rotation.x = Math.PI / 2;
      this.add('electronics', 'controls', new THREE.CircleGeometry(.065, 24), this.material('#121212', .4, .5), .75, -3.14, .672);
    }
    for (let i = 0; i < 6; i++) {
      const x = (i - 2.5) * .18, nutX = (i - 2.5) * ((model.nutWidth - .1) / 5);
      const wound = classical ? i < 3 : i < 4;
      const color = classical ? (wound ? '#d5c9ad' : '#f2e9d2') : wound && acoustic ? '#caa165' : '#d2d6d1';
      const radius = .0075 - i * .00085, bridgeHeight = acoustic ? .783 : .845, nutHeight = .732;
      const metal = classical && !wound ? .05 : .9, roughness = classical && !wound ? .22 : .3;
      this.rod('strings', 'strings', new THREE.Vector3(x, saddleY - .21, acoustic ? .735 : .8), new THREE.Vector3(x, saddleY, bridgeHeight), radius, color, metal, roughness);
      this.rod('strings', 'strings', new THREE.Vector3(x, saddleY, bridgeHeight), new THREE.Vector3(nutX, model.nutY, nutHeight), radius, color, metal, roughness);
      this.rod('strings', 'strings', new THREE.Vector3(nutX, model.nutY, nutHeight), posts[i], radius, color, metal, roughness);
    }
    for (const y of [-3.98, 1.23]) {
      const pin = this.add('body', 'body', new THREE.SphereGeometry(.07, 20, 14), this.material('#b8c1c0', .9, .18), 0, y, backZ + model.bodyDepth * .5);
      pin.scale.set(1, .7, 1);
    }
    this.computeAnchors();
    this.renderTags();
  }

  /** Local centres of each assembly, used to place exploded-view name tags. */
  private computeAnchors(): void {
    this.anchors.clear();
    for (const [id, group] of this.groups) {
      const box = new THREE.Box3();
      for (const child of group.children) {
        if (!(child instanceof THREE.Mesh)) continue;
        child.updateMatrix();
        child.geometry.computeBoundingBox();
        box.union(child.geometry.boundingBox!.clone().applyMatrix4(child.matrix));
      }
      if (!box.isEmpty()) this.anchors.set(id, box.getCenter(new THREE.Vector3()));
    }
  }

  private renderTags(): void {
    this.overlay.replaceChildren();
    this.tags.clear();
    for (const assembly of GUITAR_MODELS[this.state.kind].assemblies) {
      const tag = document.createElement('span');
      tag.className = 'gl-tag';
      tag.textContent = assembly.name;
      tag.hidden = true;
      this.overlay.append(tag);
      this.tags.set(assembly.id, tag);
    }
  }

  private updateTags(): void {
    const separated = this.state.exploded || this.state.detached.length > 0;
    const width = this.host.clientWidth, height = this.host.clientHeight;
    const placed: { tag: HTMLSpanElement; x: number; y: number; h: number }[] = [];
    this.root.updateMatrixWorld();
    for (const [id, tag] of this.tags) {
      const show = separated && (this.state.exploded || this.state.detached.includes(id) || id === 'body');
      const anchor = this.anchors.get(id), group = this.groups.get(id);
      if (!show || !anchor || !group) { tag.hidden = true; continue; }
      const point = anchor.clone().applyMatrix4(group.matrixWorld).project(this.camera);
      if (point.z > 1 || Math.abs(point.x) > 1.05 || Math.abs(point.y) > 1.05) { tag.hidden = true; continue; }
      tag.hidden = false;
      tag.dataset.selected = String(GUITAR_MODELS[this.state.kind].parts.some(p => p.assembly === id && p.id === this.state.selected));
      placed.push({ tag, x: (point.x + 1) / 2 * width, y: (1 - point.y) / 2 * height, h: tag.offsetHeight || 22 });
    }
    // Keep tags readable: push overlapping neighbours apart vertically.
    placed.sort((a, b) => a.y - b.y);
    for (let i = 1; i < placed.length; i++) {
      const previous = placed[i - 1], current = placed[i];
      if (Math.abs(current.x - previous.x) < 150 && current.y - previous.y < previous.h + 4) current.y = previous.y + previous.h + 4;
    }
    for (const { tag, x, y, h } of placed) {
      const left = Math.min(Math.max(x, 8), Math.max(8, width - tag.offsetWidth - 8)), top = Math.min(Math.max(y - h / 2, 30), Math.max(30, height - h - 8));
      tag.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
    }
  }

  private partAt(clientX: number, clientY: number): GuitarPartId | null {
    const bounds = this.renderer.domElement.getBoundingClientRect();
    this.raycaster.setFromCamera(new THREE.Vector2((clientX - bounds.left) / bounds.width * 2 - 1,
      -(clientY - bounds.top) / bounds.height * 2 + 1), this.camera);
    const hit = this.raycaster.intersectObject(this.root, true).find(entry => entry.object.userData.part);
    return (hit?.object.userData.part as GuitarPartId | undefined) ?? null;
  }

  private updateHover = (): void => {
    this.hoverFrame = 0;
    if (!this.active || this.disposed || !this.hoverPoint || this.pointerStart) return;
    const part = this.partAt(this.hoverPoint.x, this.hoverPoint.y);
    this.setHover(part);
    if (part) {
      const bounds = this.host.getBoundingClientRect();
      const x = this.hoverPoint.x - bounds.left, y = this.hoverPoint.y - bounds.top;
      this.tip.style.transform = `translate(${Math.round(Math.min(x + 14, bounds.width - this.tip.offsetWidth - 6))}px, ${Math.round(Math.max(6, y - 34))}px)`;
    }
  };

  private setHover(part: GuitarPartId | null): void {
    if (part === this.hovered) return;
    this.hovered = part;
    const name = part ? GUITAR_MODELS[this.state.kind].parts.find(p => p.id === part)?.name : undefined;
    this.tip.hidden = !name;
    this.tip.textContent = name ?? '';
    this.renderer.domElement.style.cursor = part ? 'pointer' : '';
    this.applyHighlight();
    this.requestRender();
  }

  private applyHighlight(): void {
    this.root.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      const part = object.userData.part as GuitarPartId, selected = part === this.state.selected, hovered = part === this.hovered;
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        if (!(material instanceof THREE.MeshStandardMaterial)) continue;
        material.emissive.copy(selected ? SELECTED : hovered ? HOVERED : NONE);
        material.emissiveIntensity = selected ? .16 : hovered ? .12 : 0;
      }
    });
  }

  update(state: GuitarLabState, animate = true): void {
    if (this.disposed) return;
    const kindChanged = state.kind !== this.state.kind;
    const layoutChanged = state.exploded !== this.state.exploded || (state.detached.length === 0) !== (this.state.detached.length === 0);
    this.state = state;
    if (kindChanged) { this.hovered = null; this.tip.hidden = true; this.build(state.kind); }
    this.starts.clear();
    let changed = false;
    for (const [id, group] of this.groups) {
      this.starts.set(id, group.position.clone());
      const target = new THREE.Vector3(...guitarAssemblyOffset(state, id));
      if (group.position.distanceToSquared(target) > .0001) changed = true;
      if (!animate || this.options.reducedMotion || !this.active) group.position.copy(target);
    }
    this.applyHighlight();
    this.animationStart = changed && animate && !this.options.reducedMotion && this.active ? performance.now() : 0;
    if (kindChanged || layoutChanged) this.view(kindChanged ? 'three-quarter' : this.currentView === 'headstock' || this.currentView === 'bridge' ? 'three-quarter' : this.currentView, !kindChanged && animate);
    this.requestRender();
  }

  setActive(active: boolean): void {
    if (this.disposed) return;
    this.active = active;
    this.controls.enabled = active;
    if (!active) {
      cancelAnimationFrame(this.frame); this.frame = 0; this.animationStart = 0; this.tween = null;
      cancelAnimationFrame(this.hoverFrame); this.hoverFrame = 0; this.setHover(null);
      for (const [id, group] of this.groups) group.position.set(...guitarAssemblyOffset(this.state, id));
    } else { this.resize(); this.requestRender(); }
  }

  orbit(direction: number): void {
    if (this.disposed) return;
    this.tween = null;
    const offset = this.camera.position.clone().sub(this.controls.target);
    offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), direction * Math.PI / 9);
    this.camera.position.copy(this.controls.target).add(offset);
    this.controls.update(); this.requestRender();
  }

  zoom(factor: number): void {
    if (this.disposed) return;
    this.tween = null;
    const offset = this.camera.position.clone().sub(this.controls.target);
    offset.setLength(THREE.MathUtils.clamp(offset.length() * factor, this.controls.minDistance, this.controls.maxDistance));
    this.camera.position.copy(this.controls.target).add(offset);
    this.controls.update(); this.requestRender();
  }

  resetView(): void { this.view('three-quarter'); }
  get cameraView(): GuitarLabView { return this.currentView; }

  /** Frames the whole guitar from a named direction, or moves in close on the headstock or bridge. */
  view(name: GuitarLabView, animate = true): void {
    if (this.disposed) return;
    this.currentView = name;
    const model = GUITAR_MODELS[this.state.kind];
    this.root.updateMatrixWorld(true);
    let position: THREE.Vector3, target: THREE.Vector3;
    if (name === 'headstock' || name === 'bridge') {
      const local = name === 'headstock' ? new THREE.Vector3(0, model.nutY + .8, .45) : new THREE.Vector3(0, model.nutY - model.scaleLength - .1, .7);
      const group = this.groups.get(name === 'headstock' ? 'neck' : 'bridge')!;
      target = local.applyMatrix4(group.matrixWorld);
      const direction = new THREE.Vector3(...(name === 'headstock' ? [.55, .32, 1] as const : [.3, .62, 1] as const)).normalize();
      position = target.clone().addScaledVector(direction, name === 'headstock' ? 5.6 : 5.2 + Math.max(0, 1 - this.camera.aspect) * 3);
    } else {
      ({ position, target } = this.frameAll(new THREE.Vector3(...VIEW_DIRECTIONS[name])));
    }
    if (!animate || this.options.reducedMotion || !this.active || !this.initialized) {
      this.tween = null;
      this.controls.target.copy(target); this.camera.position.copy(position);
      this.controls.update(); this.requestRender();
      return;
    }
    this.tween = { from: this.camera.position.clone(), fromTarget: this.controls.target.clone(), to: position, toTarget: target, start: performance.now() };
    this.requestRender();
  }

  private frameAll(direction: THREE.Vector3): { position: THREE.Vector3; target: THREE.Vector3 } {
    const box = new THREE.Box3();
    for (const [id, group] of this.groups) {
      const offset = new THREE.Vector3(...guitarAssemblyOffset(this.state, id));
      const saved = group.position.clone();
      group.position.copy(offset); group.updateMatrixWorld(true);
      box.expandByObject(group);
      group.position.copy(saved); group.updateMatrixWorld(true);
    }
    const center = box.getCenter(new THREE.Vector3()), dir = direction.clone().normalize();
    const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), dir).normalize();
    const up = new THREE.Vector3().crossVectors(dir, right).normalize();
    const tanV = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)), tanH = tanV * this.camera.aspect;
    let distance = 0;
    for (let i = 0; i < 8; i++) {
      const corner = new THREE.Vector3(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).sub(center);
      const depth = corner.dot(dir);
      distance = Math.max(distance, depth + Math.abs(corner.dot(right)) / tanH, depth + Math.abs(corner.dot(up)) / tanV);
    }
    distance = THREE.MathUtils.clamp(distance * 1.06, this.controls.minDistance, this.controls.maxDistance);
    const contact = this.stage[1];
    if (contact) {
      contact.position.x = center.x; contact.position.z = center.z;
      contact.scale.set(Math.max(4, box.max.x - box.min.x) * 1.05, Math.max(3, box.max.z - box.min.z + 2.4), 1);
    }
    return { position: center.clone().addScaledVector(dir, distance), target: center };
  }

  private resize = (): void => {
    if (this.disposed || !this.active) return;
    const width = this.host.clientWidth, height = this.host.clientHeight;
    if (width < 1 || height < 1) return;
    const previous = this.camera.aspect;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
    const pose = this.camera.aspect >= 1.2 ? WIDE_POSE : NARROW_POSE;
    const posed = this.root.rotation.z !== pose;
    this.root.rotation.z = pose;
    if (!this.initialized || posed || Math.abs(previous - this.camera.aspect) > .3) {
      this.initialized = true; this.view(this.currentView, false);
    }
    this.requestRender();
  };

  private pick = (event: PointerEvent): void => {
    const start = this.pointerStart;
    this.pointerStart = null;
    if (!this.active || !start || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 6) return;
    const part = this.partAt(event.clientX, event.clientY);
    if (part) this.options.onPick(part);
  };

  private requestRender = (): void => {
    if (this.disposed || !this.active || this.frame) return;
    this.frame = requestAnimationFrame(this.render);
  };

  private render = (time: number): void => {
    this.frame = 0;
    if (this.disposed || !this.active) return;
    if (this.animationStart) {
      const t = Math.min(1, (time - this.animationStart) / 420), eased = 1 - (1 - t) ** 4;
      for (const [id, group] of this.groups) group.position.lerpVectors(this.starts.get(id)!,
        new THREE.Vector3(...guitarAssemblyOffset(this.state, id)), eased);
      if (t === 1) this.animationStart = 0;
    }
    if (this.tween) {
      const t = Math.min(1, (time - this.tween.start) / 650), eased = 1 - (1 - t) ** 3;
      this.camera.position.lerpVectors(this.tween.from, this.tween.to, eased);
      this.controls.target.lerpVectors(this.tween.fromTarget, this.tween.toTarget, eased);
      this.controls.update();
      if (t === 1) this.tween = null;
    }
    this.renderer.render(this.scene, this.camera);
    this.updateTags();
    if (this.tween) this.requestRender();
    if (this.animationStart) this.requestRender();
  };

  private clearModel(): void {
    const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
    this.root.traverse(object => {
      if (object instanceof THREE.Mesh) {
        geometries.add(object.geometry);
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
      }
    });
    geometries.forEach(geometry => geometry.dispose());
    materials.forEach(material => material.dispose());
    this.root.clear(); this.groups.clear(); this.anchors.clear();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    cancelAnimationFrame(this.hoverFrame);
    this.abort.abort();
    this.resizeObserver?.disconnect();
    this.controls?.removeEventListener('change', this.requestRender);
    this.controls?.dispose();
    this.clearModel();
    this.textures.forEach(texture => texture.dispose()); this.textures.clear();
    this.scene.background = null; this.scene.environment = null; this.environment?.dispose();
    for (const mesh of this.stage) { mesh.geometry.dispose(); (mesh.material as THREE.Material).dispose(); }
    this.scene.traverse(object => { if (object instanceof THREE.DirectionalLight) object.shadow.map?.dispose(); });
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
    this.overlay.remove(); this.tip.remove();
  }
}
