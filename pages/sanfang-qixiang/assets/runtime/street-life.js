import {
  CanvasTexture,
  Color,
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  RepeatWrapping,
  SRGBColorSpace,
} from '../vendor/three/build/three.module.min.js'
import {
  getStreetLightStrength,
  isPointInRing,
  getWorldPoint,
  createStreetLampGeometries,
  getStreetLampPlacements,
} from './geometry.js'
import { createGardenTreeGeometries } from './heritage-models.js'
import { createLampIndex } from './spatial-index.js'
import { prepareVegetation } from './vegetation-motion.js'

// 街区绿化、街灯和固定照明；资源加入当前场景，由实例统一释放。
export function configureStreetLitMaterial(world, material) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.streetLampPower = world.streetLampPower
    shader.vertexShader =
      'attribute float streetLightGlow;\nvarying float vStreetLightGlow;\n' +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvStreetLightGlow = streetLightGlow;',
      )
    shader.fragmentShader =
      'uniform float streetLampPower;\nvarying float vStreetLightGlow;\n' +
      shader.fragmentShader.replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3(1.0, 0.58, 0.23) * vStreetLightGlow * streetLampPower * diffuseColor.rgb;',
      )
  }
  material.customProgramCacheKey = () => 'sanfang-fixed-street-light-v1'
  material.needsUpdate = true
}

export function buildFixedStreetLighting(world) {
  world.streetLampIndex = createLampIndex(world.streetLampPositions)
  world.streetLitStaticMeshes.forEach((mesh) => {
    const positions = mesh.geometry.attributes.position,
      normals = mesh.geometry.attributes.normal
    const values = new Float32Array(positions.count)
    for (let i = 0; i < positions.count; i++)
      values[i] = getStreetLightStrength(
        [positions.getX(i), positions.getY(i), positions.getZ(i)],
        [normals.getX(i), normals.getY(i), normals.getZ(i)],
        world.streetLampIndex,
      )
    mesh.geometry.setAttribute('streetLightGlow', new Float32BufferAttribute(values, 1))
    configureStreetLitMaterial(world, mesh.material)
  })
  if (world.windowMaterial) {
    world.windowMaterial.emissive.set('#ffbd69')
    world.windowMaterial.emissiveIntensity = 0
  }
}

