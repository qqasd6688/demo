// 仅用于离线生成发布资源；不参与页面运行，也不随作品发布。
// 工具版本：@gltf-transform/{core,extensions,functions} 4.5.1，meshoptimizer 1.2.0，ImageMagick 7。
import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const output = fileURLToPath(new URL('../assets/models/hanfu-walker.glb', import.meta.url))
const cleanupOptions = { keepLeaves: true, keepAttributes: true, keepSolidTextures: true }

export async function optimizeCharacter(tools, source) {
  if (!source) throw new Error('请指定外部原始模型：node scripts/optimize-character.mjs <原始模型.glb>')
  source = path.resolve(source)
  if (source.toLowerCase() === path.resolve(output).toLowerCase()) throw new Error('请提供外部原始模型，不能将发布版作为输入')
  const { NodeIO, ALL_EXTENSIONS, MeshoptSimplifier, weld, simplify, resample, dedup, prune, quantize } = tools
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
  const document = await io.read(source)
  await MeshoptSimplifier.ready
  await document.transform(
    weld(),
    simplify({ simplifier: MeshoptSimplifier, ratio: .08, error: .001 }),
    resample({ tolerance: 1e-5, cleanup: false }),
    dedup(),
    prune(cleanupOptions),
    quantize({ quantizePosition: 16, quantizeNormal: 10, quantizeTexcoord: 14, quantizeWeight: 8, cleanup: false }),
    prune(cleanupOptions),
    dedup(),
  )
  const temporary = await mkdtemp(path.join(tmpdir(), 'sanfang-hanfu-'))
  try {
    for (const [i, texture] of document.getRoot().listTextures().entries()) {
      const input = path.join(temporary, `texture-${i}.jpg`)
      const resized = path.join(temporary, `texture-${i}-small.jpg`)
      await writeFile(input, texture.getImage())
      execFileSync('magick', [input, '-resize', '2048x2048>', '-sampling-factor', '4:4:4', '-quality', '88', resized])
      texture.setImage(await readFile(resized)).setMimeType('image/jpeg')
    }
    await mkdir(path.dirname(output), { recursive: true })
    await io.write(output, document)
  } finally {
    const parent = `${path.resolve(tmpdir())}${path.sep}`
    if (!path.resolve(temporary).startsWith(`${parent}sanfang-hanfu-`)) throw new Error('临时目录不在预期位置')
    await rm(temporary, { recursive: true, force: true })
  }
  const triangles = document.getRoot().listMeshes().flatMap(mesh => mesh.listPrimitives())
    .reduce((count, primitive) => count + primitive.getIndices().getCount() / 3, 0)
  console.log(JSON.stringify({ sourceBytes: (await stat(source)).size, outputBytes: (await stat(output)).size, triangles }))
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  if (!process.argv[2]) throw new Error('用法：node scripts/optimize-character.mjs <外部原始模型.glb>')
  await optimizeCharacter({
    ...await import('@gltf-transform/core'),
    ...await import('@gltf-transform/extensions'),
    ...await import('@gltf-transform/functions'),
    ...await import('meshoptimizer'),
  }, process.argv[2])
}
