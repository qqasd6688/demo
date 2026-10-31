import {
  AdditiveBlending, BufferGeometry, Color, DirectionalLight, DoubleSide,
  Float32BufferAttribute, Group, Mesh, MeshBasicMaterial, Vector3,
} from '../vendor/three/build/three.module.min.js'
import { WEATHER_PRESETS, TIME_PRESETS } from './environment-presets.js'
import { setSunShadowDirection } from './sun-shadow.js'
import { updateSkyLight } from './sky-light.js'
import { notify } from './lifecycle.js'
import { buildWeatherParticles, updateWeatherParticles } from './weather-particles.js'
import { approachWeather, configureWeatherSurfaces } from './weather-surface.js'

// 雨雪、表面湿润与积雪、雷电共用前台时钟，粒子和材质各自保持固定批次。
export function buildWeather(world) {
  buildWeatherParticles(world)
  world.lightningRoot = new Group()
  for (const [color, opacity] of [
    ['#b0c7ff', 0.16],
    ['#eff6ff', 0.9],
  ]) {
    world.lightningRoot.add(
      new Mesh(
        new BufferGeometry(),
        new MeshBasicMaterial({
          color,
          transparent: true,
          opacity,
          blending: AdditiveBlending,
          depthWrite: false,
          side: DoubleSide,
          toneMapped: false,
        }),
      ),
    )
  }
  world.lightningRoot.visible = false
  world.scene.add(world.lightningRoot)
  world.lightningLight = new DirectionalLight('#dce8ff', 0)
  world.lightningLight.target.position.copy(world.mapCenter)
  world.scene.add(world.lightningLight, world.lightningLight.target)
  configureWeatherSurfaces(world)
}

// 单次雷电为短促双脉冲，事件之间至少间隔十余秒，不在普通拖动时触发。
export function getLightningStrength(age) {
  if (age < 0 || age > 0.65) return 0
  return Math.min(
    1,
    Math.exp(-Math.pow((age - 0.065) / 0.037, 2)) +
      0.62 * Math.exp(-Math.pow((age - 0.21) / 0.065, 2)),
  )
}

export function triggerLightning(world) {
  const back = new Vector3(
    world.mapCenter.x - world.camera.position.x,
    0,
    world.mapCenter.z - world.camera.position.z,
  ).normalize()
  const right = new Vector3(-back.z, 0, back.x)
  const span = Math.max(world.width, world.depth),
    side = (Math.random() - 0.5) * span * 1.5
  world.lightningRoot.position
    .copy(world.mapCenter)
    .addScaledVector(back, span * (1.3 + Math.random() * 0.5))
    .addScaledVector(right, side)
  world.lightningRoot.position.y = 35
  world.lightningRoot.rotation.y = Math.atan2(
    world.camera.position.x - world.lightningRoot.position.x,
    world.camera.position.z - world.lightningRoot.position.z,
  )
  const segments = [],
    top = 480 + Math.random() * 320
  let x = (Math.random() - 0.5) * 70,
    y = top
  for (let i = 0; i < 12; i++) {
    const nx = x + (Math.random() - 0.5) * 65,
      ny = top * (1 - (i + 1) / 12)
    segments.push([x, y, nx, ny])
    if (i > 2 && i < 9 && Math.random() < 0.32) {
      const direction = Math.random() < 0.5 ? -1 : 1
      segments.push([
        nx,
        ny,
        nx + direction * (30 + Math.random() * 65),
        ny - 25 - Math.random() * 45,
      ])
    }
    x = nx
    y = ny
  }
  world.lightningRoot.children.forEach((mesh, index) => {
    const vertices = [],
      thickness = index === 0 ? 5.5 : 1.25
    for (const [ax, ay, bx, by] of segments) {
      const length = Math.max(0.01, Math.hypot(bx - ax, by - ay)),
        nx = (-(by - ay) / length) * thickness,
        nz = ((bx - ax) / length) * thickness
      vertices.push(
        ax + nx,
        ay + nz,
        0,
        ax - nx,
        ay - nz,
        0,
        bx - nx,
        by - nz,
        0,
        ax + nx,
        ay + nz,
        0,
        bx - nx,
        by - nz,
        0,
        bx + nx,
        by + nz,
        0,
      )
    }
    mesh.geometry.dispose()
    mesh.geometry = new BufferGeometry().setAttribute(
      'position',
      new Float32BufferAttribute(vertices, 3),
    )
  })
  world.lightningLight.position.copy(world.lightningRoot.position)
  world.lightningLight.position.y = top + 150
  world.lightningStartedAt = world.weatherClock
  world.lightningNextAt = world.weatherClock + 13 + Math.random() * 24
}

