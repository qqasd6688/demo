import { DoubleSide, Group, Mesh, MeshBasicMaterial, PerspectiveCamera, Vector3 } from '../vendor/three/build/three.module.min.js'
import { notify } from './lifecycle.js'
import { createTourRoute, getTourPose } from './tour-route.js'
import { beginDriving, stopDriving } from './driving.js'
import { finishEntrance } from './entrance.js'
import { triggerHeartTree } from './scene-effects.js'
import {
  createBuildingGeometries,
  getLaneRoadSegments,
  createLaneHighlightGeometry,
  getWorldPoint,
  getFlightFrame,
} from './geometry.js'

const TOUR_SPEED = 12

// 唯一相机导航与选中入口；地图拾取只选择，列表、街巷和导览才触发飞行。
export function cancelFlight(world) {
  finishEntrance(world)
  stopDriving(world)
  if (world.state.flight) {
    world.state.statusText = ''
    world.state.statusUntil = 0
  }
  world.state.flight = null
  if (world.controls) world.controls.enableDamping = true
  world.state.tour = false
}

export function startFlight(
  world,
  position,
  target,
  { duration = 1700, arc = 55, preserveTour = false, kind = 'navigation' } = {},
) {
  if (!world.state.ready || world.state.lost) {
    notify(world, '三维地图尚未就绪')
    return
  }
  stopDriving(world)
  if (!preserveTour) world.state.tour = false
  finishEntrance(world)
  // 在快照前清掉 OrbitControls 残余阻尼，防止用户拖拽后飞行继续叠加旧惯性。
  world.controls.enableDamping = false
  world.controls.update()
  world.state.flight = {
    kind,
    fromPosition: world.camera.position.toArray(),
    fromTarget: world.controls.target.toArray(),
    toPosition: position.toArray(),
    toTarget: target.toArray(),
    arc: arc,
    duration: duration,
    start: performance.now(),
  }
}

// 显式定位与整条导览路线共用一次相机提交，暂停页面只需修正 flight.start。
export function updateFlight(world, time) {
  const flight = world.state.flight
  if (!flight) return
  const elapsed = Math.max(0, time - flight.start)
  const t = flight.duration === 0 ? 1 : Math.min(1, elapsed / flight.duration)
  let pose
  if (flight.kind === 'tour' && elapsed >= flight.approachDuration) {
    pose = getTourPose(flight.route, ((elapsed - flight.approachDuration) / 1000) * TOUR_SPEED)
    if (pose.stopIndex !== world.state.tourIndex) {
      selectPlace(world, world.placesById.get(world.tourIds[pose.stopIndex]), { fromTour: true })
      world.state.tourIndex = pose.stopIndex
    }
    world.state.statusText = `坊巷导览 · ${pose.stopIndex + 1}/${world.tourIds.length} · ${world.state.selected.name}`
    world.state.statusUntil = 0
  } else {
    pose = getFlightFrame(flight, flight.kind === 'tour' ? elapsed / flight.approachDuration : t)
  }
  world.camera.position.fromArray(pose.position)
  world.controls.target.fromArray(pose.target)
  if (t >= 1) {
    world.state.flight = null
    world.controls.enableDamping = true
    if (flight.kind === 'tour') {
      // 完成后复用全景导航，仍由唯一 flight 驱动；手动停止不会触发返航。
      returnOverview(world)
      notify(world, '导览已完成 · 正在返回默认全景', 4000)
    }
  }
}

export function getOverviewPose(world) {
  // 嵌入大屏时按中央可见窗口取景，避免主要建筑落到两侧业务面板下。
  const frame = world.overviewFrame ?? { x: 0.9, bottom: -0.78, top: 0.8 }
  const points = world.projectedBuildings
    .flatMap((building, index) =>
      world.data.buildings[index].core
        ? building.ring.flatMap(([x, z]) => [
            [x, 0, z],
            [x, world.data.buildings[index].height + 4.5, z],
          ])
        : [],
    )
    .concat(
      world.memorial?.boundary.map((p) => {
        const [x, z] = getWorldPoint(p, world.origin)
        return [x, 0, z]
      }) ?? [],
    )
  const xs = points.map((point) => point[0])
  const zs = points.map((point) => point[2])
  const minZ = Math.min(...zs)
  const maxZ = Math.max(...zs)
  const direction = new Vector3(0.12, 0.42, 1).normalize()
  const target = new Vector3(
    (Math.min(...xs) + Math.max(...xs)) / 2,
    10,
    (minZ + maxZ) / 2 + (maxZ - minZ) * 0.32,
  )
  const probe = new PerspectiveCamera(world.camera.fov, world.camera.aspect, 1, 12000)
  const point = new Vector3()
  let distance = 150
  // 馆区边界也参与取景，确保南侧纪念馆的院落与入口完整留在默认全景中。
  // 焦点适当前移，让古厝群占据画面主体；宽视场同时保留地平线和远山。
  for (let attempt = 0; attempt < (world.overviewFrame ? 90 : 60); attempt++) {
    probe.position.copy(target).addScaledVector(direction, distance)
    probe.lookAt(target)
    probe.updateMatrixWorld()
    const visible = points.every((p) => {
      point.fromArray(p).project(probe)
      return (
        Math.abs(point.x) < frame.x && point.y > frame.bottom && point.y < frame.top && point.z < 1
      )
    })
    if (visible) break
    distance *= 1.04
  }
  return {
    position: target.clone().addScaledVector(direction, distance),
    target,
  }
}

