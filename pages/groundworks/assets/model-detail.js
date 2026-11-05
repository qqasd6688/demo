import * as THREE from './vendor/three/build/three.module.min.js';

// Small manufactured parts and construction layers, all at the same miniature scale.
export function enrichSite(api) {
  const {scene,staticRoot:S,M,box,beam,cylinder,group,material,plaque,random,geometries,textures,machines,turret,boom,stick,bucket,bed,jib,trolley,hook,drum,loaderArm,scoop,cabin,workers,groundY}=api;
  const {excavator,truck,mixer,loader,crane}=machines;
  const chrome=material('#c3ccd0',{metalness:.92,roughness:.2});
  const brushed=material('#9ba5a0',{metalness:.65,roughness:.39});
  const brick=[M.red,material('#a96b4e'),material('#b87859'),material('#965c45')];
  const mortar=material('#a69b83'),plank=material('#a17c4c',{roughness:.9});
  const whiteReflector=material('#e6e9bd',{roughness:.4});
  const rubber=material('#172222',{roughness:.95});
  function tube(parent,mat,points,r=.035){
    const curve=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)));
    const geo=new THREE.TubeGeometry(curve,Math.max(10,points.length*5),r,6,false);geometries.add(geo);
    const mesh=new THREE.Mesh(geo,mat);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;
  }
  function rim(parent,x,y,z,r,thickness=.035,mat=chrome){
    const geo=new THREE.TorusGeometry(r,thickness,5,20);geometries.add(geo);
    const mesh=new THREE.Mesh(geo,mat);mesh.position.set(x,y,z);mesh.castShadow=true;parent.add(mesh);return mesh;
  }
  function bolt(parent,x,y,z,size=.055){box(parent,brushed,x,y,z,size,size,size*.6);}
  function ladder(parent,x,y,z,h,w=.42){
    for(const dx of[-w/2,w/2])box(parent,brushed,x+dx,y+h/2,z,.045,h,.045);
    for(let yy=.1;yy<h;yy+=.28)box(parent,brushed,x,y+yy,z,w,.035,.06);
  }
  function hazard(parent,x,y,z,w,h){
    box(parent,M.yellow,x,y,z,w,h,.025);
    const count=Math.max(3,Math.floor(w/.17));
    for(let i=0;i<count;i++)box(parent,M.dark,x-w/2+.06+i*w/count,y,z+.02,w/count*.42,h*.9,.015,-.28);
  }
  function handrail(parent,points){tube(parent,M.yellow,points,.028);}

  // Motor bodies, access panels, maintenance grilles and exposed track chains.
  const turntable=cylinder(excavator,M.dark,0,.72,0,.77,.77,.12,24);
  for(const side of[-1,1]){
    for(let i=0;i<15;i++){
      box(excavator,brushed,-1.5+i*.215,.38,side*1.19,.15,.11,.045);
      bolt(excavator,-1.5+i*.215,.38,side*1.22,.04);
    }
    for(const end of[-1,1])for(let i=0;i<7;i++){
      const a=(i/6-.5)*Math.PI;
      const shoe=box(excavator,M.dark,end*(1.27+Math.cos(a)*.28),.34+Math.sin(a)*.27,side*.88,.1,.1,.58);
      shoe.rotation.z=end*a;
    }
    box(turret,M.yellow,-1.25,.76,side*.78,.5,.045,.24);
    bolt(turret,-1.43,.8,side*.8);bolt(turret,-1.08,.8,side*.8);
  }
  // Cabin mullions are distinct from the transparent glazing, with a seated operator.
  for(const x of[-1.02,.12])box(turret,M.dark,x,1.08,-.985,.055,.82,.045);
  for(const y of[.68,1.49])box(turret,M.dark,-.45,y,-.985,1.2,.045,.045);
  box(turret,M.dark,-.52,1.01,-.4,.4,.35,.34);box(turret,M.orange,-.43,1.18,-.55,.22,.27,.19);
  box(turret,M.yellow,-.4,1.38,-.55,.24,.12,.25);box(turret,M.pale,-.4,1.29,-.55,.16,.15,.17);
  box(turret,chrome,.05,.95,-1.02,.04,.2,.03);
  beam(turret,M.dark,[-.2,.75,-1.03],[-.45,1.37,-1.03],.02);
  box(turret,M.dark,-.65,1.6,-.52,.4,.06,.35);box(turret,M.glass,-.65,1.64,-.52,.29,.015,.25);
  tube(turret,M.dark,[[-1,.8,.65],[-1,1.25,.65],[-1.1,1.4,.65]],.06);
  for(let i=0;i<9;i++)box(turret,M.dark,-1.46,.5,-.65+i*.15,.025,.36,.07);
  ladder(turret,-.65,-.28,1.01,.85,.5);
  handrail(turret,[[-1.3,.85,.9],[-1.3,1.23,.9],[-.5,1.23,.9],[-.5,.86,.9]]);
  plaque(turret,'EX 210',-.5,.43,1.002,1,.23,'#26382f','#e1ad32');
  hazard(turret,-1.25,.34,1.01,.47,.26);
  for(const [part,x]of[[boom,.15],[boom,2.87],[stick,.12],[stick,2.14]]){
    const pin=cylinder(part,chrome,x,0,0,.14,.14,.57,12);pin.rotation.x=Math.PI/2;
    for(const side of[-1,1])bolt(part,x,0,side*.31,.09);
  }
  tube(boom,rubber,[[.15,.29,-.2],[.5,.4,-.2],[2,.38,-.2],[2.7,.18,-.2]],.026);
  tube(stick,rubber,[[.02,.25,-.15],[.45,.3,-.15],[1.8,.2,-.15],[2,.09,-.15]],.023);
  plaque(boom,'GROUNDWORKS',1.5,.015,.24,1.75,.19,'#31392f','#dda12b');
  for(let i=0;i<4;i++){
    beam(bucket,brushed,[-.22,-.2,-.35+i*.23],[.08,-.21,-.35+i*.23],.09,.13);
    box(bucket,brushed,.35,-.22,-.35+i*.23,.7,.035,.07);
  }
  for(const side of[-1,1])for(let i=0;i<4;i++)bolt(bucket,.06+i*.18,.12,side*.49,.045);

  // Hydraulic cylinders connect their true attachment points as the arms articulate.
  const hydraulics=[];
  function hydraulic(parent,anchorParent,a,rodParent,b,r=.07){
    const barrel=cylinder(parent,M.gold,0,0,0,r,r,1,12),rod=cylinder(parent,chrome,0,0,0,r*.56,r*.56,1,12);
    hydraulics.push({parent,anchorParent,rodParent,a:new THREE.Vector3(...a),b:new THREE.Vector3(...b),barrel,rod});
  }
  hydraulic(turret,turret,[.12,.6,.52],boom,[1.62,.24,.52],.085);
  hydraulic(boom,boom,[1.18,.25,0],stick,[.64,.2,0],.068);
  hydraulic(stick,stick,[.9,.2,0],bucket,[.3,.35,0],.055);
  hydraulic(truck,truck,[-.1,.7,0],bed,[1.7,.02,0],.095);
  for(const z of[-.53,.53])hydraulic(loader,loader,[.2,.75,z],loaderArm,[1.25,.08,z],.07);

  // Commercial chassis: axles, dual mudguards, fuel tanks, mirrors and warning labels.
  function cabDetails(vehicle,cabX,label){
    for(const z of[-.87,.87]){
      box(vehicle,M.dark,cabX,2.2,z,1.42,.06,.055);
      box(vehicle,M.dark,cabX+.5,1.87,z,.055,.63,.04);
      box(vehicle,M.dark,cabX-.55,1.87,z,.045,.62,.04);
      box(vehicle,chrome,cabX-.36,1.34,z*1.01,.23,.035,.04);
      box(vehicle,brushed,cabX-.08,.68,z*1.07,.8,.1,.28);
      for(let i=0;i<6;i++)box(vehicle,M.dark,cabX-.4+i*.13,.74,z*1.07,.045,.012,.22);
      beam(vehicle,M.dark,[cabX+.45,2,z],[cabX+.6,1.95,z*1.27],.035);
      box(vehicle,M.dark,cabX+.62,1.85,z*1.26,.18,.29,.09);
      box(vehicle,chrome,cabX+.64,1.85,z*1.32,.13,.23,.02);
      box(vehicle,M.dark,cabX,.85,z,.95,.17,.15);
      box(vehicle,brushed,-.25,.76,z,.73,.48,.3);
      for(const dx of[-.25,.25])box(vehicle,M.dark,-.25+dx,.76,z*1.04,.045,.5,.33);
      plaque(vehicle,label,cabX,1.43,z*1.01,.72,.15,'#eeead9','#3d514b');
    }
    for(let i=0;i<5;i++)box(vehicle,M.dark,cabX+.785,1.35+i*.055,0,.02,.022,.64);
    for(const z of[-.38,.38])beam(vehicle,M.dark,[cabX+.72,1.6,z],[cabX+.72,1.96,z-.12],.02);
    box(vehicle,M.navy,cabX-.05,1.63,0,.58,.62,.8);
    box(vehicle,M.orange,cabX+.07,1.81,.37,.2,.28,.2);box(vehicle,M.yellow,cabX+.08,2.01,.37,.24,.1,.24);
    for(const x of[-1.6,-.6,cabX]){const axle=cylinder(vehicle,M.dark,x,.47,0,.11,.11,1.9,8);axle.rotation.x=Math.PI/2;}
    for(const z of[-.95,.95]){
      box(vehicle,M.dark,-1.07,.99,z,2.18,.1,.4);box(vehicle,rubber,-2.1,.52,z,.1,.62,.4);
      box(vehicle,M.red,-2.38,.78,z*.68,.055,.19,.28);box(vehicle,M.orange,-2.38,.78,z*.4,.055,.19,.14);
    }
    const plate=plaque(vehicle,'GW 001',cabX+.84,.92,0,.56,.13,'#edf2dd','#26352e');plate.rotation.y=Math.PI/2;
  }
  cabDetails(truck,1.65,'HAUL / 02');cabDetails(mixer,1.8,'MIX / 04');
  for(const side of[-1,1]){
    box(bed,M.gold,1.45,1.24,side*1.03,3.25,.12,.13);
    for(let x=.1;x<3;x+=.38){bolt(bed,x,.15,side*1.05,.05);bolt(bed,x,1.11,side*1.05,.05);}
    box(bed,whiteReflector,1.4,.23,side*1.07,.36,.08,.02);
    hazard(bed,2.59,.65,side*1.08,.46,.25);
  }
  const coverRoll=cylinder(bed,M.dark,2.88,1.34,0,.15,.15,2,12);coverRoll.rotation.x=Math.PI/2;
  tube(truck,rubber,[[-1.8,.63,-.5],[-1.5,.87,-.65],[.7,.78,-.65],[1,1,-.65]],.035);
  // Mixer drum seams, roller cradle, water tank, access platform and discharge hopper.
  for(const x of[-1.05,.8]){const ring=rim(drum,x,0,0,x<0?.88:.75,.036,brushed);ring.rotation.y=Math.PI/2;}
  for(const x of[-1.6,.3])for(const z of[-.62,.62])box(mixer,M.dark,x,1.12,z,.45,.2,.22);
  const waterTank=cylinder(mixer,M.pale,.7,1.6,0,.28,.28,1.5,16);waterTank.rotation.x=Math.PI/2;
  for(const z of[-.85,.85]){ladder(mixer,-2.14,.42,z,1.65,.43);handrail(mixer,[[-2.32,1.8,z],[-2.32,2.37,z],[-1.85,2.37,z]]);}
  const funnel=cylinder(mixer,M.steel,-2.18,2.05,0,.52,.18,.65,8);
  box(mixer,M.dark,-2.2,1.65,0,.55,.1,.8);
  for(const z of[-.24,.24])box(mixer,brushed,-2.65,.96,z,1.3,.2,.04,.28);
  tube(mixer,rubber,[[.7,1.4,-.8],[.7,.9,-.95],[-1,.85,-1],[-2,1.5,-.9]],.035);
  // Loader engine guard, cabin interior, bucket wear plates and grab handles.
  for(const side of[-1,1]){
    box(loader,M.yellow,-1,1.13,side*.94,1.2,.11,.47);
    box(loader,M.yellow,.85,1.13,side*.94,1.05,.11,.47);
    for(const x of[-.91,.22])box(loader,M.dark,x,1.64,side*.7,.045,.9,.035);
    ladder(loader,-.35,.2,side*.85,.65,.42);
    handrail(loader,[[-.87,1.1,side*.79],[-.87,1.6,side*.79],[-.65,1.6,side*.79]]);
  }
  for(let i=0;i<7;i++)box(loader,M.dark,-1.59,.89+i*.058,0,.035,.025,1.1);
  box(loader,M.dark,-.43,1.39,0,.55,.5,.5);box(loader,M.orange,-.25,1.74,0,.23,.27,.2);box(loader,M.yellow,-.24,1.95,0,.25,.1,.25);
  tube(loader,M.dark,[[-1.1,1.2,.45],[-1.1,1.85,.45],[-1.25,1.98,.45]],.055);
  plaque(loader,'WL 60',-.37,.89,.81,.82,.2,'#30392e','#dba533');
  for(let i=0;i<7;i++)box(scoop,brushed,.87,-.24,-.85+i*.28,.3,.08,.13);
  for(const z of[-.7,0,.7])box(scoop,brushed,.3,-.28,z,.95,.035,.1);
  // Crane cab glazing, service ladder, slewing ring and safety catwalk.
  ladder(crane,0,.5,.61,12.9,.45);
  const slew=cylinder(crane,M.dark,0,13.28,0,.94,.94,.23,24);
  for(const x of[-.85,.85])for(const z of[-.85,.85]){box(crane,M.dark,x,.55,z,.2,.25,.2);bolt(crane,x,.7,z,.11);}
  box(jib,M.glass,.9,-.56,1.17,1.03,.86,.025);
  for(const x of[.32,.9,1.48])box(jib,M.dark,x,-.56,1.2,.035,1,.025);
  box(jib,M.dark,.9,-.99,1.2,1.2,.04,.025);box(jib,M.dark,.9,-.1,1.2,1.2,.04,.025);
  box(jib,M.orange,.95,-.57,.7,.24,.29,.25);box(jib,M.yellow,.97,-.36,.7,.25,.11,.25);
  for(let x=-5;x<10;x+=.7){box(jib,M.steel,x,.16,.64,.6,.045,.42);box(jib,M.yellow,x,.57,.84,.025,.8,.025);}
  box(jib,M.yellow,2.4,.98,.84,15.4,.035,.035);
  for(let i=0;i<3;i++)box(jib,M.concrete,-4.3+i*.48,-.3,0,.45,.85,1.3);
  const winch=cylinder(jib,M.dark,-2,.48,0,.3,.3,.65,12);winch.rotation.x=Math.PI/2;
  for(const z of[-.3,.3]){const pulley=cylinder(trolley,M.gold,0,-.12,z,.2,.2,.08,12);pulley.rotation.x=Math.PI/2;}
  const hookRing=rim(hook,0,-.33,0,.2,.05,M.dark);hookRing.scale.set(.65,1,1);
  hazard(hook,0,-.01,.17,.34,.22);

  // Masonry courses, lintels and exposed reinforcement add believable structural mass.
  function brickWall(origin,columns,rows,axis='x'){
    for(let y=0;y<rows;y++)for(let i=0;i<columns;i++){
      if(y>3&&y<8&&i>2&&i<columns-3)continue;
      const along=i*.42+(y%2)*.2;
      box(S,brick[(i+y)%brick.length],origin[0]+(axis==='x'?along:0),origin[1]+y*.2,origin[2]+(axis==='z'?along:0),axis==='x'?.398:.24,.18,axis==='z'?.398:.24);
    }
  }
  brickWall([-.4,1.79,-.82],10,11);brickWall([4.5,1.79,-.82],9,7);
  brickWall([8.65,1.79,-6.8],12,11,'z');brickWall([8.65,4.55,-6.8],12,8,'z');
  brickWall([-.4,4.55,-7.2],10,9);
  for(const x of[1.5,6.2])box(S,mortar,x,1.62,-.82,4,.1,.45);
  for(let level=0;level<3;level++)for(const x of[-.6,4,8.6])for(const z of[-7.2,-4,-.8]){
    if(level===2)for(const dx of[-.125,.125])for(const dz of[-.125,.125])box(S,M.rust,x+dx,10.25,z+dz,.038,.95,.038);
    for(let y=2.2+level*2.75;y<3.9+level*2.75;y+=.48){
      box(S,material('#aaa89b'),x,y,z+.207,.4,.018,.015);
      bolt(S,x+.11,y-.05,z+.22,.035);
    }
  }
  // Open roof formwork with densely crossed rebar; only the unfinished half is exposed.
  for(let x=4.3;x<9;x+=.24)box(S,M.rust,x,10.2,-4,.025,.025,6.6);
  for(let z=-7.2;z<-.6;z+=.24)box(S,M.rust,6.5,10.23,z,4.5,.025,.025);
  for(const z of[-7.5,-.55])box(S,plank,6.55,9.95,z,4.7,.38,.11);
  box(S,plank,9,9.95,-4,.1,.4,6.9);
  for(let x=4.4;x<9;x+=.6)box(S,plank,x,9.65,-4,.08,.15,6.9);
  // Scaffolding toe boards, clamps and access ladders.
  for(let x=-1.5;x<10;x+=2.25)for(let y=2.1;y<9;y+=2.4){
    box(S,plank,x+.9,y+.18,1.25,2.1,.24,.055);
    for(const z of[.3,1.25]){box(S,chrome,x,y,z,.13,.13,.13);box(S,chrome,x,y+1.1,z,.12,.1,.12);}
    for(let z=.25;z<1.2;z+=.23)box(S,material('#947a55'),x+.9,y+.06,z,2.1,.015,.015);
  }
  const access=group(scene,-1.45,1.35,1.38);access.rotation.z=-.15;ladder(access,0,0,0,7,.55);
  const netCanvas=document.createElement('canvas');netCanvas.width=netCanvas.height=64;const nctx=netCanvas.getContext('2d');
  nctx.fillStyle='#436e6540';nctx.fillRect(0,0,64,64);nctx.strokeStyle='#59746ce0';nctx.lineWidth=1;
  for(let i=0;i<64;i+=8){nctx.beginPath();nctx.moveTo(i,0);nctx.lineTo(i,64);nctx.moveTo(0,i);nctx.lineTo(64,i);nctx.stroke();}
  const netMap=new THREE.CanvasTexture(netCanvas);netMap.wrapS=netMap.wrapT=THREE.RepeatWrapping;netMap.repeat.set(12,5);textures.add(netMap);
  const netMat=material('#7a9d82',{map:netMap,transparent:true,opacity:.5,side:THREE.DoubleSide,depthWrite:false,roughness:1});
  const netGeo=new THREE.PlaneGeometry(6.4,2);geometries.add(netGeo);const net=new THREE.Mesh(netGeo,netMat);net.position.set(2,6,1.32);scene.add(net);
  plaque(scene,'HARD HAT AREA',2.1,3.1,1.4,1.65,.44,'#283b36','#e3ca75');
  // Stepped pit: darker seams, retaining timbers, spoil, a sump, and temporary access.
  for(let z=-5;z<3.8;z+=.72){
    box(S,plank,-12.98,1,z,.14,.61,.66);box(S,M.dark,-12.85,1.05,z,.08,.74,.07);
    box(S,plank,-3.03,1,z,.14,.61,.66);
  }
  for(let x=-12.8;x<-3;x+=.7)box(S,M.darkSoil,x,.85,-5.9,.65,.15,.12);
  for(let i=0;i<150;i++){
    const x=-12.3+random()*8.6,z=-5.1+random()*7.2;
    if(Math.abs(x+7.2)<2&&Math.abs(z)<1.5)continue;
    box(S,i%3?M.darkSoil:M.soil,x,.68+random()*.035,z,.08+random()*.15,.045+random()*.06,.08+random()*.15);
  }
  for(let i=0;i<13;i++)box(S,plank,-11.3,.7+i*.043,2.1+i*.15,1.1,.05,.14);
  for(const x of[-11.9,-10.7])beam(S,M.dark,[x,.7,2],[x,1.45,4],.035);
  tube(scene,rubber,[[-12,.74,-4],[-12,.74,-2],[-13.4,1.3,0],[-15,1.32,2]],.055);
  // A receiving pile beneath the dump truck's rear grows as soil is unloaded.
  const receivingPile=group(scene,-4.15,groundY,8.6);
  for(let i=0;i<100;i++){
    const a=random()*Math.PI*2,r=Math.sqrt(random())*1.3;
    box(receivingPile,i%3?M.soil:M.darkSoil,Math.round(Math.cos(a)*r/.2)*.2,.16+(1-r/1.4)*.8,Math.round(Math.sin(a)*r/.2)*.2,.22,.22,.22);
  }
  // Small water / aggregates plant and stacked hollow steel pipes.
  for(let i=0;i<6;i++){
    const pipe=cylinder(scene,M.steel,15.6+(i%3)*.38,1.65+Math.floor(i/3)*.38,-3.4,.17,.17,3,12);pipe.rotation.x=Math.PI/2;
    const opening=cylinder(scene,M.black,pipe.position.x,pipe.position.y,-1.88,.125,.125,.02,12);opening.rotation.x=Math.PI/2;
  }
  for(const x of[14.5,15.4]){
    cylinder(scene,M.navy,x,1.8,5.5,.32,.32,1.1,12);
    for(const y of[1.4,2.1]){const ring=rim(scene,x,y,5.5,.32,.025,brushed);ring.rotation.x=Math.PI/2;}
  }
  for(let i=0;i<9;i++)box(S,plank,-.8+i*.26,1.48,-10.5,.21,.12,2.2);
  for(let i=0;i<6;i++)box(S,M.pale,-.7+(i%3)*.6,1.85+Math.floor(i/3)*.34,-10.5,.57,.31,.8);
  // Office details: roof seams, drainage, a notice board and striped entrance canopy.
  for(let x=-3.4;x<3.6;x+=.28)box(cabin,brushed,x,2.5,0,.025,.035,3.35);
  tube(cabin,brushed,[[3.45,2.3,1.6],[3.45,.1,1.6],[3.7,.1,1.6]],.045);
  box(cabin,M.gold,-2.2,2.15,2.03,1.7,.08,.7,-.08);
  plaque(cabin,'SAFETY FIRST',2.6,.72,1.79,1,.46,'#e9e2cb','#3c645d');
  for(let i=0;i<6;i++)box(cabin,M.dark,3.75,1+i*.07,-.4,.015,.026,.7);
  box(cabin,M.red,-3.7,.52,1.3,.27,.65,.27);box(cabin,M.dark,-3.7,.91,1.3,.12,.13,.11);

  // Workwear details stay readable close up without abandoning the voxel silhouette.
  for(const {g,arms} of workers){
    for(const z of[-.151,.151]){
      box(g,whiteReflector,0,.69,z,.44,.055,.015);
      for(const x of[-.14,.14])box(g,whiteReflector,x,.82,z,.035,.27,.015);
    }
    box(g,M.dark,0,.5,.13,.33,.07,.04);
    for(const x of[-.13,.13])box(g,plank,x,.49,.18,.11,.14,.07);
    box(g,M.gold,0,1.33,0,.06,.04,.29);
    for(const x of[-.06,.06])box(g,M.dark,x,1.12,.126,.032,.025,.01);
    box(g,M.pale,.045,1.05,.15,.06,.065,.035);
    arms.forEach(a=>box(a,whiteReflector,0,-.13,.08,.14,.045,.015));
  }
  // Grounded contact shadows complement the screen-space pass at long distances.
  const shadowCanvas=document.createElement('canvas');shadowCanvas.width=shadowCanvas.height=128;const sctx=shadowCanvas.getContext('2d');
  const gradient=sctx.createRadialGradient(64,64,12,64,64,62);gradient.addColorStop(0,'rgba(20,15,9,.45)');gradient.addColorStop(.5,'rgba(20,15,9,.24)');gradient.addColorStop(1,'rgba(20,15,9,0)');sctx.fillStyle=gradient;sctx.fillRect(0,0,128,128);
  const shadowMap=new THREE.CanvasTexture(shadowCanvas);textures.add(shadowMap);
  const shadowMat=new THREE.MeshBasicMaterial({map:shadowMap,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1});
  const shadowGeo=new THREE.PlaneGeometry(1,1);geometries.add(shadowGeo);const contacts=[];
  for(const [model,w,h]of[[excavator,4,3],[truck,6,3],[mixer,6.5,3],[loader,4.8,3]]){
    const shadow=new THREE.Mesh(shadowGeo,shadowMat);shadow.rotation.x=-Math.PI/2;shadow.scale.set(w,h,1);scene.add(shadow);contacts.push({model,shadow});
  }
  // Tiny welding sparks, warm practical glows and an aerial obstruction beacon.
  const sparksGeo=new THREE.BufferGeometry(),sparkPositions=new Float32Array(28*3);sparksGeo.setAttribute('position',new THREE.BufferAttribute(sparkPositions,3));geometries.add(sparksGeo);
  const sparkMat=new THREE.PointsMaterial({color:'#bde9ff',size:.065,sizeAttenuation:true,transparent:true,opacity:.9,depthWrite:false,blending:THREE.AdditiveBlending});
  const sparks=new THREE.Points(sparksGeo,sparkMat);sparks.frustumCulled=false;scene.add(sparks);
  const glowMapCanvas=document.createElement('canvas');glowMapCanvas.width=glowMapCanvas.height=64;const gctx=glowMapCanvas.getContext('2d'),gg=gctx.createRadialGradient(32,32,0,32,32,32);gg.addColorStop(0,'#fff9d4');gg.addColorStop(.16,'#ffdf9688');gg.addColorStop(1,'#ffbc6800');gctx.fillStyle=gg;gctx.fillRect(0,0,64,64);
  const glowMap=new THREE.CanvasTexture(glowMapCanvas);textures.add(glowMap);
  const glowMat=new THREE.SpriteMaterial({map:glowMap,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,opacity:0});
  for(const [x,z]of[[-15,10],[14,10],[12,-10],[-3,-11]]){const glow=new THREE.Sprite(glowMat);glow.position.set(x,5.72,z);glow.scale.set(1.3,1.3,1);scene.add(glow);}
  const beaconMat=new THREE.MeshStandardMaterial({color:'#e94e24',emissive:'#ff4012',emissiveIntensity:3});const beacon=cylinder(jib,beaconMat,0,3.23,0,.09,.09,.16,8);
  const aWorld=new THREE.Vector3(),bWorld=new THREE.Vector3(),delta=new THREE.Vector3(),yAxis=new THREE.Vector3(0,1,0);
  let fill=.25;
  function align(part,a,b){delta.copy(b).sub(a);part.position.copy(a).add(b).multiplyScalar(.5);part.quaternion.setFromUnitVectors(yAxis,delta.clone().normalize());part.scale.y=delta.length();}
  return {
    articulated:hydraulics.flatMap(h=>[h.barrel,h.rod]),
    update({t,wet,hour,storm,dt,truckPhase}){
      scene.updateMatrixWorld(true);
      for(const h of hydraulics){
        aWorld.copy(h.a);bWorld.copy(h.b);h.anchorParent.localToWorld(aWorld);h.rodParent.localToWorld(bWorld);h.parent.worldToLocal(aWorld);h.parent.worldToLocal(bWorld);
        const join=aWorld.clone().lerp(bWorld,.57);align(h.barrel,aWorld,join);align(h.rod,join,bWorld);
      }
      for(const {model,shadow}of contacts){shadow.position.set(model.position.x,model.position.y+.018,model.position.z);shadow.rotation.z=-model.rotation.y;}
      fill=THREE.MathUtils.clamp(fill+(truckPhase>32&&truckPhase<34.5?.24:-.012)*dt,.2,1);receivingPile.scale.y=fill;
      sparks.visible=!storm&&Math.sin(t*21)>.4;
      for(let i=0;i<28;i++){const life=(t*2.8+i/28)%1,a=i*2.399;sparkPositions[i*3]=4.3+Math.cos(a)*life*.55;sparkPositions[i*3+1]=5.2+life*.5-life*life*1.4;sparkPositions[i*3+2]=-.6+Math.sin(a)*life*.55;}sparksGeo.attributes.position.needsUpdate=true;
      glowMat.opacity=(hour<6||hour>19?.66:storm?.28:0);beaconMat.emissiveIntensity=Math.sin(t*3)>0?3:.4;
      netMat.opacity=.43+wet*.12;
    },
    dispose(){shadowMat.dispose();sparkMat.dispose();glowMat.dispose();beaconMat.dispose();}
  };
}
