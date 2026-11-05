import { clamp } from './coast.js';

export const marineSpecies = [
  { id: 'manta', name: '蝠鲼', en: 'Manta ray', count: 2, size: .72, depth: .65 },
  { id: 'eagle', name: '斑点鹰魟', en: 'Spotted eagle ray', count: 2, size: .60, depth: .45 },
  { id: 'stingray', name: '蓝斑魟', en: 'Blue-spotted ray', count: 2, size: .56, depth: .7 },
  { id: 'turtle', name: '绿海龟', en: 'Green sea turtle', count: 3, size: .72, depth: .35 },
  { id: 'jelly', name: '月亮水母', en: 'Moon jelly', count: 4, size: .57, depth: .15 },
  { id: 'nettle', name: '金色海荨麻', en: 'Sea nettle', count: 2, size: .59, depth: .25 },
  { id: 'shark', name: '黑鳍礁鲨', en: 'Blacktip reef shark', count: 1, size: 1.0, depth: .85 },
  { id: 'dolphin', name: '海豚', en: 'Bottlenose dolphin', count: 0, size: 1.35, depth: .1 },
];

class Surface {
  data = [];
  vertex(p, n, uv, material, motion, color) { this.data.push(...p, ...n, ...uv, material, motion, ...color); }
  patch(fn, nu, nv, material = 3, motion = 0, color = [1, 1, 1], uvFn = (u, v) => [u, v]) {
    const at = (i, j) => {
      const u = i / nu, v = j / nv, p = fn(u, v);
      const a = fn(clamp(u + .001), v), b = fn(clamp(u - .001), v);
      const c = fn(u, clamp(v + .001)), d = fn(u, clamp(v - .001));
      const t = a.map((x, k) => x - b[k]), s = c.map((x, k) => x - d[k]);
      const n = [t[1] * s[2] - t[2] * s[1], t[2] * s[0] - t[0] * s[2], t[0] * s[1] - t[1] * s[0]];
      let len = Math.hypot(...n);
      if (len < 1e-10) { n[0] = 0; n[1] = 0; n[2] = 1; len = 1; }
      return { p, n: n.map(x => x / len), uv: uvFn(u, v) };
    };
    const points = Array.from({ length: (nu + 1) * (nv + 1) }, (_, i) => at(Math.floor(i / (nv + 1)), i % (nv + 1)));
    for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
      const a = i * (nv + 1) + j, b = a + nv + 1;
      for (const k of [a, b, a + 1, b, b + 1, a + 1]) {
        const p = points[k]; this.vertex(p.p, p.n, p.uv, material, motion, color);
      }
    }
  }
  ellipsoid(center, radius, color, material = 2, motion = 0) {
    this.patch((u, v) => {
      const a = u * Math.PI * 2, b = v * Math.PI;
      return [center[0] + Math.cos(a) * Math.sin(b) * radius[0], center[1] + Math.sin(a) * Math.sin(b) * radius[1], center[2] + Math.cos(b) * radius[2]];
    }, 20, 12, material, motion, color);
  }
  ribbon(path, width, material = 2, motion = 0, color = [.18, .28, .28], segments = 24) {
    this.patch((u, v) => { const p = path(u); return [p[0], p[1] + (v - .5) * width * Math.pow(1 - u, .6), p[2]]; }, segments, 2, material, motion, color);
  }
}

