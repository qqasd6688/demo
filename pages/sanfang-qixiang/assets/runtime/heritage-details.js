import {
  BoxGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
  IcosahedronGeometry,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  RingGeometry,
  SRGBColorSpace,
  TorusGeometry,
} from '../vendor/three/build/three.module.min.js'
import { mergeGeometries, mergeVertices } from '../vendor/three/examples/jsm/utils/BufferGeometryUtils.js'
import { getRoadWidth, getWorldPoint, isPointInRing } from './geometry.js'
import { stampBuildingEntrance } from './entrance.js'
import { createSaddleGable, createEaveTiles, createPottedLeaves } from './heritage-models.js'

// 只装饰面向坊巷的外立面和馆区院落，避免把看不见的房屋背面也堆满模型。
// 坐标、朝向来自现有轮廓；招牌是主题陈设，不代表真实商铺的位置。
export function getHeritageFacades(world) {
  const segments = world.data.roads
    .filter((road) => /南后街|坊|巷|澳门路/.test(road.name ?? ''))
    .flatMap((road) => {
      const points = road.points.map((p) => getWorldPoint(p, world.origin))
      return points.slice(1).map((b, i) => ({
        a: points[i],
        b,
        width: getRoadWidth(road),
        main: road.name === '南后街',
      }))
    })
    .sort((a, b) => Number(b.main) - Number(a.main))
  const facades = []
  world.data.buildings.forEach((building, index) => {
    if (!building.core || building.height > 13 || building.open) return
    const ring = world.projectedBuildings[index].ring
    for (let i = 1; i < ring.length; i++) {
      const a = ring[i - 1],
        b = ring[i]
      const length = Math.hypot(b[0] - a[0], b[1] - a[1])
      if (length < 6) continue
      const ux = (b[0] - a[0]) / length,
        uz = (b[1] - a[1]) / length
      const x = (a[0] + b[0]) / 2,
        z = (a[1] + b[1]) / 2
      let nx = -uz,
        nz = ux
      if (isPointInRing([x + nx * 0.2, z + nz * 0.2], ring)) {
        nx = -nx
        nz = -nz
      }
      // 相邻建筑贴墙处不加门头；馆区保留真实院落之间的空隙。
      if (
        world.projectedBuildings.some(
          (other, j) =>
            j !== index &&
            isPointInRing([x + nx * 0.7, z + nz * 0.7], other.ring) &&
            !other.holes.some((hole) => isPointInRing([x + nx * 0.7, z + nz * 0.7], hole)),
        )
      )
        continue
      const street = segments.find(({ a: start, b: end, width }) => {
        const dx = end[0] - start[0],
          dz = end[1] - start[1]
        const t = Math.max(
          0,
          Math.min(1, ((x - start[0]) * dx + (z - start[1]) * dz) / (dx * dx + dz * dz || 1)),
        )
        const rx = start[0] + dx * t - x,
          rz = start[1] + dz * t - z
        return rx * nx + rz * nz > 0.2 && Math.hypot(rx, rz) < width / 2 + 6
      })
      if (street || building.siteId === 'linzexu')
        facades.push({
          index,
          x,
          z,
          ux,
          uz,
          nx,
          nz,
          length,
          street: Boolean(street),
          main: street?.main ?? false,
        })
    }
  })
  // 有限的招牌与街边陈设优先落在游览主街，不因原始 OSM 排序耗在偏巷。
  return facades.sort((a, b) => Number(b.main) - Number(a.main))
}

function createSignTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = 1024
  canvas.height = 512
  const ctx = canvas.getContext('2d')
  ;[
    '茉莉茶香',
    '坊巷书香',
    '脱胎漆艺',
    '寿山石艺',
    '纸伞手作',
    '闽味小食',
    '古厝雅集',
    '花窗木作',
  ].forEach((label, i) => {
    const x = (i % 4) * 256,
      y = Math.floor(i / 4) * 256
    ctx.fillStyle = i % 3 === 0 ? '#50372e' : '#3d4039'
    ctx.fillRect(x, y, 256, 256)
    ctx.strokeStyle = '#9c8460'
    ctx.lineWidth = 3
    ctx.strokeRect(x + 12, y + 73, 232, 110)
    ctx.fillStyle = '#d8c29a'
    ctx.font = '600 44px "KaiTi", "STKaiti", serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(label, x + 128, y + 130, 214)
  })
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  return texture
}

