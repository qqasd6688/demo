import {
  BufferGeometry,
  CatmullRomCurve3,
  Color,
  CylinderGeometry,
  DataTexture,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PointLight,
  RepeatWrapping,
  RGBAFormat,
  SRGBColorSpace,
  TubeGeometry,
  Vector3,
} from '../vendor/three/build/three.module.min.js'
import { mergeGeometries } from '../vendor/three/examples/jsm/utils/BufferGeometryUtils.js'
import { HEART_TREE } from '../data/landmarks.js'
import { getWorldPoint } from './geometry.js'

// 心形属于有厚度的树冠体积；浅凹口、轻微不对称和表面起伏参考南后街实景。
function getCanopyPoint(angle, latitude) {
  const x = 16 * Math.pow(Math.sin(angle), 3)
  let y =
    13 * Math.cos(angle) - 5 * Math.cos(2 * angle) - 2 * Math.cos(3 * angle) - Math.cos(4 * angle)
  y += 3.2 * Math.exp(-Math.pow(x / 3.8, 2)) * Math.max(0, Math.cos(angle))
  const radial = Math.cos(latitude)
  const roughness =
    Math.sin(angle * 29 + latitude * 13) * Math.sin(angle * 17 - latitude * 19) * 0.15
  return new Vector3(
    x * 0.78 * radial + roughness * radial,
    21.3 + (y * 0.59 + Math.sin(angle) * 0.3) * radial + roughness,
    Math.sin(latitude) * 5.4 + roughness * radial,
  )
}

// 主干、分叉、气根均沿曲线收细；复用同一套截面算法，避免圆柱拼接的机械树形。
function createBranch(points, baseRadius, tipRadius, segments = 16) {
  const curve = new CatmullRomCurve3(points.map((point) => new Vector3(...point)))
  const geometry = new TubeGeometry(curve, segments, 1, 8, false)
  const position = geometry.getAttribute('position')
  for (let row = 0; row <= segments; row++) {
    const center = curve.getPointAt(row / segments)
    const radius = baseRadius + ((tipRadius - baseRadius) * row) / segments
    for (let column = 0; column <= 8; column++) {
      const index = row * 9 + column
      position.setXYZ(
        index,
        center.x + (position.getX(index) - center.x) * radius,
        center.y + (position.getY(index) - center.y) * radius,
        center.z + (position.getZ(index) - center.z) * radius,
      )
    }
  }
  geometry.computeVertexNormals()
  return geometry
}

// 不依赖外部照片贴图，树皮沟纹由周期噪声生成，材质由场景统一回收。
function createBarkTexture() {
  const width = 128
  const height = 256
  const pixels = new Uint8Array(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // TubeGeometry 的 v 沿树干截面环绕，沟纹沿 u 延伸，避免出现横向环纹。
      const angle = (y / height) * Math.PI * 2
      const groove = Math.pow(Math.abs(Math.sin(angle * 13 + Math.sin(x * 0.045) * 1.1)), 7)
      const grain = Math.sin(x * 31.7 + y * 17.3) * Math.cos(x * 11.3 - y * 5.7)
      const value = 155 - groove * 62 + grain * 13
      const index = (y * width + x) * 4
      pixels[index] = value
      pixels[index + 1] = value * 0.95
      pixels[index + 2] = value * 0.84
      pixels[index + 3] = 255
    }
  }
  const texture = new DataTexture(pixels, width, height, RGBAFormat)
  texture.colorSpace = SRGBColorSpace
  texture.wrapS = texture.wrapT = RepeatWrapping
  texture.repeat.set(2, 2)
  texture.needsUpdate = true
  return texture
}

