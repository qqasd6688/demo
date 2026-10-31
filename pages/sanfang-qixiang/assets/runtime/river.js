import { UnsignedByteType, DoubleSide } from '../vendor/three/build/three.module.min.js'
import { Water } from '../vendor/three/examples/jsm/objects/Water.js'
import { mergeGeometries } from '../vendor/three/examples/jsm/utils/BufferGeometryUtils.js'
import { getWorldPoint } from './geometry.js'
import { RAIN_RIPPLE_GLSL, withoutWeatherReflection } from './weather-surface.js'
import {
  createRiverSurfaceGeometry,
  createPondSurfaceGeometry,
  createRiverNormalTexture,
} from './river-geometry.js'

// 河流倒影、流动法线和水面更新；与主场景共用渲染器和环境光照。
// 河道与馆内池塘合为一张水面，共用倒影；深浅、流速和水底光纹在材质中区分。
export function buildRiverWater(world) {
  const bridges = (world.data.bridges || []).map((bridge) => ({
    ...bridge,
    points: bridge.points.map((p) => getWorldPoint(p, world.origin)),
  }))
  const riverWidth = world.data.meta.riverWidth ?? 6.2
  const surfaces = [
    createRiverSurfaceGeometry(world.riverPaths, bridges, riverWidth),
    createPondSurfaceGeometry(
      (world.memorial?.ponds || []).map((ring) => ring.map((p) => getWorldPoint(p, world.origin))),
    ),
  ]
  const populated = surfaces.filter((surface) => surface.attributes.position.count)
  const geometry = populated.length ? mergeGeometries(populated) : null
  surfaces.forEach((surface) => surface.dispose())
  if (!geometry) return
  // Water 的反射平面沿局部 +Z，因此先将河道转到局部 XY，再用对象旋转回世界 XZ。
  geometry.translate(0, -0.045, 0)
  geometry.rotateX(Math.PI / 2)
  world.riverWater = new Water(geometry, {
    textureWidth: 512,
    textureHeight: 512,
    waterNormals: createRiverNormalTexture(),
    sunDirection: world.sun.position.clone().normalize(),
    sunColor: '#fff8ed',
    waterColor: '#287b78',
    distortionScale: 1.25,
    alpha: 1,
    side: DoubleSide,
    fog: true,
    clipBias: 0.003,
  })
  world.riverWater.rotation.x = -Math.PI / 2
  world.riverWater.position.y = 0.045
  world.riverWater.renderOrder = 1
  world.riverWater.receiveShadow = true
  world.riverMaterial = world.riverWater.material
  // 8 位反射目标兼容更多 WebGL2 显卡，不依赖半浮点颜色附件扩展。
  world.riverMaterial.uniforms.mirrorSampler.value.type = UnsignedByteType
  world.riverMaterial.transparent = true
  world.riverMaterial.depthWrite = false
  world.riverMaterial.polygonOffset = true
  world.riverMaterial.polygonOffsetFactor = -4
  world.riverMaterial.polygonOffsetUnits = -4
  world.riverMaterial.uniforms.size.value = 1
  world.riverMaterial.uniforms.uRainStrength = world.weatherWetness
  world.riverMaterial.uniforms.uRiverWidth = { value: riverWidth }
  world.riverMaterial.uniforms.uDaylight = { value: 1 }
  world.riverMaterial.uniforms.uCausticStrength = { value: 1 }
  world.riverMaterial.vertexShader =
    'attribute vec2 flowDirection;\nattribute vec2 waterProfile;\nvarying vec2 vWaterProfile;\nvarying vec2 vWaterUv;\nvarying vec2 vFlow;\n' +
    world.riverMaterial.vertexShader.replace(
      'void main() {',
      'void main() {\nvWaterUv=uv;vFlow=flowDirection;vWaterProfile=waterProfile;',
    )
  world.riverMaterial.fragmentShader =
    'uniform float uRainStrength;\nuniform float uRiverWidth;\nuniform float uDaylight;\nuniform float uCausticStrength;\nvarying vec2 vWaterProfile;\nvarying vec2 vWaterUv;\nvarying vec2 vFlow;\n' +
    world.riverMaterial.fragmentShader
  const noiseStart = world.riverMaterial.fragmentShader.indexOf('vec4 getNoise('),
    noiseEnd = world.riverMaterial.fragmentShader.indexOf('void sunLight(', noiseStart)
  world.riverMaterial.fragmentShader =
    world.riverMaterial.fragmentShader.slice(0, noiseStart) +
    `
      ${RAIN_RIPPLE_GLSL}
      vec4 getNoise(vec2 uv){
        float speed=mix(.23,.065,vWaterProfile.x);
        vec2 current=vec2(time*.012,time*speed);
        vec4 a=texture2D(normalSampler,uv/5.0-current);
        vec4 b=texture2D(normalSampler,uv/8.7+vec2(.31,.19)+current*.53);
        vec4 n=a+b-1.;
        n.xy+=vec2(sin(uv.y*1.15-time*.85),cos(uv.x*.8+uv.y*.5-time*.6))*.065;
        if(uRainStrength>.001){
          n.xy+=(rainRipple(uv*1.5,time)+rainRipple(uv*2.1+3.7,time*.91)*.4)*uRainStrength*.2;
        }
        return n;
      }
      // 扭曲的交错光纹模拟水底焦散；远景滤去细节，避免摩尔纹和闪烁。
      float waterCaustics(vec2 p){
        vec2 q=p*.82;
        q+=vec2(sin(q.y*1.2+time*.31),cos(q.x*.93-time*.26))*.63;
        q+=vec2(cos(q.y*2.3-time*.27),sin(q.x*1.8+time*.34))*.24;
        float a=abs(sin(q.x*2.6+q.y*1.3+time*.22));
        float b=abs(sin(q.y*2.8-q.x*1.1-time*.19));
        float ridge=1.-min(a,b);
        return pow(ridge,9.);
      }
    ` +
    world.riverMaterial.fragmentShader.slice(noiseEnd)
  world.riverMaterial.fragmentShader = world.riverMaterial.fragmentShader
    .replace(
      'vec4 noise = getNoise( worldPosition.xz * size );',
      `
        float pond=vWaterProfile.x;
        vec2 waterUv=mix(vec2((vWaterUv.x-.5)*uRiverWidth,vWaterUv.y),worldPosition.xz,pond);
        vec4 noise=getNoise(waterUv*size);
      `,
    )
    .replace(
      'vec3 surfaceNormal = normalize( noise.xzy * vec3( 1.5, 1.0, 1.5 ) );',
      `
        vec2 direction=normalize(vFlow),across=vec2(-direction.y,direction.x);
        float detail=1.-smoothstep(.45,2.8,length(fwidth(worldPosition.xz)));
        vec2 tilt=(across*noise.x+direction*noise.y)*mix(1.15,.65,pond)*detail;
        vec3 surfaceNormal=normalize(vec3(tilt.x,max(noise.z,.35),tilt.y));
      `,
    )
    .replace('float rf0 = 0.02;', 'float rf0 = 0.055;')
    .replace(
      'vec3 outgoingLight = albedo;',
      `
        float shore=mix(min(vWaterUv.x,1.-vWaterUv.x)*uRiverWidth,vWaterProfile.y,pond);
        float depth=mix(.25+1.8*smoothstep(0.,uRiverWidth*.48,shore),
                        .16+1.2*smoothstep(0.,4.2,shore),pond);
        // 法线偏移水底取样，保留轻微折射感，不额外渲染整张场景纹理。
        vec2 bedUv=worldPosition.xz+surfaceNormal.xz*depth*.65;
        float grain=texture2D(normalSampler,bedUv*.08).r;
        vec3 shallow=waterColor*.8+vec3(.19,.31,.22);
        vec3 bed=mix(waterColor*.65,shallow,exp(-depth*.85));
        bed*=.92+grain*.16;
        float caustic=0.;
        if(uDaylight>.08 && detail>.01)
          caustic=waterCaustics(bedUv)*detail*exp(-depth*.38)*uDaylight*uCausticStrength;
        bed=bed*(.16+uDaylight*.84)+vec3(.17,.23,.15)*caustic;
        float shadow=getShadowMask();
        bed*=.58+shadow*.42;
        float fresnel=clamp(reflectance+mix(.04,.085,pond),.08,.7);
        vec3 outgoingLight=mix(bed,reflectionSample,fresnel)+specularLight*.45;
        // 贴岸的细水纹强调池岸接触，避免把内河做成带白色浪花的海面。
        float edge=(1.-smoothstep(.08,.65,shore))*smoothstep(0.,.12,shore);
        float shimmer=.5+.5*sin(waterUv.y*2.1-time*.85+noise.x*4.);
        outgoingLight+=vec3(.055,.09,.075)*edge*shimmer*uDaylight*detail;
      `,
    )
  world.riverMaterial.needsUpdate = true
  const reflect = world.riverWater.onBeforeRender
  const reflectedView = new Float64Array(16)
  world.riverWater.onBeforeRender = function (activeRenderer, activeScene, activeCamera) {
    // 静止相机复用倒影，转动/飞行时提高更新频率；水纹、焦散始终逐帧更新。
    const view = activeCamera.matrixWorld.elements
    const moved = view.some((value, index) => Math.abs(value - reflectedView[index]) > 0.0001)
    const interval = moved ? 1 / 30 : world.state.weather === 'rainy' ? 1 / 12 : 1 / 6
    if (world.waterClock - world.waterReflectionAt < interval) return
    world.waterReflectionAt = world.waterClock
    reflectedView.set(view)
    const visibility = world.inkMountainLayers.map((layer) => layer.mesh.visible)
    world.inkMountainLayers.forEach((layer) => (layer.mesh.visible = false))
    try {
      withoutWeatherReflection(world, () => reflect.call(this, activeRenderer, activeScene, activeCamera))
    } finally {
      world.inkMountainLayers.forEach((layer, i) => (layer.mesh.visible = visibility[i]))
    }
  }
  world.scene.add(world.riverWater)
}

export function updateRiverWater(world, time) {
  const delta = world.waterLastFrame
    ? Math.min(0.08, Math.max(0, (time - world.waterLastFrame) / 1000))
    : 0
  world.waterLastFrame = time
  world.waterClock += delta
  if (world.riverMaterial) {
    world.riverMaterial.uniforms.time.value = world.waterClock
    world.riverMaterial.uniforms.eye.value.copy(world.camera.position)
  }
}
