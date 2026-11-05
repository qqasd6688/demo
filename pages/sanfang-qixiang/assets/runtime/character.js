import {
  AnimationMixer, Box3, CanvasTexture, CircleGeometry, Float32BufferAttribute,
  Group, Mesh, MeshBasicMaterial, Vector3,
} from '../vendor/three/build/three.module.min.js'

export const CHARACTER_HEIGHT = 1.72
export const CHARACTER_MODEL_URL = new URL('../models/hanfu-walker.glb', import.meta.url)

// 新汉服模型面向 +X；在独立容器中调整朝向和比例，保留骨骼与动画轨道。
export function prepareAnimatedCharacter(scene, clips) {
  const model = new Group()
  model.add(scene)
  model.rotation.y = -Math.PI / 2
  const mixer = new AnimationMixer(scene)
  const actions = clips.map(clip => ({ name: clip.name, action: mixer.clipAction(clip) }))
  const idle = actions.find(item => /idle|stand|待机|站立/i.test(item.name))
  idle?.action.play()
  mixer.update(0)
  model.updateMatrixWorld(true)
  // 按待机姿态取身高与地面，避免导出文件的初始姿态影响落脚。
  scene.traverse(mesh => { if (mesh.isSkinnedMesh) mesh.computeBoundingBox() })
  const box = new Box3().setFromObject(model), center = box.getCenter(new Vector3())
  const scale = CHARACTER_HEIGHT / Math.max(.001, box.max.y - box.min.y)
  model.scale.setScalar(scale)
  model.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale)
  const motionRoot = scene.getObjectByName('Hip')
  const rootAnchor = motionRoot ? scene.worldToLocal(motionRoot.getWorldPosition(new Vector3())) : null
  return { model, scene, mixer, actions, action: idle?.action ?? null, motionRoot, rootAnchor, rootPoint: new Vector3() }
}

// Tripo 静态导出没有骨骼。用局部形变表达基础步态，原始 GLB 保持不变。
// 若以后换成带骨骼/动画的 GLB，优先使用文件中的动作。
export function prepareStaticCharacter(mesh) {
  const geometry = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld)
  // 本模型前方为 +X，转换为控制器约定的 +Z。
  geometry.rotateY(-Math.PI / 2)
  geometry.computeBoundingBox()
  const box = geometry.boundingBox, center = box.getCenter(new Vector3())
  const scale = CHARACTER_HEIGHT / Math.max(.001, box.max.y - box.min.y)
  geometry.translate(-center.x, -box.min.y, -center.z)
  geometry.scale(scale, scale, scale)
  const positions = geometry.attributes.position
  const smooth = (a, b, value) => { const t = Math.max(0, Math.min(1, (value - a) / (b - a))); return t * t * (3 - 2 * t) }
  // 轻收 A 姿势的双臂；连续权重保持袖子与躯干相连。
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i), y = positions.getY(i)
    const arm = smooth(.18, .42, Math.abs(x)) * smooth(.65, 1, y) * (1 - smooth(1.4, 1.53, y))
    const angle = -Math.sign(x) * .5 * arm, px = x - Math.sign(x) * .18, py = y - 1.4
    positions.setXY(i, Math.sign(x) * .18 + px * Math.cos(angle) - py * Math.sin(angle), 1.4 + px * Math.sin(angle) + py * Math.cos(angle))
  }
  geometry.computeVertexNormals()
  geometry.morphTargetsRelative = true
  geometry.morphAttributes.position = []
  geometry.morphAttributes.normal = []
  for (const direction of [1, -1]) {
    const values = new Float32Array(positions.count * 3)
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i), y = positions.getY(i), side = Math.tanh(x * 15)
      const lower = 1 - smooth(.25, .9, y)
      const arm = smooth(.2, .43, Math.abs(x)) * smooth(.65, .95, y) * (1 - smooth(1.35, 1.5, y))
      values[i * 3] = side * lower * .008
      values[i * 3 + 1] = Math.max(0, side * direction) * lower * .026
      values[i * 3 + 2] = side * direction * (lower * .11 - arm * .13)
    }
    const displaced = geometry.clone()
    const absolute = positions.array.slice()
    for (let i = 0; i < absolute.length; i++) absolute[i] += values[i]
    displaced.setAttribute('position', new Float32BufferAttribute(absolute, 3))
    displaced.computeVertexNormals()
    const normals = displaced.attributes.normal.array.slice()
    for (let i = 0; i < normals.length; i++) normals[i] -= geometry.attributes.normal.array[i]
    geometry.morphAttributes.position.push(new Float32BufferAttribute(values, 3))
    geometry.morphAttributes.normal.push(new Float32BufferAttribute(normals, 3))
    displaced.dispose()
  }
  geometry.computeBoundingBox()
  geometry.computeBoundingSphere()
  return geometry
}

