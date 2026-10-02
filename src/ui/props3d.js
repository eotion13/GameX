// Umwelt-Props fuer die 3D-Praesentation. Keine Spielregeln.
// Quellen = Brunnen + Banner; Basen = Podest; Wege = Steinpfade.

import * as THREE from '../../vendor/three/three.module.min.js';

const STONE = 0x6a6558;
const STONE_DARK = 0x3d3a32;
const WATER = 0x4a7a8c;

/**
 * Heiliger Brunnen / Monument fuer eine Quelle.
 * @param {THREE.Color} [bannerColor] Spielerfarbe oder null (neutral)
 */
export function createSourceProp(bannerColor = null) {
  const g = new THREE.Group();
  g.name = 'SourceWell';

  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(0.28, 0.32, 0.12, 16),
    new THREE.MeshStandardMaterial({ color: STONE, roughness: 0.85, metalness: 0.08 }),
  );
  base.position.y = 0.06;
  g.add(base);

  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(0.2, 0.04, 8, 20),
    new THREE.MeshStandardMaterial({ color: STONE_DARK, roughness: 0.7, metalness: 0.12 }),
  );
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.14;
  g.add(rim);

  const water = new THREE.Mesh(
    new THREE.CircleGeometry(0.16, 16),
    new THREE.MeshStandardMaterial({
      color: WATER, roughness: 0.2, metalness: 0.45,
      emissive: 0x1a3040, emissiveIntensity: 0.35,
    }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.y = 0.12;
  g.add(water);

  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.025, 0.03, 0.55, 8),
    new THREE.MeshStandardMaterial({ color: 0x4a3c2a, roughness: 0.8 }),
  );
  pole.position.set(0.22, 0.35, 0.1);
  g.add(pole);

  const clothCol = bannerColor || new THREE.Color(0xb0a890);
  const cloth = new THREE.Mesh(
    new THREE.PlaneGeometry(0.22, 0.16),
    new THREE.MeshStandardMaterial({
      color: clothCol, roughness: 0.65, metalness: 0.05,
      side: THREE.DoubleSide,
      emissive: clothCol, emissiveIntensity: bannerColor ? 0.12 : 0,
    }),
  );
  cloth.position.set(0.34, 0.52, 0.1);
  g.add(cloth);

  return g;
}

/** Basis-Podest mit Spielerakzent (nicht vollflaechig knallig). */
export function createBaseMarker(playerColor) {
  const g = new THREE.Group();
  const pad = new THREE.Mesh(
    new THREE.BoxGeometry(0.72, 0.08, 0.72),
    new THREE.MeshStandardMaterial({ color: 0x2a3140, roughness: 0.9, metalness: 0.05 }),
  );
  pad.position.y = 0.02;
  g.add(pad);

  const trim = new THREE.Mesh(
    new THREE.BoxGeometry(0.78, 0.03, 0.78),
    new THREE.MeshStandardMaterial({
      color: playerColor, roughness: 0.55, metalness: 0.2,
      transparent: true, opacity: 0.55,
    }),
  );
  trim.position.y = 0.06;
  g.add(trim);

  const post = new THREE.Mesh(
    new THREE.CylinderGeometry(0.03, 0.035, 0.4, 8),
    new THREE.MeshStandardMaterial({ color: 0x3a3228, roughness: 0.85 }),
  );
  post.position.set(0.28, 0.25, 0.28);
  g.add(post);

  const flag = new THREE.Mesh(
    new THREE.PlaneGeometry(0.2, 0.12),
    new THREE.MeshStandardMaterial({
      color: playerColor, side: THREE.DoubleSide, roughness: 0.6,
      emissive: playerColor, emissiveIntensity: 0.1,
    }),
  );
  flag.position.set(0.4, 0.4, 0.28);
  g.add(flag);
  return g;
}

/** Steiniger Weg zwischen zwei Knoten. */
export function createPathSegment(ax, az, bx, bz, mat) {
  const dx = bx - ax;
  const dz = bz - az;
  const len = Math.hypot(dx, dz) || 1;
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(len * 0.9, 0.04, 0.14),
    mat,
  );
  mesh.position.set((ax + bx) / 2, 0.02, (az + bz) / 2);
  mesh.rotation.y = -Math.atan2(dz, dx);
  return mesh;
}

/** Terrain-Platte mit leichtem Farbverlauf (Canvas-Textur). */
export function createTerrainDisk(radius) {
  const size = 256;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, size * 0.08, size / 2, size / 2, size * 0.5);
  g.addColorStop(0, '#2a3344');
  g.addColorStop(0.45, '#1c2433');
  g.addColorStop(1, '#0e1420');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  // dezentes Rauschen
  const img = ctx.getImageData(0, 0, size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 12;
    img.data[i] = Math.max(0, Math.min(255, img.data[i] + n));
    img.data[i + 1] = Math.max(0, Math.min(255, img.data[i + 1] + n));
    img.data[i + 2] = Math.max(0, Math.min(255, img.data[i + 2] + n));
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(
    new THREE.CircleGeometry(radius, 64),
    new THREE.MeshStandardMaterial({
      map: tex, roughness: 0.92, metalness: 0.04,
    }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = -0.05;
  return mesh;
}
