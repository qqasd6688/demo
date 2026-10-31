import { isPointInRing, getWorldPoint, getRoadWidth } from './geometry.js'

// 根据真实道路和建筑轮廓规划游客路线、分组和步行姿态，不依赖 DOM 或渲染实例。
// 游客生成只使用展示路网。道路与建筑检查在初始化执行，动画帧只更新姿态。
export function createPedestrianPlan(roads, buildings, origin, seed) {
  let value = seed >>> 0
  const random = () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0
    return value / 4294967296
  }
  const cells = new Map(),
    cellSize = 24
  buildings.forEach((building, index) => {
    const xs = building.ring.map((p) => p[0]),
      zs = building.ring.map((p) => p[1])
    for (
      let x = Math.floor(Math.min(...xs) / cellSize);
      x <= Math.floor(Math.max(...xs) / cellSize);
      x++
    )
      for (
        let z = Math.floor(Math.min(...zs) / cellSize);
        z <= Math.floor(Math.max(...zs) / cellSize);
        z++
      ) {
        const key = x + ',' + z
        if (!cells.has(key)) cells.set(key, [])
        cells.get(key).push(index)
      }
  })
  const isBlocked = (point) =>
    (cells.get(Math.floor(point[0] / cellSize) + ',' + Math.floor(point[1] / cellSize)) || []).some(
      (index) => {
        const b = buildings[index]
        return isPointInRing(point, b.ring) && !b.holes.some((hole) => isPointInRing(point, hole))
      },
    )
  const routes = []
  const names = [
    '南后街',
    '衣锦坊',
    '文儒坊',
    '光禄坊',
    '郎官巷',
    '塔巷',
    '黄巷',
    '安民巷',
    '宫巷',
    '吉庇巷',
  ]
  for (const [roadIndex, road] of roads.entries()) {
    if (['motorway', 'trunk', 'construction', 'proposed'].includes(road.kind)) continue
    const points = road.points.map((p) => getWorldPoint(p, origin))
    const width = getRoadWidth(road)
    const curb =
      names.includes(road.name) ||
      ['pedestrian', 'footway', 'steps', 'path', 'living_street'].includes(road.kind)
        ? 0
        : Math.max(0, width / 2 - 1.2)
    const offsets = curb ? [curb, -curb, 0] : [0, 0.65, -0.65]
    let best = [],
      bestLength = -1
    // 逐条道路寻找可走的中心或路侧，优先保证覆盖，遇到建筑就切断路线。
    for (const offset of offsets) {
      const candidate = []
      let line = []
      const flush = () => {
        const lengths = [0]
        for (let i = 1; i < line.length; i++)
          lengths.push(
            lengths.at(-1) + Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]),
          )
        const length = lengths.at(-1)
        if (length >= 2)
          candidate.push({
            points: line,
            lengths,
            length,
            roadId: road.id,
            roadIndex,
            name: road.name,
            width,
            curb: Math.abs(offset),
          })
        line = []
      }
      for (let i = 1; i < points.length; i++) {
        const a = points[i - 1],
          b = points[i],
          length = Math.hypot(b[0] - a[0], b[1] - a[1])
        if (length < 0.01) continue
        const nx = -(b[1] - a[1]) / length,
          nz = (b[0] - a[0]) / length,
          steps = Math.ceil(length / 1.4)
        for (let j = 0; j <= steps; j++) {
          const t = j / steps,
            p = [a[0] + (b[0] - a[0]) * t + nx * offset, a[1] + (b[1] - a[1]) * t + nz * offset]
          const safe = [-0.72, 0, 0.72].every(
            (side) => !isBlocked([p[0] + nx * side, p[1] + nz * side]),
          )
          if (!safe) {
            flush()
            continue
          }
          if (!line.length || Math.hypot(p[0] - line.at(-1)[0], p[1] - line.at(-1)[1]) > 0.01)
            line.push(p)
        }
      }
      flush()
      const length = candidate.reduce((sum, path) => sum + path.length, 0)
      if (length > bestLength) {
        best = candidate
        bestLength = length
      }
    }
    routes.push(...best)
  }
  const shirts = [
    '#b84934',
    '#e2c376',
    '#4f8a83',
    '#456d9b',
    '#eee2c8',
    '#806699',
    '#c8826f',
    '#53614d',
    '#b6b6a3',
  ]
  const trousers = ['#34383e', '#5f635c', '#6f6053', '#303e4a', '#9b9788']
  const skins = ['#e0b18b', '#c99672', '#edc8a6', '#a67655']
  const hair = ['#302a25', '#514134', '#6a5441', '#aea79b']
  const roles = ['backpacker', 'hat', 'camera', 'skirt', 'elder', 'guide']
  const groups = []
  if (!routes.length) return { seed, routes, groups }
  for (const route of routes) {
    // 每段路至少一组；主街约每 30 米一组，其余道路约每 45 米一组。
    const number = Math.max(1, Math.ceil(route.length / (names.includes(route.name) ? 30 : 45)))
    for (let slot = 0; slot < number; slot++) {
      const i = groups.length,
        speed = 0.65 + random() * 0.45,
        pause = 1.7 + random() * 2.5,
        travel = route.length / speed
      const fraction = (slot + 0.15 + random() * 0.7) / number
      const clockOffset =
        random() < 0.5 ? fraction * travel : travel + pause + (1 - fraction) * travel
      const size = 1 + Math.floor(random() * 5),
        columns = size > 3 ? Math.ceil(size / 2) : size
      const group = {
        route,
        speed,
        pause,
        clockOffset,
        maxScale: Math.min(2.2, (route.curb ? 2.4 : route.width) / 1.8),
        depth: size > 3 ? 0.4 : 0,
        members: [],
      }
      for (let j = 0; j < size; j++) {
        // 四五人分成前后两排，横向仍保持最多三人，沿用巷道可行走宽度。
        const row = Math.floor(j / columns),
          rowSize = Math.min(columns, size - row * columns)
        const role =
          j === 0
            ? roles[(i + Math.floor(random() * roles.length)) % roles.length]
            : j === size - 1 && (i % 7 === 0 || random() < 0.16)
              ? 'child'
              : roles[Math.floor(random() * roles.length)]
        group.members.push({
          role,
          side: ((j % columns) - (rowSize - 1) / 2) * 0.55,
          row: size > 3 ? row * 2 - 1 : 0,
          scale:
            role === 'child'
              ? 0.7 + random() * 0.09
              : role === 'elder'
                ? 0.93 + random() * 0.05
                : 0.98 + random() * 0.13,
          shirt: shirts[Math.floor(random() * shirts.length)],
          trousers: trousers[Math.floor(random() * trousers.length)],
          skin: skins[Math.floor(random() * skins.length)],
          hair: role === 'elder' ? '#b8b0a4' : hair[Math.floor(random() * hair.length)],
          phase: random() * Math.PI * 2,
        })
      }
      groups.push(group)
    }
  }
  // 整组打散后按人数取前缀，让低客流仍分布在各条街巷，结伴游客不被拆开。
  // 只在初始化消耗种子随机数，切换时段不重新生成角色或改变原路线。
  for (let i = groups.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[groups[i], groups[j]] = [groups[j], groups[i]]
  }
  return { seed, routes, groups }
}