// 所有天气时钟只累计前台帧；雨雪使用相机附近空气层，远景不再像地面贴了一排短线。
export function updateWeather(world, time) {
  const delta = world.weatherLastFrame
    ? Math.min(0.08, Math.max(0, (time - world.weatherLastFrame) / 1000))
    : 0
  world.weatherLastFrame = time
  const weather = WEATHER_PRESETS[world.state.weather],
    distance = world.camera.position.distanceTo(world.controls.target)
  world.scene.fog.near =
    world.state.weather === 'sunny' ? 2200 : Math.max(80, distance * weather.fogNear)
  world.scene.fog.far = world.state.weather === 'sunny' ? 5000 : distance + weather.fogFar
  if (world.state.weather !== 'sunny' || world.weatherWetness.value > .01) world.weatherClock += delta
  world.weatherTime.value = world.weatherClock
  world.weatherWetness.value = approachWeather(world.weatherWetness.value, weather.wet, delta, .65)
  world.weatherSnowCover.value = approachWeather(world.weatherSnowCover.value, weather.snow, delta, .32)
  updateWeatherParticles(world)
  if (!world.lightningRoot) return
  if (world.state.weather === 'rainy' && world.weatherClock >= world.lightningNextAt)
    triggerLightning(world)
  const age = world.weatherClock - world.lightningStartedAt
  const flash =
    world.state.weather === 'rainy' ? getLightningStrength(age) : 0
  world.lightningRoot.visible = flash > 0.006
  world.lightningRoot.children.forEach(
    (mesh, index) => (mesh.material.opacity = flash * (index === 0 ? 0.15 : 0.9)),
  )
  world.lightningLight.intensity = flash * (world.state.timeOfDay === 'night' ? 2.2 : 1.4)
  world.hemisphere.intensity = world.weatherAmbient + flash * 0.38
  world.scene.background
    .copy(world.weatherSkyColor.value)
    .lerp(world.lightningTint, flash * (world.state.timeOfDay === 'night' ? 0.15 : 0.055))
  world.scene.fog.color.copy(world.scene.background)
}

