import {
  BoxGeometry,
  CanvasTexture,
  DoubleSide,
  Mesh,
  MeshStandardMaterial,
  Shape,
  ShapeGeometry,
  SRGBColorSpace,
  Vector2,
} from '../vendor/three/build/three.module.min.js'
import { mergeGeometries } from '../vendor/three/examples/jsm/utils/BufferGeometryUtils.js'
import { createBuildingGeometries, getWorldPoint } from './geometry.js'
import { PAVING_REPEAT_METERS } from './paving.js'

// 补建馆区的庭园、池岸和入口；建筑主体仍走统一合批、拾取与高亮链路。
// 全部资源加入场景，由运行时已有 dispose 统一回收，不增加循环或网络请求。
export function buildMemorialGrounds(world, textures) {
  const memorial = world.memorial
  const project = (p) => getWorldPoint(p, world.origin)
  const stone = new MeshStandardMaterial({ color: '#c8c3b6', roughness: 0.95 })
  const plaster = new MeshStandardMaterial({ color: '#e9e4d7', roughness: 1 })
  const tile = new MeshStandardMaterial({ color: '#b8b9b3', map: textures.roof, roughness: 1 })
  const wood = new MeshStandardMaterial({ color: '#655442', roughness: 0.9 })
  const garden = new MeshStandardMaterial({ color: '#a4ac90', roughness: 1 })
  const paving = new MeshStandardMaterial({
    map: textures.paving, bumpMap: textures.pavingDetail, roughnessMap: textures.pavingDetail,
    bumpScale: 0.025, roughness: 0.95,
  })
  world.weatherSurfaces.push({ material: paving, color: paving.color.clone(), roughness: 0.95, puddles: true })
  for (const material of [stone, tile, garden])
    world.weatherSurfaces.push({ material, color: material.color.clone(), roughness: material.roughness })
  // 主地面是带深度偏移的透明纹理；庭园覆盖层需更靠前，避免斜视时被旧地面盖白。
  for (const material of [stone, garden, paving]) {
    material.polygonOffset = true
    material.polygonOffsetFactor = -3
    material.polygonOffsetUnits = -3
  }
  const walls = [],
    caps = [],
    banks = []
  const surface = (ring, y, material) => {
    const shape = new Shape(
      ring.map((p) => {
        const [x, z] = project(p)
        return new Vector2(x, -z)
      }),
    )
    const mesh = new Mesh(new ShapeGeometry(shape), material)
    if (material === paving) {
      const uv = mesh.geometry.attributes.uv
      for (let i = 0; i < uv.count; i++)
        uv.setXY(i, uv.getX(i) / PAVING_REPEAT_METERS, uv.getY(i) / PAVING_REPEAT_METERS)
    }
    mesh.rotation.x = -Math.PI / 2
    mesh.position.y = y
    mesh.receiveShadow = true
    world.scene.add(mesh)
  }
  const bar = (a, b, width, height, y, output) => {
    const length = Math.hypot(b[0] - a[0], b[1] - a[1])
    const geometry = new BoxGeometry(length, height, width)
    geometry.rotateY(-Math.atan2(b[1] - a[1], b[0] - a[0]))
    geometry.translate((a[0] + b[0]) / 2, y, (a[1] + b[1]) / 2)
    output.push(geometry)
  }
  surface(memorial.boundary, 0.025, paving)
  memorial.gardens.forEach((ring) => surface(ring, 0.05, garden))
  memorial.ponds.forEach((ring) => {
    // 水面由 river.js 与河道合批，池岸仍保留独立石质结构。
    const points = ring.map(project)
    points.forEach((a, i) => bar(a, points[(i + 1) % points.length], 0.65, 0.45, 0.24, banks))
  })
  const boundary = memorial.boundary.map(project)
  for (let i = 1; i < boundary.length; i++) {
    const a = [...boundary[i - 1]],
      b = [...boundary[i]]
    const length = Math.hypot(b[0] - a[0], b[1] - a[1])
    // OSM 主入口和南出口两侧留缺口，围墙不横挡出入口。
    const openingStart = i === 10 || i === 14
    const openingEnd = i === 9 || i === 13
    if (openingStart || openingEnd) {
      const fraction = Math.min(0.45, 4 / length)
      const point = openingStart ? a : b,
        other = openingStart ? b : a
      point[0] += (other[0] - point[0]) * fraction
      point[1] += (other[1] - point[1]) * fraction
    }
    bar(a, b, 0.5, 2, 1, walls)
    bar(a, b, 0.72, 0.22, 2.1, caps)
  }
  const [a, b] = memorial.entrance.map(project)
  const length = Math.hypot(b[0] - a[0], b[1] - a[1])
  const nx = -(b[1] - a[1]) / length,
    nz = (b[0] - a[0]) / length
  const posts = []
  for (const p of [a, b]) {
    const geometry = new BoxGeometry(0.55, 5.8, 0.55)
    geometry.translate(p[0], 2.9, p[1])
    posts.push(geometry)
  }
  bar(a, b, 1.8, 0.8, 5.4, posts)
  const [lon, lat] = world.origin
  const ring = [
    [a[0] + nx * 1.6, a[1] + nz * 1.6],
    [b[0] + nx * 1.6, b[1] + nz * 1.6],
    [b[0] - nx * 1.6, b[1] - nz * 1.6],
    [a[0] - nx * 1.6, a[1] - nz * 1.6],
  ].map(([x, z]) => [
    lon + x / (111319.49079327358 * Math.cos((lat * Math.PI) / 180)),
    lat - z / 111319.49079327358,
  ])
  ring.push(ring[0])
  const roof = createBuildingGeometries({ ring, holes: [], core: true, height: 5.8 }, world.origin)
  roof.walls.dispose()
  roof.edges.dispose()
  const gate = new Mesh(roof.roof, tile)
  gate.castShadow = true
  world.scene.add(gate)
  const plaqueCanvas = document.createElement('canvas')
  plaqueCanvas.width = 512
  plaqueCanvas.height = 128
  const ctx = plaqueCanvas.getContext('2d')
  ctx.fillStyle = '#ded5bc'
  ctx.fillRect(0, 0, 512, 128)
  ctx.fillStyle = '#493f30'
  ctx.font = '600 68px serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('林文忠公祠', 256, 69)
  const plaqueTexture = new CanvasTexture(plaqueCanvas)
  plaqueTexture.colorSpace = SRGBColorSpace
  const plaque = new Mesh(
    new BoxGeometry(3.8, 0.95, 0.07),
    new MeshStandardMaterial({ map: plaqueTexture, side: DoubleSide, roughness: 1 }),
  )
  plaque.rotation.y = Math.atan2(nx, nz)
  plaque.position.set((a[0] + b[0]) / 2 + nx * 0.98, 5.4, (a[1] + b[1]) / 2 + nz * 0.98)
  world.scene.add(plaque)
  const [sx, sz] = project(memorial.stele)
  for (const [x, z] of [
    [-1.2, 0.8],
    [1.2, 0.8],
    [0, -0.9],
  ]) {
    const stele = new BoxGeometry(0.9, 2.8, 0.35)
    stele.translate(sx + x, 1.4, sz + z)
    banks.push(stele)
  }
  for (const [parts, material] of [
    [walls, plaster],
    [caps, tile],
    [banks, stone],
    [posts, wood],
  ]) {
    const mesh = new Mesh(mergeGeometries(parts), material)
    parts.forEach((part) => part.dispose())
    mesh.castShadow = true
    mesh.receiveShadow = true
    world.scene.add(mesh)
  }
}
