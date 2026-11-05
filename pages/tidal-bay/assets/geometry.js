import { random, clamp } from './coast.js';

export const species = [
  { name: '小丑鱼', count: 5, width: .145, height: .22, length: .67, color: [1, .48, .12], fin: .17 },
  { name: '蓝唐王', count: 4, width: .12, height: .28, length: .84, color: [.07, .36, .76], fin: .2 },
  { name: '黄高鳍', count: 4, width: .095, height: .28, length: .79, color: [1, .85, .05], fin: .32 },
  { name: '神仙鱼', count: 3, width: .095, height: .31, length: .91, color: [.88, .87, .65], fin: .39 },
  { name: '蝴蝶鱼', count: 4, width: .105, height: .27, length: .7, color: [.98, .84, .24], fin: .2 },
  { name: '梭鱼', count: 3, width: .08, height: .1, length: 1.12, color: [.56, .72, .7], fin: .12 },
  { name: '银鱼群', count: 44, width: .085, height: .12, length: .33, color: [.65, .8, .81], fin: .12 },
];

// Interleaved position / normal / UV / material & articulation / vertex color.
class Mesh {
  constructor() { this.data = []; this.shadow = []; }
  tri(a, b, c, uv = [[0, 0], [0, 0], [0, 0]], mat = 0, move = 0, color = [1, 1, 1]) {
    const ab = b.map((v, i) => v - a[i]), ac = c.map((v, i) => v - a[i]);
    const n = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
    const l = Math.hypot(...n) || 1;
    for (let i = 0; i < 3; i++) this.data.push(...[a, b, c][i], ...n.map(v => v / l), ...uv[i], mat, move, ...color);
  }
  smooth(a, b, c, normals, uv, row) {
    for (let i = 0; i < 3; i++) this.data.push(...[a, b, c][i], ...normals[i], uv[i][0], (uv[i][1] * (188 / 192) + 2 / 192 + row) / 7, 0, 0, 1, 1, 1);
  }
  sphere(center, radii, color, material = 2, segments = 10, rings = 7) {
    const at = (i, j) => {
      const a = i / segments * Math.PI * 2, b = j / rings * Math.PI;
      return [center[0] + Math.cos(a) * Math.sin(b) * radii[0], center[1] + Math.sin(a) * Math.sin(b) * radii[1], center[2] + Math.cos(b) * radii[2]];
    };
    for (let j = 0; j < rings; j++) for (let i = 0; i < segments; i++) {
      this.tri(at(i, j), at(i + 1, j), at(i, j + 1), undefined, material, 0, color);
      this.tri(at(i + 1, j), at(i + 1, j + 1), at(i, j + 1), undefined, material, 0, color);
    }
  }
}

export function createFish(row) {
  const s = species[row], m = new Mesh(), rings = row === 6 ? 20 : 36, sides = row === 6 ? 14 : 28;
  const profile = u => {
    // A full shoulder transitions continuously into a rounded forehead and a
    // narrow peduncle. The elongated barracuda has its own torpedo profile.
    const shoulder = row === 5 ? .67 : row === 3 || row === 4 ? .61 : .66;
    const rear = .10 + .9 * Math.pow(Math.sin(clamp(u / shoulder) * Math.PI * .5), 1.8);
    const front = Math.sqrt(Math.max(.0001, 1 - Math.pow((u - shoulder) / (1 - shoulder), 2)));
    return [u * 1.03 - .51, u <= shoulder ? rear : front];
  };
  const point = (i, j) => {
    const u = i / rings, angle = j / sides * Math.PI * 2, [x, r] = profile(u);
    return [x, Math.cos(angle) * r * s.width, Math.sin(angle) * r * s.height];
  };
  const normal = (i, j) => {
    const u = i / rings, a = j / sides * Math.PI * 2;
    const dr = (profile(Math.min(1, u + .005))[1] - profile(Math.max(0, u - .005))[1]) / .01;
    const n = [-dr * s.width / 1.03, Math.cos(a), Math.sin(a) * s.width / s.height], l = Math.hypot(...n);
    return n.map(v => v / l);
  };
  for (let i = 0; i < rings; i++) for (let j = 0; j < sides; j++) {
    const pts = [point(i, j), point(i + 1, j), point(i, j + 1), point(i + 1, j + 1)];
    const ns = [normal(i, j), normal(i + 1, j), normal(i, j + 1), normal(i + 1, j + 1)];
    const uv = [[i / rings, j / sides], [(i + 1) / rings, j / sides], [i / rings, (j + 1) / sides], [(i + 1) / rings, (j + 1) / sides]];
    m.smooth(pts[0], pts[1], pts[2], [ns[0], ns[1], ns[2]], [uv[0], uv[1], uv[2]], row);
    m.smooth(pts[1], pts[3], pts[2], [ns[1], ns[3], ns[2]], [uv[1], uv[3], uv[2]], row);
  }
  // Each fin is a ribbed ruled surface. Pectorals have their own vertex articulation.
  function fin(base, tip, count, move = 0, color = s.color) {
    for (let i = 0; i < count; i++) {
      const u = i / count, v = (i + 1) / count;
      const a = base(u), b = base(v), c = tip(u), d = tip(v);
      const tint = color.map(q => q * (i % 2 ? .97 : 1));
      m.tri(a, b, c, [[u, 0], [v, 0], [u, 1]], 1, move, tint);
      m.tri(b, d, c, [[v, 0], [v, 1], [u, 1]], 1, move, tint);
    }
  }
  for (const side of [1, -1]) {
    const height = (side > 0 ? s.fin : s.fin * .62) * (row === 5 || row === 6 ? .65 : .8);
    fin(u => [u * .69 - .34, 0, side * s.height * (.65 + .28 * Math.sin(u * Math.PI))],
      u => [u * .69 - .42, .02 * Math.sin(u * Math.PI), side * (s.height * .8 + height * Math.pow(Math.sin(u * Math.PI), row === 3 ? 1.5 : .8))], 24);
    fin(u => [.19 - u * .06, side * .12, -.025 - u * .06],
      u => [.12 - .23 * Math.sin(u * Math.PI * .7), side * (.13 + (row > 4 ? .09 : .16) * Math.sin(u * Math.PI)), -.04 - .09 * Math.sin(u * Math.PI)], 15, side);
    fin(u => [-.04 - u * .08, side * .055, -s.height * .66],
      u => [-.04 - u * .17, side * (.06 + .08 * Math.sin(u * Math.PI)), -s.height * .66 - .17 * Math.sin(u * Math.PI)], 10);
  }
  // A concave trailing edge produces two separate caudal lobes and a narrow root.
  const tailColor = row === 1 ? [.98, .82, .06] : s.color;
  fin(u => [-.49, 0, (u - .5) * .075], u => [-.66 - .15 * Math.pow(Math.abs(u - .5) * 2, .72), .01, (u - .5) * (row === 0 ? .32 : .43)], 24, 0, tailColor);
  for (const side of [-1, 1]) {
    const eyeX = row === 5 ? .415 : .372, eyeSize = row === 6 ? .023 : .029;
    m.sphere([eyeX, side * s.width * .79, s.height * .27], [eyeSize, .012, eyeSize], [.39, .42, .27], 2, 8, 5);
    m.sphere([eyeX + .003, side * s.width * .87, s.height * .28], [eyeSize * .66, .009, eyeSize * .71], [.008, .013, .014], 2, 8, 5);
    m.sphere([eyeX + .007, side * s.width * .91, s.height * .33], [.004, .003, .004], [.75, .9, .91], 2, 6, 4);
  }
  m.sphere([.512, 0, -.007], [.012, .018, .009], s.color.map(v => v * .43), 2, 8, 4);
  return new Float32Array(m.data);
}

