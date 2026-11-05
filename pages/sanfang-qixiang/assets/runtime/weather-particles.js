import {
  Color, DoubleSide, Float32BufferAttribute, Group, InstancedBufferAttribute,
  InstancedBufferGeometry, Mesh, ShaderMaterial, Vector2, Vector3,
} from '../vendor/three/build/three.module.min.js'
import { createRainImpacts, createWeatherHeightField, weatherRandom } from './weather-field.js'

function quad() {
  const geometry = new InstancedBufferGeometry()
  geometry.setIndex([0, 1, 2, 0, 2, 3])
  geometry.setAttribute('position', new Float32BufferAttribute([-.5, -.5, 0, .5, -.5, 0, .5, .5, 0, -.5, .5, 0], 3))
  geometry.setAttribute('uv', new Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2))
  return geometry
}

export function buildWeatherParticles(world) {
  const field = createWeatherHeightField(world.pickMeshes, world.minPoint, world.maxPoint)
  world.weatherField = field
  const geometry = quad(), drops = [], shapes = [], random = weatherRandom()
  for (let i = 0; i < 6600; i++) {
    drops.push(random(), random(), random(), i / 6600)
    shapes.push(random(), random(), random(), random())
  }
  geometry.setAttribute('aDrop', new InstancedBufferAttribute(new Float32Array(drops), 4))
  geometry.setAttribute('aShape', new InstancedBufferAttribute(new Float32Array(shapes), 4))
  geometry.instanceCount = 6600
  const shared = {
    uTime: world.weatherTime,
    uFarSpan: { value: Math.max(world.width, world.depth) * 1.35 }, uHeight: { value: 500 },
    uCenter: { value: world.mapCenter.clone() }, uMidCenter: { value: new Vector3() }, uNearCenter: { value: new Vector3() },
    uPixelScale: { value: .001 }, uWind: { value: new Vector2() }, uWindTravel: { value: new Vector2() },
    weatherHeightMap: { value: field.texture }, weatherBounds: { value: field.bounds },
    fogColor: { value: new Color() }, fogNear: { value: 2200 }, fogFar: { value: 5000 },
  }
  world.weatherParticleUniforms = shared
  for (const snow of [false, true]) {
    const material = new ShaderMaterial({
      uniforms: { ...shared, uOpacity: { value: snow ? .88 : .42 }, uColor: { value: new Color(snow ? '#edf4f8' : '#bdcbd5') } },
      defines: snow ? { SNOW: 1 } : {},
      transparent: true, depthWrite: false, side: DoubleSide, fog: true,
      vertexShader: /* glsl */ `
        attribute vec4 aDrop,aShape;
        uniform float uTime,uFarSpan,uHeight,uPixelScale;
        uniform vec3 uCenter,uMidCenter,uNearCenter;
        uniform vec2 uWind,uWindTravel;
        uniform sampler2D weatherHeightMap;uniform vec4 weatherBounds;
        varying vec2 vDropUv;varying float vAlpha,vSoft,vSeed;
        #include <fog_pars_vertex>
        void main(){
          float middle=step(.40,aDrop.w),nearLayer=step(.80,aDrop.w);
          float span=mix(mix(uFarSpan,320.,middle),72.,nearLayer);
          float height=mix(mix(uHeight,260.,middle),72.,nearLayer);
          vec3 center=mix(mix(vec3(uCenter.x,uHeight*.5,uCenter.z),uMidCenter,middle),uNearCenter,nearLayer);
          float phase=aShape.w*6.283185;
          #ifdef SNOW
            float speed=.6+aShape.x*1.15;
            vec2 drift=uWindTravel*.32+vec2(sin(uTime*.84+phase),cos(uTime*.62+phase))*(.35+aShape.y*.7);
          #else
            float speed=17.+aShape.x*11.;
            vec2 drift=uWindTravel;
          #endif
          vec3 p;
          p.xz=mod(aDrop.xy*span+drift-center.xz+span*.5,span)+center.xz-span*.5;
          float falling=mod(aDrop.z*height-uTime*speed,height);
          p.y=center.y-height*.5+falling;
          vec2 fieldUv=(p.xz-weatherBounds.xy)*weatherBounds.zw;
          float inside=step(0.,fieldUv.x)*step(0.,fieldUv.y)*step(fieldUv.x,1.)*step(fieldUv.y,1.);
          float surface=texture2D(weatherHeightMap,clamp(fieldUv,0.,1.)).r*inside+.035;
          vec4 mvPosition=viewMatrix*vec4(p,1.);
          float depth=max(.1,-mvPosition.z),pixel=max(.0001,depth*uPixelScale);
          float fade=smoothstep(1.,6.,depth)*smoothstep(0.,.6,p.y-surface);
          fade*=smoothstep(0.,.04,falling/height)*(1.-smoothstep(.96,1.,falling/height));
          fade*=1.-smoothstep(400.,2000.,depth)*.85;
          #ifdef SNOW
            float size=clamp(.11+aShape.y*aShape.y*.24,pixel*mix(.9,1.4,nearLayer),pixel*mix(4.,8.,nearLayer));
            float angle=phase+uTime*(aShape.z-.5)*1.7;
            vec2 corner=mat2(cos(angle),-sin(angle),sin(angle),cos(angle))*position.xy;
            corner.x*=.55+.45*abs(cos(uTime*1.6+phase));
            mvPosition.xy+=corner*size;
            vSoft=(1.-smoothstep(6.,26.,depth))*.8;
            vAlpha=fade*(.6+aShape.z*.4)*mix(.75,1.,middle);
          #else
            vec2 velocity=(viewMatrix*vec4(uWind.x,-speed,uWind.y,0.)).xy;
            vec2 direction=velocity/max(.01,length(velocity));
            vec2 right=vec2(-direction.y,direction.x);
            float width=clamp(.016+aShape.y*.02,pixel*.8,pixel*1.5);
            float streak=clamp(length(velocity)*(.022+aShape.z*.022),pixel*3.,pixel*mix(9.,22.,nearLayer));
            mvPosition.xy+=right*position.x*width+direction*position.y*streak;
            vSoft=0.;vAlpha=fade*(.4+aShape.z*.5)*mix(.7,1.,middle);
          #endif
          vDropUv=uv;vSeed=aShape.z;
          gl_Position=projectionMatrix*mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;uniform float uOpacity;
        varying vec2 vDropUv;varying float vAlpha,vSoft,vSeed;
        #include <fog_pars_fragment>
        void main(){
          vec2 p=(vDropUv-.5)*2.;float mask;
          #ifdef SNOW
            float r=length(p),angle=atan(p.y,p.x);
            float edge=.73+.12*cos(angle*6.+vSeed*3.);
            float crystal=1.-smoothstep(edge-.18,edge+.12,r);
            float soft=exp(-r*r*3.3)*(1.-smoothstep(.65,1.,r));
            mask=mix(crystal,soft,vSoft);
          #else
            mask=exp(-p.x*p.x*3.6)*(1.-smoothstep(.62,1.,abs(p.y)))*mix(.55,1.,vDropUv.y);
          #endif
          float alpha=mask*vAlpha*uOpacity;
          if(alpha<.008)discard;
          gl_FragColor=vec4(uColor*mix(.8,1.,vSeed),alpha);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          #include <fog_fragment>
        }`,
    })
    const mesh = new Mesh(geometry, material)
    mesh.name = snow ? 'layered-snowfall' : 'layered-rainfall'
    mesh.frustumCulled = false
    mesh.visible = false
    mesh.renderOrder = snow ? 4 : 3
    if (snow) world.weatherSnow = mesh
    else world.weatherRain = mesh
    world.scene.add(mesh)
  }
  const impacts = createRainImpacts(world, field), splashGeometry = quad()
  splashGeometry.setAttribute('aHit', new InstancedBufferAttribute(impacts.hits, 4))
  splashGeometry.setAttribute('aNormal', new InstancedBufferAttribute(impacts.normals, 3))
  splashGeometry.setAttribute('aKind', new InstancedBufferAttribute(impacts.kinds, 2))
  splashGeometry.instanceCount = impacts.hits.length / 4
  world.weatherSplash = new Group()
  world.weatherSplash.name = 'rain-surface-impacts'
  for (const rise of [false, true]) {
    const material = new ShaderMaterial({
      defines: rise ? { RISE: 1 } : {},
      uniforms: { uTime: world.weatherTime, uOpacity: { value: .32 },
        fogColor: shared.fogColor, fogNear: shared.fogNear, fogFar: shared.fogFar },
      transparent: true, depthWrite: false, side: DoubleSide, fog: true,
      vertexShader: /* glsl */ `
        attribute vec4 aHit;attribute vec3 aNormal;attribute vec2 aKind;
        uniform float uTime;varying vec2 vUv;varying float vFade,vSeed;
        #include <fog_pars_vertex>
        void main(){
          float life=fract(uTime/(.65+aKind.y*.9)+aHit.w),phase=min(1.,life/.28);
          float size=(.22+aKind.y*.3)*mix(1.,.55,aKind.x);
          vec3 p=aHit.xyz;
          vec4 mvPosition;
          #ifdef RISE
            p+=aNormal*sin(phase*3.14159)*size*.3;
            mvPosition=viewMatrix*vec4(p,1.);
            mvPosition.xy+=position.xy*vec2(size*(.6+phase*.6),size*.7)*sin(phase*3.14159);
          #else
            vec3 tangent=normalize(cross(aNormal,vec3(0.,0.,1.))),bitangent=cross(aNormal,tangent);
            p+=(tangent*position.x+bitangent*position.y)*size*(.2+phase*1.7);
            mvPosition=viewMatrix*vec4(p,1.);
          #endif
          gl_Position=projectionMatrix*mvPosition;
          vUv=uv;vSeed=aHit.w;vFade=(1.-step(.28,life))*pow(1.-phase,1.5);
          #ifndef RISE
            vFade*=1.-aKind.x;
          #endif
          #include <fog_vertex>
        }`,
      fragmentShader: /* glsl */ `
        uniform float uOpacity;varying vec2 vUv;varying float vFade,vSeed;
        #include <fog_pars_fragment>
        void main(){
          vec2 p=(vUv-.5)*2.;float r=length(p),mask;
          #ifdef RISE
            float crown=pow(max(0.,cos(atan(p.y,p.x)*5.+vSeed*6.)),6.);
            mask=exp(-pow((r-.5)/.2,2.))*mix(.15,1.,crown);
          #else
            float aa=max(.045,fwidth(r));
            mask=(1.-smoothstep(aa,aa*2.,abs(r-.68)))*.7;
          #endif
          float alpha=mask*vFade*uOpacity;
          if(alpha<.008)discard;
          gl_FragColor=vec4(.63,.72,.78,alpha);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          #include <fog_fragment>
        }`,
    })
    const mesh = new Mesh(splashGeometry, material)
    mesh.frustumCulled = false
    mesh.renderOrder = 2
    world.weatherSplash.add(mesh)
  }
  world.weatherSplash.visible = false
  world.scene.add(world.weatherSplash)
}

const look = new Vector3()
export function updateWeatherParticles(world) {
  const u = world.weatherParticleUniforms
  if (!u) return
  const time = world.weatherClock
  look.subVectors(world.controls.target, world.camera.position).normalize()
  u.uMidCenter.value.copy(world.camera.position).addScaledVector(look, 120)
  u.uNearCenter.value.copy(world.camera.position).addScaledVector(look, 24)
  u.uHeight.value = Math.max(160, world.camera.position.y + 140)
  u.uPixelScale.value = 2 * Math.tan(world.camera.fov * Math.PI / 360) / Math.max(250, world.stage.clientHeight)
  u.uWind.value.set(1.4 + Math.sin(time * .23) * .5, .4 + Math.sin(time * .17) * .3)
  u.uWindTravel.value.set(1.4 * time + .5 / .23 * (1 - Math.cos(time * .23)), .4 * time + .3 / .17 * (1 - Math.cos(time * .17)))
}
