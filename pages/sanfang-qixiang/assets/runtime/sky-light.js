import {
  BackSide, Color, Mesh, PMREMGenerator, Scene, ShaderMaterial, SphereGeometry,
} from '../vendor/three/build/three.module.min.js'

// 低频天空辐射经过 PMREM 预滤波，为粉墙、湿瓦与木窗提供粗糙度一致的环境反射。
// 仅切换时段/天气时重建一张小环境贴图；不用逐帧立方体捕获或屏幕空间反射。
export function updateSkyLight(world) {
  world.environmentGenerator ??= new PMREMGenerator(world.renderer)
  const sky = world.weatherSkyColor.value
  const night = world.state.timeOfDay === 'night'
  const scene = new Scene()
  const material = new ShaderMaterial({
    side: BackSide,
    uniforms: {
      skyTop: { value: new Color(world.state.weather === 'sunny' ? '#aebfc9' : '#a9b3bd').lerp(sky, night ? .94 : .45) },
      horizon: { value: sky.clone() },
      ground: { value: new Color('#8e8875').multiplyScalar(night ? .08 : .48) },
      sunColor: { value: world.sun.color.clone().multiplyScalar(world.sun.intensity * .22) },
      sunDirection: { value: world.shadowFit.direction },
    },
    vertexShader: 'varying vec3 vDirection;void main(){vDirection=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: `varying vec3 vDirection;uniform vec3 skyTop,horizon,ground,sunColor,sunDirection;
      void main(){vec3 d=normalize(vDirection);
        vec3 radiance=mix(horizon,skyTop,smoothstep(0.,.85,d.y));
        radiance=mix(radiance,ground,1.-smoothstep(-.45,0.,d.y));
        radiance+=sunColor*pow(max(0.,dot(d,sunDirection)),24.);
        gl_FragColor=vec4(radiance,1.);
      }`,
  })
  const geometry = new SphereGeometry(10, 24, 12)
  scene.add(new Mesh(geometry, material))
  // CubeUV 最小有效立方面尺寸 64；256 会为这个低频渐变浪费约 16 倍像素。
  const target = world.environmentGenerator.fromScene(scene, .04, .1, 100, { size: 64 })
  const old = world.environmentTarget
  world.environmentTarget = target
  world.scene.environment = target.texture
  world.scene.environmentIntensity = night ? .18 : .28
  old?.dispose()
  geometry.dispose()
  material.dispose()
}
