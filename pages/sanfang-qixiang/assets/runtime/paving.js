import {
  BufferGeometry, DataTexture, Float32BufferAttribute, LinearFilter,
  LinearMipmapLinearFilter, RepeatWrapping, SRGBColorSpace,
} from '../vendor/three/build/three.module.min.js'
import { getRoadWidth, getWorldPoint } from './geometry.js'

// 一张 4×8 错缝石板纹理覆盖 2.4m：每块约 0.6×0.3m，仅为统一视觉尺度。
export const PAVING_REPEAT_METERS = 2.4

export function createPavingTextures(anisotropy = 1) {
  const size = 512, color = new Uint8Array(size * size * 4), detail = new Uint8Array(color.length)
  const hash = (x, y) => {
    let value = Math.imul(x + 37, 374761393) ^ Math.imul(y + 91, 668265263)
    value = Math.imul(value ^ (value >>> 13), 1274126177)
    return ((value ^ (value >>> 16)) >>> 0) / 4294967295
  }
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const row = Math.floor(y / 64), shifted = (x + (row % 2) * 64) % size
    const column = Math.floor(shifted / 128), u = shifted % 128, v = y % 64
    const edge = Math.min(u, 127 - u, v, 63 - v)
    const bevel = Math.min(1, Math.max(0, (edge - 0.7) / 2.3))
    const stone = hash(column, row), grain = hash(x, y)
    const mineral = Math.sin(x * Math.PI / 32 + Math.sin(y * Math.PI / 64)) * 2.2
      + Math.cos(y * Math.PI / 16 + Math.sin(x * Math.PI / 128)) * 1.5
    const value = 102 * (1 - bevel) + (151 + (stone - .5) * 20 + mineral + (grain - .5) * 7) * bevel
    const offset = (y * size + x) * 4
    color.set([value - 3, value + 1, value + 2, 255], offset)
    // R 是毫米级接缝/倒角高度，G 是粗糙度；颜色深浅不再直接变成凹凸。
    const pit = grain > .975 ? .08 : 0
    detail.set([
      (0.25 + bevel * (0.46 + (grain - .5) * .024 - pit)) * 255,
      (0.99 * (1 - bevel) + (0.82 + stone * .09 + grain * .025) * bevel) * 255,
      0, 255,
    ], offset)
  }
  const makeTexture = (data, isColor) => {
    const texture = new DataTexture(data, size, size)
    if (isColor) texture.colorSpace = SRGBColorSpace
    texture.wrapS = texture.wrapT = RepeatWrapping
    texture.magFilter = LinearFilter
    texture.minFilter = LinearMipmapLinearFilter
    texture.generateMipmaps = true
    texture.anisotropy = anisotropy
    texture.needsUpdate = true
    return texture
  }
  return { paving: makeTexture(color, true), pavingDetail: makeTexture(detail, false) }
}

const cross = (a, b, p) => (b.x - a.x) * (p.z - a.z) - (b.z - a.z) * (p.x - a.x)
const bounds = (polygon) => ({
  minX: Math.min(...polygon.map(p => p.x)), maxX: Math.max(...polygon.map(p => p.x)),
  minZ: Math.min(...polygon.map(p => p.z)), maxZ: Math.max(...polygon.map(p => p.z)),
})
const overlaps = (a, b) => a.minX < b.maxX && a.maxX > b.minX && a.minZ < b.maxZ && a.maxZ > b.minZ

// 半平面裁切同时插值 UV。低优先级支巷在主街边界收口，不叠放两张共面贴图。
function clip(polygon, a, b, inside) {
  const result = [], sign = inside ? 1 : -1
  for (let i = 0; i < polygon.length; i++) {
    const p = polygon[i], q = polygon[(i + 1) % polygon.length]
    const dp = cross(a, b, p) * sign, dq = cross(a, b, q) * sign
    if (dp >= -1e-7) result.push(p)
    if ((dp > 0 && dq < 0) || (dp < 0 && dq > 0)) {
      const t = dp / (dp - dq), point = {}
      for (const key of Object.keys(p)) point[key] = p[key] + (q[key] - p[key]) * t
      result.push(point)
    }
  }
  return result
}

function subtract(polygon, cutter) {
  const outside = []
  let remaining = polygon
  for (let i = 0; i < cutter.length && remaining.length >= 3; i++) {
    const a = cutter[i], b = cutter[(i + 1) % cutter.length]
    const part = clip(remaining, a, b, false)
    if (part.length >= 3) outside.push(part)
    remaining = clip(remaining, a, b, true)
  }
  return outside
}

