import * as T from './vendor/three/build/three.module.min.js';
import { Reflector } from './vendor/three/examples/jsm/objects/Reflector.js';
import { Builder } from './geometry.js';
import { WATER, shorePoint, seeded, inPond } from './layout.js';

const waterShader = {
  name: 'StillGardenWater',
  uniforms: { tDiffuse: { value: null }, color: { value: new T.Color('#37685b') }, textureMatrix: { value: new T.Matrix4() }, uTime: { value: 0 }, uRain: { value: 0 }, uDay: { value: 1 }, uSun: { value: new T.Vector3(.4, .8, .2) }, uRipples: { value: Array.from({ length: 8 }, () => new T.Vector4(0, 0, -100, 0)) } },
  vertexShader: `uniform mat4 textureMatrix; varying vec4 vMirror; varying vec3 vWorld;
    void main(){ vMirror=textureMatrix*vec4(position,1.); vWorld=(modelMatrix*vec4(position,1.)).xyz;
      gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
  fragmentShader: `uniform sampler2D tDiffuse; uniform vec3 color; uniform float uTime,uRain,uDay;uniform vec3 uSun;uniform vec4 uRipples[8];varying vec4 vMirror;varying vec3 vWorld;
    float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
    void main(){
      vec2 p=vWorld.xz;float t=uTime;
      vec2 wave=vec2(sin(p.x*2.2+p.y*.73+t*.65)+sin(p.x*4.8-p.y*2.1-t*.85)*.32,cos(p.y*2.6+p.x*.6-t*.56)+sin(p.y*5.1+t)*.28)*.018;
      wave+=vec2(sin(p.x*12.+p.y*8.-t*1.5),cos(p.y*13.-p.x*7.+t*1.6))*.0035;
      for(int i=0;i<8;i++){float age=t-uRipples[i].z;vec2 delta=p-uRipples[i].xy;float d=length(delta);float front=d-age*1.6;
        float pulse=sin(front*18.)*exp(-abs(front)*2.8)*exp(-age*.7)*step(0.,age)*uRipples[i].w;
        wave+=normalize(delta+vec2(.0001))*pulse*.065;}
      vec2 cell=floor(p*1.6),local=fract(p*1.6)-.5;float h=hash(cell);float phase=fract(t*.65+h);float rr=length(local+vec2(h-.5,fract(h*8.)-.5)*.5);
      float rainRipple=sin((rr-phase*.6)*36.)*exp(-abs(rr-phase*.6)*22.)*(1.-phase)*uRain;
      wave+=normalize(local+vec2(.001))*rainRipple*.035;
      vec3 n=normalize(vec3(wave.x,1.,wave.y)),v=normalize(cameraPosition-vWorld);
      vec2 uv=vMirror.xy/vMirror.w+wave*.018;
      vec3 reflection=texture2D(tDiffuse,uv).rgb*vec3(.79,.94,.88);
      float fresnel=.09+.66*pow(1.-clamp(dot(v,n),0.,1.),3.5);
      vec3 deep=color*(.17+uDay*.5);
      vec3 radiance=mix(deep,reflection,fresnel);
      float spec=pow(max(dot(reflect(-uSun,n),v),0.),250.);
      radiance+=vec3(1.,.85,.59)*spec*1.3*uDay*(1.-uRain*.8);
      float caustic=pow(max(0.,sin(p.x*3.+sin(p.y*2.4+t*.45))*sin(p.y*3.6+cos(p.x*2.-t*.4))),10.);
      radiance+=vec3(.06,.09,.045)*caustic*uDay*.25;
      gl_FragColor=vec4(radiance,.83+fresnel*.15);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`
};

export function createWater(root, m, uniforms) {
  const shape = new T.Shape();
  for (let i = 0; i <= 240; i++) { const [x, z] = shorePoint(i / 240 * Math.PI * 2, .08); if (!i) shape.moveTo(x, -z); else shape.lineTo(x, -z); }
  const water = new Reflector(new T.ShapeGeometry(shape, 240), { textureWidth: 768, textureHeight: 768, multisample: 0, clipBias: .004, shader: waterShader });
  water.rotation.x = -Math.PI / 2; water.position.y = WATER; water.material.transparent = true; water.material.depthWrite = false; water.renderOrder = 3; water.userData.skipAO = true;
  water.material.uniforms.uTime = uniforms.time; water.material.uniforms.uDay = uniforms.day; water.material.uniforms.uRain = uniforms.rain; water.material.uniforms.uSun = uniforms.sun;
  root.add(water);
  const renderReflection = water.onBeforeRender;
  water.onBeforeRender = function(renderer, scene, camera) { if (scene.overrideMaterial) return; renderReflection.call(this, renderer, scene, camera); };
  const r = seeded(2003), b = new Builder(root), leaves = [];
  const lotusGeo = new T.CircleGeometry(1, 40, .08, Math.PI * 2 - .16), lp = lotusGeo.attributes.position;
  for (let i = 0; i < lp.count; i++) { const x = lp.getX(i), y = lp.getY(i), rad = Math.hypot(x, y); lp.setZ(i, .11 * rad ** 2 + Math.sin(Math.atan2(y, x) * 9) * .025 * rad ** 5); } lotusGeo.computeVertexNormals();
  const c = document.createElement('canvas'); c.width = c.height = 256; const ctx = c.getContext('2d');
  ctx.fillStyle = '#a0b16c'; ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 30; i++) { const a = i / 30 * Math.PI * 2; ctx.strokeStyle = 'rgba(231,230,171,.35)'; ctx.lineWidth = i % 2 ? .55 : 1.2; ctx.beginPath(); ctx.moveTo(128, 128); ctx.quadraticCurveTo(128 + Math.cos(a + .08) * 70, 128 + Math.sin(a + .08) * 70, 128 + Math.cos(a) * 128, 128 + Math.sin(a) * 128); ctx.stroke(); }
  const leafMap = new T.CanvasTexture(c); leafMap.colorSpace = T.SRGBColorSpace; m.lotus.map = leafMap; m.lotus.color.set('#a9ba78');
  const petalGeo = new T.PlaneGeometry(1, 1, 8, 14), pp = petalGeo.attributes.position;
  for (let i = 0; i < pp.count; i++) { const t = pp.getY(i) + .5, u = pp.getX(i) * 2; pp.setXYZ(i, u * Math.sin(Math.PI * t) ** .8 * .49, t * 1.7, t * t * .7 - u * u * Math.sin(Math.PI * t) * .13); } petalGeo.computeVertexNormals();
  const stemGeo = new T.CylinderGeometry(.018, .024, 1, 5);
  for (let i = 0; i < 155; i++) {
    const patch = i % 3, cx = patch === 0 ? -11 : patch === 1 ? 22 : -22, cz = patch === 0 ? 14 : patch === 1 ? -5 : -10;
    const x = cx + (r() - .5) * 9, z = cz + (r() - .5) * 7;
    if (!inPond(x, z, -1.5)) continue;
    const s = .35 + r() * .45, height = WATER + .08 + (r() > .6 ? r() * .8 : 0);
    b.instance('lotus-pads', lotusGeo, m.lotus, [x, height, z], [-Math.PI / 2 + (r() - .5) * .15, r() * .3, r() * Math.PI * 2], [s, s, s], new T.Color().setHSL(.2, .12, .65 + r() * .35));
    if (height > .2) b.instance('lotus-stems', stemGeo, m.bamboo, [x, (height + WATER) / 2, z], [0, 0, .07], [1, height - WATER, 1]);
    if (i % 10 === 0) {
      const yy = height + .5; b.instance('flower-stems', stemGeo, m.bamboo, [x + .2, (yy + WATER) / 2, z], [0, 0, 0], [1, yy - WATER, 1]);
      for (let j = 0; j < 21; j++) {
        const a = j * 2.4, layer = Math.floor(j / 7), rr = .13 + layer * .045;
        const rotation = new T.Euler(0, a, 0), q = new T.Quaternion().setFromEuler(rotation).multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(1, 0, 0), .35 + layer * .3)); const e = new T.Euler().setFromQuaternion(q);
        b.instance('lotus-petals', petalGeo, m.petal, [x + .2 + Math.sin(a) * rr * .6, yy - layer * .025, z + Math.cos(a) * rr * .6], [e.x, e.y, e.z], [.19 + layer * .055, .2 + layer * .05, .22], new T.Color().setHSL(.96, .12, .88 + r() * .11));
      }
      b.instance('lotus-heart', petalGeo, m.paper, [x + .2, yy + .08, z], [0, 0, 0], [.07, .08, .07]);
    }
  }
  b.finish();
  const koi = [], fishGroup = new T.Group(); root.add(fishGroup);
  const fishTexture = document.createElement('canvas'); fishTexture.width = 256; fishTexture.height = 128; const f = fishTexture.getContext('2d'); f.fillStyle = '#e9d7a6'; f.fillRect(0, 0, 256, 128);
  for (let i = 0; i < 14; i++) { f.fillStyle = i % 3 ? '#b84419' : '#3e4839'; f.beginPath(); f.ellipse(r() * 256, r() * 128, 12 + r() * 30, 8 + r() * 25, r() * 6.28, 0, Math.PI * 2); f.fill(); }
  const fmap = new T.CanvasTexture(fishTexture); fmap.colorSpace = T.SRGBColorSpace;
  const fishMat = new T.MeshStandardMaterial({ map: fmap, roughness: .42, color: '#fff2ba' });
  const finMat = new T.MeshStandardMaterial({ color: '#cdbb8b', roughness: .65, side: T.DoubleSide, transparent: true, opacity: .72 });
  const bodyGeo = new T.SphereGeometry(1, 16, 10); bodyGeo.scale(.52, .12, .18);
  const tailGeo = new T.BufferGeometry(); tailGeo.setAttribute('position', new T.Float32BufferAttribute([-.38, 0, 0, -.77, .04, -.21, -.68, .01, 0, -.38, 0, 0, -.68, .01, 0, -.77, .04, .21], 3)); tailGeo.computeVertexNormals();
  for (let i = 0; i < 20; i++) { const group = new T.Group(); const body = new T.Mesh(bodyGeo, fishMat), tail = new T.Mesh(tailGeo, finMat); group.add(body, tail); const s = .55 + r() * .65; group.scale.setScalar(s); fishGroup.add(group); koi.push({ group, tail, radius: 3 + r() * 6, offset: r() * 6.28, speed: .055 + r() * .04, center: [i < 12 ? -7 : 17, i < 12 ? 11 : -8] }); }
  const rippleUniform = water.material.uniforms.uRipples.value; let rippleIndex = 0;
  return {
    water, fishGroup,
    splash(x, z) { rippleUniform[rippleIndex++ % 8].set(x, z, uniforms.time.value, 1); },
    setQuality(quality) { const size = quality === 'high' ? 1024 : quality === 'low' ? 384 : 640; water.getRenderTarget().setSize(size, size); },
    update(time) { for (const k of koi) { const a = time * k.speed + k.offset, x = k.center[0] + Math.cos(a) * k.radius, z = k.center[1] + Math.sin(a) * k.radius * .5; k.group.position.set(x, WATER - .25 - Math.sin(a * 2) * .1, z); k.group.rotation.y = Math.atan2(-Math.cos(a) * .5, -Math.sin(a)); k.tail.rotation.y = Math.sin(time * 5 + k.offset) * .25; } },
    dispose() { water.getRenderTarget().dispose(); }
  };
}