export async function loadWalkingCharacter(signal) {
  const modelUrl = CHARACTER_MODEL_URL
  const [{ GLTFLoader }, response] = await Promise.all([
    import('../vendor/three/examples/jsm/loaders/GLTFLoader.js'),
    fetch(modelUrl, { signal }),
  ])
  if (!response.ok) throw new Error(`人物模型读取失败（${response.status}）`)
  const gltf = await new GLTFLoader().parseAsync(await response.arrayBuffer(), new URL('.', modelUrl).href)
  const root = new Group(), visual = new Group(), meshes = []
  root.name = 'hanfu-player'
  root.visible = false
  root.add(visual)
  gltf.scene.updateMatrixWorld(true)
  const animated = gltf.animations.length > 0
  let rig = null
  if (animated) {
    rig = prepareAnimatedCharacter(gltf.scene, gltf.animations)
    visual.add(rig.model)
  } else {
    gltf.scene.traverse(object => {
      if (!object.isMesh) return
      const mesh = new Mesh(prepareStaticCharacter(object), object.material)
      object.geometry.dispose()
      visual.add(mesh)
    })
  }
  visual.traverse(mesh => {
    if (!mesh.isMesh) return
    mesh.receiveShadow = true
    // 避免在冻结的全街区阴影贴图中留下移动人物的旧投影。
    mesh.castShadow = false
    // 骨骼动作会超出导出时的静态包围盒；人物仅在漫游时显示。
    if (mesh.isSkinnedMesh) mesh.frustumCulled = false
    meshes.push(mesh)
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      material.roughness = Math.max(.78, material.roughness ?? .8)
      if (material.map) material.map.anisotropy = 4
    }
  })
  const surface = document.createElement('canvas')
  surface.width = surface.height = 64
  const context = surface.getContext('2d'), gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32)
  gradient.addColorStop(0, 'rgba(37,31,24,.32)')
  gradient.addColorStop(.4, 'rgba(37,31,24,.16)')
  gradient.addColorStop(1, 'rgba(37,31,24,0)')
  context.fillStyle = gradient
  context.fillRect(0, 0, 64, 64)
  const shadow = new Mesh(new CircleGeometry(.48, 24), new MeshBasicMaterial({
    map: new CanvasTexture(surface), transparent: true, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
  }))
  shadow.rotation.x = -Math.PI / 2
  shadow.position.y = .025
  root.add(shadow)
  const mixer = rig?.mixer ?? null
  return { root, visual, meshes, actions: [], phase: 0, blend: 0, action: null, ...rig, mixer,
    dispose() {
      mixer?.stopAllAction()
      mixer?.uncacheRoot(gltf.scene)
      const geometries = new Set(), materials = new Set(), textures = new Set()
      root.traverse(object => {
        if (object.geometry) geometries.add(object.geometry)
        for (const material of object.material ? (Array.isArray(object.material) ? object.material : [object.material]) : []) {
          materials.add(material)
          for (const value of Object.values(material)) if (value?.isTexture) textures.add(value)
        }
      })
      geometries.forEach(value => value.dispose())
      materials.forEach(value => value.dispose())
      textures.forEach(value => { value.dispose(); value.image?.close?.() })
      const skeletons = new Set(meshes.filter(mesh => mesh.isSkinnedMesh).map(mesh => mesh.skeleton))
      skeletons.forEach(skeleton => skeleton.dispose())
    },
  }
}

export function updateCharacterPose(character, distance, delta, speed) {
  const dt = Math.min(.05, Math.max(0, delta))
  const moving = speed > .05
  character.blend += ((moving ? 1 : 0) - character.blend) * (1 - Math.exp(-dt * 12))
  character.phase += Math.abs(distance) * Math.PI * 2 / (speed > 2.4 ? 2.1 : 1.15)
  if (character.mixer) {
    const pattern = !moving ? /idle|stand|待机|站立/i : speed > 2.4 ? /run|跑/i : /walk|行走/i
    const selected = character.actions.find(item => pattern.test(item.name)) || (moving ? character.actions[0] : null)
    if (selected?.action !== character.action) {
      character.action?.fadeOut(.18)
      selected?.action.reset().fadeIn(.18).play()
      character.action = selected?.action ?? null
    }
    character.mixer.update(dt)
    // 跑步片段的髋部自带水平偏移。锁定模型内的 X/Z，实际位移统一由道路控制器驱动；保留垂直起伏。
    if (character.motionRoot) {
      const { scene, motionRoot, rootAnchor, rootPoint } = character
      scene.updateWorldMatrix(true, true)
      scene.worldToLocal(motionRoot.getWorldPosition(rootPoint))
      rootPoint.x = rootAnchor.x
      rootPoint.z = rootAnchor.z
      motionRoot.position.copy(motionRoot.parent.worldToLocal(scene.localToWorld(rootPoint)))
      motionRoot.updateWorldMatrix(false, true)
    }
    return
  }
  const stride = Math.sin(character.phase), amount = character.blend * (speed > 2.4 ? 1 : .65)
  for (const mesh of character.meshes) {
    if (!mesh.morphTargetInfluences) continue
    mesh.morphTargetInfluences[0] = Math.max(0, stride) * amount
    mesh.morphTargetInfluences[1] = Math.max(0, -stride) * amount
  }
  character.visual.position.y = Math.abs(Math.sin(character.phase)) * .015 * amount
  character.visual.rotation.z = Math.sin(character.phase) * .012 * amount
  character.visual.rotation.x = speed > 2.4 ? .045 * character.blend : 0
}
