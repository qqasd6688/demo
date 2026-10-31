import test from 'node:test'
import assert from 'node:assert/strict'
import { advanceDriving, adjustDrivingView, createDrivingNetwork, getDrivingCameraPose, isDrivingPositionValid } from '../assets/runtime/driving-model.js'
import { beginDrivingLook, moveDrivingLook, endDrivingLook, clearDrivingInput } from '../assets/runtime/driving.js'

const coordinate = ([x, z]) => [x / 111319.49079327358, -z / 111319.49079327358]
const road = { name: '南后街', kind: 'pedestrian', points: [[0, -100], [0, 100]].map(coordinate) }
const network = (buildings = [], obstacles = []) => createDrivingNetwork([road], buildings, [0, 0], obstacles)
const pose = () => ({ x: 0, z: 0, yaw: 0, carYaw: 0, speed: 0, strafeSpeed: 0 })
const offset = camera => camera.position.map((value, i) => value - camera.target[i])
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`)
const drive = (net, car, keys, frames = 60) => {
  for (let i = 0; i < frames; i++) {
    advanceDriving(net, car, new Set(keys), 1 / 60)
    assert.ok(isDrivingPositionValid(net, car.x, car.z, car.carYaw))
  }
}

test('鼠标调整水平朝向与俯仰，空旷处车头跟随，俯仰限制避免翻转', () => {
  const net = network(), car = pose(), before = getDrivingCameraPose(net, car)
  adjustDrivingView(car, 100, 50)
  advanceDriving(net, car, new Set(), 0)
  const after = getDrivingCameraPose(net, car), direction = offset(after)
  close(car.carYaw, car.yaw)
  assert.ok(car.yaw < 0)
  assert.ok(after.position[1] > before.position[1])
  close(-direction[0] / Math.hypot(direction[0], direction[2]), Math.sin(car.carYaw))
  adjustDrivingView(car, 0, -100000)
  assert.ok(getDrivingCameraPose(net, car).position[1] >= 2.6)
  adjustDrivingView(car, 0, 100000)
  assert.ok(car.pitch < Math.PI / 2)
  const stable = { ...car }
  adjustDrivingView(car, NaN, 0)
  assert.deepEqual(car, stable)
})

test('A/D 沿视角左右平移，朝向和相机相对车身的位置不变', () => {
  const net = network()
  for (const key of ['KeyA', 'KeyD']) {
    const car = pose()
    adjustDrivingView(car, -70, 25)
    advanceDriving(net, car, new Set(), 0)
    const yaw = car.yaw, pitch = car.pitch, before = offset(getDrivingCameraPose(net, car))
    drive(net, car, [key], 30)
    close(car.yaw, yaw); close(car.carYaw, yaw); close(car.pitch, pitch)
    offset(getDrivingCameraPose(net, car)).forEach((value, i) => close(value, before[i]))
    close(car.x * Math.sin(yaw) + car.z * Math.cos(yaw), 0)
    assert.ok(key === 'KeyD' ? car.x < 0 : car.x > 0)
  }
})

test('斜向组合键不叠加极速，相反方向抵消，后退仍使用倒车速度', () => {
  const net = network(), diagonal = pose(), reverse = pose()
  drive(net, diagonal, ['KeyW', 'KeyD'], 45)
  close(Math.hypot(diagonal.speed, diagonal.strafeSpeed), 6)
  drive(net, diagonal, ['KeyW', 'KeyS', 'KeyA', 'KeyD'], 30)
  close(diagonal.speed, 0); close(diagonal.strafeSpeed, 0)
  drive(net, reverse, ['KeyS'])
  close(reverse.speed, -3)
  assert.ok(reverse.z < 0)
  const z = reverse.z
  advanceDriving(net, reverse, new Set(['KeyS']), 20)
  assert.ok(Math.abs(reverse.z - z) <= .15 + 1e-9)
})

test('左右平移仍受道路边缘、薄墙和路灯约束', () => {
  const wall = { height: 8, ring: [[-3,-10],[-2.97,-10],[-2.97,10],[-3,10],[-3,-10]], holes: [] }
  for (const net of [network(), network([wall]), network([], [{ x: -3, z: 0, radius: .35 }])]) {
    const car = pose()
    drive(net, car, ['KeyD'], 180)
    assert.ok(car.blocked)
    assert.ok(car.x > -5.02)
    close(car.speed, 0); close(car.strafeSpeed, 0)
    const stop = car.x
    drive(net, car, ['KeyA'], 30)
    assert.ok(car.x > stop)
  }
})

test('大幅鼠标转向检查中间车身范围，不能跨过路灯直接旋转半圈', () => {
  const net = network([], [{ x: 1.4, z: 0, radius: .12 }]), car = pose()
  assert.ok(isDrivingPositionValid(net, 0, 0, 0))
  assert.ok(isDrivingPositionValid(net, 0, 0, Math.PI))
  adjustDrivingView(car, -Math.PI / .004, 0)
  advanceDriving(net, car, new Set(), 1 / 60)
  assert.ok(car.carYaw > 0 && car.carYaw < Math.PI / 2)
  assert.ok(isDrivingPositionValid(net, 0, 0, car.carYaw))
  assert.ok(Math.abs(car.yaw - Math.PI) < 1e-9)
})

test('只有左键主指针能拖动；释放、失焦和捕获丢失后不残留转向或移动', () => {
  const captured = new Set(), world = { state: { driving: true, driveSpeed: 8 },
    driver: { pose: pose(), keys: new Set(['KeyW']), lastFrame: 10, lookPointer: null },
    canvas: { focus() {}, setPointerCapture(id) { captured.add(id) }, hasPointerCapture(id) { return captured.has(id) }, releasePointerCapture(id) { captured.delete(id) } } }
  const event = overrides => ({ pointerId: 7, button: 0, buttons: 1, isPrimary: true, clientX: 200, clientY: 200, preventDefault() {}, ...overrides })
  beginDrivingLook(world, event({ button: 2 }))
  beginDrivingLook(world, event({ isPrimary: false }))
  assert.equal(world.driver.lookPointer, null)
  beginDrivingLook(world, event({}))
  assert.ok(captured.has(7))
  moveDrivingLook(world, event({ pointerId: 8, clientX: 900 }))
  close(world.driver.pose.yaw, 0)
  moveDrivingLook(world, event({ clientX: 240, clientY: 220 }))
  assert.ok(world.driver.pose.yaw < 0)
  endDrivingLook(world, event({ pointerId: 8 }))
  assert.ok(captured.has(7))
  moveDrivingLook(world, event({ buttons: 0, clientX: 600 }))
  assert.equal(world.driver.lookPointer, null)
  const yaw = world.driver.pose.yaw
  moveDrivingLook(world, event({ clientX: 900 }))
  close(world.driver.pose.yaw, yaw)
  beginDrivingLook(world, event({ clientX: 900 }))
  moveDrivingLook(world, event({ clientX: 900 }))
  close(world.driver.pose.yaw, yaw)
  world.driver.pose.speed = world.driver.pose.strafeSpeed = 3
  clearDrivingInput(world)
  assert.equal(captured.size, 0)
  assert.equal(world.driver.keys.size, 0)
  assert.equal(world.driver.lookPointer, null)
  assert.equal(world.state.driveSpeed, 0)
  close(world.driver.pose.speed, 0); close(world.driver.pose.strafeSpeed, 0)
})