function pathSections(points, width) {
  const clean = points.filter((p, i) => !i || Math.hypot(p[0] - points[i - 1][0], p[1] - points[i - 1][1]) > .001)
  if (clean.length < 2) return []
  const directions = clean.slice(1).map((b, i) => {
    const dx = b[0] - clean[i][0], dz = b[1] - clean[i][1], length = Math.hypot(dx, dz)
    return { x: dx / length, z: dz / length, length }
  })
  let distance = 0
  return clean.map(([x, z], i) => {
    const a = directions[Math.max(0, i - 1)], b = directions[Math.min(i, directions.length - 1)]
    const nx = -a.z - b.z, nz = a.x + b.x, size = Math.hypot(nx, nz)
    const normal = size > .01 ? [nx / size, nz / size] : [-a.z, a.x]
    const miter = Math.min(2, 1 / Math.max(.5, -a.z * normal[0] + a.x * normal[1]))
    if (i) distance += a.length
    return { x, z, distance, nx: normal[0] * miter, nz: normal[1] * miter, half: width / 2 }
  })
}

// 用道路弧长 + 横向米制坐标铺装；相邻折线共用截面，转弯没有三角缺口。
export function createStreetPavingGeometry(roads, origin) {
  const paths = roads.filter(road => /南后街|坊|巷|澳门路/.test(road.name ?? ''))
    .sort((a, b) => Number(b.name === '南后街') - Number(a.name === '南后街') || getRoadWidth(b) - getRoadWidth(a))
    .map(road => pathSections(road.points.map(p => getWorldPoint(p, origin)), Math.max(1, getRoadWidth(road) - .6)))
  const segments = []
  paths.forEach((sections, path) => {
    for (let i = 1; i < sections.length; i++) {
      const a = sections[i - 1], b = sections[i]
      const point = (section, lateral) => ({
        x: section.x + section.nx * lateral, z: section.z + section.nz * lateral,
        y: .012, u: section.distance / PAVING_REPEAT_METERS, v: lateral / PAVING_REPEAT_METERS,
      })
      // 逆时针的 XZ 多边形供裁切；输出三角形再翻成朝上的表面。
      const polygon = [point(a, -a.half), point(b, -b.half), point(b, b.half), point(a, a.half)]
      segments.push({ path, a, b, point, polygon, bounds: bounds(polygon) })
    }
  })
  const positions = [], uvs = [], colors = []
  const emit = (polygon, tint) => {
    for (let i = 1; i + 1 < polygon.length; i++) {
      if (Math.abs(cross(polygon[0], polygon[i], polygon[i + 1])) < 1e-8) continue
      for (const p of [polygon[0], polygon[i + 1], polygon[i]]) {
        positions.push(p.x, p.y, p.z)
        uvs.push(p.u, p.v)
        colors.push(tint, tint, tint)
      }
    }
  }
  const cut = (polygon, candidates) => {
    let pieces = [polygon]
    for (const other of candidates) {
      pieces = pieces.flatMap(piece => overlaps(bounds(piece), other.bounds) ? subtract(piece, other.polygon) : [piece])
      if (!pieces.length) break
    }
    return pieces
  }
  for (const segment of segments) {
    const others = segments.filter(other => other.path !== segment.path && overlaps(segment.bounds, other.bounds))
    const borders = []
    // 两侧是一条窄石质收边，路口让开连接支巷，避免出现横挡路面的边线。
    for (const side of [-1, 1]) {
      const { a, b, point } = segment, outer = side * a.half, inner = side * (a.half - .22)
      const border = [point(a, Math.min(inner, outer)), point(b, Math.min(inner, outer)),
        point(b, Math.max(inner, outer)), point(a, Math.max(inner, outer))]
      border.forEach(p => { p.v = .02 + (p.v * PAVING_REPEAT_METERS - Math.min(inner, outer)) / PAVING_REPEAT_METERS })
      borders.push(...cut(border, others))
    }
    // 收边和主铺装在同一平面精确拼接，远景也不会因深度精度产生闪烁。
    const cutters = [...others.filter(other => other.path < segment.path),
      ...borders.map(polygon => ({ polygon, bounds: bounds(polygon) }))]
    for (const polygon of cut(segment.polygon, cutters)) emit(polygon, 1)
    for (const polygon of borders) emit(polygon, .78)
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2))
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3))
  geometry.computeVertexNormals()
  return geometry
}
