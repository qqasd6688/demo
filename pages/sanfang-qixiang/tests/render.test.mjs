import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { Scene, PerspectiveCamera, Vector3, Object3D, Matrix4, InstancedMesh, MeshStandardMaterial, Color, ShaderLib } from '../assets/vendor/three/build/three.module.min.js'
import { createGuideModel } from '../assets/guide-model.js'
import { createBuildingGeometries, getWorldPoint } from '../assets/runtime/geometry.js'
import { createPavingTextures, createStreetPavingGeometry, PAVING_REPEAT_METERS } from '../assets/runtime/paving.js'
import { buildPedestrians, updatePedestrians } from '../assets/runtime/pedestrians.js'
import { createSurfaceDetail } from '../assets/runtime/surface-detail.js'
import { configureSurfaceLighting } from '../assets/runtime/surface-detail.js'
import { createGardenTreeGeometries } from '../assets/runtime/heritage-models.js'
import { prepareVegetation, updateVegetation, wantsDetailedTree } from '../assets/runtime/vegetation-motion.js'
import { chooseRenderScale } from '../assets/runtime/render-budget.js'
import { snapShadowBounds, setSunShadowDirection, updateSunShadow } from '../assets/runtime/sun-shadow.js'
import { DirectionalLight } from '../assets/vendor/three/build/three.module.min.js'

test('游客合批保留人数、配色、行走与暂停，按投影细节减少绘制', async () => {
  const oldWindow = globalThis.window, oldDocument = globalThis.document
  globalThis.window = { crypto: { getRandomValues(array) { array[0] = 1729; return array } } }
  globalThis.document = { createElement() { return { getContext() {
    return { createRadialGradient() { return { addColorStop() {} } }, fillRect() {} }
  } } } }
  let world
  try {
    const data = JSON.parse(await readFile(new URL('../assets/data/map-data.json', import.meta.url)))
    world = { ...createGuideModel(data), scene: new Scene(), camera: new PerspectiveCamera(54, 1.6, 1, 12000),
      state: { timeOfDay: 'day', crowdPlaying: true }, stage: { clientHeight: 800 },
      crowdBatches: {}, crowdClock: 0, crowdLastFrame: 0, crowdRoot: new Object3D(),
      crowdPart: new Object3D(), crowdMatrix: new Matrix4(), streetLampPower: { value: 0 },
      controls: { target: new Vector3() },
    }
    world.camera.position.set(0, 1200, 1200)
    world.camera.updateMatrixWorld()
    world.origin = data.meta.origin
    world.projectedBuildings = data.buildings.map(building => ({
      ring: building.ring.map(point => getWorldPoint(point, world.origin)),
      holes: (building.holes || []).map(ring => ring.map(point => getWorldPoint(point, world.origin))),
    }))
    buildPedestrians(world)
    updatePedestrians(world, 0)
    const population = world.state.crowdCount
    const batches = Object.values(world.crowdBatches)
    const triangles = () => batches.reduce((sum, { mesh }) => sum + mesh.geometry.index.count / 3 * mesh.count, 0)
    const legacy = batches.reduce((sum, { mesh, slots }) => sum + mesh.geometry.index.count / 3 * population * slots, 0)
    const far = triangles()
    assert.equal(world.crowdBatches.body.mesh.count, population)
    assert.ok(far < legacy * 0.65, `${far} should be substantially smaller than ${legacy}`)
    const before = world.crowdBatches.body.mesh.instanceMatrix.array.slice()
    updatePedestrians(world, 100)
    updatePedestrians(world, 200)
    assert.notDeepEqual(world.crowdBatches.body.mesh.instanceMatrix.array, before)
    world.state.crowdPlaying = false
    const clock = world.crowdClock, version = world.crowdBatches.body.mesh.instanceMatrix.version
    updatePedestrians(world, 300)
    assert.equal(world.crowdClock, clock)
    assert.equal(world.crowdBatches.body.mesh.instanceMatrix.version, version)
    // 聚焦一位游客；暂停时移动镜头仍应更新细节，不改变行走时钟。
    const actor = world.crowdActors[0]
    const matrix = new Matrix4()
    world.crowdBatches.body.mesh.getMatrixAt(0, matrix)
    world.camera.position.setFromMatrixPosition(matrix).add(new Vector3(0, 8, 10))
    world.camera.updateMatrixWorld()
    updatePedestrians(world, 400)
    assert.ok(actor.detailed)
    assert.equal(world.crowdClock, clock)
    assert.ok(triangles() > far)
    for (const { mesh, colors } of batches) {
      assert.ok(mesh.count <= mesh.instanceMatrix.count)
      assert.ok(mesh.instanceMatrix.array.subarray(0, mesh.count * 16).every(Number.isFinite))
      if (colors) assert.ok(mesh.instanceColor.array.subarray(0, mesh.count * 3).every(Number.isFinite))
    }
    world.state.timeOfDay = 'dawn'
    updatePedestrians(world, 500)
    assert.ok(world.state.crowdCount < population)
    assert.equal(world.crowdBatches.head.mesh.count, world.state.crowdCount)
    console.log(JSON.stringify({ population, legacyCrowdTriangles: legacy, optimizedFarCrowdTriangles: far,
      reduction: `${((1 - far / legacy) * 100).toFixed(1)}%` }))
  } finally {
    world?.scene.traverse(object => { object.geometry?.dispose(); object.material?.dispose(); object.dispose?.() })
    globalThis.window = oldWindow
    globalThis.document = oldDocument
  }
})

