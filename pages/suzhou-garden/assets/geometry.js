import * as T from './vendor/three/build/three.module.min.js';
import { mergeGeometries } from './vendor/three/examples/jsm/utils/BufferGeometryUtils.js';

export class Builder {
  constructor(root) { this.root = root; this.batches = new Map(); this.instances = new Map(); this.dummy = new T.Object3D(); }
  add(geometry, material, position = [0, 0, 0], rotation = [0, 0, 0], scale = [1, 1, 1], cast = true) {
    const g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
    if (!g.attributes.uv) g.setAttribute('uv', new T.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (!g.attributes.normal) g.computeVertexNormals();
    for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
    this.dummy.position.set(...position); this.dummy.rotation.set(...rotation); this.dummy.scale.set(...scale); this.dummy.updateMatrix(); g.applyMatrix4(this.dummy.matrix);
    // Spatial cells let a walk through one courtyard cull the other courtyards.
    const key = `${material.uuid}:${Math.floor(position[0] / 24)}:${Math.floor(position[2] / 24)}:${cast}`;
    if (!this.batches.has(key)) this.batches.set(key, { material, geometries: [], cast });
    this.batches.get(key).geometries.push(g);
    return g;
  }
  box(material, x, y, z, w, h, d, rotation = 0, cast = true) { const g = new T.BoxGeometry(w, h, d); this.add(g, material, [x, y, z], [0, rotation, 0], [1, 1, 1], cast); g.dispose(); }
  beam(material, a, b, radius = .1, sides = 8, endRadius = radius) {
    const v1 = new T.Vector3(...a), v2 = new T.Vector3(...b), mid = v1.clone().add(v2).multiplyScalar(.5);
    const q = new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), v2.sub(v1).normalize());
    const g = new T.CylinderGeometry(endRadius, radius, new T.Vector3(...a).distanceTo(new T.Vector3(...b)), sides);
    const e = new T.Euler().setFromQuaternion(q); this.add(g, material, mid.toArray(), [e.x, e.y, e.z]); g.dispose();
  }
  instance(key, geometry, material, position, rotation = [0, 0, 0], scale = [1, 1, 1], color = null, cast = true) {
    const cell = `${key}:${Math.floor(position[0] / 26)}:${Math.floor(position[2] / 26)}`;
    if (!this.instances.has(cell)) this.instances.set(cell, { geometry, material, records: [], cast });
    this.dummy.position.set(...position); this.dummy.rotation.set(...rotation); this.dummy.scale.set(...scale); this.dummy.updateMatrix();
    this.instances.get(cell).records.push({ matrix: this.dummy.matrix.clone(), color });
  }
  finish() {
    for (const { material, geometries, cast } of this.batches.values()) {
      const merged = mergeGeometries(geometries, false); for (const g of geometries) g.dispose();
      if (!merged) throw new Error('场景几何合并失败');
      const mesh = new T.Mesh(merged, material); mesh.castShadow = cast; mesh.receiveShadow = true; this.root.add(mesh);
    }
    for (const { geometry, material, records, cast } of this.instances.values()) {
      const mesh = new T.InstancedMesh(geometry, material, records.length);
      records.forEach((r, i) => { mesh.setMatrixAt(i, r.matrix); if (r.color) mesh.setColorAt(i, new T.Color(r.color)); });
      mesh.castShadow = cast; mesh.receiveShadow = true; mesh.computeBoundingSphere(); this.root.add(mesh);
    }
    this.batches.clear(); this.instances.clear();
  }
}

export function ribbon(points, width, height = .46) {
  const positions = [], uvs = [], indices = []; let distance = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i], prev = points[Math.max(0, i - 1)], next = points[Math.min(points.length - 1, i + 1)];
    const dx = next[0] - prev[0], dz = next[1] - prev[1], l = Math.hypot(dx, dz) || 1;
    if (i) distance += Math.hypot(p[0] - prev[0], p[1] - prev[1]);
    for (const side of [-1, 1]) { positions.push(p[0] - dz / l * width / 2 * side, typeof height === 'function' ? height(i / (points.length - 1)) : height, p[1] + dx / l * width / 2 * side); uvs.push((side + 1) * width / 4, distance / 2); }
    if (i) { const k = i * 2; indices.push(k - 2, k - 1, k, k, k - 1, k + 1); }
  }
  const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(positions, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(uvs, 2)); g.setIndex(indices); g.computeVertexNormals(); return g;
}

export function irregularRock(seed = 1, detail = 2) {
  const g = new T.IcosahedronGeometry(1, detail), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const n = 1 + .13 * Math.sin(x * 8 + seed) * Math.cos(z * 7 - seed) + .12 * Math.sin(y * 11 + z * 6) + .07 * Math.cos(x * 19 + y * 10 + seed);
    p.setXYZ(i, x * n + .09 * Math.sin(y * 5), y * n, z * n);
  }
  g.computeVertexNormals();
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) { uv[i * 2] = p.getX(i) * .65 + p.getZ(i) * .35; uv[i * 2 + 1] = p.getY(i) * .7 + p.getZ(i) * .25; }
  g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); return g;
}

