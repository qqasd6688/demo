import {
  Box3,
  Float32BufferAttribute,
  MeshDepthMaterial,
  Plane,
  RGBADepthPacking,
  Vector3,
} from '../vendor/three/build/three.module.min.js'

const ROAD_DURATION = 1300
const BUILD_DURATION = 4800
const DROP_DURATION = 1100

// 合批前记录每栋建筑的位置和落位节奏。墙面按朝向分片，屋面与轮廓使用同一节奏。
// 保留静态属性到场景销毁，避免入场结束重传几何或遗留失去引用的 GPU 缓冲。
export function stampBuildingEntrance(geometry, world, { roof = false, center, normal } = {}) {
  if (!center) {
    geometry.computeBoundingBox()
    center = geometry.boundingBox.getCenter(new Vector3())
  }
  const seed = Math.sin(center.x * 12.9898 + center.z * 78.233) * 43758.5453
  const random = seed - Math.floor(seed)
  const wave = Math.max(0, Math.min(1, (world.maxPoint[1] - center.z) / world.depth))
  const positions = geometry.attributes.position
  const normals = geometry.attributes.normal
  const pivots = new Float32Array(positions.count * 3)
  const motion = new Float32Array(positions.count * 4)
  for (let i = 0; i < positions.count; i++) {
    const face = roof
      ? 0
      : (Math.atan2(normal?.x ?? normals.getX(i), normal?.z ?? normals.getZ(i)) + Math.PI) /
        (2 * Math.PI)
    pivots.set([center.x, center.y, center.z], i * 3)
    motion.set(
      [
        wave * 1000 + random * 450 + (roof ? 600 : face * 200),
        (roof ? 190 : 120) + random * 90,
        (random - 0.5) * 14,
        (face - 0.5) * 10,
      ],
      i * 4,
    )
  }
  geometry.setAttribute('entrancePivot', new Float32BufferAttribute(pivots, 3))
  geometry.setAttribute('entranceMotion', new Float32BufferAttribute(motion, 4))
  return center
}

// 实体与阴影共用顶点变换；墙体维持原合批数量，不生成上千个独立网格。
const DROP_VERTEX = `
  float entranceProgress = clamp((entranceTime - entranceMotion.x) / ${DROP_DURATION.toFixed(1)}, 0.0, 1.0);
  float entranceScale = smoothstep(0.0, 0.14, entranceProgress);
  float entranceFall = min(1.0, entranceProgress / 0.78);
  float entranceLift = entranceMotion.y * (1.0 - entranceFall * entranceFall);
  float entranceSettle = clamp((entranceProgress - 0.78) / 0.22, 0.0, 1.0);
  entranceLift += sin(entranceSettle * 3.14159265) * (1.0 - entranceSettle) * 3.0;
  transformed = entrancePivot + (transformed - entrancePivot) * entranceScale;
  transformed += vec3(entranceMotion.z * (1.0 - entranceFall), entranceLift, entranceMotion.w * (1.0 - entranceFall));
`

// 第二批配景使用相同的自由落体与落定缓冲，保持树木和院落的组合关系。
export function getEntranceDrop(elapsed, delay, height) {
  const progress = Math.max(0, Math.min(1, (elapsed - delay) / DROP_DURATION))
  if (progress === 1) return { scale: 1, lift: 0 }
  const reveal = Math.min(1, progress / 0.14)
  const fall = Math.min(1, progress / 0.78)
  const settle = Math.max(0, Math.min(1, (progress - 0.78) / 0.22))
  return {
    scale: reveal * reveal * (3 - 2 * reveal),
    lift: height * (1 - fall * fall) + Math.sin(settle * Math.PI) * (1 - settle) * 3,
  }
}

