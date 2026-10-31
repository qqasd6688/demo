import {
  BoxGeometry,
  CircleGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
} from '../vendor/three/build/three.module.min.js'
import { RoundedBoxGeometry } from '../vendor/three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { getWorldPoint } from './geometry.js'
import {
  advanceDriving,
  adjustDrivingView,
  createDrivingNetwork,
  getDrivingCameraPose,
  getDrivingSpawn,
} from './driving-model.js'

// 车辆模型、驾驶状态与跟随镜头归当前地图实例；不注册监听、不创建第二个动画循环。
export function createDriveCar() {
  const root = new Group()
  const paint = new MeshStandardMaterial({ color: '#a74434', roughness: 0.38, metalness: 0.22 })
  const cream = new MeshStandardMaterial({ color: '#f2e6cd', roughness: 0.6 })
  const glass = new MeshStandardMaterial({ color: '#47717b', roughness: 0.15, metalness: 0.35 })
  const rubber = new MeshStandardMaterial({ color: '#292c2a', roughness: 0.95 })
  const chrome = new MeshStandardMaterial({ color: '#aaa99b', metalness: 0.6, roughness: 0.3 })
  const lamp = new MeshStandardMaterial({
    color: '#fff0c4',
    emissive: '#ffe4a0',
    emissiveIntensity: 0.5,
  })
  const tail = new MeshStandardMaterial({
    color: '#c53526',
    emissive: '#be241c',
    emissiveIntensity: 0.6,
  })
  const add = (geometry, material, x, y, z) => {
    const mesh = new Mesh(geometry, material)
    mesh.position.set(x, y, z)
    mesh.receiveShadow = true
    root.add(mesh)
    return mesh
  }
  add(new RoundedBoxGeometry(1.48, 0.65, 2.65, 3, 0.12), paint, 0, 0.65, 0)
  add(new RoundedBoxGeometry(1.25, 0.72, 1.5, 3, 0.12), cream, 0, 1.23, -0.17)
  add(new BoxGeometry(1.12, 0.43, 0.035), glass, 0, 1.25, 0.59).rotation.x = -0.15
  add(new BoxGeometry(1.08, 0.4, 0.035), glass, 0, 1.25, -0.93).rotation.x = 0.13
  for (const side of [-1, 1]) {
    add(new BoxGeometry(0.035, 0.43, 1.1), glass, side * 0.634, 1.25, -0.16)
    add(new BoxGeometry(0.05, 0.5, 0.075), cream, side * 0.65, 1.25, -0.18)
    add(new BoxGeometry(0.16, 0.15, 0.24), chrome, side * 0.81, 1.04, 0.44)
    add(new BoxGeometry(0.25, 0.2, 0.055), lamp, side * 0.49, 0.7, 1.33)
    add(new BoxGeometry(0.24, 0.19, 0.055), tail, side * 0.5, 0.71, -1.33)
  }
  add(new BoxGeometry(1.4, 0.13, 0.14), cream, 0, 0.42, 1.34)
  add(new BoxGeometry(1.4, 0.13, 0.14), cream, 0, 0.42, -1.34)
  add(new BoxGeometry(0.38, 0.16, 0.04), chrome, 0, 0.59, -1.355)
  const tires = new CylinderGeometry(0.29, 0.29, 0.18, 16)
  tires.rotateZ(Math.PI / 2)
  const hubs = new CylinderGeometry(0.16, 0.16, 0.19, 12)
  hubs.rotateZ(Math.PI / 2)
  const wheels = []
  for (const side of [-1, 1])
    for (const axle of [-1, 1]) {
      wheels.push(add(tires, rubber, side * 0.73, 0.3, axle * 0.86))
      add(hubs, chrome, side * 0.75, 0.3, axle * 0.86)
    }
  // 动态车影用轻量贴地投影，避免每帧重绘整片街区的静态阴影贴图。
  const shadow = add(
    new CircleGeometry(1, 32),
    new MeshBasicMaterial({
      color: '#302a22',
      transparent: true,
      opacity: 0.16,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
    }),
    0,
    0.035,
    0,
  )
  shadow.rotation.x = -Math.PI / 2
  shadow.scale.set(0.97, 1.55, 1)
  return { root, wheels }
}

