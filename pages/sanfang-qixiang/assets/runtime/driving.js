import { getWorldPoint } from './geometry.js'
import { loadWalkingCharacter, updateCharacterPose } from './character.js'
import {
  advanceDriving, adjustDrivingView, createDrivingNetwork, getDrivingCameraPose, getDrivingSpawn,
} from './driving-model.js'

// 沿用导航接口；人物、输入与跟随镜头归当前地图实例，只由主循环更新。
export async function ensureWalkingCharacter(world) {
  if (world.walker) return world.walker
  if (!world.walkerLoad) {
    world.walkerLoad = loadWalkingCharacter(world.abort.signal).then(character => {
      if (world.disposed) { character.dispose(); throw new Error('地图已关闭') }
      world.walker = character
      world.scene.add(character.root)
      return character
    }).finally(() => { world.walkerLoad = null })
  }
  return world.walkerLoad
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
  if (!world.walker) return false
  world.walker.root.visible = true
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
  world.walkTouch?.clear()
  world.driver.pose.speed = world.driver.pose.strafeSpeed = world.driver.pose.travelSpeed = 0
  world.driver.lastFrame = 0
  world.state.driveSpeed = 0
}

export function stopDriving(world) {
  if (!world.state.driving) return null
  const saved = world.driver.savedView
  clearDrivingInput(world)
  world.state.driving = false
  world.state.driveBlocked = false
  world.walker.root.visible = false
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
  world.walker.root.position.set(pose.x, 0, pose.z)
  world.walker.root.rotation.y = pose.carYaw
  updateCharacterPose(world.walker, distance, elapsed, pose.travelSpeed ?? 0)
  const camera = getDrivingCameraPose(world.drivingNetwork, pose)
  world.camera.position.fromArray(camera.position)
  world.controls.target.fromArray(camera.target)
  world.camera.lookAt(world.controls.target)
  world.state.driveSpeed = Math.round((pose.travelSpeed ?? 0) * 10) / 10
  world.state.driveBlocked = pose.blocked
  world.state.driveRoad = pose.road
}
