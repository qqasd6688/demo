import {
  BufferGeometry, Color, DoubleSide, Float32BufferAttribute, Group, InstancedBufferAttribute,
  InstancedMesh, LineBasicMaterial, LineSegments, Mesh, MeshStandardMaterial, Object3D,
  SphereGeometry,
} from '../vendor/three/build/three.module.min.js'
import { mergeGeometries } from '../vendor/three/examples/jsm/utils/BufferGeometryUtils.js'
import { isPointInRing } from './geometry.js'
import { createPondSurfaceGeometry } from './river-geometry.js'

const TAU = Math.PI * 2
const clamp = (x, a, b) => Math.max(a, Math.min(b, x))
const noise = x => { const n = Math.sin(x * 127.1 + 311.7) * 43758.5453; return n - Math.floor(n) }

export function distanceToPondShore(point, ring) {
  let distance = Infinity
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length], dx = b[0] - a[0], dz = b[1] - a[1]
    const t = clamp(((point[0] - a[0]) * dx + (point[1] - a[1]) * dz) / Math.max(1e-8, dx * dx + dz * dz), 0, 1)
    distance = Math.min(distance, Math.hypot(point[0] - a[0] - dx * t, point[1] - a[1] - dz * t))
  }
  return distance
}

// 在实际凹形池岸内找安全中心与岸边种植区，不靠包围盒随意放置。
export function createPondLayout(ring, seed = 1) {
  const xs = ring.map(p => p[0]), zs = ring.map(p => p[1])
  const min = [Math.min(...xs), Math.min(...zs)], max = [Math.max(...xs), Math.max(...zs)]
  const candidates = []
  for (let x = 1; x < 25; x++) for (let z = 1; z < 25; z++) {
    const point = [min[0] + (max[0] - min[0]) * x / 25, min[1] + (max[1] - min[1]) * z / 25]
    if (isPointInRing(point, ring)) candidates.push({ point, clearance: distanceToPondShore(point, ring) })
  }
  const center = candidates.reduce((best, p) => !best || p.clearance > best.clearance ? p : best, null)
  if (!center || center.clearance < 1.5) return null
  const clusters = []
  const anchors = center.clearance > 4 ? [[.22, .28], [.77, .55], [.40, .79]] : [[.22, .35], [.73, .63]]
  for (const [u, v] of anchors) {
    const target = [min[0] + (max[0] - min[0]) * u, min[1] + (max[1] - min[1]) * v]
    const safe = candidates.filter(p => p.clearance > 2.1).sort((a, b) =>
      Math.hypot(a.point[0] - target[0], a.point[1] - target[1]) - Math.hypot(b.point[0] - target[0], b.point[1] - target[1]))[0]
    if (safe) clusters.push(safe.point)
  }
  const fish = Array.from({ length: center.clearance > 4 ? 14 : 7 }, (_, i) => ({
    phase: noise(seed * 71 + i) * TAU, radius: Math.max(.25, center.clearance - 1.45) * (.3 + noise(i + seed * 19) * .65),
    speed: (.12 + noise(i + 7) * .085) * (i % 3 ? 1 : -1),
    size: .8 + noise(seed * 29 + i) * .5, variety: i % 3,
  }))
  return { ring, center: center.point, radius: center.clearance, clusters, fish, seed }
}

export function getKoiPose(layout, fish, time) {
  const angle = fish.phase + time * fish.speed
  const x = layout.center[0] + Math.sin(angle) * fish.radius
  const z = layout.center[1] + Math.cos(angle) * fish.radius * .72
  return { x, z, y: -.38 + Math.sin(angle * 2 + fish.phase) * .045,
    yaw: Math.atan2(Math.cos(angle) * fish.speed, -Math.sin(angle) * .72 * fish.speed), scale: fish.size }
}

function coloredGeometry(positions, colors) {
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3))
  geometry.computeVertexNormals()
  return geometry
}