test('物理材质数据使用线性色彩、重复纹理和 mipmaps', () => {
  for (const kind of ['roof', 'wall']) {
    const texture = createSurfaceDetail(kind, 4)
    assert.equal(texture.colorSpace, '')
    assert.equal(texture.generateMipmaps, true)
    const roughness = texture.image.data.filter((_, i) => i % 4 === 1)
    assert.ok(Math.min(...roughness) >= 180)
    assert.ok(Math.max(...roughness) <= 255)
    texture.dispose()
  }
})

const coordinate = ([x, z]) => [x / 111319.49079327358, -z / 111319.49079327358]
const roadSurfaceArea = (geometry) => {
  const p = geometry.attributes.position
  let area = 0
  for (let i = 0; i < p.count; i += 3)
    area += Math.abs((p.getX(i + 1) - p.getX(i)) * (p.getZ(i + 2) - p.getZ(i))
      - (p.getZ(i + 1) - p.getZ(i)) * (p.getX(i + 2) - p.getX(i))) / 2
  return area
}

test('铺装沿弧长维持米制比例，转角连续且路口与收边没有重叠面积', () => {
  const straight = createStreetPavingGeometry([
    { name: '试验巷', kind: 'footway', points: [[0, 0], [12, 16]].map(coordinate) },
  ], [0, 0])
  assert.ok(Math.abs(roadSurfaceArea(straight) - 40) < .001)
  const uv = straight.attributes.uv
  assert.ok(Math.abs(Math.max(...Array.from({ length: uv.count }, (_, i) => uv.getX(i))) - 20 / PAVING_REPEAT_METERS) < 1e-5)
  const bend = createStreetPavingGeometry([
    { name: '转角巷', kind: 'footway', points: [[0, 0], [10, 0], [10, 0], [10, 10]].map(coordinate) },
  ], [0, 0])
  assert.ok(Math.abs(roadSurfaceArea(bend) - 40) < .001)
  const crossing = createStreetPavingGeometry([
    { name: '支巷', kind: 'pedestrian', points: [[0, -20], [0, 20]].map(coordinate) },
    { name: '南后街', kind: 'pedestrian', points: [[-20, 0], [20, 0]].map(coordinate) },
  ], [0, 0])
  assert.ok(Math.abs(roadSurfaceArea(crossing) - (40 * 11.4 + 40 * 4.2 - 11.4 * 4.2)) < .002)
  for (const geometry of [straight, bend, crossing]) {
    for (const attribute of Object.values(geometry.attributes)) assert.ok(attribute.array.every(Number.isFinite))
    const n = geometry.attributes.normal
    for (let i = 0; i < n.count; i++) assert.ok(n.getY(i) > .99)
    geometry.dispose()
  }
})