export function buildVegetation(world) {
  const trees = []
  let seed = 7815
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return seed / 4294967296
  }
  const isBuilding = ([x, z]) =>
    world.projectedBuildings.some(
      (b) => isPointInRing([x, z], b.ring) && !b.holes.some((hole) => isPointInRing([x, z], hole)),
    )
  for (const position of world.memorial?.trees ?? []) {
    const [x, z] = getWorldPoint(position, world.origin)
    if (!isBuilding([x, z])) trees.push([x, z, 2.4 + random() * 0.8])
  }
  for (const b of world.projectedBuildings) {
    for (const hole of b.holes) {
      const x = hole.reduce((v, p) => v + p[0], 0) / hole.length,
        z = hole.reduce((v, p) => v + p[1], 0) / hole.length
      const spreadX = Math.max(...hole.map((p) => p[0])) - Math.min(...hole.map((p) => p[0])),
        spreadZ = Math.max(...hole.map((p) => p[1])) - Math.min(...hole.map((p) => p[1]))
      if (Math.min(spreadX, spreadZ) > 7 && random() > 0.42 && isPointInRing([x, z], hole))
        trees.push([x, z, Math.min(4, Math.min(spreadX, spreadZ) * 0.25)])
    }
  }
  for (const garden of world.data.parks) {
    const ring = garden.map((p) => getWorldPoint(p, world.origin)),
      xs = ring.map((p) => p[0]),
      zs = ring.map((p) => p[1])
    const left = Math.min(...xs),
      right = Math.max(...xs),
      top = Math.min(...zs),
      bottom = Math.max(...zs)
    const count = Math.min(90, Math.ceil(((right - left) * (bottom - top)) / 110))
    for (let i = 0; i < count; i++) {
      const x = left + random() * (right - left),
        z = top + random() * (bottom - top)
      if (isPointInRing([x, z], ring) && !isBuilding([x, z])) trees.push([x, z, 3 + random() * 2])
    }
  }
  const main = (
    world.data.roads.find((r) => r.name === (world.data.meta.mainRoadName ?? '南后街'))?.points ??
    []
  ).map((p) => getWorldPoint(p, world.origin))
  for (let i = 1; i < main.length; i++) {
    const a = main[i - 1],
      b = main[i],
      length = Math.hypot(b[0] - a[0], b[1] - a[1])
    for (let d = 10; d < length; d += 35) {
      const t = d / length,
        x = a[0] + (b[0] - a[0]) * t + 9,
        z = a[1] + (b[1] - a[1]) * t
      if (!isBuilding([x, z])) trees.push([x, z, 3.5 + random() * 1.5])
    }
  }
  // 地标树单独按实景建模，移除其附近的通用绿化，避免树冠和树干重叠。
  for (const landmark of world.landmarks) {
    const [x, z] = getWorldPoint(landmark.position, world.origin)
    for (let index = trees.length - 1; index >= 0; index--) {
      if (Math.hypot(trees[index][0] - x, trees[index][1] - z) < 14) trees.splice(index, 1)
    }
  }
  if (!trees.length) return
  const heritage = world.buildingStyle !== 'rural'
  if (heritage) {
    buildGardenTrees(world, trees, random)
    return
  }
  const crownCount = 2
  const trunks = new InstancedMesh(
    new CylinderGeometry(0.5, 0.7, 1, 5),
    new MeshStandardMaterial({ color: '#756451', roughness: 1 }),
    trees.length,
  )
  const crowns = new InstancedMesh(
    new IcosahedronGeometry(1, 1),
    new MeshStandardMaterial({
      color: world.palette?.tree ?? '#8b9b74',
      roughness: 1,
      flatShading: true,
    }),
    trees.length * crownCount,
  )
  const dummy = new Object3D(),
    color = new Color()
  trees.forEach(([x, z, r], i) => {
    dummy.position.set(x, r * 0.8, z)
    dummy.scale.set(1, r * 1.6, 1)
    dummy.rotation.set(0, 0, 0)
    dummy.updateMatrix()
    trunks.setMatrixAt(i, dummy.matrix)
    for (let j = 0; j < crownCount; j++) {
      dummy.position.set(x + (j - 0.5) * r * 0.7, r * 1.7 + j * r * 0.45, z)
      dummy.scale.set(r, r * 0.85, r * 0.9)
      dummy.rotation.set(0.2, j * 2 + random(), 0.1)
      dummy.updateMatrix()
      crowns.setMatrixAt(i * crownCount + j, dummy.matrix)
      if (world.palette) color.setHSL(0.48, 0.15, 0.72 + random() * 0.14)
      else color.setHSL(0.22 + random() * 0.03, 0.18 + random() * 0.1, 0.46 + random() * 0.1)
      crowns.setColorAt(i * crownCount + j, color)
    }
  })
  trunks.castShadow = true
  crowns.castShadow = true
  crowns.receiveShadow = true
  world.scene.add(trunks, crowns)
}

