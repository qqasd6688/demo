import * as T from './vendor/three/build/three.module.min.js';
import { Builder, curvedTube } from './geometry.js';
import { GROUND, occupied, seeded, pondDistance, shorePoint, pathDistance } from './layout.js';

export function buildVegetation(root, m, collision, uniforms) {
  const b = new Builder(root), r = seeded(8957), card = new T.PlaneGeometry(1, 1), twig = new T.CylinderGeometry(.7, 1, 1, 6);
  let trees = 0, leafCards = 0, bambooCount = 0;
  function leaf(x, y, z, s, material = m.leaves, key = 'leaves', tilt = null) {
    b.instance(key, card, material, [x, y, z], [tilt ?? (r() - .5) * 2.6, r() * Math.PI * 2, r() * Math.PI * 2], [s, s * (.75 + r() * .4), 1], new T.Color().setHSL(.16 + r() * .05, .12 + r() * .08, .68 + r() * .3), true); leafCards++;
  }
  function branch(points, radius) {
    const path = new T.CatmullRomCurve3(points.map(p => new T.Vector3(...p))), segments = Math.max(8, points.length * 4), sides = radius > .15 ? 8 : 5;
    const geo = new T.TubeGeometry(path, segments, radius, sides, false), p = geo.attributes.position;
    for (let j = 0; j <= segments; j++) { const t = j / segments, center = path.getPointAt(t), taper = .08 + .92 * (1 - t) ** .85; for (let k = 0; k <= sides; k++) { const i = j * (sides + 1) + k; p.setXYZ(i, center.x + (p.getX(i) - center.x) * taper, center.y + (p.getY(i) - center.y) * taper, center.z + (p.getZ(i) - center.z) * taper); } }
    geo.computeVertexNormals(); b.add(geo, m.bark); geo.dispose();
  }
  function tree(x, z, height, kind = 'broad', outer = false) {
    trees++;
    const y = GROUND, leanX = (r() - .5) * height * .14, leanZ = (r() - .5) * height * .12;
    branch([[x, y - .1, z], [x + leanX * .2, y + height * .25, z], [x + leanX, y + height * .58, z + leanZ], [x + leanX * 1.6 + height * .08, y + height * .83, z + leanZ * 1.5]], height * .039);
    if (!outer) collision.circle(x, z, height * .035);
    for (let i = 0; i < 6; i++) {
      const a = i * 2.399 + r() * .6, branchHeight = height * (.35 + i * .065), spread = height * (.29 + r() * .15);
      const sx = x + leanX * .7, sy = y + branchHeight, sz = z + leanZ * .7;
      const ex = x + Math.cos(a) * spread + leanX, ez = z + Math.sin(a) * spread + leanZ, ey = sy + height * (.15 + r() * .12);
      branch([[sx, sy, sz], [sx + (ex - sx) * .48, sy + height * .14, sz + (ez - sz) * .48], [ex, ey, ez]], height * (.014 - i * .001));
      const material = kind === 'pine' ? m.pineLeaves : kind === 'maple' ? m.mapleLeaves : m.leaves, key = kind === 'pine' ? 'pine-canopy' : kind === 'maple' ? 'maple-canopy' : 'tree-canopy';
      for (let j = 0; j < 3; j++) {
        const aa = a + (j - 1) * .9, length = spread * (.35 + r() * .22);
        const tx = ex + Math.cos(aa) * length, tz = ez + Math.sin(aa) * length, ty = ey + height * (.02 + r() * .14);
        branch([[ex, ey, ez], [tx, ty, tz]], height * .0065);
        const count = outer ? 11 : kind === 'pine' ? 15 : 20, size = height * (kind === 'pine' ? .15 : .17);
        for (let k = 0; k < count; k++) {
          const az = r() * Math.PI * 2, el = (r() - .5) * Math.PI, rr = Math.cbrt(r()) * size * .75;
          leaf(tx + Math.cos(az) * Math.cos(el) * rr, ty + Math.sin(el) * rr * (kind === 'pine' ? .25 : .85), tz + Math.sin(az) * Math.cos(el) * rr, size * (.8 + r() * .65), material, key, kind === 'pine' ? -Math.PI / 2 + (r() - .5) * .55 : null);
        }
      }
    }
    // A leader crown hides the trunk termination and breaks the repeated tier silhouette.
    const leaderMat = kind === 'pine' ? m.pineLeaves : kind === 'maple' ? m.mapleLeaves : m.leaves;
    for (let i = 0; i < 30; i++) { const a = r() * 6.28, rr = Math.sqrt(r()) * height * .14; leaf(x + leanX * 1.6 + height * .08 + Math.cos(a) * rr, y + height * .83 + (r() - .3) * height * .16, z + leanZ * 1.5 + Math.sin(a) * rr, height * .17, leaderMat, `${kind}-leader`, kind === 'pine' ? -Math.PI / 2 + r() * .5 : null); }
    // Buttress roots meet the ground instead of ending in a vertical cylinder.
    if (!outer) for (let j = 0; j < 5; j++) { const a = j * 1.257; branch([[x + Math.cos(a) * height * .11, y + .04, z + Math.sin(a) * height * .11], [x + Math.cos(a) * .2, y + .5, z + Math.sin(a) * .2]], height * .016); }
  }
  function willow(x, z, height) {
    tree(x, z, height * .8, 'broad');
    for (let i = 0; i < 34; i++) {
      const a = i / 34 * Math.PI * 2 + r() * .2, spread = height * (.26 + r() * .18), top = height * (.67 + r() * .17);
      const xx = x + Math.cos(a) * spread, zz = z + Math.sin(a) * spread;
      const points = [[x, height * .5, z], [xx, top + .4, zz], [xx + Math.cos(a) * .6, top - 1.5, zz + Math.sin(a) * .6], [xx + Math.cos(a) * .8, 1 + r() * 1.2, zz + Math.sin(a) * .8]];
      branch(points, .023);
      for (let j = 0; j < 12; j++) { const t = j / 12; leaf(xx + Math.cos(a) * t * .9, top * (1 - t) + 1.1 * t, zz + Math.sin(a) * t * .9, .73, m.bambooLeaves, 'willow-leaves'); }
    }
  }
  // Deliberate specimen trees frame the first view; the remainder fill separate courts.
  for (const [x, z, h, kind] of [[-25, 30, 10, 'pine'], [-31, 18, 11, 'pine'], [23, 27, 9, 'maple'], [-14, -29, 12, 'pine'], [17, -30, 11, 'broad'], [-55, 6, 9, 'pine'], [-58, -20, 13, 'pine'], [-42, 22, 8, 'maple'], [48, -22, 10, 'broad'], [22, -37, 13, 'pine'], [-22, -43, 12, 'broad']]) tree(x, z, h, kind);
  willow(-28, 5, 9); willow(26, -19, 9); willow(28, 19, 8);
  let attempts = 0;
  while (trees < 92 && attempts++ < 1500) {
    const x = (r() - .5) * 131, z = (r() - .5) * 100;
    if (occupied(x, z, 2.2) || (x > 40 && z > -18 && z < 21)) continue;
    if (collision.circles.some(c => Math.hypot(c.x - x, c.z - z) < 3.2)) continue;
    tree(x, z, 6.2 + r() * 6.2, r() > .7 ? 'pine' : 'broad');
  }
  // Forest outside the garden walls masks the edge from both walking and aerial views.
  for (let i = 0; i < 85; i++) {
    const a = i / 85 * Math.PI * 2, x = Math.cos(a) * (78 + r() * 11), z = Math.sin(a) * (64 + r() * 12);
    tree(x, z, 10 + r() * 9, i % 5 ? 'broad' : 'pine', true);
  }
  // Bamboo has visible segmented culms and branch fans, with a clear walking passage.
  for (let i = 0; i < 430; i++) {
    const x = 41 + r() * 22, z = -21 + r() * 44;
    if (occupied(x, z, .25)) continue;
    const height = 4.5 + r() * 5, lean = (r() - .5) * .9, radius = .055 + r() * .045;
    bambooCount++;
    b.beam(m.bamboo, [x, GROUND, z], [x + lean, height, z + lean * .5], radius, 7, radius * .65);
    for (let j = 1; j < height / .5; j++) {
      const y = j * .5, u = y / height;
      b.instance('bamboo-rings', twig, m.paleStone, [x + lean * u, y, z + lean * .5 * u], [0, 0, -lean / height], [radius * 1.1, .035, radius * 1.1], '#767f51');
      if (j > 4 && j % 2 === 0) { const a = r() * 6.28, l = .45 + r() * .6; b.beam(m.bamboo, [x + lean * u, y, z], [x + lean * u + Math.cos(a) * l, y + .3, z + Math.sin(a) * l], .018, 5, .004); leaf(x + lean * u + Math.cos(a) * l, y + .4, z + Math.sin(a) * l, 1.1 + r() * .5, m.bambooLeaves, 'bamboo-fans'); }
    }
    collision.circle(x, z, .08);
  }
  // Low understory: loose clusters, never a uniform green carpet.
  for (let i = 0; i < 2000; i++) {
    const x = (r() - .5) * 132, z = (r() - .5) * 100;
    if (occupied(x, z, .1)) continue;
    const s = .45 + r() * 1.1;
    for (let j = 0; j < 3; j++) leaf(x + (r() - .5) * .6, GROUND + s * .35, z + (r() - .5) * .6, s, m.leaves, 'shrubs');
  }
  const grassGeo = new T.BufferGeometry(), gp = [], guv = [], gc = [], gi = [];
  for (let j = 0; j <= 6; j++) { const t = j / 6, w = .022 * (1 - t) ** .7; for (const side of [-1, 1]) { gp.push(side * w + t * t * .14, t * .8, t * t * .18); guv.push((side + 1) / 2, t); gc.push(.42 + t * .44, .56 + t * .4, .29 + t * .3); } if (j < 6) { const k = j * 2; gi.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); } }
  grassGeo.setAttribute('position', new T.Float32BufferAttribute(gp, 3)); grassGeo.setAttribute('uv', new T.Float32BufferAttribute(guv, 2)); grassGeo.setAttribute('color', new T.Float32BufferAttribute(gc, 3)); grassGeo.setIndex(gi); grassGeo.computeVertexNormals();
  const grassMat = new T.MeshStandardMaterial({ color: '#a9b785', vertexColors: true, roughness: .95, side: T.DoubleSide });
  grassMat.onBeforeCompile = shader => { shader.uniforms.uGrassTime = uniforms.time; shader.vertexShader = 'uniform float uGrassTime;\n' + shader.vertexShader; shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed.x+=sin(uGrassTime*1.3+instanceMatrix[3].x*.6+instanceMatrix[3].z*.35)*position.y*position.y*.12;'); };
  for (let i = 0; i < 6300; i++) {
    const a = r() * Math.PI * 2, [x, z] = shorePoint(a, 1 + r() * 1.1);
    if (pathDistance(x, z) < 1.1) continue;
    b.instance('shore-grass', grassGeo, grassMat, [x, GROUND, z], [0, r() * 6.28, (r() - .5) * .25], [1, .28 + r() * .65, 1], new T.Color().setHSL(.18, .12, .65 + r() * .35), false);
  }
  // Broad banana leaves and ferns at the shaded corners of the white walls.
  const blade = new T.PlaneGeometry(1, 1, 5, 12), bp = blade.attributes.position;
  for (let i = 0; i < bp.count; i++) { const y = bp.getY(i) + .5, x = bp.getX(i); bp.setXYZ(i, x * Math.sin(y * Math.PI) ** .7, y, Math.sin(y * Math.PI) * .2 - Math.abs(x) * .2); } blade.computeVertexNormals();
  const broadMat = new T.MeshStandardMaterial({ color: '#78924c', roughness: .65, side: T.DoubleSide });
  for (const [x, z] of [[-13, 35], [13, 35], [-39, 2], [39, -20], [21, -31], [-41, 25]]) {
    for (let i = 0; i < 9; i++) { const a = i * 2.4, h = 1.6 + r() * 1.2; b.beam(m.bamboo, [x, GROUND, z], [x + Math.cos(a) * .8, h, z + Math.sin(a) * .8], .04, 6, .02); b.instance('banana-leaf', blade, broadMat, [x + Math.cos(a) * .8, h, z + Math.sin(a) * .8], [1 + r() * .65, a, 0], [.8, 1.8 + r(), 1]); }
  }
  b.finish(); return { trees, leafCards, bamboo: bambooCount };
}
