// Three.js-Brettansicht. Reine Praesentation - keine Regel-Logik.
// Aktivierung: ?view=3d  oder  localStorage knotenpunkt.view=3d

import * as THREE from '../../vendor/three/three.module.min.js';
import { OrbitControls } from '../../vendor/three/OrbitControls.js';
import { TYPE_INFO } from '../engine/rules.js';
import { occupancy } from '../engine/state.js';

const VIEW_KEY = 'knotenpunkt.view';
const NODE_R = 0.32;
const UNIT_Y = 0.28;

/** Feature-Flag: 3D-View statt SVG. */
export function isView3d() {
  try {
    const q = new URLSearchParams(location.search).get('view');
    if (q === '3d' || q === 'three') return true;
    if (q === '2d' || q === 'svg') return false;
    return localStorage.getItem(VIEW_KEY) === '3d';
  } catch (_) {
    return false;
  }
}

export function setView3d(on) {
  try {
    if (on) localStorage.setItem(VIEW_KEY, '3d');
    else localStorage.removeItem(VIEW_KEY);
  } catch (_) { /* privater Modus */ }
}

function hexColor(hex) {
  return new THREE.Color(hex || '#888888');
}

function unitGeometry(type) {
  if (type === 'reiter') {
    const g = new THREE.ConeGeometry(0.18, 0.48, 8);
    g.translate(0, 0.24, 0);
    return g;
  }
  if (type === 'bogen') {
    const g = new THREE.CylinderGeometry(0.06, 0.1, 0.5, 8);
    g.translate(0, 0.25, 0);
    return g;
  }
  // schild: flache Platte
  const g = new THREE.BoxGeometry(0.34, 0.42, 0.12);
  g.translate(0, 0.21, 0);
  return g;
}

/**
 * Langlebige 3D-Ansicht. Canvas wird vor root.innerHTML abgekoppelt
 * und danach wieder eingehaengt, damit der WebGL-Kontext erhalten bleibt.
 */
