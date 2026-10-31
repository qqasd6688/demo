import { Color, Matrix4, Object3D, Plane, Raycaster, Vector2, Vector3 } from '../vendor/three/build/three.module.min.js'
import { getRiverSurfacePaths } from './river-geometry.js'
import { getWorldPoint, isPointInRing } from './geometry.js'
import { buildScene } from './scene.js'
import { notify, showError, dispose, render } from './lifecycle.js'
import {
  cancelFlight,
  selectPlace,
  navigateLane,
  highlightLane,
  highlightBuilding,
  returnOverview,
  zoom,
  startFlight,
  selectBuilding,
  pickDestination,
  toggleTour,
  toggleDriving,
} from './navigation.js'
import { applyEnvironment } from './weather.js'
import { beginDrivingLook, clearDrivingInput, endDrivingLook, moveDrivingLook } from './driving.js'

// 页面持有此实例；world 是第三方对象、时钟和资源的唯一归口，不进入深层响应式代理。
export function createMapRuntime({
  model,
  state,
  stage,
  canvas,
  labelLayer,
  miniCanvas,
  miniPanel,
  environmentControls,
}) {
  const world = {
    ...model,
    state,
    stage,
    canvas,
    labelLayer,
    miniCanvas,
    miniPanel,
    environmentControls,
    disposed: false,
    entrance: null,
    effects: null,
    origin: model.data.meta.origin,

    riverWater: null,
    riverMaterial: null,
    waterReflectionAt: -Infinity,
    waterClock: 0,
    waterLastFrame: 0,
    allPlaces: [...model.places, ...model.contextPlaces],
    heartTree: null,
    tourRoute: null,
    drivingNetwork: null,
    driver: null,
    driveCar: null,
    abort: new AbortController(),
    weatherRain: null,
    weatherSnow: null,
    weatherSplash: null,
    lightningRoot: null,
    lightningLight: null,
    lightningNextAt: Infinity,
    lightningStartedAt: -Infinity,
    weatherAmbient: 0,
    weatherClock: 0,
    weatherLastFrame: 0,
    weatherTime: { value: 0 },
    weatherWetness: { value: 0 },
    weatherSnowCover: { value: 0 },
    weatherSkyColor: { value: new Color() },
    lightningTint: new Color('#a4b6d2'),
    weatherSurfaces: [],
    labels: [],
    pickMeshes: [],
    groundPlane: new Plane(new Vector3(0, 1, 0), 0),
    raycaster: new Raycaster(),
    pointer: new Vector2(),
    scratch: new Vector3(),
    buildingHighlight: null,
    laneHighlight: null,
    activeLaneSegments: [],
    miniFrame: 0,
    inkMountainLayers: [],
    inkMountainVisibility: 0,
    streetLampPositions: [],
    streetLitStaticMeshes: [],
    streetLampPower: { value: 0 },
    crowdActors: [],
    crowdDensity: null,
    crowdBatches: {},
    crowdClock: 0,
    crowdLastFrame: 0,
    crowdPoseFrame: 0,
    crowdRoot: new Object3D(),
    crowdPart: new Object3D(),
    crowdMatrix: new Matrix4(),
    crowdHidden: new Matrix4().makeScale(0, 0, 0),
    pointerStart: null,
    activePointers: new Set(),
  }
  world.riverPaths = getRiverSurfacePaths(world.data.water, world.origin)
  world.listenerOptions = { signal: world.abort.signal }
  world.minPoint = getWorldPoint(
    [world.data.meta.bounds[0], world.data.meta.bounds[3]],
    world.origin,
  )
  world.maxPoint = getWorldPoint(
    [world.data.meta.bounds[2], world.data.meta.bounds[1]],
    world.origin,
  )
  world.width = world.maxPoint[0] - world.minPoint[0]
  world.depth = world.maxPoint[1] - world.minPoint[1]
  world.mapCenter = new Vector3(
    (world.minPoint[0] + world.maxPoint[0]) / 2,
    0,
    (world.minPoint[1] + world.maxPoint[1]) / 2,
  )
  world.projectedBuildings = world.data.buildings.map((building) => ({
    height: building.height + 4.5,
    ring: building.ring.map((point) => getWorldPoint(point, world.origin)),
    holes: building.holes.map((ring) => ring.map((point) => getWorldPoint(point, world.origin))),
  }))
  world.miniTransform = { scale: Math.min(344 / world.width, 244 / world.depth), x: 190, y: 140 }
  const options = world.listenerOptions

  labelLayer.addEventListener(
    'click',
    (event) => {
      const id = event.target.closest('button[data-id]')?.dataset.id
      const place = model.placesById.get(id)
      if (place) selectPlace(world, place)
    },
    options,
  )
  canvas.addEventListener(
    'pointerdown',
    (event) => {
      if (state.driving) { beginDrivingLook(world, event); return }
      world.activePointers.add(event.pointerId)
      world.pointerStart =
        world.activePointers.size === 1 && event.button === 0
          ? { id: event.pointerId, x: event.clientX, y: event.clientY, dragged: false }
          : null
      canvas.focus({ preventScroll: true })
    },
    options,
  )
  canvas.addEventListener(
    'pointermove',
    (event) => {
      if (state.driving) { moveDrivingLook(world, event); return }
      if (
        world.pointerStart &&
        Math.hypot(event.clientX - world.pointerStart.x, event.clientY - world.pointerStart.y) > 6
      )
        world.pointerStart.dragged = true
    },
    options,
  )
  canvas.addEventListener(
    'pointerup',
    (event) => {
      if (state.driving) { endDrivingLook(world, event); return }
      const tap =
        world.pointerStart?.id === event.pointerId &&
        !world.pointerStart.dragged &&
        world.activePointers.size === 1
      world.activePointers.delete(event.pointerId)
      world.pointerStart = null
      if (tap && !state.driving) pickDestination(world, event)
    },
    options,
  )
  canvas.addEventListener(
    'pointercancel',
    (event) => {
      endDrivingLook(world, event)
      world.activePointers.delete(event.pointerId)
      world.pointerStart = null
    },
    options,
  )
  canvas.addEventListener('lostpointercapture', event => endDrivingLook(world, event), options)
  canvas.addEventListener(
    'webglcontextlost',
    (event) => {
      event.preventDefault()
      showError(world, new Error('WebGL context lost'))
    },
    options,
  )
  document.addEventListener(
    'keydown',
    (event) => {
      if (state.aboutOpen || !stage.closest('.sanfang-page')) return
      if (event.key === 'Escape') {
        event.preventDefault()
        if (state.driving) {
          toggleDriving(world)
          return
        }
        cancelFlight(world)
        notify(world, '已停止飞行')
        return
      }
      if (
        event.target.closest('input,textarea,[contenteditable]') ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey
      )
        return
      if (state.driving && ['KeyW', 'KeyS', 'KeyA', 'KeyD'].includes(event.code)) {
        event.preventDefault()
        world.driver.keys.add(event.code)
        return
      }
      if (event.target.closest('button,a')) return
      if (event.key === 'Home') {
        event.preventDefault()
        returnOverview(world)
      } else if (['+', '=', '-'].includes(event.key)) {
        event.preventDefault()
        zoom(world, event.key === '-' ? 1.25 : 0.8)
      } else if (event.target === canvas && event.key.startsWith('Arrow')) {
        cancelFlight(world)
        state.overview = false
      }
    },
    options,
  )
  document.addEventListener(
    'keyup',
    (event) => {
      world.driver?.keys.delete(event.code)
    },
    options,
  )
  document.addEventListener(
    'focusin',
    (event) => {
      if (state.driving && event.target !== canvas) clearDrivingInput(world)
    },
    options,
  )
  window.addEventListener('blur', () => clearDrivingInput(world), options)
  document.addEventListener(
    'visibilitychange',
    () => {
      if (!world.renderer || state.lost || world.disposed) return
      if (document.hidden) {
        clearDrivingInput(world)
        state.hiddenAt = performance.now()
        world.renderer.setAnimationLoop(null)
      } else {
        const elapsed = state.hiddenAt ? performance.now() - state.hiddenAt : 0
        if (state.flight) state.flight.start += elapsed
        if (world.entrance?.start != null) world.entrance.start += elapsed
        if (world.effects) world.effects.lastFrame = 0
        if (world.vegetation) world.vegetation.last = 0
        if (world.renderBudget) {
          world.renderBudget.last = 0
          world.renderBudget.slow = world.renderBudget.fast = 0
          world.renderBudget.trial = null
          world.renderBudget.lastChange = performance.now()
          world.renderBudget.samples.length = world.renderBudget.cpu.length = 0
          world.renderBudget.calls.length = world.renderBudget.triangles.length = 0
          world.renderBudget.reportAt = performance.now()
        }
        state.hiddenAt = 0
        world.crowdLastFrame =
          world.crowdPoseFrame =
          world.waterLastFrame =
          world.weatherLastFrame =
            0
        world.waterReflectionAt = -Infinity
        world.renderer.setAnimationLoop((time) => render(world, time))
      }
    },
    options,
  )
  window.addEventListener(
    'pagehide',
    (event) => {
      if (!event.persisted) dispose(world)
    },
    options,
  )

  // 延迟初始化让加载态先提交；卸载会同时取消帧、定时器和全部事件，避免快速切路由后重建。
  world.initialFrame = requestAnimationFrame(() => {
    world.initialTimer = setTimeout(() => {
      if (world.disposed) return
      buildScene(world).catch((error) => {
        if (!world.disposed) showError(world, error)
      })
    }, 0)
  })

  return {
    navigate(place) {
      if (place.category === '坊巷') navigateLane(world, place)
      else selectPlace(world, place, { fly: true })
    },
    closeDetail() {
      cancelFlight(world)
      state.selected = state.laneDestination = null
      if (world.scene) {
        highlightLane(world, null)
        highlightBuilding(world, [])
      }
    },
    flyToSelection() {
      if (state.selected) selectPlace(world, state.selected, { fly: true })
      else if (state.laneDestination) navigateLane(world, state.laneDestination)
    },
    home() {
      returnOverview(world)
    },
    toggleLabels() {
      state.labels = !state.labels
      notify(world, state.labels ? '景点标签已显示' : '景点标签已隐藏')
    },
    toggleCrowd() {
      state.crowdPlaying = !state.crowdPlaying
    },
    toggleTour() {
      toggleTour(world)
    },
    toggleDriving() {
      toggleDriving(world)
    },
    setEnvironment(timeOfDay, weather) {
      applyEnvironment(world, timeOfDay, weather)
    },
    north() {
      if (!state.ready || state.lost) return
      state.overview = false
      const offset = world.camera.position.clone().sub(world.controls.target)
      offset.set(0, offset.y, Math.hypot(offset.x, offset.z))
      startFlight(world, world.controls.target.clone().add(offset), world.controls.target.clone(), {
        duration: 900,
        arc: 0,
      })
    },
    pickMiniMap(event) {
      if (!state.ready || state.lost) return
      const rect = miniCanvas.getBoundingClientRect()
      const { scale, x, y } = world.miniTransform
      const point = [
        world.mapCenter.x + (((event.clientX - rect.left) / rect.width) * 380 - x) / scale,
        world.mapCenter.z + (((event.clientY - rect.top) / rect.height) * 280 - y) / scale,
      ]
      const landmark = world.landmarks.find((place) => {
        const position = getWorldPoint(place.position, world.origin)
        return Math.hypot(position[0] - point[0], position[1] - point[1]) < 6 / scale
      })
      if (landmark) {
        selectPlace(world, landmark)
        return
      }
      const index = world.projectedBuildings.findIndex(
        (building) =>
          isPointInRing(point, building.ring) &&
          !building.holes.some((hole) => isPointInRing(point, hole)),
      )
      if (index >= 0) selectBuilding(world, index)
    },
    pauseNavigation() {
      cancelFlight(world)
    },
    notify(message) {
      notify(world, message)
    },
    dispose() {
      dispose(world)
    },
  }
}