export function returnOverview(world, instant = false) {
  if (!world.state.ready) return
  world.state.overview = true
  world.state.top = false
  world.state.selected = null
  world.state.laneDestination = null
  highlightLane(world, null)

  highlightBuilding(world, [])
  const pose = getOverviewPose(world)
  if (instant) {
    cancelFlight(world)
    world.camera.position.copy(pose.position)
    world.controls.target.copy(pose.target)
    world.controls.update()
  } else {
    startFlight(world, pose.position, pose.target, { duration: 1800, arc: 70 })
    notify(world, `已返回${world.data.meta.name ?? '三坊七巷'}全景`)
  }
}

// 驾驶与飞行互斥；Esc/驾驶按钮恢复进入前的视野，其他导航直接接管当前位置。
export function toggleDriving(world) {
  if (world.state.driving) {
    const saved = stopDriving(world)
    world.state.overview = saved.overview
    world.state.top = saved.top
    startFlight(world, saved.position, saved.target, { duration: 900, arc: 0 })
    notify(world, '已退出驾驶模式')
    return
  }
  if (!world.state.ready || world.state.lost) return
  cancelFlight(world)
  if (!beginDriving(world)) {
    notify(world, '当前没有可安全放置车辆的道路')
    return
  }
  world.state.selected = world.state.laneDestination = null
  highlightBuilding(world, [])
  highlightLane(world, null)
  notify(world, '驾驶模式 · 左键拖动转向 · W/S 前后 · A/D 平移 · Esc 退出', 4500)
}

// 选中层复用原建筑的带孔几何，不替换合批材质；切换目标立即回收上一层。
export function highlightBuilding(world, indices = []) {
  if (world.buildingHighlight) {
    world.scene.remove(world.buildingHighlight)
    const materials = new Set()
    world.buildingHighlight.traverse((object) => {
      object.geometry?.dispose()
      if (object.material) materials.add(object.material)
    })
    materials.forEach((material) => material.dispose())
    world.buildingHighlight = null
  }
  if (!Array.isArray(indices) || !indices.length) return
  const material = new MeshBasicMaterial({
    color: '#d88742',
    transparent: true,
    opacity: 0.16,
    side: DoubleSide,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -3,
  })
  world.buildingHighlight = new Group()
  for (const index of indices) {
    const geometry = createBuildingGeometries(world.data.buildings[index], world.origin)
    for (const kind of ['walls', 'roof']) {
      const surface = new Mesh(geometry[kind], material)
      surface.renderOrder = 5
      world.buildingHighlight.add(surface)
    }
    geometry.edges.dispose()
  }
  world.scene.add(world.buildingHighlight)
}

