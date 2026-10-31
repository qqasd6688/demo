import {
  BoxGeometry,
  Color,
  BufferGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  Float32BufferAttribute,
  Path,
  Shape,
  ShapeGeometry,
  Vector2,
} from '../vendor/three/build/three.module.min.js'
import { mergeGeometries } from '../vendor/three/examples/jsm/utils/BufferGeometryUtils.js'

// 街区局部投影、建筑几何、拾取关联和视角算法；原始坐标始终使用 WGS84。
// 本文件的局部投影只用于约 1 km 的街区展示；原始数据始终保留 WGS84，不混用 GCJ-02。
export function getWorldPoint(position, origin) {
  const x = (position[0] - origin[0]) * 111319.49079327358 * Math.cos((origin[1] * Math.PI) / 180)
  const z = -(position[1] - origin[1]) * 111319.49079327358
  return [x, z]
}

// 绘制与交互共用示意路宽，驾驶边界不能与地面上看见的道路各用一套尺寸。
export function getRoadWidth(road) {
  return road.name === '南后街'
    ? 12
    : ({
        motorway: 16,
        motorway_link: 8,
        trunk: 16,
        trunk_link: 8,
        primary: 15,
        secondary: 14,
        tertiary: 9,
        residential: 6,
        service: 4,
        pedestrian: 4.8,
        footway: 2.6,
        path: 2.5,
        steps: 2.5,
        living_street: 6,
      }[road.kind] ?? 4)
}

