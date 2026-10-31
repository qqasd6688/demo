import { getWorldPoint, getRoadWidth, isPointInRing } from './geometry.js'

const CELL = 24
const HALF_WIDTH = 0.86
const HALF_LENGTH = 1.42
const DEFAULT_PITCH = Math.atan2(6.1, 10)
const CAMERA_DISTANCE = Math.hypot(6.1, 10)
const wrapAngle = angle => Math.atan2(Math.sin(angle), Math.cos(angle))
const cellKey = ([x, z]) => `${Math.floor(x / CELL)},${Math.floor(z / CELL)}`

// 页面私有的道路约束与车辆运动；不依赖 DOM、时钟或 Three.js 实例，可直接做 CPU 检查。
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
    // 楼梯及不足以容纳车身的窄步道不进入可驾驶路网。
    if (
      width < 3.6 ||
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

export function isDrivingPositionValid(network, x, z, yaw) {
  const sin = Math.sin(yaw),
    cos = Math.cos(yaw)
  const nearbyBuildings = new Set(),
    nearbyObstacles = new Set()
  const corners = []
  // 用车身四角、边中点和中心检查道路并索引障碍；不是只约束一个会穿墙的中心点。
  for (const side of [-1, 0, 1])
    for (const end of [-1, 0, 1]) {
      const point = [
        x + side * HALF_WIDTH * cos + end * HALF_LENGTH * sin,
        z - side * HALF_WIDTH * sin + end * HALF_LENGTH * cos,
      ]
      const cell = network.cells.get(cellKey(point))
      if (
        !cell?.roads.some((road) => {
          const along = Math.max(
            0,
            Math.min(
              road.length,
              (point[0] - road.a[0]) * road.dx + (point[1] - road.a[1]) * road.dz,
            ),
          )
          return (
            Math.hypot(
              point[0] - road.a[0] - road.dx * along,
              point[1] - road.a[1] - road.dz * along,
            ) <
            road.halfWidth - 0.12
          )
        })
      )
        return false
      cell.buildings.forEach((building) => nearbyBuildings.add(building))
      cell.obstacles.forEach((obstacle) => nearbyObstacles.add(obstacle))
      if (side && end) corners.push(point)
    }
  for (const building of nearbyBuildings) {
    if (
      corners.some(
        (p) =>
          isPointInRing(p, building.ring) && !building.holes.some((hole) => isPointInRing(p, hole)),
      )
    )
      return false
    // 把墙线变换到车身局部坐标后作矩形裁剪，连很薄的墙也不能从采样点之间穿过。
    for (const ring of [building.ring, ...building.holes])
      for (let i = 1; i < ring.length; i++) {
        const local = [ring[i - 1], ring[i]].map(([px, pz]) => [
          (px - x) * cos - (pz - z) * sin,
          (px - x) * sin + (pz - z) * cos,
        ])
        let low = 0,
          high = 1
        for (const [axis, half] of [
          [0, HALF_WIDTH],
          [1, HALF_LENGTH],
        ]) {
          const delta = local[1][axis] - local[0][axis]
          if (Math.abs(delta) < 1e-8) {
            if (Math.abs(local[0][axis]) > half) {
              high = -1
              break
            }
          } else {
            const a = (-half - local[0][axis]) / delta,
              b = (half - local[0][axis]) / delta
            low = Math.max(low, Math.min(a, b))
            high = Math.min(high, Math.max(a, b))
          }
        }
        if (low <= high) return false
      }
  }
  for (const obstacle of nearbyObstacles) {
    const dx = obstacle.x - x,
      dz = obstacle.z - z
    const side = Math.max(0, Math.abs(dx * cos - dz * sin) - HALF_WIDTH)
    const end = Math.max(0, Math.abs(dx * sin + dz * cos) - HALF_LENGTH)
    if (Math.hypot(side, end) < obstacle.radius) return false
  }
  return true
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
    // 起点给车身转向预留空间，避免刚进入驾驶就因贴路边而无法跟随鼠标。
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

function alignCarHeading(network, pose) {
  const turn = wrapAngle(pose.yaw - pose.carYaw)
  if (Math.abs(turn) < 1e-6) return
  const start = pose.carYaw, steps = Math.ceil(Math.abs(turn) / .06)
  // 大幅拖动也逐段校验车身的旋转范围，不能从墙体或路灯中转过去。
  for (let i = 1; i <= steps; i++) {
    const yaw = start + turn * i / steps
    if (!isDrivingPositionValid(network, pose.x, pose.z, yaw)) break
    pose.carYaw = wrapAngle(yaw)
  }
}

export function advanceDriving(network, pose, keys, elapsed) {
  const dt = Math.max(0, Math.min(0.05, elapsed))
  const throttle = Number(keys.has('KeyW')) - Number(keys.has('KeyS'))
  const strafe = Number(keys.has('KeyD')) - Number(keys.has('KeyA'))
  const inputLength = Math.hypot(throttle, strafe)
  const maxSpeed = throttle < 0 ? 3 : 6
  const desired = inputLength ? throttle / inputLength * maxSpeed : 0
  const desiredStrafe = inputLength ? strafe / inputLength * maxSpeed : 0
  pose.strafeSpeed ??= 0
  const forwardChange = desired - pose.speed, sideChange = desiredStrafe - pose.strafeSpeed
  const changeLength = Math.hypot(forwardChange, sideChange)
  const blend = changeLength ? Math.min(1, (inputLength ? 8 : 15) * dt / changeLength) : 0
  pose.speed += forwardChange * blend
  pose.strafeSpeed += sideChange * blend
  alignCarHeading(network, pose)
  pose.blocked = false
  const distance = pose.speed * dt, sideDistance = pose.strafeSpeed * dt
  const travelLength = Math.hypot(distance, sideDistance)
  const steps = Math.max(1, Math.ceil(travelLength / 0.2))
  let traveled = 0
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
    alignCarHeading(network, pose)
    traveled += distance / steps
  }
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
  const target = [pose.x, 0.9, pose.z]
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
      Math.max(2.6, target[1] + offset[1] * ratio),
      target[2] + offset[2] * ratio,
    ],
  }
}