export function curvedTube(points, radius = .06, tubular = 20, radial = 6) {
  const curve = new T.CatmullRomCurve3(points.map(p => new T.Vector3(...p)));
  return new T.TubeGeometry(curve, tubular, radius, radial, false);
}

// A small signed-distance mesher produces limestone with through-holes, not dark spots.
export function scholarRock(seed = 1, resolution = 27) {
  const n = resolution, size = n + 1, field = new Float32Array(size ** 3);
  const index = (x, y, z) => x + size * (y + size * z);
  function sdf(x, y, z) {
    const bulge = .63 + .14 * Math.sin(y * 6 + seed) + .12 * Math.cos(y * 11 - seed);
    let d = Math.hypot(x / bulge, z / (.55 + .09 * Math.cos(y * 8))) - 1;
    d = Math.max(d, Math.abs(y) - .97);
    d += .09 * Math.sin(x * 12 + seed) * Math.cos(y * 9 + z * 5) + .045 * Math.cos(z * 21 - y * 11);
    for (const [cx, cy, radius] of [[-.13, .42, .25], [.15, -.24, .27], [-.26, -.67, .17]]) {
      const hole = Math.hypot(x - cx - Math.sin(z * 2.2 + seed) * .065, (y - cy) * 1.3) - radius;
      d = Math.max(d, -hole);
    }
    return d;
  }
  for (let z = 0; z <= n; z++) for (let y = 0; y <= n; y++) for (let x = 0; x <= n; x++) field[index(x, y, z)] = sdf(x / n * 2.4 - 1.2, y / n * 2.4 - 1.2, z / n * 2.4 - 1.2);
  const pos = [], uvs = [], cube = [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]];
  const tets = [[0, 5, 1, 6], [0, 1, 2, 6], [0, 2, 3, 6], [0, 3, 7, 6], [0, 7, 4, 6], [0, 4, 5, 6]];
  function emit(a, b, c) {
    const v1 = new T.Vector3(...b).sub(new T.Vector3(...a)), v2 = new T.Vector3(...c).sub(new T.Vector3(...a));
    const normal = v1.cross(v2).normalize(), center = a.map((v, i) => (v + b[i] + c[i]) / 3), e = .002;
    const grad = new T.Vector3(sdf(center[0] + e, center[1], center[2]) - sdf(center[0] - e, center[1], center[2]), sdf(center[0], center[1] + e, center[2]) - sdf(center[0], center[1] - e, center[2]), sdf(center[0], center[1], center[2] + e) - sdf(center[0], center[1], center[2] - e));
    if (normal.dot(grad) < 0) [b, c] = [c, b];
    for (const v of [a, b, c]) { pos.push(...v); uvs.push(v[0] + v[2] * .3, v[1]); }
  }
  for (let z = 0; z < n; z++) for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const pts = cube.map(c => [(x + c[0]) / n * 2.4 - 1.2, (y + c[1]) / n * 2.4 - 1.2, (z + c[2]) / n * 2.4 - 1.2]);
    const ds = cube.map(c => field[index(x + c[0], y + c[1], z + c[2])]);
    if (ds.every(d => d > 0) || ds.every(d => d <= 0)) continue;
    for (const tet of tets) {
      const inside = tet.filter(i => ds[i] <= 0), outside = tet.filter(i => ds[i] > 0); if (!inside.length || !outside.length) continue;
      const interp = (a, b) => { const t = ds[a] / (ds[a] - ds[b]); return pts[a].map((p, i) => p + (pts[b][i] - p) * t); };
      if (inside.length === 1) emit(...outside.map(i => interp(inside[0], i)));
      else if (inside.length === 3) emit(...inside.map(i => interp(outside[0], i)));
      else { const [a, b] = inside, [c, d] = outside, ac = interp(a, c), ad = interp(a, d), bc = interp(b, c), bd = interp(b, d); emit(ac, ad, bc); emit(ad, bd, bc); }
    }
  }
  const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(uvs, 2));
  const normals = [];
  for (let i = 0; i < pos.length; i += 3) { const [x, y, z] = pos.slice(i, i + 3), e = .005; const v = new T.Vector3(sdf(x + e, y, z) - sdf(x - e, y, z), sdf(x, y + e, z) - sdf(x, y - e, z), sdf(x, y, z + e) - sdf(x, y, z - e)).normalize(); normals.push(v.x, v.y, v.z); }
  g.setAttribute('normal', new T.Float32BufferAttribute(normals, 3)); return g;
}