export function isPointInRing([x, y], ring) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i],
      [xj, yj] = ring[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

// 单一飞行状态由动画帧读取，新的目的地直接替换它；不创建竞相写相机的定时器。
export function getFlightFrame(flight, progress) {
  const t = Math.max(0, Math.min(1, progress))
  const ease = t * t * t * (t * (t * 6 - 15) + 10)
  const position = flight.fromPosition.map((v, i) => v + (flight.toPosition[i] - v) * ease)
  position[1] += Math.sin(Math.PI * ease) * flight.arc
  return { position, target: flight.fromTarget.map((v, i) => v + (flight.toTarget[i] - v) * ease) }
}

// 用实际外环和内环生成院落。屋顶按最长边确定屋脊方向，三角形在屋脊处切开，避免屋面被拉平。
export function createBuildingGeometries(building, origin) {
  const rings = [building.ring, ...building.holes].map((ring) =>
    ring.slice(0, -1).map((p) => getWorldPoint(p, origin)),
  )
  const outer = rings[0]
  const shape = new Shape(outer.map(([x, z]) => new Vector2(x, -z)))
  for (const hole of rings.slice(1))
    shape.holes.push(new Path(hole.map(([x, z]) => new Vector2(x, -z))))
  const walls = new ExtrudeGeometry(shape, {
    depth: building.height,
    bevelEnabled: false,
    steps: 1,
    curveSegments: 1,
  })
  walls.rotateX(-Math.PI / 2)
  let longest = 0,
    angle = 0
  outer.forEach((p, i) => {
    const q = outer[(i + 1) % outer.length],
      length = Math.hypot(q[0] - p[0], q[1] - p[1])
    if (length > longest) {
      longest = length
      angle = Math.atan2(q[1] - p[1], q[0] - p[0])
    }
  })
  const c = Math.cos(angle),
    s = Math.sin(angle)
  const transverse = ([x, z]) => -x * s + z * c
  const values = outer.map(transverse),
    min = Math.min(...values),
    max = Math.max(...values),
    mid = (min + max) / 2
  const half = Math.max((max - min) / 2, 0.01)
  const rise =
    building.roofRise ??
    (building.roofShape === 'flat'
      ? 0
      : building.core
        ? Math.min(3.8, half * 0.42)
        : Math.min(2.5, half * 0.2))
  const roofY = (p) =>
    building.height + 0.45 + Math.max(0, 1 - Math.abs(transverse(p) - mid) / half) * rise
  const roofPositions = [],
    gablePositions = [],
    edgePositions = []
  const flat = new ShapeGeometry(shape)
  const positions = flat.attributes.position,
    indices = flat.index.array
  function clipTriangle(triangle, side) {
    const output = []
    for (let i = 0; i < triangle.length; i++) {
      const a = triangle[i],
        b = triangle[(i + 1) % triangle.length]
      const da = (transverse(a) - mid) * side,
        db = (transverse(b) - mid) * side
      if (da >= -0.000001) output.push(a)
      if ((da > 0 && db < 0) || (da < 0 && db > 0)) {
        const ratio = da / (da - db)
        output.push([a[0] + (b[0] - a[0]) * ratio, a[1] + (b[1] - a[1]) * ratio])
      }
    }
    return output
  }
  for (let i = 0; i < indices.length; i += 3) {
    const tri = Array.from(indices.slice(i, i + 3), (index) => [
      positions.getX(index),
      -positions.getY(index),
    ])
    for (const side of [-1, 1]) {
      const polygon = clipTriangle(tri, side)
      for (let j = 1; j + 1 < polygon.length; j++) {
        for (const p of [polygon[0], polygon[j], polygon[j + 1]])
          roofPositions.push(p[0], roofY(p), p[1])
      }
    }
  }
  const roofTrim = []
  for (const [ringIndex, ring] of rings.entries()) {
    // 小幅出檐和瓦口厚度跟随外轮廓/天井边界，不给复杂连院补虚构的屋脊。
    const thickness = building.core && building.roofShape !== 'flat' ? 0.16 : 0
    const area = ring.reduce((sum, p, i) => {
      const q = ring[(i + 1) % ring.length]
      return sum + p[0] * q[1] - q[0] * p[1]
    }, 0)
    const direction = (area >= 0 ? 1 : -1) * (ringIndex ? -1 : 1)
    const normals = ring.map((p, i) => {
      const q = ring[(i + 1) % ring.length], dx = q[0] - p[0], dz = q[1] - p[1]
      const length = Math.hypot(dx, dz) || 1
      return [direction * dz / length, -direction * dx / length]
    })
    const overhang = ring.map((p, i) => {
      const a = normals[(i + ring.length - 1) % ring.length], b = normals[i]
      const nx = a[0] + b[0], nz = a[1] + b[1], length = Math.hypot(nx, nz) || 1
      const offset = thickness / Math.max(.5, (nx * b[0] + nz * b[1]) / length)
      return [p[0] + nx / length * offset, p[1] + nz / length * offset]
    })
    const quad = (points, normal) => {
      const [p, q, r] = points
      const u = q.map((v, i) => v - p[i]), v = r.map((n, i) => n - p[i])
      const facing = (u[1] * v[2] - u[2] * v[1]) * normal[0]
        + (u[2] * v[0] - u[0] * v[2]) * normal[1]
        + (u[0] * v[1] - u[1] * v[0]) * normal[2]
      const order = facing >= 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2]
      for (const index of order) roofTrim.push(...points[index])
    }
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i],
        b = ring[(i + 1) % ring.length]
      const chain = [a],
        da = transverse(a) - mid,
        db = transverse(b) - mid
      if (da * db < 0) {
        const t = da / (da - db)
        chain.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t])
      }
      chain.push(b)
      for (let j = 1; j < chain.length; j++) {
        const p = chain[j - 1],
          q = chain[j],
          py = roofY(p),
          qy = roofY(q),
          h = building.height
        gablePositions.push(
          p[0],
          h,
          p[1],
          q[0],
          h,
          q[1],
          q[0],
          qy,
          q[1],
          p[0],
          h,
          p[1],
          q[0],
          qy,
          q[1],
          p[0],
          py,
          p[1],
        )
        edgePositions.push(p[0], py + 0.06, p[1], q[0], qy + 0.06, q[1])
        if (thickness) {
          const next = (i + 1) % ring.length, length = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1
          const extend = (point) => {
            const t = Math.hypot(point[0] - a[0], point[1] - a[1]) / length
            return overhang[i].map((value, axis) => value + (overhang[next][axis] - value) * t)
          }
          const ep = extend(p), eq = extend(q)
          quad([[p[0], py, p[1]], [q[0], qy, q[1]], [eq[0], qy, eq[1]], [ep[0], py, ep[1]]], [0, 1, 0])
          quad([[ep[0], py, ep[1]], [eq[0], qy, eq[1]],
            [eq[0], qy - thickness, eq[1]], [ep[0], py - thickness, ep[1]]], [normals[i][0], 0, normals[i][1]])
        }
      }
    }
  }
  roofPositions.push(...roofTrim)
  const roof = new BufferGeometry().setAttribute(
    'position',
    new Float32BufferAttribute(roofPositions, 3),
  )
  // 屋面纹理坐标随各栋建筑屋脊方向旋转，不改变轮廓或填平天井。
  const roofUV = []
  for (let i = 0; i < roofPositions.length; i += 3) {
    const x = roofPositions[i],
      z = roofPositions[i + 2]
    const scale = building.roofTextureMeters ?? 6
    // 以斜坡实际长度铺瓦，两坡均从屋脊向檐口，避免坡度改变时瓦片被压扁。
    roofUV.push((x * c + z * s) / scale,
      building.core ? Math.abs(-x * s + z * c - mid) * Math.hypot(1, rise / half) / scale : (-x * s + z * c) / scale)
  }
  roof.setAttribute('uv', new Float32BufferAttribute(roofUV, 2))
  roof.computeVertexNormals()
  const gables = new BufferGeometry().setAttribute(
    'position',
    new Float32BufferAttribute(gablePositions, 3),
  )
  gables.computeVertexNormals()
  // 合并前只保留实际使用的属性，避免 ExtrudeGeometry 的 uv 和无 uv 的山墙不兼容。
  walls.deleteAttribute('uv')
  let wallGeometry = mergeGeometries([walls, gables])
  // 每栋墙面按实际高度映射一次粉墙肌理，底部旧痕不会沿楼层重复出现。
  const wallUV = [],
    wallPositions = wallGeometry.attributes.position,
    wallNormals = wallGeometry.attributes.normal
  for (let i = 0; i < wallPositions.count; i++) {
    const u =
      Math.abs(wallNormals.getX(i)) > Math.abs(wallNormals.getZ(i))
        ? wallPositions.getZ(i)
        : wallPositions.getX(i)
    wallUV.push(
      u / (building.wallTextureMeters ?? 4),
      wallPositions.getY(i) / (building.wallTextureMeters ?? building.height + rise + 0.45),
    )
  }
  wallGeometry.setAttribute('uv', new Float32BufferAttribute(wallUV, 2))
  // 御碑亭四面开敞，柱列替代整面外墙，避免把亭内的御碑封进实心房屋。
  if (building.open) {
    wallGeometry.dispose()
    const columns = outer.map(([x, z]) => {
      const column = new CylinderGeometry(0.25, 0.3, building.height, 8)
      column.translate(x, building.height / 2, z)
      return column
    })
    const mergedColumns = mergeGeometries(columns)
    wallGeometry = mergedColumns.toNonIndexed()
    mergedColumns.dispose()
    columns.forEach((column) => column.dispose())
  }
  const edges = new BufferGeometry().setAttribute(
    'position',
    new Float32BufferAttribute(edgePositions, 3),
  )
  // 可选的逐栋颜色随几何合并，旧街区未提供颜色时仍使用原来的材质分组。
  for (const [part, value] of [
    [wallGeometry, building.wallColor],
    [roof, building.roofColor],
  ]) {
    if (!value) continue
    const color = new Color(value)
    const colors = new Float32Array(part.attributes.position.count * 3)
    for (let i = 0; i < colors.length; i += 3) colors.set([color.r, color.g, color.b], i)
    part.setAttribute('color', new Float32BufferAttribute(colors, 3))
  }
  flat.dispose()
  walls.dispose()
  gables.dispose()
  return { walls: wallGeometry, roof, edges }
}