export function createPalm() {
  const m = new Mesh(), rng = random(710), crown = [2.5, 7.92, 2.15];
  const bark = [.38, .31, .19];
  for (let j = 0; j < 35; j++) {
    const ring = (t, a) => [1.22 + 1.28 * t * t + Math.cos(a) * (.12 - .065 * t), 7.14 + .78 * t + Math.sin(a) * (.12 - .065 * t), 2.15 * t];
    for (let i = 0; i < 12; i++) {
      const a = i / 12 * Math.PI * 2, b = (i + 1) / 12 * Math.PI * 2;
      const p = ring(j / 35, a), q = ring(j / 35, b), r = ring((j + 1) / 35, a), s = ring((j + 1) / 35, b);
      const col = bark.map(v => v * (j % 3 === 0 ? .72 : 1.14));
      m.tri(p, q, r, undefined, 2, 0, col); m.tri(q, s, r, undefined, 2, 0, col);
    }
  }
  for (let f = 0; f < 12; f++) {
    const a = f / 12 * Math.PI * 2 + rng() * .17, len = 1.52 + rng() * .68;
    const dir = [Math.cos(a), Math.sin(a)], side = [-dir[1], dir[0]];
    const path = t => [crown[0] + dir[0] * len * t, crown[1] + dir[1] * len * t, crown[2] + .48 * Math.sin(t * Math.PI) - .73 * t * t];
    for (let j = 0; j < 32; j++) {
      const t = .06 + j / 34, p = path(t), q = path(t + .035);
      m.tri([p[0] - .013, p[1], p[2]], [p[0] + .013, p[1], p[2]], q, undefined, 2, t, [.32, .42, .10]);
      for (const sign of [-1, 1]) {
        const leafLen = (.2 + .48 * Math.sin(t * Math.PI)) * (1 - t * .6) * (.9 + rng() * .2);
        const tip = [p[0] + side[0] * leafLen * sign + dir[0] * .30, p[1] + side[1] * leafLen * sign + dir[1] * .30, p[2] - .18 - t * .19];
        const mid = [p[0] * .48 + tip[0] * .52, p[1] * .48 + tip[1] * .52, p[2] + .025];
        const edge = [mid[0] - dir[0] * .065, mid[1] - dir[1] * .065, mid[2] - .025];
        const col = [.12 + rng() * .07, .24 + rng() * .16, .042 + rng() * .045];
        m.tri(p, mid, edge, undefined, 2, t, col); m.tri(mid, tip, edge, undefined, 2, t, col.map(v => v * 1.35));
        m.shadow.push([p, mid, edge], [mid, tip, edge]);
      }
    }
  }
  for (let i = 0; i < 5; i++) m.sphere([crown[0] + (rng() - .5) * .18, crown[1] + (rng() - .5) * .2, crown[2] - .08], [.085, .09, .105], [.26, .30, .10]);
  return { vertices: new Float32Array(m.data), shadow: m.shadow };
}

export function indexMesh(vertices, stride = 13) {
  const lookup = new Map(), compact = [], indices = new Uint16Array(vertices.length / stride);
  for (let i = 0; i < indices.length; i++) {
    const vertex = vertices.subarray(i * stride, (i + 1) * stride);
    const key = Array.from(vertex, v => Math.round(v * 100000)).join(',');
    let index = lookup.get(key);
    if (index === undefined) { index = compact.length / stride; lookup.set(key, index); compact.push(...vertex); }
    if (index > 65535) throw new Error('Mesh exceeds the 16-bit index budget');
    indices[i] = index;
  }
  return { vertices: new Float32Array(compact), indices };
}
