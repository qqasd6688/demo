import {
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  DoubleSide,
  Float32BufferAttribute,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  RepeatWrapping,
  SRGBColorSpace,
} from '../vendor/three/build/three.module.min.js'
import { mergeGeometries } from '../vendor/three/examples/jsm/utils/BufferGeometryUtils.js'
import {
  getWorldPoint,
  getRoadWidth,
  isPointInRing,
} from './geometry.js'
import { stampBuildingEntrance } from './entrance.js'
import { createPavingTextures, createStreetPavingGeometry } from './paving.js'

// 构建地面、院落、门窗和程序材质；合批建筑的面区间用于准确拾取。
export function paintGround(world) {
  const surface = document.createElement('canvas')
  surface.width = 2048
  surface.height = 2048
  const ctx = surface.getContext('2d'),
    sx = 2048 / world.width,
    sy = 2048 / world.depth
  const toPixel = (coordinate) => {
    const [x, z] = getWorldPoint(coordinate, world.origin)
    return [(x - world.minPoint[0]) * sx, (z - world.minPoint[1]) * sy]
  }
  const trace = (points) => {
    points.forEach((p, i) => {
      const [x, y] = toPixel(p)
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    })
  }
  ctx.fillStyle = world.palette?.ground ?? '#d8d6cf'
  ctx.fillRect(0, 0, 2048, 2048)
  ctx.beginPath()
  trace(world.data.boundary)
  ctx.closePath()
  ctx.fillStyle = world.palette?.surface ?? '#d5d1c7'
  ctx.fill()
  ctx.strokeStyle = world.palette?.edge ?? '#a9a69c'
  ctx.lineWidth = 2
  ctx.setLineDash([8, 7])
  ctx.stroke()
  ctx.setLineDash([])
  // 低对比石板纹理为程序绘制，不加载网络瓦片或图片。
  ctx.strokeStyle = '#514e480b'
  ctx.lineWidth = 1
  for (let y = 0; y < 2048; y += 20) {
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(2048, y)
    ctx.stroke()
    for (let x = ((y / 20) % 2) * 14; x < 2048; x += 28) {
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.lineTo(x, y + 20)
      ctx.stroke()
    }
  }
  for (const ring of world.data.parks) {
    ctx.beginPath()
    trace(ring)
    ctx.closePath()
    ctx.fillStyle = world.palette?.park ?? '#a7ad98'
    ctx.fill()
  }
  for (const area of world.data.landAreas ?? []) {
    if (area.kind !== 'farmland') continue
    ctx.beginPath()
    trace(area.ring)
    ctx.closePath()
    ctx.fillStyle = world.palette?.farmland ?? '#b2b092'
    ctx.fill()
    if (world.buildingStyle === 'rural') {
      // 垄线严格裁切在已有耕地轮廓内，避免在住宅或林地上随机铺农田。
      ctx.save()
      ctx.clip()
      const pixels = area.ring.map(toPixel)
      const xs = pixels.map((p) => p[0]),
        ys = pixels.map((p) => p[1])
      const left = Math.min(...xs),
        right = Math.max(...xs),
        bottom = Math.max(...ys)
      for (let y = Math.min(...ys); y <= bottom; y += 7) {
        ctx.fillStyle = '#607e5b55'
        ctx.fillRect(left, y, right - left, 2.5)
        ctx.fillStyle = '#c1c59a44'
        ctx.fillRect(left, y + 3, right - left, 1)
      }
      ctx.restore()
    }
  }
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  for (const path of world.riverPaths) {
    ctx.beginPath()
    path.points.forEach(([x, z], i) => {
      const px = (x - world.minPoint[0]) * sx,
        py = (z - world.minPoint[1]) * sy
      if (i) ctx.lineTo(px, py)
      else ctx.moveTo(px, py)
    })
    ctx.strokeStyle = world.palette?.edge ?? '#a8afa5'
    ctx.lineWidth = ((world.data.meta.riverWidth ?? 6.2) + 3.3) * sx
    ctx.stroke()
    ctx.strokeStyle = world.palette?.water ?? '#769a95'
    ctx.lineWidth = (world.data.meta.riverWidth ?? 6.2) * sx
    ctx.stroke()
  }
  for (const road of world.data.roads) {
    const roadWidth = getRoadWidth(road)
    ctx.beginPath()
    trace(road.points)
    ctx.strokeStyle = world.palette?.edge ?? '#a5a39b'
    ctx.lineWidth = (roadWidth + 1.5) * sx
    ctx.stroke()
    ctx.strokeStyle =
      world.palette?.road ??
      (road.name === '南后街'
        ? '#c6c4bb'
        : ['primary', 'secondary', 'tertiary'].includes(road.kind)
          ? '#c3c3bf'
          : '#d4d1c8')
    ctx.lineWidth = roadWidth * sx
    ctx.stroke()
    if (world.buildingStyle !== 'rural' && /南后街|坊|巷|澳门路/.test(road.name ?? '')) {
      // 青石板顺街道方向错缝排布，细线在全景自然收敛，近景仍能读出铺装尺度。
      const points = road.points.map(toPixel)
      for (let i = 1; i < points.length; i++) {
        const a = points[i - 1],
          b = points[i]
        const length = Math.hypot(b[0] - a[0], b[1] - a[1])
        ctx.save()
        ctx.translate(...a)
        ctx.rotate(Math.atan2(b[1] - a[1], b[0] - a[0]))
        const width = Math.max(1, (roadWidth - 1.1) * sx),
          slab = 2.4 * sx
        ctx.beginPath()
        ctx.rect(0, -width / 2, length, width)
        ctx.clip()
        ctx.strokeStyle = '#777b703c'
        ctx.lineWidth = 0.55
        for (let row = 0; row < 4; row++) {
          const y = -width / 2 + (row * width) / 3
          ctx.beginPath()
          ctx.moveTo(0, y)
          ctx.lineTo(length, y)
          ctx.stroke()
          if (row === 3) continue
          for (let x = ((row % 2) * slab) / 2; x < length; x += slab) {
            ctx.fillStyle = (Math.floor(x / slab) + row) % 3 === 0 ? '#ffffff0d' : '#4f574b08'
            ctx.fillRect(x, y, slab, width / 3)
            ctx.beginPath()
            ctx.moveTo(x, y)
            ctx.lineTo(x, y + width / 3)
            ctx.stroke()
          }
        }
        ctx.restore()
      }
    }
    if (
      world.buildingStyle === 'rural' &&
      ['motorway', 'primary', 'tertiary'].includes(road.kind)
    ) {
      ctx.strokeStyle = '#edf1da99'
      ctx.lineWidth = Math.max(0.55, sx * 0.15)
      ctx.setLineDash([5 * sx, 5 * sx])
      ctx.stroke()
      ctx.setLineDash([])
    }
  }
  // 地图内容向连续地面柔和过渡，避免矩形贴图边缘再次形成悬浮切片。
  ctx.globalCompositeOperation = 'destination-in'
  for (const end of [
    [2048, 0],
    [0, 2048],
  ]) {
    const fade = ctx.createLinearGradient(0, 0, ...end)
    fade.addColorStop(0, 'rgba(0,0,0,0)')
    fade.addColorStop(0.035, 'rgba(0,0,0,1)')
    fade.addColorStop(0.965, 'rgba(0,0,0,1)')
    fade.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = fade
    ctx.fillRect(0, 0, 2048, 2048)
  }
  ctx.globalCompositeOperation = 'source-over'
  const groundTexture = new CanvasTexture(surface)
  groundTexture.colorSpace = SRGBColorSpace
  groundTexture.anisotropy = Math.min(8, world.renderer.capabilities.getMaxAnisotropy())
  return groundTexture
}