// 端点停留后沿原路返回；周期首尾位置一致，刷新随机而运行中不瞬移。
export function getPedestrianPose(group, member, elapsed, spread = 1) {
  const travel = group.route.length / group.speed,
    cycle = travel * 2 + group.pause * 2
  const clock = (((elapsed + group.clockOffset) % cycle) + cycle) % cycle
  let distance, direction, moving
  if (clock < travel) {
    distance = clock * group.speed
    direction = 1
    moving = true
  } else if (clock < travel + group.pause) {
    distance = group.route.length
    direction = 1
    moving = false
  } else if (clock < travel * 2 + group.pause) {
    distance = group.route.length - (clock - travel - group.pause) * group.speed
    direction = -1
    moving = true
  } else {
    distance = 0
    direction = -1
    moving = false
  }
  // 两排共享缩短后的往返区间，让前后排在路端保持间距且不会超出安全路线。
  const margin = Math.min((group.depth || 0) * spread, group.route.length / 4)
  distance =
    margin + distance * (1 - (2 * margin) / group.route.length) + (member.row || 0) * margin
  const { points, lengths } = group.route
  let i = 1
  while (i < lengths.length - 1 && lengths[i] < distance) i++
  const a = points[i - 1],
    b = points[i],
    length = Math.max(0.001, lengths[i] - lengths[i - 1]),
    t = Math.max(0, Math.min(1, (distance - lengths[i - 1]) / length))
  const dx = (b[0] - a[0]) / length,
    dz = (b[1] - a[1]) / length
  return {
    x: a[0] + (b[0] - a[0]) * t - dz * member.side * spread,
    z: a[1] + (b[1] - a[1]) * t + dx * member.side * spread,
    heading: Math.atan2(dx * direction, dz * direction),
    moving,
    phase: elapsed * group.speed * 8 + member.phase,
  }
}
