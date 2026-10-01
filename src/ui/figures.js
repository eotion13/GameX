// Typunterscheidbare Figuren (Stufe 1: Code-Meshes, kein Blender/GLB noetig).
// Silhouetten klar: Reiter (spitz/vorwaerts), Bogen (schlank+Bogen), Schild (breit+Platte).

import * as THREE from '../../vendor/three/three.module.min.js';

/**
 * Baut eine zusammengesetzte Geometrie fuer den Einheitstyp.
 * Pivot unten mittig; Y nach oben. Aufrufer faerbt per Material.
 */
export function createFigureGeometry(type) {
  if (type === 'reiter') return mergeGeometries([
    // Rumpf
    box(0.22, 0.22, 0.36, 0, 0.28, 0),
    // Hals/Kopf nach vorne
    cone(0.1, 0.22, 6, 0, 0.42, -0.22, Math.PI / 2, 0, 0),
    // Beine
    cyl(0.04, 0.04, 0.2, 6, -0.08, 0.1, 0.1),
    cyl(0.04, 0.04, 0.2, 6, 0.08, 0.1, 0.1),
    cyl(0.04, 0.04, 0.2, 6, -0.08, 0.1, -0.1),
    cyl(0.04, 0.04, 0.2, 6, 0.08, 0.1, -0.1),
  ]);
  if (type === 'bogen') return mergeGeometries([
    // schlanker Koerper
    cyl(0.07, 0.09, 0.48, 8, 0, 0.24, 0),
    // Bogen (Torus-Segment als Ring hinten)
    torus(0.2, 0.035, 6, 12, Math.PI, 0.12, 0.32, 0, 0, Math.PI / 2, 0),
    // Pfeilspitze oben
    cone(0.05, 0.12, 6, 0, 0.55, 0, 0, 0, 0),
  ]);
  // schild
  return mergeGeometries([
    // Koerper hinter dem Schild
    cyl(0.08, 0.1, 0.36, 8, 0, 0.2, 0.06),
    // Schildplatte (breit, flach)
    box(0.42, 0.48, 0.08, 0, 0.28, -0.06),
    // Schildbuckel
    sphere(0.06, 8, 6, 0, 0.28, -0.12),
  ]);
}

export function createFigureMesh(type, color, opts = {}) {
  const geo = createFigureGeometry(type);
  const mat = new THREE.MeshStandardMaterial({
    color,
    emissive: opts.emissive || 0x000000,
    emissiveIntensity: opts.emissiveIntensity || 0,
    roughness: 0.42,
    metalness: 0.22,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.userData.unitType = type;
  mesh.castShadow = false;
  return mesh;
}

// --------------------------------------------------------------- helpers

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
  // Manuelles Merge ohne BufferGeometryUtils-Addon (kein Extra-Vendor).
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