export function createKoiGeometry(variety = 0) {
  const positions = [], colors = [], color = new Color(), pale = new Color('#ede5c9')
  const pigment = new Color(['#ca512c', '#e5aa38', '#bd4028'][variety])
  const vertex = (p, tint) => { positions.push(...p); colors.push(tint.r, tint.g, tint.b) }
  const bodyPoint = (t, angle) => {
    const girth = Math.pow(Math.sin(Math.PI * t), .72)
    return [Math.cos(angle) * girth * .185, Math.sin(angle) * girth * .12, -.53 + t * 1.12]
  }
  for (let row = 0; row < 14; row++) for (let col = 0; col < 14; col++) {
    for (const [r, c] of [[row,col],[row+1,col],[row+1,col+1],[row,col],[row+1,col+1],[row,col+1]]) {
      const t = r / 14, angle = c / 14 * TAU, p = bodyPoint(t, angle)
      const patch = Math.sin(t * 17 + Math.cos(angle * 2 + variety) * 2.4 + variety * 3)
      color.copy(variety === 1 || patch > .12 ? pigment : pale)
      if (variety === 2 && patch < -.72 && p[1] > 0) color.set('#343b32')
      color.multiplyScalar(.84 + .16 * Math.max(0, Math.sin(angle)))
      vertex(p, color)
    }
  }
  const fin = (points, tint) => { for (let i = 1; i < points.length - 1; i++) for (const p of [points[0], points[i], points[i+1]]) vertex(p, tint) }
  const finColor = pale.clone().lerp(pigment, .35)
  fin([[0,0,-.49],[-.25,.015,-.95],[-.08,.015,-.85],[0,0,-.91],[.08,.015,-.85],[.25,.015,-.95]], finColor)
  for (const sign of [-1, 1]) fin([[sign*.12,-.015,.22],[sign*.36,-.04,.03],[sign*.25,-.03,-.10],[sign*.14,-.01,.04]], finColor)
  fin([[0,.09,-.22],[0,.245,-.05],[0,.12,.25]], pigment)
  const body = coloredGeometry(positions, colors), eyes = []
  for (const sign of [-1, 1]) {
    const eye = new SphereGeometry(.028, 7, 5)
    eye.translate(sign * .091, .048, .465)
    const values = new Float32Array(eye.attributes.position.count * 3), dark = new Color('#18251e')
    for (let i = 0; i < values.length; i += 3) values.set([dark.r, dark.g, dark.b], i)
    eye.setAttribute('color', new Float32BufferAttribute(values, 3))
    eye.deleteAttribute('uv')
    eyes.push(eye.toNonIndexed()); eye.dispose()
  }
  const combined = mergeGeometries([body, ...eyes])
  body.dispose(); eyes.forEach(g => g.dispose())
  return combined
}

export function createLotusLeafGeometry(radius = 1) {
  const positions = [], colors = [], base = new Color('#547a3c'), tip = new Color('#7d9650'), tint = new Color()
  const point = (r, angle) => [Math.cos(angle) * r * radius, .04 * radius + .12 * r ** 3 + Math.sin(angle * 5) * .025 * r ** 4, Math.sin(angle) * r * radius]
  for (let row = 0; row < 5; row++) for (let col = 0; col < 40; col++) {
    for (const [r, c] of [[row,col],[row+1,col],[row+1,col+1],[row,col],[row+1,col+1],[row,col+1]]) {
      const t = r / 5, angle = c / 40 * TAU
      positions.push(...point(t, angle))
      tint.copy(base).lerp(tip, t * .5 + (col % 5 === 0 ? .13 : 0))
      colors.push(tint.r, tint.g, tint.b)
    }
  }
  return coloredGeometry(positions, colors)
}

