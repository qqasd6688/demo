import {
  BufferGeometry,
  CatmullRomCurve3,
  DataTexture,
  RGBAFormat,
  UnsignedByteType,
  LinearFilter,
  LinearMipmapLinearFilter,
  Float32BufferAttribute,
  RepeatWrapping,
  ShapeUtils,
  Vector2,
  Vector3,
} from '../vendor/three/build/three.module.min.js'
import { getWorldPoint } from './geometry.js'

// 保留实际河道、桥梁缺口与法线纹理的数据和几何算法。
// 沿原河道中心线作柔和插值，所有水面和底图岸线共用同一组采样点。
export function getRiverSurfacePaths(lines, origin) {
  return lines
    .filter((line) => line.length > 1)
    .map((line) => {
      const controls = line.map((p) => {
        const [x, z] = getWorldPoint(p, origin)
        return new Vector3(x, 0, z)
      })
      const curve = new CatmullRomCurve3(controls, false, 'centripetal')
      const points = curve
        .getSpacedPoints(Math.max(8, Math.ceil(curve.getLength() / 1.5)))
        .map((p) => [p.x, p.z])
      const distances = [0]
      for (let i = 1; i < points.length; i++)
        distances.push(
          distances.at(-1) +
            Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]),
        )
      return { points, distances }
    })
}

export function createRiverSurfaceGeometry(paths, bridges = [], width = 6.2) {
  const positions = [],
    uv = [],
    flows = []
  const onBridge = (point) =>
    bridges.some((bridge) => {
      for (let i = 1; i < bridge.points.length; i++) {
        const a = bridge.points[i - 1],
          b = bridge.points[i],
          dx = b[0] - a[0],
          dz = b[1] - a[1],
          length = dx * dx + dz * dz
        if (!length) continue
        const t = Math.max(
          0,
          Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dz) / length),
        )
        if (Math.hypot(point[0] - a[0] - dx * t, point[1] - a[1] - dz * t) < bridge.width / 2 + 0.8)
          return true
      }
      return false
    })
  for (const path of paths) {
    const { points, distances } = path
    const vertex = (index, side) => {
      const before = points[Math.max(0, index - 1)],
        after = points[Math.min(points.length - 1, index + 1)]
      const dx = after[0] - before[0],
        dz = after[1] - before[1],
        length = Math.max(0.001, Math.hypot(dx, dz))
      positions.push(
        points[index][0] - (((dz / length) * width) / 2) * side,
        0.045,
        points[index][1] + (((dx / length) * width) / 2) * side,
      )
      uv.push((side + 1) / 2, distances[index])
      flows.push(dx / length, dz / length)
    }
    for (let i = 1; i < points.length; i++) {
      if (onBridge([(points[i][0] + points[i - 1][0]) / 2, (points[i][1] + points[i - 1][1]) / 2]))
        continue
      for (const triangle of [
        [
          [i - 1, -1],
          [i, 1],
          [i, -1],
        ],
        [
          [i - 1, -1],
          [i - 1, 1],
          [i, 1],
        ],
      ]) {
        const start = positions.length
        for (const [index, side] of triangle) vertex(index, side)
        const abx = positions[start + 3] - positions[start],
          abz = positions[start + 5] - positions[start + 2],
          acx = positions[start + 6] - positions[start],
          acz = positions[start + 8] - positions[start + 2]
        // 急弯内侧折回的小三角形已被相邻面覆盖，舍弃以避免共面重叠。
        if (abz * acx - abx * acz <= 0.000001) {
          positions.length = start
          uv.length = flows.length = (start / 3) * 2
        }
      }
    }
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new Float32BufferAttribute(uv, 2))
  geometry.setAttribute('flowDirection', new Float32BufferAttribute(flows, 2))
  geometry.setAttribute('waterProfile', new Float32BufferAttribute(new Float32Array(uv.length), 2))
  geometry.computeVertexNormals()
  return geometry
}

