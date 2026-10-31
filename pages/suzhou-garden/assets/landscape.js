import * as T from './vendor/three/build/three.module.min.js';
import { Builder, ribbon, irregularRock, scholarRock, curvedTube } from './geometry.js';
import { GROUND, WATER, PATHS, shorePoint, pondDistance, occupied, seeded, HALLS } from './layout.js';

export function buildLandscape(root, m, collision) {
  const b = new Builder(root), r = seeded(376), rocks = Array.from({ length: 7 }, (_, i) => irregularRock(i * 13, 2));
  const terrain = new T.PlaneGeometry(210, 174, 160, 140); terrain.rotateX(-Math.PI / 2);
  const p = terrain.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), edge = pondDistance(x, z);
    const y = edge < -.3 ? Math.max(-2.8, edge * .38) : GROUND - .04 + Math.sin(x * .2) * Math.sin(z * .17) * .035;
    p.setY(i, y);
  }
  terrain.computeVertexNormals(); const ground = new T.Mesh(terrain, m.ground); ground.receiveShadow = true; root.add(ground);
  const ring = Array.from({ length: 241 }, (_, i) => shorePoint(i / 240 * Math.PI * 2, 4));
  const ringGeo = ribbon(ring, 3.4, GROUND + .035); b.add(ringGeo, m.stone); ringGeo.dispose();
  for (const path of PATHS) {
    const curve = new T.CatmullRomCurve3(path.map(p => new T.Vector3(p[0], 0, p[1])), false, 'centripetal');
    const points = curve.getPoints(path.length * 18).map(p => [p.x, p.z]);
    const g = ribbon(points, 2.6, GROUND + .045); b.add(g, m.stone); g.dispose();
    for (let i = 2; i < points.length - 2; i += 2) {
      const [x, z] = points[i], a = points[i - 1], c = points[i + 1], angle = Math.atan2(c[0] - a[0], c[1] - a[1]);
      for (const side of [-1, 1]) {
        const xx = x + Math.cos(angle) * 1.4 * side, zz = z - Math.sin(angle) * 1.4 * side;
        b.instance('path-edging', rocks[0], m.rock, [xx, GROUND + .01, zz], [0, r() * 6.28, 0], [.18 + r() * .12, .13, .22 + r() * .1], '#a6b29c', false);
      }
    }
  }
  // Dry land beyond the shore and submerged stones share a continuous mineral edge.
  for (let i = 0; i < 300; i++) {
    const a = i / 300 * Math.PI * 2, [x, z] = shorePoint(a, (r() - .5) * .9);
    const size = .55 + r() * .75;
    b.instance(`shore-rock-${i % 7}`, rocks[i % 7], m.rock, [x, -.1 + r() * .18, z], [r() * .25, r() * 6.28, r() * .25], [size * 1.2, size * .6, size], new T.Color().setHSL(.19, .08, .58 + r() * .17));
    if (i % 3 === 0) b.instance('shore-moss', rocks[1], m.moss, [x, size * .35, z], [0, r() * 6.28, 0], [size * .8, .055, size * .6], null, false);
    // Only taller stone masses are solid; the continuous water boundary is handled analytically.
    if (size > 1.1) collision.circle(x, z, size * .55);
  }
  const scholar = [scholarRock(2), scholarRock(8), scholarRock(16)];
  for (const [i, x, z, w, h, d] of [[0, -51, -5, 3.8, 5.4, 2.7], [1, -55, -9, 3, 4.2, 2.5], [2, -46, -7, 2.5, 3.5, 2], [0, -54, -2, 2.5, 3.2, 2.2], [2, -44, -14, 2, 2.7, 1.8], [1, -17, 28, 1, 2.1, .85], [0, 41, -18, 1.2, 2.2, .9], [2, -14, -24, 1.4, 2.5, 1.2]]) {
    b.add(scholar[i], m.paleStone, [x, GROUND + h * .85, z], [0, r() * Math.PI, .05], [w, h, d]); collision.circle(x, z, w * .6);
    for (let j = 0; j < 7; j++) { const a = r() * 6.28, rr = r() * w; b.instance(`rock-base-${j % 7}`, rocks[j % 7], m.rock, [x + Math.cos(a) * rr, GROUND + .2, z + Math.sin(a) * rr], [0, r() * 6.28, 0], [.7 + r(), .4 + r() * .6, .7 + r()]); }
  }
  for (let i = 0; i < 150; i++) {
    const x = (r() - .5) * 129, z = (r() - .5) * 98;
    if (occupied(x, z, .5)) continue;
    const s = .25 + r() * .6; b.instance(`garden-stone-${i % 7}`, rocks[i % 7], m.rock, [x, GROUND + s * .1, z], [r(), r() * 6.28, r()], [s, s * .5, s * .85]);
  }
  // Pebble mosaic medallion at the entrance, assembled from individual river stones.
  const pebble = new T.SphereGeometry(1, 5, 4);
  for (let i = 0; i < 1600; i++) {
    const a = r() * Math.PI * 2, radius = Math.sqrt(r()) * 5.2, x = Math.cos(a) * radius, z = 40 + Math.sin(a) * radius;
    if (Math.abs(x) < 1.05) continue;
    const pattern = Math.sin(radius * 3.2 + Math.sin(a * 5) * .7) > .1;
    b.instance(pattern ? 'mosaic-light' : 'mosaic-dark', pebble, pattern ? m.paleStone : m.roof, [x, .462, z], [0, a + (pattern ? 0 : 1), 0], [.085, .025, .045], null, false);
  }
  // Courtyard flower pots and lotus-shaped stone bowls.
  const pot = new T.CylinderGeometry(.62, .39, .55, 16, 1, true);
  for (const [x, z] of [[-8, -24.6], [8, -24.6], [-6, 40.7], [6, 40.7], [43, -25.8], [53, -25.8], [-45, 26], [-53, 26]]) {
    b.add(pot, m.paleStone, [x, .73, z]); b.instance('pot-soil', new T.CylinderGeometry(.58, .58, .05, 16), m.ground, [x, .97, z]); collision.circle(x, z, .55);
  }
  pot.dispose(); b.finish();
  return { rocks };
}
