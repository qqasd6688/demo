import {
  BufferGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  Float32BufferAttribute,
  PlaneGeometry,
  Quaternion,
  Shape,
  Vector3,
} from '../vendor/three/build/three.module.min.js'
import { mergeGeometries } from '../vendor/three/examples/jsm/utils/BufferGeometryUtils.js'

// 山墙以现有屋面为下界，曲线墙帽盖住檐口；只用于已确认的矩形古厝，不跨越天井。
export function createSaddleGable(width, height, rise) {
  const points = []
  for (let i = 0; i <= 24; i++) {
    const t = i / 12 - 1,
      a = Math.abs(t)
    const y = height + 0.45 + rise * (1 - a) + 0.45 + 0.75 * a ** 5 + 0.28 * Math.sin(a * Math.PI)
    points.push(new Vector3((t * width) / 2, y, 0))
  }
  const shape = new Shape()
  shape.moveTo(-width / 2, height + 0.1)
  for (const p of points) shape.lineTo(p.x, p.y)
  shape.lineTo(width / 2, height + 0.1)
  shape.closePath()
  const wall = new ExtrudeGeometry(shape, {
    depth: 0.28,
    bevelEnabled: false,
    steps: 1,
    curveSegments: 1,
  })
  wall.translate(0, 0, -0.14)
  const coping = new Shape()
  coping.moveTo(points[0].x, points[0].y + 0.12)
  for (const p of points.slice(1)) coping.lineTo(p.x, p.y + 0.12)
  for (const p of [...points].reverse()) coping.lineTo(p.x, p.y - 0.06)
  coping.closePath()
  const cap = new ExtrudeGeometry(coping, {
    depth: 0.42,
    bevelEnabled: false,
    steps: 1,
    curveSegments: 1,
  })
  cap.translate(0, 0, -0.21)
  wall.rotateY(Math.PI / 2)
  cap.rotateY(Math.PI / 2)
  return { wall, cap }
}

// 檐口是真实弧面瓦头；面数集中在近景能看见的轮廓，每片仅四个三角形。
export function createEaveTiles(length, height, z, direction) {
  const positions = []
  const count = Math.min(80, Math.ceil(length / 0.34)),
    step = length / count
  for (let tile = 0; tile < count; tile++) {
    const x = -length / 2 + step * (tile + 0.5)
    const profile = [-Math.PI / 2, 0, Math.PI / 2]
    for (let i = 1; i < profile.length; i++) {
      const point = (j, end) => [
        x + Math.sin(profile[j]) * step * 0.48,
        height + Math.cos(profile[j]) * 0.12 + (end ? -0.06 : 0.12),
        z + direction * (end ? 0.36 : -0.22),
      ]
      const corners = [point(i - 1, 0), point(i, 0), point(i, 1), point(i - 1, 1)]
      const order = direction > 0 ? [0, 2, 1, 0, 3, 2] : [0, 1, 2, 0, 2, 3]
      for (const vertex of order) positions.push(...corners[vertex])
    }
  }
  const geometry = new BufferGeometry().setAttribute(
    'position',
    new Float32BufferAttribute(positions, 3),
  )
  geometry.computeVertexNormals()
  return geometry
}

function branch(a, b, radius, tip) {
  const start = new Vector3(...a),
    end = new Vector3(...b),
    delta = end.clone().sub(start)
  const geometry = new CylinderGeometry(tip, radius, delta.length(), 6)
  geometry.applyQuaternion(
    new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), delta.normalize()),
  )
  geometry.translate(...start.add(end).multiplyScalar(0.5).toArray())
  return geometry
}

// 全树只有一套枝干几何和一套叶簇卡片。叶簇带空隙，替代涂满叶纹的实心球体。
export function createGardenTreeGeometries(leafCount = 110) {
  const branches = [branch([0, 0, 0], [0.04, 1.05, 0.03], 0.13, 0.08)]
  for (let i = 0; i < 7; i++) {
    const angle = i * 2.399,
      x = Math.cos(angle),
      z = Math.sin(angle)
    branches.push(
      branch(
        [0.02, 0.65 + (i % 3) * 0.12, 0],
        [x * 0.62, 1.52 + (i % 2) * 0.21, z * 0.62],
        0.065,
        0.018,
      ),
    )
    branches.push(branch([x * 0.45, 1.35, z * 0.45], [x * 0.96, 1.73, z * 0.96], 0.026, 0.007))
  }
  const wood = mergeGeometries(branches)
  branches.forEach((g) => g.dispose())
  const cards = []
  for (let i = 0; i < leafCount; i++) {
    const u = (i + 0.5) / leafCount,
      angle = i * 2.399
    const y = 1 - 2 * u,
      radius = Math.sqrt(1 - y * y)
    const spread = leafCount < 110 ? 1.35 : 1
    const card = new PlaneGeometry(0.76 * spread, 0.64 * spread)
    card.rotateX(Math.sin(i * 5.3) * 1.1)
    card.rotateY(angle)
    card.rotateZ(Math.sin(i * 3.7) * 0.55)
    card.translate(
      Math.cos(angle) * radius * 0.93,
      1.72 + y * 0.65,
      Math.sin(angle) * radius * 0.85,
    )
    cards.push(card)
  }
  const leaves = mergeGeometries(cards)
  cards.forEach((g) => g.dispose())
  return { wood, leaves }
}

// 盆栽用带中脊的独立叶片，底部由花盆遮住，不再使用三个小球充当枝叶。
export function createPottedLeaves() {
  const positions = [],
    colors = []
  for (let i = 0; i < 28; i++) {
    const a = i * 2.399,
      radius = 0.23 + (i % 4) * 0.055
    const start = [0, 0.12 + (i % 5) * 0.08, 0]
    const tip = [Math.cos(a) * radius, 0.24 + (i % 7) * 0.07, Math.sin(a) * radius]
    const mid = [(start[0] + tip[0]) / 2, (start[1] + tip[1]) / 2 + 0.06, (start[2] + tip[2]) / 2]
    const left = [mid[0] - Math.sin(a) * 0.08, mid[1] - 0.035, mid[2] + Math.cos(a) * 0.08]
    const right = [mid[0] + Math.sin(a) * 0.08, mid[1] - 0.035, mid[2] - Math.cos(a) * 0.08]
    for (const triangle of [
      [start, left, mid],
      [left, tip, mid],
      [tip, right, mid],
      [right, start, mid],
    ]) {
      for (const p of triangle) {
        positions.push(...p)
        colors.push(0.18 + (i % 3) * 0.035, 0.26 + (i % 4) * 0.025, 0.08)
      }
    }
  }
  const geometry = new BufferGeometry().setAttribute(
    'position',
    new Float32BufferAttribute(positions, 3),
  )
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3))
  geometry.computeVertexNormals()
  return geometry
}
