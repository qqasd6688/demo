// Metres, with north toward -Z. Shared by the scene, map and walking controller.
export const BOUNDS = { minX: -68, maxX: 68, minZ: -53, maxZ: 53 };
export const WATER = -0.12;
export const GROUND = 0.42;
export const EYE_HEIGHT = 1.68;
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const lerp = (a, b, t) => a + (b - a) * t;

export function seeded(seed = 271828) {
  return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
export function shoreRadius(a) { return 1 + .085 * Math.sin(a * 3 + .6) + .045 * Math.cos(a * 5 - .8); }
export function shorePoint(a, offset = 0) { const r = shoreRadius(a); return [Math.cos(a) * (30 * r + offset), Math.sin(a) * (21 * r + offset)]; }
export function pondDistance(x, z) {
  const a = Math.atan2(z / 21, x / 30);
  return (Math.hypot(x / 30, z / 21) - shoreRadius(a)) * 24;
}
export const inPond = (x, z, margin = 0) => pondDistance(x, z) < margin;

export const HALLS = [
  { id: 'hall', name: '听雨轩', x: 0, z: -31, w: 22, d: 9, h: 4.4, rotation: 0 },
  { id: 'tea', name: '涵碧山房', x: -49, z: -30, w: 14, d: 8, h: 3.8, rotation: 0 },
  { id: 'library', name: '见山书屋', x: 48, z: -32, w: 16, d: 9, h: 4, rotation: 0 },
  { id: 'gatehouse', name: '听雨园', x: 0, z: 46, w: 18, d: 7, h: 3.7, rotation: Math.PI },
  { id: 'westhall', name: '留云小筑', x: -49, z: 32, w: 13, d: 7, h: 3.8, rotation: 0 },
  { id: 'easttea', name: '竹里馆', x: 49, z: 30, w: 12, d: 7, h: 3.5, rotation: 0 },
];
export const BRIDGES = [
  { a: [32, 10], b: [24, 10], width: 2.3, height: .68, kind: 'wood' },
  { a: [24, 10], b: [24, 3], width: 2.3, height: .68, kind: 'wood' },
  { a: [24, 3], b: [13, 3], width: 2.3, height: .68, kind: 'wood' },
  { a: [-32, -7], b: [-22, -22], width: 3, height: .52, arch: 1.65, kind: 'stone' },
];
export const PAVILIONS = [
  { x: 13, z: 3, r: 4.5, y: .68, name: '听雨亭' },
  { x: -48, z: 2, r: 3.3, y: .42, name: '枕石亭' },
  { x: 46, z: 6, r: 3.1, y: .42, name: '竹影亭' },
];
export const GATES = [
  { x: 0, z: 34, length: 25, height: 4.6, radius: 1.85, rotation: 0, name: '入胜' },
  { x: -38, z: 12, length: 23, height: 4.3, radius: 1.75, rotation: Math.PI / 2, name: '寻幽' },
  { x: 37, z: -10, length: 24, height: 4.2, radius: 1.75, rotation: Math.PI / 2, name: '竹里' },
  { x: -26, z: -37, length: 13, height: 4.1, radius: 1.7, rotation: 0, name: '留云' },
];
export const PATHS = [
  [[0, 51], [0, 34], [0, 25]],
  [[-29, 15], [-38, 12], [-49, 12], [-49, 3], [-54, -9], [-49, -22]],
  [[-49, 12], [-49, 25], [-41, 38], [-21, 40], [-13, 34]],
  [[32, 10], [37, 12], [47, 12], [48, 23]],
  [[32, -10], [37, -10], [49, -10], [53, -20], [49, -25]],
  [[48, 23], [57, 17], [58, 0], [55, -15], [49, -25]],
  [[12, -30], [27, -31], [34, -37], [49, -39]],
  [[-12, -30], [-26, -37], [-38, -39], [-49, -37]],
  [[-28, 24], [-23, 34], [-13, 34]],
  [[20, 27], [28, 38], [44, 40], [49, 35]],
];
export const STOPS = [
  { id: 'water', title: '一池烟水', subtitle: '曲岸观荷', text: '水是园的留白。隔岸的檐、垂下的柳，都在这一池碧色里慢下来。', position: [-8, 2.1, 25.5], target: [9, 2.6, 1], map: [-8, 25.5], number: '壹' },
  { id: 'pavilion', title: '坐听风荷', subtitle: '听雨亭', text: '曲桥转了三折，才把人送到水中央。凭栏坐下，风从荷叶之间经过。', position: [13, 2.36, 5.3], target: [-5, 1.7, -4], map: [13, 3], number: '贰' },
  { id: 'moon', title: '一门一境', subtitle: '月洞入胜', text: '一轮圆门收住满园远近。门内是山水，门外也有山水。', position: [0, 2.1, 39.5], target: [0, 2.1, 12], map: [0, 35], number: '叁' },
  { id: 'rock', title: '片石生山', subtitle: '叠山寻幽', text: '山不必高。石隙里的一线天光、松根下的一层青苔，自成丘壑。', position: [-43.5, 2.1, 13], target: [-51, 3.3, -4], map: [-48, 8], number: '肆' },
  { id: 'bamboo', title: '竹深有声', subtitle: '竹里清风', text: '穿过粉墙，风声换成了竹声。沿着青石小路，再向幽深处走一程。', position: [43, 2.1, -9], target: [53, 3.6, 7], map: [49, -4], number: '伍' },
  { id: 'hall', title: '半日闲坐', subtitle: '听雨轩', text: '一席茶，一卷书。檐口把光裁得很低，水面把天映得很远。', position: [0, 2.28, -27.5], target: [10, 2, 10], map: [0, -28], number: '陆' },
];

export function segmentProjection(x, z, a, b) {
  const dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz;
  const t = clamp(((x - a[0]) * dx + (z - a[1]) * dz) / l2, 0, 1);
  return { t, distance: Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t) };
}
export function bridgeAt(x, z, inset = 0) {
  for (const b of BRIDGES) {
    const p = segmentProjection(x, z, b.a, b.b);
    if (p.distance <= b.width / 2 - inset) return { ...b, y: b.height + (b.arch || 0) * Math.sin(Math.PI * p.t), t: p.t };
  }
  return null;
}
export function floorAt(x, z) {
  const b = bridgeAt(x, z); if (b) return b.y;
  for (const p of PAVILIONS) if (Math.hypot(x - p.x, z - p.z) < p.r + .25) return p.y;
  for (const h of HALLS) if (Math.abs(x - h.x) < h.w / 2 + .5 && Math.abs(z - h.z) < h.d / 2 + .8) return .6;
  return GROUND;
}
export function pathDistance(x, z) {
  let distance = Math.abs(pondDistance(x, z) - 3.8);
  for (const path of PATHS) for (let i = 1; i < path.length; i++) distance = Math.min(distance, segmentProjection(x, z, path[i - 1], path[i]).distance);
  for (const b of BRIDGES) distance = Math.min(distance, segmentProjection(x, z, b.a, b.b).distance);
  return distance;
}
export function occupied(x, z, pad = 0) {
  if (inPond(x, z, 2 + pad) || pathDistance(x, z) < 2.2 + pad) return true;
  for (const h of HALLS) if (Math.abs(x - h.x) < h.w / 2 + 2 + pad && Math.abs(z - h.z) < h.d / 2 + 2 + pad) return true;
  for (const p of PAVILIONS) if (Math.hypot(x - p.x, z - p.z) < p.r + 2 + pad) return true;
  for (const g of GATES) { const c = Math.cos(g.rotation), s = Math.sin(g.rotation), dx = x - g.x, dz = z - g.z; if (Math.abs(dx * c - dz * s) < g.length / 2 + pad && Math.abs(dx * s + dz * c) < 1.5 + pad) return true; }
  return false;
}

