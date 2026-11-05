export const RAIN_RIPPLE_GLSL = /* glsl */ `
  float rainHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
  vec2 rainRipple(vec2 p,float time){
    vec2 cell=floor(p),local=fract(p);
    float seed=rainHash(cell),life=fract(time*(.8+seed*.7)+seed*7.);
    vec2 delta=local-vec2(.25+seed*.5,.25+rainHash(cell+7.)*.5);
    float radius=length(delta),wave=radius-life*.48;
    float ring=sin(wave*52.)*exp(-abs(wave)*22.)*(1.-life);
    float edge=smoothstep(0.,.12,local.x)*smoothstep(0.,.12,local.y)
      *(1.-smoothstep(.88,1.,local.x))*(1.-smoothstep(.88,1.,local.y));
    return delta/max(radius,.03)*ring*edge;
  }
`

export function configureWeatherSurfaces(world) {
  const water = world.riverMaterial?.uniforms
  if (water) world.weatherReflection = {
    sampler: { value: water.mirrorSampler.value }, matrix: water.textureMatrix, enabled: { value: 1 },
  }
  const seen = new Set()
  for (const surface of world.weatherSurfaces) {
    const { material } = surface
    if (seen.has(material)) continue
    seen.add(material)
    const reflected = Boolean(surface.puddles && water), foliage = Boolean(surface.foliage)
    const original = material.onBeforeCompile, key = material.customProgramCacheKey()
    material.onBeforeCompile = (shader, renderer) => {
      original.call(material, shader, renderer)
      Object.assign(shader.uniforms, { weatherWetness: world.weatherWetness,
        weatherSnowCover: world.weatherSnowCover, weatherTime: world.weatherTime })
      if (reflected) Object.assign(shader.uniforms, { weatherMirror: world.weatherReflection.sampler,
        weatherMirrorMatrix: world.weatherReflection.matrix, weatherReflectionEnabled: world.weatherReflection.enabled })
      shader.vertexShader = `varying vec3 vWeatherWorld;varying float vWeatherUp;
        ${reflected ? 'uniform mat4 weatherMirrorMatrix;varying vec4 vWeatherMirror;' : ''}\n` + shader.vertexShader.replace(
        '#include <project_vertex>', `#include <project_vertex>
        vec4 weatherPosition=vec4(transformed,1.);
        #ifdef USE_INSTANCING
          weatherPosition=instanceMatrix*weatherPosition;
        #endif
        vWeatherWorld=(modelMatrix*weatherPosition).xyz;
        vWeatherUp=inverseTransformDirection(transformedNormal,viewMatrix).y;
        ${reflected ? 'vWeatherMirror=weatherMirrorMatrix*vec4(vWeatherWorld,1.);' : ''}`,
      )
      shader.fragmentShader = `uniform float weatherWetness,weatherSnowCover,weatherTime;
        varying vec3 vWeatherWorld;varying float vWeatherUp;
        ${reflected ? 'uniform sampler2D weatherMirror;uniform float weatherReflectionEnabled;varying vec4 vWeatherMirror;' : ''}
        ${RAIN_RIPPLE_GLSL}
        float weatherNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
          return mix(mix(rainHash(i),rainHash(i+vec2(1,0)),f.x),mix(rainHash(i+vec2(0,1)),rainHash(i+vec2(1,1)),f.x),f.y);}
      ` + shader.fragmentShader
      shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
        float weatherUp=smoothstep(.35,.88,vWeatherUp);
        float weatherGrain=weatherNoise(vWeatherWorld.xz*5.3);
        float snowVariation=weatherNoise(vWeatherWorld.xz*.48)*.11+weatherGrain*.035;
        float snowCover=smoothstep(.12,.62,weatherSnowCover*weatherUp-snowVariation)*${foliage ? '.28' : reflected ? '.84' : '.9'};
        #ifdef USE_BUMPMAP
          // 薄雪沿既有瓦楞/石板起伏分布，沟缝保留阴影，避免整片刷白。
          float snowRelief=texture2D(bumpMap,vBumpMapUv).r;
          snowCover*=mix(.6,1.,smoothstep(.26,.72,snowRelief));
        #endif
        vec3 powder=vec3(.69,.78,.85)*(0.97+weatherGrain*.035);
        diffuseColor.rgb=mix(diffuseColor.rgb,powder,snowCover);
        float surfaceWet=weatherWetness*weatherUp*(1.-snowCover);
        diffuseColor.rgb*=1.-surfaceWet*${foliage ? '.08' : '.38'};
        float weatherPuddle=0.;vec2 weatherRipples=vec2(0.);
        ${reflected ? `
          if(surfaceWet>.001){
            float wetPatch=weatherNoise(vWeatherWorld.xz*.16)*.7+weatherNoise(vWeatherWorld.xz*.69)*.3;
            weatherPuddle=surfaceWet*smoothstep(.35,.64,wetPatch)*smoothstep(.94,.99,vWeatherUp);
            weatherRipples=rainRipple(vWeatherWorld.xz*1.3,weatherTime);
          }` : ''}`)
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
          roughnessFactor=mix(roughnessFactor,max(.2,roughnessFactor*.58),surfaceWet);
          roughnessFactor=mix(roughnessFactor,.095,weatherPuddle*.9);
          roughnessFactor=mix(roughnessFactor,.96,snowCover);`)
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
          normal=normalize(mix(normal,nonPerturbedNormal,snowCover*.58));
          ${reflected ? `vec3 weatherNormal=inverseTransformDirection(normal,viewMatrix);
            weatherNormal.xz+=weatherRipples*weatherPuddle*.055;
            normal=transformDirection(normalize(weatherNormal),viewMatrix);` : ''}`)
      if (reflected) shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', `
        if(weatherPuddle>.001 && weatherReflectionEnabled>.5 && vWeatherMirror.w>0.){
          vec2 reflectionUv=vWeatherMirror.xy/vWeatherMirror.w;
          reflectionUv+=weatherRipples*.0018;
          float edge=min(min(reflectionUv.x,reflectionUv.y),min(1.-reflectionUv.x,1.-reflectionUv.y));
          float grazing=1.-abs(dot(normal,normalize(vViewPosition)));
          float fresnel=.18+.7*pow(grazing,4.);
          vec3 reflection=texture2D(weatherMirror,clamp(reflectionUv,0.,1.)).rgb;
          outgoingLight=mix(outgoingLight,reflection,weatherPuddle*fresnel*smoothstep(0.,.035,edge));
        }
        #include <opaque_fragment>`)
    }
    material.customProgramCacheKey = () => key + `|weather-surface-v4-${reflected}-${foliage}`
    material.needsUpdate = true
  }
}

// 同一张水面倒影供低处石板复用。捕获时解绑该纹理，避免渲染目标读写反馈。
export function withoutWeatherReflection(world, render) {
  const reflection = world.weatherReflection, saved = reflection?.sampler.value
  const enabled = reflection?.enabled.value
  const particles = [world.weatherRain, world.weatherSnow, world.weatherSplash].filter(Boolean)
  const visibility = particles.map(mesh => mesh.visible)
  if (reflection) { reflection.sampler.value = null; reflection.enabled.value = 0 }
  particles.forEach(mesh => { mesh.visible = false })
  try { return render() } finally {
    if (reflection) { reflection.sampler.value = saved; reflection.enabled.value = enabled }
    particles.forEach((mesh, i) => { mesh.visible = visibility[i] })
  }
}

export function approachWeather(current, target, delta, speed) {
  return current + (target - current) * (1 - Math.exp(-Math.max(0, delta) * speed))
}