export function beginDriving(world) {
  world.drivingNetwork ??= createDrivingNetwork(
    world.data.roads,
    world.projectedBuildings,
    world.origin,
    [
      ...world.streetLampPositions.map((p) => ({ ...p, radius: 0.35 })),
      ...world.landmarks.map((place) => {
        const [x, z] = getWorldPoint(place.position, world.origin)
        return { x, z, radius: 1.2 }
      }),
    ],
  )
  // 按用户指定固定在南后街南口、澳门桥北侧引道，面向街内；再次进入也回到同一起点。
  const entranceRoad = world.data.roads.find((road) => road.id === 760528367)
  if (!entranceRoad) return false
  const [a, b] = entranceRoad.points.map((point) => getWorldPoint(point, world.origin))
  const facing = Math.atan2(b[0] - a[0], b[1] - a[1])
  const focus = [a[0] + (b[0] - a[0]) * 0.6, a[1] + (b[1] - a[1]) * 0.6]
  const pose = getDrivingSpawn(world.drivingNetwork, focus, facing)
  if (!pose) return false
  world.controls.enableDamping = false
  world.controls.update()
  world.driver = {
    pose,
    keys: new Set(),
    lastFrame: 0,
    lookPointer: null,
    savedView: {
      position: world.camera.position.clone(),
      target: world.controls.target.clone(),
      near: world.camera.near,
      overview: world.state.overview,
      top: world.state.top,
    },
  }
  if (!world.driveCar) {
    world.driveCar = createDriveCar()
    world.scene.add(world.driveCar.root)
  }
  world.driveCar.root.visible = true
  world.controls.enabled = false
  world.camera.near = 0.1
  world.camera.updateProjectionMatrix()
  world.state.driving = true
  world.pointerStart = null
  world.activePointers.clear()
  world.state.overview = world.state.top = false
  updateDriving(world, 0)
  world.canvas?.focus({ preventScroll: true })
  return true
}

export function beginDrivingLook(world, event) {
  if (!world.state.driving || event.button !== 0 || event.isPrimary === false || world.driver.lookPointer) return
  world.driver.lookPointer = { id: event.pointerId, x: event.clientX, y: event.clientY }
  world.canvas.setPointerCapture(event.pointerId)
  world.canvas.focus({ preventScroll: true })
  event.preventDefault()
}

export function endDrivingLook(world, event) {
  const pointer = world.driver?.lookPointer
  if (!pointer || (event && event.pointerId !== pointer.id)) return
  world.driver.lookPointer = null
  if (world.canvas.hasPointerCapture(pointer.id)) world.canvas.releasePointerCapture(pointer.id)
}

export function moveDrivingLook(world, event) {
  const pointer = world.driver?.lookPointer
  if (!world.state.driving || !pointer || event.pointerId !== pointer.id) return
  if (!(event.buttons & 1)) { endDrivingLook(world, event); return }
  adjustDrivingView(world.driver.pose, event.clientX - pointer.x, event.clientY - pointer.y)
  pointer.x = event.clientX
  pointer.y = event.clientY
  event.preventDefault()
}

export function clearDrivingInput(world) {
  if (!world.driver) return
  endDrivingLook(world)
  world.driver.keys.clear()
  world.driver.pose.speed = world.driver.pose.strafeSpeed = 0
  world.driver.lastFrame = 0
  world.state.driveSpeed = 0
}

export function stopDriving(world) {
  if (!world.state.driving) return null
  const saved = world.driver.savedView
  clearDrivingInput(world)
  world.state.driving = false
  world.state.driveBlocked = false
  world.driveCar.root.visible = false
  world.controls.enabled = true
  world.controls.enableDamping = true
  world.camera.near = saved.near
  world.camera.updateProjectionMatrix()
  return saved
}

export function updateDriving(world, time) {
  if (!world.state.driving) return
  const driver = world.driver
  const elapsed = driver.lastFrame ? (time - driver.lastFrame) / 1000 : 0
  driver.lastFrame = time
  const distance = advanceDriving(world.drivingNetwork, driver.pose, driver.keys, elapsed)
  const pose = driver.pose
  world.driveCar.root.position.set(pose.x, 0, pose.z)
  world.driveCar.root.rotation.y = pose.carYaw
  world.driveCar.wheels.forEach((wheel) => {
    wheel.rotation.x += distance / 0.29
  })
  const camera = getDrivingCameraPose(world.drivingNetwork, pose)
  world.camera.position.fromArray(camera.position)
  world.controls.target.fromArray(camera.target)
  world.camera.lookAt(world.controls.target)
  world.state.driveSpeed = Math.round(Math.hypot(pose.speed, pose.strafeSpeed) * 3.6)
  world.state.driveBlocked = pose.blocked
  world.state.driveRoad = pose.road
}