test('石板颜色和表面高度分离，接缝比石面低且更粗糙', () => {
  const textures = createPavingTextures(4)
  assert.notEqual(textures.paving.colorSpace, textures.pavingDetail.colorSpace)
  assert.equal(textures.pavingDetail.colorSpace, '')
  const data = textures.pavingDetail.image.data
  const seam = (32 * 512) * 4, face = (32 * 512 + 32) * 4
  assert.ok(data[face] > data[seam] + 80)
  assert.ok(data[seam + 1] > data[face + 1])
  assert.equal(textures.paving.generateMipmaps, true)
  Object.values(textures).forEach(texture => texture.dispose())
})

test('屋面收边保留天井，出檐厚度有限且两坡铺瓦使用实际坡长', () => {
  const ring = [[0, 0], [20, 0], [20, 12], [0, 12], [0, 0]]
  const hole = [[7, 4], [7, 8], [13, 8], [13, 4], [7, 4]]
  const parts = createBuildingGeometries({ ring: ring.map(coordinate), holes: [hole.map(coordinate)],
    core: true, height: 6 }, [0, 0])
  parts.roof.computeBoundingBox()
  const { min, max } = parts.roof.boundingBox
  assert.ok(min.x < 0 && min.x >= -.33 && max.x > 20 && max.x <= 20.33)
  for (const attribute of Object.values(parts.roof.attributes)) assert.ok(attribute.array.every(Number.isFinite))
  const p = parts.roof.attributes.position
  // 院心仍为空；屋面及窄檐边三角形不能横跨天井中心。
  for (let i = 0; i < p.count; i += 3) {
    const sign = (a, b) => (p.getX(b) - p.getX(a)) * (6 - p.getZ(a)) - (p.getZ(b) - p.getZ(a)) * (10 - p.getX(a))
    const signs = [sign(i, i + 1), sign(i + 1, i + 2), sign(i + 2, i)]
    assert.ok(!(signs.every(v => v > 1e-5) || signs.every(v => v < -1e-5)))
  }
  Object.values(parts).forEach(part => part.dispose())
})

test('分辨率预算拒绝 CPU 瓶颈与偶发掉帧，缓慢降低并恢复且守住画质下限', () => {
  const budget = { adaptive: true, scale: 1, lastChange: 0, slow: 0, fast: 0 }
  chooseRenderScale(budget, 30, 4, 6000)
  assert.equal(budget.scale, 1)
  chooseRenderScale(budget, 16, 4, 8000)
  assert.equal(budget.slow, 0)
  for (let time = 10000; time <= 24000; time += 2000) chooseRenderScale(budget, 33, 25, time)
  assert.equal(budget.scale, 1)
  for (let time = 26000; time <= 60000; time += 2000) chooseRenderScale(budget, 40 * budget.scale ** 2, 3, time)
  assert.equal(budget.scale, .7)
  for (let time = 62000; time <= 140000; time += 2000) chooseRenderScale(budget, 16.67, 3, time)
  assert.equal(budget.scale, 1)
  budget.adaptive = false
  for (let time = 150000; time <= 180000; time += 2000) chooseRenderScale(budget, 30, 2, time)
  assert.equal(budget.scale, 1)
})

test('降分辨率没有收益时恢复画质并退避，避免刷新率上限导致反复降级', () => {
  const budget = { adaptive: true, scale: 1, lastChange: 0, slow: 0, fast: 0 }
  chooseRenderScale(budget, 33.33, 2, 6000)
  chooseRenderScale(budget, 33.33, 2, 8000)
  assert.equal(budget.scale, .9)
  chooseRenderScale(budget, 33.33, 2, 14000)
  assert.equal(budget.scale, 1)
  chooseRenderScale(budget, 33.33, 2, 20000)
  chooseRenderScale(budget, 33.33, 2, 26000)
  assert.equal(budget.scale, 1)
})

