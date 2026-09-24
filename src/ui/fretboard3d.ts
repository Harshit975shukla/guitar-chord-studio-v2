import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { NOTE_NAMES, type StringTuning } from '../types';

export interface NeckState {
  frets: (number | null)[];
  tuning: StringTuning[];
  liveMidi: number | null;
  root: string | null;
  /** Scale mode: highlight every position whose pitch class is in this set. */
  scalePcs?: number[] | null;
  /** Pitch class of the scale/chord root (0-11), for coloring in scale mode. */
  rootPc?: number | null;
}

/** An on-demand scene: no animation loop competes with microphone analysis. */
export class Fretboard3D {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  private controls: OrbitControls;
  private observer: ResizeObserver;
  private geometries = new Set<THREE.BufferGeometry>();
  private materials = new Set<THREE.Material>();
  private textures = new Map<string, THREE.CanvasTexture>();
  private markers = new THREE.Group();
  private targets: THREE.Object3D[] = [];
  private raycaster = new THREE.Raycaster();
  private abort = new AbortController();
  private visible = true;
  private disposed = false;
  private frame = 0;
  private start = { x: 0, y: 0 };
  private pointers = new Set<number>();
  private gesture = false;
  private home = new THREE.Vector3(0.7, 10.8, 9.3);