function buildGardenTrees(world, trees, random) {
  const geometry = createGardenTreeGeometries()
  const surface = document.createElement('canvas')
  surface.width = surface.height = 256
  const ctx = surface.getContext('2d')
  // 透明底上的枝叶剪影：轮廓透光且可以投射斑驳树影，没有实心球壳。
  for (let branch = 0; branch < 5; branch++) {
    const tipX = 32 + branch * 46,
      tipY = 30 + Math.abs(branch - 2) * 24
    ctx.strokeStyle = '#685d3d'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(128, 235)
    ctx.quadraticCurveTo(tipX, 144, tipX, tipY)
    ctx.stroke()
    for (let i = 0; i < 16; i++) {
      const t = 0.14 + i / 19,
        side = i % 2 ? 1 : -1
      const x = 128 + (tipX - 128) * t + side * (11 + random() * 14)
      const y = 232 + (tipY - 232) * t
      ctx.save()
      ctx.translate(x, y)
      ctx.rotate(side * 0.6 + branch * 0.12)
      const gradient = ctx.createLinearGradient(-12, 0, 12, 0)
      gradient.addColorStop(0, '#3f5631')
      gradient.addColorStop(0.52, '#93a46a')
      gradient.addColorStop(1, '#596f3e')
      ctx.fillStyle = gradient
      ctx.beginPath()
      ctx.moveTo(0, -20)
      ctx.bezierCurveTo(17, -7, 12, 12, 0, 20)
      ctx.bezierCurveTo(-12, 10, -15, -6, 0, -20)
      ctx.fill()
      ctx.strokeStyle = '#b0bc7e88'
      ctx.lineWidth = 0.8
      ctx.beginPath()
      ctx.moveTo(0, -17)
      ctx.lineTo(0, 16)
      ctx.stroke()
      ctx.restore()
    }
  }
  const foliage = new CanvasTexture(surface)
  foliage.colorSpace = SRGBColorSpace
  const barkCanvas = document.createElement('canvas')
  barkCanvas.width = 128
  barkCanvas.height = 256
  const bark = barkCanvas.getContext('2d')
  bark.fillStyle = '#8b7e67'
  bark.fillRect(0, 0, 128, 256)
  for (let x = 0; x < 128; x += 3) {
    bark.strokeStyle = x % 2 ? '#635b4a' : '#a79a7e'
    bark.lineWidth = 0.8 + random()
    bark.beginPath()
    bark.moveTo(x, 0)
    bark.bezierCurveTo(x + 5, 80, x - 6, 160, x, 256)
    bark.stroke()
  }
  const barkTexture = new CanvasTexture(barkCanvas)
  barkTexture.colorSpace = SRGBColorSpace
  barkTexture.wrapS = barkTexture.wrapT = RepeatWrapping
  const trunks = new InstancedMesh(
    geometry.wood,
    new MeshStandardMaterial({
      color: '#b6aa95',
      map: barkTexture,
      bumpMap: barkTexture,
      bumpScale: 0.06,
      roughness: 1,
    }),
    trees.length,
  )
  const leaves = new InstancedMesh(
    geometry.leaves,
    new MeshStandardMaterial({
      color: '#92a079',
      map: foliage,
      alphaTest: 0.38,
      alphaToCoverage: true,
      side: DoubleSide,
      roughness: 1,
    }),
    trees.length,
  )
  trunks.name = 'heritage-tree-branches'
  leaves.name = 'heritage-tree-leaves'
  const dummy = new Object3D(),
    color = new Color()
  trees.forEach(([x, z, r], i) => {
    dummy.position.set(x, 0, z)
    dummy.scale.set(r, r * (0.94 + random() * 0.12), r)
    dummy.rotation.set(0, random() * Math.PI * 2, 0)
    dummy.updateMatrix()
    trunks.setMatrixAt(i, dummy.matrix)
    leaves.setMatrixAt(i, dummy.matrix)
    color.setHSL(0.21 + random() * 0.025, 0.12, 0.72 + random() * 0.13)
    leaves.setColorAt(i, color)
  })
  trunks.castShadow = trunks.receiveShadow = leaves.castShadow = leaves.receiveShadow = true
  world.scene.add(trunks, leaves)
  const distant = createGardenTreeGeometries(36)
  distant.wood.dispose()
  prepareVegetation(world, leaves, distant.leaves, trees)
  world.weatherSurfaces.push({ material: leaves.material, color: leaves.material.color.clone(), roughness: 1, foliage: true })
}

export function buildLanterns(world) {
  // 一份中心线灯位同时驱动双灯头模型与夜间照明，不保留街边单灯分组。
  world.streetLampPositions = getStreetLampPlacements(
    world.data.roads,
    world.projectedBuildings,
    world.origin,
  )
  world.lanternMaterial = new MeshStandardMaterial({
    color: '#edcda0',
    emissive: '#ffb05b',
    emissiveIntensity: 0,
    roughness: 0.6,
  })
  const frameMaterial = new MeshStandardMaterial({
    color: '#3f3931',
    roughness: 0.78,
    metalness: 0.35,
  })
  const dummy = new Object3D()
  const geometry = createStreetLampGeometries()
  for (const [kind, material] of [
    ['frame', frameMaterial],
    ['glass', world.lanternMaterial],
  ]) {
    const mesh = new InstancedMesh(geometry[kind], material, world.streetLampPositions.length)
    world.streetLampPositions.forEach((p, i) => {
      dummy.position.set(p.x, 0, p.z)
      dummy.rotation.set(0, p.angle, 0)
      dummy.scale.setScalar(1)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    })
    mesh.castShadow = kind === 'frame'
    mesh.receiveShadow = true
    world.scene.add(mesh)
  }
  const surface = document.createElement('canvas')
  surface.width = surface.height = 64
  const ctx = surface.getContext('2d'),
    gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32)
  gradient.addColorStop(0, 'rgba(255,195,109,.8)')
  gradient.addColorStop(0.35, 'rgba(255,173,71,.3)')
  gradient.addColorStop(1, 'rgba(255,173,71,0)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, 64, 64)
  const texture = new CanvasTexture(surface)
  texture.colorSpace = SRGBColorSpace
  world.glowMaterial = new MeshBasicMaterial({
    map: texture,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  })
  const glows = new InstancedMesh(
    new PlaneGeometry(15, 15).rotateX(-Math.PI / 2),
    world.glowMaterial,
    world.streetLampPositions.length,
  )
  const matrix = new Matrix4()
  world.streetLampPositions.forEach((p, i) => {
    matrix.makeTranslation(p.x, 0.12, p.z)
    glows.setMatrixAt(i, matrix)
  })
  world.scene.add(glows)
}