// 沿现有路段中心线等距放灯；交叉路口去重，跳过被建筑占用的落点。
// 灯杆居中、双臂横跨道路，灯位供模型、地面光晕及固定照明共同消费。
export function getStreetLampPlacements(roads, projectedBuildings, origin) {
  const lamps = []
  for (const road of roads.filter(
    (road) =>
      road.lit || ['南后街', '衣锦坊', '文儒坊', '光禄坊', '郎官巷', '宫巷'].includes(road.name),
  )) {
    const points = road.points.map((point) => getWorldPoint(point, origin))
    const spacing = road.name === '南后街' ? 30 : 38
    let carry = 12
    for (let index = 1; index < points.length; index++) {
      const a = points[index - 1],
        b = points[index]
      const length = Math.hypot(b[0] - a[0], b[1] - a[1])
      if (length < 0.01) continue
      const nx = -(b[1] - a[1]) / length,
        nz = (b[0] - a[0]) / length
      for (let distance = carry; distance < length; distance += spacing) {
        const x = a[0] + ((b[0] - a[0]) * distance) / length
        const z = a[1] + ((b[1] - a[1]) * distance) / length
        if (lamps.some((lamp) => Math.hypot(lamp.x - x, lamp.z - z) < 18)) continue
        if (
          projectedBuildings.some(
            (building) =>
              isPointInRing([x, z], building.ring) &&
              !building.holes.some((hole) => isPointInRing([x, z], hole)),
          )
        )
          continue
        lamps.push({ x, z, angle: Math.atan2(-nz, nx) })
      }
      carry = (carry - length) % spacing
      if (carry < 0) carry += spacing
    }
  }
  return lamps
}

