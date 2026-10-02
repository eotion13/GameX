// Typunterscheidbare Figuren (Code-Meshes).
// Koerper = neutrales Material; Spielerfarbe nur auf Akzenten (Schild/Banner/Cape).

import * as THREE from '../../vendor/three/three.module.min.js';

const BODY = 0x7a7468;
const LEATHER = 0x4a3c2e;
const METAL = 0x8a9098;

/**
 * @param {string} type reiter|bogen|schild
 * @param {THREE.Color|number|string} accentColor Spielerfarbe fuer Akzente
 * @param {object} [opts]
 * @returns {THREE.Group}
 */
export function createFigureMesh(type, accentColor, opts = {}) {
  const accent = accentColor instanceof THREE.Color
    ? accentColor
    : new THREE.Color(accentColor || '#888888');

  const bodyMat = new THREE.MeshStandardMaterial({
    color: BODY, roughness: 0.55, metalness: 0.18,
    emissive: opts.emissive || 0x000000,
    emissiveIntensity: opts.emissiveIntensity || 0,
  });
  const leatherMat = new THREE.MeshStandardMaterial({
    color: LEATHER, roughness: 0.75, metalness: 0.05,
    emissive: opts.emissive || 0x000000,
    emissiveIntensity: (opts.emissiveIntensity || 0) * 0.5,
  });
  const metalMat = new THREE.MeshStandardMaterial({
    color: METAL, roughness: 0.35, metalness: 0.55,
  });
  const accentMat = new THREE.MeshStandardMaterial({
    color: accent, roughness: 0.45, metalness: 0.15,
    emissive: accent, emissiveIntensity: 0.08 + (opts.emissiveIntensity || 0) * 0.4,
  });

  const root = new THREE.Group();
  root.userData.unitType = type;

  if (type === 'reiter') {
    // Pferd
    root.add(mesh(box(0.22, 0.22, 0.36, 0, 0.28, 0), leatherMat));
    root.add(mesh(cone(0.1, 0.22, 6, 0, 0.42, -0.22, Math.PI / 2, 0, 0), leatherMat));
    for (const [x, z] of [[-0.08, 0.1], [0.08, 0.1], [-0.08, -0.1], [0.08, -0.1]]) {
      root.add(mesh(cyl(0.04, 0.04, 0.2, 6, x, 0.1, z), leatherMat));
    }
    // Reiter + Cape (Akzent)
    root.add(mesh(cyl(0.07, 0.08, 0.22, 8, 0, 0.48, 0.02), bodyMat));
    root.add(mesh(box(0.16, 0.2, 0.06, 0, 0.48, 0.12), accentMat));
  } else if (type === 'bogen') {
    root.add(mesh(cyl(0.07, 0.09, 0.48, 8, 0, 0.24, 0), bodyMat));
    root.add(mesh(torus(0.2, 0.035, 6, 12, Math.PI, 0.12, 0.32, 0, 0, Math.PI / 2, 0), metalMat));
    root.add(mesh(cone(0.05, 0.12, 6, 0, 0.55, 0, 0, 0, 0), metalMat));
    // Kocher / Schulterband (Akzent)
    root.add(mesh(cyl(0.05, 0.05, 0.18, 6, 0.12, 0.28, -0.02), accentMat));
    root.add(mesh(box(0.14, 0.08, 0.04, 0, 0.4, 0.08), accentMat));
  } else {
    // schild
    root.add(mesh(cyl(0.08, 0.1, 0.36, 8, 0, 0.2, 0.06), bodyMat));
    root.add(mesh(box(0.42, 0.48, 0.08, 0, 0.28, -0.06), accentMat));
    root.add(mesh(sphere(0.06, 8, 6, 0, 0.28, -0.12), metalMat));
  }

  root.traverse((o) => {
    if (o.isMesh) o.userData.unitType = type;
  });
  return root;
}

/** @deprecated Geometrie-API bleibt fuer Tests; bevorzugte API ist createFigureMesh. */
export function createFigureGeometry(type) {
  // Flatten: merge first mesh children of a temp figure for legacy callers.
  const g = createFigureMesh(type, 0x888888);
  const geos = [];
  g.traverse((o) => {
    if (o.isMesh && o.geometry) {
      const clone = o.geometry.clone();
      o.updateWorldMatrix(true, false);
      clone.applyMatrix4(o.matrixWorld);
      geos.push(clone);
    }
  });
  return mergeGeometries(geos);
}

function mesh(geo, mat) {
  return new THREE.Mesh(geo, mat);
}

function box(w, h, d, x, y, z) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return g;
}

function cyl(rt, rb, h, seg, x, y, z) {
  const g = new THREE.CylinderGeometry(rt, rb, h, seg);
  g.translate(x, y, z);
  return g;
}

function cone(r, h, seg, x, y, z, rx = 0, ry = 0, rz = 0) {
  const g = new THREE.ConeGeometry(r, h, seg);
  g.rotateX(rx);
  g.rotateY(ry);
  g.rotateZ(rz);
  g.translate(x, y, z);
  return g;
}

function sphere(r, w, h, x, y, z) {
  const g = new THREE.SphereGeometry(r, w, h);
  g.translate(x, y, z);
  return g;
}

function torus(r, tube, radSeg, tubeSeg, arc, x, y, z, rx = 0, ry = 0, rz = 0) {
  const g = new THREE.TorusGeometry(r, tube, radSeg, tubeSeg, arc);
  g.rotateX(rx);
  g.rotateY(ry);
  g.rotateZ(rz);
  g.translate(x, y, z);
  return g;
}

function mergeGeometries(list) {
  let totalVerts = 0;
  let totalIdx = 0;
  const prepared = list.map((g) => {
    const pos = g.getAttribute('position');
    const nrm = g.getAttribute('normal');
    let idx = g.index;
    if (!idx) {
      const n = pos.count;
      const arr = new Uint32Array(n);
      for (let i = 0; i < n; i++) arr[i] = i;
      idx = new THREE.BufferAttribute(arr, 1);
    }
    const base = totalVerts;
    totalVerts += pos.count;
    totalIdx += idx.count;
    return { pos, nrm, idx, base, geo: g };
  });

  const positions = new Float32Array(totalVerts * 3);
  const normals = new Float32Array(totalVerts * 3);
  const indices = new Uint32Array(totalIdx);
  let vOff = 0;
  let iOff = 0;
  for (const p of prepared) {
    positions.set(p.pos.array, vOff * 3);
    if (p.nrm) normals.set(p.nrm.array, vOff * 3);
    const ia = p.idx.array;
    for (let i = 0; i < ia.length; i++) indices[iOff + i] = ia[i] + p.base;
    vOff += p.pos.count;
    iOff += ia.length;
    p.geo.dispose();
  }

  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  out.setIndex(new THREE.BufferAttribute(indices, 1));
  out.computeVertexNormals();
  return out;
}