// 参考坊巷实景的材质关系，以可重复的程序纹理表达灰瓦、粉墙与旧木。
// 固定随机种子保持重开一致，原始照片仅作参考，页面离线运行。
export function paintHeritageTextures(world) {
  const result = {}
  let seed = 1729
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return seed / 4294967296
  }
  for (const kind of ['roof', 'wall', 'wood', 'lattice']) {
    const surface = document.createElement('canvas')
    surface.width = surface.height = 512
    const ctx = surface.getContext('2d')
    if (kind === 'roof') {
      ctx.fillStyle = '#494b4a'
      ctx.fillRect(0, 0, 512, 512)
      const tileWidth = 512 / 24
      for (let x = 0; x < 512; x += tileWidth)
        for (let y = 0; y < 512; y += 32) {
          const value = 79 + Math.floor(random() * 22)
          const gradient = ctx.createLinearGradient(x, 0, x + tileWidth, 0)
          gradient.addColorStop(
            0,
            'rgb(' + (value - 8) + ',' + (value - 6) + ',' + (value - 8) + ')',
          )
          gradient.addColorStop(
            0.45,
            'rgb(' + (value + 7) + ',' + (value + 9) + ',' + (value + 6) + ')',
          )
          gradient.addColorStop(
            1,
            'rgb(' + (value - 9) + ',' + (value - 7) + ',' + (value - 6) + ')',
          )
          ctx.fillStyle = gradient
          ctx.fillRect(x + 0.5, y + 0.5, tileWidth - 1, 31.5)
          ctx.strokeStyle = '#24272866'
          ctx.lineWidth = 1.4
          ctx.beginPath()
          ctx.moveTo(x + 1, y + 28)
          ctx.quadraticCurveTo(x + tileWidth / 2, y + 34, x + tileWidth - 1, y + 28)
          ctx.stroke()
          ctx.strokeStyle = '#d1cec438'
          ctx.lineWidth = 1
          ctx.beginPath()
          ctx.moveTo(x + 2, y + 26)
          ctx.quadraticCurveTo(x + tileWidth / 2, y + 31, x + tileWidth - 2, y + 26)
          ctx.stroke()
        }
    } else if (kind === 'wall') {
      ctx.fillStyle = '#f0eee6'
      ctx.fillRect(0, 0, 512, 512)
      const weather = ctx.createLinearGradient(0, 0, 0, 512)
      weather.addColorStop(0, '#918e8208')
      weather.addColorStop(0.7, '#918e8200')
      weather.addColorStop(0.92, '#8f8a7826')
      weather.addColorStop(1, '#68675d50')
      ctx.fillStyle = weather
      ctx.fillRect(0, 0, 512, 512)
      for (let i = 0; i < 50; i++) {
        const x = random() * 512,
          y = 350 + random() * 180,
          r = 4 + random() * 24
        const stain = ctx.createRadialGradient(x, y, 0, x, y, r)
        stain.addColorStop(0, '#817c7010')
        stain.addColorStop(1, '#817c7000')
        ctx.fillStyle = stain
        ctx.fillRect(x - r, y - r, r * 2, r * 2)
      }
    } else if (kind === 'lattice') {
      ctx.fillStyle = '#cbbd98'
      ctx.fillRect(0, 0, 512, 512)
      const shade = ctx.createLinearGradient(0, 0, 512, 512)
      shade.addColorStop(0, '#51422c55')
      shade.addColorStop(0.18, '#ffffff00')
      shade.addColorStop(1, '#9c896044')
      ctx.fillStyle = shade
      ctx.fillRect(0, 0, 512, 512)
      ctx.strokeStyle = '#4b392c'
      ctx.lineWidth = 13
      for (let x = -512; x <= 1024; x += 128) {
        ctx.beginPath()
        ctx.moveTo(x, 0)
        ctx.lineTo(x + 512, 512)
        ctx.stroke()
        ctx.beginPath()
        ctx.moveTo(x, 0)
        ctx.lineTo(x - 512, 512)
        ctx.stroke()
      }
      ctx.lineWidth = 22
      ctx.strokeRect(11, 11, 490, 490)
      ctx.strokeStyle = '#b39a6c'
      ctx.lineWidth = 4
      ctx.strokeRect(26, 26, 460, 460)
    } else {
      ctx.fillStyle = '#554135'
      ctx.fillRect(0, 0, 512, 512)
      for (let x = 0; x < 512; x += 2) {
        ctx.strokeStyle = random() > 0.5 ? '#211b1830' : '#c1a08018'
        ctx.lineWidth = 0.5 + random() * 1.5
        ctx.beginPath()
        ctx.moveTo(x, 0)
        ctx.bezierCurveTo(x + 9, 170, x - 8, 340, x, 512)
        ctx.stroke()
      }
      for (let x = 0; x < 512; x += 128) {
        ctx.fillStyle = '#211c1955'
        ctx.fillRect(x, 0, 3, 512)
      }
    }
    for (let i = 0; i < 18000; i++) {
      ctx.fillStyle = random() > 0.5 ? '#ffffff09' : '#211e1909'
      ctx.fillRect(Math.floor(random() * 512), Math.floor(random() * 512), 1, 1)
    }
    const texture = new CanvasTexture(surface)
    texture.wrapS = texture.wrapT = RepeatWrapping
    texture.colorSpace = SRGBColorSpace
    texture.anisotropy = Math.min(8, world.renderer.capabilities.getMaxAnisotropy())
    result[kind] = texture
  }
  return Object.assign(result, createPavingTextures(Math.min(8, world.renderer.capabilities.getMaxAnisotropy())))
}