export function applyEnvironment(
  world,
  id = world.state.timeOfDay,
  weatherId = world.state.weather,
  announce = true,
) {
  if (!world.state.ready || world.state.lost) return
  const preset = TIME_PRESETS[id] && { ...TIME_PRESETS[id], ...world.palette?.environment }
  const weather = WEATHER_PRESETS[weatherId]
  if (!preset || !weather) return
  world.state.timeOfDay = id
  world.state.weather = weatherId
  world.state.theme = preset.lamps ? 'night' : 'day'
  world.scene.background
    .set(preset.sky)
    .lerp(new Color(weather.tint), weather.blend * (id === 'night' ? 0.12 : 1))
  world.scene.fog.color.copy(world.scene.background)
  world.hemisphere.intensity = preset.ambient * weather.ambient
  world.weatherAmbient = world.hemisphere.intensity
  world.weatherSkyColor.value.copy(world.scene.background)
  world.hemisphere.color.set(preset.skyLight)
  world.sun.intensity = preset.sunlight * weather.sunlight
  world.sun.color.set(preset.sun)
  world.heritageBounce?.value.copy(world.sun.color)
    .multiply(new Color('#b9aa8b')).multiplyScalar(preset.sunlight * weather.sunlight * 0.09)
  world.sun.position.fromArray(preset.position)
  setSunShadowDirection(world)
  updateSkyLight(world)
  world.renderer.toneMappingExposure = preset.exposure * weather.exposure
  world.inkMountainLayers.forEach((layer) =>
    layer.material.uniforms.uTint.value
      .set(world.palette?.mountain ?? layer.tones[id])
      .lerp(world.scene.background, weather.haze),
  )
  world.weatherSurfaces.forEach(({ material, color, roughness }) => {
    material.color.copy(color)
    material.roughness = roughness
  })
  if (weather.snow) world.weatherSnowCover.value = Math.max(.1, world.weatherSnowCover.value)
  if (world.weatherRain) {
    world.weatherRain.visible = weatherId === 'rainy'
    world.weatherRain.material.uniforms.uOpacity.value = id === 'night' ? .48 : .68
    world.weatherRain.material.uniforms.uColor.value.set(id === 'night' ? '#aebed0' : '#d2dce4')
  }
  if (world.weatherSnow) {
    world.weatherSnow.visible = weatherId === 'snowy'
    world.weatherSnow.material.uniforms.uOpacity.value = id === 'night' ? .68 : .88
    world.weatherSnow.material.uniforms.uColor.value.set(id === 'night' ? '#bacce0' : '#edf4f8')
  }
  if (world.weatherSplash) {
    world.weatherSplash.visible = weatherId === 'rainy'
    world.weatherSplash.children.forEach(mesh => { mesh.material.uniforms.uOpacity.value = id === 'night' ? .23 : .4 })
  }
  if (world.lightningRoot) world.lightningRoot.visible = false
  if (world.lightningLight) world.lightningLight.intensity = 0
  world.lightningStartedAt = -Infinity
  world.lightningNextAt =
    weatherId === 'rainy' ? world.weatherClock + 7 + Math.random() * 9 : Infinity
  world.weatherLastFrame = 0
  // 按明确要求，切到夜晚时窗灯、路灯和地面光晕一次性同时点亮。
  world.lanternMaterial.emissiveIntensity = preset.lamps
  world.glowMaterial.opacity = preset.glow
  if (world.windowMaterial) world.windowMaterial.emissiveIntensity = preset.lamps * 0.4
  world.streetLampPower.value = preset.lamps / TIME_PRESETS.night.lamps
  if (world.heartTree) {
    for (const light of world.heartTree.userData.uplights) light.intensity = preset.lamps * 18
  }
  if (world.riverMaterial) {
    const colors = { dawn: '#497d75', day: '#287b78', dusk: '#426c64', night: '#234448' },
      u = world.riverMaterial.uniforms
    u.waterColor.value.set(world.palette?.water ?? colors[id])
    u.distortionScale.value = 1.25 + weather.wet * 1.1
    if (u.uCausticStrength) u.uCausticStrength.value = weather.sunlight * weather.sunlight
    if (u.uDaylight)
      u.uDaylight.value =
        ({ dawn: 0.7, day: 1, dusk: 0.48, night: 0.035 }[id] ?? 1) *
        (0.35 + weather.sunlight * 0.65)
    u.sunColor.value
      .copy(world.sun.color)
      .multiplyScalar(
        (id === 'night' ? 0.12 : id === 'dusk' ? 0.65 : 1) * (0.35 + weather.sunlight * 0.65),
      )
    u.sunDirection.value.copy(world.shadowFit.direction)
    world.waterReflectionAt = -Infinity
  }
  world.renderer.shadowMap.needsUpdate = true
  if (announce)
    notify(
      world,
      '已切换' +
        preset.label +
        ' · ' +
        weather.label +
        ' · ' +
        (preset.lamps ? '街灯亮起，暖光照亮巷道' : '自然采光，街灯关闭'),
    )
}