export function createCollisionWorld() {
  const boxes = [], circles = [];
  function box(x, z, w, d, rotation = 0) { boxes.push({ x, z, w, d, c: Math.cos(rotation), s: Math.sin(rotation) }); }
  function circle(x, z, r) { circles.push({ x, z, r }); }
  for (const h of HALLS) {
    // Open doors face the pool; physical side and rear walls retain interior access.
    box(h.x - h.w / 2, h.z, .5, h.d);
    box(h.x + h.w / 2, h.z, .5, h.d);
    if (h.id !== 'gatehouse') box(h.x, h.z - h.d / 2, h.w, .5);
    const z = h.z + h.d / 2;
    for (const side of [-1, 1]) box(h.x + side * (h.w / 4 + 1.1), z, h.w / 2 - 2.2, .35);
  }
  for (const g of GATES) {
    const opening = g.radius * .82, section = g.length / 2 - opening;
    for (const s of [-1, 1]) { const u = s * (opening + section / 2); box(g.x + Math.cos(g.rotation) * u, g.z - Math.sin(g.rotation) * u, section, .65, g.rotation); }
  }
  function allowed(x, z, radius = .26) {
    if (x < BOUNDS.minX + radius || x > BOUNDS.maxX - radius || z < BOUNDS.minZ + radius || z > BOUNDS.maxZ - radius) return false;
    if (inPond(x, z, .38 + radius) && !bridgeAt(x, z, radius) && !PAVILIONS.some(p => Math.hypot(x - p.x, z - p.z) < p.r - radius)) return false;
    for (const b of boxes) { const dx = x - b.x, dz = z - b.z; if (Math.abs(dx * b.c - dz * b.s) < b.w / 2 + radius && Math.abs(dx * b.s + dz * b.c) < b.d / 2 + radius) return false; }
    for (const c of circles) if ((x - c.x) ** 2 + (z - c.z) ** 2 < (c.r + radius) ** 2) return false;
    return true;
  }
  function move(position, dx, dz) {
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / .15));
    let x = position.x, z = position.z;
    for (let i = 0; i < steps; i++) {
      const sx = dx / steps, sz = dz / steps;
      if (allowed(x + sx, z + sz)) { x += sx; z += sz; }
      else { if (allowed(x + sx, z)) x += sx; if (allowed(x, z + sz)) z += sz; }
    }
    return { x, z, y: floorAt(x, z) + EYE_HEIGHT };
  }
  return { box, circle, allowed, move, boxes, circles };
}
