import {
  InstancedMesh, Matrix4, Vector3, Color, MeshDepthMaterial, RGBADepthPacking,
} from '../vendor/three/build/three.module.min.js'

// 实例原点决定相位，叶梢决定振幅。颜色与深度 pass 共用变形，不逐帧上传实例矩阵。
const WIND_VERTEX = `
  vec3 windBase=vec3(0.);
  #ifdef USE_INSTANCING
    windBase=instanceMatrix[3].xyz;
  #endif
  float windPhase=dot(windBase.xz,vec2(.073,.051));
  float windWeight=smoothstep(.6,2.3,position.y);
  float windGust=.65+.35*sin(windTime*.46+windPhase*.7);
  float windSway=sin(windTime*1.3+windPhase)*.026*windGust;
  float windFlutter=sin(windTime*3.8+windPhase+position.x*4.+position.z*3.)*.008;
  transformed.xz+=vec2(1.,.45)*(windSway+windFlutter)*windWeight*windStrength;
`

function configureWind(material, wind) {
  const original = material.onBeforeCompile, key = material.customProgramCacheKey()
  material.onBeforeCompile = function (shader, renderer) {
    original.call(this, shader, renderer)
    shader.uniforms.windTime = wind.time
    shader.uniforms.windStrength = wind.strength
    shader.vertexShader = 'uniform float windTime,windStrength;\n' + shader.vertexShader.replace(
      '#include <begin_vertex>', '#include <begin_vertex>\n' + WIND_VERTEX,
    )
  }
  material.customProgramCacheKey = () => key + '|garden-wind-v1'
}

// 投影半径的滞回区间：避免镜头停在阈值附近时反复切换。
export function wantsDetailedTree(radiusPixels, wasDetailed) {
  return radiusPixels > (wasDetailed ? 22 : 28)
}

export function prepareVegetation(world, near, farGeometry, trees) {
  const far = new InstancedMesh(farGeometry, near.material, trees.length)
  far.name = 'heritage-tree-leaves-far'
  far.castShadow = far.receiveShadow = true
  const wind = { time: { value: 0 }, strength: { value: 1 } }
  configureWind(near.material, wind)
  const depth = new MeshDepthMaterial({
    depthPacking: RGBADepthPacking, map: near.material.map,
    alphaTest: near.material.alphaTest, side: near.material.side,
  })
  configureWind(depth, wind)
  near.customDepthMaterial = far.customDepthMaterial = depth
  const matrices = near.instanceMatrix.array.slice(), colors = near.instanceColor.array.slice()
  near.computeBoundingSphere()
  near.boundingSphere.radius += 2
  far.boundingSphere = near.boundingSphere.clone()
  far.count = 0
  world.vegetation = {
    near, far, matrices, colors, trees, wind, detailed: new Uint8Array(trees.length).fill(1),
    camera: new Vector3(Infinity, Infinity, Infinity), height: 0, last: 0, lodAt: -Infinity,
    matrix: new Matrix4(), color: new Color(), point: new Vector3(),
  }
  world.scene.add(far)
}

export function updateVegetation(world, time) {
  const v = world.vegetation
  if (!v) return
  const delta = v.last ? Math.max(0, Math.min(.08, (time - v.last) / 1000)) : 0
  v.last = time
  v.wind.time.value += delta
  const strength = world.state.weather === 'rainy' ? 2.3 : world.state.weather === 'snowy' ? 1.35 : 1
  v.wind.strength.value += (strength - v.wind.strength.value) * (1 - Math.exp(-delta * 2))
  if (world.entrance || time - v.lodAt < 160) return
  v.lodAt = time
  if (v.camera.distanceToSquared(world.camera.position) < 4 && v.height === world.stage.clientHeight) return
  v.camera.copy(world.camera.position)
  v.height = world.stage.clientHeight
  const projection = v.height / (2 * Math.tan(world.camera.fov * Math.PI / 360))
  let nearCount = 0, farCount = 0
  for (let i = 0; i < v.trees.length; i++) {
    const [x, z, radius] = v.trees[i]
    v.point.set(x, radius * 1.7, z)
    const pixels = radius * projection / Math.max(1, world.camera.position.distanceTo(v.point))
    const detailed = wantsDetailedTree(pixels, v.detailed[i])
    v.detailed[i] = Number(detailed)
    const mesh = detailed ? v.near : v.far, slot = detailed ? nearCount++ : farCount++
    v.matrix.fromArray(v.matrices, i * 16)
    v.color.fromArray(v.colors, i * 3)
    mesh.setMatrixAt(slot, v.matrix)
    mesh.setColorAt(slot, v.color)
  }
  v.near.count = nearCount
  v.far.count = farCount
  for (const mesh of [v.near, v.far]) {
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }
  world.renderer.shadowMap.needsUpdate = true
  world.waterReflectionAt = -Infinity
}
