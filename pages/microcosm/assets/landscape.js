import * as THREE from './vendor/three/build/three.module.min.js';

export const HALF = 4.18;
export const FLOOR = -3.35;
export const WATER = -1.31;
export const UPPER_WATER = 0.08;
export const FALL_Z = -0.82;

export function seededRandom(seed = 1027) {
  return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t ^= t + Math.imul(t ^ t >>> 7, 61 | t); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
export const smoothstep = (a, b, x) => { const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const fract = n => n - Math.floor(n);
const hash = (x, y) => fract(Math.sin(x * 127.1 + y * 311.7) * 43758.5453);
export function noise(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y), u = smoothstep(0, 1, fract(x)), v = smoothstep(0, 1, fract(y));
  return THREE.MathUtils.lerp(THREE.MathUtils.lerp(hash(ix, iy), hash(ix + 1, iy), u), THREE.MathUtils.lerp(hash(ix, iy + 1), hash(ix + 1, iy + 1), u), v);
}
export function relief(x, z) { return noise(x * 1.8, z * 1.8) * .55 + noise(x * 4.8, z * 4.8) * .27 + noise(x * 12, z * 12) * .12 + noise(x * 25, z * 25) * .06; }
export function riverX(z) { return .1 + Math.sin(z * 1.43 + .8) * .64 + Math.sin(z * .54) * .24; }
export function waterDistance(x, z) {
  const river = Math.abs(x - riverX(z)) / (.3 + .08 * Math.cos(z * 1.7));
  const lake = Math.hypot((x - .4) / 1.37, (z - 2.35) / 1.05);
  return Math.min(river, lake);
}
export function heightAt(x, z) {
  let h = -1.12 + relief(x, z) * .49;
  h += .42 * Math.exp(-((x + 2.8) ** 2 + (z - 1.4) ** 2) / 2);
  h += .45 * Math.exp(-((x - 2.9) ** 2 + (z - .8) ** 2) / 2.3);
  // A raised glacial basin feeds a waterfall, then a lower meandering river.
  h += 1.24 * (1 - smoothstep(-1.03, -.68, z));
  const peaks = [[-1.7, -2.65, 3.25, 1.35], [-2.95, -1.85, 1.8, 1], [.05, -3.1, 2.1, 1.1], [2.25, -2.7, 2.95, 1.17], [3.35, -1.65, 1.45, .85]];
  let mountain = 0;
  for (const [px, pz, amp, width] of peaks) {
    const angle = Math.atan2(z-pz,x-px);
    const ridges = 1 + Math.sin(angle*5+px)*.13 + Math.cos(angle*9+pz)*.07;
    const d = Math.hypot((x - px) / width, (z - pz) / (width * .85)) / ridges;
    mountain = Math.max(mountain, amp * Math.max(0, 1 - d / 1.5) ** 1.3);
  }
  h += mountain;
  h += (relief(x * 2 + 40, z * 2 + 20) - .5) * Math.max(0, h + .5) * .48;
  const channel = smoothstep(.8, 1.75, waterDistance(x, z));
  const riverBed = z < FALL_Z ? UPPER_WATER - .18 : WATER - .2;
  // The spring starts below the back mountain range.
  const carve = channel + (1 - channel) * (1 - smoothstep(-3.05, -2.2, z));
  return THREE.MathUtils.lerp(riverBed, h, carve);
}

export function createTerrain(surfaces) {
  const geometry = new THREE.PlaneGeometry(HALF * 2, HALF * 2, 256, 256);
  geometry.rotateX(-Math.PI / 2);
  const positions = geometry.attributes.position;
  const colors = new Float32Array(positions.count * 3);
  const snowCover = new Float32Array(positions.count);
  const green = new THREE.Color('#91a457'), darkGreen = new THREE.Color('#426b43'), earth = new THREE.Color('#c2b78d');
  const stone = new THREE.Color('#899796'), snow = new THREE.Color('#edf3f0'), color = new THREE.Color();
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i), z = positions.getZ(i), y = heightAt(x, z);
    positions.setY(i, y);
    const grain = relief(x * 2 + 17, z * 2 - 3);
    color.copy(darkGreen).lerp(green, grain);
    const slope = Math.hypot(heightAt(x + .035, z) - y, heightAt(x, z + .035) - y) / .035;
    color.lerp(stone, smoothstep(.6, 1.7, slope) * .9);
    color.lerp(earth, (1 - smoothstep(1.1, 1.9, waterDistance(x, z))) * .65);
    color.lerp(stone, smoothstep(.2, 1.1, y));
    const snowline = 1.2 + grain * .65 + Math.sin(x * 5 + z * 3) * .18;
    snowCover[i] = smoothstep(snowline - .3, snowline + .12, y) * (1-smoothstep(2.1,4.2,slope)*.8);
    color.lerp(snow, snowCover[i]);
    const pocket=Math.max(0,(heightAt(x+.1,z)+heightAt(x-.1,z)+heightAt(x,z+.1)+heightAt(x,z-.1))*.25-y);
    color.multiplyScalar(1-Math.min(.24,pocket*2));
    color.multiplyScalar(.89 + grain * .24);
    color.toArray(colors, i * 3);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('snow', new THREE.BufferAttribute(snowCover, 1));
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, surfaces.terrain);
  mesh.castShadow = true; mesh.receiveShadow = true;
  const group = new THREE.Group(); group.add(mesh);
  const positionsSide = [], colorsSide = [];
  const earthDark = new THREE.Color('#4b5155'), earthLight = new THREE.Color('#a6a79b'), moss = new THREE.Color('#6f854c');
  const edge = (side, t) => side === 0 ? [-HALF + t * HALF * 2, HALF] : side === 1 ? [HALF, HALF - t * HALF * 2] : side === 2 ? [HALF - t * HALF * 2, -HALF] : [-HALF, -HALF + t * HALF * 2];
  function sideVertex(side, t, v) {
    let [x, z] = edge(side, t);
    const top = heightAt(x, z), y = THREE.MathUtils.lerp(FLOOR, top, v);
    const inset = Math.sin(v * Math.PI) * (.11 + noise(t * 11, v * 7) * .24) + (1-v)*.13;
    x *= 1 - inset / HALF; z *= 1 - inset / HALF;
    positionsSide.push(x, y, z);
    const grain = noise(t * 40, y * 7);
    const strata=.5+.5*Math.sin(y*26+noise(t*9,y*.7)*5);
    color.copy(earthDark).lerp(earthLight, grain*.35+strata*.22);
    color.lerp(moss, smoothstep(.88, 1, v) * .9);
    color.toArray(colorsSide, colorsSide.length);
  }
  for (let side = 0; side < 4; side++) for (let i = 0; i < 120; i++) for (let j = 0; j < 30; j++) {
    const a = i / 120, b = (i + 1) / 120, c = j / 30, d = (j + 1) / 30;
    [[a,c],[b,c],[a,d],[b,c],[b,d],[a,d]].forEach(([t,v]) => sideVertex(side,t,v));
  }
  const sideGeo = new THREE.BufferGeometry();
  sideGeo.setAttribute('position', new THREE.Float32BufferAttribute(positionsSide, 3));
  sideGeo.setAttribute('snow', new THREE.Float32BufferAttribute(new Float32Array(positionsSide.length/3), 1));
  sideGeo.setAttribute('color', new THREE.Float32BufferAttribute(colorsSide, 3)); sideGeo.computeVertexNormals();
  const sideMesh = new THREE.Mesh(sideGeo, surfaces.cliff);
  sideMesh.castShadow = true; sideMesh.receiveShadow = true; group.add(sideMesh);
  const bottom = new THREE.Mesh(new THREE.PlaneGeometry(HALF*2, HALF*2), new THREE.MeshStandardMaterial({ color: '#263a3c', roughness: .8, side: THREE.DoubleSide }));
  bottom.rotation.x = Math.PI / 2; bottom.position.y = FLOOR; group.add(bottom);
  return group;
}