// 独立重复纹理保持近景石板清晰；与主地面一起铺开，不把道路当第二批配景落下。
export function buildHeritagePaving(world, textures) {
  const geometry = createStreetPavingGeometry(world.data.roads, world.origin)
  if (!geometry.attributes.position.count) { geometry.dispose(); return }
  const material = new MeshStandardMaterial({
    map: textures.paving,
    bumpMap: textures.pavingDetail,
    roughnessMap: textures.pavingDetail,
    bumpScale: 0.025,
    roughness: 0.94,
    vertexColors: true,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  })
  const mesh = new Mesh(geometry, material)
  mesh.name = 'heritage-stone-paving'
  mesh.receiveShadow = true
  world.scene.add(mesh)
  world.streetPaving = mesh
  world.weatherSurfaces.push({ material, color: material.color.clone(), roughness: 0.94, puddles: true })
}

// 装饰沿建筑外墙合批；村级使用逐层玻璃窗、金属窗框与女儿墙，古建保留原样式。
export function buildArchitecturalDetails(
  world,
  woodTexture,
  entranceCenters,
  latticeTexture = null,
) {
  const rural = world.buildingStyle === 'rural'
  const panels = [],
    doors = [],
    frames = [],
    parapets = []
  world.data.buildings.forEach((building, index) => {
    if (
      (!rural && !building.core) ||
      building.height > 18 ||
      building.open ||
      building.architecture === 'cultural'
    )
      return
    const ring = world.projectedBuildings[index].ring
    for (let i = 1; i < ring.length; i++) {
      const a = ring[i - 1],
        b = ring[i],
        length = Math.hypot(b[0] - a[0], b[1] - a[1])
      if (length < 6) continue
      const ux = (b[0] - a[0]) / length,
        uz = (b[1] - a[1]) / length
      let nx = -uz,
        nz = ux
      if (isPointInRing([(a[0] + b[0]) / 2 + nx * 0.1, (a[1] + b[1]) / 2 + nz * 0.1], ring)) {
        nx = -nx
        nz = -nz
      }
      if (rural && building.roofShape === 'flat') {
        // 平屋顶女儿墙跟随屋面入场，不增加动画或独立生命周期。
        const parapet = new BoxGeometry(length, 0.65, 0.22)
        parapet.rotateY(-Math.atan2(uz, ux))
        parapet.translate((a[0] + b[0]) / 2, building.height + 0.75, (a[1] + b[1]) / 2)
        stampBuildingEntrance(parapet, world, { center: entranceCenters[index], roof: true })
        parapets.push(parapet)
      }
      const count = Math.min(8, Math.floor(length / (building.architecture === 'modern' ? 5.2 : 4)))
      const floors = rural ? Math.max(1, Math.round(building.height / 3.2)) : 1
      const floorHeight = building.height / floors
      for (let j = 0; j < count * floors; j++) {
        const column = j % count
        const floor = Math.floor(j / count)
        const t = (column + 1) / (count + 1),
          x = a[0] + (b[0] - a[0]) * t,
          z = a[1] + (b[1] - a[1]) * t
        const door = floor === 0 && column === Math.floor(count / 2) && length > 10
        const low = rural ? floor * floorHeight + (door ? 0.1 : 0.85) : door ? 0.12 : 1.8,
          high = rural ? floor * floorHeight + Math.min(2.5, floorHeight - 0.3) : door ? 3.5 : 3.6,
          half = rural ? 0.9 : door ? 0.85 : 0.6
        const panel = new PlaneGeometry(half * 2, high - low)
        panel.rotateY(Math.atan2(nx, nz))
        panel.translate(x + nx * 0.07, (low + high) / 2, z + nz * 0.07)
        // 门窗与对应墙片共用枢轴、朝向和落位节奏，飞行中也始终贴在墙面上。
        const entrance = { center: entranceCenters[index], normal: { x: nx, z: nz } }
        stampBuildingEntrance(panel, world, entrance)
        if (door && !rural) doors.push(panel)
        else panels.push(panel)
        const strips = [
          [-half, low, -half, high],
          [half, low, half, high],
          [-half, high, half, high],
          [-half, low, half, low],
          [0, low, 0, high],
        ]
        if (!door && !rural) strips.push([-half, (low + high) / 2, half, (low + high) / 2])
        const framePositions = []
        for (const [u1, y1, u2, y2] of strips)
          framePositions.push(
            x + ux * u1 + nx * 0.09,
            y1,
            z + uz * u1 + nz * 0.09,
            x + ux * u2 + nx * 0.09,
            y2,
            z + uz * u2 + nz * 0.09,
          )
        const frame = new BufferGeometry().setAttribute(
          'position',
          new Float32BufferAttribute(framePositions, 3),
        )
        stampBuildingEntrance(frame, world, entrance)
        frames.push(frame)
      }
    }
  })
  if (panels.length) {
    const mesh = new Mesh(
      mergeGeometries(panels),
      new MeshStandardMaterial({
        color: rural ? '#457b8a' : '#e7d7c2',
        map: rural ? null : (latticeTexture ?? woodTexture),
        bumpMap: rural ? null : (latticeTexture ?? woodTexture),
        emissiveMap: rural ? null : latticeTexture,
        bumpScale: 0.018,
        roughness: rural ? 0.3 : 0.93,
        metalness: rural ? 0.15 : 0,
        side: DoubleSide,
      }),
    )
    panels.forEach((g) => g.dispose())
    world.windowMaterial = mesh.material
    world.scene.add(mesh)
  }
  if (doors.length) {
    const mesh = new Mesh(
      mergeGeometries(doors),
      new MeshStandardMaterial({
        color: '#bca98c',
        map: woodTexture,
        bumpMap: woodTexture,
        bumpScale: 0.035,
        roughness: 0.92,
        side: DoubleSide,
      }),
    )
    mesh.name = 'heritage-wood-doors'
    doors.forEach((geometry) => geometry.dispose())
    mesh.receiveShadow = true
    world.scene.add(mesh)
    world.streetLitStaticMeshes?.push(mesh)
  }
  if (frames.length) {
    world.scene.add(
      new LineSegments(
        mergeGeometries(frames),
        new LineBasicMaterial({ color: rural ? '#d8e7e8' : '#a18b6d' }),
      ),
    )
    frames.forEach((geometry) => geometry.dispose())
  }
  if (parapets.length) {
    const mesh = new Mesh(
      mergeGeometries(parapets),
      new MeshStandardMaterial({ color: '#e5ece7', roughness: 0.85 }),
    )
    parapets.forEach((geometry) => geometry.dispose())
    mesh.castShadow = mesh.receiveShadow = true
    world.scene.add(mesh)
  }
}
