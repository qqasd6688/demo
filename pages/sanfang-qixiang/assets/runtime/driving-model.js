import { getWorldPoint, getRoadWidth, isPointInRing } from './geometry.js'

const CELL = 24
export const CHARACTER_RADIUS = 0.32
export const WALK_SPEED = 1.65
export const RUN_SPEED = 4.2
const HALF_WIDTH = CHARACTER_RADIUS
const HALF_LENGTH = CHARACTER_RADIUS
const DEFAULT_PITCH = Math.atan2(2.1, 4.5)
const CAMERA_DISTANCE = Math.hypot(2.1, 4.5)
const wrapAngle = angle => Math.atan2(Math.sin(angle), Math.cos(angle))
const cellKey = ([x, z]) => `${Math.floor(x / CELL)},${Math.floor(z / CELL)}`

// 页面私有的人物移动、道路碰撞和跟随镜头；沿用原导航接口。
export function createDrivingNetwork(roads, buildings, origin, obstacles = []) {
  const cells = new Map()
  const put = (points, padding, kind, item) => {
    const xs = points.map((p) => p[0]),
      zs = points.map((p) => p[1])
    for (
      let x = Math.floor((Math.min(...xs) - padding) / CELL);
      x <= Math.floor((Math.max(...xs) + padding) / CELL);
      x++
    )
      for (
        let z = Math.floor((Math.min(...zs) - padding) / CELL);
        z <= Math.floor((Math.max(...zs) + padding) / CELL);
        z++
      ) {
        const key = `${x},${z}`
        if (!cells.has(key)) cells.set(key, { roads: [], buildings: [], obstacles: [] })
        cells.get(key)[kind].push(item)
      }
  }
  const segments = []
  for (const road of roads) {
    const width = getRoadWidth(road)
    // 场景没有楼梯高度数据；保留平坦步道，排除施工和不可通行路段。
    if (
      width < 1 ||
      ['steps', 'construction', 'proposed', 'motorway', 'trunk'].includes(road.kind)
    )
      continue
    const points = road.points.map((p) => getWorldPoint(p, origin))
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1],
        b = points[i]
      const length = Math.hypot(b[0] - a[0], b[1] - a[1])
      if (length < 0.01) continue
      const segment = {
        a,
        b,
        length,
        dx: (b[0] - a[0]) / length,
        dz: (b[1] - a[1]) / length,
        halfWidth: width / 2,
        name: road.name || '街区道路',
      }
      segments.push(segment)
      put([a, b], width / 2, 'roads', segment)
    }
  }
  buildings.forEach((building) => put(building.ring, 0, 'buildings', building))
  obstacles.forEach((obstacle) =>
    put([[obstacle.x, obstacle.z]], obstacle.radius, 'obstacles', obstacle),
  )
  return { segments, cells }
}

// 圆形碰撞体的转身不会像车身矩形一样卡在窄巷；墙线距离检查防止穿薄墙。
export function isDrivingPositionValid(network, x, z) {
  const nearbyBuildings = new Set(), nearbyObstacles = new Set()
  for (let i = -1; i < 8; i++) {
    const angle = i * Math.PI / 4
    const point = i < 0 ? [x, z] : [x + Math.sin(angle) * CHARACTER_RADIUS, z + Math.cos(angle) * CHARACTER_RADIUS]
    const cell = network.cells.get(cellKey(point))
    if (!cell?.roads.some(road => distanceToSegment(point, road.a, road.b) < road.halfWidth - 0.08)) return false
    cell.buildings.forEach(building => nearbyBuildings.add(building))
    cell.obstacles.forEach(obstacle => nearbyObstacles.add(obstacle))
  }
  for (const building of nearbyBuildings) {
    const holes = building.holes || []
    if (isPointInRing([x, z], building.ring) && !holes.some(hole => isPointInRing([x, z], hole))) return false
    for (const ring of [building.ring, ...holes]) {
      for (let i = 0; i < ring.length; i++) {
        if (distanceToSegment([x, z], ring[i], ring[(i + 1) % ring.length]) < CHARACTER_RADIUS) return false
      }
    }
  }
  for (const obstacle of nearbyObstacles)
    if (Math.hypot(obstacle.x - x, obstacle.z - z) < CHARACTER_RADIUS + obstacle.radius) return false
  return true
}

function distanceToSegment(point, a, b) {
  const dx = b[0] - a[0], dz = b[1] - a[1], length2 = dx * dx + dz * dz
  const t = length2 ? Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dz) / length2)) : 0
  return Math.hypot(point[0] - a[0] - dx * t, point[1] - a[1] - dz * t)
}

export function getDrivingSpawn(network, focus, facing) {
  const candidates = network.segments
    .map((road) => {
      const along = Math.max(
        2,
        Math.min(
          road.length - 2,
          (focus[0] - road.a[0]) * road.dx + (focus[1] - road.a[1]) * road.dz,
        ),
      )
      const x = road.a[0] + road.dx * along,
        z = road.a[1] + road.dz * along
      return { road, along, distance: Math.hypot(focus[0] - x, focus[1] - z) }
    })
    .sort((a, b) => a.distance - b.distance)
  for (const { road, along } of candidates) {
    let yaw = Math.atan2(road.dx, road.dz)
    if (Math.cos(yaw - facing) < 0) yaw += Math.PI
    // 尽量选择道路内侧的安全出生位置。
    const lateral = Math.max(0, Math.min(2.1, road.halfWidth - Math.hypot(HALF_WIDTH, HALF_LENGTH) - .18))
    for (const shift of [0, 4, -4, 9, -9, 16, -16])
      for (const side of [lateral, -lateral, 0]) {
        const at = Math.max(1.5, Math.min(road.length - 1.5, along + shift))
        const x = road.a[0] + road.dx * at - road.dz * side
        const z = road.a[1] + road.dz * at + road.dx * side
        if (isDrivingPositionValid(network, x, z, yaw))
          return { x, z, yaw, carYaw: yaw, pitch: DEFAULT_PITCH, speed: 0, strafeSpeed: 0, blocked: false, road: road.name }
      }
  }
  return null
}