// 一棵独立地标：灰褐 Y 形枝干、厚实双瓣树冠、分层叶簇和垂落气根。
// 叶片和叶簇各使用一个实例化网格，不为每片叶子创建独立对象或动画。
export function createHeartTree() {
  const root = new Group()
  root.name = '南后街爱心榕树'
  let seed = 20210907
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return seed / 4294967296
  }
  const barkTexture = createBarkTexture()
  const barkMaterial = new MeshStandardMaterial({
    color: '#c2b9a6',
    map: barkTexture,
    bumpMap: barkTexture,
    bumpScale: 0.1,
    roughness: 1,
  })
  const branches = [
    createBranch(
      [
        [0, 0, 0],
        [0.15, 2.2, 0.15],
        [-0.25, 4.6, 0],
        [0, 7.8, -0.2],
      ],
      0.84,
      0.54,
    ),
    createBranch(
      [
        [0, 5.9, 0],
        [-1.7, 9.8, 0.1],
        [-4.3, 14.2, 0.3],
        [-7.8, 19.6, 0],
        [-9.3, 23, -0.1],
      ],
      0.64,
      0.1,
      24,
    ),
    createBranch(
      [
        [0, 6.5, -0.2],
        [2, 10.5, -0.2],
        [4.7, 14.8, 0.1],
        [7.7, 20.4, 0.1],
        [8.5, 23.8, -0.2],
      ],
      0.62,
      0.11,
      24,
    ),
    createBranch(
      [
        [-0.1, 7.2, -0.1],
        [-0.5, 12.4, -1],
        [-1, 17.5, -2.7],
        [-3.5, 21.7, -3],
      ],
      0.4,
      0.06,
    ),
    createBranch(
      [
        [1.8, 10.1, 0],
        [2, 14.4, 2],
        [3.4, 19, 3.6],
        [5.4, 22.2, 3.9],
      ],
      0.3,
      0.05,
    ),
  ]
  for (let side = -1; side <= 1; side += 2) {
    for (let index = 0; index < 5; index++) {
      const x = side * (2.7 + index * 1.3)
      const y = 11.8 + index * 1.5
      branches.push(
        createBranch(
          [
            [x * 0.7, y, 0],
            [x, y + 2.5, 1.6],
            [x + side * 2, y + 4, 2.9],
          ],
          0.16 - index * 0.018,
          0.025,
        ),
      )
    }
  }
  for (let index = 0; index < 8; index++) {
    const angle = (index / 8) * Math.PI * 2
    branches.push(
      createBranch(
        [
          [Math.cos(angle) * 0.4, 1.8, Math.sin(angle) * 0.4],
          [Math.cos(angle) * 1.1, 0.3, Math.sin(angle) * 1.1],
          [Math.cos(angle) * 2, 0.05, Math.sin(angle) * 2],
        ],
        0.23,
        0.04,
        10,
      ),
    )
  }
  const branchGeometry = mergeGeometries(branches)
  branches.forEach((geometry) => geometry.dispose())
  const trunk = new Mesh(branchGeometry, barkMaterial)
  trunk.castShadow = trunk.receiveShadow = true
  root.add(trunk)

  const roots = []
  for (let index = 0; index < 24; index++) {
    const point = getCanopyPoint(Math.PI * (0.55 + random() * 0.9), 0.25 + random() * 0.8)
    roots.push(
      createBranch(
        [
          point.toArray(),
          [point.x + 0.08, point.y - 1.5, point.z + 0.1],
          [point.x + 0.18, Math.max(5.2, point.y - 3 - random() * 4), point.z + 0.25],
        ],
        0.028 + random() * 0.02,
        0.009,
        10,
      ),
    )
  }
  const rootGeometry = mergeGeometries(roots)
  roots.forEach((geometry) => geometry.dispose())
  root.add(new Mesh(rootGeometry, barkMaterial))

  const columns = 112
  const rows = 28
  const positions = []
  const colors = []
  const indices = []
  const color = new Color()
  for (let row = 0; row <= rows; row++) {
    for (let column = 0; column <= columns; column++) {
      const point = getCanopyPoint((column / columns) * Math.PI * 2, (row / rows - 0.5) * Math.PI)
      positions.push(...point.toArray())
      color.setHSL(
        0.26 + random() * 0.025,
        0.38 + random() * 0.1,
        0.16 + (point.y / 30) * 0.1 + random() * 0.035,
      )
      colors.push(color.r, color.g, color.b)
      if (row < rows && column < columns) {
        const current = row * (columns + 1) + column
        const next = current + columns + 1
        indices.push(current, next, current + 1, current + 1, next, next + 1)
      }
    }
  }
  const crownGeometry = new BufferGeometry()
  crownGeometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  crownGeometry.setAttribute('color', new Float32BufferAttribute(colors, 3))
  crownGeometry.setIndex(indices)
  crownGeometry.computeVertexNormals()
  const crown = new Mesh(
    crownGeometry,
    new MeshStandardMaterial({
      color: '#70894f',
      vertexColors: true,
      roughness: 1,
      side: DoubleSide,
    }),
  )
  crown.castShadow = crown.receiveShadow = true
  root.add(crown)

  const foliageMaterial = new MeshStandardMaterial({
    color: '#88a36a',
    roughness: 0.95,
    side: DoubleSide,
  })
  const clusters = new InstancedMesh(new IcosahedronGeometry(1, 1), foliageMaterial, 600)
  const dummy = new Object3D()
  for (let index = 0; index < clusters.count; index++) {
    const point = getCanopyPoint(random() * Math.PI * 2, Math.asin(random() * 2 - 1))
    dummy.position.copy(point)
    const size = 0.17 + random() * 0.18
    dummy.scale.set(size * 1.15, size * 0.85, size)
    dummy.rotation.set(random(), random() * 6, random())
    dummy.updateMatrix()
    clusters.setMatrixAt(index, dummy.matrix)
    color.setHSL(0.24 + random() * 0.06, 0.4 + random() * 0.12, 0.19 + random() * 0.12)
    clusters.setColorAt(index, color)
  }
  clusters.receiveShadow = true
  root.add(clusters)

  const leafGeometry = new BufferGeometry()
  leafGeometry.setAttribute(
    'position',
    new Float32BufferAttribute(
      [0, 0, 0, -0.28, 0.38, 0.04, 0, 0.45, 0.1, 0.28, 0.38, 0.04, 0, 1, 0],
      3,
    ),
  )
  leafGeometry.setIndex([0, 1, 2, 0, 2, 3, 1, 4, 2, 2, 4, 3])
  leafGeometry.computeVertexNormals()
  const leaves = new InstancedMesh(leafGeometry, foliageMaterial, 14000)
  for (let index = 0; index < leaves.count; index++) {
    const point = getCanopyPoint(random() * Math.PI * 2, Math.asin(random() * 2 - 1))
    const normal = new Vector3(point.x, point.y - 21.3, point.z * 2).normalize()
    dummy.position.copy(point).addScaledVector(normal, 0.15 + random() * 0.35)
    dummy.lookAt(point.clone().addScaledVector(normal, 2))
    dummy.rotateZ(random() * Math.PI * 2)
    dummy.rotateX((random() - 0.5) * 0.8)
    dummy.scale.setScalar(0.3 + random() * 0.3)
    dummy.updateMatrix()
    leaves.setMatrixAt(index, dummy.matrix)
    color.setHSL(
      0.23 + random() * 0.07,
      0.38 + random() * 0.13,
      0.16 + (point.y / 30) * 0.09 + random() * 0.1,
    )
    leaves.setColorAt(index, color)
  }
  leaves.receiveShadow = true
  root.add(leaves)

  const treePit = new Mesh(
    new CylinderGeometry(1.95, 2.1, 0.22, 20),
    new MeshStandardMaterial({ color: '#aaa79b', roughness: 1 }),
  )
  treePit.position.y = 0.11
  root.add(treePit)
  const uplights = [-1, 1].map((side) => {
    const light = new PointLight('#e5efb8', 0, 38, 2)
    light.position.set(side * 3, 2.5, 4)
    root.add(light)
    return light
  })
  // 使用实体树冠与树干拾取，避免每次点击遍历上万片细叶。
  // 树冠围绕上部树干轻摆，树根和树池保持固定；拾取仍使用原有实体。
  const canopy = new Group()
  canopy.position.y = 18
  for (const part of [crown, clusters, leaves]) {
    part.position.y -= 18
    canopy.add(part)
  }
  root.add(canopy)
  root.userData = { landmarkId: HEART_TREE.id, pickMeshes: [trunk, crown], uplights, canopy }
  return root
}

export function buildHeartTree(world) {
  const tree = createHeartTree()
  const [x, z] = getWorldPoint(HEART_TREE.position, world.origin)
  tree.position.set(x, 0, z)
  tree.rotation.y = 0.18
  for (const mesh of tree.userData.pickMeshes) {
    mesh.userData.placeId = HEART_TREE.id
    world.pickMeshes.push(mesh)
  }
  world.heartTree = tree
  world.scene.add(tree)
}
