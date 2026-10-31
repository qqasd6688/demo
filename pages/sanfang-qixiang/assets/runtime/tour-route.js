import { CatmullRomCurve3, Vector3 } from '../vendor/three/build/three.module.min.js'
import { getWorldPoint } from './geometry.js'

// 当前街区仅百余条道路：按原路口建无向图，把景点投影到道路后分割边。
// 只沿已连通的道路寻路；遇到断路明确失败，不用穿过建筑的直线冒充行进路线。
export function createTourRoute(roads, places, origin) {
  const nodes = []
  const byPosition = new Map()
  const addNode = (point) => {
    const key = point.map((value) => value.toFixed(3)).join(',')
    if (!byPosition.has(key)) {
      byPosition.set(key, nodes.length)
      nodes.push({ point, edges: new Map() })
    }
    return byPosition.get(key)
  }
  const segments = roads.flatMap((road) => {
    const points = road.points.map((point) => getWorldPoint(point, origin))
    return points.slice(1).flatMap((point, index) => {
      const a = addNode(points[index])
      const b = addNode(point)
      return a === b ? [] : [{ a, b, stops: [] }]
    })
  })
  const stops = places.map((place) => {
    // 大型院落使用道路入口定位，地图名称仍位于院内，避免从馆区中心跨屋顶起飞。
    const point = getWorldPoint(place.tourPosition ?? place.position, origin)
    let nearest
    let minDistance = Infinity
    for (const segment of segments) {
      const a = nodes[segment.a].point
      const b = nodes[segment.b].point
      const dx = b[0] - a[0]
      const dz = b[1] - a[1]
      const t = Math.max(
        0,
        Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dz) / (dx * dx + dz * dz)),
      )
      const projection = [a[0] + dx * t, a[1] + dz * t]
      const distance = Math.hypot(point[0] - projection[0], point[1] - projection[1])
      if (distance < minDistance) {
        minDistance = distance
        nearest = { segment, t, point: projection }
      }
    }
    if (!nearest) throw new Error('当前地图没有可用的导览道路')
    const node = addNode(nearest.point)
    nearest.segment.stops.push({ node, t: nearest.t })
    return { id: place.id, node, point: nearest.point, distance: 0 }
  })
  for (const segment of segments) {
    const chain = [{ node: segment.a, t: 0 }, ...segment.stops, { node: segment.b, t: 1 }].sort(
      (a, b) => a.t - b.t,
    )
    for (let index = 1; index < chain.length; index++) {
      const a = chain[index - 1].node
      const b = chain[index].node
      if (a === b) continue
      const distance = Math.hypot(
        nodes[a].point[0] - nodes[b].point[0],
        nodes[a].point[1] - nodes[b].point[1],
      )
      nodes[a].edges.set(b, distance)
      nodes[b].edges.set(a, distance)
    }
  }

  // 景点顺序由页面的单向游线决定；每一段使用道路最短路径，保留转弯和中间路口。
  const points = []
  for (let stopIndex = 0; stopIndex < stops.length; stopIndex++) {
    const stop = stops[stopIndex]
    let path = [stop.node]
    if (stopIndex > 0) {
      const start = stops[stopIndex - 1].node
      const costs = new Map([[start, 0]])
      const previous = new Map()
      const pending = new Set([start])
      while (pending.size) {
        let current
        let cheapest = Infinity
        for (const node of pending) {
          if (costs.get(node) < cheapest) {
            cheapest = costs.get(node)
            current = node
          }
        }
        pending.delete(current)
        if (current === stop.node) break
        for (const [next, length] of nodes[current].edges) {
          const cost = cheapest + length
          if (cost < (costs.get(next) ?? Infinity)) {
            costs.set(next, cost)
            previous.set(next, current)
            pending.add(next)
          }
        }
      }
      if (!costs.has(stop.node)) throw new Error('部分精选点位之间缺少连通道路，暂不能开始导览')
      while (path[0] !== start) path.unshift(previous.get(path[0]))
    }
    for (const node of path) {
      const point = new Vector3(nodes[node].point[0], 14, nodes[node].point[1])
      if (points.length) {
        const previous = points.at(-1)
        const length = previous.distanceTo(point)
        if (length < 0.01) continue
        // 转角附近保持原路网，长直段每 8 米插值，限制平滑曲线的横向偏移。
        const count = Math.ceil(length / 8)
        for (let index = 1; index < count; index++)
          points.push(previous.clone().lerp(point, index / count))
      }
      points.push(point)
    }
    stop.pointIndex = points.length - 1
  }
  if (points.length < 2) throw new Error('可用精选点位不足，暂不能开始导览')
  const curve = new CatmullRomCurve3(points, false, 'centripetal')
  curve.arcLengthDivisions = Math.max(1000, points.length * 12)
  const length = curve.getLength()
  // 景点的曲线参数取自插值点索引，再换为弧长，避免重复经过同一路口时跳错站。
  const lengths = curve.getLengths()
  for (const stop of stops) {
    const at = (stop.pointIndex / (points.length - 1)) * curve.arcLengthDivisions
    const index = Math.floor(at)
    stop.distance =
      lengths[index] +
      (lengths[Math.min(index + 1, lengths.length - 1)] - lengths[index]) * (at - index)
  }
  stops[0].distance = 0
  stops.at(-1).distance = length
  // 沿弧长采样道路朝向。先展开 ±π 接缝，再在前后 36 米内平滑；
  // 包括原路折返的 180° 转向，镜头也会连续转过去，不在帧间突然翻面。
  const count = Math.ceil(length / 3)
  const bearings = []
  for (let index = 0; index <= count; index++) {
    const along = (index / count) * length
    const before = curve.getPointAt(Math.max(0, along - 4) / length)
    const after = curve.getPointAt(Math.min(length, along + 4) / length)
    const previous = bearings.at(-1) ?? 0
    const dx = after.x - before.x
    const dz = after.z - before.z
    const raw = Math.hypot(dx, dz) < 0.01 ? previous : Math.atan2(dx, dz)
    bearings.push(
      index ? previous + Math.atan2(Math.sin(raw - previous), Math.cos(raw - previous)) : raw,
    )
  }
  const headings = bearings.map((_, index) => {
    let sum = 0
    let weights = 0
    for (let offset = -12; offset <= 12; offset++) {
      const weight = 13 - Math.abs(offset)
      sum += bearings[Math.max(0, Math.min(count, index + offset))] * weight
      weights += weight
    }
    return sum / weights
  })
  return { points, curve, length, stops, headings }
}

// 镜头跟随道路平滑转向，从路线焦点后方斜看前方；路口与折返也保持连续朝向。
// 位置、方向都由路程确定，不增设帧率相关的朝向缓存或独立动画。
export function getTourPose(route, distance) {
  const along = Math.max(0, Math.min(route.length, distance))
  const target = route.curve.getPointAt(along / route.length)
  const at = (along / route.length) * (route.headings.length - 1)
  const index = Math.floor(at)
  const angle =
    route.headings[index] +
    (route.headings[Math.min(index + 1, route.headings.length - 1)] - route.headings[index]) *
      (at - index)
  const position = target.clone().add(new Vector3(-Math.sin(angle) * 95, 70, -Math.cos(angle) * 95))
  const stopIndex = Math.max(
    0,
    route.stops.findLastIndex((stop) => stop.distance <= along + 10),
  )
  return { position: position.toArray(), target: target.toArray(), stopIndex }
}