// 全部路灯统一为双挑灯，灯罩与金属构件各合并一套几何并实例化复用。
export function createStreetLampGeometries() {
  const frame = [],
    glass = []
  const pole = new CylinderGeometry(0.105, 0.17, 6.2, 8)
  pole.translate(0, 3.1, 0)
  frame.push(pole)
  const foot = new BoxGeometry(0.48, 0.6, 0.48)
  foot.translate(0, 0.3, 0)
  frame.push(foot)
  const finial = new CylinderGeometry(0, 0.2, 0.4, 4)
  finial.translate(0, 6.35, 0)
  frame.push(finial)
  for (const side of [-1, 1]) {
    const x = side * 1.25
    const arm = new BoxGeometry(1.5, 0.14, 0.16)
    arm.translate(side * 0.65, 5.95, 0)
    frame.push(arm)
    const brace = new BoxGeometry(1.2, 0.1, 0.1)
    brace.rotateZ(side * 0.6)
    brace.translate(side * 0.58, 5.58, 0)
    frame.push(brace)
    const stem = new CylinderGeometry(0.06, 0.06, 0.4, 6)
    stem.translate(x, 5.75, 0)
    frame.push(stem)
    const shade = new BoxGeometry(0.68, 0.92, 0.68)
    shade.translate(x, 5.05, 0)
    glass.push(shade)
    for (const dx of [-0.39, 0.39])
      for (const dz of [-0.39, 0.39]) {
        const bar = new BoxGeometry(0.075, 1.08, 0.075)
        bar.translate(x + dx, 5.05, dz)
        frame.push(bar)
      }
    for (const y of [4.5, 5.59]) {
      const rim = new BoxGeometry(0.96, 0.12, 0.96)
      rim.translate(x, y, 0)
      frame.push(rim)
    }
    const cap = new CylinderGeometry(0.12, 0.78, 0.35, 4)
    cap.rotateY(Math.PI / 4)
    cap.translate(x, 5.79, 0)
    frame.push(cap)
    const pendant = new CylinderGeometry(0, 0.13, 0.25, 4)
    pendant.rotateZ(Math.PI)
    pendant.translate(x, 4.32, 0)
    frame.push(pendant)
  }
  const result = { frame: mergeGeometries(frame), glass: mergeGeometries(glass) }
  frame.concat(glass).forEach((g) => g.dispose())
  return result
}

// 一处景点可以对应多块建筑。没有相同来源 ID 时只使用范围包含关系，不再猜测最近房屋。
export function getSiteBuildingBinding(place, buildings, origin) {
  const modeled = buildings.flatMap((building, index) =>
    building.siteId === place.id ? [index] : [],
  )
  if (modeled.length) return { indices: modeled, method: 'model' }
  const indices = buildings.flatMap((building, index) =>
    building.id === place.osmId ? [index] : [],
  )
  if (indices.length) return { indices, method: 'id' }
  const point = getWorldPoint(place.position, origin)
  const inside = buildings.flatMap((building, index) =>
    isPointInRing(
      point,
      building.ring.map((p) => getWorldPoint(p, origin)),
    )
      ? [index]
      : [],
  )
  return { indices: inside, method: inside.length ? 'inside' : 'unmatched' }
}

// 道路按多个独立折线保存，补齐同名分段；历史杨桥巷保留北界东段示意范围。
export function getLaneRoadSegments(place, roads) {
  if (place.name === '杨桥巷') return [place.points]
  const matches = roads.filter((road) => road.name === place.name || road.id === place.roadId)
  return matches.length ? matches.map((road) => road.points) : [place.points]
}