test('树木分级保留实例和颜色，减少远景叶片且风动不重复上传矩阵', () => {
  const full = createGardenTreeGeometries(), low = createGardenTreeGeometries(36)
  const material = new MeshStandardMaterial()
  const near = new InstancedMesh(full.leaves, material, 3)
  const trees = [[0, 0, 3], [1000, 0, 4], [0, 1000, 3]]
  const matrix = new Matrix4()
  trees.forEach(([x, z, r], i) => {
    matrix.makeScale(r, r, r).setPosition(x, 0, z)
    near.setMatrixAt(i, matrix)
    near.setColorAt(i, new Color().setRGB(i / 3, .5, .25))
  })
  const world = { scene: new Scene(), camera: new PerspectiveCamera(54, 1.6, 1, 12000),
    stage: { clientHeight: 900 }, state: { weather: 'sunny' }, renderer: { shadowMap: {} } }
  prepareVegetation(world, near, low.leaves, trees)
  world.camera.position.set(0, 8, 10)
  updateVegetation(world, 200)
  assert.equal(near.count, 1)
  assert.equal(world.vegetation.far.count, 2)
  world.camera.position.set(0, 2000, 2000)
  updateVegetation(world, 400)
  assert.equal(near.count, 0)
  assert.equal(world.vegetation.far.count, 3)
  const far = world.vegetation.far
  assert.deepEqual(far.instanceMatrix.array, world.vegetation.matrices)
  assert.deepEqual(far.instanceColor.array, world.vegetation.colors)
  const version = far.instanceMatrix.version
  updateVegetation(world, 800)
  assert.equal(far.instanceMatrix.version, version)
  assert.ok(world.vegetation.wind.time.value > 0)
  assert.ok(low.leaves.index.count / full.leaves.index.count < .34)
  assert.equal(wantsDetailedTree(25, true), true)
  assert.equal(wantsDetailedTree(25, false), false)
  const vertex = ShaderLib.standard.vertexShader
  const a = { uniforms: {}, vertexShader: vertex }, b = { uniforms: {}, vertexShader: vertex }
  material.onBeforeCompile(a)
  near.customDepthMaterial.onBeforeCompile(b)
  assert.equal(a.vertexShader, b.vertexShader)
  assert.equal(a.uniforms.windTime, b.uniforms.windTime)
  near.dispose(); far.dispose(); material.dispose(); near.customDepthMaterial.dispose()
  for (const g of [full.wood, full.leaves, low.wood, low.leaves]) g.dispose()
})

test('阴影范围覆盖可见接收物，像素对齐且静止镜头不重画', () => {
  const a = snapShadowBounds(-54, 71, 2048), b = snapShadowBounds(-54 + .001, 71 + .001, 2048)
  assert.deepEqual(a, b)
  assert.ok(a.min < -54 && a.max > 71)
  const world = { projectedBuildings: [{ ring: [[-20, -20], [20, -20], [20, 20], [-20, 20]], height: 12 }],
    sun: new DirectionalLight(), camera: new PerspectiveCamera(54, 1, 1, 12000), mapCenter: new Vector3(),
    controls: { target: new Vector3() }, renderer: { shadowMap: { needsUpdate: false } } }
  world.sun.shadow.mapSize.set(2048, 2048)
  world.sun.position.set(-450, 850, 480)
  world.camera.position.set(0, 50, 60)
  world.camera.lookAt(0, 0, 0)
  world.camera.updateMatrixWorld()
  setSunShadowDirection(world)
  updateSunShadow(world, 200)
  assert.ok(world.renderer.shadowMap.needsUpdate)
  const camera = world.sun.shadow.camera
  for (const x of [-20, 20]) for (const y of [0, 12]) for (const z of [-20, 20]) {
    const p = new Vector3(x, y, z).applyMatrix4(world.shadowFit.rotation)
    assert.ok(p.x > camera.left && p.x < camera.right && p.y > camera.bottom && p.y < camera.top)
  }
  assert.ok(camera.right - camera.left < 500)
  world.renderer.shadowMap.needsUpdate = false
  updateSunShadow(world, 600)
  assert.equal(world.renderer.shadowMap.needsUpdate, false)
})

test('材质世界坐标在入场和实例变换之后计算', () => {
  const material = new MeshStandardMaterial()
  configureSurfaceLighting({ heritageBounce: { value: new Color() } }, material)
  const shader = { uniforms: {}, vertexShader: ShaderLib.standard.vertexShader, fragmentShader: ShaderLib.standard.fragmentShader }
  material.onBeforeCompile(shader)
  assert.ok(shader.vertexShader.indexOf('vHeritageHeight=') > shader.vertexShader.indexOf('#include <project_vertex>'))
  assert.ok(shader.vertexShader.includes('instanceMatrix*heritagePosition'))
  material.dispose()
})
