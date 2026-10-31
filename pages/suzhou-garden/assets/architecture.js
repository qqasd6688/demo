import * as T from './vendor/three/build/three.module.min.js';
import { Builder, ribbon, curvedTube } from './geometry.js';
import { HALLS, GATES, PAVILIONS, BRIDGES, GROUND, seeded } from './layout.js';
import { signTexture } from './materials.js';

function tiledRoof(w, d, height, y) {
  const positions = [], uv = [], indices = [], ridge = Math.max(.2, (w - d * .6) / 2);
  function face(side, sign) {
    const across = Math.max(20, Math.ceil((side ? d : w) / .14)), down = Math.ceil(d * 2.6), offset = positions.length / 3;
    for (let j = 0; j <= down; j++) for (let i = 0; i <= across; i++) {
      const u = i / across * 2 - 1, t = j / down;
      let x, z;
      if (!side) { x = u * (ridge * (1 - t) + w / 2 * t); z = sign * d / 2 * t; }
      else { x = sign * (ridge + (w / 2 - ridge) * t); z = u * d / 2 * t; }
      const column = (side ? z : x) / .23;
      const lip = .024 * ((t * 17) % 1);
      const h = y + height * (1 - t) ** 1.6 + .46 * Math.abs(u) ** 8 * t ** 5 + .16 * t ** 8 + .035 * Math.cos(column * Math.PI * 2) + lip;
      positions.push(x, h, z); uv.push((side ? z : x) / 3.68, t * 2.2);
      if (i < across && j < down) { const a = offset + j * (across + 1) + i; indices.push(a, a + across + 1, a + 1, a + 1, a + across + 1, a + across + 2); }
    }
  }
  face(false, 1); face(false, -1); face(true, 1); face(true, -1);
  const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(positions, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); g.setIndex(indices); g.computeVertexNormals(); return g;
}

