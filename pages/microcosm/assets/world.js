import * as THREE from './vendor/three/build/three.module.min.js';
import { OrbitControls } from './vendor/three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from './vendor/three/examples/jsm/postprocessing/EffectComposer.js';
import { FXAAPass } from './vendor/three/examples/jsm/postprocessing/FXAAPass.js';
import { UnrealBloomPass } from './vendor/three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from './vendor/three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from './vendor/three/examples/jsm/postprocessing/OutputPass.js';
import { RoomEnvironment } from './vendor/three/examples/jsm/environments/RoomEnvironment.js';
import { createTerrain, seededRandom, heightAt, riverX, waterDistance, noise, HALF, WATER, UPPER_WATER, FALL_Z } from './landscape.js';
import { loadSurfaces, createWaterNormals } from './materials.js';
import { createForest } from './forest.js';
import { createUnderstory } from './understory.js';
import { createOcclusion } from './occlusion.js';

const clamp = THREE.MathUtils.clamp;
const mix = THREE.MathUtils.lerp;
const vertex = `varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;

export async function createWorld({ canvas, host, onTime, onFailure }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(Math.max(devicePixelRatio, 1.25), 2));
  renderer.setClearColor(0x080f18, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.18;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#080f18');
  const camera = new THREE.OrthographicCamera(-10,10,10,-10,.1,120);
  const initialPosition = new THREE.Vector3(12, 11.2, 14);
  camera.position.copy(initialPosition);
  camera.lookAt(0,0,0);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true; controls.dampingFactor = .07;
  controls.enablePan = false; controls.minZoom = .7; controls.maxZoom = 3;
  controls.minPolarAngle = Math.PI * .18; controls.maxPolarAngle = Math.PI * .49;
  controls.rotateSpeed = .55; controls.zoomSpeed = .65; controls.autoRotateSpeed = .25;
  controls.target.set(0,-.2,0); controls.update(); controls.saveState();
  const state = { paused: false, orbit: false, atmosphere: true, hour: 9, elapsed: 0 };
  const world = new THREE.Group(); scene.add(world);
  const random = seededRandom(98);
  const time = { value: 0 }, daylight = { value: 1 };
  const surfaces = await loadSurfaces(renderer);
  world.add(createTerrain(surfaces), createForest(surfaces,time));
  const understory=createUnderstory(surfaces,time,daylight);world.add(understory.root);

  const environmentScene = new RoomEnvironment();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const environment = pmrem.fromScene(environmentScene, .025);
  scene.environment = environment.texture;
  scene.environmentIntensity = .38;
  environmentScene.dispose(); pmrem.dispose();
  const ambient = new THREE.HemisphereLight('#d6edec', '#526557', 2); scene.add(ambient);
  const sun = new THREE.DirectionalLight('#fff1d4', 3.5);
  sun.position.set(-5,10,6); sun.castShadow = true;
  sun.shadow.mapSize.set(2048,2048);
  Object.assign(sun.shadow.camera,{left:-7,right:7,top:7,bottom:-7,near:.1,far:40});
  sun.shadow.normalBias = .012; sun.shadow.bias = -.0001; sun.shadow.radius = 2;
  scene.add(sun);
  const rim = new THREE.DirectionalLight('#8bddf4', 2.2); rim.position.set(5,3,-6); scene.add(rim);
  const fill = new THREE.DirectionalLight('#c7dab2', .7); fill.position.set(3,1,8); scene.add(fill);

  const waterNormals=createWaterNormals();waterNormals.repeat.set(5,5);
  const reflectionTarget=new THREE.WebGLRenderTarget(1,1,{type:THREE.HalfFloatType,samples:Math.min(4,renderer.capabilities.maxSamples)});
  const reflectionCamera=camera.clone(),reflectionMatrix=new THREE.Matrix4();
  const reflectionPlane=new THREE.Plane(new THREE.Vector3(0,1,0),-WATER);
  const waterMaterial = new THREE.MeshPhysicalMaterial({color:'#237f83',normalMap:waterNormals,normalScale:new THREE.Vector2(.2,.2),metalness:.05,roughness:.14,clearcoat:1,clearcoatRoughness:.12,transparent:true,opacity:.87,depthWrite:false,envMapIntensity:.55,emissive:'#123b40',emissiveIntensity:.04,side:THREE.DoubleSide});
  waterMaterial.onBeforeCompile = shader => {
    shader.uniforms.uTime=time;shader.uniforms.waterReflection={value:reflectionTarget.texture};shader.uniforms.reflectionMatrix={value:reflectionMatrix};
    shader.vertexShader='uniform float uTime;uniform mat4 reflectionMatrix;varying vec3 vWater;varying vec4 vMirror;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
      transformed.z += sin(position.x*11.+uTime*.8)*sin(position.y*9.-uTime*.65)*.008;
      vWater=position;vMirror=reflectionMatrix*modelMatrix*vec4(transformed,1.);`);
    shader.fragmentShader='uniform float uTime;uniform sampler2D waterReflection;varying vec4 vMirror;varying vec3 vWater;\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
      float ripple=pow(max(0.,sin(vWater.x*24.+sin(vWater.y*13.+uTime)*2.+uTime*1.3)*sin(vWater.y*28.-uTime*.7)),12.);
      diffuseColor.rgb+=vec3(.035,.065,.05)*ripple;`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',`vec2 mirrorUV=vMirror.xy/vMirror.w+normal.xy*.004;
      vec3 reflectedWater=texture2D(waterReflection,mirrorUV).rgb;
      float fresnelWater=.19+pow(1.-max(0.,normal.z),3.)*.45;
      outgoingLight=mix(outgoingLight,reflectedWater,fresnelWater);
      #include <opaque_fragment>`);
  };
  const waterGeometry = new THREE.PlaneGeometry(HALF*2,HALF*2,120,120);
  const waterIndices = [], waterVertices = waterGeometry.attributes.position;
  for (let i = 0; i < waterGeometry.index.count; i += 3) {
    const ids = [waterGeometry.index.getX(i), waterGeometry.index.getX(i+1), waterGeometry.index.getX(i+2)];
    const x = ids.reduce((sum,id)=>sum+waterVertices.getX(id),0)/3;
    const z = -ids.reduce((sum,id)=>sum+waterVertices.getY(id),0)/3;
    if (waterDistance(x,z) < 1.55 && z > FALL_Z-.08) waterIndices.push(...ids);
  }
  waterGeometry.setIndex(waterIndices);
  const water = new THREE.Mesh(waterGeometry,waterMaterial);
  water.rotation.x=-Math.PI/2;water.position.y=WATER;water.receiveShadow=true;world.add(water);
  const upperPositions=[], upperUV=[];
  for(let i=0;i<90;i++){
    const z1=mix(-2.45,FALL_Z,i/90),z2=mix(-2.45,FALL_Z,(i+1)/90);
    for(const [z,s] of [[z1,-1],[z2,-1],[z1,1],[z2,-1],[z2,1],[z1,1]]){upperPositions.push(riverX(z)+s*.34,UPPER_WATER,z);upperUV.push((s+1)/2,z);}
  }
  const upperGeo=new THREE.BufferGeometry();upperGeo.setAttribute('position',new THREE.Float32BufferAttribute(upperPositions,3));upperGeo.setAttribute('uv',new THREE.Float32BufferAttribute(upperUV,2));upperGeo.computeVertexNormals();
  const upperMaterial=waterMaterial.clone();upperMaterial.onBeforeCompile=()=>{};
  const upperRiver=new THREE.Mesh(upperGeo,upperMaterial);world.add(upperRiver);
  const fallMaterial=new THREE.ShaderMaterial({uniforms:{uTime:time,uDay:daylight},vertexShader:vertex,transparent:true,side:THREE.DoubleSide,depthWrite:false,
    fragmentShader:`varying vec2 vUv;uniform float uTime;uniform float uDay;
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y);}
      void main(){vec2 p=vec2(vUv.x*28.,vUv.y*9.+uTime*2.4);float strand=noise(p)*.6+noise(p*2.)*.28+noise(p*4.)*.12;
      float edge=smoothstep(0.,.12,vUv.x)*smoothstep(1.,.88,vUv.x);
      float foam=smoothstep(.3,.8,strand)+pow(1.-vUv.y,4.)*.35;
      vec3 color=mix(vec3(.12,.43,.48),vec3(.85,.97,.94),foam);
      gl_FragColor=vec4(color*(.4+uDay*.8),edge*(.3+foam*.65));}`});
  const fallHeight=UPPER_WATER-WATER;
  const waterfall=new THREE.Mesh(new THREE.PlaneGeometry(.68,fallHeight,20,24),fallMaterial);
  const fallVertices=waterfall.geometry.attributes.position;
  for(let i=0;i<fallVertices.count;i++){const p=.5-fallVertices.getY(i)/fallHeight;fallVertices.setZ(i,Math.sin(p*Math.PI*.8)*.1);}
  waterfall.geometry.computeVertexNormals();
  waterfall.position.set(riverX(FALL_Z),WATER+fallHeight/2,FALL_Z+.018);world.add(waterfall);
  const splashGroup=new THREE.Group();world.add(splashGroup);
  const ripples=[];
  for(let i=0;i<5;i++){
    const material=new THREE.MeshBasicMaterial({color:'#d4f3e7',transparent:true,opacity:.2,depthWrite:false,side:THREE.DoubleSide});
    const mesh=new THREE.Mesh(new THREE.RingGeometry(.28,.3,48),material);mesh.rotation.x=-Math.PI/2;mesh.position.set(riverX(FALL_Z),WATER+.025,FALL_Z+.12);splashGroup.add(mesh);ripples.push(mesh);
  }
  const dropPositions=new Float32Array(420*3),dropSeeds=[];
  for(let i=0;i<420;i++)dropSeeds.push([random(),random(),random()]);
  const dropGeo=new THREE.BufferGeometry();dropGeo.setAttribute('position',new THREE.BufferAttribute(dropPositions,3));
  const droplets=new THREE.Points(dropGeo,new THREE.PointsMaterial({color:'#d0eae6',size:.017,transparent:true,opacity:.65,depthWrite:false}));splashGroup.add(droplets);

  function glowTexture() {
    const c=document.createElement('canvas');c.width=c.height=128;const ctx=c.getContext('2d');
    const g=ctx.createRadialGradient(64,64,0,64,64,64);g.addColorStop(0,'rgba(255,255,255,1)');g.addColorStop(.2,'rgba(255,255,255,.6)');g.addColorStop(.55,'rgba(255,255,255,.14)');g.addColorStop(1,'rgba(255,255,255,0)');
    ctx.fillStyle=g;ctx.fillRect(0,0,128,128);return new THREE.CanvasTexture(c);
  }
  const glowMap=glowTexture();
  const cloudCanvas=document.createElement('canvas');cloudCanvas.width=cloudCanvas.height=128;
  const cloudContext=cloudCanvas.getContext('2d'),cloudPixels=cloudContext.createImageData(128,128);
  for(let y=0;y<128;y++)for(let x=0;x<128;x++){
    const u=(x-64)/64,v=(y-64)/64,r=Math.hypot(u,v),n=noise(x*.055,y*.055)*.6+noise(x*.14,y*.14)*.3+noise(x*.31,y*.31)*.1;
    const a=Math.max(0,1-r)**1.1*THREE.MathUtils.smoothstep(n,.2,.7),i=(y*128+x)*4,shade=clamp(.8-v*.16+n*.13,0,1);
    cloudPixels.data[i]=shade*235;cloudPixels.data[i+1]=shade*246;cloudPixels.data[i+2]=shade*250;cloudPixels.data[i+3]=a*240;
  }
  cloudContext.putImageData(cloudPixels,0,0);const cloudMap=new THREE.CanvasTexture(cloudCanvas);
  const atmosphere=new THREE.Group();world.add(atmosphere);
  const clouds=[];
  const cloudMaterial=new THREE.SpriteMaterial({map:cloudMap,color:'#e1eeea',transparent:true,opacity:.7,depthWrite:false});
  for(const [x,y,z,s] of [[-2.8,2.7,.4,.86],[2.5,3,-.5,.76],[.9,2.2,2.2,.57],[-.2,3.6,-2.2,.5]]){
    const cloud=new THREE.Group();cloud.position.set(x,y,z);cloud.userData={x,z,phase:random()*6.28};
    for(let j=0;j<12;j++){
      const puff=new THREE.Sprite(cloudMaterial);puff.position.set((j-5.5)*.12,Math.sin(j*1.5)*.1,Math.cos(j*1.8)*.18);puff.scale.set(.9,.52+random()*.28,1);cloud.add(puff);
    }
    cloud.scale.setScalar(s);atmosphere.add(cloud);clouds.push(cloud);
  }
  const impactMist=new THREE.Sprite(new THREE.SpriteMaterial({map:cloudMap,color:'#d5eeeb',transparent:true,opacity:.55,depthWrite:false}));impactMist.position.set(riverX(FALL_Z),WATER+.13,FALL_Z+.12);impactMist.scale.set(1,.35,1);atmosphere.add(impactMist);
  const mists=[];
  for(let i=0;i<15;i++){
    const mat=new THREE.SpriteMaterial({map:glowMap,color:'#c4e2d6',transparent:true,opacity:.07,depthWrite:false});
    const mist=new THREE.Sprite(mat);const x=(random()-.5)*6.5,z=(random()-.5)*6.5;
    mist.position.set(x,Math.max(-.7,heightAt(x,z)+.35),z);mist.scale.set(2.1+random()*1.5,.35+random()*.2,1);mist.userData={x,z,phase:random()*6.28};atmosphere.add(mist);mists.push(mist);
  }
  // Soft, translucent shafts drift through the upper canopy.
  const shaftMat=new THREE.ShaderMaterial({uniforms:{uDay:daylight},vertexShader:vertex,transparent:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,
    fragmentShader:`varying vec2 vUv;uniform float uDay;void main(){float a=pow(sin(vUv.x*3.14159),2.)*sin(vUv.y*3.14159);gl_FragColor=vec4(.86,.91,.72,a*.042*uDay);}`});
  for(let i=0;i<5;i++){
    const shaft=new THREE.Mesh(new THREE.PlaneGeometry(.5+i*.16,5),shaftMat);shaft.position.set(-2+i*1.1,1.4,-1.5+i*.5);shaft.rotation.z=-.3;atmosphere.add(shaft);
  }

  const animals=[];
  const fur=new THREE.MeshStandardMaterial({color:'#bb8960',roughness:.85});
  const cream=new THREE.MeshStandardMaterial({color:'#f0e3c4',roughness:.8});
  const dark=new THREE.MeshStandardMaterial({color:'#343630',roughness:.8});
  const sphere=new THREE.SphereGeometry(1,16,12);
  function part(parent,geo,mat,pos,scale){const p=new THREE.Mesh(geo,mat);p.position.set(...pos);p.scale.set(...scale);p.castShadow=true;parent.add(p);return p;}
  function deer(x,z,s,heading){
    const animal=new THREE.Group();const y=heightAt(x,z);animal.position.set(x,y,z);animal.scale.setScalar(s);animal.rotation.y=heading;
    part(animal,sphere,fur,[0,.3,0],[.21,.13,.1]);
    part(animal,sphere,cream,[-.15,.34,0],[.055,.07,.075]);
    const head=new THREE.Group();head.position.set(.17,.46,0);animal.add(head);
    const neck=part(animal,sphere,fur,[.14,.4,0],[.075,.16,.065]);neck.rotation.z=.3;
    part(head,sphere,fur,[.035,.035,0],[.1,.075,.058]);part(head,sphere,dark,[.115,.02,0],[.023,.02,.036]);
    for(const side of [-1,1]) {part(head,sphere,fur,[.0,.12,side*.065],[.035,.077,.023]).rotation.x=side*.6;part(head,sphere,dark,[.067,.056,side*.052],[.011,.014,.008]);}
    if(s>1)for(const side of [-1,1]){
      const antler=new THREE.CatmullRomCurve3([new THREE.Vector3(-.015,.08,side*.035),new THREE.Vector3(-.035,.21,side*.07),new THREE.Vector3(-.07,.3,side*.1)]);
      head.add(new THREE.Mesh(new THREE.TubeGeometry(antler,8,.009,5,false),cream));
      for(let j=0;j<2;j++){const prong=new THREE.CatmullRomCurve3([new THREE.Vector3(-.03-j*.015,.18+j*.055,side*(.065+j*.02)),new THREE.Vector3(.015-j*.015,.24+j*.055,side*(.09+j*.02))]);head.add(new THREE.Mesh(new THREE.TubeGeometry(prong,4,.006,4,false),cream));}
    }
    part(animal,sphere,cream,[-.21,.35,0],[.055,.025,.035]);
    const legs=[];for(const lx of [-.13,.13])for(const lz of [-.065,.065])legs.push(part(animal,new THREE.CylinderGeometry(.018,.012,.23,5),fur,[lx,.13,lz],[1,1,1]));
    for(let i=0;i<7;i++)part(animal,sphere,cream,[-.12+i*.04,.35+Math.sin(i*2)*.025,.083],[.013,.014,.009]);
    world.add(animal);animals.push({root:animal,head,legs,x,z,heading,phase:random()*6.28});
  }
  deer(2.1,2.2,1.1,-.7);deer(2.7,2.6,.78,-1.4);deer(-2.25,2.95,.92,.6);
  const rabbits=[];
  for(const [x,z] of [[-1.6,1.8],[-1.9,2.02]]){
    const r=new THREE.Group();r.position.set(x,heightAt(x,z),z);r.rotation.y=1.4;
    part(r,sphere,cream,[0,.09,0],[.12,.09,.075]);part(r,sphere,cream,[.085,.15,0],[.065,.06,.05]);
    for(const k of [-1,1]){part(r,sphere,cream,[.07,.23,k*.025],[.022,.075,.018]);part(r,sphere,dark,[.13,.16,k*.035],[.008,.009,.006]);}
    part(r,sphere,cream,[-.12,.11,0],[.038,.035,.035]);world.add(r);rabbits.push(r);
  }
  const birds=[];
  for(let i=0;i<5;i++){
    const bird=new THREE.Group();const wings=[];
    for(const side of [-1,1]){
      const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0,side*.14,.035,-.025,side*.05,0,.04],3));g.computeVertexNormals();
      const w=new THREE.Mesh(g,new THREE.MeshStandardMaterial({color:'#364b49',side:THREE.DoubleSide}));bird.add(w);wings.push(w);
    }
    world.add(bird);birds.push({root:bird,wings,phase:i*1.17});
  }
  const fireflyPositions=new Float32Array(80*3),fireflyBase=[];
  for(let i=0;i<80;i++){const x=(random()-.5)*7.5,z=(random()-.5)*7.5;fireflyBase.push([x,Math.max(WATER+.15,heightAt(x,z))+.15+random()*.7,z,random()*6.28]);}
  const fireflyGeometry=new THREE.BufferGeometry();fireflyGeometry.setAttribute('position',new THREE.BufferAttribute(fireflyPositions,3));
  const fireflyMaterial=new THREE.PointsMaterial({map:glowMap,color:'#caff9b',size:.11,transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthWrite:false});
  world.add(new THREE.Points(fireflyGeometry,fireflyMaterial));
  // Sparse out-of-focus stars surrounding the floating landscape.
  const starPos=[],starColors=[];
  for(let i=0;i<260;i++){
    const x=(random()-.5)*60,y=(random()-.5)*45,z=-12-random()*25;starPos.push(x,y,z);
    const c=new THREE.Color().setHSL(.51+random()*.14,.2,.35+random()*.4);c.toArray(starColors,starColors.length);
  }
  const starGeo=new THREE.BufferGeometry();starGeo.setAttribute('position',new THREE.Float32BufferAttribute(starPos,3));starGeo.setAttribute('color',new THREE.Float32BufferAttribute(starColors,3));
  const starMaterial=new THREE.PointsMaterial({size:.045,map:glowMap,transparent:true,opacity:.45,vertexColors:true,depthWrite:false,blending:THREE.AdditiveBlending});scene.add(new THREE.Points(starGeo,starMaterial));
  const halo=new THREE.Sprite(new THREE.SpriteMaterial({map:glowMap,color:'#2f7c8a',transparent:true,opacity:.12,blending:THREE.AdditiveBlending,depthWrite:false}));halo.position.set(0,-4.8,-1);halo.scale.set(16,4,1);scene.add(halo);

  // Canvas antialiasing does not apply to offscreen postprocessing targets.
  // Resolve geometry once with MSAA, keeping fullscreen passes single-sampled.
  const sceneTarget=new THREE.WebGLRenderTarget(1,1,{type:THREE.HalfFloatType,samples:Math.min(4,renderer.capabilities.maxSamples)});
  sceneTarget.depthTexture=new THREE.DepthTexture(1,1,THREE.UnsignedIntType);
  const composer=new EffectComposer(renderer,new THREE.WebGLRenderTarget(1,1,{type:THREE.HalfFloatType,depthBuffer:false}));
  const sceneCopy=new ShaderPass({uniforms:{sceneColor:{value:null}},vertexShader:vertex,
    fragmentShader:'varying vec2 vUv;uniform sampler2D sceneColor;void main(){gl_FragColor=texture2D(sceneColor,vUv);}'});
  sceneCopy.uniforms.sceneColor.value=sceneTarget.texture;composer.addPass(sceneCopy);
  const occlusion=createOcclusion(sceneTarget,camera);composer.addPass(occlusion);
  const bloom=new UnrealBloomPass(new THREE.Vector2(800,600),.12,.5,1.8);composer.addPass(bloom);
  // A subtle photographic focus band. Keep the living middle plane sharp.
  const lens=new ShaderPass({uniforms:{tDiffuse:{value:null},resolution:{value:new THREE.Vector2(800,600)}},vertexShader:vertex,
    fragmentShader:`uniform sampler2D tDiffuse;uniform vec2 resolution;varying vec2 vUv;
      void main(){float blur=smoothstep(.21,.48,abs(vUv.y-.51));vec2 d=vec2(1.)/resolution*blur*1.5;
      vec4 c=texture2D(tDiffuse,vUv)*.4;c+=texture2D(tDiffuse,vUv+vec2(d.x,d.y))*.15;c+=texture2D(tDiffuse,vUv-vec2(d.x,d.y))*.15;c+=texture2D(tDiffuse,vUv+vec2(d.x,-d.y))*.15;c+=texture2D(tDiffuse,vUv+vec2(-d.x,d.y))*.15;
      float vig=1.-.16*smoothstep(.3,.85,length((vUv-.5)*vec2(1.,.8)));gl_FragColor=vec4(c.rgb*vig,c.a);}`});
  composer.addPass(lens);composer.addPass(new OutputPass());composer.addPass(new FXAAPass());
  let width=0,height=0,frame=0,last=performance.now(),lastUi=-1,lastShadow=-1,lastReflection=-1,disposed=false,draws=0,viewTransition=null;
  function resize(){
    width=Math.max(1,host.clientWidth);height=Math.max(1,host.clientHeight);const aspect=width/height;
    const span=Math.max(16.5,15.8/aspect);camera.left=-span*aspect/2;camera.right=span*aspect/2;camera.top=span/2;camera.bottom=-span/2;camera.updateProjectionMatrix();
    const desiredRatio=Math.min(Math.max(devicePixelRatio,1.25),2);
    const pixelRatio=Math.max(1,Math.min(desiredRatio,Math.sqrt(4000000/(width*height))));
    renderer.setPixelRatio(pixelRatio);renderer.setSize(width,height,false);
    composer.setPixelRatio(pixelRatio);composer.setSize(width,height);
    const physicalWidth=Math.floor(width*pixelRatio),physicalHeight=Math.floor(height*pixelRatio);
    sceneTarget.setSize(physicalWidth,physicalHeight);lens.uniforms.resolution.value.set(physicalWidth,physicalHeight);
    const reflectionScale=Math.min(1,1024/physicalWidth);
    reflectionTarget.setSize(Math.max(1,Math.round(physicalWidth*reflectionScale)),Math.max(1,Math.round(physicalHeight*reflectionScale)));
  }
  const observer=new ResizeObserver(resize);observer.observe(host);resize();
  const sunDay=new THREE.Color('#fff0d4'),sunDawn=new THREE.Color('#ffc0a0'),sunNight=new THREE.Color('#759bd5');
  const hemiDay=new THREE.Color('#cfe7e3'),hemiNight=new THREE.Color('#7393bf');
  const waterDay=new THREE.Color('#298c83'),waterNight=new THREE.Color('#195369');
  const cloudDay=new THREE.Color('#e1eeea'),cloudNight=new THREE.Color('#819db7');
  function updateLighting(){
    const altitude=Math.sin((state.hour-6)/24*Math.PI*2),day=THREE.MathUtils.smoothstep(altitude,-.23,.38);
    const dusk=Math.pow(1-Math.abs(altitude),4)*day;
    daylight.value=day;ambient.intensity=mix(.3,.55,day);ambient.color.copy(hemiNight).lerp(hemiDay,day);
    sun.intensity=mix(.4,3.4,day);sun.color.copy(sunNight).lerp(sunDay,day).lerp(sunDawn,dusk*.7);
    sun.position.set(mix(-7,6,(state.hour%24)/24),4+Math.max(0,altitude)*5,5);
    rim.intensity=mix(1.1,1.9,day);fill.intensity=mix(.15,.28,day);
    scene.environmentIntensity=mix(.15,.3,day);renderer.toneMappingExposure=mix(.9,1.04,day);
    waterMaterial.color.copy(waterNight).lerp(waterDay,day);waterMaterial.emissiveIntensity=mix(.12,.02,day);upperMaterial.color.copy(waterMaterial.color);
    cloudMaterial.color.copy(cloudNight).lerp(cloudDay,day);cloudMaterial.opacity=mix(.5,.8,day);
    fireflyMaterial.opacity=(1-day)*.95;starMaterial.opacity=mix(.85,.32,day);
    bloom.strength=mix(.27,.12,day);
    host.style.setProperty('--daylight',day.toFixed(3));
  }
  function updateLife(t){
    time.value=t;world.position.y=Math.sin(t*.22)*.045;
    understory.update(t);waterNormals.offset.set(t*.004,t*.007);
    for(const c of clouds){c.position.x=c.userData.x+Math.sin(t*.055+c.userData.phase)*.34;c.position.z=c.userData.z+Math.cos(t*.04+c.userData.phase)*.16;}
    for(const m of mists){m.position.x=m.userData.x+Math.sin(t*.08+m.userData.phase)*.3;m.material.opacity=.04+Math.sin(t*.17+m.userData.phase)*.018;}
    ripples.forEach((r,i)=>{const p=(t*.38+i/5)%1;r.scale.setScalar(.2+p*2.5);r.material.opacity=(1-p)*.26;});
    dropSeeds.forEach(([a,b,c],i)=>{const p=(t*.8+a)%1;dropPositions[i*3]=riverX(FALL_Z)+(b-.5)*.65;dropPositions[i*3+1]=mix(UPPER_WATER,WATER,p);dropPositions[i*3+2]=FALL_Z+.025+Math.sin(p*Math.PI)*c*.12;});dropGeo.attributes.position.needsUpdate=true;
    for(const a of animals){const walk=Math.sin(t*.17+a.phase)*.14;a.root.position.x=a.x+walk;a.root.position.y=heightAt(a.root.position.x,a.z);a.head.rotation.z=-.15+Math.sin(t*.65+a.phase)*.22;a.legs.forEach((leg,i)=>leg.rotation.z=Math.sin(t*1.2+i*Math.PI+a.phase)*.075);}
    for(const [i,r] of rabbits.entries())r.rotation.z=Math.sin(t*.8+i)*.025;
    for(const b of birds){const a=t*.09+b.phase;b.root.position.set(Math.cos(a)*2.8,2.4+Math.sin(a*1.5)*.45,Math.sin(a)*2.4);b.root.rotation.y=-a;b.wings.forEach((w,i)=>w.rotation.z=Math.sin(t*4+b.phase)*(i===0?-1:1)*.4);}
    fireflyBase.forEach(([x,y,z,p],i)=>{fireflyPositions[i*3]=x+Math.sin(t*.32+p)*.17;fireflyPositions[i*3+1]=y+Math.sin(t*.6+p)*.1;fireflyPositions[i*3+2]=z+Math.cos(t*.25+p)*.17;});fireflyGeometry.attributes.position.needsUpdate=true;
  }
  const mirrorTarget=new THREE.Vector3(),clearColor=new THREE.Color();
  function updateReflection(){
    const level=WATER+world.position.y;reflectionCamera.copy(camera);reflectionCamera.position.y=2*level-camera.position.y;
    mirrorTarget.copy(controls.target);mirrorTarget.y=2*level-mirrorTarget.y;reflectionCamera.up.set(0,-1,0);reflectionCamera.lookAt(mirrorTarget);reflectionCamera.updateMatrixWorld();
    reflectionMatrix.set(.5,0,0,.5,0,.5,0,.5,0,0,.5,.5,0,0,0,1).multiply(reflectionCamera.projectionMatrix).multiply(reflectionCamera.matrixWorldInverse);
    const previousTarget=renderer.getRenderTarget(),previousClipping=renderer.clippingPlanes,previousAlpha=renderer.getClearAlpha();renderer.getClearColor(clearColor);
    reflectionPlane.constant=-level;water.visible=false;renderer.clippingPlanes=[reflectionPlane];renderer.setClearColor('#172c37',1);renderer.setRenderTarget(reflectionTarget);renderer.clear();renderer.render(scene,reflectionCamera);
    renderer.setRenderTarget(previousTarget);renderer.setClearColor(clearColor,previousAlpha);renderer.clippingPlanes=previousClipping;water.visible=true;
  }
  function renderScene(dt){
    const target=renderer.getRenderTarget();
    renderer.setRenderTarget(sceneTarget);renderer.clear();renderer.render(scene,camera);
    renderer.setRenderTarget(target);composer.render(dt);
  }
  function render(now){
    if(disposed)return;
    frame=requestAnimationFrame(render);
    const dt=clamp((now-last)/1000,0,.05);last=now;
    if(document.hidden)return;
    if(!state.paused){state.elapsed+=dt;state.hour=(state.hour+dt*.1)%24;}
    if(viewTransition){viewTransition.progress=Math.min(1,viewTransition.progress+dt/1.25);const p=viewTransition.progress,k=p*p*(3-2*p);camera.position.lerpVectors(viewTransition.fromPosition,viewTransition.position,k);controls.target.lerpVectors(viewTransition.fromTarget,viewTransition.target,k);camera.zoom=mix(viewTransition.fromZoom,viewTransition.zoom,k);camera.updateProjectionMatrix();if(p===1)viewTransition=null;}
    controls.autoRotate=state.orbit&&!state.paused;controls.update(dt);
    updateLife(state.elapsed);updateLighting();
    if(now-lastShadow>700){renderer.shadowMap.needsUpdate=true;lastShadow=now;}
    if(now-lastUi>200){onTime(state.hour);lastUi=now;}
    try{if(now-lastReflection>100){updateReflection();lastReflection=now;}renderScene(dt);draws++;}catch(error){cancelAnimationFrame(frame);onFailure(error);}
  }
  function reset(){viewTransition=null;controls.reset();camera.position.copy(initialPosition);controls.target.set(0,-.2,0);camera.zoom=1;camera.updateProjectionMatrix();controls.update();}
  controls.addEventListener('start',()=>{viewTransition=null;});
  function focus(id){
    if(id==='all'){reset();return;}
    const views={alpine:{target:new THREE.Vector3(-1.3,1.5,-2),offset:new THREE.Vector3(9,6.5,12),zoom:1.75},forest:{target:new THREE.Vector3(-1.9,-.65,1.55),offset:new THREE.Vector3(7,6.5,10),zoom:2.35},water:{target:new THREE.Vector3(.4,-.8,1.6),offset:new THREE.Vector3(7,9,12),zoom:2.2}};
    const view=views[id];if(!view)return;
    viewTransition={fromPosition:camera.position.clone(),fromTarget:controls.target.clone(),fromZoom:camera.zoom,position:view.target.clone().add(view.offset),target:view.target,zoom:view.zoom,progress:0};
  }
  function keyboard(event){
    if(event.key==='Home'){event.preventDefault();reset();return;}
    if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','-','='].includes(event.key))return;
    event.preventDefault();
    if(['+','-','='].includes(event.key)){camera.zoom=clamp(camera.zoom*(event.key==='-'?.9:1.1),.7,3);camera.updateProjectionMatrix();return;}
    const offset=camera.position.clone().sub(controls.target),spherical=new THREE.Spherical().setFromVector3(offset);
    spherical.theta+=(event.key==='ArrowLeft'?.09:event.key==='ArrowRight'?-.09:0);
    spherical.phi=clamp(spherical.phi+(event.key==='ArrowUp'?-.07:event.key==='ArrowDown'?.07:0),controls.minPolarAngle,controls.maxPolarAngle);
    camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(spherical));controls.update();
  }
  function contextLost(event){event.preventDefault();cancelAnimationFrame(frame);onFailure(new Error('显卡上下文暂时中断，请重新开启世界。'));}
  canvas.addEventListener('keydown',keyboard);canvas.addEventListener('webglcontextlost',contextLost);
  updateLighting();updateLife(0);renderer.shadowMap.needsUpdate=true;updateReflection();renderScene(0);
  frame=requestAnimationFrame(render);
  return {
    state,reset,focus,
    setHour(value){state.hour=((value%24)+24)%24;updateLighting();renderer.shadowMap.needsUpdate=true;onTime(state.hour);},
    setAtmosphere(value){state.atmosphere=value;atmosphere.visible=value;},
    getStats(){return {frames:draws,drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,pixelRatio:renderer.getPixelRatio(),msaaSamples:sceneTarget.samples,sceneResolution:[sceneTarget.width,sceneTarget.height],hour:state.hour,elapsed:state.elapsed,camera:camera.position.toArray(),zoom:camera.zoom};},
    dispose(){disposed=true;cancelAnimationFrame(frame);observer.disconnect();controls.dispose();canvas.removeEventListener('keydown',keyboard);canvas.removeEventListener('webglcontextlost',contextLost);const geometries=new Set(),mats=new Set();scene.traverse(obj=>{if(obj.geometry)geometries.add(obj.geometry);for(const m of (Array.isArray(obj.material)?obj.material:[obj.material]))if(m)mats.add(m);obj.dispose?.();});geometries.forEach(g=>g.dispose());mats.forEach(m=>m.dispose());surfaces.dispose();glowMap.dispose();cloudMap.dispose();waterNormals.dispose();reflectionTarget.dispose();sceneTarget.dispose();environment.dispose();composer.passes.forEach(p=>p.dispose?.());composer.dispose();renderer.dispose();},
  };
}