export function prepareEntrance(world, ground, structures) {
  const roadPlane = new Plane(new Vector3(0, 0, 1), -world.maxPoint[1] - 1)
  const entrance = {
    start: null,
    roadPlane,
    time: { value: -ROAD_DURATION },
    materials: new Map(),
    meshes: [],
    props: [],
    deferred: [],
    ground: {
      material: ground.material,
      clippingPlanes: ground.material.clippingPlanes,
      clipShadows: ground.material.clipShadows,
    },
    paving: world.streetPaving
      ? {
          material: world.streetPaving.material,
          clippingPlanes: world.streetPaving.material.clippingPlanes,
          clipShadows: world.streetPaving.material.clipShadows,
        }
      : null,
    localClippingEnabled: world.renderer.localClippingEnabled,
  }
  world.entrance = entrance
  world.state.entrancePhase = 'roads'
  world.renderer.localClippingEnabled = true
  for (const surface of [entrance.ground, entrance.paving]) {
    if (!surface) continue
    surface.material.clippingPlanes = [...(surface.clippingPlanes || []), roadPlane]
    surface.material.clipShadows = true
    surface.material.needsUpdate = true
  }

  // 包装已有街灯 shader，不覆盖其逻辑；完成、取消和卸载均恢复原始入口。
  const animateMaterial = (material) => {
    if (entrance.materials.has(material)) return
    const original = {
      onBeforeCompile: material.onBeforeCompile,
      customProgramCacheKey: material.customProgramCacheKey,
    }
    const cacheKey = material.customProgramCacheKey()
    entrance.materials.set(material, original)
    material.onBeforeCompile = function (shader, renderer) {
      original.onBeforeCompile.call(this, shader, renderer)
      shader.uniforms.entranceTime = entrance.time
      shader.vertexShader =
        'uniform float entranceTime;\nattribute vec3 entrancePivot;\nattribute vec4 entranceMotion;\n' +
        shader.vertexShader.replace(
          '#include <begin_vertex>',
          '#include <begin_vertex>\n' + DROP_VERTEX,
        )
    }
    material.customProgramCacheKey = () => cacheKey + '|sanfang-material-drop-v1'
    material.needsUpdate = true
  }
  for (const root of structures) {
    if (root.geometry?.attributes.entranceMotion) {
      for (const material of Array.isArray(root.material) ? root.material : [root.material])
        animateMaterial(material)
      const original = {
        object: root,
        depth: root.customDepthMaterial,
        frustumCulled: root.frustumCulled,
      }
      // 空中位置超出静态包围盒，入场期间禁用该网格的视锥剔除。
      root.frustumCulled = false
      if (root.castShadow) {
        root.customDepthMaterial = new MeshDepthMaterial({ depthPacking: RGBADepthPacking })
        animateMaterial(root.customDepthMaterial)
      }
      entrance.meshes.push(original)
    } else {
      const center = new Box3().setFromObject(root).getCenter(new Vector3())
      const seed = Math.sin(center.x * 0.13 + center.z * 0.17) * 0.5 + 0.5
      entrance.props.push({
        object: root,
        position: root.position.clone(),
        scale: root.scale.clone(),
        visible: root.visible,
        delay: 3250 + seed * 350,
        height: 45 + seed * 45,
      })
      root.visible = false
    }
  }
  // 游客和反射水面在街区建好后出现。
  for (const object of [
    ...Object.values(world.crowdBatches).map(({ mesh }) => mesh),
    world.riverWater,
  ]) {
    if (!object) continue
    entrance.deferred.push({ object, visible: object.visible })
    object.visible = false
  }
  world.renderer.shadowMap.needsUpdate = true
}

export function updateEntrance(world, time) {
  const entrance = world.entrance
  if (!entrance) return
  // 用户明确要求完整搭建入场；手动操作随时通过统一出口跳过。
  entrance.start ??= time
  const elapsed = Math.max(0, time - entrance.start)
  if (elapsed >= ROAD_DURATION + BUILD_DURATION) {
    finishEntrance(world)
    return
  }
  const roadProgress = Math.min(1, elapsed / ROAD_DURATION)
  entrance.roadPlane.constant = -world.maxPoint[1] - 1 + (world.depth + 2) * roadProgress
  entrance.time.value = elapsed - ROAD_DURATION
  for (const { object, position, scale, visible, delay, height } of entrance.props) {
    const drop = getEntranceDrop(entrance.time.value, delay, height)
    object.visible = visible && drop.scale > 0
    object.position.copy(position)
    object.position.y += drop.lift
    object.scale.copy(scale).multiplyScalar(drop.scale)
  }
  world.state.entrancePhase = elapsed < ROAD_DURATION ? 'roads' : 'buildings'
  world.renderer.shadowMap.needsUpdate = true
}

// 完成、手动接管、异常和销毁走同一恢复出口，不留下半成品或隐藏控件。
export function finishEntrance(world) {
  const entrance = world.entrance
  if (!entrance) return
  for (const [material, original] of entrance.materials) {
    material.onBeforeCompile = original.onBeforeCompile
    material.customProgramCacheKey = original.customProgramCacheKey
    material.needsUpdate = true
  }
  for (const { object, depth, frustumCulled } of entrance.meshes) {
    if (object.customDepthMaterial !== depth) object.customDepthMaterial.dispose()
    object.customDepthMaterial = depth
    object.frustumCulled = frustumCulled
  }
  for (const { object, position, scale, visible } of entrance.props) {
    object.position.copy(position)
    object.scale.copy(scale)
    object.visible = visible
  }
  for (const surface of [entrance.ground, entrance.paving]) {
    if (!surface) continue
    surface.material.clippingPlanes = surface.clippingPlanes
    surface.material.clipShadows = surface.clipShadows
    surface.material.needsUpdate = true
  }
  for (const { object, visible } of entrance.deferred) object.visible = visible
  world.renderer.localClippingEnabled = entrance.localClippingEnabled
  world.renderer.shadowMap.needsUpdate = true
  world.waterReflectionAt = -Infinity
  world.entrance = null
  world.state.entrancePhase = 'complete'
}
