import * as T from './vendor/three/build/three.module.min.js';
import { geometryKit } from './geometry.js';

export function furnishRoom(room,ctx) {
  const {root,materials:m,resources,layout,register,light,furniture}=ctx;
  const [x0,x1,z0,z1]=room.bounds,w=x1-x0,d=z1-z0,cx=(x0+x1)/2,cz=(z0+z1)/2;
  const space=new T.Group();space.position.set(cx,0,cz);root.add(space);
  const kit=geometryKit(space),{mesh,box,cylinder,sphere,cushion,group,line,lathe,ring}=kit;
  const wood=layout.theme==='walnut'?m.walnut:m.oak,H=layout.height;
  const device=(suffix,g,anchor,extras={})=>register(`${room.id}-${suffix}`,g,[cx+anchor[0],anchor[1],cz+anchor[2]],{space,...extras});
  const counts={};
  const surface=(...names)=>mat=>names.includes(mat.userData.surface)?'surface':null;
  const woodSurface=surface('oak','walnut','paint');
  const chairSurface=mat=>['oak','walnut'].includes(mat.userData.surface)?'frame':mat.userData.surface==='sage'?'surface':null;
  // Capture newly created siblings as one movable unit; nested captures stay independent.
  function begin(key,name,kind,roles) {
    const before=new Set(space.children);
    return ()=>furniture.register(`${room.id}-${key}`,name,kind,room.id,space.children.filter(child=>!before.has(child)),roles);
  }
  function repeated(key,name,kind,roles) {const n=counts[key]=(counts[key]||0)+1;return begin(`${key}-${n}`,`${name} ${String(n).padStart(2,'0')}`,kind,roles);}
  const bulb=()=>new T.MeshStandardMaterial({color:'#eee4d0',emissive:'#ffdca9',emissiveIntensity:0,roughness:.45});
  const lighting=(suffix,g,pos,emissions,power=28,distance=5,spot=false)=>light(`${room.id}-${suffix}`,g,space,pos,emissions,power,distance,spot);
  function rug(x,z,rw,rd){const end=repeated('rug','编织地毯','rug',surface('rug'));box(rw,.025,rd,x,.036,z,m.rug,space,.025);for(let k=0;k<2;k++){box(rw-.1-k*.06,.004,.007,x,.052,z-rd/2+.05+k*.03,m.linen);box(rw-.1-k*.06,.004,.007,x,.052,z+rd/2-.05-k*.03,m.linen);}end();}
  function cup(x,y,z){lathe([[.032,0],[.052,.01],[.054,.082],[.049,.088],[.044,.08],[.04,.02]],x,y,z,m.ceramic);cylinder(.042,.042,.002,x,y+.075,z,m.earth);const handle=ring(.027,.007,x+.059,y+.05,z,m.ceramic);handle.scale.y=1.15;cylinder(.078,.074,.008,x,y-.003,z,m.ceramic);}
  function books(x,y,z,count=3){for(let i=0;i<count;i++){const b=box(.24+i*.012,.035,.31,x+i*.005,y+i*.038,z,[m.sage,m.linen,m.rust][i%3],space,.004);b.rotation.y=i*.08;}}
  function plant(x,z,height=1.1){const end=repeated('plant','绿植花器','ceramic',surface('ceramic'));lathe([[.14,0],[.17,.025],[.21,.31],[.2,.34],[.18,.34],[.165,.04]],x,0,z,m.ceramic);cylinder(.177,.177,.01,x,.31,z,m.earth);for(let i=0;i<15;i++){const a=i*2.4,h=.42+height*(.23+(i%7)/12),lx=x+Math.sin(a)*.18,lz=z+Math.cos(a)*.18;line([[x,.3,z],[lx,h*.8,lz],[lx,h,lz]],.004,m.earth);const geo=new T.PlaneGeometry(1,1,10,20),p=geo.attributes.position;for(let j=0;j<p.count;j++){const u=p.getX(j)*2,v=p.getY(j)+.5,t=Math.sin(v*Math.PI);p.setXYZ(j,u*t*.115,v*.4,Math.sin(v*Math.PI)*.08-Math.abs(u)*t*.025);}geo.computeVertexNormals();const leaf=mesh(geo,m.leaf,lx,h,lz);leaf.rotation.set(.6+(i%3)*.2,a,.15);line([[lx,h,lz],[lx+Math.sin(a)*.03,h+.17,lz+Math.cos(a)*.12]],.002,m.sage);}end();}
  function vase(x,y,z){lathe([[.07,0],[.12,.04],[.13,.14],[.07,.26],[.062,.31],[.05,.31],[.05,.27]],x,y,z,m.stone);for(let i=0;i<5;i++){const a=i*2.4;line([[x,y+.25,z],[x+Math.sin(a)*.09,y+.6,z+Math.cos(a)*.08],[x+Math.sin(a)*.16,y+.72,z]],.003,m.earth);sphere(.04,.16,.035,x+Math.sin(a)*.15,y+.63,z,m.sage);}}
  function art(x,y,z,rw,rh,angle=0){const g=group(x,y,z,angle);box(rw,rh,.035,0,0,0,wood,g,.006);const canvas=document.createElement('canvas');canvas.width=768;canvas.height=512;const c=canvas.getContext('2d');c.fillStyle='#ddd5c4';c.fillRect(0,0,768,512);c.fillStyle='#5b6758';c.beginPath();c.ellipse(300,320,190,170,-.3,0,7);c.fill();c.fillStyle='#9e7858';c.beginPath();c.ellipse(545,160,100,72,.2,0,7);c.fill();c.strokeStyle='#f1e6cd';c.lineWidth=5;for(let i=0;i<5;i++){c.beginPath();c.moveTo(270+i*45,512);c.bezierCurveTo(235+i*50,350,330+i*30,340,320+i*35,225);c.stroke();}const t=new T.CanvasTexture(canvas);t.colorSpace=T.SRGBColorSpace;const material=new T.MeshStandardMaterial({map:t,roughness:.96});material.userData.ownedMap=true;mesh(new T.PlaneGeometry(rw-.07,rh-.07),material,0,0,.025,g);}
  function chair(x,z,angle=0){const end=repeated('chair','曲木餐椅','chair',chairSurface);const g=group(x,0,z,angle);cushion(.51,.14,.49,0,.48,0,m.sage,g);const back=new T.CylinderGeometry(.28,.29,.34,40,1,true,-1.18,2.36);back.rotateY(Math.PI);const bm=wood.clone();bm.side=T.DoubleSide;mesh(back,bm,0,.82,-.01,g);line([[-.25,.62,-.13],[-.28,.83,-.1],[0,.99,-.28],[.28,.83,-.1],[.25,.62,-.13]],.023,wood,g);for(const x of [-.18,.18])for(const z of [-.18,.18]){const l=cylinder(.021,.012,.44,x,.23,z,wood,g,12);l.rotation.z=-Math.sign(x)*.1;}end();return g;}
  function lounge(x,z,angle=0){const end=repeated('lounge','弧木休闲椅','chair',()=>null);const g=group(x,.02,z,angle),clone=resources.chair.clone(true);clone.traverse(o=>{if(o.isMesh){o.geometry=o.geometry.clone();o.material=o.material.clone();o.userData.editRole=o.material.name.includes('legs')?'frame':'surface';o.castShadow=o.receiveShadow=true;}});g.add(clone);end();return g;}
  function tableLamp(suffix,x,y,z){const g=group(x,y,z);cylinder(.14,.15,.025,0,.015,0,m.brass,g);cylinder(.015,.018,.28,0,.15,0,m.brass,g);const shade=lathe([[.2,0],[.21,.025],[.13,.2],[.04,.22]],0,.27,0,bulb(),g);lighting(suffix,g,[x,y+.36,z],[shade],7,2.7);}
  function pendant(suffix,x,z,kind='ring') {const end=begin(`fixture-${suffix}`,'吊灯 · 灯体饰面','metal',surface('brass'));const g=group(x,0,z),emissions=[];if(kind==='ring'){const band=ring(.54,.018,0,H-.4,0,m.brass,g);band.rotation.x=Math.PI/2;band.scale.x=1.55;const luminous=ring(.54,.012,0,H-.425,0,bulb(),g);luminous.rotation.x=Math.PI/2;luminous.scale.x=1.55;emissions.push(luminous);for(const xx of [-.62,.62])line([[xx,H-.4,0],[xx*.3,H-.05,0]],.004,m.black,g);}else if(kind==='dining'){box(1.1,.025,.035,0,H-.45,0,m.brass,g);for(let i=-1;i<=1;i++){const b=sphere(.23,.27,.23,i*.4,H-.54,0,bulb(),g);emissions.push(b);line([[i*.4,H-.41,0],[i*.4,H-.08,0]],.004,m.black,g);}}else{const b=cylinder(.28,.28,.045,0,H-.12,0,bulb(),g);emissions.push(b);cylinder(.29,.29,.02,0,H-.09,0,m.brass,g);}lighting(suffix,g,[x,H-(kind==='disc'?.2:.55),z],emissions,kind==='ring'?38:28,Math.max(w,d)+1,true);end();}
  function air(suffix,x,z,angle=0){const g=group(x,H-.65,z,angle);box(1.04,.31,.22,0,0,0,m.ceramic,g,.05);box(.87,.035,.015,0,-.09,.12,m.black,g,.005);for(let i=0;i<17;i++)box(.018,.035,.006,-.35+i*.044,-.09,.131,m.steel,g,.001);const led=box(.055,.018,.005,.34,.03,.12,bulb(),g,.002);const breeze=group(0,0,0,0,g),bm=new T.MeshBasicMaterial({color:'#bad1d1',transparent:true,opacity:.17});for(let i=-1;i<=1;i++)line([[i*.25,-.15,.12],[i*.25,-.45,.22],[i*.25,-.65,.38]],.007,bm,breeze);device(suffix,g,[x,H-.3,z],{led,air:breeze});}
  function displayTexture(){const c=document.createElement('canvas');c.width=768;c.height=432;const p=c.getContext('2d'),sky=p.createLinearGradient(0,0,0,432);sky.addColorStop(0,'#879fa1');sky.addColorStop(1,'#d4c4a3');p.fillStyle=sky;p.fillRect(0,0,768,432);p.fillStyle='#eddbb6';p.beginPath();p.arc(548,103,39,0,7);p.fill();for(let j=0;j<4;j++){p.fillStyle=['#798d7b','#5d7767','#3e5e50','#294a3f'][j];p.beginPath();p.moveTo(0,432);for(let x=0;x<=768;x+=6)p.lineTo(x,205+j*39+Math.sin(x/120+j*1.3)*45);p.lineTo(768,432);p.fill();}const t=new T.CanvasTexture(c);t.colorSpace=T.SRGBColorSpace;return t;}
  function screen(suffix,x,y,z,rw,rh,angle=0){const g=group(x,y,z,angle);box(rw+.045,rh+.045,.038,0,0,0,m.black,g,.015);const mat=new T.MeshPhysicalMaterial({color:'#090f10',roughness:.1,metalness:.12,clearcoat:1,emissive:'#ffffff',emissiveIntensity:0,map:displayTexture()});mat.emissiveMap=mat.map;mat.userData.ownedMap=true;const s=box(rw,rh,.004,0,0,.024,mat,g,.003);device(suffix,g,[x,y+rh*.6,z],{screen:s});return g;}
  function cloth(x,y,z,rw,rd,material,frontDrop=.23){const mat=material.clone();mat.side=T.DoubleSide;const geo=new T.PlaneGeometry(rw,rd,48,56),p=geo.attributes.position;for(let i=0;i<p.count;i++){const u=p.getX(i)/rw+.5,v=p.getY(i)/rd+.5,edge=Math.pow(Math.abs(u-.5)*2,8),hang=T.MathUtils.smoothstep(v,.84,1);p.setXYZ(i,(u-.5)*rw,Math.sin(u*49+v*7)*.006+Math.sin(u*21-v*4)*.008-edge*.02-hang*frontDrop,(v-.5)*rd-hang*.04);}geo.computeVertexNormals();mesh(geo,mat,x,y,z);}
  if(room.type==='living') {
    const sw=Math.min(w-1.65,layout.id==='grand'?4.55:3.6),sz=d/2-1.05,seatX=-.25;
    rug(-.1,sz-.8,Math.min(w-1,6.4),Math.min(d-1,3.9));const endSofa=begin('sofa','云朵组合沙发','textile',surface('fabric'));const sofa=group(seatX,0,sz);
    box(sw-.15,.14,.94,0,.16,0,m.black,sofa,.06);cushion(sw,.38,1.08,0,.34,0,m.fabric,sofa);
    for(const xx of [-sw/2+.14,sw/2-.14])cushion(.28,.64,1.05,xx,.53,0,m.fabric,sofa);
    const n=layout.id==='grand'?4:3,cw=(sw-.58)/n;
    for(let i=0;i<n;i++){const x=(i-(n-1)/2)*cw;cushion(cw-.018,.23,.88,x,.56,-.075,m.fabric,sofa);const b=cushion(cw-.025,.65,.26,x,.79,.4,m.fabric,sofa);b.rotation.x=-.12;const p=cushion(.43,.43,.16,x+(i%2?.13:-.13),.84,.2,[m.linen,m.sage,m.rust][i%3],sofa);p.rotation.set(-.2,0,i%2?.16:-.14);}
    if(w>6){cushion(1,.4,1.7,-sw/2+.66,.36,-.65,m.fabric,sofa);cushion(.96,.23,1.65,-sw/2+.66,.57,-.65,m.fabric,sofa);}
    cloth(seatX+.35,.705,sz-.15,.65,.98,m.rust,.26);endSofa();
    const tz=sz-1.6,endCoffee=begin('coffee-table','椭圆石材茶几','stone',surface('stone'));const top=cylinder(.68,.68,.075,.1,.42,tz,m.stone);top.scale.x=1.25;lathe([[.32,0],[.34,.03],[.21,.34],[.29,.36]],.1,.025,tz,wood);
    const endSide=begin('side-table','圆形边几','wood',woodSurface);cylinder(.34,.34,.045,-1.04,.32,tz+.24,wood);cylinder(.04,.05,.29,-1.04,.15,tz+.24,m.brass);endSide();books(.06,.48,tz);cup(.55,.466,tz+.16);vase(-.2,.46,tz-.2);endCoffee();
    lounge(Math.min(w/2-1,2.5),sz-.6,-.6);if(w>7.4)lounge(Math.min(w/2-1,2.5),sz-2.2,-1.05);
    const endConsole=begin('console','悬浮电视柜组合','wood',woodSurface);const tvz=-d/2+.31,tw=Math.min(3.5,w-2.4);box(tw+.3,1.8,.09,0,1.04,tvz-.14,m.stone,space,.012);box(tw,.26,.45,0,.3,tvz+.1,wood,space,.035);
    for(let i=0;i<Math.floor(tw/.05);i++)box(.021,.22,.018,-tw/2+.03+i*.05,.31,tvz+.335,m.walnut,space,.003);
    screen('tv',0,1.19,tvz+.02,Math.min(2.25,tw-.4),1.17);
    const stripGroup=group(0,.18,tvz+.25),strip=box(tw-.2,.012,.035,0,0,0,bulb(),stripGroup,.002);lighting('strip',stripGroup,[0,.25,tvz+.35],[strip],11,4);endConsole();
    pendant('pendant',0,sz-.95);const endFloor=begin('floor-lamp','弧光落地灯','metal',surface('brass'));const fl=group(-w/2+.65,0,sz-.45);cylinder(.18,.21,.035,0,.03,0,m.stone,fl);line([[0,.03,0],[0,1.5,0],[.22,1.86,0],[.49,1.77,0]],.016,m.brass,fl);const shade=lathe([[.24,0],[.25,.025],[.14,.19],[.04,.22]],.49,1.55,0,bulb(),fl);lighting('floor',fl,[-w/2+1.14,1.61,sz-.45],[shade],11,3.3);endFloor();
    air('ac',-w/2+.17,-d/2+1.1,Math.PI/2);plant(-w/2+.6,d/2-.65,1.2);plant(w/2-.45,-d/2+.55,.8);
    const robot=group(-w/2+.6,0,-d/2+.65);cylinder(.23,.24,.095,0,.08,0,m.ceramic,robot);cylinder(.055,.055,.027,0,.14,0,m.black,robot);const led=cylinder(.014,.014,.004,.09,.132,.04,bulb(),robot);device('robot',robot,[robot.position.x,.35,robot.position.z],{led,origin:robot.position.clone()});
  }
  if(room.type==='dining') {
    const length=Math.min(d-1.7,layout.id==='grand'?2.8:2.25),tableZ=layout.id==='grand'?.1:0; rug(0,tableZ,w-.45,Math.min(d-.5,length+1.3));
    const endTable=begin('table','长桌与餐具','wood',woodSurface);box(Math.min(1.15,w-1.3),.075,length,0,.79,tableZ,wood,space,.12);for(const zz of [-length*.32,length*.32])box(.68,.73,.11,0,.4,tableZ+zz,wood,space,.045);
    const seats=layout.id==='grand'?3:2;for(let i=0;i<seats;i++){const zz=tableZ+(i-(seats-1)/2)*.8;chair(-.92,zz,Math.PI/2);chair(.92,zz,-Math.PI/2);for(const xx of [-.36,.36]){cylinder(.15,.14,.018,xx,.842,zz,m.ceramic);box(.13,.015,.16,xx,.858,zz,m.linen);box(.013,.007,.2,xx+(xx<0?-.21:.21),.846,zz,m.steel,space,.002);}}
    vase(0,.84,tableZ);endTable();pendant('pendant',0,tableZ,'dining');
    const endBoard=begin('sideboard','餐边柜','wood',woodSurface);const sz=room.id==='dining'&&layout.id==='grand'?-d/2+.42:-d/2+.3;box(Math.min(w-.4,2.4),.72,.4,0,.39,sz,m.paint,space,.02);box(Math.min(w-.35,2.45),.035,.44,0,.77,sz,m.stone);vase(-.6,.8,sz);endBoard();art(0,1.65,sz-.23,Math.min(w-.45,1.5),.82);
  }
  if(room.type==='master'||room.type==='guest') {
    const bw=room.id==='master'?Math.min(1.85,w-1.6):Math.min(1.55,w-1.05),bl=2.05,bx=room.id==='master'?.22:0,bz=room.type==='master'?-d/2+1.55:.2;
    rug(bx,bz+.2,Math.min(w-.3,bw+1),Math.min(d-.3,3.05));const endBed=begin('bed','软包双人床','textile',surface('fabric','sage'));box(bw+.12,.22,bl+.12,bx,.19,bz,wood,space,.055);cushion(bw,.31,bl,bx,.43,bz,m.linen);cushion(bw+.22,.94,.14,bx,.65,bz-bl/2-.06,m.fabric);
    for(let i=0;i<7;i++)box(.009,.72,.009,bx-bw*.43+i*bw*.86/6,.66,bz-bl/2+.017,m.linen,space,.002);
    cushion(bw-.02,.12,bl*.69,bx,.62,bz+.21,m.sage);cloth(bx,.70,bz+.32,bw+.08,bl*.82,m.sage,.18);cloth(bx,.74,bz+.52,bw+.12,.42,m.rust,0);
    for(const xx of [-bw*.25,bw*.25]){const p=cushion(bw*.43,.23,.46,bx+xx,.68,bz-.72,m.linen);p.rotation.x=.07;}endBed();
    const txs=room.type==='master'?[bx-bw/2-.39,bx+bw/2+.39]:[bx-bw/2-.28];
    txs.forEach((x,i)=>{const end=begin(`nightstand-${i+1}`,`床头柜与台灯 ${i+1}`,'wood',woodSurface);const r=room.type==='master'?.29:.22;cylinder(r,r*.94,.43,x,.26,bz-.7,wood);cylinder(r+.015,r+.015,.03,x,.485,bz-.7,m.stone);tableLamp(room.type==='master'?i?'right':'left':'lamp',x,.51,bz-.7);end();});
    pendant('main',bx,bz+.1,'disc');air('ac',w/2-1.0,-d/2+.12);
    const endWardrobe=begin('wardrobe','整组衣柜','wood',woodSurface);if(room.type==='master'){for(let i=0;i<3;i++){box(.48,2.2,.64,-w/2+.31,1.13,-d/2+.56+i*.66,m.paint,space,.01);box(.025,.48,.015,-w/2+.563,1,-d/2+.34+i*.66,m.brass,space,.003);}}
    else{box(Math.min(w-1,1.4),1.88,.48,w/2-.85, .97,-d/2+.3,m.paint,space,.018);for(const xx of [w/2-1.05,w/2-.65])box(.015,.38,.02,xx,1,-d/2+.55,m.brass,space,.003);}
    endWardrobe();
    if(d>4){const end=begin('bench','床尾软包长凳','textile',surface('fabric'));cushion(bw-.1,.25,.4,bx,.36,bz+1.55,m.fabric);for(const xx of [-bw*.3,bw*.3])box(.035,.3,.29,bx+xx,.17,bz+1.55,wood);end();}
    if(!layout.windows.some(win=>win.room===room.id&&win.side==='north'))art(bx,1.72,-d/2+.09,Math.min(1.5,w-1.1),.7);
    plant(w/2-.4,d/2-.45,.75);
  }
  if(room.type==='kitchen') {
    const back=-d/2+.38,left=-w/2+.36;
    const endKitchen=begin('cabinet','整体橱柜与嵌入家电','wood',surface('paint'));
    for(let i=0;i<Math.floor((w-.95)/.65);i++){const x=-w/2+.4+i*.65;box(.63,.85,.61,x,.46,back,m.paint,space,.015);box(.4,.016,.025,x,.78,back+.32,m.brass,space,.003);}
    box(w-.9,.045,.68,-.35,.92,back,m.stone);box(.65,.85,Math.max(.9,d-1.25),left,.46,.15,m.paint,space,.012);box(.7,.045,Math.max(.95,d-1.2),left,.92,.15,m.stone);
    const oven=group(-.25,.47,back+.325);box(.59,.58,.04,0,0,0,m.black,oven,.018);const os=box(.46,.32,.006,0,-.055,.024,bulb(),oven,.01);box(.42,.027,.035,0,.17,.06,m.steel,oven,.008);for(const x of [-.2,.2]){const knob=cylinder(.025,.025,.018,x,.23,.04,m.steel,oven);knob.rotation.x=Math.PI/2;}device('oven',oven,[-.25,.85,back+.38],{screen:os});
    const hob=group(-.25,.954,back);box(.66,.018,.52,0,0,0,m.black,hob,.018);const burners=[];for(const x of [-.17,.17]){const b=ring(.105,.004,x,.014,0,bulb(),hob);b.rotation.x=Math.PI/2;burners.push(b);}device('hob',hob,[-.25,1.08,back],{emissionMeshes:burners});
    const hood=group(-.25,1.62,back-.06);box(.76,.07,.51,0,0,0,m.steel,hood,.02);box(.22,.57,.24,0,.29,-.08,m.steel,hood);const hl=box(.25,.009,.025,0,-.04,.13,bulb(),hood,.002);device('hood',hood,[-.25,2.3,back],{led:hl});
    const endFridge=begin('refrigerator','双门冰箱','metal',surface('steel'));const fridge=group(w/2-.47,0,back+.04);box(.76,1.93,.69,0,.99,0,m.steel,fridge,.035);for(const x of [-.18,.18]){box(.351,1.75,.035,x,1.06,.36,m.steel,fridge,.016);box(.018,.6,.035,x<0?-.035:.035,1.2,.395,m.black,fridge,.006);}const led=box(.105,.06,.006,.18,1.5,.385,bulb(),fridge,.004);device('fridge',fridge,[w/2-.47,2.18,back+.12],{led});endFridge();
    const sinkz=Math.min(.55,d/2-.5);box(.48,.022,.57,left,.954,sinkz,m.steel,space,.045);box(.38,.008,.46,left,.968,sinkz,m.black,space,.05);line([[left-.23,.95,sinkz],[left-.23,1.23,sinkz],[left,1.29,sinkz],[left+.02,1.15,sinkz]],.014,m.steel);
    const dish=group(left+.34,.47,sinkz-.72,Math.PI/2);box(.58,.76,.028,0,0,0,m.steel,dish,.012);box(.4,.025,.025,0,.27,.025,m.black,dish,.003);const dl=box(.04,.01,.007,.14,.29,.025,bulb(),dish,.001);device('dishwasher',dish,[left+.4,.91,sinkz-.72],{led:dl});
    const stripG=group(-.7,1.52,back+.07),ks=box(Math.min(w-1.7,2.4),.014,.035,0,0,0,bulb(),stripG,.002);lighting('strip',stripG,[-.7,1.48,back+.1],[ks],9,3.2);
    for(let i=0;i<2;i++)box(.57,.68,.28,-w/2+.4+i*.59,1.93,-d/2+.19,m.paint,space,.012);
    endKitchen();
    if(layout.id==='grand'){const end=begin('island','中央岛台','stone',surface('stone'));box(2.3,.88,.92,.2,.46,.6,wood,space,.025);box(2.4,.055,1.04,.2,.93,.6,m.stone,space,.018);books(-.4,.98,.65);vase(.65,.96,.6);chair(-.2,1.62,Math.PI);chair(.8,1.62,Math.PI);end();}
    pendant('light',-.2,0,'disc');
  }
  if(room.type==='study') {
    const endDesk=begin('desk','书桌与工作设备','wood',woodSurface);const z=d/2-.46;box(Math.min(w-.35,2.0),.065,.72,0,.77,z,wood,space,.035);for(const x of [-w/2+.3,w/2-.3])box(.035,.72,.56,x,.38,z,m.black);lounge(0,z-1.13,Math.PI);screen('monitor',-.1,1.15,z+.1,.85,.47,Math.PI);
    box(.43,.018,.15,0,.815,z-.18,m.black,space,.012);for(let r=0;r<4;r++)for(let c=0;c<12;c++)box(.026,.003,.025,-.19+c*.033,.827,z-.235+r*.033,m.ceramic,space,.001);tableLamp('lamp',w/2-.4,.81,z);books(-.55,.825,z);endDesk();pendant('main',0,-.3,'disc');
    const endShelf=begin('bookshelf','开放式书架','wood',woodSurface);box(.26,2.03,1.7,w/2-.2,1.04,-d/2+1.05,wood);for(let j=0;j<4;j++){box(.32,.025,1.72,w/2-.23,.35+j*.48,-d/2+1.05,m.walnut);for(let i=0;i<7;i++)box(.21,.22+(i%3)*.045,.06,w/2-.26,.49+j*.48,-d/2+.4+i*.12,[m.linen,m.sage,m.rust][i%3],space,.003);}
    endShelf();plant(-w/2+.38,-d/2+.5,.9);art(-w/2+.08,1.45,-.1,.9,1,Math.PI/2);
  }
  if(room.type==='bath') {
    const endVanity=begin('vanity','悬浮浴室柜','wood',woodSurface);const vx=-w/2+.42,vz=0;box(.66,.64,Math.min(1.35,d-.5),vx,.45,vz,wood,space,.015);box(.72,.05,Math.min(1.41,d-.4),vx,.8,vz,m.stone);lathe([[.1,0],[.24,.03],[.25,.12],[.23,.14],[.21,.1],[.1,.025]],vx,.82,vz,m.ceramic);line([[vx-.22,.83,vz],[vx-.22,1.1,vz],[vx,1.1,vz]],.012,m.steel);
    const mirror=mesh(new T.CircleGeometry(.4,64),new T.MeshPhysicalMaterial({color:'#96aaa2',metalness:1,roughness:.07}),-w/2+.085,1.6,vz);mirror.rotation.y=Math.PI/2;const mg=group(-w/2+.11,1.6,vz,Math.PI/2),glow=ring(.414,.012,0,0,0,bulb(),mg);lighting('light',mg,[-w/2+.6,1.6,vz],[glow],13,3.3);endVanity();
    const showerX=w/2-.62,showerZ=-d/2+.75;box(1.08,.04,1.35,showerX,.055,showerZ,m.stone,space,.02);box(.012,2.1,1.4,showerX-.55,1.1,showerZ,m.glass,space,0);box(.018,2.1,.018,showerX-.55,1.1,showerZ+.7,m.brass);line([[w/2-.14,.7,-d/2+.35],[w/2-.14,2.25,-d/2+.35],[w/2-.43,2.25,-d/2+.35]],.012,m.steel);cylinder(.12,.12,.018,w/2-.43,2.22,-d/2+.35,m.steel);
    const endToilet=begin('toilet','陶瓷坐便器','ceramic',surface('ceramic'));const toiletZ=d<3?-d/2+.48:d/2-.55,toiletX=d<3?-.25:.35;sphere(.48,.42,.63,toiletX,.26,toiletZ,m.ceramic);box(.45,.52,.13,toiletX,.47,toiletZ-.29,m.ceramic,space,.05);const seat=cylinder(.23,.23,.035,toiletX,.49,toiletZ,m.ceramic);seat.scale.z=1.22;endToilet();
    const fg=group(0,H-.45,-d/2+.09);box(.29,.29,.025,0,0,0,m.ceramic,fg,.008);const fan=group(0,0,.024,0,fg);for(let i=0;i<3;i++){const b=box(.2,.04,.01,0,0,0,m.steel,fan,.015);b.rotation.z=i*Math.PI/3;}device('fan',fg,[0,H-.2,-d/2+.2],{fan});
    if(room.id!=='ensuite'){const end=begin('washing-machine','滚筒洗衣机','ceramic',surface('ceramic'));const washerX=d<3?-.32:-w/2+.48,g=group(washerX,0,d/2-.4);box(.6,.81,.58,0,.43,0,m.ceramic,g,.035);const rim=ring(.19,.026,0,.42,.306,m.steel,g);const drum=cylinder(.16,.16,.027,0,.42,.311,m.black,g);drum.rotation.x=Math.PI/2;box(.13,.014,.03,0,.02,0,m.steel,drum,.003);box(.4,.045,.016,0,.74,.302,m.black,g,.005);device('washer',g,[washerX,.98,d/2-.35],{drum});end();}
    else{const end=begin('bathtub','独立浴缸','ceramic',surface('ceramic'));box(1.25,.5,.8,-.33,.31,d/2-.62,m.ceramic,space,.17);box(1.03,.03,.61,-.33,.575,d/2-.62,m.glass,space,.12);end();}
  }
  return space;
}