// 逐段铺设带状几何，不跨分段连线，也不使用可能穿过古厝的曲线插值。
export function createLaneHighlightGeometry(segments, origin, width) {
  const positions = []
  for (const segment of segments) {
    const points = segment.map((p) => getWorldPoint(p, origin))
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1],
        b = points[i],
        length = Math.hypot(b[0] - a[0], b[1] - a[1])
      if (length < 0.001) continue
      const nx = ((-(b[1] - a[1]) / length) * width) / 2,
        nz = (((b[0] - a[0]) / length) * width) / 2
      for (const [p, side] of [
        [a, -1],
        [b, -1],
        [b, 1],
        [a, -1],
        [b, 1],
        [a, 1],
      ])
        positions.push(p[0] + nx * side, 0.01, p[1] + nz * side)
    }
  }
  const geometry = new BufferGeometry().setAttribute(
    'position',
    new Float32BufferAttribute(positions, 3),
  )
  geometry.computeVertexNormals()
  return geometry
}

// 小地图始终北朝上，扇形按相机的水平朝向旋转；开角取实际水平视场角。
export function getMiniMapViewSector(position, target, fov, aspect) {
  const dx = target[0] - position[0],
    dz = target[2] - position[2]
  const heading = Math.hypot(dx, dz) < 0.000001 ? -Math.PI / 2 : Math.atan2(dz, dx)
  const half = Math.atan(Math.tan((fov * Math.PI) / 360) * Math.max(0.1, aspect))
  return { heading, start: heading - half, end: heading + half }
}

// 固定灯位的世界空间光照，不读取相机。建筑初始化时计算，游客移动时计算。
export function getStreetLightStrength(position, normal, lamps) {
  let strength = 0
  for (const lamp of lamps.query ? lamps.query(position[0], position[2]) : lamps) {
    const dx = lamp.x - position[0],
      dy = 5.1 - position[1],
      dz = lamp.z - position[2]
    const squared = dx * dx + dy * dy + dz * dz
    if (squared >= 576) continue
    const distance = Math.max(0.1, Math.sqrt(squared))
    const facing = normal
      ? Math.max(0, (normal[0] * dx + normal[1] * dy + normal[2] * dz) / distance)
      : 0.7
    strength += Math.pow(1 - distance / 24, 2) * facing * 2.4
  }
  return Math.min(1.65, strength)
}

// 周期值噪声让一整圈地形首尾连续，同时避免重复的正弦圆丘轮廓。
function sampleMountainNoise(u, frequency, seed) {
  const position = (((u % 1) + 1) % 1) * frequency
  const index = Math.floor(position)
  const fraction = position - index
  const hash = (cell) => {
    let value = Math.imul((cell % frequency) + seed, 374761393)
    value = Math.imul(value ^ (value >>> 13), 1274126177)
    return ((value ^ (value >>> 16)) >>> 0) / 4294967296
  }
  // 保留部分线性坡折，避免每个噪声极值都被平滑成圆顶。
  const blend = fraction * 0.55 + fraction * fraction * (3 - 2 * fraction) * 0.45
  const start = hash(index)
  return start + (hash(index + 1) - start) * blend
}

// 大山脊决定高低，细山脊形成错落峰谷；三层使用不同种子，避免轮廓平行重叠。
export function getInkMountainHeight(u, layer = 0) {
  const seed = 713 + layer * 379
  const broad = sampleMountainNoise(u + layer * 0.17, 9, seed)
  const ridge = sampleMountainNoise(u, 23, seed + 97)
  const detail = sampleMountainNoise(u, 57, seed + 211)
  const serration = 1 - Math.abs(sampleMountainNoise(u, 41, seed + 43) * 2 - 1)
  return Math.max(
    0.08,
    Math.min(
      0.96,
      0.08 +
        Math.pow(broad, 1.5) * 0.4 +
        Math.pow(ridge, 1.35) * 0.4 +
        detail * 0.12 +
        serration * 0.15,
    ),
  )
}

export function getInkMountainVisibility(distance, polarAngle) {
  const smooth = (value) => {
    const t = Math.max(0, Math.min(1, value))
    return t * t * (3 - 2 * t)
  }
  // 全景焦点前移以容纳南侧馆区，控制器距离更短；街道跟拍的百米内近景仍渐隐。
  return smooth((distance - 120) / 300) * smooth((polarAngle - 0.15) / 0.55)
}