// 两批顶点色模型 + 一张招牌图集；不增加灯光、帧循环或每栋房屋独立材质。
export function buildHeritageDetails(world, entranceCenters) {
  if (world.buildingStyle === 'rural') return
  const facades = getHeritageFacades(world)
  const architecture = [],
    props = [],
    signs = []
  const counts = {
    facades: facades.length,
    signs: 0,
    planters: 0,
    benches: 0,
    ridges: 0,
    gardenClusters: 0,
    gables: 0,
    tiledEaves: 0,
    framedWindows: 0,
    stoneCourses: 0,
  }
  const colors = {
    stone: '#a6a496',
    wood: '#574335',
    tile: '#53564f',
    plaster: '#ece7da',
    pot: '#84715b',
    soil: '#514d3f',
    leaf: '#61704b',
    brass: '#a08a57',
  }
  let frame, center
  const place = (geometry, color, batch = architecture, roof = false) => {
    // 局部 X 沿墙，Z 朝墙外；镜像朝向用逐点变换，法线随同变换。
    for (const name of ['position', 'normal']) {
      const attribute = geometry.attributes[name]
      for (let i = 0; i < attribute.count; i++) {
        const x = attribute.getX(i),
          z = attribute.getZ(i)
        attribute.setXYZ(
          i,
          x * frame.ux + z * frame.nx + (name === 'position' ? frame.x : 0),
          attribute.getY(i),
          x * frame.uz + z * frame.nz + (name === 'position' ? frame.z : 0),
        )
      }
    }
    // 反射基底需要反转三角形顺序，避免背面剔除让某些朝向的细节消失。
    const part = geometry.index ? geometry.toNonIndexed() : geometry
    if (part !== geometry) geometry.dispose()
    if (frame.ux * frame.nz - frame.uz * frame.nx < 0) {
      for (const attribute of Object.values(part.attributes)) {
        for (let i = 0; i < attribute.count; i += 3) {
          for (let k = 0; k < attribute.itemSize; k++) {
            const a = (i + 1) * attribute.itemSize + k,
              b = (i + 2) * attribute.itemSize + k
            const value = attribute.array[a]
            attribute.array[a] = attribute.array[b]
            attribute.array[b] = value
          }
        }
      }
    }
    if (batch !== signs && !part.attributes.color) {
      const c = new Color(colors[color] ?? color)
      const values = new Float32Array(part.attributes.position.count * 3)
      for (let i = 0; i < values.length; i += 3) values.set([c.r, c.g, c.b], i)
      part.setAttribute('color', new Float32BufferAttribute(values, 3))
    }
    if (batch !== signs) part.deleteAttribute('uv')
    if (batch !== props)
      stampBuildingEntrance(part, world, { center, normal: { x: frame.nx, z: frame.nz }, roof })
    batch.push(part)
  }
  const box = (x, y, z, w, h, d, color, batch = architecture, roof = false) => {
    const geometry = new BoxGeometry(w, h, d)
    geometry.translate(x, y, z)
    place(geometry, color, batch, roof)
  }
  const planter = (x, z) => {
    const pot = new CylinderGeometry(0.5, 0.36, 0.65, 12, 1, true)
    pot.translate(x, 0.35, z)
    place(pot, 'pot', props)
    const rim = new TorusGeometry(0.48, 0.055, 4, 10)
    rim.rotateX(Math.PI / 2)
    rim.translate(x, 0.68, z)
    place(rim, 'stone', props)
    const soil = new CylinderGeometry(0.43, 0.43, 0.06, 8)
    soil.translate(x, 0.63, z)
    place(soil, 'soil', props)
    const plant = createPottedLeaves()
    plant.translate(x, 0.65, z)
    place(plant, 'leaf', props)
    counts.planters++
  }
  const decoratedRoofs = new Set()
  for (const facade of facades) {
    frame = facade
    const building = world.data.buildings[facade.index]
    center = entranceCenters[facade.index]
    const { length } = facade
    const columns = Math.min(8, Math.floor(length / 4))
    const doorX = -length / 2 + (length * (Math.floor(columns / 2) + 1)) / (columns + 1)
    const plinths =
      length > 10
        ? [
            [-length / 2, doorX - 1],
            [doorX + 1, length / 2],
          ]
        : [[-length / 2, length / 2]]
    for (const [start, end] of plinths) {
      if (facade.main || building.siteId === 'linzexu') {
        const blocks = Math.ceil((end - start) / 1.2), width = (end - start) / blocks
        for (let i = 0; i < blocks; i++) {
          const shade = (i + facade.index) % 3
          box(start + (i + .5) * width, .31, .055, width - .012, .57, .22,
            ['#a4a69d', '#acada5', '#9c9f97'][shade])
          counts.stoneCourses++
        }
        box((start + end) / 2, .63, .075, end - start, .1, .27, 'stone')
      } else box((start + end) / 2, 0.34, 0.04, end - start, 0.64, 0.19, 'stone')
    }
    box(0, building.height - 0.12, 0.12, length + 0.12, 0.22, 0.48, 'wood')
    for (let j = 0; j < columns; j++) {
      const x = -length / 2 + (length * (j + 1)) / (columns + 1)
      const door = j === Math.floor(columns / 2) && length > 10
      if (door) {
        box(x - 1.03, 1.85, 0.12, 0.24, 3.7, 0.3, 'stone')
        box(x + 1.03, 1.85, 0.12, 0.24, 3.7, 0.3, 'stone')
        box(x, 3.68, 0.16, 2.5, 0.26, 0.48, 'stone')
        box(x, 0.13, 0.38, 2.25, 0.24, 0.75, 'stone')
        // 深窗套/门套包住原面板，阴影由几何产生；保留原建筑拾取与墙体轮廓。
        for (const side of [-1, 1]) box(x + side * .89, 1.8, .14, .12, 3.36, .22, 'wood')
        box(x, 3.48, .14, 1.9, .14, .22, 'wood')
        // 门扇浮雕边框和下部裙板形成真实凹凸，门环留在两扇接缝两侧。
        if (facade.main || building.siteId === 'linzexu') {
          for (const side of [-1, 1]) {
            box(x + side * 0.43, 0.8, 0.105, 0.68, 1.08, 0.065, '#48362b')
            for (const y of [0.28, 1.32, 2.14, 3.36])
              box(x + side * 0.43, y, 0.145, 0.73, 0.07, 0.065, 'wood')
          }
        }
        for (const side of [-1, 1]) {
          const ring = new RingGeometry(0.078, 0.132, 12)
          ring.translate(x + side * 0.23, 1.8, 0.12)
          place(ring, 'brass')
        }
        if (facade.street && counts.signs < 100) {
          box(x, 4.23, 0.1, 3.25, 0.94, 0.18, 'wood')
          const sign = new PlaneGeometry(3.15, 0.86)
          const uv = sign.attributes.uv,
            cell = Math.abs(building.id) % 8
          for (let k = 0; k < uv.count; k++)
            uv.setXY(
              k,
              ((cell % 4) + uv.getX(k)) / 4,
              (1 - Math.floor(cell / 4) + 0.25 + uv.getY(k) * 0.5) / 2,
            )
          sign.translate(x, 4.23, 0.201)
          place(sign, null, signs)
          counts.signs++
        }
        // 陈设限于檐下，不挤占道路中心或把花盆摆在出入口正前方。
        if (facade.index % 3 === 0 && counts.planters < 90 && length > 13) planter(x - 2.4, 0.68)
        if (facade.index % 5 === 0 && length > 17 && counts.benches < 36) {
          for (const offset of [-0.75, 0.75])
            box(x + 3.1 + offset, 0.26, 0.55, 0.26, 0.5, 0.6, 'stone', props)
          for (const offset of [-0.2, 0, 0.2])
            box(x + 3.1, 0.56, 0.55 + offset, 2.25, 0.12, 0.16, 'wood', props)
          counts.benches++
        }
      } else {
        box(x, 1.77, 0.16, 1.58, 0.16, 0.42, 'stone')
        box(x, 3.62, 0.14, 1.44, 0.14, 0.3, 'wood')
        for (const side of [-1, 1]) box(x + side * .65, 2.7, .14, .1, 1.78, .26, 'wood')
        // 主街和馆区以实体窗棂形成侧向厚度；支巷保留低面数窗棂。
        const detailed = facade.main || building.siteId === 'linzexu'
        for (const offset of [-0.4, -0.2, 0.2, 0.4]) {
          const strip = detailed ? new BoxGeometry(.045, 1.7, .07) : new PlaneGeometry(.045, 1.7)
          strip.translate(x + offset, 2.7, 0.17)
          place(strip, 'wood')
        }
        for (const y of [2.22, 3.15]) {
          const strip = detailed ? new BoxGeometry(1.2, .045, .07) : new PlaneGeometry(1.2, .045)
          strip.translate(x, y, 0.18)
          place(strip, 'wood')
        }
        counts.framedWindows++
      }
    }
    if (decoratedRoofs.has(facade.index)) continue
    decoratedRoofs.add(facade.index)
    const ring = world.projectedBuildings[facade.index].ring
    if (ring.length !== 5 || building.holes.length) continue
    const corners = ring.slice(0, -1)
    let longest = 0,
      edge = 0
    corners.forEach((a, i) => {
      const b = corners[(i + 1) % 4],
        distance = Math.hypot(b[0] - a[0], b[1] - a[1])
      if (distance > longest) {
        longest = distance
        edge = i
      }
    })
    const a = corners[edge],
      b = corners[(edge + 1) % 4]
    const ux = (b[0] - a[0]) / longest,
      uz = (b[1] - a[1]) / longest
    const along = corners.map(([x, z]) => x * ux + z * uz),
      across = corners.map(([x, z]) => -x * uz + z * ux)
    const u = (Math.min(...along) + Math.max(...along)) / 2,
      v = (Math.min(...across) + Math.max(...across)) / 2
    const width = Math.max(...across) - Math.min(...across)
    // 仅矩形单体加屋脊，复杂连院保持原轮廓，不能跨天井架一根假屋脊。
    const area =
      Math.abs(
        corners.reduce((sum, p, i) => {
          const q = corners[(i + 1) % 4]
          return sum + p[0] * q[1] - q[0] * p[1]
        }, 0),
      ) / 2
    if (area < longest * width * 0.95 || width < 3) continue
    frame = { x: u * ux - v * uz, z: u * uz + v * ux, ux, uz, nx: -uz, nz: ux }
    const rise = Math.min(3.8, width * 0.21),
      ridge = building.height + 0.45 + rise
    box(0, ridge + 0.14, 0, longest + 0.35, 0.28, 0.38, 'tile', architecture, true)
    for (const side of [-1, 1]) {
      box(
        side * (longest / 2 - 0.12),
        ridge + 0.38,
        0,
        0.5,
        0.55,
        0.44,
        'plaster',
        architecture,
        true,
      )
      box(
        side * (longest / 2 - 0.12),
        ridge + 0.69,
        0,
        0.65,
        0.14,
        0.55,
        'tile',
        architecture,
        true,
      )
    }
    if (
      (facade.main || building.siteId === 'linzexu') &&
      width <= 24 &&
      longest <= 48 &&
      counts.gables < 100
    ) {
      for (const side of [-1, 1]) {
        // 檐底、封檐板和少量椽头托住弧面瓦头，避免屋顶像一张薄纸。
        box(0, building.height + .24, side * (width / 2 + .05), longest + .15, .16, .52, 'wood', architecture, true)
        const rafters = Math.ceil(longest / .95)
        for (let i = 0; i < rafters; i++)
          box(-longest / 2 + (i + .5) * longest / rafters, building.height + .12,
            side * (width / 2 - .1), .11, .14, .72, 'wood', architecture, true)
        const gable = createSaddleGable(width + 0.25, building.height, rise)
        gable.wall.translate((side * longest) / 2, 0, 0)
        gable.cap.translate((side * longest) / 2, 0, 0)
        place(gable.wall, 'plaster', architecture, true)
        place(gable.cap, 'tile', architecture, true)
        counts.gables++
        const tiles = createEaveTiles(longest, building.height + 0.45, (side * width) / 2, side)
        place(tiles, 'tile', architecture, true)
        counts.tiledEaves++
      }
    }
    counts.ridges++
  }
  frame = { x: 0, z: 0, ux: 1, uz: 0, nx: 0, nz: 1 }
  // 低矮灌木和景石严格落在既有花台内，避让树干、建筑及水面。
  for (const garden of world.memorial?.gardens ?? []) {
    const ring = garden.map((p) => getWorldPoint(p, world.origin))
    const xs = ring.map((p) => p[0]),
      zs = ring.map((p) => p[1])
    let cluster = 0
    for (let z = Math.min(...zs) + 1; z < Math.max(...zs); z += 2.8) {
      for (let x = Math.min(...xs) + 1; x < Math.max(...xs); x += 2.8) {
        if (
          ![
            [x, z],
            [x - 0.8, z],
            [x + 0.8, z],
            [x, z - 0.8],
            [x, z + 0.8],
          ].every((p) => isPointInRing(p, ring))
        )
          continue
        if (
          world.projectedBuildings.some(
            (b) => isPointInRing([x, z], b.ring) && !b.holes.some((h) => isPointInRing([x, z], h)),
          )
        )
          continue
        if (
          world.memorial.ponds.some((pond) =>
            isPointInRing(
              [x, z],
              pond.map((p) => getWorldPoint(p, world.origin)),
            ),
          )
        )
          continue
        if (
          world.memorial.trees.some((p) => {
            const [tx, tz] = getWorldPoint(p, world.origin)
            return Math.hypot(tx - x, tz - z) < 1.2
          })
        )
          continue
        const rock = cluster++ % 4 === 0
        const geometry = rock ? new IcosahedronGeometry(0.75, 1) : createPottedLeaves()
        geometry.scale(rock ? 1.2 : 2, rock ? 0.7 : 1.2, rock ? 0.75 : 2)
        geometry.rotateY(cluster * 1.7)
        geometry.translate(x, rock ? 0.42 : 0.08, z)
        place(geometry, rock ? '#a8a69b' : cluster % 2 ? '#7c895d' : '#65764e', props)
        counts.gardenClusters++
      }
    }
  }
  for (const [name, parts, material] of [
    [
      'heritage-facades',
      architecture,
      new MeshStandardMaterial({ vertexColors: true, roughness: 0.92 }),
    ],
    [
      'heritage-street-props',
      props,
      new MeshStandardMaterial({ vertexColors: true, roughness: 0.95, side: DoubleSide }),
    ],
    [
      'heritage-signs',
      signs,
      signs.length ? new MeshStandardMaterial({ map: createSignTexture(), roughness: 0.95 }) : null,
    ],
  ]) {
    if (!parts.length) {
      material?.dispose()
      continue
    }
    const merged = mergeGeometries(parts)
    // 相同面内复用顶点；法线、颜色和落位属性一起参与去重，保留硬边和各栋节奏。
    const geometry = mergeVertices(merged)
    merged.dispose()
    const mesh = new Mesh(geometry, material)
    parts.forEach((part) => part.dispose())
    mesh.name = name
    mesh.castShadow = name !== 'heritage-signs'
    mesh.receiveShadow = true
    mesh.userData.details = counts
    world.scene.add(mesh)
    world.streetLitStaticMeshes?.push(mesh)
  }
}
