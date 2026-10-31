import * as THREE from './vendor/three/build/three.module.min.js';
import { mergeGeometries } from './vendor/three/examples/jsm/utils/BufferGeometryUtils.js';

export function addIndustrialDetails({groups,base,box,cylinder,sphere,pipe,ring,materials,lettering,colors}){
  const {metal,pale,dark,trim,black,copper,rubber,safety,glass,emissive}=materials;
  const amber=emissive('#e7bb55',.5),red=new THREE.MeshStandardMaterial({color:'#bc5b42',metalness:.4,roughness:.42}),cyan=emissive('#5ddbd8',2.2);
  const gaugeNeedles=[],indicators=[],decals=[];
  const gaugeCanvas=document.createElement('canvas');gaugeCanvas.width=gaugeCanvas.height=256;
  const ctx=gaugeCanvas.getContext('2d');ctx.fillStyle='#d0ddd6';ctx.fillRect(0,0,256,256);ctx.strokeStyle='#1c3b43';
  for(let i=0;i<=28;i++){const angle=(-220+i*260/28)*Math.PI/180;ctx.lineWidth=i%7===0?4:2;ctx.beginPath();ctx.moveTo(128+Math.cos(angle)*(i%7===0?78:88),128+Math.sin(angle)*(i%7===0?78:88));ctx.lineTo(128+Math.cos(angle)*102,128+Math.sin(angle)*102);ctx.stroke();}
  ctx.fillStyle='#2e4e56';ctx.font='18px sans-serif';ctx.textAlign='center';ctx.fillText('LOAD %',128,175);ctx.font='14px sans-serif';ctx.fillText('NEXUS',128,200);
  const gaugeTexture=new THREE.CanvasTexture(gaugeCanvas);gaugeTexture.colorSpace=THREE.SRGBColorSpace;
  const gaugeMaterial=new THREE.MeshStandardMaterial({map:gaugeTexture,roughness:.5,metalness:.1});
  const pressureCanvas=document.createElement('canvas');pressureCanvas.width=pressureCanvas.height=256;const pressureContext=pressureCanvas.getContext('2d');pressureContext.drawImage(gaugeCanvas,0,0);pressureContext.fillStyle='#d0ddd6';pressureContext.fillRect(70,152,116,29);pressureContext.fillStyle='#2e4e56';pressureContext.font='18px sans-serif';pressureContext.textAlign='center';pressureContext.fillText('MPa',128,175);const pressureTexture=new THREE.CanvasTexture(pressureCanvas);pressureTexture.colorSpace=THREE.SRGBColorSpace;const pressureMaterial=new THREE.MeshStandardMaterial({map:pressureTexture,roughness:.5,metalness:.1});
  function bolt(g,x,y,z,r=.045){cylinder(g,r,r,.055,x,y,z,metal,6);}
  function flange(parent,x,y,z,r=.2,axis='y',count=8){
    const g=new THREE.Group();g.position.set(x,y,z);if(axis==='x')g.rotation.z=Math.PI/2;if(axis==='z')g.rotation.x=Math.PI/2;parent.add(g);
    cylinder(g,r,r,.085,0,-.06,0,metal,32);cylinder(g,r*.98,r*.98,.03,0,0,0,rubber,32);cylinder(g,r,r,.085,0,.06,0,metal,32);
    for(let j=0;j<count;j++){const a=j/count*Math.PI*2;bolt(g,Math.cos(a)*r*.8,.115,Math.sin(a)*r*.8,r*.07);}return g;
  }
  function valve(g,x,y,z,scale=1){
    cylinder(g,.08*scale,.08*scale,.25*scale,x,y,z,metal,16);const wheel=new THREE.Mesh(new THREE.TorusGeometry(.22*scale,.025*scale,8,32),red);wheel.rotation.x=Math.PI/2;wheel.position.set(x,y+.14*scale,z);g.add(wheel);
    for(let j=0;j<3;j++){const arm=box(g,.42*scale,.025*scale,.025*scale,x,y+.14*scale,z,red);arm.rotation.y=j*Math.PI/3;}
  }
  function gauge(g,x,y,z,device){
    cylinder(g,.035,.035,.23,x,y-.16,z,metal,12);const casing=cylinder(g,.16,.16,.1,x,y,z,metal,32);casing.rotation.x=Math.PI/2;
    const face=new THREE.Mesh(new THREE.CircleGeometry(.137,32),device==='tank'?pressureMaterial:gaugeMaterial);face.position.set(x,y,z+.055);g.add(face);
    const needle=new THREE.Group();needle.position.set(x,y,z+.061);needle.userData.dynamic=true;g.add(needle);
    box(needle,.1,.009,.006,.042,0,0,red);sphere(needle,.017,0,0,.003,trim);gaugeNeedles.push({needle,device});
  }
  function plate(g,text,x,y,z,width=1.1,rotation=0){const m=new THREE.Mesh(new THREE.PlaneGeometry(width,width/4),lettering(text,512,128,'#b9d9db'));m.position.set(x,y,z);m.rotation.y=rotation;g.add(m);decals.push(m);}
  function rail(g,x,z,w,d,y=.25,height=.8){
    for(const zz of [z-d/2,z+d/2]){pipe(g,[[x-w/2,y+height,zz],[x+w/2,y+height,zz]],trim,.027);pipe(g,[[x-w/2,y+height*.5,zz],[x+w/2,y+height*.5,zz]],trim,.018);for(let xx=x-w/2;xx<=x+w/2+.01;xx+=w/4)cylinder(g,.025,.025,height,xx,y+height/2,zz,trim,8);}
  }
  function ladder(g,x,z,bottom,height,width=.42){for(const xx of [x-width/2,x+width/2])cylinder(g,.028,.028,height,xx,bottom+height/2,z,trim,8);for(let y=bottom+.12;y<bottom+height;y+=.25)box(g,width,.025,.035,x,y,z,metal);}
  function plinth(g,w,d){
    box(g,w,.14,.12,0,.18,d/2,safety);box(g,w,.14,.12,0,.18,-d/2,safety);
    for(const x of [-w/2+.2,w/2-.2])for(const z of [-d/2+.2,d/2-.2]){box(g,.2,.035,.2,x,.3,z,trim);bolt(g,x,.34,z,.05);}
  }
  function status(g,x,y,z,id){const material=emissive(colors[id==='gas'?'gas':id==='chiller'||id==='absorption'?'cold':'hydrogen'],1);sphere(g,.045,x,y,z,material);indicators.push({id,material});}
  function pressurePipe(g,pts,mat=metal,r=.065){return pipe(g,pts,mat,r);}
  for(const [id,g] of Object.entries(groups)){
    if(id!=='wind'&&id!=='load'&&id!=='solar')plinth(g,id==='tank'?6.6:5.6,id==='tank'?5.3:4.4);
    if(!['solar','load','wind'].includes(id)){plate(g,`${id==='electrolyzer'?'PEM ELECTROLYSIS':id.toUpperCase()}  /  NEXUS`,0,.28,2.41,2.1);}
  }
  // The service deck: individual metal edge panels, recessed drains and junction boxes.
  for(const x of [-20.9,20.9])for(let z=-13;z<14;z+=1.45){box(base,.12,.28,1.34,x,-.58,z,dark,true);bolt(base,x,-.36,z,.04);}
  for(const z of [-14.35,14.35])for(let x=-20;x<20;x+=1.6)box(base,1.45,.3,.12,x,-.55,z,dark,true);
  for(const z of [-5.8,5.9])for(let x=-19;x<20;x+=1.5){box(base,1.2,.035,.24,x,-.028,z,black);for(let i=0;i<6;i++)box(base,.035,.045,.22,x-.5+i*.2,-.006,z,trim);}
  for(const x of [-19,19])for(const z of [-11,-1,9]){box(base,.55,.38,.65,x,.12,z,dark,true);box(base,.47,.025,.57,x,.32,z,trim);}
  // Ground markings and numbers add scale without obscuring the energy corridors.
  for(const [text,x,z] of [['01  GENERATION',-12,-13.1],['02  HYDROGEN',5,-13.1],['03  CONVERSION',-6,13.2],['04  DEMAND',14,13.2]]){const m=new THREE.Mesh(new THREE.PlaneGeometry(5,.53),lettering(text,512,64,'#6d9aaa'));m.rotation.x=-Math.PI/2;m.position.set(x,-.03,z);base.add(m);decals.push(m);}
  // Solar supports, DC combiner, cable conduits and edge fasteners.
  const pv=groups.solar;
  for(const z of [-1.7,0,1.7]){
    pressurePipe(pv,[[-3,.24,z+.5],[3,.24,z+.5]],black,.045);
    for(const x of [-2.5,0,2.5]){const strut=box(pv,.045,.9,.05,x,.55,z+.15,metal);strut.rotation.x=-.6;}
  }
  box(pv,.65,.95,.35,3,.6,2.2,pale,true);box(pv,.49,.43,.025,3,.7,2.39,dark);status(pv,3.15,.8,2.42,'solar');
  pressurePipe(pv,[[-2,.23,2.5],[3,.23,2.5],[3,.8,2.5]],trim,.045);plate(pv,'620 kWp',-.2,.5,2.8,1.2);
  // Turbine service hatch, base bolt circle and nacelle panel lines.
  const wt=groups.wind;flange(wt,0,.27,0,.72,'y',16);box(wt,.25,.6,.04,0,.85,.44,dark,true);box(wt,.04,.1,.05,.08,.85,.48,metal);
  for(let y=1.5;y<6;y+=1.25)ring(wt,.44-(y/6)*.16,0,y,0,trim);plate(wt,'WT 01',0,2,.39,.5);
  box(wt,.018,.6,.71,.3,6.65,0,trim);cylinder(wt,.022,.022,.28,-.5,7.12,0,trim,8);sphere(wt,.05,-.5,7.29,0,red);
  // Busbars, surge arrestors, fenced switchgear and transformer oil conservator.
  const gr=groups.grid;
  const oil=cylinder(gr,.23,.23,2.3,-.55,2.2,-.9,metal,28);oil.rotation.z=Math.PI/2;
  for(const x of [-1.3,-.6,.1])pressurePipe(gr,[[x,2.9,0],[x,3.2,0],[x,3.2,-1.7]],copper,.047);
  rail(gr,0,0,5.4,4.2,.23,.7);plate(gr,'10 kV',1.8,1.9,.79,.6);status(gr,1.8,1.75,.8,'grid');
  // Electrolyzer tie rods, cell-frame bolts, separator and insulated return pipes.
  const el=groups.electrolyzer;
  for(const y of [.55,1.85])for(const z of [-.88,.88]){pressurePipe(el,[[-.6,y,z],[2.3,y,z]],metal,.04);flange(el,-.6,y,z,.12,'x',6);}
  for(let i=0;i<11;i++)for(const y of [.65,1.75]){const screw=cylinder(el,.04,.04,.05,-.35+i*.24,y,.87,trim,6);screw.rotation.x=Math.PI/2;}
  pressurePipe(el,[[.5,2.3,-.8],[.5,2.75,-.8],[2.6,2.75,-.8],[2.6,1.25,-.8]],metal,.07);
  valve(el,2.6,2.3,-.8,.8);gauge(el,2.6,1.8,-.72,'electrolyzer');flange(el,2.6,1.25,-.8,.15,'y');
  box(el,1.2,.14,.025,-1.7,.65,1.29,safety);plate(el,'PEM / EL-01',-1.7,2.05,1.31,.95);status(el,-1.4,2.3,1.31,'electrolyzer');
  // Storage vessels have saddles, longitudinal welds, manifolds, gauges and safety cages.
  const hs=groups.tank;
  for(let i=0;i<4;i++){
    const x=(i-1.5)*1.5;
    for(const y of [1.45,2.35])ring(hs,.545,x,y,0,metal);
    flange(hs,x,3.64,0,.17,'y',8);valve(hs,x,3.92,0,.55);gauge(hs,x,3.57,.25,'tank');
    for(const z of [-.35,.35]){box(hs,.7,.08,.19,x,.26,z,trim);bolt(hs,x-.22,.33,z);bolt(hs,x+.22,.33,z);}
    plate(hs,`H2 / 0${i+1}`,x,1.55,.553,.55);
  }
  pressurePipe(hs,[[-2.7,3.82,-1.15],[2.7,3.82,-1.15],[2.7,.5,-1.15],[2.7,.5,1.5]],metal,.09);
  flange(hs,2.7,.85,-1.15,.18);valve(hs,2.7,1.15,-1.15);rail(hs,0,0,6.7,4.8,.26,.75);
  ladder(hs,-3,-1.5,.3,3.4);box(hs,.65,.07,2.6,-3,3.5,-.2,dark);rail(hs,-3,-.2,.65,2.6,3.55,.5);
  // Fuel-cell doors with hinges, handles, louvered sides and external heat recovery piping.
  const fc=groups.fuelcell;
  for(let i=0;i<5;i++){
    const x=-2+i;box(fc,.055,.25,.07,x+.25,1.45,1.43,trim);for(const y of [.6,1.8])box(fc,.06,.13,.05,x-.4,y,1.42,metal);
    plate(fc,`FC ${String(i+1).padStart(2,'0')}`,x,1.8,1.41,.5);
  }
  pressurePipe(fc,[[-2.7,.6,-.9],[-2.7,1.8,-.9],[-2.7,1.8,.6],[-2.7,.6,.6]],metal,.09);flange(fc,-2.7,1.3,.6,.16);valve(fc,-2.7,1.8,.6,.8);
  status(fc,2.3,1.9,1.44,'fuelcell');
  // Gas station: actual regulator bodies, meter and valve bypass assembly.
  const ng=groups.gas;
  for(const x of [-1,1]){
    flange(ng,x,1.6,-1.4,.2,'x');sphere(ng,.23,x,.7,1.6,metal,1.2,.85,.85);gauge(ng,x,1.65,1.66,'gas');
    flange(ng,x-.35,.7,1.6,.17,'x');flange(ng,x+.35,.7,1.6,.17,'x');
  }
  box(ng,.55,.7,.4,2,1.15,1.6,dark,true);plate(ng,'NG',2,1.25,1.82,.4);rail(ng,0,0,5.5,4.3,.24,.65);
  // CHP heat exchanger fins, bolted generator housing, exhaust lagging and steel walkway.
  const chp=groups.chp;
  flange(chp,2.3,1.4,0,.83,'x',16);
  for(let x=-1.7;x<1;x+=.22)box(chp,.045,.82,.09,x,1.6,1.02,trim);
  for(let i=0;i<6;i++){pressurePipe(chp,[[-1.8+i*.47,2.2,.4],[-1.8+i*.47,2.55,.4],[-1.8+i*.47,2.55,-.8]],metal,.07);}
  pressurePipe(chp,[[-2,3.55,-1.6],[-2,3.85,-1.6],[-1.5,3.85,-1.6]],trim,.27);
  for(let y=.9;y<3.6;y+=.4)ring(chp,.32,-2,y,-1.6,metal);
  box(chp,4.5,.1,.5,-.25,.53,1.8,dark);rail(chp,-.25,1.8,4.5,.5,.58,.65);ladder(chp,-2.6,-1.6,.3,3.5);gauge(chp,1.9,2.1,-.65,'chp');
  // Boiler end-cap bolt rings, two insulated hot-water pipes, valves and stack ladder.
  const gb=groups.boiler;
  flange(gb,-1.76,1.5,0,1.03,'x',20);flange(gb,1.76,1.5,0,1.03,'x',20);
  for(const x of [-.95,.95]){const band=new THREE.Mesh(new THREE.TorusGeometry(1.015,.026,8,48),trim);band.rotation.y=Math.PI/2;band.position.set(x,1.5,0);gb.add(band);}
  for(const z of [.45,1.35]){pressurePipe(gb,[[-.3,2.35,z],[-.3,2.8,z],[1.4,2.8,z],[1.4,.5,z]],metal,.1);flange(gb,1.4,2.1,z,.18);valve(gb,1.4,2.5,z,.8);}
  gauge(gb,.2,2.77,.7,'boiler');ladder(gb,-1.55,-.92,.3,3.6);plate(gb,'GB-01',0,1.65,1.015,1.05);
  // Absorber head bolts and copper interconnects, pump motors and service valves.
  const ac=groups.absorption;
  for(const z of [-.75,.75])for(const x of [-2.24,2.24])flange(ac,x,1.25,z,.62,'x',12);
  for(const z of [-.75,.75]){pressurePipe(ac,[[-2.45,1.25,z],[-2.7,1.25,z],[-2.7,.4,z]],metal,.1);valve(ac,-2.7,.8,z,.75);}
  for(const x of [-1.1,.7]){cylinder(ac,.22,.22,.5,x,.6,1.75,trim);pressurePipe(ac,[[x,.85,1.75],[x,1.6,1.75],[x,1.6,.8]],copper,.045);gauge(ac,x,1.25,1.78,'absorption');}
  plate(ac,'LiBr / H₂O',0,2.05,.815,1.8);
  // Condenser coil fins, compressor cans and screened fan guards.
  const ec=groups.chiller;
  for(const x of [-1.7,0,1.7]){
    cylinder(ec,.34,.34,.65,x,.65,-1.6,dark);pressurePipe(ec,[[x,.95,-1.6],[x,1.2,-1.6],[x,1.2,-1.1]],copper,.045);
    for(const radius of [.22,.4,.57])ring(ec,radius,x,2.29,0,trim);
    for(let angle=0;angle<Math.PI;angle+=Math.PI/4){const bar=box(ec,1.3,.02,.018,x,2.31,0,metal);bar.rotation.y=angle;}
  }
  for(let y=.6;y<1.8;y+=.1)box(ec,5.05,.025,.025,0,y,-1.43,trim);
  plate(ec,'AIR COOLED / EC-01',0,1.88,1.46,2.7);status(ec,2.45,1.8,1.46,'chiller');
  for(const x of [-1.5,0,1.5])for(const radius of [.2,.4,.53])ring(fc,radius,x,2.69,0,trim);
  // Curtain-wall framing, entrance canopy, rooftop equipment and planted terminal court.
  const ld=groups.load;
  for(const [x,z,w,h,d] of [[-1.8,-.3,2.6,4.8,2.8],[1.2,.6,2.5,3.2,2.7],[2.7,-1.2,1.5,2,1.4]]){
    for(let dx=-w/2+.15;dx<w/2;dx+=.48){box(ld,.035,h-.35,.06,x+dx,h/2+.2,z+d/2+.04,trim);box(ld,.035,h-.35,.06,x+dx,h/2+.2,z-d/2-.04,trim);}
    for(let dz=-d/2+.15;dz<d/2;dz+=.5)box(ld,.06,h-.35,.035,x+w/2+.04,h/2+.2,z+dz,trim);
    box(ld,w-.2,.16,.06,x,h+.38,z+d/2-.1,metal);box(ld,w-.2,.16,.06,x,h+.38,z-d/2+.1,metal);
    box(ld,.8,.45,.7,x,h+.52,z,dark,true);for(let n=0;n<5;n++)box(ld,.55,.035,.025,x,h+.45+n*.06,z+.36,trim);
    box(ld,.7,.8,.04,x,.65,z+d/2+.05,glass);box(ld,1.2,.075,.65,x,1.2,z+d/2+.2,metal,true);
  }
  for(const x of [-3.5,3.5]){box(ld,.5,.3,4.5,x,.35,0,dark,true);for(let z=-1.9;z<2;z+=.45)sphere(ld,.23,x,.65,z,new THREE.MeshStandardMaterial({color:'#305b53',roughness:.85}),.8,.75,.8);}
  plate(ld,'N E X U S',-1.8,4.35,1.15,2);
  return {update(s){const level={tank:s.inventory/120,electrolyzer:s.electrolyzer/320,gas:s.gas/1450,chp:s.chpGas/850,boiler:s.boilerGas/600,absorption:s.absorptionHeat/250};for(const item of gaugeNeedles)item.needle.rotation.z=(-220+(level[item.device]||0)*260)*Math.PI/180;const power={solar:s.pv,grid:s.gridImport+s.gridExport,electrolyzer:s.electrolyzer,fuelcell:s.fuelcellElectric,chiller:s.chillerElectric};for(const {id,material} of indicators)material.emissiveIntensity=power[id]>.01?2.5:.08;},dispose(){gaugeTexture.dispose();pressureTexture.dispose();}};
}

