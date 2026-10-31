import * as THREE from './vendor/three/build/three.module.min.js';

// Deterministic microscopic surface relief; every map is generated locally.
function randomSequence(seed) {
  return () => { seed = Math.imul(seed ^ (seed >>> 15), 1 | seed); seed ^= seed + Math.imul(seed ^ (seed >>> 7), 61 | seed); return ((seed ^ (seed >>> 14)) >>> 0) / 4294967296; };
}

function surfaceMaps(brushed = false) {
  const size = 512, rng = randomSequence(brushed ? 1057 : 9301);
  const normal = new Uint8Array(size * size * 4), roughness = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    const stripe = rng();
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4, noise = rng() - .5;
      normal[i] = 128 + noise * (brushed ? 2 : 13);
      normal[i + 1] = 128 + (brushed ? (stripe - .5) * 24 : noise * 13);
      normal[i + 2] = 254; normal[i + 3] = 255;
      const value = 170 + (brushed ? stripe * 55 + noise * 9 : noise * 56);
      roughness[i] = roughness[i + 1] = roughness[i + 2] = value; roughness[i + 3] = 255;
    }
  }
  const make = data => {
    const map = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.magFilter = THREE.LinearFilter; map.minFilter = THREE.LinearMipmapLinearFilter;
    map.generateMipmaps = true; map.anisotropy = 8; map.needsUpdate = true;
    map.repeat.set(brushed ? 3 : 7, brushed ? 3 : 7);
    return map;
  };
  return { normalMap: make(normal), roughnessMap: make(roughness) };
}

export function createMaterials() {
  const brushed = surfaceMaps(true), grain = surfaceMaps(false);
  return {
    porcelain: new THREE.MeshPhysicalMaterial({ color:'#d7ddd8', metalness:.08, roughness:.31, clearcoat:.85, clearcoatRoughness:.16, normalMap:grain.normalMap, normalScale:new THREE.Vector2(.08,.08) }),
    edge: new THREE.MeshPhysicalMaterial({ color:'#aab5b8', metalness:1, roughness:.3, ...brushed, normalScale:new THREE.Vector2(.18,.18), anisotropy:.35 }),
    steel: new THREE.MeshPhysicalMaterial({ color:'#b4bec3', metalness:1, roughness:.36, ...brushed, normalScale:new THREE.Vector2(.18,.32), anisotropy:.65, anisotropyRotation:Math.PI / 2 }),
    aluminum: new THREE.MeshStandardMaterial({ color:'#b2babc', metalness:.92, roughness:.44, ...brushed, normalScale:new THREE.Vector2(.16,.16) }),
    graphite: new THREE.MeshPhysicalMaterial({ color:'#23302e', metalness:.24, roughness:.36, ...grain, normalScale:new THREE.Vector2(.28,.28), clearcoat:.22 }),
    dark: new THREE.MeshPhysicalMaterial({ color:'#111d1e', metalness:.48, roughness:.27, clearcoat:.52, clearcoatRoughness:.2 }),
    rubber: new THREE.MeshStandardMaterial({ color:'#242d29', roughness:.88, normalMap:grain.normalMap, normalScale:new THREE.Vector2(.6,.6) }),
    plastic: new THREE.MeshStandardMaterial({ color:'#737e76', metalness:0, roughness:.71, ...grain, normalScale:new THREE.Vector2(.45,.45) }),
    copper: new THREE.MeshPhysicalMaterial({ color:'#bd703b', metalness:1, roughness:.28, ...brushed, normalScale:new THREE.Vector2(.15,.15), clearcoat:.18 }),
    winding: new THREE.MeshPhysicalMaterial({ color:'#c5783e', metalness:.9, roughness:.23, clearcoat:.5, clearcoatRoughness:.18 }),
    gold: new THREE.MeshStandardMaterial({ color:'#b99a59', metalness:.9, roughness:.3 }),
    blue: new THREE.MeshStandardMaterial({ color:'#88a7ac', metalness:.86, roughness:.39, ...brushed, normalScale:new THREE.Vector2(.12,.12) }),
    glass: new THREE.MeshPhysicalMaterial({ color:'#eef7f3', metalness:0, roughness:.065, transmission:1, thickness:.026, ior:1.47, attenuationColor:new THREE.Color('#a1c5b9'), attenuationDistance:2, clearcoat:.12, clearcoatRoughness:.12, side:THREE.FrontSide }),
    pcb: new THREE.MeshStandardMaterial({ color:'#184b39', metalness:.15, roughness:.5 }),
    black: new THREE.MeshStandardMaterial({ color:'#081211', roughness:.53 }),
    concrete: new THREE.MeshStandardMaterial({ color:'#999b8b', roughness:.95, normalMap:grain.normalMap, normalScale:new THREE.Vector2(1.8,1.8) }),
    insulator: new THREE.MeshStandardMaterial({ color:'#d2c6ab', roughness:.72 }),
    led: new THREE.MeshStandardMaterial({ color:'#b7e4d0', emissive:'#87c9ad', emissiveIntensity:.75, roughness:.25 }),
  };
}

// Actual punched holes with pressed bevels and thickness, visible from both sides.
// 2,688 holes share one draw call instead of using an alpha-cutout texture.
export function createPerforatedDrum() {
  const columns = 96, rows = 28, segments = 8;
  const radius = .755, length = 1.52, circumference = Math.PI * 2 * radius;
  const cellWidth = circumference / columns, cellHeight = length / rows;
  const positions = [], uvs = [], indices = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < columns; col++) {
      const start = positions.length / 3;
      const centerAngle = (col + .5) / columns * Math.PI * 2;
      const centerZ = (row + .5) * cellHeight - length / 2;
      for (let ring = 0; ring < 4; ring++) {
        for (let k = 0; k < segments; k++) {
          const a = k / segments * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
          const size = ring === 1 ? .0115 : .0053;
          // Exact rectangular corners close the tessellation between neighbouring cells.
          const dx = ring === 0 ? Math.round(ca) * cellWidth / 2 : ca * size;
          const dy = ring === 0 ? Math.round(sa) * cellHeight / 2 : sa * size;
          const angle = centerAngle + dx / radius;
          const r = radius + (ring === 1 ? -.0008 : ring === 2 ? -.0032 : ring === 3 ? -.009 : 0);
          const z = centerZ + dy;
          positions.push(r * Math.cos(angle), r * Math.sin(angle), z);
          uvs.push(angle / (Math.PI * 2), (z + length / 2) / length);
        }
      }
      for (let ring = 0; ring < 3; ring++) for (let k = 0; k < segments; k++) {
        const a = start + ring * segments + k, b = start + ring * segments + (k + 1) % segments;
        const c = a + segments, d = b + segments;
        indices.push(a,b,d,a,d,c);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
  geometry.setIndex(indices); geometry.computeVertexNormals(); geometry.computeBoundingSphere();
  return geometry;
}