function createLotusFlowerGeometry() {
  const positions = [], colors = [], tint = new Color(), ivory = new Color('#fff0df'), pink = new Color('#ce6b8c')
  for (const [petals, radius, lift, offset] of [[13,.55,.16,0],[10,.36,.29,.21],[7,.23,.35,.48]]) {
    for (let petal = 0; petal < petals; petal++) {
      const angle = petal / petals * TAU + offset
      const point = (t, q) => {
        const reach = radius * (.12 + t * .88), width = Math.sin(Math.PI * t) ** .65 * radius * .43
        return [Math.sin(angle) * reach + Math.cos(angle) * q * width,
          .06 + lift * t + Math.sin(Math.PI * t) * .09 + q * q * .035,
          Math.cos(angle) * reach - Math.sin(angle) * q * width]
      }
      for (let row = 0; row < 6; row++) for (let col = 0; col < 4; col++) {
        for (const [r, c] of [[row,col],[row+1,col],[row+1,col+1],[row,col],[row+1,col+1],[row,col+1]]) {
          const t = r / 6, q = c / 2 - 1
          positions.push(...point(t, q)); tint.copy(ivory).lerp(pink, .15 + t ** 2 * .67 + Math.abs(q) * .1)
          colors.push(tint.r, tint.g, tint.b)
        }
      }
    }
  }
  return coloredGeometry(positions, colors)
}