export class Board3DView {
  constructor() {
    this.host = null;
    this.options = null;
    this.onNodeTap = null;
    this._raf = 0;
    this._nodeMeshes = new Map(); // nodeId -> platform mesh (fuer Picking)
    this._content = new THREE.Group();
    this._pointer = new THREE.Vector2();
    this._raycaster = new THREE.Raycaster();
    this._dragDist = 0;
    this._pointerDown = null;

    this.canvas = document.createElement('canvas');
    this.canvas.className = 'board3d-canvas';
    this.canvas.setAttribute('aria-label', 'Spielfeld 3D');

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: true,
      powerPreference: 'low-power',
    });
    this.renderer.setClearColor(0x0f1420, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.scene.add(this._content);

    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 80);
    this.camera.position.set(0, 9, 7.5);
    this.camera.lookAt(0, 0, 0);

    const ambient = new THREE.AmbientLight(0xffffff, 0.72);
    const key = new THREE.DirectionalLight(0xfff2d6, 0.85);
    key.position.set(4, 10, 3);
    const fill = new THREE.DirectionalLight(0xa8c0ff, 0.28);
    fill.position.set(-5, 4, -3);
    this.scene.add(ambient, key, fill);

    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.enablePan = false;
    this.controls.minDistance = 5;
    this.controls.maxDistance = 16;
    this.controls.minPolarAngle = 0.18;
    this.controls.maxPolarAngle = Math.PI * 0.42; // top-down-ish, kein Cheat-Winkel
    this.controls.target.set(0, 0, 0);

    this._onPointerDown = (ev) => {
      this._pointerDown = { x: ev.clientX, y: ev.clientY };
      this._dragDist = 0;
    };
    this._onPointerMove = (ev) => {
      if (!this._pointerDown) return;
      const dx = ev.clientX - this._pointerDown.x;
      const dy = ev.clientY - this._pointerDown.y;
      this._dragDist = Math.hypot(dx, dy);
    };
    this._onPointerUp = (ev) => {
      const down = this._pointerDown;
      this._pointerDown = null;
      if (!down || this._dragDist > 8) return;
      this._pick(ev.clientX, ev.clientY);
    };
    this._onResize = () => this.resize();

    this.canvas.addEventListener('pointerdown', this._onPointerDown);
    this.canvas.addEventListener('pointermove', this._onPointerMove);
    this.canvas.addEventListener('pointerup', this._onPointerUp);
    this.canvas.addEventListener('pointercancel', () => { this._pointerDown = null; });
  }

  /** Canvas aus dem DOM nehmen (vor innerHTML), Instanz behalten. */
  detach() {
    if (this.canvas.parentElement) this.canvas.parentElement.removeChild(this.canvas);
    this.host = null;
    this._stopLoop();
  }

  /**
   * @param {HTMLElement} host
   * @param {object} options gleiche Felder wie boardSvg(...)
   * @param {(nodeId: string) => void} [onNodeTap]
   */
  attach(host, options, onNodeTap) {
    this.host = host;
    this.onNodeTap = onNodeTap || null;
    if (this.canvas.parentElement !== host) {
      host.textContent = '';
      host.appendChild(this.canvas);
    }
    this.sync(options);
    this.resize();
    this._startLoop();
  }

  sync(options) {
    this.options = options;
    this._rebuild();
  }

  resize() {
    if (!this.host) return;
    const w = Math.max(1, this.host.clientWidth || 320);
    const h = Math.max(1, Math.round(w * 0.92));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.canvas.style.width = '100%';
    this.canvas.style.height = `${h}px`;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  dispose() {
    this.detach();
    this.canvas.removeEventListener('pointerdown', this._onPointerDown);
    this.canvas.removeEventListener('pointermove', this._onPointerMove);
    this.canvas.removeEventListener('pointerup', this._onPointerUp);
    this.controls.dispose();
    this.renderer.dispose();
    this._disposeObject(this._content);
  }

  _startLoop() {
    if (this._raf) return;
    const tick = () => {
      this._raf = requestAnimationFrame(tick);
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
    };
    this._raf = requestAnimationFrame(tick);
    window.addEventListener('resize', this._onResize);
  }

  _stopLoop() {
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = 0;
    window.removeEventListener('resize', this._onResize);
  }

  _pick(clientX, clientY) {
    if (!this.onNodeTap || !this.host) return;
    const rect = this.canvas.getBoundingClientRect();
    this._pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this._pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    this._raycaster.setFromCamera(this._pointer, this.camera);
    const targets = [...this._nodeMeshes.values()];
    const hits = this._raycaster.intersectObjects(targets, false);
    if (hits.length) {
      const nodeId = hits[0].object.userData.nodeId;
      if (nodeId) this.onNodeTap(nodeId);
    }
  }

  _rebuild() {
    this._disposeObject(this._content);
    this._content.clear();
    this._nodeMeshes.clear();

    const o = this.options;
    if (!o || !o.state) return;
    const { state } = o;
    const board = state.board;
    const occ = occupancy(state);
    const highlight = new Set(o.highlight || []);
    const ordered = o.ordered || new Set();

    // Bodenplatte (dezente Atmosphaere)
    const floor = new THREE.Mesh(
      new THREE.CircleGeometry((board.radius || board.rings) + 1.4, 48),
      new THREE.MeshStandardMaterial({
        color: 0x121826, roughness: 0.92, metalness: 0.05,
      }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.04;
    floor.receiveShadow = false;
    this._content.add(floor);

    // Kanten als Stege
    const drawn = new Set();
    const edgeMat = new THREE.MeshStandardMaterial({
      color: 0x3a4560, roughness: 0.7, metalness: 0.15,
    });
    for (const id of board.order) {
      const a = board.nodes[id];
      for (const nb of a.neighbors) {
        const key = id < nb ? `${id}|${nb}` : `${nb}|${id}`;
        if (drawn.has(key)) continue;
        drawn.add(key);
        const b = board.nodes[nb];
        const dx = b.x - a.x;
        const dz = b.y - a.y;
        const len = Math.hypot(dx, dz) || 1;
        const midX = (a.x + b.x) / 2;
        const midZ = (a.y + b.y) / 2;
        const bridge = new THREE.Mesh(
          new THREE.BoxGeometry(len * 0.92, 0.05, 0.1),
          edgeMat,
        );
        bridge.position.set(midX, 0.025, midZ);
        bridge.rotation.y = -Math.atan2(dz, dx);
        this._content.add(bridge);
      }
    }

    // Knoten-Plattformen
    for (const id of board.order) {
      const n = board.nodes[id];
      const controller = state.control[id];
      const isZiel = highlight.has(id);

      let platColor = 0x222b3f;
      if (n.isSource) platColor = 0x3a3420;
      if (isZiel) platColor = 0x5a5430;

      const plat = new THREE.Mesh(
        new THREE.CylinderGeometry(NODE_R, NODE_R * 1.05, 0.1, 20),
        new THREE.MeshStandardMaterial({
          color: platColor,
          emissive: n.isSource ? 0x3a2e10 : 0x000000,
          emissiveIntensity: n.isSource ? 0.35 : 0,
          roughness: 0.65,
          metalness: 0.1,
        }),
      );
      plat.position.set(n.x, 0.05, n.y);
      plat.userData.nodeId = id;
      this._content.add(plat);
      this._nodeMeshes.set(id, plat);

      // Unsichtbare groessere Pick-Flaeche
      const hit = new THREE.Mesh(
        new THREE.CylinderGeometry(NODE_R + 0.18, NODE_R + 0.18, 0.2, 12),
        new THREE.MeshBasicMaterial({ visible: false }),
      );
      hit.position.copy(plat.position);
      hit.userData.nodeId = id;
      this._content.add(hit);
      this._nodeMeshes.set(`${id}__hit`, hit);

      if (controller !== null && controller !== undefined) {
        const col = hexColor(state.players[controller].color);
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(NODE_R + 0.02, NODE_R + 0.14, 24),
          new THREE.MeshBasicMaterial({
            color: col, transparent: true, opacity: 0.55, side: THREE.DoubleSide,
          }),
        );
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(n.x, 0.11, n.y);
        this._content.add(ring);
      }

      if (n.base !== null) {
        const col = hexColor(state.players[n.base].color);
        const base = new THREE.Mesh(
          new THREE.BoxGeometry(NODE_R * 2.2, 0.06, NODE_R * 2.2),
          new THREE.MeshStandardMaterial({
            color: col, transparent: true, opacity: 0.35, roughness: 0.5,
          }),
        );
        base.position.set(n.x, 0.02, n.y);
        this._content.add(base);
      }

      if (n.isSource) {
        const gem = new THREE.Mesh(
          new THREE.OctahedronGeometry(occ[id] ? 0.09 : 0.13, 0),
          new THREE.MeshStandardMaterial({
            color: 0xffd166, emissive: 0xaa8800, emissiveIntensity: 0.5, roughness: 0.35,
          }),
        );
        const ox = occ[id] ? -0.22 : 0;
        const oz = occ[id] ? -0.22 : 0;
        gem.position.set(n.x + ox, occ[id] ? 0.22 : 0.28, n.y + oz);
        this._content.add(gem);
      }
    }

    // Befehlspfeile (Linien)
    const orders = o.orders || {};
    for (const unitId in orders) {
      const u = state.units[unitId];
      if (!u) continue;
      if (o.showOrdersOf !== 'alle' && o.showOrdersOf !== u.owner) continue;
      const ord = orders[unitId];
      if (!ord || ord.action === 'halten') continue;
      const a = board.nodes[u.node];
      const b = board.nodes[ord.target];
      if (!b) continue;
      const col = hexColor(state.players[u.owner].color);
      const y = 0.35;
      const points = [
        new THREE.Vector3(a.x, y, a.y),
        new THREE.Vector3(b.x, y, b.y),
      ];
      const geo = new THREE.BufferGeometry().setFromPoints(points);
      const mat = new THREE.LineBasicMaterial({
        color: col,
        linewidth: 2,
        transparent: true,
        opacity: ord.action === 'bewegen' ? 0.95 : 0.55,
      });
      const line = new THREE.Line(geo, mat);
      if (ord.action !== 'bewegen') {
        // gestrichelt wirkend: kleine Kugel am Ziel
        const tip = new THREE.Mesh(
          new THREE.SphereGeometry(0.08, 10, 10),
          new THREE.MeshBasicMaterial({ color: col }),
        );
        tip.position.set(b.x, y, b.y);
        this._content.add(tip);
      } else {
        const dir = new THREE.Vector3(b.x - a.x, 0, b.y - a.y).normalize();
        const cone = new THREE.Mesh(
          new THREE.ConeGeometry(0.08, 0.18, 6),
          new THREE.MeshBasicMaterial({ color: col }),
        );
        cone.position.set(b.x - dir.x * 0.25, y, b.y - dir.z * 0.25);
        cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
        this._content.add(cone);
      }
      this._content.add(line);
    }

    // Einheiten
    for (const id of board.order) {
      const u = occ[id];
      if (!u) continue;
      const n = board.nodes[id];
      const col = hexColor(state.players[u.owner].color);
      const sel = o.selection && o.selection.unitId === u.id;
      const mine = o.viewerId === u.owner;
      const geo = unitGeometry(u.type);
      const mat = new THREE.MeshStandardMaterial({
        color: col,
        emissive: sel ? 0xffd166 : 0x000000,
        emissiveIntensity: sel ? 0.35 : 0,
        roughness: 0.45,
        metalness: 0.2,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(n.x, UNIT_Y * 0.15, n.y);
      mesh.userData.nodeId = id;
      this._content.add(mesh);
      // auch Einheit pickbar
      this._nodeMeshes.set(`${id}__unit`, mesh);

      if (mine) {
        const halo = new THREE.Mesh(
          new THREE.RingGeometry(0.2, 0.26, 20),
          new THREE.MeshBasicMaterial({
            color: 0xffffff, transparent: true, opacity: 0.35, side: THREE.DoubleSide,
          }),
        );
        halo.rotation.x = -Math.PI / 2;
        halo.position.set(n.x, 0.14, n.y);
        this._content.add(halo);
      }

      if (ordered.has(u.id)) {
        const dot = new THREE.Mesh(
          new THREE.SphereGeometry(0.06, 8, 8),
          new THREE.MeshBasicMaterial({ color: 0xffd166 }),
        );
        dot.position.set(n.x + 0.22, 0.55, n.y - 0.18);
        this._content.add(dot);
      }

      // Typ-Label als Sprite (kurze Buchstaben wie 2D)
      const label = makeTextSprite(TYPE_INFO[u.type].short);
      label.position.set(n.x, 0.72, n.y);
      this._content.add(label);
    }

    // Kamera-Abstand an Brettgroesse
    const span = (board.radius || board.rings) + 1.2;
    this.controls.minDistance = span * 1.4;
    this.controls.maxDistance = span * 4.2;
  }

  _disposeObject(root) {
    root.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (Array.isArray(obj.material)) obj.material.forEach((m) => disposeMat(m));
        else disposeMat(obj.material);
      }
    });
  }
}

function disposeMat(m) {
  if (m.map) m.map.dispose();
  m.dispose();
}

function makeTextSprite(text) {
  const size = 64;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size * 0.32, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 36px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, size / 2, size / 2 + 1);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: true });
  const spr = new THREE.Sprite(mat);
  spr.scale.set(0.45, 0.45, 1);
  return spr;
}

// --------------------------------------------------------------- Singleton-API

let instance = null;

export function getBoard3d() {
  return instance;
}

/** Vor root.innerHTML aufrufen. */
export function detachBoard3d() {
  if (instance) instance.detach();
}

/**
 * Nach dem Rendern: Host fuellen.
 * @param {HTMLElement|null} host
 * @param {object} options
 * @param {(nodeId: string) => void} onNodeTap
 */
export function mountBoard3d(host, options, onNodeTap) {
  if (!host) {
    if (instance) {
      instance.dispose();
      instance = null;
    }
    return null;
  }
  if (!instance) instance = new Board3DView();
  instance.attach(host, options, onNodeTap);
  return instance;
}

export function disposeBoard3d() {
  if (instance) {
    instance.dispose();
    instance = null;
  }
}
