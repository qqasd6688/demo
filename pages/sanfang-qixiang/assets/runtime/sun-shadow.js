import { Frustum, Matrix4, Sphere, Vector3 } from '../vendor/three/build/three.module.min.js'

// 单张阴影图覆盖可见建筑和周围投影范围；分辨率不变，把 texel 留给当前视野。
// 光空间中心对齐 texel，尺寸以 32m 为单位量化，降低缓慢拖动时的爬动。
export function snapShadowBounds(min, max, mapSize, padding = 64) {
  const extent = Math.max(128, Math.ceil((max - min + padding * 2) / 32) * 32)
  const texel = extent / mapSize
  const center = Math.round((min + max) / 2 / texel) * texel
  return { min: center - extent / 2, max: center + extent / 2, texel }
}

export function setSunShadowDirection(world) {
  if (!world.shadowFit) {
    const receivers = world.projectedBuildings.map((building) => {
      const xs = building.ring.map(p => p[0]), zs = building.ring.map(p => p[1])
      const min = new Vector3(Math.min(...xs), 0, Math.min(...zs))
      const max = new Vector3(Math.max(...xs), building.height, Math.max(...zs))
      return { min, max, sphere: new Sphere(min.clone().add(max).multiplyScalar(.5), min.distanceTo(max) / 2) }
    })
    world.shadowFit = {
      receivers, direction: new Vector3(), rotation: new Matrix4(), frustum: new Frustum(),
      view: new Float64Array(16), projection: new Matrix4(), point: new Vector3(),
      dirty: true, next: 0, windAt: 0,
    }
  }
  const fit = world.shadowFit
  fit.direction.copy(world.sun.position).normalize()
  fit.rotation.lookAt(fit.direction, new Vector3(), new Vector3(0, 1, 0)).invert()
  world.sun.target.position.copy(world.mapCenter)
  world.sun.position.copy(world.mapCenter).addScaledVector(fit.direction, 1500)
  world.sun.shadow.camera.near = 1
  world.sun.shadow.camera.far = 3000
  fit.dirty = true
}

export function updateSunShadow(world, time) {
  const fit = world.shadowFit
  if (!fit || world.entrance) return
  // 只有贴近树冠时才更新细小叶影；远景不为亚像素风动重复渲染全街区阴影。
  if (world.vegetation?.near.count && time - fit.windAt >= 125) {
    world.renderer.shadowMap.needsUpdate = true
    fit.windAt = time
  }
  if (!fit.dirty && time < fit.next) return
  fit.next = time + 160
  const view = world.camera.matrixWorld.elements
  const changed = view.some((v, i) => Math.abs(v - fit.view[i]) > 1e-5)
    || !fit.projection.equals(world.camera.projectionMatrix)
  if (!fit.dirty && !changed) return
  fit.view.set(view)
  fit.projection.copy(world.camera.projectionMatrix)
  fit.frustum.setFromProjectionMatrix(new Matrix4().multiplyMatrices(world.camera.projectionMatrix, world.camera.matrixWorldInverse))
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  const include = (x, y, z) => {
    fit.point.set(x, y, z).sub(world.mapCenter).applyMatrix4(fit.rotation)
    minX = Math.min(minX, fit.point.x); maxX = Math.max(maxX, fit.point.x)
    minY = Math.min(minY, fit.point.y); maxY = Math.max(maxY, fit.point.y)
  }
  for (const receiver of fit.receivers) {
    if (!fit.frustum.intersectsSphere(receiver.sphere)) continue
    for (const x of [receiver.min.x, receiver.max.x])
      for (const y of [receiver.min.y, receiver.max.y])
        for (const z of [receiver.min.z, receiver.max.z]) include(x, y, z)
  }
  // 小院、道路或水面没有建筑时，仍保留目标点附近的接收范围。
  const target = world.controls.target
  for (const dx of [-50, 50]) for (const dz of [-50, 50]) include(target.x + dx, 0, target.z + dz)
  const padding = Math.min(160, 48 / Math.max(.3, fit.direction.y))
  const x = snapShadowBounds(minX, maxX, world.sun.shadow.mapSize.x, padding)
  const y = snapShadowBounds(minY, maxY, world.sun.shadow.mapSize.y, padding)
  const camera = world.sun.shadow.camera
  if (fit.dirty || camera.left !== x.min || camera.right !== x.max || camera.top !== y.max || camera.bottom !== y.min) {
    camera.left = x.min; camera.right = x.max; camera.top = y.max; camera.bottom = y.min
    camera.updateProjectionMatrix()
    world.sun.shadow.normalBias = Math.max(.035, Math.max(x.texel, y.texel) * .45)
    world.sun.shadow.bias = -0.000025
    world.renderer.shadowMap.needsUpdate = true
  }
  fit.dirty = false
}
