import * as THREE from './vendor/three/build/three.module.min.js';
import { OrbitControls } from './vendor/three/examples/jsm/controls/OrbitControls.js';
import { RoundedBoxGeometry } from './vendor/three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { finishMaterials, createFinish } from './finish.js';
import { enrichSite } from './model-detail.js';

// Every visible object, surface and particle is created here. No model or texture requests.
export function createWorld(canvas, onUpdate) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, innerWidth<600?1.5:2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.18;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#eeece5');
  scene.fog = new THREE.Fog('#eeece5', 85, 180);
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 230);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.minDistance = 13;
  controls.maxDistance = 100;
  controls.minPolarAngle = 0.2;
  controls.maxPolarAngle = Math.PI / 2 - 0.055;
  controls.maxTargetRadius = 18;
  controls.enablePan = false;
  controls.autoRotateSpeed = 0.45;
  const state = { hour: 10, day: 1, paused: false, speed: 1, weather: 'sunny', orbit: false, focus: null, elapsed: 0 };
  let previousTime = performance.now();
  const staticRoot = new THREE.Group(); scene.add(staticRoot);
  const batches = new Map();
  const geometries = new Set();
  const cylinderGeometries = new Map();
  const textures = new Set();
  const mats = new Map();
  let seed = 4721;
  function random() { seed = (Math.imul(1664525, seed) + 1013904223) >>> 0; return seed / 4294967296; }
  function material(color, opts = {}) {
    const key = color + JSON.stringify(opts);
    if (!mats.has(key)) mats.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.86, ...opts }));
    return mats.get(key);
  }
  const M = {
    sand: material('#c0a16b'), edge: material('#8f7656'), darkSoil: material('#806348'), soil: material('#a88050'), soil2: material('#bc935f'),
    yellow: material('#e6ad30'), gold: material('#bc811b'), pale: material('#ede8d8'), dark: material('#303a36'), tire: material('#262b28'),
    glass: material('#4c6b71', { metalness: 0.3, roughness: 0.2 }), steel: material('#647676', { metalness: 0.35 }), rust: material('#855841'),
    concrete: material('#c8c5b6'), concreteLight: material('#dfdcce'), red: material('#b75d3f'), orange: material('#df8141'), navy: material('#526970'),
    green: material('#69765a'), leaf: material('#889169'), black: material('#171d1c'), white: material('#eeeade'),
    light: material('#fff2b4', { emissive: '#ffd480', emissiveIntensity: 1.2 }), beacon: material('#ee9d26', { emissive: '#ff9300', emissiveIntensity: 1.2 }),
  };
  const surfaces=finishMaterials({renderer,scene,M,textures,random});
  const cube = new THREE.BoxGeometry(1, 1, 1); geometries.add(cube);
  const panelGeometry=new RoundedBoxGeometry(1,1,1,2,.045);geometries.add(panelGeometry);
  const panelMats=new Set([M.yellow,M.gold,M.red,M.navy,M.white]);
  const temp = new THREE.Object3D();
  function group(parent = scene, x = 0, y = 0, z = 0) { const g = new THREE.Group(); g.position.set(x,y,z); parent.add(g); return g; }
  function box(parent, mat, x,y,z, sx,sy,sz, rz=0) {
    if (parent === staticRoot) {
      if (!batches.has(mat)) batches.set(mat, []);
      temp.position.set(x,y,z); temp.scale.set(sx,sy,sz); temp.rotation.set(0,0,rz); temp.updateMatrix();
      batches.get(mat).push(temp.matrix.clone()); return null;
    }
    const geometry=panelMats.has(mat)&&Math.min(sx,sy,sz)>.15?panelGeometry:cube;
    const m = new THREE.Mesh(geometry, mat); m.position.set(x,y,z); m.scale.set(sx,sy,sz); m.rotation.z=rz;
    m.castShadow=true; m.receiveShadow=true; parent.add(m); return m;
  }
  function beam(parent, mat, a, b, width=.1, depth=width) {
    const start=new THREE.Vector3(...a), end=new THREE.Vector3(...b), delta=end.clone().sub(start);
    temp.position.copy(start).add(end).multiplyScalar(.5);temp.scale.set(width,delta.length(),depth);
    temp.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize());temp.updateMatrix();
    if(parent===staticRoot){if(!batches.has(mat))batches.set(mat,[]);batches.get(mat).push(temp.matrix.clone());return;}
    const m=new THREE.Mesh(cube,mat);m.matrix.copy(temp.matrix);m.matrix.decompose(m.position,m.quaternion,m.scale);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;
  }
  function cylinder(parent,mat,x,y,z,r1,r2,h,segments=8){
    const key=[r1,r2,h,segments].join('/');
    if(!cylinderGeometries.has(key)){const geo=new THREE.CylinderGeometry(r1,r2,h,segments);geometries.add(geo);cylinderGeometries.set(key,geo);}
    const geo=cylinderGeometries.get(key);
    const mesh=new THREE.Mesh(geo,mat);mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;
  }
  function textTexture(text, color='#efdb9c', bg='#3c4338', width=512, height=128){
    const c=document.createElement('canvas');c.width=width;c.height=height;const ctx=c.getContext('2d');
    ctx.fillStyle=bg;ctx.fillRect(0,0,width,height);ctx.fillStyle=color;ctx.textAlign='center';ctx.textBaseline='middle';ctx.font=`600 ${height*.42}px monospace`;ctx.fillText(text,width/2,height/2);
    const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;textures.add(tex);return tex;
  }
  function plaque(parent,text,x,y,z,w,h,color,bg){
    const map=textTexture(text,color,bg);const mat=material('#ffffff',{map});
    const mesh=box(parent,mat,x,y,z,w,h,.035);return mesh;
  }
  // A solid walnut tabletop: all fine grain comes from a seeded canvas drawing.
  const woodCanvas=document.createElement('canvas');woodCanvas.width=2048;woodCanvas.height=1024;
  const woodCtx=woodCanvas.getContext('2d');woodCtx.fillStyle='#35271e';woodCtx.fillRect(0,0,2048,1024);
  for(let i=0;i<4400;i++){
    const y=random()*1024;const shade=45+random()*40;
    woodCtx.strokeStyle=`rgba(${shade+25},${shade+7},${shade-6},${.08+random()*.2})`;woodCtx.lineWidth=.5+random()*2;
    woodCtx.beginPath();woodCtx.moveTo(0,y);
    for(let x=0;x<=2048;x+=24)woodCtx.lineTo(x,y+Math.sin(x*.003+i)*3+Math.sin(x*.019+i)*.5);
    woodCtx.stroke();
  }
  for(let i=1;i<7;i++){woodCtx.fillStyle='#150f0b66';woodCtx.fillRect(0,i*150,2048,2);}
  const woodTex=new THREE.CanvasTexture(woodCanvas);woodTex.colorSpace=THREE.SRGBColorSpace;woodTex.anisotropy=renderer.capabilities.getMaxAnisotropy();textures.add(woodTex);
  const wood=new THREE.MeshPhysicalMaterial({color:'#77604d',map:woodTex,bumpMap:woodTex,bumpScale:.035,roughness:.48,clearcoat:.16,clearcoatRoughness:.45,envMapIntensity:.2});mats.set('walnut',wood);
  const tableGeometry=new RoundedBoxGeometry(88,2,63,2,.28);geometries.add(tableGeometry);
  const table=new THREE.Mesh(tableGeometry,wood);table.position.y=-1.2;table.receiveShadow=true;scene.add(table);
  box(staticRoot,material('#3b3025'),0,-.05,0,36.7,.4,27.7);
  box(staticRoot,M.edge,0,.22,0,36.3,.4,27.3);
  box(staticRoot,M.sand,0,.51,0,36,.2,27);
  // Discrete soil columns cut a stepped excavation into the terrain.
  const soilShades=['#b59a70','#b99e73','#bda175','#baa075','#b69b70'].map(color=>material(color,{map:surfaces.soil,bumpMap:surfaces.soil,bumpScale:.055}));
  for(let x=-17.75;x<18;x+=.5)for(let z=-13.25;z<13.5;z+=.5){
    const d=Math.max(Math.abs((x+8)/5.3),Math.abs((z+1)/5.3));
    const h=d<.55?.02:d<.76?.28:d<1?.55:1;
    const soil=soilShades[Math.floor(random()*soilShades.length)];
    box(staticRoot,soil,x,.63+h*.31,z,.5,h*.62,.5);
  }
  const groundY=1.25;
  // Inset timber rim, cut edges and brass fasteners emphasize the scale model.
  for(const z of [-13.8,13.8])box(staticRoot,M.dark,0,.75,z,36.9,.55,.25);
  for(const x of [-18.35,18.35])box(staticRoot,M.dark,x,.75,0,.25,.55,27.7);
  for(let x=-17;x<18;x+=2.7){box(staticRoot,M.gold,x,1.04,13.8,.065,.025,.065);box(staticRoot,M.gold,x,1.04,-13.8,.065,.025,.065);}
  plaque(scene,'GROUNDWORKS  /  001',0,.63,13.96,7,.42,'#e5d4a1','#3b4237');
  // Tire tracks follow the vehicle route around the worksite.
  for(let z=-10;z<11;z+=.43)for(const x of [11.85,13.35])box(staticRoot,M.edge,x,1.264,z,.34,.015,.18);
  for(let x=-9;x<13;x+=.43)for(const z of [7.55,9.05])box(staticRoot,M.edge,x,1.264,z,.18,.015,.32);
  // Concrete frame: three floors, open bays, roof rebar and timber formwork.
  const building=group(scene,4,groundY,-4);
  const staticBuilding=(x,y,z,sx,sy,sz,mat=M.concrete)=>box(staticRoot,mat,x+4,y+groundY,z-4,sx,sy,sz);
  staticBuilding(0,.17,0,11.4,.34,8.2);
  for(let level=0;level<3;level++){
    const h=.45+level*2.75;
    for(const x of [-4.6,0,4.6])for(const z of [-3.2,0,3.2])staticBuilding(x,h+1.25,z,.4,2.5,.4);
    if(level<2)staticBuilding(0,h+2.55,0,10.4,.24,7.4,M.concreteLight);
    else {staticBuilding(-2.4,h+2.55,0,5.5,.24,7.4,M.concreteLight);staticBuilding(2.7,h+2.47,-2.85,4.5,.12,1.1,M.rust);}
    for(const z of [-3.3,3.3])staticBuilding(0,h+2.3,z,10.6,.4,.35);
    for(const x of [-4.7,4.7])staticBuilding(x,h+2.3,0,.35,.4,7);
    // Partial brick infill leaves large window openings.
    if(level<2)for(let i=0;i<9;i++)for(let j=0;j<3;j++)staticBuilding(-4.15+i*.5,.55+level*2.75+j*.22,-3.15,.47,.19,.24,j%2?M.red:M.rust);
  }
  for(const x of [-.6,4,8.6])for(const z of [-7.2,-4,-.8])for(const dx of [-.12,.12])box(staticRoot,M.rust,x+dx,10.1,z,.045,1,.045);
  // Scaffolding along the front and right face, with diagonal braces and walkboards.
  for(let x=-1.5;x<10;x+=2.25){
    for(const z of [.3,1.25])box(staticRoot,M.steel,x,5,z,.07,7.7,.07);
    for(let y=2.1;y<9;y+=2.4){
      box(staticRoot,M.rust,x+.9,y,.7,2.1,.1,1.25);
      box(staticRoot,M.steel,x+.9,y+1.1,1.2,2.1,.06,.06);
      beam(staticRoot,M.steel,[x,y,1.2],[x+2.1,y+2.4,1.2],.045);
    }
  }
  // Rear site fence. Alternating rust and cream barrier panels, open front gate.
  for(let x=-17;x<18;x+=3){
    box(staticRoot,M.steel,x,2.3,-12.4,.09,2.2,.09);
    box(staticRoot,M.navy,x+1.35,2.1,-12.4,2.6,1.4,.08);
    for(let k=0;k<8;k++)box(staticRoot,M.steel,x+.2+k*.32,2.1,-12.32,.035,1.37,.035);
  }
  for(let z=-10;z<11;z+=3){box(staticRoot,M.steel,-17.2,2.1,z,.08,1.8,.08);box(staticRoot,M.navy,-17.2,2,z+1.3,.08,1.3,2.6);}
  function barrier(x,z,rot=0){
    const g=group(scene,x,groundY,z);g.rotation.y=rot;
    box(g,M.concrete,0,.2,0,2,.4,.6);box(g,M.white,0,.66,0,1.9,.6,.18);
    for(let i=0;i<4;i++)box(g,M.orange,-.7+i*.45,.66,.105,.22,.57,.025,-.3);
    return g;
  }
  for(const x of [-14.4,-11.8,-9.2,8.5,11.2,14])barrier(x,11.8);
  function cone(x,z){box(staticRoot,M.dark,x,1.32,z,.42,.12,.42);box(staticRoot,M.orange,x,1.52,z,.27,.3,.27);box(staticRoot,M.white,x,1.73,z,.19,.14,.19);box(staticRoot,M.orange,x,1.87,z,.12,.18,.12);}
  for(let i=0;i<7;i++)cone(-3+i*1.7,4.3);
  for(let i=0;i<5;i++)cone(-14.7,1+i*1.2);
  // A corrugated site cabin, with a door, windows, AC unit and yellow notice board.
  const cabin=group(scene,-11.5,groundY,-9.4);
  box(cabin,M.navy,0,1.15,0,7,2.3,3.3);box(cabin,M.pale,0,2.4,0,7.3,.18,3.5);
  for(let i=0;i<28;i++)box(cabin,M.steel,-3.35+i*.25,1.16,1.68,.035,2.25,.035);
  box(cabin,M.pale,-2.2,1,1.72,1.05,1.95,.07);box(cabin,M.glass,-2.2,1.4,1.77,.7,.85,.04);
  for(const x of [-.45,1.75]){
    for(const y of[1,2])box(cabin,M.pale,x,y,1.75,1.6,.065,.07);
    for(const dx of[-.77,.77])box(cabin,M.pale,x+dx,1.5,1.75,.065,1.05,.07);
    box(cabin,M.glass,x,1.5,1.79,1.4,.85,.04);box(cabin,M.pale,x,1.5,1.82,.05,.86,.035);
  }
  plaque(cabin,'SITE OFFICE',.6,2.07,1.78,2.6,.26,'#344846','#e1daca');
  box(cabin,M.concrete,-2.2,.12,2.1,1.4,.24,.7);
  box(cabin,M.pale,3.57,1.2,-.4,.3,.65,.9);
  // Pallets, brick stacks, steel pipes and material storage.
  function pallet(parent,x,y,z){
    for(let j=0;j<3;j++)box(parent,M.rust,x-.7+j*.7,y+.08,z,.2,.16,1.4);
    for(let j=0;j<5;j++)box(parent,M.edge,x,y+.2,z-.6+j*.3,1.8,.12,.22);
  }
  for(let i=0;i<3;i++){
    pallet(staticRoot,6+i*2.3,groundY,-10.1);
    for(let y=0;y<3;y++)for(let x=0;x<4;x++)for(let z=0;z<2;z++)box(staticRoot,y%2?M.red:M.rust,5.35+i*2.3+x*.43,1.62+y*.24,-10.4+z*.55,.4,.21,.5);
  }
  for(let i=0;i<5;i++)for(let j=0;j<2;j++)box(staticRoot,M.steel,15+i*.25,1.4+j*.22,-7, .19,.19,4);
  for(let i=0;i<4;i++)box(staticRoot,M.pale,-1.5,1.5+i*.22,-10.4,4,.2,1.2);
  // Blocky spoil heaps, small rocks, and low grass at the boundary.
  const spoil=group(scene,-10,groundY,8.2);
  for(let i=0;i<150;i++){
    const a=random()*Math.PI*2,r=Math.sqrt(random())*2.1,x=Math.cos(a)*r,z=Math.sin(a)*r;
    box(spoil,[M.soil,M.soil2,M.darkSoil][i%3],Math.round(x/.35)*.35,.16+Math.max(0,1-r/2.2)*1.1,Math.round(z/.35)*.35,.38,.35,.38);
  }
  for(let i=0;i<200;i++){
    const x=random()*33-16.5,z=random()*24-12;
    if(x>-2&&x<10&&z<1)continue;
    if(Math.abs(x+8)<5.5&&Math.abs(z+1)<5.5)continue;
    const s=.07+random()*.12;box(staticRoot,i%3?M.soil:M.pale,x,1.29,z,s,.06,s);
  }
  for(let i=0;i<60;i++){const x=-16+random()*32,z=12.8+random()*.3;box(staticRoot,i%2?M.green:M.leaf,x,1.4+random()*.08,z,.1,.25+random()*.1,.1);}
  // Scale cues on the desk: blueprint, carpenter pencils, ruler and an enamel cup.
  const plan=document.createElement('canvas');plan.width=768;plan.height=512;const pctx=plan.getContext('2d');
  pctx.fillStyle='#d0d2c6';pctx.fillRect(0,0,768,512);pctx.strokeStyle='#667d83';pctx.lineWidth=2;
  for(let i=0;i<7;i++)pctx.strokeRect(100+i*78,80,60,290);
  for(let i=0;i<4;i++){pctx.beginPath();pctx.moveTo(60,90+i*95);pctx.lineTo(690,90+i*95);pctx.stroke();}
  pctx.font='20px monospace';pctx.fillStyle='#677e83';pctx.fillText('GROUNDWORKS / STRUCTURAL PLAN',70,440);pctx.font='12px monospace';pctx.fillText('SECTION A-A     |     SCALE 1:48     |     NO.001',70,468);
  const planTex=new THREE.CanvasTexture(plan);planTex.colorSpace=THREE.SRGBColorSpace;textures.add(planTex);
  const paper=box(scene,material('#ffffff',{map:planTex,roughness:1}),23,-.12,3,8,.035,7);paper.rotation.y=-.16;
  for(let i=0;i<2;i++){
    const pencil=group(scene,23+i*.6,0,8.5);pencil.rotation.y=.5;
    box(pencil,i?M.gold:M.dark,0,.05,0,.16,.16,5);const tip=cylinder(pencil,M.edge,0,.05,2.75,0,.1,.5,4);tip.rotation.x=Math.PI/2;
  }
  const ruler=group(scene,-2,-.1,18);ruler.rotation.y=-.08;box(ruler,M.edge,0,.08,0,19,.1,1.15);
  for(let i=0;i<95;i++)box(ruler,M.dark,-9.3+i*.2,.14,-.4,.025,.008,i%5===0?.4:.2);
  const cup=group(scene,24,.01,-8);cylinder(cup,M.pale,0,1,0,1.1,.9,1.9,24);cylinder(cup,M.dark,0,1.97,0,.98,.98,.025,24);
  const handleGeo=new THREE.TorusGeometry(.7,.15,6,12);geometries.add(handleGeo);const handle=new THREE.Mesh(handleGeo,M.pale);handle.position.set(1.15,1,0);cup.add(handle);
  // Lights: daylight, fill, warm lamps, and a brief storm flash.
  const hemi=new THREE.HemisphereLight('#fff4db','#767e76',2.6);scene.add(hemi);
  const sun=new THREE.DirectionalLight('#ffedcf',4);sun.position.set(-22,32,20);sun.castShadow=true;scene.add(sun);
  const shadowSize=innerWidth<600?2048:4096;
  sun.shadow.mapSize.set(shadowSize,shadowSize);Object.assign(sun.shadow.camera,{left:-26,right:26,top:24,bottom:-24,near:1,far:110});sun.shadow.bias=-.00015;sun.shadow.normalBias=.025;sun.shadow.radius=2;
  const fill=new THREE.DirectionalLight('#a6bed4',.5);fill.position.set(20,14,-15);scene.add(fill);
  const flash=new THREE.DirectionalLight('#d4e6ff',0);flash.position.set(5,28,0);scene.add(flash);
  const lamps=[];
  for(const [x,z]of[[-15,10],[14,10],[12,-10],[-3,-11]]){
    box(staticRoot,M.dark,x,3.5,z,.12,4.6,.12);box(staticRoot,M.dark,x,5.8,z,.9,.12,.3);
    box(scene,M.light,x,5.7,z,.8,.08,.26);
    const light=new THREE.PointLight('#ffcf82',0,20,2);light.position.set(x,5.5,z);scene.add(light);lamps.push(light);
  }
  const buildingLamp=new THREE.PointLight('#ffbf66',0,15,2);buildingLamp.position.set(4,5,-4);scene.add(buildingLamp);lamps.push(buildingLamp);
  // Machinery helpers. The wheels and cabins stay deliberately cubical / low polygon.
  const movingWheels=[];
  function wheels(parent,xs,width=1.9,r=.47){
    const result=[];
    for(const x of xs)for(const z of[-width/2,width/2]){
      const wheel=group(parent,x,r,z);
      const tire=cylinder(wheel,M.tire,0,0,0,r,r,.37,16);tire.rotation.x=Math.PI/2;
      const hub=cylinder(wheel,M.steel,0,0,Math.sign(z)*.2,r*.53,r*.53,.05,12);hub.rotation.x=Math.PI/2;
      const cap=cylinder(wheel,M.dark,0,0,Math.sign(z)*.235,r*.2,r*.2,.04,8);cap.rotation.x=Math.PI/2;
      for(let j=0;j<20;j++){
        const a=j/20*Math.PI*2;
        for(const side of[-1,1]){const tread=box(wheel,M.dark,Math.cos(a)*r,Math.sin(a)*r,side*.1,.12,.055,.19,a-Math.PI/2);tread.rotation.y=side*.3;}
      }
      for(let j=0;j<6;j++){const a=j/6*Math.PI*2;box(wheel,M.pale,Math.cos(a)*r*.37,Math.sin(a)*r*.37,Math.sign(z)*.24,.045,.045,.04);}
      result.push(wheel);
    }
    movingWheels.push(...result);return result;
  }
  function truckCab(parent,color,x=1.4){
    box(parent,color,x,1.16,0,1.4,.88,1.65);box(parent,color,x-.1,2.22,0,1.48,.13,1.76);
    box(parent,M.glass,x+.68,1.87,0,.04,.58,1.38);
    for(const z of[-.85,.85]){box(parent,M.glass,x-.05,1.87,z,.83,.49,.04);box(parent,M.dark,x-.3,1.3,z,.26,.06,.04);box(parent,M.dark,x+.55,1.8,z*1.15,.18,.2,.13);}
    box(parent,M.pale,x+.75,.84,0,.16,.2,1.8);
    for(const z of[-.56,.56])box(parent,M.light,x+.75,1.16,z,.035,.19,.3);
    box(parent,M.dark,x+.76,1.35,0,.035,.28,.6);
    box(parent,M.beacon,x-.15,2.26,0,.2,.17,.2);
  }
  // 01 Excavator: linked boom, stick, bucket, hydraulic rams and rotating upper carriage.
  const excavator=group(scene,-7.2,.65,-.1);excavator.rotation.y=.4;
  for(const z of[-.88,.88]){
    box(excavator,M.tire,0,.32,z,3,.58,.56);
    for(let i=0;i<13;i++){box(excavator,M.dark,-1.4+i*.23,.63,z,.16,.06,.59);box(excavator,M.steel,-1.4+i*.23,.1,z,.16,.06,.59);}
    for(const x of[-1,-.5,0,.5,1]){const w=cylinder(excavator,M.steel,x,.35,z+Math.sign(z)*.3,.23,.23,.04,8);w.rotation.x=Math.PI/2;}
  }
  box(excavator,M.dark,0,.65,0,2,.3,1.8);
  const turret=group(excavator,0,.85,0);box(turret,M.yellow,-.4,.42,0,2.3,.65,1.85);box(turret,M.gold,-1.2,.56,0,.5,.8,1.9);
  box(turret,M.dark,-.45,.7,-.54,1.25,.14,.77);box(turret,M.glass,-.42,1.07,-.96,1.05,.75,.03);box(turret,M.glass,.2,1.07,-.52,.035,.75,.69);box(turret,M.yellow,-.45,1.55,-.54,1.45,.13,.95);
  box(turret,M.dark,-.9,.92,.5,.13,.6,.13);box(turret,M.beacon,-.8,1.7,-.5,.18,.17,.18);
  for(let i=0;i<6;i++)box(turret,M.dark,-1.12,.79,.1+i*.15,.34,.035,.06);
  const boom=group(turret,.65,.66,.25);box(boom,M.yellow,1.5,0,0,3.1,.4,.44);beam(boom,M.steel,[.15,.28,.26],[2.2,.25,.26],.11);
  const stick=group(boom,2.9,0,0);box(stick,M.yellow,1.14,0,0,2.3,.29,.34);beam(stick,M.dark,[.12,.23,.2],[1.7,.2,.2],.09);
  const bucket=group(stick,2.2,0,0);box(bucket,M.dark,.35,-.13,0,.82,.15,.9);box(bucket,M.dark,.7,.1,0,.13,.58,.9);
  for(const z of[-.43,.43])box(bucket,M.dark,.35,.07,z,.7,.4,.08);
  for(let i=0;i<4;i++)box(bucket,M.steel,-.11,-.18,-.35+i*.23,.27,.12,.12);
  const bucketSoil=box(bucket,M.soil2,.32,.09,0,.55,.23,.66);
  // 02 Dump truck and its separately hinged tipper.
  const truck=group(scene,-6,groundY,3.8);truck.rotation.y=Math.PI;
  box(truck,M.dark,0,.64,0,4.7,.3,1.7);truckCab(truck,M.red,1.65);wheels(truck,[-1.5,-.5,1.6]);
  const bed=group(truck,-2.15,.93,0);box(bed,M.gold,1.45,.08,0,3.1,.16,1.9);
  for(const z of[-.96,.96]){box(bed,M.yellow,1.45,.65,z,3.1,1.15,.12);for(let i=0;i<5;i++)box(bed,M.gold,.15+i*.62,.62,z*1.07,.1,1.1,.08);}
  box(bed,M.yellow,2.96,.65,0,.13,1.15,1.9);const tailgate=box(bed,M.gold,-.1,.65,0,.13,1.15,1.9);
  const truckSoil=group(bed,1.4,.75,0);for(let i=0;i<34;i++)box(truckSoil,i%2?M.soil:M.soil2,(random()-.5)*2.5,random()*.3,(random()-.5)*1.4,.4,.3,.4);
  // 03 Tower crane, with box-section lattice, catwalk, counterweight and travelling trolley.
  const crane=group(scene,1.2,groundY,-8.6);
  box(crane,M.concrete,0,.24,0,3,.48,3);
  for(const x of[-.56,.56])for(const z of[-.56,.56])box(crane,M.yellow,x,6.8,z,.12,13.4,.12);
  for(let y=.7;y<13.5;y+=1.15){
    for(const z of[-.56,.56]){box(crane,M.gold,0,y,z,1.22,.1,.1);beam(crane,M.yellow,[-.56,y,z],[.56,y+1.15,z],.065);}
    for(const x of[-.56,.56]){box(crane,M.gold,x,y,0,.1,.1,1.22);beam(crane,M.yellow,[x,y,-.56],[x,y+1.15,.56],.065);}
  }
  const jib=group(crane,0,13.4,0);box(jib,M.yellow,2.6,.2,0,15.7,.18,.8);
  for(const z of[-.45,.45]){
    box(jib,M.yellow,2.6,1.05,z,15.7,.1,.1);
    for(let x=-5;x<10;x+=1.2){beam(jib,M.gold,[x,.25,z],[x+.6,1.05,z],.065);beam(jib,M.gold,[x+.6,1.05,z],[x+1.2,.25,z],.065);}
  }
  box(jib,M.yellow,0,1.6,0,.16,3.2,.16);
  for(const z of[-.3,.3]){beam(jib,M.dark,[0,3.15,z],[8,.95,z],.035);beam(jib,M.dark,[0,3.15,z],[-4.8,.95,z],.035);}
  box(jib,M.pale,-4.3,-.32,0,1.8,.95,1.1);box(jib,M.navy,.9,-.58,.75,1.2,1.15,.8);box(jib,M.glass,1.53,-.55,.75,.04,.8,.7);
  const trolley=group(jib,6,.07,0);box(trolley,M.dark,0,0,0,.6,.2,1);
  const cable=box(trolley,M.dark,0,-3.5,0,.035,7,.035);const hook=group(trolley,0,-7,0);box(hook,M.gold,0,0,0,.3,.4,.3);
  const craneLoad=group(hook,0,-1,0);pallet(craneLoad,0,-.2,0);
  for(let i=0;i<4;i++)box(craneLoad,M.concreteLight,-.6+i*.4,.3,0,.33,.55,1.15);
  for(const x of[-.75,.75])beam(hook,M.dark,[0,0,0],[x,-.9,0],.025);
  plaque(jib,'GW / 01',3,.64,.51,2.7,.44,'#363c32','#e2b444');
  // 04 Concrete mixer: rotating low-poly drum with red helical bands.
  const mixer=group(scene,10.6,groundY,-3);mixer.rotation.y=Math.PI/2;
  box(mixer,M.dark,0,.68,0,5,.28,1.8);truckCab(mixer,M.white,1.8);wheels(mixer,[-1.6,-.6,1.8]);
  const drum=group(mixer,-.75,1.75,0);drum.rotation.z=-.12;
  const drumShape=cylinder(drum,M.pale,0,0,0,.72,.9,2.35,12);drumShape.rotation.z=Math.PI/2;
  const drumBack=cylinder(drum,M.pale,-1.36,0,0,.36,.72,.5,12);drumBack.rotation.z=Math.PI/2;
  for(let i=0;i<36;i++){
    const angle=i/36*Math.PI*4,x=-1.05+i/36*2.1;
    const stripe=box(drum,M.red,x,Math.cos(angle)*.85,Math.sin(angle)*.85,.23,.065,.31);stripe.rotation.x=angle;
  }
  const chute=box(mixer,M.steel,-2.65,.85,0,1.3,.12,.45,.28);
  const pour=box(mixer,M.concrete,-3.25,.45,0,.11,.8,.12);pour.visible=false;
  // 05 Loader with articulating arms and bucket.
  const loader=group(scene,-1.5,groundY,8.5);loader.rotation.y=.2;
  box(loader,M.yellow,-.15,.7,0,2.65,.65,1.5);wheels(loader,[-1,.85],1.7,.58);
  box(loader,M.dark,-.35,1.14,0,1.15,.2,1.3);box(loader,M.glass,-.35,1.6,.67,.85,.8,.035);box(loader,M.glass,-.35,1.6,-.67,.85,.8,.035);box(loader,M.glass,.24,1.62,0,.03,.74,1.1);box(loader,M.yellow,-.35,2.14,0,1.5,.14,1.55);
  box(loader,M.beacon,-.6,2.3,0,.2,.2,.2);box(loader,M.gold,-1.3,1.08,0,.55,.55,1.4);
  const loaderArm=group(loader,.65,.75,0);
  for(const z of[-.5,.5]){box(loaderArm,M.yellow,.8,0,z,1.8,.15,.14,-.15);beam(loaderArm,M.steel,[.1,.2,z],[1.4,.12,z],.085);}
  const scoop=group(loaderArm,1.75,-.1,0);box(scoop,M.dark,.3,-.2,0,1.15,.13,2);box(scoop,M.dark,-.2,.1,0,.15,.65,2);
  for(const z of[-.95,.95])box(scoop,M.dark,.3,0,z,1.1,.5,.1);
  const loaderSoil=box(scoop,M.soil,.25,-.02,0,.9,.25,1.7);
  const machines={excavator,truck,crane,mixer,loader};
  Object.entries(machines).forEach(([name,model])=>model.userData.machine=name);
  // Eight helmeted workers: signal, survey, transport, weld and assemble.
  const workers=[];
  function worker(x,z,role,level=groundY){
    const g=group(scene,x,level,z);box(g,M.navy,0,.48,0,.3,.4,.21);box(g,M.orange,0,.76,0,.43,.42,.28);box(g,M.pale,0,.76,.15,.06,.4,.02);
    box(g,M.pale,0,1.09,0,.24,.25,.24);box(g,M.yellow,0,1.25,0,.34,.15,.34);box(g,M.yellow,0,1.19,.05,.4,.05,.4);
    const arms=[],legs=[];
    for(const side of[-1,1]){const a=group(g,side*.28,.9,0);box(a,M.orange,0,-.15,0,.13,.34,.14);box(a,M.pale,0,-.33,0,.12,.13,.12);arms.push(a);const l=group(g,side*.1,.43,0);box(l,M.navy,0,-.17,0,.14,.34,.17);box(l,M.dark,0,-.36,.05,.17,.1,.27);legs.push(l);}
    if(role==='survey'){box(g,M.steel,.45,.75,0,.045,1.5,.045);box(g,M.red,.45,1.32,0,.06,.3,.06);}
    if(role==='carry')box(g,M.edge,0,.66,.45,1.15,.22,.3);
    if(role==='weld')box(g,M.dark,.33,.63,.2,.08,.08,.5);
    if(role==='signal')box(g,M.orange,-.42,1.2,0,.28,.2,.05);
    workers.push({g,arms,legs,role,x,z,level});return g;
  }
  worker(-11,4.6,'signal');worker(-13,-4,'survey');worker(-2.5,5.7,'carry');worker(9.1,7.4,'carry');worker(4,-.9,'weld',4.55);worker(6,-5,'build',7.3);worker(1,-4,'build');worker(-7,-6.8,'walk');
  const weldLight=new THREE.PointLight('#b8e7ff',0,4,1);weldLight.position.set(4.3,5.2,-.6);scene.add(weldLight);
  // Dust and falling clods are reusable instanced cubes, never downloaded sprites.
  const particleGeo=new THREE.BoxGeometry(.12,.12,.12);geometries.add(particleGeo);
  const dustMat=material('#b89b72',{transparent:true,opacity:.35,depthWrite:false});
  const dust=new THREE.InstancedMesh(particleGeo,dustMat,75);dust.instanceMatrix.setUsage(THREE.DynamicDrawUsage);dust.frustumCulled=false;scene.add(dust);
  const soilFall=new THREE.InstancedMesh(particleGeo,M.soil,28);soilFall.instanceMatrix.setUsage(THREE.DynamicDrawUsage);soilFall.frustumCulled=false;scene.add(soilFall);
  const particleSeeds=Array.from({length:75},()=>[random(),random(),random()]);
  // Local rain, ripple rings and wet ground patches.
  const rainCount=1800,rainArray=new Float32Array(rainCount*6),rainSeeds=Array.from({length:rainCount},()=>[random(),random(),random()]);
  const rainGeo=new THREE.BufferGeometry();rainGeo.setAttribute('position',new THREE.BufferAttribute(rainArray,3).setUsage(THREE.DynamicDrawUsage));geometries.add(rainGeo);
  const rainMat=new THREE.LineBasicMaterial({color:'#bdccd0',transparent:true,opacity:.4,depthWrite:false});
  const rain=new THREE.LineSegments(rainGeo,rainMat);rain.frustumCulled=false;scene.add(rain);
  const puddleMat=material('#798c91',{metalness:.7,roughness:.09,transparent:true,opacity:0,depthWrite:false});
  const puddles=[];
  for(const[x,z,sx,sz]of[[-7,-1,5,4],[3,8,3.2,1],[13,3,1.2,5],[-3,3,1.5,1.1],[7,-10,2,1]]){
    const shape=new THREE.Shape();
    for(let i=0;i<=24;i++){const a=i%24/24*Math.PI*2,r=.78+random()*.22,px=Math.cos(a)*r,pz=Math.sin(a)*r;if(i===0)shape.moveTo(px,pz);else shape.lineTo(px,pz);}shape.closePath();
    const geo=new THREE.ShapeGeometry(shape);geometries.add(geo);const puddle=new THREE.Mesh(geo,puddleMat);puddle.rotation.x=-Math.PI/2;puddle.position.set(x,x===-7?.67:1.28,z);puddle.scale.set(sx/2,sz/2,1);puddle.receiveShadow=true;scene.add(puddle);puddles.push(puddle);
  }
  const splashMat=material('#bcc9c5',{transparent:true,opacity:.38,depthWrite:false});
  const splashes=new THREE.InstancedMesh(particleGeo,splashMat,140);splashes.frustumCulled=false;scene.add(splashes);
  const rippleGeo=new THREE.RingGeometry(.2,.22,16);geometries.add(rippleGeo);const rippleMat=new THREE.MeshBasicMaterial({color:'#d0d8d1',transparent:true,opacity:.25,depthWrite:false});
  const ripples=new THREE.InstancedMesh(rippleGeo,rippleMat,70);ripples.frustumCulled=false;scene.add(ripples);
  const details=enrichSite({scene,staticRoot,M,box,beam,cylinder,group,material,plaque,random,geometries,textures,machines,turret,boom,stick,bucket,bed,jib,trolley,hook,drum,loaderArm,scoop,cabin,workers,groundY,renderer});
  // Finalize the fixed world into one instanced draw call per material.
  for(const [mat,matrices]of batches){const mesh=new THREE.InstancedMesh(cube,mat,matrices.length);matrices.forEach((m,i)=>mesh.setMatrixAt(i,m));mesh.castShadow=true;mesh.receiveShadow=true;staticRoot.add(mesh);}
  // Batch fixed parts inside each moving assembly; retain every articulated pivot.
  const articulated=new Set([bucketSoil,tailgate,cable,chute,pour,loaderSoil,...puddles,...details.articulated]);
  function batchAssembly(parent){
    [...parent.children].filter(child=>child.isGroup).forEach(batchAssembly);
    const byMaterial=new Map();
    for(const child of parent.children){
      if(!child.isMesh||child.isInstancedMesh||articulated.has(child))continue;
      const key=child.material.uuid+child.geometry.uuid;
      if(!byMaterial.has(key))byMaterial.set(key,[]);
      byMaterial.get(key).push(child);
    }
    for(const parts of byMaterial.values()){
      if(parts.length<3)continue;
      const combined=new THREE.InstancedMesh(parts[0].geometry,parts[0].material,parts.length);
      parts.forEach((part,i)=>{part.updateMatrix();combined.setMatrixAt(i,part.matrix);parent.remove(part);});
      combined.castShadow=true;combined.receiveShadow=true;parent.add(combined);
    }
  }
  batchAssembly(scene);
  const finish=createFinish(renderer,scene,camera);
  const focusOffset=new THREE.Vector3(), focusTarget=new THREE.Vector3(), orbitTarget=new THREE.Vector3();
  let frame=0,simulation=0,craneTime=0,wet=0,weatherMix=0,lastUpdate=-1,disposed=false,viewTransition=null;
  let fpsFrames=0,fpsTime=0,fps=0,phase=0,shadowAge=1,lastShadowHour=-1;
  const defaultTarget=new THREE.Vector3(0,3.8,0);
  function resize(){
    const w=canvas.clientWidth,h=canvas.clientHeight;if(!w||!h)return;
    camera.aspect=w/h;camera.fov=w<600?44:35;camera.updateProjectionMatrix();renderer.setSize(w,h,false);finish.resize();
    // Reserve the left side for the editorial panel without skewing the model.
    camera.clearViewOffset();
    if(w>900&&!document.body.classList.contains('immersive'))camera.setViewOffset(w,h,-w*.12,0,w,h);
  }
  function home(instant=false){
    state.focus=null;state.orbit=false;controls.autoRotate=false;
    const narrow=canvas.clientWidth<600;
    const p=narrow?new THREE.Vector3(41,29,52):new THREE.Vector3(32,22,45);
    const target=narrow?new THREE.Vector3(0,3.7,0):defaultTarget.clone();
    if(narrow)p.multiplyScalar(1.22);
    if(instant){camera.position.copy(p);controls.target.copy(target);controls.update();}
    else viewTransition={position:p,target};
  }
  resize();home(true);
  const observer=new ResizeObserver(()=>{resize();if(!state.focus)home();});observer.observe(canvas);
  controls.addEventListener('start',()=>{viewTransition=null;state.focus=null;});
  function focus(name){
    if(!machines[name])return;
    state.focus=name;state.orbit=false;controls.autoRotate=false;viewTransition=null;
    machines[name].getWorldPosition(focusTarget);
    if(name==='crane'){focusTarget.y+=7;focusOffset.set(18,9,22);}
    else{focusTarget.y+=1;const offsets={excavator:[-10,6,8],truck:[8,5,10],mixer:[10,5,6],loader:[7,4,9]};focusOffset.set(...offsets[name]);}
    if(canvas.clientWidth<600)focusOffset.multiplyScalar(1.3);
  }
  const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2();let pointerStart=null;
  function pointerDown(e){pointerStart={x:e.clientX,y:e.clientY};}
  function pointerUp(e){
    if(!pointerStart||Math.hypot(e.clientX-pointerStart.x,e.clientY-pointerStart.y)>6)return;
    const rect=canvas.getBoundingClientRect();pointer.set((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1);
    raycaster.setFromCamera(pointer,camera);const hit=raycaster.intersectObjects(Object.values(machines),true)[0];
    if(hit){let target=hit.object;while(target&&!target.userData.machine)target=target.parent;if(target)focus(target.userData.machine);}
    pointerStart=null;
  }
  canvas.addEventListener('pointerdown',pointerDown);canvas.addEventListener('pointerup',pointerUp);
  function positionTruck(t){
    // Forty-eight seconds: loading, outbound trip, tipping, return and alignment.
    const p=t%48;let x=-5.3,z=3.5,angle=Math.PI;
    if(p<12){}
    else if(p<19){const a=(p-12)/7;x=-5.3+17.8*a;z=3.5;angle=0;}
    else if(p<23){const a=(p-19)/4;x=12.5;z=3.5+a*5;angle=-Math.PI/2;}
    else if(p<31){const a=(p-23)/8;x=12.5-a*19.1;z=8.5;angle=Math.PI;}
    else if(p<36){x=-6.6;z=8.5;angle=Math.PI;}
    else if(p<41){const a=(p-36)/5;x=-6.6+19.1*a;z=8.5;angle=0;}
    else if(p<44){const a=(p-41)/3;x=12.5;z=8.5-a*5;angle=Math.PI/2;}
    else{const a=(p-44)/4;x=12.5-a*17.8;z=3.5;angle=Math.PI;}
    truck.position.set(x,groundY,z);truck.rotation.y=angle;
    bed.rotation.z=p>=31&&p<36?Math.sin((p-31)/5*Math.PI)*.75:0;
    tailgate.rotation.z=bed.rotation.z*.7;
    truckSoil.visible=p>6&&p<34;
    truckSoil.scale.y=p<12?Math.max(.1,(p-5)/7):1;
    return p;
  }
  function excavate(t,p){
    const work=p<12,cycle=(t%6)/6;
    // Swing between the pit and the waiting truck; then curl to empty the bucket.
    const swing=work?Math.sin(cycle*Math.PI*2)*.5+.5:.1;
    turret.rotation.y=-1.25+swing*1.95;
    boom.rotation.z=.58+Math.sin(cycle*Math.PI*2)*.28;
    stick.rotation.z=-1.45-Math.cos(cycle*Math.PI*2)*.35;
    bucket.rotation.z=work&&cycle>.58&&cycle<.82?-1.1:.35;
    bucketSoil.visible=cycle>.2&&cycle<.69;
    return work&&cycle>.64&&cycle<.8;
  }
  const sunColor=new THREE.Color(),ambientColor=new THREE.Color(),bgColor=new THREE.Color(),dayBg=new THREE.Color('#eeece5'),nightBg=new THREE.Color('#303d48'),stormBg=new THREE.Color('#929d9c');
  function updateLight(dt){
    const solar=Math.sin((state.hour-6)/24*Math.PI*2);
    const day=THREE.MathUtils.smoothstep(solar,-.18,.35);
    const warm=1-Math.min(1,Math.abs(solar)*2.7);
    weatherMix=THREE.MathUtils.damp(weatherMix,state.weather==='sunny'?0:state.weather==='overcast'?.55:1,1.2,dt);
    wet=THREE.MathUtils.damp(wet,state.weather==='storm'?1:0,.65,dt);
    sun.intensity=(.08+day*3.3)*(1-weatherMix*.88);
    sunColor.set('#fff1d4').lerp(new THREE.Color('#f2ad70'),warm*.65);sun.color.copy(sunColor);
    const theta=(state.hour-6)/24*Math.PI*2;
    sun.position.set(Math.cos(theta)*-28,Math.max(8,Math.sin(theta)*34),18);
    hemi.intensity=(.32+day*.85)*(1-weatherMix*.35);hemi.color.copy(ambientColor.set('#b7c9e4').lerp(new THREE.Color('#e9eef2'),day));
    scene.environmentIntensity=.12+day*.28;
    fill.intensity=.35+(1-day)*.3;
    bgColor.copy(nightBg).lerp(dayBg,day).lerp(stormBg,weatherMix*.6);scene.background.copy(bgColor);scene.fog.color.copy(bgColor);
    renderer.toneMappingExposure=1.05+day*.13;
    for(const lamp of lamps)lamp.intensity=(1-day)*65+weatherMix*15;
    M.light.emissiveIntensity=.6+(1-day)*2;
    puddleMat.opacity=wet*.56;M.sand.roughness=.92-wet*.5;M.soil.roughness=.95-wet*.45;
    for(const soil of soilShades)soil.roughness=.95-wet*.5;
    const thunder=state.elapsed%13;
    flash.intensity=state.weather==='storm'&&((thunder>7&&thunder<7.09)||(thunder>7.22&&thunder<7.34))?4.5:0;
  }
  function updateParticles(dt,t,dumping,p){
    rain.visible=wet>.025;ripples.visible=wet>.05;splashes.visible=wet>.05;
    if(rain.visible){
      rainMat.opacity=wet*.46;
      for(let i=0;i<rainCount;i++){
        const s=rainSeeds[i],x=(s[0]-.5)*36+Math.sin(t*.3)*.6,z=(s[2]-.5)*26;
        const surface=x>-1.3&&x<4.3&&z>-7.7&&z<-.3?10.3:x>-15&&x<-8&&z>-11.2&&z<-7.5?3.8:1.3;
        const height=23-surface,y=((s[1]*height-t*15)%height+height)%height+surface;
        const off=i*6;rainArray[off]=x;rainArray[off+1]=y;rainArray[off+2]=z;
        rainArray[off+3]=x-.23;rainArray[off+4]=y+.65;rainArray[off+5]=z-.09;
      }
      rainGeo.attributes.position.needsUpdate=true;
      for(let i=0;i<140;i++){
        const s=rainSeeds[i],life=(t*2.6+s[1])%1,x=(s[0]-.5)*34,z=(s[2]-.5)*25;
        const y=x>-1.3&&x<4.3&&z>-7.7&&z<-.3?10.3:x>-15&&x<-8&&z>-11.2&&z<-7.5?3.8:1.28;
        temp.position.set(x+Math.sin(i)*life*.17,y+Math.sin(life*Math.PI)*.2,z+Math.cos(i)*life*.17);temp.rotation.set(life,0,life);temp.scale.set(.13,.35*(1-life),.13);temp.updateMatrix();splashes.setMatrixAt(i,temp.matrix);
      }splashes.instanceMatrix.needsUpdate=true;
      for(let i=0;i<70;i++){const s=rainSeeds[i],k=(t*1.5+s[0])%1;temp.position.set((s[0]-.5)*34,1.29,(s[2]-.5)*25);temp.rotation.set(-Math.PI/2,0,0);temp.scale.setScalar(.3+k*2);temp.updateMatrix();ripples.setMatrixAt(i,temp.matrix);}ripples.instanceMatrix.needsUpdate=true;
    }
    dust.visible=state.weather!=='storm';
    for(let i=0;i<75;i++){
      const s=particleSeeds[i],life=(t*.5+s[0])%1;
      temp.position.set(truck.position.x-1+(s[1]-.5)*3,1.4+life*1.6,truck.position.z+(s[2]-.5)*2);temp.rotation.set(life,life,0);temp.scale.setScalar(.5+life*2.5);temp.updateMatrix();dust.setMatrixAt(i,temp.matrix);
    }dust.instanceMatrix.needsUpdate=true;
    soilFall.visible=dumping||(p>32&&p<34.5);
    if(soilFall.visible){
      const source=new THREE.Vector3();if(dumping)bucket.getWorldPosition(source);else source.set(truck.position.x+2.3,2.4,truck.position.z);
      for(let i=0;i<28;i++){const s=particleSeeds[i],f=(t*2+s[0])%1;temp.position.set(source.x+(s[1]-.5)*.6,source.y-f*1.5,source.z+(s[2]-.5)*.6);temp.scale.setScalar(.6+s[0]);temp.rotation.set(f*4,0,f);temp.updateMatrix();soilFall.setMatrixAt(i,temp.matrix);}soilFall.instanceMatrix.needsUpdate=true;
    }
  }
  function animate(){
    if(disposed)return;frame=requestAnimationFrame(animate);
    const now=performance.now(),wallDt=(now-previousTime)/1000,rawDt=Math.min(wallDt,.06),dt=state.paused?0:rawDt*state.speed;previousTime=now;
    state.elapsed+=dt;simulation+=dt*(state.weather==='storm'?.35:1);if(state.weather!=='storm')craneTime+=dt;
    state.hour+=dt*.1;if(state.hour>=24){state.hour%=24;state.day++;}
    const t=simulation,p=positionTruck(t);phase=p;
    const dumping=excavate(t,p);
    jib.rotation.y=Math.sin(craneTime*.12)*.8+.2;
    trolley.position.x=5.3+Math.sin(craneTime*.22)*2.5;
    const cableLength=4.6+Math.sin(craneTime*.35)*2.5;
    cable.scale.y=cableLength;cable.position.y=-cableLength/2;hook.position.y=-cableLength;
    craneLoad.rotation.y=Math.sin(craneTime*.7)*.06;
    drum.rotation.x=t*1.8;
    const mixPhase=t%38;
    mixer.position.z=-3-(mixPhase<18?0:Math.sin((mixPhase-18)/20*Math.PI)*4);
    pour.visible=mixPhase<18;chute.rotation.z=.28+Math.sin(t*.4)*.02;
    const loaderPhase=t*.18;
    loader.position.x=-2.7+Math.sin(loaderPhase)*3.5;loader.position.z=6.2+Math.cos(loaderPhase)*.2;loader.rotation.y=Math.cos(loaderPhase)>0?0:Math.PI;
    loaderArm.rotation.z=.1+Math.max(0,Math.sin(loaderPhase))*.55;loaderSoil.visible=Math.sin(loaderPhase)>-.3;scoop.rotation.z=-loaderArm.rotation.z*.7;
    for(const w of movingWheels)w.rotation.z=-t*1.8;
    for(let i=0;i<workers.length;i++){
      const w=workers[i],walk=w.role==='walk'||w.role==='carry';
      if(walk){const path=Math.sin(t*.28+i);w.g.position.x=w.x+path*1.6;w.g.rotation.y=Math.cos(t*.28+i)>0?Math.PI/2:-Math.PI/2;}
      w.legs.forEach((l,j)=>l.rotation.x=walk?Math.sin(t*5+j*Math.PI+i)*.42:0);
      w.arms.forEach((a,j)=>{a.rotation.x=walk?(w.role==='carry'?-1.05:Math.sin(t*5+j*Math.PI+i)*.4):w.role==='signal'?-1.7+Math.sin(t*2)*.6:w.role==='build'?-1+Math.sin(t*4)*.5:-.6;});
    }
    weldLight.intensity=state.weather!=='storm'&&Math.sin(t*21)>.4?3:0;
    updateLight(rawDt);updateParticles(dt,state.elapsed,dumping,p);details.update({t,wet,hour:state.hour,storm:state.weather==='storm',paused:state.paused,dt,truckPhase:p});
    if(viewTransition){camera.position.lerp(viewTransition.position,.065);controls.target.lerp(viewTransition.target,.065);if(camera.position.distanceTo(viewTransition.position)<.03)viewTransition=null;}
    if(state.focus){machines[state.focus].getWorldPosition(focusTarget);focusTarget.y+=state.focus==='crane'?7:1;controls.target.lerp(focusTarget,.06);orbitTarget.copy(focusTarget).add(focusOffset);camera.position.lerp(orbitTarget,.04);}
    controls.autoRotate=state.orbit&&!state.paused;controls.update();
    shadowAge+=rawDt;
    if((!state.paused&&shadowAge>=1/30)||Math.abs(state.hour-lastShadowHour)>.1){renderer.shadowMap.needsUpdate=true;lastShadowHour=state.hour;shadowAge=0;}
    finish.render();
    fpsFrames++;fpsTime+=wallDt;if(fpsTime>=1){fps=Math.round(fpsFrames/fpsTime);fpsFrames=0;fpsTime=0;}
    if(state.elapsed-lastUpdate>.2||state.paused){
      onUpdate({ ...state, truckPhase:p, cranePhase:craneTime%28, fps, calls:renderer.info.render.calls, triangles:renderer.info.render.triangles });lastUpdate=state.elapsed;
    }
  }
  animate();
  function dispose(){disposed=true;cancelAnimationFrame(frame);observer.disconnect();canvas.removeEventListener('pointerdown',pointerDown);canvas.removeEventListener('pointerup',pointerUp);controls.dispose();finish.dispose();details.dispose();surfaces.environment.dispose();scene.traverse(o=>{if(o.isInstancedMesh)o.dispose();});geometries.forEach(g=>g.dispose());textures.forEach(t=>t.dispose());mats.forEach(m=>m.dispose());rainMat.dispose();rippleMat.dispose();renderer.dispose();}
  return {state,home,focus,resize,dispose,setHour(hour){state.hour=hour;lastUpdate=-1;},zoom(factor){viewTransition=null;state.focus=null;camera.position.sub(controls.target).multiplyScalar(factor).add(controls.target);},getSnapshot(){return{...state,truckPhase:phase,cranePhase:craneTime%28,fps,calls:renderer.info.render.calls};}};
}