export function selectPlace(world, place, { fly = false, fromTour = false } = {}) {
  // 榕树是独立地标，不伪造建筑关联；与建筑选择共用同一详情和飞行状态。
  if (place.kind === 'landmark') {
    if (!fromTour) cancelFlight(world)
    world.state.selected = place
    world.state.laneDestination = null
    world.state.overview = false
    world.state.detailBinding = '心形榕树 · 实景参考建模 · 街口附近示意位置'
    if (!world.state.ready || world.state.lost) {
      notify(world, '地图未就绪，可先阅读爱心树介绍')
      return
    }
    highlightBuilding(world, [])
    highlightLane(world, null)
    triggerHeartTree(world)
    if (fly) {
      world.state.top = false
      const [x, z] = getWorldPoint(place.position, world.origin)
      const target = new Vector3(x, 17.5, z)
      // 沿南后街从南侧观察，心形冠幅和顶部浅凹口在此角度更接近实景。
      const position = target.clone().addScaledVector(new Vector3(0.19, 0.34, 1).normalize(), 78)
      startFlight(world, position, target, { duration: 1900, arc: 45 })
      notify(world, '飞往 · 南后街爱心树', 3600)
    } else if (!fromTour) notify(world, '已选中 · 爱心榕树')
    return
  }
  const buildingIndices =
    world.siteBuildings.get(place.id) ??
    (Number.isInteger(place.buildingIndex) ? [place.buildingIndex] : [])
  if (!buildingIndices.length) {
    notify(world, '该地点尚未可靠关联建筑，暂不支持选择')
    return
  }
  // 地图点击只选中并中断旧飞行；导航入口明确传 fly，才允许改写相机。
  if (!fromTour) cancelFlight(world)
  world.state.laneDestination = null
  if (world.state.ready) highlightLane(world, null)
  world.state.selected = place
  world.state.overview = false
  if (fly) {
    world.state.top = false
  }
  const binding = world.siteBindings.get(place.id)
  world.state.detailBinding = binding
    ? (binding.method === 'model'
        ? '参照现场导览图补建'
        : binding.method === 'id'
          ? '按同一 OSM 要素关联'
          : '按景点坐标所在范围关联') +
      ' · ' +
      buildingIndices.length +
      ' 块建筑'
    : '直接点击建筑 · 精确命中模型'
  const tourIndex = world.tourIds.indexOf(place.id)
  if (tourIndex !== -1) world.state.tourIndex = tourIndex
  if (!world.state.ready || world.state.lost) {
    notify(world, '地图未就绪，可先阅读景点介绍')
    return
  }
  highlightBuilding(world, buildingIndices)
  if (!fly) {
    if (!fromTour) notify(world, '已选中 · ' + place.name)
    return
  }
  const points = buildingIndices.flatMap((index) => world.projectedBuildings[index].ring)
  const xs = points.map((p) => p[0]),
    zs = points.map((p) => p[1])
  const target = new Vector3(
    (Math.min(...xs) + Math.max(...xs)) / 2,
    0,
    (Math.min(...zs) + Math.max(...zs)) / 2,
  )
  const distance = 235
  const position = target
    .clone()
    .add(new Vector3(0.3, 0.78, 0.68).normalize().multiplyScalar(distance))
  startFlight(world, position, target, {
    preserveTour: fromTour,
    arc: Math.min(150, world.camera.position.distanceTo(position) * 0.14),
    duration: 1900,
  })
  notify(world, `飞往 · ${place.name}`, 3600)
}

// 左侧的坊巷是导航入口；镜头定位街巷，不把道路写入建筑选中状态。
export function highlightLane(world, place) {
  if (world.laneHighlight) {
    world.scene.remove(world.laneHighlight)
    world.laneHighlight.geometry.dispose()
    world.laneHighlight.material.dispose()
    world.laneHighlight = null
  }
  world.activeLaneSegments = place ? getLaneRoadSegments(place, world.data.roads) : []
  if (!place) return
  const width =
    place.name === '南后街' ? 10 : place.name === '杨桥巷' ? 9 : place.name === '光禄坊' ? 6 : 3.8
  world.laneHighlight = new Mesh(
    createLaneHighlightGeometry(world.activeLaneSegments, world.origin, width),
    new MeshBasicMaterial({
      color: '#ce6337',
      transparent: true,
      opacity: 0.8,
      side: DoubleSide,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    }),
  )
  world.laneHighlight.renderOrder = 4
  world.scene.add(world.laneHighlight)
}

export function navigateLane(world, place) {
  if (!world.state.ready || world.state.lost) {
    notify(world, '三维地图尚未就绪')
    return
  }
  cancelFlight(world)
  world.state.selected = null
  world.state.laneDestination = place
  world.state.overview = false
  world.state.top = false

  highlightBuilding(world, [])
  highlightLane(world, place)
  let length = 0
  for (const segment of world.activeLaneSegments) {
    const path = segment.map((p) => getWorldPoint(p, world.origin))
    for (let i = 1; i < path.length; i++)
      length += Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1])
  }
  world.state.detailBinding =
    world.activeLaneSegments.length + ' 段 · 约 ' + Math.round(length) + ' 米 · 当前地图范围内'
  if (place.name === '杨桥巷' || place.name === '吉庇巷')
    world.state.detailBinding +=
      ' · 历史名称对应今' + (place.name === '杨桥巷' ? '杨桥路' : '吉庇路')
  const points = world.activeLaneSegments.flatMap((segment) =>
    segment.map((p) => getWorldPoint(p, world.origin)),
  )
  if (!points.length) {
    notify(world, '当前地图中未找到这条街巷')
    return
  }
  const xs = points.map((p) => p[0]),
    zs = points.map((p) => p[1])
  const target = new Vector3(
    (Math.min(...xs) + Math.max(...xs)) / 2,
    0,
    (Math.min(...zs) + Math.max(...zs)) / 2,
  )
  const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs))
  const distance = Math.max(
    300,
    Math.min(1800, ((span + 70) * 1.6) / Math.min(world.camera.aspect, 1)),
  )
  const position = target.clone().addScaledVector(new Vector3(0.2, 0.92, 0.5).normalize(), distance)
  startFlight(world, position, target, { duration: 1900, arc: 60 })
  notify(world, '飞往街巷 · ' + place.name, 3600)
}

