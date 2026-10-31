import {
  ACESFilmicToneMapping,
  Color,
  DirectionalLight,
  DoubleSide,
  Fog,
  HemisphereLight,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshStandardMaterial,
  PCFShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  SRGBColorSpace,
  WebGLRenderer,
} from '../vendor/three/build/three.module.min.js'
import { OrbitControls } from '../vendor/three/examples/jsm/controls/OrbitControls.js'
import { mergeGeometries } from '../vendor/three/examples/jsm/utils/BufferGeometryUtils.js'
import {
  paintGround,
  paintHeritageTextures,
  buildArchitecturalDetails,
  buildHeritagePaving,
} from './architecture.js'
import { createBuildingGeometries } from './geometry.js'
import { buildMiniMap, buildLabels } from './overlays.js'
import { buildInkMountains } from './mountains.js'
import { buildVegetation, buildLanterns, buildFixedStreetLighting } from './street-life.js'
import { buildPedestrians, updatePedestrians } from './pedestrians.js'
import { buildRiverWater } from './river.js'
import { buildWeather, applyEnvironment, updateWeather } from './weather.js'
import { cancelFlight, returnOverview } from './navigation.js'
import { resize, render } from './lifecycle.js'
import { buildHeartTree } from './heart-tree.js'
import { buildMemorialGrounds } from './memorial.js'
import { prepareEntrance, stampBuildingEntrance } from './entrance.js'
import { buildSceneEffects } from './scene-effects.js'
import { buildHeritageDetails } from './heritage-details.js'
import { createSurfaceDetail, configureSurfaceLighting } from './surface-detail.js'
import { createRenderBudget } from './render-budget.js'