// Static geometry is merged per material and per equipment, keeping device picking intact.
// Animated fans, blades and instrument needles retain independent transforms.
export function batchStaticMeshes(root){
  root.updateMatrixWorld(true);const inverse=new THREE.Matrix4().copy(root.matrixWorld).invert();const buckets=new Map();
  function collect(node,dynamic=false){
    dynamic=dynamic||node.userData.dynamic;
    if(node.isMesh&&!dynamic&&!Array.isArray(node.material)&&!node.isInstancedMesh){
      const key=`${node.material.uuid}/${node.castShadow}/${node.receiveShadow}`;
      if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(node);
    }
    for(const child of node.children)collect(child,dynamic);
  }
  collect(root);
  for(const nodes of buckets.values()){
    if(nodes.length<2)continue;
    const geometries=nodes.map(node=>{const geometry=node.geometry.index?node.geometry.toNonIndexed():node.geometry.clone();geometry.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse,node.matrixWorld));for(const key of Object.keys(geometry.attributes))if(!['position','normal','uv'].includes(key))geometry.deleteAttribute(key);return geometry;});
    const geometry=mergeGeometries(geometries,false);geometries.forEach(g=>g.dispose());if(!geometry)continue;
    const mesh=new THREE.Mesh(geometry,nodes[0].material);mesh.castShadow=nodes[0].castShadow;mesh.receiveShadow=nodes[0].receiveShadow;mesh.userData.device=root.userData.device;mesh.name=`batched-${root.userData.device||'deck'}`;root.add(mesh);
    for(const node of nodes)node.removeFromParent();
  }
}
