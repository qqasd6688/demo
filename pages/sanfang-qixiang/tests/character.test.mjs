import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { Box3, Group, Vector3 } from '../assets/vendor/three/build/three.module.min.js'
import { GLTFLoader } from '../assets/vendor/three/examples/jsm/loaders/GLTFLoader.js'
import { CHARACTER_HEIGHT, CHARACTER_MODEL_URL, prepareAnimatedCharacter, updateCharacterPose } from '../assets/runtime/character.js'

test('轻量角色保持体积、面数、骨骼与动画预算，不依赖原始素材', async () => {
  const optimized = await readFile(CHARACTER_MODEL_URL)
  const metadata = buffer => JSON.parse(buffer.subarray(20, 20 + buffer.readUInt32LE(12)))
  const after = metadata(optimized)
  assert.ok(optimized.length < 8_000_000)
  const triangles = after.meshes.flatMap(mesh => mesh.primitives)
    .reduce((count, primitive) => count + after.accessors[primitive.indices].count / 3, 0)
  assert.ok(triangles < 200_000)
  assert.equal(after.skins[0].joints.length, 78)
  assert.ok((after.extensionsRequired || []).every(name => name === 'KHR_mesh_quantization'), '保持现有本地加载器可直接读取')
  for (const [name, expectedDuration] of [['idle', 15 + 1 / 3], ['walk', 2 + 1 / 3], ['run', 1.25]]) {
    const reduced = after.animations.find(item => item.name === name)
    const duration = (json, animation) => Math.max(...animation.samplers.map(sampler => json.accessors[sampler.input].max[0]))
    assert.ok(reduced)
    assert.ok(Math.abs(expectedDuration - duration(after, reduced)) < 1e-5)
  }
})

test('新汉服骨骼模型落地、面向前方，并在移动控制器下切换原生动画而不水平漂移', async () => {
  const source = await readFile(CHARACTER_MODEL_URL)
  const size = source.readUInt32LE(12), document = JSON.parse(source.subarray(20, 20 + size))
  assert.deepEqual(document.animations.map(clip => clip.name).sort(), ['idle', 'run', 'walk'])
  assert.ok(document.skins[0].joints.length > 0)
  assert.ok(document.images.every(image => image.bufferView !== undefined), '贴图必须内嵌，独立目录可用')
  // Node 没有图像解码器；仅移除材质描述，保留实际网格、骨骼与完整动作数据。
  const buffer = Buffer.from(source)
  for (const mesh of document.meshes) for (const primitive of mesh.primitives) delete primitive.material
  delete document.images; delete document.textures; delete document.materials
  buffer.fill(32, 20, 20 + size)
  buffer.write(JSON.stringify(document), 20)
  const gltf = await new GLTFLoader().parseAsync(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength), '')
  const rig = prepareAnimatedCharacter(gltf.scene, gltf.animations)
  const root = new Group(), visual = new Group()
  root.add(visual); visual.add(rig.model)
  root.updateMatrixWorld(true)
  const bounds = new Box3().setFromObject(root)
  assert.ok(Math.abs(bounds.min.y) < 1e-5)
  assert.ok(Math.abs(bounds.max.y - CHARACTER_HEIGHT) < 1e-5)
  const head = gltf.scene.getObjectByName('Head').getWorldPosition(new Vector3())
  const face = gltf.scene.getObjectByName('FacialBone').getWorldPosition(new Vector3()).sub(head)
  assert.ok(face.z > .05 && Math.abs(face.x) < .01, '面部朝 +Z，与控制器一致')
  const character = { root, visual, meshes: [], phase: 0, blend: 0, ...rig }
  for (const [speed, name] of [[0, 'idle'], [1.65, 'walk'], [4.2, 'run'], [0, 'idle']]) {
    for (let i = 0; i < 60; i++) {
      root.position.set(i * .03, 0, -i * .07)
      root.rotation.y = i * .02
      updateCharacterPose(character, speed / 60, 1 / 60, speed)
      const position = rig.scene.worldToLocal(rig.motionRoot.getWorldPosition(new Vector3()))
      assert.ok(Math.abs(position.x - rig.rootAnchor.x) < 1e-5)
      assert.ok(Math.abs(position.z - rig.rootAnchor.z) < 1e-5)
      assert.ok(position.toArray().every(Number.isFinite))
    }
    assert.equal(character.action, rig.actions.find(item => item.name === name).action)
    assert.ok(character.action.getEffectiveWeight() > .99)
  }
  rig.mixer.stopAllAction(); rig.mixer.uncacheRoot(rig.scene)
  rig.scene.traverse(mesh => { if (mesh.isMesh) { mesh.geometry.dispose(); mesh.material.dispose(); mesh.skeleton?.dispose() } })
  assert.deepEqual(await readFile(CHARACTER_MODEL_URL), source, '发布版 GLB 不作修改')
})