// 池塘与河道共用水材质。细分原始三角形后烘焙离岸距离，凹形池岸保持原样，
// 内部顶点也能表达深浅；只在初始化计算，不增加每帧 CPU 工作。
export function createPondSurfaceGeometry(rings) {
  const positions = [],
    uv = [],
    flows = [],
    profiles = []
  for (const ring of rings) {
    const points = ring.map(([x, z]) => new Vector2(x, z))
    if (points.length > 1 && points[0].equals(points.at(-1))) points.pop()
    if (points.length < 3) continue
    const shoreDistance = (p) => {
      let distance = Infinity
      for (let i = 0; i < points.length; i++) {
        const a = points[i],
          b = points[(i + 1) % points.length],
          dx = b.x - a.x,
          dz = b.y - a.y
        const t = Math.max(
          0,
          Math.min(
            1,
            ((p.x - a.x) * dx + (p.y - a.y) * dz) / Math.max(dx * dx + dz * dz, 0.000001),
          ),
        )
        distance = Math.min(distance, Math.hypot(p.x - a.x - dx * t, p.y - a.y - dz * t))
      }
      return distance
    }
    const triangle = (a, b, c, level = 0) => {
      if (level < 6 && Math.max(a.distanceTo(b), b.distanceTo(c), c.distanceTo(a)) > 2.5) {
        const ab = a.clone().add(b).multiplyScalar(0.5),
          bc = b.clone().add(c).multiplyScalar(0.5),
          ca = c.clone().add(a).multiplyScalar(0.5)
        triangle(a, ab, ca, level + 1)
        triangle(ab, b, bc, level + 1)
        triangle(ca, bc, c, level + 1)
        triangle(ab, bc, ca, level + 1)
        return
      }
      // XZ 的正面朝上，保持与河面相同绕序。
      const vertices =
        (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x) > 0 ? [a, c, b] : [a, b, c]
      for (const p of vertices) {
        positions.push(p.x, 0.07, p.y)
        uv.push(p.x, p.y)
        flows.push(0, 1)
        profiles.push(1, shoreDistance(p))
      }
    }
    for (const [a, b, c] of ShapeUtils.triangulateShape(points, []))
      triangle(points[a], points[b], points[c])
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new Float32BufferAttribute(uv, 2))
  geometry.setAttribute('flowDirection', new Float32BufferAttribute(flows, 2))
  geometry.setAttribute('waterProfile', new Float32BufferAttribute(profiles, 2))
  geometry.computeVertexNormals()
  return geometry
}

// 平铺的不规则水波法线。周期噪声保证纹理边缘连续，避免规则斜线和接缝。
export function createRiverNormalTexture(size = 128, seed = 3187) {
  const hash = (x, y, period) => {
    x = ((x % period) + period) % period
    y = ((y % period) + period) % period
    let value = Math.imul(x + seed, 374761393) ^ Math.imul(y + seed, 668265263)
    value = Math.imul(value ^ (value >>> 13), 1274126177)
    return ((value ^ (value >>> 16)) >>> 0) / 4294967296
  }
  const noise = (u, v, period) => {
    const x = u * period,
      y = v * period,
      ix = Math.floor(x),
      iy = Math.floor(y)
    let fx = x - ix,
      fy = y - iy
    fx = fx * fx * (3 - 2 * fx)
    fy = fy * fy * (3 - 2 * fy)
    return (
      (hash(ix, iy, period) * (1 - fx) + hash(ix + 1, iy, period) * fx) * (1 - fy) +
      (hash(ix, iy + 1, period) * (1 - fx) + hash(ix + 1, iy + 1, period) * fx) * fy
    )
  }
  const heights = new Float32Array(size * size),
    pixels = new Uint8Array(size * size * 4)
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++)
      heights[y * size + x] =
        noise(x / size, y / size, 8) * 0.6 +
        noise(x / size, y / size, 16) * 0.28 +
        noise(x / size, y / size, 32) * 0.12
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const dx =
        (heights[y * size + ((x + 1) % size)] - heights[y * size + ((x + size - 1) % size)]) * 2.7
      const dy =
        (heights[((y + 1) % size) * size + x] - heights[((y + size - 1) % size) * size + x]) * 2.7
      const length = Math.hypot(dx, dy, 1),
        index = (y * size + x) * 4
      pixels[index] = Math.round(((-0.5 * dx) / length + 0.5) * 255)
      pixels[index + 1] = Math.round(((-0.5 * dy) / length + 0.5) * 255)
      pixels[index + 2] = Math.round((0.5 / length + 0.5) * 255)
      pixels[index + 3] = 255
    }
  const texture = new DataTexture(pixels, size, size, RGBAFormat, UnsignedByteType)
  texture.wrapS = texture.wrapT = RepeatWrapping
  texture.magFilter = LinearFilter
  texture.minFilter = LinearMipmapLinearFilter
  texture.generateMipmaps = true
  texture.needsUpdate = true
  return texture
}