export function buildArchitecture(root, materials, collision) {
  const b = new Builder(root), m = materials, lamps = [], rng = seeded(941);
  const cylinder = new T.CylinderGeometry(1, 1, 1, 12), cap = new T.CylinderGeometry(.105, .105, .12, 10);
  const beam = (mat, a, c, r = .07, r2 = r) => b.beam(mat, a, c, r, 8, r2);
  function roof(x, z, w, d, base, height) {
    const g = tiledRoof(w, d, height, base); b.add(g, m.roof, [x, 0, z]); g.dispose();
    const ridge = Math.max(.2, (w - d * .6) / 2);
    beam(m.roof, [x - ridge, base + height + .06, z], [x + ridge, base + height + .06, z], .16);
    for (const side of [-1, 1]) {
      const p = [[x + side * (ridge - .4), base + height + .07, z], [x + side * (ridge + .1), base + height + .2, z], [x + side * (ridge + .45), base + height + .62, z]];
      const curve = curvedTube(p, .105, 12); b.add(curve, m.roof, [0, 0, 0]); curve.dispose();
      for (let i = 0, n = Math.ceil(w / .23); i <= n; i++) {
        const u = i / n * 2 - 1, ex = x + u * w / 2, yy = base + .14 + .46 * Math.abs(u) ** 8;
        b.instance('tile-caps', cap, m.roof, [ex, yy, z + side * (d / 2 + .02)], [Math.PI / 2, 0, 0]);
      }
      // Visible purlins, rafter tails and the curving hip spines.
      for (let i = 0; i < w / .42; i++) {
        const u = (i / (w / .42) * 2 - 1);
        beam(m.darkWood, [x + u * ridge, base + height - .16, z], [x + u * w / 2, base - .08 + .46 * Math.abs(u) ** 8, z + side * d / 2], .055);
      }
      for (const other of [-1, 1]) {
        const points = [];
        for (let i = 0; i <= 16; i++) { const t = i / 16; points.push([x + side * (ridge * (1 - t) + w / 2 * t), base + height * (1 - t) ** 1.6 + .46 * t ** 5 + .16 * t ** 8 + .09, z + other * d / 2 * t]); }
        const hip = curvedTube(points, .075, 20); b.add(hip, m.roof); hip.dispose();
      }
    }
  }
  function post(x, z, y, h, r = .16) {
    b.instance('timber-posts', cylinder, m.wood, [x, y + h / 2, z], [0, 0, 0], [r, h, r]);
    b.instance('stone-post-bases', cylinder, m.paleStone, [x, y + .12, z], [0, 0, 0], [r * 1.55, .24, r * 1.55]);
    collision.circle(x, z, r + .03);
    for (const dy of [h - .52, h - .2]) b.box(m.wood, x, y + dy, z, r * 4, .12, r * 3.4);
  }
  function lattice(x, y, z, w, h, rotation = 0, ornate = false) {
    const c = Math.cos(rotation), s = Math.sin(rotation);
    function box(u, v, ww, hh, depth = .055) { b.box(m.wood, x + u * c, y + v, z - u * s, ww, hh, depth, rotation); }
    box(-w / 2, 0, .09, h + .08, .11); box(w / 2, 0, .09, h + .08, .11); box(0, -h / 2, w, .09, .11); box(0, h / 2, w, .09, .11);
    if (ornate) {
      for (let i = -2; i <= 2; i++) { box(i * w / 6, 0, .035, h); box(0, i * h / 6, w, .035); }
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
        const xx = i * w / 3, yy = j * h / 3, ww = w * .12, hh = h * .12;
        box(xx - ww / 2, yy, .028, hh); box(xx + ww / 2, yy, .028, hh); box(xx, yy - hh / 2, ww, .028); box(xx, yy + hh / 2, ww, .028);
      }
    } else {
      for (let i = -3; i <= 3; i++) box(i * w / 8, 0, .035, h);
      for (let j = -2; j <= 2; j++) box(0, j * h / 6, w, .035);
    }
  }
  function lantern(x, y, z, size = .5) {
    beam(m.metal, [x, y + .8, z], [x, y + .3, z], .018);
    const body = new T.Mesh(new T.CylinderGeometry(size * .58, size * .5, size * 1.3, 8), m.paper); body.position.set(x, y, z); root.add(body); lamps.push(body);
    b.box(m.darkWood, x, y + size * .68, z, size * 1.35, .12, size * 1.35);
    b.box(m.darkWood, x, y - size * .68, z, size * 1.15, .1, size * 1.15);
    for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; beam(m.darkWood, [x + Math.cos(a) * size * .55, y - size * .65, z + Math.sin(a) * size * .55], [x + Math.cos(a) * size * .55, y + size * .65, z + Math.sin(a) * size * .55], .018); }
  }
  function sign(text, x, y, z, w = 2.5) { const mat = new T.MeshStandardMaterial({ map: signTexture(text), roughness: .72 }); b.box(mat, x, y, z, w, w / 4, .13); }
  function furniture(x, z, scale = 1) {
    b.box(m.wood, x, .68 + .78 * scale, z, 1.8 * scale, .14, 1 * scale);
    for (const i of [-1, 1]) for (const j of [-1, 1]) b.box(m.darkWood, x + i * .72 * scale, .99, z + j * .35 * scale, .085, .72, .085);
    const teapot = new T.Mesh(new T.SphereGeometry(.12, 16, 12), new T.MeshStandardMaterial({ color: '#665442', roughness: .7 })); teapot.position.set(x, .68 + .9 * scale, z); root.add(teapot);
    for (const i of [-1, 1]) {
      b.instance('teacups', cylinder, m.paper, [x + i * .3, .68 + .89 * scale, z], [0, 0, 0], [.065, .08, .065]);
      const zz = z + i * .9;
      b.box(m.wood, x, 1.1, zz, .72, .1, .65); b.box(m.wood, x, 1.57, zz + i * .27, .72, .75, .06);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(m.darkWood, x + sx * .28, .85, zz + sz * .25, .055, .5, .055);
    }
    collision.box(x, z, 2.1 * scale, 2.8 * scale);
  }

  for (const h of HALLS) {
    const { x, z, w, d } = h, y = .6, top = y + h.h;
    b.box(m.stone, x, .28, z, w + 1.5, .64, d + 2);
    b.box(m.stone, x, .48, z + d / 2 + 1.1, w + .8, .23, 1.2);
    // Masonry sides and rear, above a dark, splash-weathered plinth.
    for (const side of [-1, 1]) { b.box(m.plaster, x + side * w / 2, y + h.h / 2, z, .42, h.h, d); b.box(m.rock, x + side * w / 2, y + .28, z, .47, .56, d); }
    if (h.id !== 'gatehouse') { b.box(m.plaster, x, y + h.h / 2, z - d / 2, w, h.h, .4); b.box(m.rock, x, y + .3, z - d / 2 + .02, w, .6, .43); }
    for (let i = 0; i <= 6; i++) {
      const xx = x - w / 2 + i * w / 6;
      if (i !== 3) post(xx, z + d / 2 + .25, y, h.h, .16);
      if (i === 2 || i === 3 || i === 4) continue;
      const ww = w / 6 - .22, cx = xx + w / 12;
      if (i < 6) {
        b.box(m.wood, cx, y + .58, z + d / 2, ww, 1.15, .17);
        lattice(cx, y + 2.33, z + d / 2 + .02, ww - .14, 2.15, 0, true);
        b.box(m.glass, cx, y + 2.33, z + d / 2 - .035, ww - .14, 2.15, .012);
      }
    }
    for (const zz of [z - d / 2 + .2, z, z + d / 2 + .2]) {
      beam(m.wood, [x - w / 2, top - .15, zz], [x + w / 2, top - .15, zz], .19);
      for (const side of [-1, 1]) post(x + side * (w / 2 - .3), zz, y, h.h - .2, .16);
    }
    for (let i = 0; i <= 6; i++) beam(m.wood, [x - w / 2 + i * w / 6, top - .1, z - d / 2], [x - w / 2 + i * w / 6, top - .1, z + d / 2], .14);
    roof(x, z, w + 2.4, d + 2.3, top + .1, d * .28);
    sign(h.name, x, top - .58, z + d / 2 + .48, h.id === 'hall' ? 3.5 : 2.9);
    lantern(x - 2.8, top - 1.25, z + d / 2 + .3); lantern(x + 2.8, top - 1.25, z + d / 2 + .3);
    if (h.id !== 'gatehouse') {
      furniture(x - w * .25, z - .3, .95);
      furniture(x + w * .25, z - .3, .95);
      sign('山静日长', x, 3, z - d / 2 + .24, 3.1);
      // Shelves and stacked books are visible through the open central bay.
      b.box(m.darkWood, x + w * .32, 1.75, z - d / 2 + .5, 2.7, 2.3, .6);
      for (let k = 0; k < 3; k++) { b.box(m.wood, x + w * .32, .8 + k * .65, z - d / 2 + .84, 2.7, .07, .65); for (let j = 0; j < 8; j++) b.box(j % 3 ? m.paper : m.moss, x + w * .32 - 1.15 + j * .3, .99 + k * .65, z - d / 2 + .91, .24, .35 + rng() * .12, .28); }
    }
  }

  for (const g of GATES) {
    const shape = new T.Shape(); shape.moveTo(-g.length / 2, 0); shape.lineTo(g.length / 2, 0); shape.lineTo(g.length / 2, g.height); shape.lineTo(-g.length / 2, g.height); shape.closePath();
    const hole = new T.Path(); hole.absarc(0, g.radius + .03, g.radius, 0, Math.PI * 2, true); shape.holes.push(hole);
    const geo = new T.ExtrudeGeometry(shape, { depth: .5, bevelEnabled: true, bevelSize: .035, bevelThickness: .035, bevelSegments: 1, curveSegments: 64 });
    b.add(geo, m.plaster, [g.x, GROUND, g.z], [0, g.rotation, 0]); geo.dispose();
    // Brick voussoirs around the real opening, with individually separated joints.
    for (let i = 0; i < 64; i++) {
      const a = i / 64 * Math.PI * 2, u = Math.cos(a) * (g.radius + .1), yy = GROUND + g.radius + .03 + Math.sin(a) * (g.radius + .1);
      const geo = new T.BoxGeometry(.19, .22, .61); const q = new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), g.rotation).multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 0, 1), a)); const e = new T.Euler().setFromQuaternion(q);
      b.add(geo, m.paleStone, [g.x + u * Math.cos(g.rotation), yy, g.z - u * Math.sin(g.rotation) + .24], [e.x, e.y, e.z]); geo.dispose();
    }
    const local = new T.Group(); local.position.set(g.x, GROUND + g.height, g.z); local.rotation.y = g.rotation; root.add(local);
    const rb = new Builder(local); const rg = tiledRoof(g.length + .8, 1.2, .32, 0); rb.add(rg, m.roof); rg.dispose(); rb.finish();
    for (const side of [-1, 1]) {
      const u = side * (g.length / 4 + g.radius / 2);
      const x = g.x + u * Math.cos(g.rotation), z = g.z - u * Math.sin(g.rotation);
      b.box(m.rock, x, GROUND + .21, z + .21, g.length / 2 - g.radius - .1, .42, .61, g.rotation);
    }
  }

  for (const p of PAVILIONS) {
    const n = 8, { x, z, y, r } = p, h = 3.8;
    const base = new T.CylinderGeometry(r, r + .15, .35, n); b.add(base, m.paleStone, [x, y - .17, z]); base.dispose();
    const floor = new T.CylinderGeometry(r - .15, r - .15, .07, n); b.add(floor, m.stone, [x, y + .01, z]); floor.dispose();
    for (let i = 0; i < n; i++) {
      const a = (i + .5) / n * Math.PI * 2, a2 = (i + 1.5) / n * Math.PI * 2, rr = r * .78;
      const px = x + Math.cos(a) * rr, pz = z + Math.sin(a) * rr;
      const qx = x + Math.cos(a2) * rr, qz = z + Math.sin(a2) * rr;
      post(px, pz, y, h, .16); beam(m.wood, [px, y + h - .13, pz], [qx, y + h - .13, qz], .14);
      if (i !== 7 && i !== 0 && i !== 3) {
        beam(m.wood, [px, y + .52, pz], [qx, y + .52, qz], .2);
        beam(m.wood, [px, y + 1, pz], [qx, y + 1, qz], .055);
        for (let j = 1; j < 5; j++) { const t = j / 5; beam(m.wood, [px + (qx - px) * t, y + .5, pz + (qz - pz) * t], [px + (qx - px) * t, y + 1, pz + (qz - pz) * t], .035); }
      }
      beam(m.darkWood, [px, y + h, pz], [x, y + h + 1.9, z], .11);
    }
    // A curved radial roof, with raised corner ribs and overlapping tile courses.
    const pos = [], uv = [], idx = []; const angular = 192, radial = 22;
    for (let j = 0; j <= radial; j++) for (let i = 0; i <= angular; i++) {
      const a = i / angular * Math.PI * 2, t = j / radial, sector = ((a + Math.PI / 8) % (Math.PI / 4)) - Math.PI / 8;
      const rad = .04 + t * (r + .9) * Math.cos(Math.PI / 8) / Math.cos(sector), corners = (Math.abs(sector) / (Math.PI / 8)) ** 7;
      pos.push(x + Math.cos(a) * rad, y + h + 2.65 * (1 - t) ** 1.65 + .6 * corners * t ** 5 + .14 * t ** 9 + .038 * Math.cos(a * 96) * t, z + Math.sin(a) * rad);
      uv.push(i / angular * 8, t * 2.3);
      if (i < angular && j < radial) { const k = j * (angular + 1) + i; idx.push(k, k + angular + 1, k + 1, k + 1, k + angular + 1, k + angular + 2); }
    }
    const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); geo.setIndex(idx); geo.computeVertexNormals(); b.add(geo, m.roof, [0, 0, 0]); geo.dispose();
    b.instance('finials', cylinder, m.roof, [x, y + h + 2.96, z], [0, 0, 0], [.16, .68, .16]);
    for (let i = 0; i < n; i++) {
      const a = (i + .5) / n * Math.PI * 2, pts = [];
      for (let j = 0; j <= 16; j++) { const t = j / 16, rr = t * (r + .9); pts.push([x + Math.cos(a) * rr, y + h + 2.65 * (1 - t) ** 1.65 + .6 * t ** 5 + .14 * t ** 9 + .1, z + Math.sin(a) * rr]); }
      const tube = curvedTube(pts, .08); b.add(tube, m.roof); tube.dispose();
    }
    lantern(x, y + h - 1, z, .65);
    if (p.x === 13) { sign(p.name, x, y + h - .42, z + r * .72, 2.3); furniture(x - 1.3, z - .7, .7); }
  }

  for (const bridge of BRIDGES) {
    const { a, b: end, width: w, height, arch = 0 } = bridge;
    const dx = end[0] - a[0], dz = end[1] - a[1], len = Math.hypot(dx, dz), nx = -dz / len, nz = dx / len;
    const points = Array.from({ length: 50 }, (_, i) => [a[0] + dx * i / 49, a[1] + dz * i / 49]);
    const geo = ribbon(points, w, t => height + arch * Math.sin(Math.PI * t)); b.add(geo, bridge.kind === 'wood' ? m.wood : m.stone, [0, 0, 0]); geo.dispose();
    const count = Math.ceil(len / .35);
    for (let i = 0; i <= count; i++) {
      const t = i / count, y = height + arch * Math.sin(Math.PI * t), x = a[0] + dx * t, z = a[1] + dz * t;
      beam(bridge.kind === 'wood' ? m.darkWood : m.paleStone, [x - nx * w / 2, y - .04, z - nz * w / 2], [x + nx * w / 2, y - .04, z + nz * w / 2], .048);
    }
    for (const side of [-1, 1]) {
      const rail = [];
      const posts = Math.ceil(len / 1.5);
      for (let i = 0; i <= posts; i++) {
        const t = i / posts, x = a[0] + dx * t + nx * w / 2 * side, z = a[1] + dz * t + nz * w / 2 * side, y = height + arch * Math.sin(Math.PI * t);
        beam(bridge.kind === 'wood' ? m.wood : m.paleStone, [x, y - .1, z], [x, y + .9, z], .065);
        rail.push([x, y + .88, z]);
        if (i % 2 === 0) beam(m.rock, [x, -1.7, z], [x, y - .1, z], .16);
      }
      const tube = curvedTube(rail, .065, 48); b.add(tube, bridge.kind === 'wood' ? m.wood : m.paleStone); tube.dispose();
    }
  }

  // Covered eastern gallery: an actual walkable open colonnade, with a perforated rear wall.
  for (let z = -25; z <= 24; z += 4.9) {
    const x = 34.3, w = 3.7, length = 4.9;
    b.box(m.stone, x, .35, z, w + .35, .24, length);
    for (const side of [-1, 1]) for (const end of [-1, 1]) post(x + side * w / 2, z + end * length / 2, .48, 3.1, .115);
    // Roof is rotated by placing a complete local assembly.
    const temp = new T.Group(); temp.position.set(x, 0, z); temp.rotation.y = Math.PI / 2; root.add(temp);
    const builder = new Builder(temp), geo = tiledRoof(length + .35, w + .8, .85, 3.75); builder.add(geo, m.roof); geo.dispose(); builder.finish();
    beam(m.wood, [x - w / 2, 3.5, z - length / 2], [x - w / 2, 3.5, z + length / 2], .1);
    beam(m.wood, [x + w / 2, 3.5, z - length / 2], [x + w / 2, 3.5, z + length / 2], .1);
    if (Math.abs(z + 10) > 4) { b.box(m.plaster, x + w / 2 + .18, 1, z, .24, 1.15, length); b.box(m.plaster, x + w / 2 + .18, 3.28, z, .24, .56, length); lattice(x + w / 2 + .2, 2.16, z, length - .3, 1.65, Math.PI / 2, true); }
    if (Math.round((z + 25) / 4.9) % 2 === 0) lantern(x, 2.9, z, .32);
  }
  // Perimeter and tile copings keep the horizon enclosed.
  for (const side of [-1, 1]) {
    b.box(m.plaster, side * 69, 2.3, 0, .6, 4, 108); b.box(m.rock, side * 69, .72, 0, .65, .85, 108); b.box(m.roof, side * 69, 4.4, 0, .9, .2, 108);
    b.box(m.plaster, 0, 2.3, side * 54, 138, 4, .6); b.box(m.rock, 0, .72, side * 54, 138, .85, .65); b.box(m.roof, 0, 4.4, side * 54, 138, .2, .9);
  }
  // Garden lanterns and low stone seats provide a human scale along the shore.
  for (const [x, z] of [[-12, 26], [14, 27], [-30, 15], [-34, -1], [29, -22], [41, 17], [-45, -17], [-25, -32]]) {
    b.box(m.paleStone, x, .6, z, .65, .35, .65); b.box(m.paleStone, x, 1.1, z, .28, .8, .28); lantern(x, 1.7, z, .38);
    collision.circle(x, z, .3);
  }
  for (const [x, z] of [[-17, 28], [20, 25], [-41, 20]]) { b.box(m.paleStone, x, .85, z, 2.8, .25, .65); for (const i of [-1, 1]) b.box(m.rock, x + i * .9, .58, z, .3, .5, .5); collision.box(x, z, 2.8, .7); }
  b.finish();
  return { lamps, setNight(value) { m.paper.emissiveIntensity = value * 1.5; } };
}
