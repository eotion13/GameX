// Three.js-Brettansicht. Reine Praesentation - keine Regel-Logik.
// Aktivierung: ?view=3d  oder  localStorage knotenpunkt.view=3d
// Wird dynamisch geladen (app.js), damit 2D/CI Three.js nicht ziehen.

import * as THREE from '../../vendor/three/three.module.min.js';
import { OrbitControls } from '../../vendor/three/OrbitControls.js';
import { TYPE_INFO } from '../engine/rules.js';
import { occupancy } from '../engine/state.js';
import { createFigureMesh } from './figures.js';
import { isView3d, setView3d } from './view-flag.js';

export { isView3d, setView3d };

const NODE_R = 0.32;

function hexColor(hex) {
  return new THREE.Color(hex || '#888888');
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
    this._nodeMeshes = new Map();
    this._unitRoots = new Map(); // unitId -> Object3D
    this._orderGroup = new THREE.Group();
    this._flashMeshes = new Map();
    this._revealFrame = null;
    this._content = new THREE.Group();
    this._pointer = new THREE.Vector2();
    this._raycaster = new THREE.Raycaster();
    this._dragDist = 0;
    this._pointerDown = null;

    this.canvas = document.createElement('canvas');
    this.canvas.className = 'board3d-canvas';
    this.canvas.setAttribute('aria-label', 'Spielfeld 3D');

    try {
      this.renderer = new THREE.WebGLRenderer({
        canvas: this.canvas,
        antialias: true,
        alpha: true,
        powerPreference: 'low-power',
      });
    } catch (err) {
      const e = new Error('WebGL nicht verfügbar');
      e.cause = err;
      throw e;
    }
    this.renderer.setClearColor(0x0a0e18, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0e18);
    this.scene.fog = new THREE.Fog(0x0a0e18, 14, 32);
    this.scene.add(this._content);

    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 80);
    this.camera.position.set(0, 9, 7.5);
    this.camera.lookAt(0, 0, 0);

    // Weiches Environment: Hemisphaere + Key + kühler Rim (eine Key-Light, mobilfreundlich)
    const hemi = new THREE.HemisphereLight(0xc5d4f0, 0x1c1812, 0.55);
    const key = new THREE.DirectionalLight(0xfff2d6, 0.9);
    key.position.set(5, 12, 4);
    const rim = new THREE.DirectionalLight(0x7a9cff, 0.28);
    rim.position.set(-6, 4, -5);
    this.scene.add(hemi, key, rim);

    // Dezente Boden-Aura (kein Shadow-Map — Leistungsbudget)
    const glow = new THREE.Mesh(
      new THREE.CircleGeometry(8, 48),
      new THREE.MeshBasicMaterial({
        color: 0x1a2740, transparent: true, opacity: 0.35, depthWrite: false,
      }),
    );
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = -0.06;
    this.scene.add(glow);

    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.enablePan = false;
    this.controls.minDistance = 5;
    this.controls.maxDistance = 16;
    // Top-down-ish: kein flacher Cheat-Winkel auf Gegnerbefehle
    this.controls.minPolarAngle = 0.18;
    this.controls.maxPolarAngle = Math.PI * 0.42;
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
    this._revealFrame = null;
    this._rebuild();
  }

  /**
   * Reveal-Frame anwenden (keine Zustandsmutation).
   * Erwartet Frame aus reveal.sampleFrame / createReveal.
   */
  applyRevealFrame(frame) {
    this._revealFrame = frame;
    if (!frame || !this.options?.state) return;

    // Befehls-Pfeile ein-/ausblenden
    const op = frame.orderOpacity ?? 0;
    this._orderGroup.visible = op > 0.02;
    this._orderGroup.traverse((obj) => {
      if (obj.material && obj.material.opacity !== undefined) {
        obj.material.transparent = true;
        obj.material.opacity = (obj.userData.baseOpacity ?? 0.9) * op;
      }
    });

    // Einheitenpositionen / Scale / Opacity
    for (const [unitId, root] of this._unitRoots) {
      const pos = frame.unitPos?.[unitId];
      const sc = frame.unitScale?.[unitId];
      const opa = frame.unitOpacity?.[unitId];
      if (pos) {
        root.position.set(pos.x, 0.08 + (pos.y || 0), pos.z);
      }
      const s = sc === undefined ? 1 : sc;
      root.scale.setScalar(Math.max(0.001, s));
      root.visible = (opa === undefined ? 1 : opa) > 0.02 && s > 0.02;
      root.traverse((obj) => {
        if (obj.isMesh && obj.material) {
          obj.material.transparent = true;
          obj.material.opacity = opa === undefined ? 1 : opa;
        }
      });
    }

    // Neu gebaute Einheiten spaeten
    for (const unitId of Object.keys(frame.unitPos || {})) {
      const pos = frame.unitPos[unitId];
      if (!pos?.spawn || this._unitRoots.has(unitId)) continue;
      const state = this.options.state;
      const col = hexColor(state.players[pos.owner]?.color);
      const mesh = createFigureMesh(pos.unitType, col);
      const root = new THREE.Group();
      root.add(mesh);
      const label = makeTextSprite(TYPE_INFO[pos.unitType].short);
      label.position.set(0, 0.72, 0);
      root.add(label);
      root.position.set(pos.x, 0.08 + (pos.y || 0), pos.z);
      root.scale.setScalar(Math.max(0.001, frame.unitScale?.[unitId] ?? 1));
      root.userData.unitId = unitId;
      this._content.add(root);
      this._unitRoots.set(unitId, root);
    }

    // Quellen-Flash (Besitzwechsel)
    for (const [nodeId, flash] of Object.entries(frame.controlFlash || {})) {
      let ring = this._flashMeshes.get(nodeId);
      const n = this.options.state.board.nodes[nodeId];
      if (!n) continue;
      if (!ring) {
        const col = hexColor(this.options.state.players[flash.owner]?.color);
        ring = new THREE.Mesh(
          new THREE.RingGeometry(NODE_R + 0.05, NODE_R + 0.28, 28),
          new THREE.MeshBasicMaterial({
            color: col, transparent: true, opacity: 0, side: THREE.DoubleSide,
          }),
        );
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(n.x, 0.16, n.y);
        this._content.add(ring);
        this._flashMeshes.set(nodeId, ring);
      }
      ring.material.opacity = 0.75 * (flash.intensity || 0);
      ring.visible = (flash.intensity || 0) > 0.02;
    }
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
    this._unitRoots.clear();
    this._flashMeshes.clear();
    this._orderGroup = new THREE.Group();

    const o = this.options;
    if (!o || !o.state) return;
    const { state } = o;
    const board = state.board;
    const occ = occupancy(state);
    const highlight = new Set(o.highlight || []);
    const ordered = o.ordered || new Set();
    // Reveal: Pfeile erst per Frame einblenden, wenn animateOrders gesetzt
    const animateOrders = !!o.animateOrders;
    const initialOrderOpacity = animateOrders ? 0 : 1;

    const floor = new THREE.Mesh(
      new THREE.CircleGeometry((board.radius || board.rings) + 1.4, 48),
      new THREE.MeshStandardMaterial({
        color: 0x141b2a, roughness: 0.88, metalness: 0.08,
        emissive: 0x0a1220, emissiveIntensity: 0.25,
      }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.04;
    this._content.add(floor);

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

    // Befehlspfeile
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
      const baseOp = ord.action === 'bewegen' ? 0.95 : 0.55;
      const geo = new THREE.BufferGeometry().setFromPoints(points);
      const mat = new THREE.LineBasicMaterial({
        color: col,
        transparent: true,
        opacity: baseOp * initialOrderOpacity,
      });
      const line = new THREE.Line(geo, mat);
      line.userData.baseOpacity = baseOp;
      this._orderGroup.add(line);
      if (ord.action !== 'bewegen') {
        const tip = new THREE.Mesh(
          new THREE.SphereGeometry(0.08, 10, 10),
          new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: baseOp * initialOrderOpacity }),
        );
        tip.position.set(b.x, y, b.y);
        tip.userData.baseOpacity = baseOp;
        this._orderGroup.add(tip);
      } else {
        const dir = new THREE.Vector3(b.x - a.x, 0, b.y - a.y).normalize();
        const cone = new THREE.Mesh(
          new THREE.ConeGeometry(0.08, 0.18, 6),
          new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: baseOp * initialOrderOpacity }),
        );
        cone.position.set(b.x - dir.x * 0.25, y, b.y - dir.z * 0.25);
        cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
        cone.userData.baseOpacity = baseOp;
        this._orderGroup.add(cone);
      }
    }
    this._orderGroup.visible = initialOrderOpacity > 0.02;
    this._content.add(this._orderGroup);

    // Einheiten (typunterscheidbare Figuren)
    for (const id of board.order) {
      const u = occ[id];
      if (!u) continue;
      const n = board.nodes[id];
      const col = hexColor(state.players[u.owner].color);
      const sel = o.selection && o.selection.unitId === u.id;
      const mine = o.viewerId === u.owner;
      const mesh = createFigureMesh(u.type, col, {
        emissive: sel ? 0xffd166 : 0x000000,
        emissiveIntensity: sel ? 0.35 : 0,
      });
      const root = new THREE.Group();
      root.add(mesh);
      root.position.set(n.x, 0.08, n.y);
      root.userData.unitId = u.id;
      root.userData.nodeId = id;
      this._content.add(root);
      this._unitRoots.set(u.id, root);
      this._nodeMeshes.set(`${id}__unit`, mesh);
      mesh.userData.nodeId = id;

      if (mine) {
        const halo = new THREE.Mesh(
          new THREE.RingGeometry(0.2, 0.26, 20),
          new THREE.MeshBasicMaterial({
            color: 0xffffff, transparent: true, opacity: 0.35, side: THREE.DoubleSide,
          }),
        );
        halo.rotation.x = -Math.PI / 2;
        halo.position.set(0, 0.06, 0);
        root.add(halo);
      }

      if (ordered.has(u.id)) {
        const dot = new THREE.Mesh(
          new THREE.SphereGeometry(0.06, 8, 8),
          new THREE.MeshBasicMaterial({ color: 0xffd166 }),
        );
        dot.position.set(0.22, 0.55, -0.18);
        root.add(dot);
      }

      const label = makeTextSprite(TYPE_INFO[u.type].short);
      label.position.set(0, 0.72, 0);
      root.add(label);
    }

    const span = (board.radius || board.rings) + 1.2;
    this.controls.minDistance = span * 1.4;
    this.controls.maxDistance = span * 4.2;

    if (this._revealFrame) this.applyRevealFrame(this._revealFrame);
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

export function detachBoard3d() {
  if (instance) instance.detach();
}

export function mountBoard3d(host, options, onNodeTap) {
  if (!host) {
    if (instance) {
      instance.dispose();
      instance = null;
    }
    return null;
  }
  try {
    if (!instance) instance = new Board3DView();
    instance.attach(host, options, onNodeTap);
    return instance;
  } catch (err) {
    console.warn('3D-Brett nicht verfügbar:', err);
    try { instance?.dispose(); } catch (_) { /* ok */ }
    instance = null;
    return null;
  }
}

export function disposeBoard3d() {
  if (instance) {
    instance.dispose();
    instance = null;
  }
}

/** Reveal-Frame an die aktuelle 3D-Instanz senden (no-op ohne Instanz). */
export function applyBoard3dReveal(frame) {
  if (instance) instance.applyRevealFrame(frame);
}