// 顺序、道路弧线与停靠信息只有一份；按钮只切换状态，主循环按时间采样同一个 flight。
export function toggleTour(world) {
  if (world.state.tour) {
    cancelFlight(world)
    notify(world, '已停止导览 · 可继续自由浏览')
    return
  }
  if (!world.state.ready || world.state.lost) return
  try {
    world.tourRoute ??= createTourRoute(
      world.data.roads,
      world.tourIds.map((id) => world.placesById.get(id)),
      world.origin,
    )
  } catch (error) {
    notify(world, error.message, 5000)
    return
  }
  cancelFlight(world)
  world.state.tour = true
  world.state.tourIndex = 0
  world.state.overview = false
  world.state.top = false
  world.state.query = ''
  world.state.filter = '全部'
  const pose = getTourPose(world.tourRoute, 0)
  startFlight(world, new Vector3(...pose.position), new Vector3(...pose.target), {
    kind: 'tour',
    duration: 5500,
    arc: 30,
    preserveTour: true,
  })
  const flight = world.state.flight
  flight.route = world.tourRoute
  flight.approachDuration = flight.duration
  // 路线焦点以 12 米/秒沿道路行进，速度不受帧率或系统减少动态效果设置影响。
  flight.duration += (flight.route.length / TOUR_SPEED) * 1000
  selectPlace(world, world.placesById.get(world.tourIds[0]), { fromTour: true })
  world.state.statusText = '正在前往导览起点 · 林则徐纪念馆'
  world.state.statusUntil = 0
}

export function zoom(world, factor) {
  if (!world.state.ready || world.state.lost) return
  world.state.overview = false
  const offset = world.camera.position.clone().sub(world.controls.target)
  offset.setLength(
    Math.max(
      world.controls.minDistance,
      Math.min(world.controls.maxDistance, offset.length() * factor),
    ),
  )
  startFlight(world, world.controls.target.clone().add(offset), world.controls.target.clone(), {
    duration: 350,
    arc: 0,
  })
}

// 三维地图和小地图共用建筑选择，不携带镜头移动副作用。
export function selectBuilding(world, buildingIndex) {
  if (!world.data.buildings[buildingIndex]) return
  const place =
    world.contextPlaces.find((place) => place.buildingIndex === buildingIndex) ??
    world.data.sites.find((site) => world.siteBuildings.get(site.id)?.includes(buildingIndex))
  if (place) {
    selectPlace(world, { ...place, buildingIndex })
    return
  }
  const ring = world.data.buildings[buildingIndex].ring
  const position = [
    ring.reduce((sum, p) => sum + p[0], 0) / ring.length,
    ring.reduce((sum, p) => sum + p[1], 0) / ring.length,
  ]
  selectPlace(world, {
    id: 'building-' + buildingIndex,
    buildingIndex,
    name: world.data.buildings[buildingIndex].name || '坊巷古厝',
    category: '自由探索',
    subtitle: '已选中地图建筑',
    description:
      '金色轮廓与暖色屋面标示当前选中的建筑。可拖动查看墙面、屋顶与天井，点击其他建筑切换选择。建筑名称未在精选目录中核验。',
    position,
    source: world.data.sourceLinks.osm,
  })
}

export function pickDestination(world, event) {
  if (!world.state.ready || world.state.lost) return
  const rect = world.canvas.getBoundingClientRect()
  world.pointer.set(
    ((event.clientX - rect.left) / rect.width) * 2 - 1,
    -((event.clientY - rect.top) / rect.height) * 2 + 1,
  )
  world.raycaster.setFromCamera(world.pointer, world.camera)
  const hit = world.raycaster.intersectObjects(world.pickMeshes, false)[0]
  if (!hit) return
  if (hit.object.userData.placeId) {
    selectPlace(world, world.placesById.get(hit.object.userData.placeId))
    return
  }
  const index = hit.object.userData.buildingFaces?.find((part) => hit.faceIndex < part.end)?.index
  if (index !== undefined) selectBuilding(world, index)
}
