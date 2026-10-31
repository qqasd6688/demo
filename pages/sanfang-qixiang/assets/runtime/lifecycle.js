import { getOverviewPose, cancelFlight, updateFlight } from './navigation.js'
import { updateLabels, updateCompass, drawMiniMap } from './overlays.js'
import { updateWeather } from './weather.js'
import { updateRiverWater } from './river.js'
import { updateInkMountains } from './mountains.js'
import { updatePedestrians } from './pedestrians.js'
import { clearDrivingInput, updateDriving } from './driving.js'
import { finishEntrance, updateEntrance } from './entrance.js'
import { updateSceneEffects } from './scene-effects.js'
import { beginRenderFrame, endRenderFrame, resizeRenderBuffer } from './render-budget.js'
import { updateVegetation } from './vegetation-motion.js'
import { updateSunShadow } from './sun-shadow.js'

// 统一帧循环、视口调整、状态反馈与资源释放；隐藏页面暂停时钟。
export function notify(world, message, duration = 2800) {
  world.state.statusText = message
  world.state.statusUntil = performance.now() + duration
}

export function resize(world) {
  if (!world.renderer || world.disposed) return
  const w = Math.max(1, world.stage.clientWidth),
    h = Math.max(1, world.stage.clientHeight)
  resizeRenderBuffer(world, w, h)
  world.camera.aspect = w / h
  world.camera.updateProjectionMatrix()
  world.overlayEpoch = (world.overlayEpoch || 0) + 1
  world.labelLayoutUntil = performance.now() + 950
  world.labels.forEach((label) => {
    label.width = label.element.offsetWidth || label.width
    label.height = label.element.offsetHeight || label.height
  })
  if (world.state.ready && world.state.overview) {
    const pose = getOverviewPose(world)
    // 视口变化只修正当前全景飞行的终点，避免打断导航。
    if (world.state.flight) {
      world.state.flight.toPosition = pose.position.toArray()
      world.state.flight.toTarget = pose.target.toArray()
    } else {
      world.camera.position.copy(pose.position)
      world.controls.target.copy(pose.target)
      world.controls.update()
    }
  }
}

export function render(world, time) {
  if (world.disposed || world.state.lost || document.hidden) return
  beginRenderFrame(world, time)
  if (world.state.driving) updateDriving(world, time)
  else {
    updateFlight(world, time)
    world.controls.update()
  }
  updateEntrance(world, time)
  if (!world.state.flight && !world.state.driving) {
    const top = world.controls.getPolarAngle() < 0.1
    if (top !== world.state.top) {
      world.state.top = top
    }
  }
  // 仅保留近地保护，允许贴近街巷；不能用较高的固定高度再次卡住放大。
  if (world.camera.position.y < 2.5) {
    world.camera.position.y = 2.5
    world.controls.update()
  }
  if (world.state.statusUntil && time > world.state.statusUntil) {
    world.state.statusText = ''
    world.state.statusUntil = 0
  }
  world.camera.updateMatrixWorld()
  updateVegetation(world, time)
  updateSunShadow(world, time)
  updateLabels(world, time)
  updateWeather(world, time)
  updateSceneEffects(world, time)
  updateRiverWater(world, time)
  updateInkMountains(world)
  updatePedestrians(world, time)
  updateCompass(world)
  drawMiniMap(world, time)
  world.renderer.render(world.scene, world.camera)
  endRenderFrame(world, time)
}

export function showError(world, error) {
  console.error(`${world.data.meta.name ?? '三坊七巷'}地图初始化失败：`, error)
  world.state.ready = false
  world.state.lost = true
  world.state.loading = true
  cancelFlight(world)
  world.state.entrancePhase = 'complete'
  world.renderer?.setAnimationLoop(null)
  world.state.error = /webgl|context|graphics/i.test(error?.message || '')
    ? '请在支持 WebGL2 的新版 Chrome 或 Edge 中打开，并启用硬件加速。'
    : '地图程序初始化未完成，请点击重新尝试。'
}

export function dispose(world) {
  if (world.disposed) return
  world.disposed = true
  finishEntrance(world)
  cancelAnimationFrame(world.initialFrame)
  clearTimeout(world.initialTimer)
  world.state.ready = false
  world.state.flight = null
  world.state.tour = false
  world.state.driving = false
  clearDrivingInput(world)
  world.abort.abort()
  world.resizeObserver?.disconnect()
  world.renderBudget?.panel?.remove()
  world.environmentTarget?.dispose()
  world.environmentGenerator?.dispose()
  world.controls?.dispose()
  world.renderer?.setAnimationLoop(null)
  const geometries = new Set(),
    materials = new Set(),
    textures = new Set()
  world.scene?.traverse((object) => {
    if (object.isInstancedMesh) object.dispose()
    if (object.geometry) geometries.add(object.geometry)
    if (object.customDepthMaterial) materials.add(object.customDepthMaterial)
    if (object.material) {
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        materials.add(material)
        for (const value of Object.values(material)) if (value?.isTexture) textures.add(value)
        for (const uniform of Object.values(material.uniforms || {}))
          if (uniform.value?.isTexture) textures.add(uniform.value)
      }
    }
  })
  geometries.forEach((g) => g.dispose())
  materials.forEach((m) => m.dispose())
  textures.forEach((t) => t.dispose())
  world.riverMaterial?.uniforms.mirrorSampler.value.renderTarget?.dispose()
  world.sun?.shadow.dispose()
  world.scene?.clear()
  world.labelLayer.replaceChildren()
  world.renderer?.dispose()
  world.renderer?.forceContextLoss()
  world.crowdActors = []
  world.crowdBatches = {}
  world.driver = world.driveCar = world.drivingNetwork = null
  world.effects = null
}
