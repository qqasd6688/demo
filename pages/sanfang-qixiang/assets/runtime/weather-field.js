import { DataTexture, FloatType, NearestFilter, RedFormat, Vector4 } from '../vendor/three/build/three.module.min.js'
import { getWorldPoint, isPointInRing } from './geometry.js'

export function weatherRandom(seed = 5489) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return seed / 4294967296
  }
}

// 只在构建时把实际向上三角面栅格化；天井自然留空，不逐帧做射线或额外深度 pass。
export function createWeatherHeightField(meshes, minPoint, maxPoint, size = 1024) {
  const width = maxPoint[0] - minPoint[0], depth = maxPoint[1] - minPoint[1]
  const heights = new Float32Array(size * size), roofs = []
  for (const mesh of meshes) {
    const geometry = mesh.geometry, p = geometry.attributes.position, index = geometry.index
    for (let face = 0; face < (index?.count ?? p.count); face += 3) {
      const ids = [0, 1, 2].map(i => index ? index.getX(face + i) : face + i)
      const [a, b, c] = ids.map(i => [p.getX(i), p.getY(i), p.getZ(i)])
      const ab = b.map((v, i) => v - a[i]), ac = c.map((v, i) => v - a[i])
      const normal = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]]
      const magnitude = Math.hypot(...normal)
      if (magnitude < 1e-7 || normal[1] / magnitude < .35) continue
      if (mesh.userData.weatherRoof) roofs.push({ a, b, c, normal: normal.map(v => v / magnitude), area: normal[1] / 2 })
      const pixels = [a, b, c].map(v => [(v[0] - minPoint[0]) / width * size - .5, (v[2] - minPoint[1]) / depth * size - .5])
      const [pa, pb, pc] = pixels
      const denominator = (pb[1] - pc[1]) * (pa[0] - pc[0]) + (pc[0] - pb[0]) * (pa[1] - pc[1])
      if (Math.abs(denominator) < 1e-8) continue
      const left = Math.max(0, Math.ceil(Math.min(...pixels.map(v => v[0]))))
      const right = Math.min(size - 1, Math.floor(Math.max(...pixels.map(v => v[0]))))
      const top = Math.max(0, Math.ceil(Math.min(...pixels.map(v => v[1]))))
      const bottom = Math.min(size - 1, Math.floor(Math.max(...pixels.map(v => v[1]))))
      for (let z = top; z <= bottom; z++) for (let x = left; x <= right; x++) {
        const u = ((pb[1] - pc[1]) * (x - pc[0]) + (pc[0] - pb[0]) * (z - pc[1])) / denominator
        const v = ((pc[1] - pa[1]) * (x - pc[0]) + (pa[0] - pc[0]) * (z - pc[1])) / denominator
        if (u < -1e-6 || v < -1e-6 || u + v > 1.000001) continue
        const cell = z * size + x
        heights[cell] = Math.max(heights[cell], u * a[1] + v * b[1] + (1 - u - v) * c[1])
      }
    }
  }
  const texture = new DataTexture(heights, size, size, RedFormat, FloatType)
  texture.minFilter = texture.magFilter = NearestFilter
  texture.needsUpdate = true
  const sample = (x, z) => {
    const u = (x - minPoint[0]) / width, v = (z - minPoint[1]) / depth
    if (u < 0 || u >= 1 || v < 0 || v >= 1) return 0
    return heights[Math.floor(v * size) * size + Math.floor(u * size)]
  }
  return { texture, roofs, sample, bounds: new Vector4(minPoint[0], minPoint[1], 1 / width, 1 / depth) }
}

// 按真实三角形面积抽样，不让小碎片得到和整片屋面相同的雨点密度。
function triangleSampler(triangles, random) {
  let total = 0
  const ends = triangles.map(triangle => (total += triangle.area))
  return () => {
    if (!total) return null
    const value = random() * total
    let low = 0, high = ends.length - 1
    while (low < high) { const mid = (low + high) >> 1; if (value < ends[mid]) high = mid; else low = mid + 1 }
    const triangle = triangles[low], root = Math.sqrt(random()), v = random()
    return { point: triangle.a.map((n, i) => n * (1 - root) + triangle.b[i] * root * (1 - v) + triangle.c[i] * root * v), normal: triangle.normal }
  }
}

export function createRainImpacts(world, field, random = weatherRandom(931)) {
  const hits = [], normals = [], kinds = []
  const add = (point, normal, roof) => {
    hits.push(point[0], point[1] + .055, point[2], random())
    normals.push(...normal)
    kinds.push(roof ? 1 : 0, random())
  }
  const geometry = world.streetPaving?.geometry, triangles = []
  if (geometry) {
    const p = geometry.attributes.position
    for (let i = 0; i < p.count; i += 3) {
      const [a, b, c] = [i, i + 1, i + 2].map(id => [p.getX(id), p.getY(id), p.getZ(id)])
      const area = Math.abs((b[0] - a[0]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[0] - a[0])) / 2
      if (area > .001) triangles.push({ a, b, c, area, normal: [0, 1, 0] })
    }
  }
  const roadPoint = triangleSampler(triangles, random)
  for (let i = 0; triangles.length && i < 2100; i++) {
    const hit = roadPoint()
    if (field.sample(hit.point[0], hit.point[2]) < .5) add(hit.point, hit.normal, false)
  }
  if (world.memorial) {
    const ring = world.memorial.boundary.map(p => getWorldPoint(p, world.origin))
    const holes = [...world.memorial.ponds, ...world.memorial.gardens].map(ring => ring.map(p => getWorldPoint(p, world.origin)))
    const xs = ring.map(p => p[0]), zs = ring.map(p => p[1])
    const left = Math.min(...xs), top = Math.min(...zs), width = Math.max(...xs) - left, depth = Math.max(...zs) - top
    for (let i = 0; i < 1100; i++) {
      const p = [left + random() * width, top + random() * depth]
      if (isPointInRing(p, ring) && !holes.some(hole => isPointInRing(p, hole)) && field.sample(...p) < .5)
        add([p[0], .025, p[1]], [0, 1, 0], false)
    }
  }
  const roofPoint = triangleSampler(field.roofs, random)
  for (let i = 0; field.roofs.length && i < 900; i++) {
    const hit = roofPoint()
    add(hit.point, hit.normal, true)
  }
  return { hits: new Float32Array(hits), normals: new Float32Array(normals), kinds: new Float32Array(kinds) }
}