// 所有模型为本地程序几何；与河面共用 waterClock、渲染循环与资源回收。
export function buildPondLife(world, rings) {
  const layouts = rings.map((ring, i) => createPondLayout(ring, i + 1)).filter(Boolean)
  if (!layouts.length) return
  const root = new Group(); root.name = 'memorial-lotus-ponds'
  const floorGeometry = createPondSurfaceGeometry(rings), floorPositions = floorGeometry.attributes.position
  const floorColors = [], silt = new Color('#555b38'), stone = new Color('#777657'), shade = new Color('#364b37'), tint = new Color()
  for (let i = 0; i < floorPositions.count; i++) {
    const shore = floorGeometry.attributes.waterProfile.getY(i), x = floorPositions.getX(i), z = floorPositions.getZ(i)
    const depth = .4 + Math.min(1, shore / 4.5) * .9
    floorPositions.setY(i, -depth + Math.sin(x * .55) * Math.cos(z * .7) * .07)
    tint.copy(silt).lerp(stone, noise(Math.floor(x * 1.6) + Math.floor(z * 1.3) * 41) * .45)
      .lerp(shade, Math.min(.55, shore * .045))
    floorColors.push(tint.r, tint.g, tint.b)
  }
  floorGeometry.setAttribute('color', new Float32BufferAttribute(floorColors, 3)); floorGeometry.computeVertexNormals()
  const floor = new Mesh(floorGeometry, new MeshStandardMaterial({ vertexColors: true, roughness: 1 }))
  floor.name = 'silt-and-stone-pond-bed'; floor.receiveShadow = true; root.add(floor)
  const leaves = [], veins = [], flowers = [], centers = [], stems = [], dummy = new Object3D()
  for (const layout of layouts) for (const [clusterIndex, center] of layout.clusters.entries()) {
    const count = layout.radius > 4 ? 10 : 7
    for (let i = 0; i < count; i++) {
      const angle = i * 2.39996 + clusterIndex, spread = Math.sqrt(i / count) * 2.35
      const x = center[0] + Math.sin(angle) * spread, z = center[1] + Math.cos(angle) * spread
      const radius = .62 + noise(i + clusterIndex * 23 + layout.seed) * .45
      if (!isPointInRing([x,z], layout.ring) || distanceToPondShore([x,z],layout.ring) < radius + .4) continue
      const leaf = createLotusLeafGeometry(radius)
      const height = .085 + (i % 4 === 0 ? .33 : 0)
      leaf.rotateY(angle); leaf.translate(x,height,z); leaves.push(leaf)
      for (let ray = 0; ray < 12; ray++) {
        const a = ray / 12 * TAU + angle
        veins.push(x,height+.04*radius+.008,z,x+Math.cos(a)*radius*.92,height+.04*radius+.1,z+Math.sin(a)*radius*.92)
      }
      if (i === 1 || i === 5 || i === 8) {
        const flower = createLotusFlowerGeometry(), bloomY = height + .30
        flower.rotateY(angle); flower.translate(x+.12,bloomY,z-.08); flowers.push(flower)
        const middle = new SphereGeometry(.105, 10, 6); middle.scale(1,.55,1); middle.translate(x+.12,bloomY+.13,z-.08); centers.push(middle)
        // 细茎保持在花和叶下方，不把花做成浮在水面的贴片。
        const stem = new SphereGeometry(.035, 5, 5); stem.scale(1,(bloomY+.5)/.07,1); stem.translate(x+.12,(bloomY-.5)/2,z-.08); stems.push(stem)
      }
    }
  }
  const merge = (parts, material, name) => {
    if (!parts.length) { material.dispose(); return }
    const mesh = new Mesh(mergeGeometries(parts), material); parts.forEach(g => g.dispose())
    mesh.name = name; mesh.receiveShadow = true; root.add(mesh)
  }
  merge(leaves,new MeshStandardMaterial({vertexColors:true,side:DoubleSide,roughness:.83}),'lotus-leaf-clusters')
  merge(flowers,new MeshStandardMaterial({vertexColors:true,side:DoubleSide,roughness:.62}),'pink-lotus-blossoms')
  merge(centers,new MeshStandardMaterial({color:'#d6ad48',roughness:.7}),'lotus-golden-centers')
  merge(stems,new MeshStandardMaterial({color:'#687b3e',roughness:.9}),'lotus-stems')
  const veinGeometry = new BufferGeometry().setAttribute('position',new Float32BufferAttribute(veins,3))
  root.add(new LineSegments(veinGeometry,new LineBasicMaterial({color:'#b1bc78',transparent:true,opacity:.25})))
  const time = {value:0}, fishMeshes = []
  for (let variety = 0; variety < 3; variety++) {
    const fish = layouts.flatMap(layout => layout.fish.filter(f => f.variety === variety).map(f => ({layout,fish:f})))
    if (!fish.length) continue
    const geometry = createKoiGeometry(variety)
    geometry.setAttribute('pondPhase',new InstancedBufferAttribute(new Float32Array(fish.map(({fish})=>fish.phase)),1))
    const material = new MeshStandardMaterial({vertexColors:true,side:DoubleSide,roughness:.48})
    material.onBeforeCompile = shader => {
      shader.uniforms.pondTime=time
      shader.vertexShader='uniform float pondTime;attribute float pondPhase;\n'+shader.vertexShader.replace('#include <begin_vertex>',
        '#include <begin_vertex>\nfloat tailWeight=smoothstep(.12,.85,-position.z);transformed.x+=sin(pondTime*5.5+pondPhase+position.z*5.0)*tailWeight*.13;')
    }
    material.customProgramCacheKey=()=> 'pond-koi-tail-v1'
    const mesh = new InstancedMesh(geometry,material,fish.length)
    mesh.name=`swimming-koi-${variety}`;mesh.frustumCulled=false;mesh.receiveShadow=true
    root.add(mesh);fishMeshes.push({mesh,fish})
  }
  world.pondLife={root,layouts,time,fishMeshes,dummy}
  world.scene.add(root);updatePondLife(world)
}

export function updatePondLife(world) {
  const life=world.pondLife
  if(!life)return
  life.time.value=world.waterClock
  for(const {mesh,fish} of life.fishMeshes){
    fish.forEach(({layout,fish},i)=>{
      const pose=getKoiPose(layout,fish,world.waterClock)
      life.dummy.position.set(pose.x,pose.y,pose.z);life.dummy.rotation.set(0,pose.yaw,0);life.dummy.scale.setScalar(pose.scale)
      life.dummy.updateMatrix();mesh.setMatrixAt(i,life.dummy.matrix)
    })
    mesh.instanceMatrix.needsUpdate=true
  }
}