export function createMarine(kind) {
  const m = new Surface();
  if (kind <= 2) {
    m.patch((u, v) => {
      const side = v * 2 - 1, round = Math.sin(u * Math.PI);
      const width = kind === 2 ? .61 * Math.pow(round, .65) : kind === 0 ? 1.02 : .94;
      const y = side * width;
      const s=Math.abs(side),leading=.47+.055*Math.exp(-Math.pow((s-.23)/.15,2))-.72*Math.pow(s,1.6);
      const trailing=-.48+.23*s+.025*Math.sin(s*Math.PI*3)*s;
      const x = kind === 2 ? u * 1.05 - .52 : trailing+(leading-trailing)*u;
      const spine = Math.exp(-side * side * 28) * Math.pow(round, .7) * .13;
      return [x, y, .105 * round * (1 - side * side) + spine + .012 * Math.sin(side * Math.PI)];
    }, 44, 52, 3, 1, [1, 1, 1]);
    m.ribbon(u => [-.48 - u * (kind === 0 ? 1.05 : 1.65), Math.sin(u * 4) * u * .025, .035 - u * .08], .033, 2, 2, [.10, .17, .18]);
    for (const side of [-1, 1]) {
      m.ellipsoid([.29, side * .12, .10], [.024, .021, .021], [.04, .07, .07]);
      if (kind === 0) m.ribbon(u => [.37 + .25 * u, side * (.12 + Math.sin(u * Math.PI) * .035), .06 - u * .04], .055, 2, 0, [.12, .20, .20], 12);
    }
  } else if (kind === 3) {
    // Domed carapace, separate neck, head, four tapered flippers and a short tail.
    m.patch((u, v) => {
      const angle = u * Math.PI * 2, r = v;
      return [Math.cos(angle) * r * .52, Math.sin(angle) * r * .39, .22 * Math.sqrt(Math.max(0, 1 - r * r)) + .025];
    }, 60, 28, 3, 0, [1, 1, 1], (u, v) => [.5 + Math.cos(u * Math.PI * 2) * v * .49, .5 + Math.sin(u * Math.PI * 2) * v * .49]);
    m.ellipsoid([0, 0, -.01], [.50, .37, .07], [.42, .40, .23]);
    m.ellipsoid([.5, 0, .015], [.18, .10, .07], [1, 1, 1], 6);
    m.ellipsoid([.67, 0, .025], [.13, .095, .075], [1, 1, 1], 6);
    for (const side of [-1, 1]) {
      for (const front of [true, false]) {
        m.patch((u, v) => {
          const width = Math.pow(Math.sin(u * Math.PI), .7) * (front ? .25 : .16);
          return [(front ? .31 : -.32) - u * (front ? .54 : .29) + Math.sin(u*Math.PI)*.11 + (v - .5) * width, side * ((front ? .28 : .22) + u * (front ? .54 : .30)), -.015 + Math.sin(u * Math.PI) * Math.sin(v*Math.PI)*.045];
        }, 26, 10, 6, 1, [1,1,1]);
      }
      m.ellipsoid([.706, side * .074, .066], [.016, .009, .012], [.012, .025, .018]);
    }
    m.ribbon(u => [-.45 - u * .22, 0, -.015], .065, 2, 0, [.32, .36, .19], 10);
  } else if (kind === 4 || kind === 5) {
    const gold = kind === 5;
    m.patch((u, v) => {
      const a = u * Math.PI * 2, r = v * .43;
      const scallop = 1 + .025 * Math.cos(a * 24) * Math.pow(v, 5);
      return [Math.cos(a) * r * scallop, Math.sin(a) * r * scallop, .24 * Math.sqrt(Math.max(0, 1 - v * v))];
    }, 48, 20, 4, 0, [1, 1, 1], (u, v) => [.5 + Math.cos(u * Math.PI * 2) * v * .49, .5 + Math.sin(u * Math.PI * 2) * v * .49]);
    for (let i = 0; i < (gold ? 28 : 20); i++) {
      const a = i / (gold ? 28 : 20) * Math.PI * 2;
      const length = (gold ? .75 : .38) * (.7 + (i % 4) * .14);
      m.ribbon(u => [Math.cos(a) * .38 - u * length, Math.sin(a) * .38 + Math.sin(u * 8 + a) * u * .08, -.03 - u * .25], gold ? .012 : .018, 5, 2, gold ? [.85, .65, .32] : [.73, .92, .94]);
    }
    for (let i = 0; i < 4; i++) {
      const a = i / 4 * Math.PI * 2;
      m.ribbon(u => [Math.cos(a) * .13 - u * .5, Math.sin(a) * .13 + Math.sin(u * 7 + a) * .035, -.04 - u * .2], .021, 5, 2, gold ? [.90, .74, .40] : [.84, .94, .96]);
    }
  } else {
    const dolphin = kind === 7;
    m.patch((u, v) => {
      const a = v * Math.PI * 2, r = Math.pow(Math.sin(u * Math.PI), .62) * (.6 + u * .4);
      return [u * 1.7 - .85, Math.cos(a) * r * .17, Math.sin(a) * r * .16];
    }, 38, 24, 3, 0, [1, 1, 1]);
    for (const side of [-1, 1]) {
      m.patch((u, v) => [.23 - u * .5 + v * .11 * Math.sin(u * Math.PI), side * (.1 + u * .43), -.025 - u * .05], 15, 3, 2, 1, [.22, .33, .35]);
      m.ellipsoid([.60, side * .095, .046], [.016, .010, .016], [.01, .025, .03]);
    }
    m.patch((u, v) => [-.28 + u * .51 - v * .19, 0, .1 + Math.sin(u * Math.PI) * v * .38], 15, 3, 2, 0, [.17, .27, .29]);
    m.patch((u, v) => {
      const s = u * 2 - 1;
      return [-.79 - Math.abs(s) * .28 + v * .12, dolphin ? s * .34 : 0, dolphin ? 0 : s * .36];
    }, 20, 3, 2, 2, [.19, .30, .32]);
    if (dolphin) m.ellipsoid([.81, 0, -.018], [.19, .061, .05], [.35, .47, .48]);
  }
  return new Float32Array(m.data);
}

export { createMarineAtlas } from './marine-materials.js';
