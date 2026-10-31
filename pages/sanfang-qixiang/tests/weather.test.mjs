import test from 'node:test'
import assert from 'node:assert/strict'
import { Mesh } from '../assets/vendor/three/build/three.module.min.js'
import { createBuildingGeometries } from '../assets/runtime/geometry.js'
import { createStreetPavingGeometry } from '../assets/runtime/paving.js'
import { createWeatherHeightField, createRainImpacts } from '../assets/runtime/weather-field.js'
import { approachWeather, withoutWeatherReflection } from '../assets/runtime/weather-surface.js'

const coordinate = ([x, z]) => [x / 111319.49079327358, -z / 111319.49079327358]
const closed = points => [...points, points[0]].map(coordinate)

test('降水高度图跟随屋面斜坡并保留天井，不以建筑包围盒遮住院落', () => {
  const parts = createBuildingGeometries({ core: true, height: 6,
    ring: closed([[-10, -8], [10, -8], [10, 8], [-10, 8]]),
    holes: [closed([[-2, -2], [-2, 2], [2, 2], [2, -2]])] }, [0, 0])
  const mesh = new Mesh(parts.roof)
  mesh.userData.weatherRoof = true
  const field = createWeatherHeightField([mesh], [-20, -20], [20, 20], 256)
  assert.equal(field.sample(0, 0), 0)
  assert.equal(field.sample(18, 18), 0)
  assert.equal(field.sample(50, 50), 0)
  assert.ok(field.sample(6, 0) > field.sample(6, 6) + 2)
  assert.ok(field.sample(6, 0) > 9 && field.sample(6, 0) < 10)
  assert.equal(field.texture.colorSpace, '')
  assert.equal(field.texture.generateMipmaps, false)
  assert.ok(field.roofs.length > 0)
  field.texture.dispose(); mesh.material.dispose()
  Object.values(parts).forEach(geometry => geometry.dispose())
})

test('雨滴落点避开被遮蔽路面，屋面落点保留实际高度与法线，刷新结果可重复', () => {
  const parts = createBuildingGeometries({ core: true, height: 6,
    ring: closed([[-4, -4], [4, -4], [4, 4], [-4, 4]]), holes: [] }, [0, 0])
  const mesh = new Mesh(parts.roof)
  mesh.userData.weatherRoof = true
  const field = createWeatherHeightField([mesh], [-20, -20], [20, 20], 256)
  const paving = createStreetPavingGeometry([{name:'测试巷',kind:'pedestrian',points:[[-18,0],[18,0]].map(coordinate)}],[0,0])
  const world = { streetPaving: { geometry: paving }, origin: [0, 0] }
  const a = createRainImpacts(world, field), b = createRainImpacts(world, field)
  assert.deepEqual(a, b)
  let ground = 0, roof = 0
  for (let i = 0; i < a.kinds.length / 2; i++) {
    assert.ok(a.hits.subarray(i * 4, i * 4 + 4).every(Number.isFinite))
    if (a.kinds[i * 2]) {
      roof++
      assert.ok(a.hits[i * 4 + 1] > 6)
      assert.ok(a.normals[i * 3 + 1] > .35)
    } else {
      ground++
      assert.ok(field.sample(a.hits[i * 4], a.hits[i * 4 + 2]) < .5)
    }
  }
  assert.ok(ground > 1000 && ground < 2100)
  assert.equal(roof, 900)
  paving.dispose(); field.texture.dispose(); mesh.material.dispose()
  Object.values(parts).forEach(geometry => geometry.dispose())
})

test('湿润与积雪渐变不依赖帧率，暂停时保持状态', () => {
  let fast = 0, slow = 0
  for (let i = 0; i < 60; i++) fast = approachWeather(fast, .86, 1 / 60, .32)
  for (let i = 0; i < 10; i++) slow = approachWeather(slow, .86, .1, .32)
  assert.ok(Math.abs(fast - slow) < 1e-12)
  assert.equal(approachWeather(fast, 0, 0, .65), fast)
  assert.equal(approachWeather(fast, 0, -1, .65), fast)
  assert.ok(approachWeather(1, 0, .1, .65) > .9)
})

test('倒影捕获期间解绑同一渲染目标，异常和嵌套返回后恢复纹理与可见性', () => {
  const texture = {}, world = { weatherReflection: { sampler: { value: texture }, enabled: { value: 1 } },
    weatherRain: { visible: true }, weatherSnow: { visible: false }, weatherSplash: { visible: true } }
  assert.throws(() => withoutWeatherReflection(world, () => {
    assert.equal(world.weatherReflection.sampler.value, null)
    assert.equal(world.weatherReflection.enabled.value, 0)
    assert.equal(world.weatherRain.visible, false)
    withoutWeatherReflection(world, () => assert.equal(world.weatherReflection.sampler.value, null))
    assert.equal(world.weatherReflection.enabled.value, 0)
    throw new Error('capture interrupted')
  }), /capture interrupted/)
  assert.equal(world.weatherReflection.sampler.value, texture)
  assert.equal(world.weatherReflection.enabled.value, 1)
  assert.equal(world.weatherRain.visible, true)
  assert.equal(world.weatherSnow.visible, false)
  assert.equal(world.weatherSplash.visible, true)
})
