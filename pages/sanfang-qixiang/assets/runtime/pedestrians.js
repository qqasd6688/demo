import {
  BoxGeometry,
  CanvasTexture,
  SphereGeometry,
  Color,
  CylinderGeometry,
  DynamicDrawUsage,
  InstancedMesh,
  InstancedBufferAttribute,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
} from '../vendor/three/build/three.module.min.js'
import { createPedestrianPlan, getPedestrianPose } from './pedestrian-model.js'
import { configureStreetLitMaterial } from './street-life.js'
import { getStreetLightStrength } from './geometry.js'
import { TIME_PRESETS } from './environment-presets.js'
import { viewChanged } from './view-cache.js'

// 游客实例化渲染与动画；每帧由主循环驱动，切换页面后不保留独立调度。
export function buildPedestrians(world) {
  const seed = window.crypto.getRandomValues(new Uint32Array(1))[0]
  const plan = createPedestrianPlan(world.data.roads, world.projectedBuildings, world.origin, seed)
  world.crowdActors = plan.groups.flatMap((group) =>
    group.members.map((member) => ({
      group,
      member,
      heading: getPedestrianPose(group, member, 0).heading,
    })),
  )
  const total = world.crowdActors.length
  world.state.crowdCount = 0
  if (!total) {
    return
  }
  const material = new MeshStandardMaterial({
    color: '#ffffff',
    roughness: 0.88,
    flatShading: true,
  })
  configureStreetLitMaterial(world, material)
  const definitions = {
    body: [new CylinderGeometry(0.7, 1, 1, 8), 1],
    head: [new SphereGeometry(1, 10, 8), 1],
    hair: [new SphereGeometry(1, 8, 6), 1],
    arm: [new CylinderGeometry(1, 0.9, 1, 6), 2],
    hand: [new SphereGeometry(1, 6, 4), 2],
    leg: [new CylinderGeometry(1, 0.9, 1, 6), 2],
    shoe: [new BoxGeometry(1, 1, 1), 2],
    hatBrim: [new CylinderGeometry(1, 1, 1, 10), 1],
    hatTop: [new CylinderGeometry(0.9, 1, 1, 10), 1],
    bag: [new BoxGeometry(1, 1, 1), 1],
    skirt: [new CylinderGeometry(0.55, 1, 1, 8), 1],
    accessory: [new BoxGeometry(1, 1, 1), 1],
    cane: [new CylinderGeometry(1, 1, 1, 6), 1],
    flagPole: [new CylinderGeometry(1, 1, 1, 5), 1],
    flag: [new BoxGeometry(1, 1, 1), 1],
  }
  for (const [name, [geometry, slots]] of Object.entries(definitions)) {
    geometry.setAttribute(
      'streetLightGlow',
      new InstancedBufferAttribute(new Float32Array(total * slots), 1).setUsage(DynamicDrawUsage),
    )
    const mesh = new InstancedMesh(geometry, material, total * slots)
    mesh.instanceMatrix.setUsage(DynamicDrawUsage)
    mesh.frustumCulled = false
    mesh.receiveShadow = true
    world.crowdBatches[name] = { mesh, slots }
    world.scene.add(mesh)
    world.crowdActors.forEach(({ member }, i) => {
      const color =
        name === 'head' || name === 'hand'
          ? member.skin
          : name === 'hair'
            ? member.hair
            : name === 'leg'
              ? member.trousers
              : name === 'shoe'
                ? '#302d29'
                : name === 'hatBrim' || name === 'hatTop'
                  ? member.role === 'guide'
                    ? '#c49a43'
                    : '#d8c49b'
                  : name === 'bag'
                    ? '#755e48'
                    : name === 'accessory'
                      ? member.role === 'camera'
                        ? '#343b40'
                        : '#a07158'
                      : name === 'cane'
                        ? '#5c4b39'
                        : name === 'flagPole'
                          ? '#c6ba9e'
                          : name === 'flag'
                            ? '#a34331'
                            : member.shirt
      for (let slot = 0; slot < slots; slot++) mesh.setColorAt(i * slots + slot, new Color(color))
    })
    // 保留角色原始配色；每次将实际存在的部件紧凑写入绘制缓冲。
    world.crowdBatches[name].colors = mesh.instanceColor.array.slice()
    mesh.instanceColor.setUsage(DynamicDrawUsage)
  }
  const surface = document.createElement('canvas')
  surface.width = surface.height = 32
  const ctx = surface.getContext('2d'),
    gradient = ctx.createRadialGradient(16, 16, 0, 16, 16, 16)
  gradient.addColorStop(0, 'rgba(39,33,26,.4)')
  gradient.addColorStop(1, 'rgba(39,33,26,0)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, 32, 32)
  const shadow = new InstancedMesh(
    new PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
    new MeshBasicMaterial({
      map: new CanvasTexture(surface),
      transparent: true,
      depthWrite: false,
      opacity: 0.65,
    }),
    total,
  )
  shadow.instanceMatrix.setUsage(DynamicDrawUsage)
  shadow.frustumCulled = false
  world.crowdBatches.shadow = { mesh: shadow, slots: 1 }
  world.scene.add(shadow)
}

// 全体游客按角色部件实例化；关闭动态投影，仅保留柔和接触阴影，避免拖动和行走时残影。
export function updatePedestrians(world, time) {
  const density = TIME_PRESETS[world.state.timeOfDay].crowdDensity
  const populationChanged = world.crowdDensity !== density
  if (populationChanged) {
    const target = Math.round(world.crowdActors.length * density)
    let count = 0
    while (count < world.crowdActors.length) {
      const size = world.crowdActors[count].group.members.length
      if (count + size > target) break
      count += size
    }
    // 左侧人数与实际提交绘制的整组角色同源；隐藏者不计算姿态，不新增网格。
    world.state.crowdCount = count
    world.crowdDensity = density
  }
  const delta = world.crowdLastFrame
    ? Math.min(0.08, Math.max(0, (time - world.crowdLastFrame) / 1000))
    : 0
  world.crowdLastFrame = time
  if (world.state.crowdPlaying) world.crowdClock += delta
  const cameraChanged = viewChanged(world, 'crowd', [density, world.streetLampPower.value])
  if (!world.state.crowdPlaying && !cameraChanged && !populationChanged && time > 0) return
  // 增加人流后以 25 fps 更新部件矩阵，镜头和水面仍按原渲染帧率运行。
  if (
    !populationChanged &&
    !cameraChanged &&
    time > 0 &&
    world.crowdPoseFrame > 0 &&
    time - world.crowdPoseFrame < 40
  )
    return
  const poseDelta = world.crowdPoseFrame ? Math.min(0.12, (time - world.crowdPoseFrame) / 1000) : 0
  world.crowdPoseFrame = time
  const displayScale = Math.max(
    1,
    Math.min(2.2, world.camera.position.distanceTo(world.controls.target) / 700),
  )
  const rootObject = world.crowdRoot,
    part = world.crowdPart,
    matrix = world.crowdMatrix
  const batches = Object.values(world.crowdBatches)
  for (const batch of batches) batch.count = 0
  let lightStrength = 0
  const place = (name, slot, x, y, z, sx, sy, sz, rx = 0, rz = 0) => {
    part.position.set(x, y, z)
    part.scale.set(sx, sy, sz)
    part.rotation.set(rx, 0, rz)
    part.updateMatrix()
    matrix.multiplyMatrices(rootObject.matrix, part.matrix)
    const batch = world.crowdBatches[name], index = batch.count++
    batch.mesh.setMatrixAt(index, matrix)
    if (batch.colors) {
      const colors = batch.mesh.instanceColor.array
      for (let channel = 0; channel < 3; channel++)
        colors[index * 3 + channel] = batch.colors[slot * 3 + channel]
      batch.mesh.geometry.attributes.streetLightGlow.setX(index, lightStrength)
    }
  }
  // 缺失的帽子、包、手杖等不占实例；零缩放实例仍会执行顶点着色器。
  const hide = () => {}
  const pixelScale = world.stage.clientHeight / (2 * Math.tan(world.camera.fov * Math.PI / 360))
  for (let i = 0; i < world.state.crowdCount; i++) {
    const actor = world.crowdActors[i]
    const { group, member } = actor,
      viewScale = Math.min(displayScale, group.maxScale || 2.2),
      pose = getPedestrianPose(group, member, world.crowdClock, viewScale)
    lightStrength = world.streetLampPower.value > 0.001 ? getStreetLightStrength(
      [pose.x, 1, pose.z],
      null,
      world.streetLampIndex || world.streetLampPositions,
    ) : 0
    const turn = Math.atan2(
      Math.sin(pose.heading - actor.heading),
      Math.cos(pose.heading - actor.heading),
    )
    actor.heading += turn * Math.min(1, poseDelta * 6)
    rootObject.position.set(pose.x, -0.035, pose.z)
    rootObject.rotation.set(0, actor.heading, 0)
    rootObject.scale.setScalar(member.scale * viewScale)
    rootObject.updateMatrix()
    const walk = pose.moving ? Math.sin(pose.phase) * 0.46 : 0,
      bob = pose.moving ? (1 - Math.cos(pose.phase * 2)) * 0.018 : 0
    const distance = Math.hypot(pose.x - world.camera.position.x, world.camera.position.y, pose.z - world.camera.position.z)
    const pixels = 1.9 * member.scale * viewScale * pixelScale / Math.max(1, distance)
    // 投影不到数个像素时保留躯干、头部和行走轮廓；滞回避免临界距离来回跳变。
    actor.detailed = pixels > (actor.detailed ? 7 : 9)
    place('body', i, 0, 1.1 + bob, 0, 0.24, 0.62, 0.18, member.role === 'elder' ? 0.08 : 0)
    place('head', i, 0, 1.59 + bob, 0.015, 0.18, 0.22, 0.17)
    if (actor.detailed) place('hair', i, 0, 1.72 + bob, -0.025, 0.185, 0.12, 0.17)
    for (let side = 0; side < 2; side++) {
      const sign = side ? 1 : -1,
        legAngle = walk * sign,
        armAngle = -legAngle
      place(
        'leg',
        i * 2 + side,
        sign * 0.11,
        0.8 - Math.cos(legAngle) * 0.35,
        -Math.sin(legAngle) * 0.35,
        0.075,
        0.7,
        0.075,
        legAngle,
      )
      if (actor.detailed) place(
        'shoe',
        i * 2 + side,
        sign * 0.11,
        0.8 - Math.cos(legAngle) * 0.7 - 0.04,
        -Math.sin(legAngle) * 0.7 + 0.045,
        0.15,
        0.1,
        0.27,
        legAngle * 0.2,
      )
      place(
        'arm',
        i * 2 + side,
        sign * 0.265,
        1.35 + bob - Math.cos(armAngle) * 0.25,
        -Math.sin(armAngle) * 0.25,
        0.065,
        0.5,
        0.065,
        armAngle,
      )
      if (actor.detailed) place(
        'hand',
        i * 2 + side,
        sign * 0.265,
        1.35 + bob - Math.cos(armAngle) * 0.51,
        -Math.sin(armAngle) * 0.51,
        0.067,
        0.085,
        0.067,
      )
    }
    if ((actor.detailed && member.role === 'hat') || member.role === 'guide') {
      place('hatBrim', i, 0, 1.8 + bob, 0, 0.31, 0.035, 0.28)
      place('hatTop', i, 0, 1.88 + bob, -0.01, 0.2, 0.16, 0.19)
    } else {
      hide('hatBrim', i)
      hide('hatTop', i)
    }
    if (actor.detailed && (member.role === 'backpacker' || member.role === 'child'))
      place('bag', i, 0, 1.15 + bob, -0.23, 0.32, 0.4, 0.18)
    else hide('bag', i)
    if (member.role === 'skirt') place('skirt', i, 0, 0.69 + bob, 0, 0.34, 0.62, 0.3)
    else hide('skirt', i)
    if (actor.detailed && member.role === 'camera') place('accessory', i, 0, 1.12 + bob, 0.23, 0.25, 0.17, 0.13)
    else if (actor.detailed && member.role === 'skirt') place('accessory', i, 0.27, 0.82 + bob, 0.1, 0.18, 0.23, 0.1)
    else hide('accessory', i)
    if (actor.detailed && member.role === 'elder') place('cane', i, 0.37, 0.48, 0.16, 0.027, 0.9, 0.027)
    else hide('cane', i)
    if (member.role === 'guide') {
      place('flagPole', i, -0.4, 1.65 + bob, 0.1, 0.02, 1.4, 0.02)
      place(
        'flag',
        i,
        -0.19,
        2.19 + bob,
        0.1,
        0.42,
        0.25,
        0.025,
        0,
        Math.sin(pose.phase * 0.35) * 0.05,
      )
    } else {
      hide('flagPole', i)
      hide('flag', i)
    }
    place('shadow', i, 0, 0, 0, 0.85, 1, 0.65)
  }
  batches.forEach(({ mesh, count }) => {
    mesh.count = count
    for (const attribute of [mesh.instanceMatrix, mesh.instanceColor, mesh.geometry.getAttribute('streetLightGlow')]) {
      if (!attribute || !count) continue
      attribute.clearUpdateRanges()
      attribute.addUpdateRange(0, count * attribute.itemSize)
      attribute.needsUpdate = true
    }
  })
}
