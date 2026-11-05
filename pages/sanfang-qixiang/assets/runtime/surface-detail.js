import {
  DataTexture, RepeatWrapping, LinearFilter, LinearMipmapLinearFilter,
} from '../vendor/three/build/three.module.min.js'

// 颜色与物理数据分离：R=高度，G=粗糙度。共用一张线性纹理，不增加网络请求。
export function createSurfaceDetail(kind, anisotropy = 1) {
  const size = 256, data = new Uint8Array(size * size * 4)
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const noise = ((Math.imul(x + 1, 374761393) ^ Math.imul(y + 1, 668265263)) >>> 0) / 4294967295
    let height, roughness
    if (kind === 'roof') {
      const across = (x * 24 / size) % 1, along = (y * 16 / size) % 1
      const seam = Math.min(1, Math.min(along, 1 - along) * 18)
      height = 0.28 + Math.sin(across * Math.PI) * 0.48 * seam + noise * 0.025
      roughness = 0.8 + (1 - seam) * 0.17 + noise * 0.025
    } else {
      height = 0.48 + (noise - 0.5) * 0.16
      roughness = 0.92 + noise * 0.075
    }
    const offset = (y * size + x) * 4
    data[offset] = Math.round(height * 255)
    data[offset + 1] = Math.round(roughness * 255)
    data[offset + 2] = 0
    data[offset + 3] = 255
  }
  const texture = new DataTexture(data, size, size)
  texture.wrapS = texture.wrapT = RepeatWrapping
  texture.magFilter = LinearFilter
  texture.minFilter = LinearMipmapLinearFilter
  texture.generateMipmaps = true
  texture.anisotropy = anisotropy
  texture.needsUpdate = true
  return texture
}

// 轻量近地遮蔽与暖色反弹光：沿用 PBR 的间接漫反射，不把粉墙做成自发光。
// 这是基于高度的艺术近似，不替代真实屏幕空间 AO 或全局光照。
export function configureSurfaceLighting(world, material) {
  const original = material.onBeforeCompile, key = material.customProgramCacheKey()
  material.onBeforeCompile = function (shader, renderer) {
    original.call(this, shader, renderer)
    shader.uniforms.heritageBounce = world.heritageBounce
    shader.vertexShader = 'varying float vHeritageHeight;\n' + shader.vertexShader.replace(
      '#include <project_vertex>',
      `#include <project_vertex>
      vec4 heritagePosition=vec4(transformed,1.);
      #ifdef USE_INSTANCING
        heritagePosition=instanceMatrix*heritagePosition;
      #endif
      vHeritageHeight=(modelMatrix*heritagePosition).y;`,
    )
    shader.fragmentShader = 'varying float vHeritageHeight;\nuniform vec3 heritageBounce;\n' + shader.fragmentShader.replace(
      '#include <aomap_fragment>',
      `#include <aomap_fragment>
      float heritageContact=mix(.84,1.,smoothstep(0.,2.4,max(0.,vHeritageHeight)));
      reflectedLight.indirectDiffuse*=heritageContact;
      vec3 heritageNormal=inverseTransformDirection(normal,viewMatrix);
      float heritageLower=(1.-heritageNormal.y)*.5;
      reflectedLight.indirectDiffuse+=heritageBounce*diffuseColor.rgb*heritageLower*exp(-max(0.,vHeritageHeight)*.065)*heritageContact;`,
    )
  }
  material.customProgramCacheKey = () => key + '|heritage-surface-light-v2'
  material.needsUpdate = true
}