// 左键拖动控制水平朝向与俯仰；键盘运动从不改写这两个视角值。
export function adjustDrivingView(pose, deltaX, deltaY) {
  if (!Number.isFinite(deltaX) || !Number.isFinite(deltaY)) return
  pose.yaw = wrapAngle(pose.yaw - deltaX * .004)
  pose.pitch = Math.max(.17, Math.min(1.16, (pose.pitch ?? DEFAULT_PITCH) + deltaY * .003))
}

export function advanceDriving(network, pose, keys, elapsed) {
  const dt = Math.max(0, Math.min(0.05, elapsed))
  const throttle = Number(keys.has('KeyW')) - Number(keys.has('KeyS'))
  const strafe = Number(keys.has('KeyD')) - Number(keys.has('KeyA'))
  const inputLength = Math.hypot(throttle, strafe)
  const maxSpeed = keys.has('ShiftLeft') || keys.has('ShiftRight') ? RUN_SPEED : WALK_SPEED
  const desired = inputLength ? throttle / inputLength * maxSpeed : 0
  const desiredStrafe = inputLength ? strafe / inputLength * maxSpeed : 0
  pose.strafeSpeed ??= 0
  const forwardChange = desired - pose.speed, sideChange = desiredStrafe - pose.strafeSpeed
  const changeLength = Math.hypot(forwardChange, sideChange)
  const blend = changeLength ? Math.min(1, (inputLength ? 8 : 15) * dt / changeLength) : 0
  pose.speed += forwardChange * blend
  pose.strafeSpeed += sideChange * blend
  pose.blocked = false
  const distance = pose.speed * dt, sideDistance = pose.strafeSpeed * dt
  const travelLength = Math.hypot(distance, sideDistance)
  const steps = Math.max(1, Math.ceil(travelLength / 0.2))
  let traveled = 0
  const startX = pose.x, startZ = pose.z
  for (let i = 0; i < steps && travelLength > 1e-7; i++) {
    const x = pose.x + (Math.sin(pose.yaw) * distance - Math.cos(pose.yaw) * sideDistance) / steps
    const z = pose.z + (Math.cos(pose.yaw) * distance + Math.sin(pose.yaw) * sideDistance) / steps
    if (!isDrivingPositionValid(network, x, z, pose.carYaw)) {
      pose.speed = pose.strafeSpeed = 0
      pose.blocked = true
      break
    }
    pose.x = x
    pose.z = z
    traveled += travelLength / steps
  }
  if (traveled > 0.00001) {
    const heading = Math.atan2(pose.x - startX, pose.z - startZ)
    pose.carYaw = wrapAngle((pose.carYaw ?? pose.yaw) + wrapAngle(heading - (pose.carYaw ?? pose.yaw)) * (1 - Math.exp(-dt * 14)))
  }
  pose.travelSpeed = dt ? traveled / dt : 0
  const cell = network.cells.get(cellKey([pose.x, pose.z]))
  if (cell?.roads.length) {
    const roads = cell.roads
      .map((road) => {
        const along = Math.max(
          0,
          Math.min(road.length, (pose.x - road.a[0]) * road.dx + (pose.z - road.a[1]) * road.dz),
        )
        return {
          road,
          distance: Math.hypot(
            pose.x - road.a[0] - along * road.dx,
            pose.z - road.a[1] - along * road.dz,
          ),
        }
      })
      .sort((a, b) => a.distance - b.distance)
    pose.road = roads[0].road.name
  }
  return traveled
}

export function getDrivingCameraPose(network, pose) {
  const target = [pose.x, 1.2, pose.z]
  const pitch = pose.pitch ?? DEFAULT_PITCH
  const horizontal = CAMERA_DISTANCE * Math.cos(pitch)
  const offset = [-Math.sin(pose.yaw) * horizontal, CAMERA_DISTANCE * Math.sin(pitch), -Math.cos(pose.yaw) * horizontal]
  let ratio = 1
  // 沿跟随镜头的视线检查建筑，转向墙边时收近镜头，避免相机钻进房屋。
  for (let step = 1; step <= 40; step++) {
    const t = step / 40
    const point = [target[0] + offset[0] * t, target[2] + offset[2] * t]
    const cell = network.cells.get(cellKey(point))
    if (
      cell?.buildings.some(
        (building) =>
          target[1] + offset[1] * t < (building.height ?? 18) &&
          isPointInRing(point, building.ring) &&
          !building.holes.some((hole) => isPointInRing(point, hole)),
      )
    ) {
      ratio = Math.max(0.15, t - 0.06)
      break
    }
  }
  return {
    target,
    position: [
      target[0] + offset[0] * ratio,
      Math.max(1.65, target[1] + offset[1] * ratio),
      target[2] + offset[2] * ratio,
    ],
  }
}
