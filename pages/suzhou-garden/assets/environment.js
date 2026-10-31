import * as T from './vendor/three/build/three.module.min.js';
import { HDRLoader } from './vendor/three/examples/jsm/loaders/HDRLoader.js';
import { seeded, clamp } from './layout.js';

export async function createEnvironment(scene, renderer, uniforms) {
  const loader = new HDRLoader();
  const skies = await Promise.allSettled(['kloofendal_48d_partly_cloudy_puresky', 'qwantani_sunset_puresky'].map(name => loader.loadAsync(new URL(`./textures/${name}.hdr`, import.meta.url).href)));
  const hdr = skies[0].status === 'fulfilled' ? skies[0].value : null, sunset = skies[1].status === 'fulfilled' ? skies[1].value : hdr;
  if (hdr) hdr.wrapS = T.RepeatWrapping;
  if (sunset) sunset.wrapS = T.RepeatWrapping;
  const skyMaterial = new T.ShaderMaterial({ side: T.BackSide, depthWrite: false, uniforms: { uSky: { value: hdr }, uSunset: { value: sunset }, uHasHDR: { value: hdr ? 1 : 0 }, uSkyRotation: { value: -.5 }, uTime: uniforms.time, uDay: uniforms.day, uRain: uniforms.rain, uSun: uniforms.sun, uTop: { value: new T.Color('#779fbe') }, uHorizon: { value: new T.Color('#dfdfc5') }, uWarm: { value: 0 } },
    vertexShader: `varying vec3 vWorld;void main(){vWorld=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `varying vec3 vWorld;uniform float uTime,uDay,uRain,uWarm,uHasHDR,uSkyRotation;uniform vec3 uSun,uTop,uHorizon;uniform sampler2D uSky,uSunset;
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y);}
      float fbm(vec2 p){float f=0.,a=.5;for(int i=0;i<5;i++){f+=noise(p)*a;p=p*2.03+13.4;a*=.5;}return f;}
      void main(){vec3 d=normalize(vWorld);float h=max(d.y,0.);vec3 col=mix(uHorizon,uTop,pow(h,.55));
        float mu=max(dot(d,uSun),0.);col+=vec3(1.,.64,.25)*pow(mu,12.)*.17*uDay*(1.-uRain);
        vec2 uv=d.xz/(h+.2)*2.4+vec2(uTime*.0015,uTime*.0007);float n=fbm(uv);float cloud=smoothstep(.48-uRain*.14,.73,n)*smoothstep(0.,.15,h);
        float edge=fbm(uv+vec2(.15));vec3 lit=mix(vec3(.7,.75,.72),vec3(1.,.99,.92),smoothstep(.35,.7,edge));
        col=mix(col,lit*(.12+uDay*.8),cloud*(.65+uRain*.3));
        if(uHasHDR>.5){vec2 skyUV=vec2(atan(d.z,d.x)/6.283185+.5+uSkyRotation+uTime*.000018,asin(clamp(d.y,-1.,1.))/3.14159+.5);
          vec3 photo=mix(texture2D(uSky,skyUV).rgb*.63,texture2D(uSunset,skyUV+vec2(.3,0.)).rgb*.8,clamp(uWarm,0.,1.));
          photo=mix(photo,vec3(dot(photo,vec3(.2126,.7152,.0722)))*.7,uRain*.8);
          col=mix(col,photo,smoothstep(.015,.13,h)*uDay*(1.-uRain*.55));}
        float sun=smoothstep(.9996,.9999,mu);col+=vec3(1.,.88,.62)*sun*2.5*uDay*(1.-uRain)*(1.-uHasHDR);
        float star=step(.9988,hash(floor(d.xz/(h+.35)*650.)))*smoothstep(.08,.4,h)*(1.-uDay)*(1.-uRain);col+=star*.65;
        gl_FragColor=vec4(col,1.);#include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`.replace('gl_FragColor=vec4(col,1.);#include', 'gl_FragColor=vec4(col,1.);\n#include') });
  const sky = new T.Mesh(new T.SphereGeometry(450, 32, 16), skyMaterial); sky.userData.skipAO = true; sky.frustumCulled = false; scene.add(sky);
  const hemisphere = new T.HemisphereLight('#d4e4e4', '#677553', 1.4); scene.add(hemisphere);
  const sun = new T.DirectionalLight('#fff0cd', 3.2); sun.position.set(-45, 65, 25); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.normalBias = .045; sun.shadow.bias = -.00015; sun.shadow.radius = 2;
  Object.assign(sun.shadow.camera, { left: -43, right: 43, top: 43, bottom: -43, near: 1, far: 190 }); scene.add(sun, sun.target);
  const bounce = new T.DirectionalLight('#bfc4a1', .36); bounce.position.set(10, 8, 30); scene.add(bounce);
  scene.fog = new T.FogExp2('#d4ddc7', .0045);
  const pmrem = new T.PMREMGenerator(renderer); let envTarget = null, lastHour = 9.5, rainy = false;
  const nightLights = [];
  for (const [x, y, z] of [[13, 3.5, 3], [0, 3.6, -28], [-49, 3.3, -28], [48, 3.6, -29], [0, 3.5, 46], [34.3, 3, 15], [34.3, 3, -16], [-48, 3, 2], [46, 3, 6]]) { const lamp = new T.PointLight('#ffc47a', 0, 13, 2); lamp.position.set(x, y, z); scene.add(lamp); nightLights.push(lamp); }
  function environmentMap() {
    const temp = new T.Scene(); const dome = new T.Mesh(sky.geometry, skyMaterial); temp.add(dome);
    const next = pmrem.fromScene(temp, .025, .1, 600); envTarget?.dispose(); envTarget = next; scene.environment = next.texture;
  }
  function setHour(hour, updateEnv = true) {
    lastHour = hour;
    const day = clamp(Math.sin((hour - 5.2) / 14.2 * Math.PI) * 1.5, 0, 1), night = 1 - day;
    const warm = Math.max(0, 1 - Math.abs(hour - 17.7) / 2.4) + Math.max(0, 1 - Math.abs(hour - 6.4) / 1.6) * .6;
    uniforms.day.value = day; uniforms.rain.value = rainy ? 1 : 0; uniforms.wind.value = rainy ? 1.7 : 1;
    const angle = (hour - 6) / 13 * Math.PI, sunPosition = new T.Vector3(-Math.cos(angle) * 75, Math.max(13, Math.sin(angle) * 85), 35);
    if (night > .8) sunPosition.set(-35, 65, -45);
    uniforms.sun.value.copy(sunPosition).normalize(); sun.position.copy(sun.target.position).add(sunPosition);
    sun.color.set(day < .2 ? '#b5d4ed' : warm > .3 ? '#ffd39a' : '#fff3df'); sun.intensity = (day * (4.1 - warm * .7) + night * .65) * (rainy ? .28 : 1);
    hemisphere.color.set(day > .3 ? '#c4dce4' : '#99b7cf'); hemisphere.groundColor.set(day > .3 ? '#68744f' : '#344d53'); hemisphere.intensity = .3 + day * .65;
    bounce.intensity = .13 + day * .35; scene.environmentIntensity = .22 + day * .36;
    skyMaterial.uniforms.uTop.value.set(day < .2 ? '#102b40' : rainy ? '#8dabae' : '#588faf');
    skyMaterial.uniforms.uHorizon.value.set(day < .2 ? '#3b5359' : rainy ? '#bdcdc5' : warm > .3 ? '#e9cba2' : '#dce5d4'); skyMaterial.uniforms.uWarm.value = warm;
    skyMaterial.uniforms.uSkyRotation.value = -.5 + (hour - 9.5) * .035;
    scene.fog.color.copy(skyMaterial.uniforms.uHorizon.value); scene.fog.density = rainy ? .011 : hour < 8 ? .0085 : .0045;
    renderer.toneMappingExposure = .9 + day * .02; renderer.shadowMap.needsUpdate = true;
    for (const lamp of nightLights) lamp.intensity = (night * .9 + (rainy ? .15 : 0)) * 17;
    if (updateEnv) environmentMap();
    return { day, night, warm };
  }
  // Light rain particles surround the viewer, not the entire 1.5 hectare site.
  const r = seeded(84), rainPositions = new Float32Array(1100 * 6), rainSeeds = [];
  for (let i = 0; i < 1100; i++) rainSeeds.push([r() * 50 - 25, r() * 26, r() * 50 - 25, .65 + r() * .7]);
  const rainGeo = new T.BufferGeometry(); rainGeo.setAttribute('position', new T.BufferAttribute(rainPositions, 3));
  const rainMaterial = new T.LineBasicMaterial({ color: '#d4e5da', transparent: true, opacity: .32, depthWrite: false });
  const rain = new T.LineSegments(rainGeo, rainMaterial); rain.frustumCulled = false; rain.visible = false; rain.userData.skipAO = true; scene.add(rain);
  // Sparse pollen / fireflies add local life without a screen-space overlay.
  const moteGeo = new T.BufferGeometry(), motePositions = new Float32Array(100 * 3), moteSeeds = Array.from({ length: 100 }, () => [r() * 100 - 50, 1 + r() * 8, r() * 70 - 35, r() * 6.28]);
  const dot = document.createElement('canvas'); dot.width = dot.height = 32; const ctx = dot.getContext('2d'), grad = ctx.createRadialGradient(16, 16, 0, 16, 16, 16); grad.addColorStop(0, '#ffffff'); grad.addColorStop(.2, '#ffffffcc'); grad.addColorStop(1, '#ffffff00'); ctx.fillStyle = grad; ctx.fillRect(0, 0, 32, 32);
  moteGeo.setAttribute('position', new T.BufferAttribute(motePositions, 3));
  const moteMaterial = new T.PointsMaterial({ color: '#e7dea5', map: new T.CanvasTexture(dot), size: .1, transparent: true, opacity: .5, depthWrite: false, blending: T.AdditiveBlending }); const motes = new T.Points(moteGeo, moteMaterial); scene.add(motes);
  setHour(9.5);
  return {
    sun, sky, setHour,
    setWeather(value) { rainy = value === 'rain'; rain.visible = rainy; return setHour(lastHour); },
    update(time, camera, mode) {
      if (rainy) { for (let i = 0; i < rainSeeds.length; i++) { const [x, y, z, v] = rainSeeds[i], fall = ((y - time * 12 * v) % 26 + 26) % 26; const xx = x + camera.position.x, zz = z + camera.position.z, yy = fall - 1 + Math.max(0, camera.position.y - 8); rainPositions.set([xx, yy, zz, xx + .07, yy + .7 * v, zz + .035], i * 6); } rainGeo.attributes.position.needsUpdate = true; }
      for (let i = 0; i < moteSeeds.length; i++) { const [x, y, z, phase] = moteSeeds[i]; motePositions.set([x + Math.sin(time * .16 + phase) * 1.3, y + Math.sin(time * .24 + phase) * .7, z + Math.cos(time * .1 + phase)], i * 3); } moteGeo.attributes.position.needsUpdate = true;
      moteMaterial.size = .055 + (1 - uniforms.day.value) * .12; moteMaterial.opacity = rainy ? .05 : .3 + (1 - uniforms.day.value) * .6;
      // Recenter the shadow frustum only after a meaningful walk, not every frame.
      const cx = mode === 'walk' ? camera.position.x : 0, cz = mode === 'walk' ? camera.position.z : 0;
      if (Math.hypot(cx - sun.target.position.x, cz - sun.target.position.z) > 12) { const direction = sun.position.clone().sub(sun.target.position); sun.target.position.set(cx, 0, cz); sun.position.copy(sun.target.position).add(direction); renderer.shadowMap.needsUpdate = true; }
    },
    setQuality(value) { const size = value === 'high' ? 4096 : value === 'low' ? 1024 : 2048; sun.shadow.mapSize.set(size, size); sun.shadow.map?.dispose(); sun.shadow.map = null; renderer.shadowMap.needsUpdate = true; },
    dispose() { envTarget?.dispose(); pmrem.dispose(); hdr?.dispose(); if (sunset !== hdr) sunset?.dispose(); }
  };
}
