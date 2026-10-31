import * as THREE from './vendor/three/build/three.module.min.js';
import { OrbitControls } from './vendor/three/examples/jsm/controls/OrbitControls.js';
import { RoundedBoxGeometry } from './vendor/three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from './vendor/three/examples/jsm/environments/RoomEnvironment.js';
import { equipment } from './simulation.js';
import { createMaterials } from './materials.js';
import { addIndustrialDetails, batchStaticMeshes } from './industrial-details.js';
import { createRendering } from './rendering.js';

export const colors = { electric: '#f4ca64', heat: '#ff896d', cold: '#62b5fa', hydrogen: '#63e6be', gas: '#ba9afb' };
const positions = { solar: [-13,-9], wind: [-17,0], grid: [-10,0], electrolyzer: [-4,-9], tank: [5,-9], fuelcell: [14,-9], gas: [-14,9], chp: [-6,9], boiler: [2,9], absorption: [3,0], chiller: [13,0], load: [12,9] };
const heights = { solar: 2.5, wind: 7, grid: 2.8, electrolyzer: 3, tank: 4.4, fuelcell: 3.3, gas: 2.9, chp: 4.4, boiler: 4.4, absorption: 2.8, chiller: 3, load: 5.7 };

export function createScene(host, onSelect) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#09131f');
  scene.fog = new THREE.FogExp2('#09131f', .0035);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.6));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = .95;
  host.append(renderer.domElement);
  renderer.domElement.setAttribute('aria-label', '3D 能源场站。鼠标拖动旋转、滚轮缩放，设备参数也可通过场景标签与左侧列表查看。');
  renderer.domElement.setAttribute('role', 'img');
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const environment = pmrem.fromScene(room, .04);
  scene.environment = environment.texture;
  scene.environmentIntensity = .6;
  scene.environmentRotation.y=.45;
  room.dispose(); pmrem.dispose();
  const camera = new THREE.PerspectiveCamera(32,1,.5,250);
  const overviewDirection=new THREE.Vector3(37,32,43).normalize();
  camera.position.copy(overviewDirection).multiplyScalar(70);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0,-1,0);
  controls.enableDamping = true;
  controls.dampingFactor = .075;
  controls.minPolarAngle = .08; controls.maxPolarAngle = Math.PI * .47;
  controls.minDistance = 8; controls.maxDistance = 180;
  controls.zoomSpeed=.65;
  controls.autoRotateSpeed = .65;
  controls.enablePan = false;
  controls.update();
  scene.add(new THREE.HemisphereLight('#a7cbdc','#101b2a',.55));
  const keyLight = new THREE.DirectionalLight('#f0f2e9',3.6);
  keyLight.position.set(-15,30,18); keyLight.castShadow=true;
  Object.assign(keyLight.shadow.camera,{left:-29,right:29,top:28,bottom:-28,near:1,far:80});
  keyLight.shadow.mapSize.set(4096,4096); keyLight.shadow.bias=-.00015; keyLight.shadow.normalBias=.035;keyLight.shadow.radius=2;
  scene.add(keyLight);
  const rimLight = new THREE.DirectionalLight('#68d6eb',3.2); rimLight.position.set(10,12,-22); scene.add(rimLight);
  const warmLight = new THREE.DirectionalLight('#a5bdf5',1.2); warmLight.position.set(20,7,10); scene.add(warmLight);
  const materials=createMaterials(renderer);
  const {metal,pale,dark,trim,black}=materials;const solarMat=materials.solar;
  const lit = Object.fromEntries(Object.entries(colors).map(([k,v])=>[k,materials.emissive(v,.6)]));
  const rendering=createRendering(renderer,scene,camera);
  const meshes = [], rotors = [], fans = [], groups = {}, labels = [];
  const geometryCache = new Map();
  function box(g,w,h,d,x,y,z,mat=metal,rounded=false) {
    const key = `${rounded}-${w}-${h}-${d}`;
    if(!geometryCache.has(key)) geometryCache.set(key, rounded ? new RoundedBoxGeometry(w,h,d,3,Math.min(.12,Math.min(w,h,d)*.2)) : new THREE.BoxGeometry(w,h,d));
    const m = new THREE.Mesh(geometryCache.get(key),mat);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;g.add(m);return m;
  }
  function cylinder(g,r1,r2,h,x,y,z,mat=metal,segments=40) {
    const m=new THREE.Mesh(new THREE.CylinderGeometry(r1,r2,h,segments),mat);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;g.add(m);return m;
  }
  function sphere(g,r,x,y,z,mat=metal,sx=1,sy=1,sz=1) {
    const m=new THREE.Mesh(new THREE.SphereGeometry(r,40,24),mat);m.scale.set(sx,sy,sz);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;g.add(m);return m;
  }
  function roundedPath(points,radius=.22){
    const path=new THREE.CurvePath();const vectors=points.map(p=>new THREE.Vector3(...p));let start=vectors[0];
    for(let i=1;i<vectors.length-1;i++){
      const point=vectors[i],next=vectors[i+1];const before=point.distanceTo(start),after=point.distanceTo(next);if(before<.001||after<.001)continue;
      const r=Math.min(radius,before*.4,after*.4);const entry=point.clone().lerp(start,r/before);const exit=point.clone().lerp(next,r/after);
      path.add(new THREE.LineCurve3(start,entry));path.add(new THREE.QuadraticBezierCurve3(entry,point,exit));start=exit;
    }
    if(start.distanceTo(vectors.at(-1))>.001)path.add(new THREE.LineCurve3(start,vectors.at(-1)));return path;
  }
  function pipe(g,points,color=metal,r=.06) {
    const path=roundedPath(points,Math.max(.1,r*2));
    const m=new THREE.Mesh(new THREE.TubeGeometry(path,Math.max(points.length*12,24),r,10,false),color);m.castShadow=true;m.receiveShadow=true;g.add(m);return m;
  }
  function ring(g,r,x,y,z,mat=lit.hydrogen){const m=new THREE.Mesh(new THREE.TorusGeometry(r,.035,6,28),mat);m.rotation.x=Math.PI/2;m.position.set(x,y,z);g.add(m);return m;}
  function vents(g,x,y,z,count=6,width=1.4){for(let j=0;j<count;j++)box(g,width,.035,.035,x,y+j*.12,z,black);}
  function fan(g,x,y,z,r=.5){
    cylinder(g,r,r,.13,x,y,z,black);
    const rotor=new THREE.Group();rotor.position.set(x,y+.08,z);rotor.userData.dynamic=true;g.add(rotor);
    for(let j=0;j<5;j++){const blade=box(rotor,r*.9,.045,.18,r*.4,.02,0,trim);blade.geometry=blade.geometry.clone();blade.geometry.translate(-r*.4,0,0);blade.position.set(0,.02,0);blade.rotation.y=j*Math.PI*2/5;}
    cylinder(rotor,.1,.1,.15,0,.02,0,pale,12);rotor.userData.device=g.userData.device;fans.push(rotor);ring(g,r,x,y+.11,z,trim);
  }
  const base=new THREE.Group();scene.add(base);
  box(base,42,.65,29,0,-.52,0,new THREE.MeshStandardMaterial({color:'#203443',metalness:.55,roughness:.45}),true);
  box(base,41.7,.08,28.7,0,-.16,0,materials.ground);
  const edgeMat=new THREE.MeshBasicMaterial({color:'#3d9da5',transparent:true,opacity:.6});
  pipe(base,[[-20.9,-.29,-14.4],[-20.9,-.29,14.4],[20.9,-.29,14.4],[20.9,-.29,-14.4],[-20.9,-.29,-14.4]],edgeMat,.035);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(300,300),new THREE.MeshBasicMaterial({color:'#172b40'}));floor.rotation.x=-Math.PI/2;floor.position.y=-1.05;scene.add(floor);
  // Two separate service corridors keep process skids and energy routes legible.
  for(const z of [-4.5,4.5]){
    box(base,40,.02,2.1,0,-.08,z,black);
    for(let x=-19;x<20;x+=2)box(base,.65,.025,.045,x,-.06,z,new THREE.MeshBasicMaterial({color:'#395568'}));
  }
  function lettering(text,w=256,h=64,color='#a8d7df'){
    const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
    const ctx=canvas.getContext('2d');ctx.fillStyle=color;ctx.font=`500 ${h*.55}px Segoe UI, sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,w/2,h/2);
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;return new THREE.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false});
  }
  const groundTitle=new THREE.Mesh(new THREE.PlaneGeometry(9,1.6),lettering('N E X U S',512,90,'#467382'));groundTitle.rotation.x=-Math.PI/2;groundTitle.position.set(1,-.04,13.1);base.add(groundTitle);
  for(const item of equipment){
    const g=new THREE.Group();const [x,z]=positions[item.id];g.position.set(x,0,z);g.userData.device=item.id;groups[item.id]=g;scene.add(g);
    const dims=item.id==='solar'?[7,6]:item.id==='load'?[8,6]:item.id==='wind'?[3.6,3.6]:item.id==='tank'?[7,5.8]:[6,4.8];
    box(g,dims[0],.16,dims[1],0,.02,0,new THREE.MeshStandardMaterial({color:'#294352',metalness:.25,roughness:.7}),true);
    box(g,dims[0],.04,.05,0,.12,dims[1]/2-.06,lit[item.type]);
    const label=document.createElement('button');label.className='scene-label';label.dataset.device=item.id;label.setAttribute('aria-label',`查看${item.name}运行参数`);label.innerHTML=`<i style="background:${colors[item.type]}"></i>${item.name}<b></b>`;
    label.addEventListener('click',()=>onSelect(item.id));document.getElementById('scene-labels').append(label);
    labels.push({id:item.id,el:label,point:new THREE.Vector3(x,heights[item.id]+.6,z)});
  }
  // Photovoltaic strings with support frames, busbars and individually visible cells.
  const pv=groups.solar;
  for(let row=0;row<3;row++)for(let col=0;col<4;col++){
    const x=(col-1.5)*1.55,z=(row-1)*1.7;
    box(pv,.07,1.1,.07,x,.65,z,trim);box(pv,.07,.6,.07,x,.38,z+.6,trim);
    const panel=new THREE.Group();panel.position.set(x,1.08,z);panel.rotation.x=-.3;pv.add(panel);
    box(panel,1.44,.08,1.4,0,0,0,metal);box(panel,1.35,.025,1.32,0,.055,0,solarMat);
    for(let k=-1;k<=1;k++)box(panel,.012,.008,1.31,k*.44,.074,0,trim);
    for(let k=-2;k<=2;k++)box(panel,1.34,.008,.012,0,.074,k*.26,trim);
  }
  // Three-blade turbine, tapered tower and service base.
  const wt=groups.wind;cylinder(wt,.28,.45,6.4,0,3.35,0,pale);cylinder(wt,.65,.75,.35,0,.34,0,trim);
  box(wt,1.5,.65,.7,0,6.65,0,pale,true);
  const rotor=new THREE.Group();rotor.position.set(0,6.65,.64);rotor.userData.dynamic=true;wt.add(rotor);sphere(rotor,.24,0,0,0,pale);rotors.push(rotor);
  for(let j=0;j<3;j++){
    const blade=new THREE.Shape();blade.moveTo(-.1,.13);blade.lineTo(-.24,1.05);blade.lineTo(.03,2.7);blade.lineTo(.19,2.75);blade.lineTo(.23,.7);blade.lineTo(.1,.13);
    const m=new THREE.Mesh(new THREE.ExtrudeGeometry(blade,{depth:.05,bevelEnabled:false}),pale);m.rotation.z=j*Math.PI*2/3;rotor.add(m);
  }
  // Transformer bank with cooling fins, porcelain bushings and gantry.
  const gr=groups.grid;box(gr,2.6,1.7,2.1,-.6,1.1,0,metal,true);
  for(let i=0;i<7;i++)box(gr,.1,1.35,2.55,-1.65+i*.34,1.05,0,trim);
  for(let j=0;j<3;j++){
    cylinder(gr,.11,.14,.9,-1.3+j*.7,2.4,0,pale,12);
    for(let i=0;i<5;i++)cylinder(gr,.19,.19,.06,-1.3+j*.7,2.1+i*.15,0,trim,12);
  }
  box(gr,1.05,2.1,1.5,1.8,1.2,0,dark,true);vents(gr,1.8,1.2,.78,5,.75);box(gr,.3,.16,.03,1.8,2,.78,lit.electric);
  // PEM skid: rectifier cabinet and membrane stack inside an open steel frame.
  const el=groups.electrolyzer;box(el,1.55,2.45,2.5,-1.7,1.4,0,pale,true);vents(el,-1.7,1,.0+1.27,8,1.1);box(el,.7,.3,.04,-1.7,2.2,1.28,lit.hydrogen);
  for(const x of [-.55,2.45])for(const z of [-1.3,1.3])box(el,.09,2.3,.09,x,1.3,z,metal);
  box(el,3.1,.12,2.7,.95,2.47,0,metal);
  for(let i=0;i<11;i++)box(el,.12,1.55,1.65,-.35+i*.24,1.22,0,i%2?trim:pale,true);
  pipe(el,[[-.8,.45,1.3],[2.3,.45,1.3],[2.3,2.1,1.3]],lit.hydrogen,.08);
  cylinder(el,.4,.4,1.8,2.15,1.15,-.7,metal);ring(el,.41,2.15,1.8,-.7);
  // Hydrogen vessels, domed heads, valve manifolds and protective bollards.
  const hs=groups.tank;
  for(let j=0;j<4;j++){
    const x=(j-1.5)*1.5;cylinder(hs,.54,.54,2.6,x,1.95,0,metal);sphere(hs,.54,x,3.25,0,metal,1,.65,1);sphere(hs,.54,x,.65,0,metal,1,.65,1);
    for(const y of [.95,2.8]){cylinder(hs,.56,.56,.15,x,y,0,trim);ring(hs,.565,x,y+.06,0);}
    cylinder(hs,.08,.08,.3,x,3.7,0,lit.hydrogen,10);pipe(hs,[[x,3.8,0],[x,3.8,-1.1],[0,3.8,-1.1]],metal,.05);
    box(hs,.35,.5,.65,x,.35,0,dark);const tag=new THREE.Mesh(new THREE.PlaneGeometry(.6,.65),lettering('H₂',128,128,'#17514f'));tag.position.set(x,2,.55);hs.add(tag);
  }
  for(const x of [-3,3])for(const z of [-2,2]){cylinder(hs,.06,.06,.6,x,.5,z,lit.hydrogen,8);}
  // Fuel-cell enclosure with module cabinets, heat recovery and roof fans.
  const fc=groups.fuelcell;box(fc,5.2,2.2,2.7,0,1.3,0,pale,true);box(fc,5.3,.12,2.8,0,2.45,0,trim);
  for(let i=0;i<5;i++){box(fc,.018,1.7,.03,-2+i,1.3,1.37,trim);vents(fc,-1.55+i,.55,1.38,6,.65);}
  box(fc,5.1,.12,.04,0,2.16,1.38,lit.hydrogen);fan(fc,-1.5,2.54,0,.56);fan(fc,0,2.54,0,.56);fan(fc,1.5,2.54,0,.56);
  // Gas pressure-regulation skid, pressure vessel and bypass lines.
  const ng=groups.gas;const vessel=cylinder(ng,.65,.65,3.4,-.5,1.6,0,metal);vessel.rotation.z=Math.PI/2;
  sphere(ng,.65,-2.2,1.6,0,pale,.6,1,1);sphere(ng,.65,1.2,1.6,0,pale,.6,1,1);
  for(const x of [-1.7,.6])box(ng,.35,1.2,1.1,x,.65,0,trim);
  pipe(ng,[[-2.4,.7,1.6],[2.3,.7,1.6],[2.3,1.6,1.6],[2.3,1.6,-1.4],[-2.3,1.6,-1.4]],lit.gas,.1);
  for(const x of [-1,1]){cylinder(ng,.15,.15,.35,x,1,1.6,metal);ring(ng,.22,x,1.22,1.6,lit.gas);}
  // Gas engine and exhaust heat-recovery stack.
  const chp=groups.chp;box(chp,4.9,.45,2.8,0,.4,0,dark,true);box(chp,3,1.3,1.9,-.6,1.25,0,metal,true);
  for(let i=0;i<6;i++){const block=box(chp,.32,.65,1.8,-1.8+i*.47,2,0,pale,true);block.rotation.x=.16;}
  const generator=cylinder(chp,.85,.85,1.4,1.6,1.4,0,trim);generator.rotation.z=Math.PI/2;
  cylinder(chp,.3,.37,3.5,-2,2.05,-1.6,metal);cylinder(chp,.4,.4,.15,-2,3.8,-1.6,trim);
  box(chp,1.1,2.1,1.1,1.9,1.3,-1.3,pale,true);pipe(chp,[[-1.8,2.2,1.2],[1.6,2.2,1.2],[1.6,.45,1.9]],lit.heat,.08);
  // Hot water boiler, burner, return/supply pipes and stack.
  const gb=groups.boiler;const drum=cylinder(gb,1,1,3.3,0,1.5,0,pale);drum.rotation.z=Math.PI/2;
  for(const x of [-1.67,1.67]){const cap=cylinder(gb,1.05,1.05,.14,x,1.5,0,trim);cap.rotation.z=Math.PI/2;}
  for(const x of [-1,1])box(gb,.4,.6,1.4,x,.4,0,dark);
  const burner=cylinder(gb,.4,.4,.6,1.9,1.5,0,lit.heat);burner.rotation.z=Math.PI/2;
  cylinder(gb,.26,.3,3.7,-1.2,2.05,-1.15,metal);pipe(gb,[[.3,2.4,0],[.3,2.8,0],[.3,2.8,1.6],[2.4,2.8,1.6]],lit.heat,.08);
  // Absorption machine: paired shells and heat exchanger plumbing.
  const ac=groups.absorption;
  for(const z of [-.75,.75]){const shell=cylinder(ac,.62,.62,4.2,0,1.25,z,pale);shell.rotation.z=Math.PI/2;for(const x of [-2.15,2.15]){const head=cylinder(ac,.64,.64,.12,x,1.25,z,trim);head.rotation.z=Math.PI/2;}}
  box(ac,3.6,.65,1.6,0,2.08,0,dark,true);box(ac,.8,1.2,.7,2,1.9,1.4,pale,true);box(ac,.5,.3,.03,2,2.13,1.77,lit.cold);
  pipe(ac,[[-2.3,1.25,-.75],[-2.5,1.25,-.75],[-2.5,1.25,.75],[-2.3,1.25,.75]],lit.cold,.1);
  // Air-cooled electric chiller with exposed condenser fans.
  const ec=groups.chiller;box(ec,5.4,1.6,2.8,0,1.15,0,metal,true);box(ec,5.5,.12,2.9,0,2,0,trim);
  for(const x of [-1.7,0,1.7])fan(ec,x,2.15,0,.66);
  for(let i=0;i<13;i++)box(ec,.16,1.25,.04,-2.3+i*.38,1.2,1.43,black);
  box(ec,5.3,.1,.04,0,.52,1.46,lit.cold);
  // Terminal users: an office block, research building and hydrogen demand skid.
  const ld=groups.load;
  for(const [x,z,w,h,d] of [[-1.8,-.3,2.6,4.8,2.8],[1.2,.6,2.5,3.2,2.7],[2.7,-1.2,1.5,2,1.4]]){
    box(ld,w,h,d,x,h/2+.2,z,new THREE.MeshStandardMaterial({color:'#527484',metalness:.55,roughness:.32}),true);
    box(ld,w+.1,.12,d+.1,x,h+.25,z,pale);
    for(let y=.8;y<h;y+=.65){box(ld,w-.25,.22,.025,x,y,z+d/2+.02,new THREE.MeshStandardMaterial({color:'#88d3de',emissive:'#2d8495',emissiveIntensity:.4,metalness:.4,roughness:.2}));box(ld,.025,.22,d-.25,x+w/2+.02,y,z,lit.cold);}
  }
  box(ld,7.5,.25,.35,0,.3,2.4,dark);for(const x of [-3,-1,1,3])cylinder(ld,.07,.07,.65,x,.75,2.5,lit.cold,8);
  // Cable trenches / process lines: distinct corridors and explicit source-destination links.
  const routes=[];
  const worldPipe=new THREE.Group();scene.add(worldPipe);
  const glowCanvas=document.createElement('canvas');glowCanvas.width=64;glowCanvas.height=64;
  const glowContext=glowCanvas.getContext('2d');const gradient=glowContext.createRadialGradient(32,32,0,32,32,32);gradient.addColorStop(0,'#ffffff');gradient.addColorStop(.22,'#ffffff');gradient.addColorStop(.5,'#ffffff66');gradient.addColorStop(1,'#ffffff00');glowContext.fillStyle=gradient;glowContext.fillRect(0,0,64,64);const glowTexture=new THREE.CanvasTexture(glowCanvas);
  function route(id,type,from,to,via,flow){
    const a=positions[from],b=positions[to],y=.32+Object.keys(colors).indexOf(type)*.055;
    const pts=[[a[0],y,a[1]],[a[0],y,via],[b[0],y,via],[b[0],y,b[1]]];
    const path=roundedPath(pts,.34);
    const mat=new THREE.MeshBasicMaterial({color:new THREE.Color(colors[type]).multiplyScalar(2.1),transparent:true,opacity:.8});
    const tube=new THREE.Mesh(new THREE.TubeGeometry(path,96,.055,8,false),mat);worldPipe.add(tube);
    const outer=new THREE.Mesh(new THREE.TubeGeometry(path,48,.14,6,false),new THREE.MeshBasicMaterial({color:colors[type],transparent:true,opacity:.1,blending:THREE.AdditiveBlending,depthWrite:false}));worldPipe.add(outer);
    const count=Math.max(5,Math.ceil(path.getLength()*.6));const points=new Float32Array(count*9);const colorArray=new Float32Array(count*9);for(let i=0;i<count*3;i++){const intensity=[3.5,1.2,.35][i%3];colorArray.set([intensity,intensity,intensity],i*3);}const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(points,3));geometry.setAttribute('color',new THREE.BufferAttribute(colorArray,3));
    const particle=new THREE.Points(geometry,new THREE.PointsMaterial({color:colors[type],vertexColors:true,size:4,map:glowTexture,transparent:true,opacity:.95,blending:THREE.AdditiveBlending,depthWrite:false,sizeAttenuation:false}));particle.frustumCulled=false;worldPipe.add(particle);
    for(let distance=2;distance<path.getLength()-1;distance+=3.2){const p=path.getPoint(distance/path.getLength());box(base,.18,.15,.18,p.x,p.y-.13,p.z,trim,true);}
    routes.push({id,type,path,tube,outer,particle,count,flow,value:0,length:path.getLength()});
  }
  route('solar-grid','electric','solar','grid',-5.4,s=>s.pv);
  route('wind-grid','electric','wind','grid',-2.8,s=>s.windPower);
  route('grid-el','electric','grid','electrolyzer',-4.9,s=>s.electrolyzer+s.compression);
  route('chp-grid','electric','chp','grid',4.8,s=>s.chpElectric);
  route('fc-grid','electric','fuelcell','grid',-4.4,s=>s.fuelcellElectric);
  route('grid-load','electric','grid','load',-3.9,s=>s.electricServed);
  route('grid-chiller','electric','grid','chiller',-3.4,s=>s.chillerElectric);
  route('el-h2','hydrogen','electrolyzer','tank',-6.1,s=>s.hydrogenProduction*33.33);
  route('h2-fc','hydrogen','tank','fuelcell',-6.6,s=>s.fuelcellInput);
  route('h2-load','hydrogen','tank','load',-2.7,s=>s.hydrogenServed*33.33);
  route('ng-chp','gas','gas','chp',12.1,s=>s.chpGas);
  route('ng-boiler','gas','gas','boiler',12.7,s=>s.boilerGas);
  route('chp-ac','heat','chp','absorption',3.2,s=>s.absorptionHeat);
  route('chp-load','heat','chp','load',3.7,s=>Math.max(0,s.chpHeat-s.absorptionHeat));
  route('boiler-load','heat','boiler','load',4.2,s=>s.boilerHeat);
  route('fc-load','heat','fuelcell','load',-2.1,s=>Math.min(s.fuelcellHeat,Math.max(0,s.heatDemand-s.chpHeat+s.absorptionHeat)));
  route('ac-load','cold','absorption','load',5.3,s=>s.absorptionCold);
  route('ec-load','cold','chiller','load',5.8,s=>s.chillerCold);
  // Small area lights and perimeter bollards give the platform an industrial scale.
  for(const x of [-19.6,19.6])for(const z of [-12.6,-5,5,12.6]){
    cylinder(base,.035,.055,1.5,x,.65,z,trim,8);box(base,.3,.07,.18,x,1.43,z,lit.cold);
  }
  const details=addIndustrialDetails({groups,base,box,cylinder,sphere,pipe,ring,materials,lettering,colors});
  const originalGeometries=new Set();scene.traverse(m=>{if(m.geometry)originalGeometries.add(m.geometry);});
  for(const g of [base,...Object.values(groups)])batchStaticMeshes(g);
  for(const g of Object.values(groups))g.traverse(m=>{if(m.isMesh){m.userData.device=g.userData.device;meshes.push(m);}});
  const selection=new THREE.Group();scene.add(selection);
  const selectionMaterial=new THREE.MeshBasicMaterial({color:'#72f0cd',transparent:true,opacity:.65,depthWrite:false});
  for(const sx of [-1,1])for(const sz of [-1,1]){
    box(selection,.8,.03,.05,sx*3.2,.18,sz*2.55,selectionMaterial);box(selection,.05,.03,.7,sx*3.55,.18,sz*2.25,selectionMaterial);
  }
  let selected='electrolyzer', filter='all', showLabels=true, paused=false, state=null, time=0, frame=0, disposed=false;
  let focused=false,transition=null,overviewDistance=70,shadowTime=0;
  renderer.shadowMap.autoUpdate=false;renderer.shadowMap.needsUpdate=true;
  controls.addEventListener('start',()=>{transition=null;});
  const raycaster=new THREE.Raycaster();const pointer=new THREE.Vector2();let down=null;
  renderer.domElement.addEventListener('pointerdown',e=>{down={x:e.clientX,y:e.clientY};});
  renderer.domElement.addEventListener('pointerup',e=>{
    if(!down||Math.hypot(e.clientX-down.x,e.clientY-down.y)>6)return;
    down=null;const rect=renderer.domElement.getBoundingClientRect();pointer.set((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1);raycaster.setFromCamera(pointer,camera);
    const hit=raycaster.intersectObjects(meshes,false)[0];if(hit)onSelect(hit.object.userData.device);
  });
  const flowValue={solar:s=>s.pv,wind:s=>s.windPower,grid:s=>s.gridImport-s.gridExport,electrolyzer:s=>s.electrolyzer,tank:s=>s.inventory,fuelcell:s=>s.fuelcellElectric,gas:s=>s.gas,chp:s=>s.chpElectric,boiler:s=>s.boilerHeat,absorption:s=>s.absorptionCold,chiller:s=>s.chillerCold,load:s=>s.electricServed};
  function moveCamera(position,target){transition={from:camera.position.clone(),to:position,fromTarget:controls.target.clone(),toTarget:target,started:performance.now()};}
  function focus(value=true){
    focused=value;const button=document.getElementById('focus-device');if(button){button.setAttribute('aria-pressed',String(value));button.classList.toggle('active',value);button.textContent=value?'返回全景':'设备特写';}
    document.getElementById('view-iso')?.classList.toggle('active',!value);document.getElementById('view-top')?.classList.remove('active');
    if(value){const [x,z]=positions[selected];const target=new THREE.Vector3(x,heights[selected]*.4,z);const distance=(selected==='wind'?22:selected==='load'?21:15)*Math.max(1,1/camera.aspect);moveCamera(target.clone().add(overviewDirection.clone().multiplyScalar(distance)),target);}
    else moveCamera(overviewDirection.clone().multiplyScalar(overviewDistance),new THREE.Vector3(0,-1,0));
  }
  function select(id){selected=id;const [x,z]=positions[id];selection.position.set(x,0,z);for(const label of labels)label.el.classList.toggle('active',label.id===id);if(focused)focus(true);}
  function update(s){state=s;details.update(s);for(const r of routes)r.value=r.flow(s);for(const l of labels)l.el.querySelector('b').textContent=`${flowValue[l.id](s).toFixed(0)}${l.id==='tank'?'kg':'kW'}`;for(const l of labels){l.width=l.el.offsetWidth+8;l.height=l.el.offsetHeight+7;}}
  let width=0,height=0;
  function resize(){
    width=host.clientWidth;height=host.clientHeight;if(!width||!height)return;camera.aspect=width/height;camera.updateProjectionMatrix();
    const fitDistance=Math.max(76,100/camera.aspect);
    if(!focused){
      camera.position.sub(controls.target).multiplyScalar(fitDistance/overviewDistance).add(controls.target);
      if(transition){const direction=transition.to.clone().sub(transition.toTarget).normalize();transition.to=transition.toTarget.clone().add(direction.multiplyScalar(fitDistance));transition.from=camera.position.clone();transition.fromTarget=controls.target.clone();transition.started=performance.now();}
    }
    overviewDistance=fitDistance;
    if(focused)focus(true);
    rendering.resize(width,height);for(const label of labels){label.width=label.el.offsetWidth+8;label.height=label.el.offsetHeight+7;}
  }
  const observer=new ResizeObserver(resize);observer.observe(host);resize();select(selected);
  const project=new THREE.Vector3();let last=performance.now();
  const diagnostics=new URLSearchParams(location.search).get('renderStats')==='1';
  let measuredFrames=0,measuredSeconds=0;renderer.info.autoReset=false;
  function animate(now){
    if(disposed)return;frame=requestAnimationFrame(animate);const actualDelta=(now-last)/1000;const delta=Math.min(actualDelta,.1);last=now;if(document.hidden)return;
    if(!paused){time+=delta;for(const r of rotors)r.rotation.z-=delta*(state?.windPower>0?(.25+(state?.wind||0)*.09):0);for(const f of fans){if(state&&flowValue[f.userData.device](state)>.01)f.rotation.y+=delta*2.2;}}
    if(transition){const progress=Math.min(1,(now-transition.started)/950);const ease=1-(1-progress)**3;camera.position.lerpVectors(transition.from,transition.to,ease);controls.target.lerpVectors(transition.fromTarget,transition.toTarget,ease);if(progress===1)transition=null;}
    controls.autoRotate=!paused&&!focused&&!transition&&controls.userDataAutoRotate;controls.update();
    shadowTime+=delta;if(shadowTime>.25&&!paused){renderer.shadowMap.needsUpdate=true;shadowTime=0;}
    for(const r of routes){
      const show=filter==='all'||filter===r.type;
      r.tube.material.opacity=show?(r.value>.01?.8:.08):.025;r.outer.visible=show&&r.value>.01;
      r.particle.visible=show&&r.value>.01;
      if(r.particle.visible){const arr=r.particle.geometry.attributes.position.array;const velocity=(.65+Math.min(r.value,700)/320)/r.length;for(let i=0;i<r.count;i++)for(let tail=0;tail<3;tail++){r.path.getPoint((i/r.count+time*velocity-tail*.13/r.length+10)%1,project);const index=(i*3+tail)*3;arr[index]=project.x;arr[index+1]=project.y+.035;arr[index+2]=project.z;}r.particle.geometry.attributes.position.needsUpdate=true;}
    }
    const placed=[];
    const projected=labels.map(l=>{project.copy(l.point).project(camera);return {l,x:(project.x*.5+.5)*width,y:(-project.y*.5+.5)*height,z:project.z};}).sort((a,b)=>a.l.id===selected?-1:b.l.id===selected?1:a.y-b.y);
    for(const {l,x,y,z} of projected){
      let top=y,placedSuccessfully=false;
      for(const offset of [0,-26,26,-52,52,-78,78]){
        const candidate=y+offset;if(candidate<100||candidate>height-90)continue;
        if(!placed.some(p=>Math.abs(p.x-x)<(p.width+l.width)/2&&Math.abs(p.y-candidate)<Math.max(p.height,l.height))){top=candidate;placedSuccessfully=true;break;}
      }
      const hidden=!showLabels||(!placedSuccessfully&&l.id!==selected)||(focused&&l.id!==selected)||x<25||x>width-25||top<88||top>height-86||z>1||z<0;
      if(!hidden)placed.push({x,y:top,width:l.width,height:l.height});
      l.el.style.left=`${x}px`;l.el.style.top=`${top}px`;l.el.style.setProperty('--stem',`${Math.max(9,y-top+9)}px`);l.el.classList.toggle('is-hidden',hidden);
    }
    selectionMaterial.opacity=.48+Math.sin(time*2)*.16;
    document.getElementById('compass-needle').style.transform=`rotate(${controls.getAzimuthalAngle()*-180/Math.PI}deg)`;
    renderer.info.reset();rendering.render(delta);
    if(diagnostics){measuredFrames++;measuredSeconds+=actualDelta;if(measuredSeconds>=4){host.dataset.renderStats=JSON.stringify({fps:Math.round(measuredFrames/measuredSeconds),calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures});measuredFrames=0;measuredSeconds=0;}}
  }
  frame=requestAnimationFrame(animate);
  renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();const el=document.getElementById('scene-loading');el.hidden=false;el.textContent='图形上下文已中断，请刷新页面恢复 3D 场景。参数与仿真仍可使用。';});
  return {
    update,select,focus,
    setFilter(type){filter=type;},setLabels(value){showLabels=value;},setPaused(value){paused=value;},setAuto(value){controls.userDataAutoRotate=value;},setQuality(value){rendering.setQuality(value);},
    view(type){focus(false);moveCamera(type==='top'?new THREE.Vector3(0,overviewDistance,.1):overviewDirection.clone().multiplyScalar(overviewDistance),new THREE.Vector3(0,-1,0));},
    zoom(factor){transition=null;const direction=camera.position.clone().sub(controls.target);direction.setLength(THREE.MathUtils.clamp(direction.length()/factor,8,180));camera.position.copy(controls.target).add(direction);controls.update();},
    dispose(){disposed=true;cancelAnimationFrame(frame);observer.disconnect();controls.dispose();environment.dispose();rendering.dispose();details.dispose();materials.dispose();const allTextures=new Set();scene.traverse(obj=>{if(obj.geometry)originalGeometries.add(obj.geometry);if(obj.material){for(const m of Array.isArray(obj.material)?obj.material:[obj.material]){for(const v of Object.values(m))if(v?.isTexture)allTextures.add(v);m.dispose();}}});originalGeometries.forEach(g=>g.dispose());allTextures.forEach(t=>t.dispose());renderer.dispose();}
  };
}