// 创建场景、灯光、建筑合批与控制器；所有子系统只在这里初始化一次。
export async function buildScene(world) {
  world.scene = new Scene()
  world.scene.background = new Color('#e7e3db')
  world.scene.fog = new Fog('#e7e3db', 2200, 5000)
  world.camera = new PerspectiveCamera(54, 1, 1, 12000)
  world.renderer = new WebGLRenderer({
    canvas: world.canvas,
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
  })
  world.renderer.outputColorSpace = SRGBColorSpace
  world.renderer.toneMapping = ACESFilmicToneMapping
  world.renderer.toneMappingExposure = 1.02
  world.renderer.shadowMap.enabled = true
  world.renderer.shadowMap.type = PCFShadowMap
  world.renderer.shadowMap.autoUpdate = false
  createRenderBudget(world)
  world.hemisphere = new HemisphereLight('#f2f3f5', world.palette?.ground ?? '#b3aca0', 1.85)
  world.scene.add(world.hemisphere)
  world.sun = new DirectionalLight('#fff8ed', 2.1)
  world.sun.position.set(-450, 850, 480)
  world.sun.castShadow = true
  world.sun.shadow.mapSize.set(2048, 2048)
  world.sun.shadow.camera.left = -760
  world.sun.shadow.camera.right = 760
  world.sun.shadow.camera.top = 760
  world.sun.shadow.camera.bottom = -760
  world.sun.shadow.camera.far = 2200
  world.sun.shadow.normalBias = 0.5
  world.sun.shadow.bias = -0.00012
  world.scene.add(world.sun, world.sun.target)
  const backdropMaterial = new MeshStandardMaterial({
    color: world.palette?.ground ?? '#d8d6cf',
    roughness: 1,
  })
  const backdrop = new Mesh(new PlaneGeometry(12000, 12000), backdropMaterial)
  backdrop.rotation.x = -Math.PI / 2
  backdrop.position.copy(world.mapCenter)
  // 周边地面与街区仅差 0.4 米，以深度偏移隔离，不再保留厚底座和悬空投影。
  backdrop.position.y = -0.45
  backdrop.receiveShadow = true
  world.scene.add(backdrop)
  world.weatherSurfaces.push({
    material: backdropMaterial,
    color: backdropMaterial.color.clone(),
    roughness: 1,
  })
  const ground = new Mesh(
    new PlaneGeometry(world.width, world.depth),
    new MeshStandardMaterial({
      map: paintGround(world),
      roughness: 1,
      transparent: true,
      depthWrite: false,
      // 远景斜视时补充深度偏移，地面仍正常参与遮挡与接收阴影。
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    }),
  )
  ground.rotation.x = -Math.PI / 2
  ground.position.copy(world.mapCenter)
  ground.position.y = -0.05
  ground.receiveShadow = true
  world.scene.add(ground)
  world.weatherSurfaces.push({
    material: ground.material,
    color: ground.material.color.clone(),
    roughness: ground.material.roughness,
  })
  const structureStart = world.scene.children.length
  const entranceCenters = []
  const customMaterials = world.createBuildingMaterials?.(world)
  const families = customMaterials
    ? Object.keys(customMaterials)
    : Array.from({ length: 6 }, (_, i) => i)
  const groups = families.map((family) => ({
    family,
    walls: [],
    roofs: [],
    edges: [],
    buildingIndices: [],
  }))
  for (const [buildingIndex, b] of world.data.buildings.entries()) {
    const geometry = createBuildingGeometries(b, world.origin)
    const center = stampBuildingEntrance(geometry.walls, world)
    entranceCenters.push(center)
    stampBuildingEntrance(geometry.roof, world, { roof: true, center })
    stampBuildingEntrance(geometry.edges, world, { roof: true, center })
    const group = customMaterials
      ? groups.find((item) => item.family === b.materialFamily)
      : groups[b.core ? Math.abs(b.id) % 5 : 5]
    group.buildingIndices.push(buildingIndex)
    group.walls.push(geometry.walls)
    group.roofs.push(geometry.roof)
    group.edges.push(geometry.edges)
  }
  // 村级各栋建筑的外墙/屋面颜色保存在顶点中，合批后仍保留个体风貌。
  const rural = world.buildingStyle === 'rural'
  const textures = rural ? { wall: null, roof: null, wood: null } : paintHeritageTextures(world)
  const detailMaps = rural ? null : Object.fromEntries(['wall', 'roof'].map((kind) =>
    [kind, createSurfaceDetail(kind, Math.min(8, world.renderer.capabilities.getMaxAnisotropy()))],
  ))
  world.heritageBounce = { value: new Color() }
  const wallColors = ['#f6f4ed', '#eae8e1', '#f1f0ea', '#e6e3db', '#f4f0e5', '#d3d2cd']
  const roofColors = ['#d5d7d7', '#e2dfd9', '#cccece', '#c8cbce', '#d9d7d2', '#e6e5df']
  groups.forEach((group, index) => {
    if (!group.walls.length) return
    for (const [kind, color] of [
      ['walls', world.palette?.wall ?? wallColors[index]],
      ['roofs', world.palette?.roof ?? roofColors[index]],
    ]) {
      const material =
        customMaterials?.[group.family]?.[kind] ??
        new MeshStandardMaterial({
          color: rural ? '#ffffff' : color,
          vertexColors: rural,
          roughness: rural ? 0.82 : kind === 'roofs' ? 0.94 : 1,
          side: DoubleSide,
          map: kind === 'roofs' ? textures.roof : textures.wall,
          bumpMap: detailMaps?.[kind === 'roofs' ? 'roof' : 'wall'] ?? null,
          roughnessMap: detailMaps?.[kind === 'roofs' ? 'roof' : 'wall'] ?? null,
          bumpScale: kind === 'roofs' ? 0.10 : 0.018,
        })
      if (kind === 'roofs')
        world.weatherSurfaces.push({
          material,
          color: material.color.clone(),
          roughness: material.roughness,
        })
      const geometry = mergeGeometries(group[kind])
      // 保存合并前各建筑的三角面区间，精确识别直接点击的房屋。
      let end = 0
      const buildingFaces = group[kind].map((part, i) => {
        end += (part.index?.count ?? part.attributes.position.count) / 3
        return { end, index: group.buildingIndices[i] }
      })
      group[kind].forEach((g) => g.dispose())
      const mesh = new Mesh(geometry, material)
      mesh.userData.buildingFaces = buildingFaces
      mesh.userData.weatherRoof = kind === 'roofs'
      mesh.castShadow = true
      mesh.receiveShadow = true
      world.scene.add(mesh)
      world.streetLitStaticMeshes.push(mesh)
      world.pickMeshes.push(mesh)
    }
    const edgeGeometry = mergeGeometries(group.edges)
    group.edges.forEach((g) => g.dispose())
    const edges = new LineSegments(
      edgeGeometry,
      new LineBasicMaterial({
        color: world.palette?.edge ?? (index === 5 ? '#989994' : '#73736d'),
        transparent: true,
        opacity: 0.37,
      }),
    )
    world.scene.add(edges)
  })
  buildArchitecturalDetails(world, textures.wood, entranceCenters, textures.lattice)
  if (!rural) buildHeritageDetails(world, entranceCenters)
  world.buildDetails?.(world, entranceCenters)
  if (world.memorial) buildMemorialGrounds(world, textures)
  const entranceStructures = world.scene.children.slice(structureStart)
  if (!rural) buildHeritagePaving(world, textures)
  buildMiniMap(world)
  buildInkMountains(world)
  const vegetationStart = world.scene.children.length
  buildVegetation(world)
  if (world.placesById.has('heart-tree')) buildHeartTree(world)
  buildLanterns(world)
  entranceStructures.push(...world.scene.children.slice(vegetationStart))
  buildPedestrians(world)
  buildFixedStreetLighting(world)
  if (!rural) {
    const materials = new Set(world.streetLitStaticMeshes.map((mesh) => mesh.material))
    for (const material of materials) if (material.isMeshStandardMaterial) configureSurfaceLighting(world, material)
  }
  buildRiverWater(world)
  buildWeather(world)
  buildSceneEffects(world)
  world.controls = new OrbitControls(world.camera, world.canvas)
  world.controls.enableDamping = true
  world.controls.dampingFactor = 0.09
  world.controls.minDistance = 8
  world.controls.maxDistance = 3600
  world.controls.minPolarAngle = 0.035
  world.controls.maxPolarAngle = Math.PI * 0.415
  world.controls.screenSpacePanning = false
  world.controls.maxTargetRadius = 760
  world.controls.cursor.copy(world.mapCenter)
  world.controls.zoomSpeed = 0.8
  world.controls.rotateSpeed = 0.65
  world.controls.panSpeed = 0.8
  world.controls.listenToKeyEvents(world.canvas)
  world.controls.addEventListener('start', () => {
    cancelFlight(world)
    world.state.overview = false
  })
  buildLabels(world)
  world.resizeObserver = new ResizeObserver((...args) => resize(world, ...args))
  world.resizeObserver.observe(world.stage)
  world.state.ready = true
  applyEnvironment(world, world.state.timeOfDay, world.state.weather, false)
  resize(world)
  returnOverview(world, true)
  // 游客的远景缩放依赖控制器目标，必须在相机控制器与全景状态就绪后更新。
  updatePedestrians(world, 0)
  updateWeather(world, 0)
  // 在加载遮罩内预热完整场景及落位变体，避免首次编译打断搭建或卡住侧栏入场。
  world.renderer.shadowMap.needsUpdate = true
  for (const effect of world.effects.root.children) effect.visible = true
  // 利用 KHR_parallel_shader_compile 让加载界面保持响应；完成和入场两套变体均预热。
  await world.renderer.compileAsync(world.scene, world.camera)
  if (world.disposed) return
  world.renderer.render(world.scene, world.camera)
  for (const effect of world.effects.root.children) effect.visible = false
  prepareEntrance(world, ground, entranceStructures)
  await world.renderer.compileAsync(world.scene, world.camera)
  if (world.disposed) return
  world.renderer.render(world.scene, world.camera)
  // 首个帧回调的时间戳可能早于同步初始化，不能将预热耗时算进搭建。
  world.entrance.start = performance.now()
  world.renderer.setAnimationLoop((...args) => render(world, ...args))
  world.state.loading = false
}
