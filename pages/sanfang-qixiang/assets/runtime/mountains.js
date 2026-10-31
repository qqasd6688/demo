import {
  BufferGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  Mesh,
  ShaderMaterial,
  Vector2,
} from '../vendor/three/build/three.module.min.js'
import { getInkMountainHeight, getInkMountainVisibility } from './geometry.js'

// 沿街区外围生成有宽度的起伏地形，山脊前后均落回地面，不使用圆柱幕墙。
// 最近山脚置于控制器的缩放和平移范围外，避免缩远后镜头进入山体。
export function createInkMountainGeometry(span, layer = 0) {
  const columns = 320
  const rows = 24
  const innerRadius = span * (5.4 + layer * 1.25)
  const bandWidth = span * (1.6 + layer * 0.12)
  const maxHeight = span * (0.95 + layer * 0.12)
  const positions = []
  const uv = []
  const indices = []
  for (let row = 0; row <= rows; row++) {
    const depth = row / rows
    for (let column = 0; column <= columns; column++) {
      const u = column / columns
      const angle = u * Math.PI * 2
      // 山脊位置随方向摆动，形成前后穿插的山肩与沟谷。
      const crest = 0.46 + Math.sin(angle * 7 + layer * 1.8) * 0.09 + Math.cos(angle * 13) * 0.04
      const slope = depth < crest ? depth / crest : (1 - depth) / (1 - crest)
      const profile = getInkMountainHeight(u + Math.sin(depth * Math.PI * 2) * 0.014, layer)
      const folds = 0.88 + Math.sin(angle * 31 + depth * 8 + layer) * 0.08
      const height = Math.pow(Math.max(0, slope), 1.18) * profile * folds * maxHeight - 12
      const radius = innerRadius + depth * bandWidth
      positions.push(Math.cos(angle) * radius, height, Math.sin(angle) * radius)
      uv.push(u, depth)
      if (row < rows && column < columns) {
        const current = row * (columns + 1) + column
        const next = current + columns + 1
        indices.push(current, current + 1, next, current + 1, next + 1, next)
      }
    }
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new Float32BufferAttribute(uv, 2))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  // 接缝两侧共用同一法线，旋转一周不会出现一道亮暗分界。
  const normals = geometry.getAttribute('normal')
  for (let row = 0; row <= rows; row++) {
    const first = row * (columns + 1)
    const last = first + columns
    const x = normals.getX(first) + normals.getX(last)
    const y = normals.getY(first) + normals.getY(last)
    const z = normals.getZ(first) + normals.getZ(last)
    const length = Math.hypot(x, y, z) || 1
    normals.setXYZ(first, x / length, y / length, z / length)
    normals.setXYZ(last, x / length, y / length, z / length)
  }
  geometry.userData = { innerRadius, outerRadius: innerRadius + bandWidth, maxHeight }
  return geometry
}

// 三层真实山体共用现有环境配色和渐隐协议，天气、倒影与销毁链路无需额外调度。
export function buildInkMountains(world) {
  const tones = {
    dawn: ['#ada198', '#bdb1a4', '#cbc0b1'],
    day: ['#9ba29a', '#adb2a8', '#b9bdb2'],
    dusk: ['#968a91', '#b09d9e', '#c2aca6'],
    night: ['#637184', '#5c6c7f', '#536478'],
  }
  for (let layer = 0; layer < 3; layer++) {
    const geometry = createInkMountainGeometry(Math.max(world.width, world.depth), layer)
    const material = new ShaderMaterial({
      uniforms: {
        uTint: { value: new Color(tones.day[layer]) },
        uAlpha: { value: 0 },
        uHeight: { value: geometry.userData.maxHeight },
        uLight: { value: world.sun.position },
        uCenter: { value: new Vector2(world.mapCenter.x, world.mapCenter.z) },
        uFacing: { value: new Vector2(0, 1) },
      },
      transparent: true,
      side: DoubleSide,
      depthTest: true,
      depthWrite: false,
      fog: false,
      toneMapped: false,
      vertexShader: /* glsl */ `
          varying vec2 vInkUv;
          varying vec3 vInkWorld;
          varying vec3 vInkNormal;
          varying float vHeight;
          void main(){
            vInkUv=uv;
            vHeight=position.y;
            vInkNormal=normalize(mat3(modelMatrix)*normal);
            vec4 world=modelMatrix*vec4(position,1.);
            vInkWorld=world.xyz;
            gl_Position=projectionMatrix*viewMatrix*world;
          }
        `,
      fragmentShader: /* glsl */ `
          uniform vec3 uTint,uLight;
          uniform float uAlpha,uHeight;
          uniform vec2 uCenter,uFacing;
          varying vec2 vInkUv;
          varying vec3 vInkWorld;
          varying vec3 vInkNormal;
          varying float vHeight;
          void main(){
            vec2 radial=normalize(vInkWorld.xz-uCenter);
            float farSide=1.-smoothstep(-.3,.05,dot(radial,uFacing));
            float footMist=smoothstep(.015,.22,max(0.,vHeight)/uHeight);
            float edge=smoothstep(0.,.12,vInkUv.y)*(1.-smoothstep(.86,1.,vInkUv.y));
            float alpha=uAlpha*farSide*footMist*edge;
            if(alpha<.003)discard;
            vec3 normal=normalize(vInkNormal);
            float daylight=max(0.,dot(normal,normalize(uLight)));
            float slope=1.-clamp(normal.y,0.,1.);
            float grain=fract(sin(dot(floor(vInkWorld.xz*.12),vec2(127.1,311.7)))*43758.5453);
            vec3 ink=uTint*(.66+daylight*.38-slope*.09+grain*.025);
            gl_FragColor=vec4(ink,alpha);
            #include <colorspace_fragment>
          }
        `,
    })
    const mesh = new Mesh(geometry, material)
    mesh.position.copy(world.mapCenter)
    mesh.frustumCulled = false
    mesh.renderOrder = -10 - layer
    mesh.visible = false
    world.scene.add(mesh)
    world.inkMountainLayers.push({
      mesh,
      material,
      baseOpacity: [0.8, 0.58, 0.4][layer],
      tones: Object.fromEntries(Object.entries(tones).map(([id, colors]) => [id, colors[layer]])),
    })
  }
}

export function updateInkMountains(world) {
  const target = getInkMountainVisibility(
    world.camera.position.distanceTo(world.controls.target),
    world.controls.getPolarAngle(),
  )
  world.inkMountainVisibility += (target - world.inkMountainVisibility) * 0.08
  for (const layer of world.inkMountainLayers) {
    const uniforms = layer.material.uniforms
    layer.material.opacity = layer.baseOpacity * world.inkMountainVisibility
    uniforms.uAlpha.value = layer.material.opacity
    uniforms.uFacing.value
      .set(world.camera.position.x - world.mapCenter.x, world.camera.position.z - world.mapCenter.z)
      .normalize()
    layer.mesh.visible = layer.material.opacity > 0.002
  }
}