  constructor(
    private host: HTMLElement,
    private onPick: (string: number, fret: number) => void,
    onUnavailable: () => void,
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor(0x000000, 0);
    const canvas = this.renderer.domElement;
    canvas.setAttribute('aria-label', 'Interactive 3D guitar neck. Drag to orbit; click a string to play. Use 2D view for individual keyboard-accessible frets.');
    canvas.setAttribute('aria-describedby', 'neck-help');
    canvas.tabIndex = 0;
    host.append(canvas);
    this.camera.position.copy(this.home);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enablePan = false;
    this.controls.enableDamping = false;
    this.controls.enableZoom = false; // Explicit zoom buttons leave page scrolling intact.
    this.controls.minPolarAngle = 0.12;
    this.controls.maxPolarAngle = Math.PI * 0.46;
    this.controls.minAzimuthAngle = -0.65;
    this.controls.maxAzimuthAngle = 0.65;
    this.controls.addEventListener('change', this.requestRender);
    this.controls.update();
    this.scene.add(new THREE.HemisphereLight(0xfff1d9, 0x4f3930, 3));
    const key = new THREE.DirectionalLight(0xffead5, 3.2);
    key.position.set(-3, 10, 5);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0xd3e5f2, 2);
    rim.position.set(4, 4, -5);
    this.scene.add(rim);
    this.buildNeck();
    this.scene.add(this.markers);
    const options = { signal: this.abort.signal };
    canvas.addEventListener('pointerdown', e => {
      this.pointers.add(e.pointerId);
      if (this.pointers.size === 1) {
        this.start = { x: e.clientX, y: e.clientY };
        this.gesture = false;
      } else this.gesture = true;
    }, options);
    canvas.addEventListener('pointerup', e => {
      this.pointers.delete(e.pointerId);
      if (this.gesture || e.button !== 0 || Math.hypot(e.clientX - this.start.x, e.clientY - this.start.y) > 6) return;
      const rect = canvas.getBoundingClientRect();
      this.raycaster.setFromCamera(new THREE.Vector2(
        (e.clientX - rect.left) / rect.width * 2 - 1,
        -(e.clientY - rect.top) / rect.height * 2 + 1,
      ), this.camera);
      const hit = this.raycaster.intersectObjects(this.targets, false)[0];
      if (hit) this.onPick(hit.object.userData.string, hit.object.userData.fret);
    }, options);
    canvas.addEventListener('pointercancel', e => { this.pointers.delete(e.pointerId); this.gesture = true; }, options);
    canvas.addEventListener('keydown', e => {
      if (e.key === '+' || e.key === '=') this.zoom(0.85);
      else if (e.key === '-') this.zoom(1.15);
      else if (e.key.toLowerCase() === 'r') this.reset();
      else return;
      e.preventDefault();
    }, options);
    canvas.addEventListener('webglcontextlost', e => {
      e.preventDefault();
      onUnavailable();
    }, options);
    document.addEventListener('visibilitychange', this.requestRender, options);
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(host);
    this.resize();
  }

  private material(color: number, metalness = 0, roughness = 0.65): THREE.MeshStandardMaterial {
    const material = new THREE.MeshStandardMaterial({ color, metalness, roughness });
    this.materials.add(material);
    return material;
  }

  private mesh(geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number): THREE.Mesh {
    this.geometries.add(geometry);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    this.scene.add(mesh);
    return mesh;
  }

  private fretX(fret: number): number {
    return -6 + 24 * (1 - Math.pow(2, -fret / 12));
  }

  private noteX(fret: number): number {
    return fret === 0 ? -6.45 : (this.fretX(fret - 1) + this.fretX(fret)) / 2;
  }

  private stringZ(string: number): number {
    return (string - 2.5) * 0.4;
  }

  private buildNeck(): void {
    const wood = this.material(0x34251e);
    const back = this.material(0x76513a);
    const binding = this.material(0xc5ab82);
    const metal = this.material(0xb7b4aa, 0.78, 0.23);
    const pearl = this.material(0xd8cdb5, 0.2, 0.35);
    this.mesh(new THREE.BoxGeometry(12.8, 0.42, 2.62), back, 0, -0.35, 0);
    this.mesh(new THREE.BoxGeometry(12.8, 0.22, 2.58), wood, 0, -0.04, 0);
    for (const z of [-1.3, 1.3]) {
      this.mesh(new THREE.BoxGeometry(12.8, 0.065, 0.035), binding, 0, 0.06, z);
    }
    // Fine, deterministic grain made from geometry, not downloaded textures.
    const grain = this.material(0x493127);
    for (let i = 0; i < 28; i++) {
      const line = this.mesh(new THREE.BoxGeometry(12.7, 0.004, 0.008 + (i % 3) * 0.004), grain, 0, 0.073, -1.25 + i * 0.09);
      line.rotation.y = Math.sin(i * 7.1) * 0.002;
    }
    this.mesh(new THREE.BoxGeometry(0.11, 0.18, 2.6), pearl, -6, 0.13, 0);
    for (let f = 1; f <= 12; f++) {
      const wire = this.mesh(new THREE.CylinderGeometry(0.032, 0.032, 2.57, 8), metal, this.fretX(f), 0.12, 0);
      wire.rotation.x = Math.PI / 2;
      this.label(String(f), this.noteX(f), 0.02, -1.66, 0.36, 0xa99f91);
      if ([3, 5, 7, 9, 12].includes(f)) {
        for (const z of f === 12 ? [-0.48, 0.48] : [0]) {
          this.mesh(new THREE.CylinderGeometry(0.105, 0.105, 0.01, 24), pearl, this.noteX(f), 0.079, z);
        }
      }
    }
    for (let s = 0; s < 6; s++) {
      const radius = 0.009 + s * 0.0025;
      const wire = this.mesh(new THREE.CylinderGeometry(radius, radius, 13.3, 10), metal, -0.05, 0.21, this.stringZ(s));
      wire.rotation.z = Math.PI / 2;
      for (let f = 0; f <= 12; f++) {
        const width = f === 0 ? 0.7 : this.fretX(f) - this.fretX(f - 1);
        const targetMaterial = new THREE.MeshBasicMaterial({ visible: false });
        this.materials.add(targetMaterial);
        const target = this.mesh(new THREE.BoxGeometry(width, 0.35, 0.39), targetMaterial, this.noteX(f), 0.3, this.stringZ(s));
        target.userData = { string: s, fret: f };
        this.targets.push(target);
      }
    }
  }

  private label(text: string, x: number, y: number, z: number, size: number, color = 0x211a12, parent: THREE.Object3D = this.scene): void {
    const cacheKey = `${text}:${color}`;
    let texture = this.textures.get(cacheKey);
    if (!texture) {
      const canvas = document.createElement('canvas');
      canvas.width = 128;
      canvas.height = 96;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = `#${color.toString(16).padStart(6, '0')}`;
      ctx.font = '600 54px system-ui';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, 64, 49);
      texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      this.textures.set(cacheKey, texture);
    }
    const material = new THREE.SpriteMaterial({ map: texture, depthTest: false });
    this.materials.add(material);
    const sprite = new THREE.Sprite(material);
    sprite.position.set(x, y, z);
    sprite.scale.set(size * 1.33, size, 1);
    parent.add(sprite);
  }

  update(state: NeckState): void {
    this.markers.traverse(object => {
      const drawable = object as THREE.Mesh;
      if (drawable.geometry) { drawable.geometry.dispose(); this.geometries.delete(drawable.geometry); }
      const material = (object as THREE.Sprite).material;
      if (material && !Array.isArray(material)) { material.dispose(); this.materials.delete(material); }
    });
    this.markers.clear();
    const scaleMode = Array.isArray(state.scalePcs) && state.scalePcs.length > 0;
    for (let s = 0; s < 6; s++) {
      const fret = state.frets[s];
      this.label(state.tuning[s].note, -7.0, 0.2, this.stringZ(s), 0.33, 0xc0b7a9, this.markers);
      if (!scaleMode && fret === null) this.label('×', -6.45, 0.23, this.stringZ(s), 0.33, 0x9d9286, this.markers);
      for (let f = 0; f <= 12; f++) {
        const midi = state.tuning[s].midi + f;
        const pc = ((midi % 12) + 12) % 12;
        const live = state.liveMidi === midi;
        // Decide whether to mark this position and how to color it.
        let show = live;
        let color = 0x89d7bc; // live = green
        if (!live) {
          if (scaleMode) {
            if (state.scalePcs!.includes(pc)) {
              show = true;
              color = pc === state.rootPc ? 0xefb56d : 0x9ec5e8; // root amber, tone blue
            }
          } else if (f === fret) {
            show = true;
            color = NOTE_NAMES[pc] === state.root ? 0xefb56d : 0xf0dfc6; // root amber, voicing cream
          }
        }
        if (!show) continue;
        const note = NOTE_NAMES[pc];
        const material = this.material(color, 0.15, 0.35);
        const geometry = new THREE.CylinderGeometry(0.175, 0.175, 0.07, 24);
        this.geometries.add(geometry);
        const marker = new THREE.Mesh(geometry, material);
        marker.position.set(this.noteX(f), 0.26, this.stringZ(s));
        this.markers.add(marker);
        this.label(note, this.noteX(f), 0.34, this.stringZ(s), 0.28, 0x211a12, this.markers);
      }
    }
    this.requestRender();
  }

  private resize(): void {
    const { width, height } = this.host.getBoundingClientRect();
    if (!width || !height || this.disposed) return;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    // Frame the whole neck at any aspect ratio; zoom remains relative to home.
    this.camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(8.4 / (this.home.length() * this.camera.aspect)));
    this.camera.updateProjectionMatrix();
    this.requestRender();
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    if (!visible) { cancelAnimationFrame(this.frame); this.frame = 0; }
    else this.resize();
  }

  private requestRender = (): void => {
    if (this.frame || this.disposed || !this.visible || document.hidden) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      if (!this.disposed && this.visible && !document.hidden) this.renderer.render(this.scene, this.camera);
    });
  };

  zoom(factor: number): void {
    const distance = this.camera.position.length();
    this.camera.position.multiplyScalar(Math.max(9, Math.min(25, distance * factor)) / distance);
    this.controls.update();
    this.requestRender();
  }

  reset(): void {
    this.camera.position.copy(this.home);
    this.controls.target.set(0, 0, 0);
    this.controls.update();
    this.requestRender();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.abort.abort();
    this.observer.disconnect();
    this.controls.dispose();
    this.geometries.forEach(geometry => geometry.dispose());
    this.materials.forEach(material => material.dispose());
    this.textures.forEach(texture => texture.dispose());
    this.scene.clear();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }
}
