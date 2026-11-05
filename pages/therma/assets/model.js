import * as THREE from './vendor/three/build/three.module.min.js';
import { RoundedBoxGeometry } from './vendor/three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from './vendor/three/examples/jsm/utils/BufferGeometryUtils.js';
import { createMaterials, createPerforatedDrum } from './surfaces.js';
import { addMechanicalDetails } from './detailing.js';

export const PARTS = [
  { id: 'shell', name: '机身与舱门', en: 'ENCLOSURE', short: '机身外壳', description: '折弯金属机壳构成稳定的外部轮廓。前部双层观察窗与柔性门封共同封闭洗涤空间，独立顶盖为上置热泵模块留出维护空间。', tags: ['烤漆金属', '双层视窗', '结构支撑'] },
  { id: 'control', name: '智控与投放', en: 'CONTROL SYSTEM', short: '控制面板', description: '旋钮、显示面板与洗涤剂投放盒构成操作界面。控制板协调洗涤、脱水和热泵干燥，并根据传感器反馈调整运行状态。', tags: ['控制电路', '洗剂投放', '传感反馈'] },
  { id: 'heatpump', name: '热泵换热系统', en: 'HEAT PUMP', short: '热泵总成', description: '压缩机驱动独立的冷媒回路。蒸发器让湿空气冷却凝水，冷凝器把热量送回空气；循环风机将干燥暖风重新送入滚筒。', tags: ['双换热器', '闭式循环', '热量回收'] },
  { id: 'drum', name: '不锈钢内筒', en: 'INNER DRUM', short: '不锈钢内筒', description: '带有密集透水孔的不锈钢滚筒负责承载衣物。内侧提升筋让衣物随筒壁抬起再落下，使水流与干燥气流均匀穿过织物。', tags: ['微孔筒壁', '三组提升筋', '翻转洗护'] },
  { id: 'tub', name: '外桶与密封', en: 'OUTER TUB', short: '密封外桶', description: '外桶包围旋转内筒，容纳洗涤水并连接进排水和干燥风道。前端柔性门封隔离振动，同时保持洗涤空间的密封。', tags: ['加强筋壳体', '柔性门封', '水气连接'] },
  { id: 'drive', name: '直驱电机', en: 'DIRECT DRIVE', short: '直驱电机', description: '后置电机沿内筒轴线布置，转子直接驱动滚筒。环形定子绕组与转子协同工作，控制洗涤翻转及脱水转速。', tags: ['同轴驱动', '铜线定子', '转速控制'] },
  { id: 'suspension', name: '悬挂与减振', en: 'SUSPENSION', short: '悬挂减振', description: '顶部弹簧承担桶体重量，下部减振器抑制运动幅度。配重块和悬挂系统共同降低衣物分布不均时产生的振动。', tags: ['悬挂弹簧', '双减振器', '平衡配重'] },
  { id: 'base', name: '底盘与水路', en: 'BASE & DRAIN', short: '底盘水路', description: '底盘连接机身立柱与调平支脚。排水泵、过滤结构及软管将洗涤废水和冷凝水排出，构成与空气循环独立的排水路径。', tags: ['刚性底盘', '排水泵', '冷凝水排放'] },
];

const TAU = Math.PI * 2;
const v = (a) => new THREE.Vector3(...a);
const cylinderGeo = new THREE.CylinderGeometry(1, 1, 1, 80);
const sphereGeo = new THREE.SphereGeometry(1, 48, 32);
const boxGeo = new THREE.BoxGeometry(1, 1, 1);

export function createWasher() {
  const root = new THREE.Group();
  const pieces = [], targets = [], anchors = new Map(), rotating = [];
  const mat = createMaterials();
  const roundedGeometryCache = new Map();
  function mesh(parent, geometry, material, pos = [0,0,0], rotation) {
    const m = new THREE.Mesh(geometry, material); m.position.set(...pos); if (rotation) m.rotation.set(...rotation);
    m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
  }
  function box(parent, size, pos, material, radius = .02) {
    const key=[...size,radius].join('|');
    if(radius&&!roundedGeometryCache.has(key))roundedGeometryCache.set(key,new RoundedBoxGeometry(...size,3,Math.min(radius,...size.map(n=>n/3))));
    const geo = radius ? roundedGeometryCache.get(key) : boxGeo;
    const m = mesh(parent, geo, material, pos); if (!radius) m.scale.set(...size); return m;
  }
  function cyl(parent, radius, length, pos, material, axis = 'z') {
    const m = mesh(parent, cylinderGeo, material, pos); m.scale.set(radius, length, radius);
    if (axis === 'z') m.rotation.x = Math.PI / 2; if (axis === 'x') m.rotation.z = Math.PI / 2; return m;
  }
  function ring(parent, radius, tube, pos, material, axis = 'z', segments = 96) {
    const m = mesh(parent, new THREE.TorusGeometry(radius, tube, 16, segments), material, pos);
    if (axis === 'y') m.rotation.x = Math.PI / 2; if (axis === 'x') m.rotation.y = Math.PI / 2; return m;
  }
  function pipe(parent, points, radius, material, closed = false) {
    const curve = new THREE.CatmullRomCurve3(points.map(v), closed, 'catmullrom', .15);
    const m = mesh(parent, new THREE.TubeGeometry(curve, Math.min(640,Math.max(32,points.length*10)), radius, 12, closed), material); return m;
  }
  function rod(parent, a, b, radius, material) {
    const av = v(a), bv = v(b); const delta = bv.clone().sub(av);
    const m = cyl(parent, radius, delta.length(), av.add(bv).multiplyScalar(.5).toArray(), material, 'y');
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0), delta.normalize()); return m;
  }
  function bolts(parent, positions, radius = .027, axis = 'z', material = mat.steel) {
    const geometry = new THREE.CylinderGeometry(radius, radius, .018, 6);
    const m = new THREE.InstancedMesh(geometry, material, positions.length); const dummy = new THREE.Object3D();
    positions.forEach((p, i) => {dummy.position.set(...p); dummy.rotation.set(axis === 'z' ? Math.PI / 2 : 0, 0, axis === 'x' ? Math.PI / 2 : 0); dummy.updateMatrix(); m.setMatrixAt(i, dummy.matrix);});
    m.castShadow = true; parent.add(m); return m;
  }
  function group(id, delta, options = {}) {
    const object = new THREE.Group(); root.add(object); object.userData.partId = id;
    const piece = { object, id, delta: v(delta), base: object.position.clone(), cut: options.cut ?? 1, thermal: options.thermal ?? 1, anchor: v(options.anchor || [0,1.5,0]), turn:options.turn||0, pivot:v(options.pivot||[0,0,0]) };
    pieces.push(piece); if (!anchors.has(id)) anchors.set(id, piece); return object;
  }
  function decal(parent, text, width, height, pos, color = '#dae7d8', bg = 'transparent', font = '500 34px Arial') {
    const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = Math.max(64, Math.round(1024 * height / width)); const ctx = canvas.getContext('2d');
    if (bg !== 'transparent') {ctx.fillStyle = bg; ctx.fillRect(0,0,canvas.width,canvas.height);}
    ctx.font = font; ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, 512, canvas.height / 2);
    const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace;
    return mesh(parent, new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false }), pos);
  }

  // A sheet-metal cabinet, with a genuine circular opening through the front panel.
  const front = group('shell', [0, 0, 1.65], { cut: 0, thermal: 0, anchor: [1.02,1.15,1.09] });
  const shape = new THREE.Shape(); const xl = -1.17, xr = 1.17, yb = .24, yt = 2.62, rr = .07;
  shape.moveTo(xl + rr, yb); shape.lineTo(xr - rr, yb); shape.quadraticCurveTo(xr,yb,xr,yb+rr); shape.lineTo(xr,yt-rr); shape.quadraticCurveTo(xr,yt,xr-rr,yt); shape.lineTo(xl+rr,yt); shape.quadraticCurveTo(xl,yt,xl,yt-rr); shape.lineTo(xl,yb+rr); shape.quadraticCurveTo(xl,yb,xl+rr,yb);
  const hole = new THREE.Path(); hole.absarc(0,1.46,.862,0,TAU,true); shape.holes.push(hole);
  mesh(front,new THREE.ExtrudeGeometry(shape,{depth:.072,bevelEnabled:true,bevelThickness:.012,bevelSize:.012,bevelSegments:3,steps:1,curveSegments:72}),mat.porcelain,[0,0,1.06]);
  ring(front,.88,.018,[0,1.46,1.155],mat.edge);
  box(front,[2.12,.026,.012],[0,.49,1.145],mat.edge,.006);
  box(front,[.38,.19,.012],[.78,.38,1.15],mat.porcelain,.015);
  decal(front,'THERMA',.6,.08,[-.69,2.43,1.15],'#5b6e60','transparent','600 90px Arial');
  decal(front,'HEAT PUMP  /  ALL-IN-ONE',.85,.06,[.52,.36,1.16],'#849180','transparent','500 38px Arial');
  bolts(front,[[-1.06,.34,1.15],[1.06,.34,1.15],[-1.06,2.5,1.15],[1.06,2.5,1.15]],.02);
  const door = group('shell', [0, .02, 2.65], { cut: 0, thermal: 0 });
  ring(door,.817,.081,[0,1.46,1.25],mat.dark);
  ring(door,.889,.012,[0,1.46,1.27],mat.aluminum);
  ring(door,.746,.019,[0,1.46,1.28],mat.edge);
  ring(door,.805,.045,[0,1.46,1.31],mat.graphite);
  // Closed, shallow concave glazing: a flat optical centre and a rolled bowl edge.
  const glassProfile=new THREE.SplineCurve([[0,-.08],[.28,-.077],[.53,-.06],[.67,-.018],[.735,.001],[.744,.012],[.735,.025],[.66,.006],[.52,-.035],[.28,-.052],[0,-.055]].map(p=>new THREE.Vector2(...p)));
  const glass = mesh(door,new THREE.LatheGeometry(glassProfile.getPoints(64),160),mat.glass,[0,1.46,1.24],[Math.PI/2,0,0]);glass.castShadow=false;
  box(door,[.09,.32,.07],[.83,1.46,1.34],mat.dark,.035);
  box(door,[.09,.25,.08],[-.91,1.46,1.17],mat.edge,.02);
  decal(door,'T H E R M A',.53,.06,[0,.84,1.33],'#9cae9b','transparent','500 62px Arial');
  const panels=[];
  for (const side of [-1,1]) {
    const panel = group('shell',[side*(side===1?2.25:1.55),.05,side===1?-.95:-.25],{cut:side===1?0:.10,thermal:0,turn:side===1?1.28:-.3,pivot:[side*1.18,1.73,0]});
    panel.userData.side=side;panels.push(panel);
    box(panel,[.065,2.85,2.18],[side*1.18,1.73,0],mat.porcelain,.028);
    // Pressed side-panel channels, held inside the cabinet envelope.
    for(let j=0;j<3;j++) box(panel,[.013,1.74,.026],[side*1.217,1.64,-.57+j*.56],mat.edge,.006);
    bolts(panel,[[side*1.226,.4,-.9],[side*1.226,.4,.9],[side*1.226,2.99,-.9],[side*1.226,2.99,.9]],.022,'x');
  }
  const top = group('shell',[0,1.64,-.1],{cut:0,thermal:0});
  box(top,[2.46,.12,2.29],[0,3.21,0],mat.porcelain,.045);
  box(top,[2.27,.035,2.1],[0,3.13,0],mat.dark,.012);
  const rear = group('shell',[0,.02,-1.02],{cut:.1,thermal:.06});
  box(rear,[2.3,2.86,.055],[0,1.73,-1.09],mat.aluminum,.02);
  for(let i=0;i<10;i++) box(rear,[.58,.016,.01],[.5,2.65+i*.03,-1.124],mat.dark,.003);
  bolts(rear,[[-1.06,.4,-1.13],[1.06,.4,-1.13],[-1.06,2.98,-1.13],[1.06,2.98,-1.13]],.022);

  // Front fascia, drawer, printed control board and illuminated display.
  const control = group('control',[0,.43,.76],{cut:.22,thermal:0,anchor:[-.65,2.87,1.16]});
  box(control,[2.32,.43,.17],[0,2.87,1.06],mat.graphite,.035);
  box(control,[.57,.31,.045],[-.82,2.88,1.165],mat.porcelain,.025);
  box(control,[.25,.015,.012],[-.82,2.78,1.193],mat.edge,.003);
  cyl(control,.14,.075,[-.23,2.88,1.21],mat.steel);
  ring(control,.14,.008,[-.23,2.88,1.25],mat.dark);
  box(control,[.012,.04,.006],[-.23,2.96,1.253],mat.dark,.002);
  const screenCanvas=document.createElement('canvas');screenCanvas.width=1024;screenCanvas.height=340;const screenCtx=screenCanvas.getContext('2d');
  screenCtx.fillStyle='#0b1717';screenCtx.fillRect(0,0,1024,340);screenCtx.fillStyle='#d9eee1';screenCtx.font='300 155px Segoe UI';screenCtx.fillText('1:28',52,217);screenCtx.fillStyle='#8ea99a';screenCtx.font='500 29px Segoe UI';screenCtx.fillText('WASH + DRY',540,128);screenCtx.font='24px Segoe UI';screenCtx.fillText('40°C     /     AUTO',540,190);screenCtx.fillStyle='#395e4d';screenCtx.fillRect(54,279,911,4);screenCtx.fillStyle='#a1cbb0';screenCtx.fillRect(54,279,328,4);
  const screen=new THREE.CanvasTexture(screenCanvas);screen.colorSpace=THREE.SRGBColorSpace;screen.anisotropy=8;
  box(control,[.85,.29,.015],[.47,2.88,1.16],mat.black,.012);
  mesh(control,new THREE.PlaneGeometry(.75,.25),new THREE.MeshBasicMaterial({map:screen,toneMapped:false}),[.47,2.88,1.171]);
  cyl(control,.032,.006,[1.01,2.88,1.17],mat.aluminum);
  box(control,[1.9,.32,.045],[.1,2.87,.87],mat.pcb,.009);
  for(let i=0;i<9;i++)box(control,[.08,.095,.045],[-.66+i*.17,2.88,.83],i%3===0?mat.steel:mat.black,.006);
  box(control,[.52,.15,.54],[-.81,2.82,.65],mat.plastic,.03);
  for(let i=0;i<3;i++)box(control,[.012,.11,.45],[-1.02+i*.2,2.84,.65],mat.porcelain,.003);

  // Individually formed, physical perforations with bevels and wall thickness.
  const drum = group('drum',[0,.025,1.04],{anchor:[.54,1.7,.87]});
  const spinning = new THREE.Group(); spinning.position.set(0,1.46,0); drum.add(spinning); rotating.push(spinning);
  const drumMat = mat.steel.clone();drumMat.side=THREE.DoubleSide;drumMat.roughness=.38;
  mesh(spinning,createPerforatedDrum(),drumMat);
  ring(spinning,.754,.025,[0,0,.8],mat.steel);ring(spinning,.765,.014,[0,0,.76],mat.edge);ring(spinning,.751,.025,[0,0,-.79],mat.steel);
  cyl(spinning,.751,.035,[0,0,-.805],mat.steel);
  for(let r=.18;r<.7;r+=.13)ring(spinning,r,.01,[0,0,-.779],mat.edge);
  cyl(spinning,.1,.06,[0,0,-.76],mat.graphite);
  const backBolts=[];for(let a=0;a<TAU;a+=TAU/12){backBolts.push([Math.cos(a)*.63,Math.sin(a)*.63,-.775]);rod(spinning,[Math.cos(a)*.26,Math.sin(a)*.26,-.77],[Math.cos(a)*.57,Math.sin(a)*.57,-.77],.008,mat.edge);}bolts(spinning,backBolts,.016);
  for(let i=0;i<3;i++) {const a=i*TAU/3+.3;const paddle=box(spinning,[.13,.11,1.27],[Math.cos(a)*.685,Math.sin(a)*.685,.015],mat.plastic,.04);paddle.rotation.z=a-Math.PI/2;}

  // Split moulded outer tub and elastomer seal; the rear section remains translucent in cutaway.
  const tub = group('tub',[0,0,-.45],{cut:.13,thermal:.08,anchor:[-.8,1.54,-.4]});
  mesh(tub,new THREE.CylinderGeometry(.873,.9,1.74,80,1,true),mat.plastic,[0,1.46,-.02],[Math.PI/2,0,0]);
  cyl(tub,.883,.065,[0,1.46,-.91],mat.plastic);
  for(let z=-.8;z<=.8;z+=.27)ring(tub,.891,.025,[0,1.46,z],mat.plastic);
  const tubBolts=[];for(let a=0;a<TAU;a+=TAU/16){tubBolts.push([Math.sin(a)*.89,1.46+Math.cos(a)*.89,.87]);box(tub,[.045,.045,1.58],[Math.cos(a)*.89,1.46+Math.sin(a)*.89,0],mat.plastic,.008);}bolts(tub,tubBolts,.022);
  const seal = group('tub',[0,0,1.01],{cut:.25,thermal:.12});
  for(let i=0;i<4;i++)ring(seal,.828+i*.008,.033,[0,1.46,.91+i*.055],mat.rubber);
  ring(seal,.852,.01,[0,1.46,1.09],mat.steel);

  // Coaxial direct-drive rotor and copper stator windings.
  const drive = group('drive',[1.45,.2,-1.7],{anchor:[.45,1.6,-1.13],turn:-2.9,pivot:[0,1.46,-1.06]});
  cyl(drive,.57,.09,[0,1.46,-1.015],mat.dark);ring(drive,.53,.048,[0,1.46,-1.075],mat.edge);
  for(let i=0;i<24;i++){const a=i*TAU/24;const coil=box(drive,[.065,.14,.075],[Math.sin(a)*.43,1.46+Math.cos(a)*.43,-1.08],mat.copper,.015);coil.rotation.z=-a;}
  cyl(drive,.34,.05,[0,1.46,-1.11],mat.aluminum);cyl(drive,.09,.11,[0,1.46,-1.12],mat.steel);
  const driveBolts=[];for(let i=0;i<6;i++){const a=i*TAU/6;driveBolts.push([Math.cos(a)*.28,1.46+Math.sin(a)*.28,-1.15]);}bolts(drive,driveBolts,.026);
  for(let a=0;a<TAU;a+=TAU/12){const spoke=box(drive,[.04,.27,.018],[Math.sin(a)*.23,1.46+Math.cos(a)*.23,-1.15],mat.graphite,.009);spoke.rotation.z=-a;}

  // Suspended tub: steel extension springs, dampers and cast counterweights.
  const suspension = group('suspension',[-.34,.06,-.02],{anchor:[-.99,1.08,.25]});
  for(const side of [-1,1]){
    const springPoints=[];for(let i=0;i<=180;i++){const t=i/180; springPoints.push([side*.82+Math.sin(t*TAU*10)*.055,2.2+t*.44,-.35+Math.cos(t*TAU*10)*.055]);}
    pipe(suspension,springPoints,.012,mat.steel);rod(suspension,[side*.82,2.62,-.35],[side*1.07,2.95,-.35],.018,mat.steel);
    const a=[side*.98,.26,.52], b=[side*.61,.92,.26],mid=v(a).lerp(v(b),.6).toArray();rod(suspension,a,mid,.063,mat.graphite);rod(suspension,mid,b,.029,mat.steel);cyl(suspension,.09,.12,a,mat.rubber);cyl(suspension,.08,.12,b,mat.rubber);
  }
  const counter=box(suspension,[1.35,.19,.34],[0,2.33,.37],mat.concrete,.06);counter.rotation.z=.02;
  bolts(suspension,[[-.46,2.44,.36],[.46,2.44,.36]],.045,'y');

  // Bottom frame, upright rails, drain pump, hoses and adjustable levelling feet.
  const base = group('base',[0,-.28,0],{anchor:[.7,.18,.63]});
  box(base,[2.32,.11,2.13],[0,.2,0],mat.graphite,.025);
  for(const x of [-1.08,1.08]){box(base,[.07,.12,2.04],[x,.29,0],mat.aluminum,.01);for(const z of [-.94,.94]){cyl(base,.105,.13,[x,.07,z],mat.rubber,'y');cyl(base,.059,.1,[x,.145,z],mat.steel,'y');box(base,[.055,2.78,.055],[x,1.7,z],mat.edge,.008);}}
  box(base,[1.9,.07,.07],[0,3.02,-.96],mat.aluminum,.008);box(base,[1.9,.07,.07],[0,3.02,.95],mat.aluminum,.008);
  cyl(base,.14,.22,[.66,.42,.64],mat.graphite);cyl(base,.12,.1,[.66,.42,.8],mat.dark);box(base,[.3,.18,.2],[.65,.4,.36],mat.plastic,.03);
  pipe(base,[[.1,.57,.1],[.2,.42,.2],[.4,.4,.38],[.66,.4,.4]],.056,mat.rubber);
  pipe(base,[[.8,.4,.5],[.94,.45,.2],[.94,.5,-.6],[.9,.9,-1]],.035,mat.rubber);
  for(let i=0;i<11;i++)ring(base,.048,.008,[.94,.5,-.55+i*.065],mat.rubber);

  // Top-mounted heat-pump cassette: paired finned heat exchangers with a compressor behind.
  const heat = group('heatpump',[0,.86,-.08],{anchor:[.93,2.78,.27]});
  box(heat,[2.05,.055,1.86],[0,2.52,-.03],mat.graphite,.025);
  const heatCore = new THREE.Group(); heat.add(heatCore);
  function exchanger(cx, metal, pipeMetal) {
    const finGeo=new THREE.BoxGeometry(.006,.31,.77);const fins=new THREE.InstancedMesh(finGeo,metal,56);const dummy=new THREE.Object3D();
    for(let i=0;i<56;i++){dummy.position.set(cx-.28+i*.0102,2.735,.35);dummy.updateMatrix();fins.setMatrixAt(i,dummy.matrix);}fins.castShadow=true;fins.receiveShadow=true;heatCore.add(fins);
    for(const x of [cx-.3,cx+.3])box(heatCore,[.025,.36,.83],[x,2.735,.35],mat.aluminum,.006);
    for(let y=0;y<3;y++){
      rod(heatCore,[cx-.32,2.63+y*.105,-.02],[cx+.32,2.63+y*.105,-.02],.018,pipeMetal);
      rod(heatCore,[cx-.32,2.63+y*.105,.72],[cx+.32,2.63+y*.105,.72],.018,pipeMetal);
      pipe(heatCore,[[cx-.32,2.63+y*.105,-.02],[cx-.37,2.63+y*.105,.02],[cx-.37,2.63+y*.105,.67],[cx-.32,2.63+y*.105,.72]],.019,pipeMetal);
    }
  }
  exchanger(-.49,mat.blue,mat.copper);exchanger(.23,mat.aluminum,mat.copper);
  // Hermetic compressor with curved cap, mounting feet and labelled case.
  cyl(heat,.235,.4,[.52,2.78,-.58],mat.dark,'y');
  const cap=mesh(heat,sphereGeo,mat.dark,[.52,2.98,-.58]);cap.scale.set(.235,.10,.235);
  ring(heat,.232,.009,[.52,2.74,-.58],mat.edge,'y');
  box(heat,[.6,.025,.42],[.52,2.56,-.58],mat.aluminum,.015);
  for(const x of [.3,.74])cyl(heat,.05,.07,[x,2.56,-.58],mat.rubber,'y');
  decal(heat,'INVERTER',.24,.06,[.52,2.82,-.341],'#9cae9f','transparent','500 65px Arial');
  // Centrifugal blower, visible impeller and protective rim.
  cyl(heat,.27,.12,[-.56,2.67,-.58],mat.graphite,'y');ring(heat,.265,.019,[-.56,2.76,-.58],mat.aluminum,'y');
  const fan=new THREE.Group();fan.position.set(-.56,2.76,-.58);heat.add(fan);
  const bladeShape=new THREE.Shape();bladeShape.moveTo(.07,0);bladeShape.quadraticCurveTo(.17,.006,.24,.09);bladeShape.lineTo(.235,.115);bladeShape.quadraticCurveTo(.16,.035,.07,.022);bladeShape.closePath();
  const bladeGeometry=new THREE.ExtrudeGeometry(bladeShape,{depth:.065,bevelEnabled:true,bevelSize:.003,bevelThickness:.003,bevelSegments:2,steps:1,curveSegments:10});bladeGeometry.rotateX(Math.PI/2);
  for(let i=0;i<14;i++){const blade=mesh(fan,bladeGeometry,mat.aluminum,[0,.035,0]);blade.rotation.y=i*TAU/14;}
  cyl(fan,.07,.1,[0,0,0],mat.dark,'y');rotating.push(fan);
  box(heat,[.22,.23,.29],[-.77,2.67,-.27],mat.graphite,.035);
  // Refrigerant remains distinct from the air path: compressor -> condenser -> valve -> evaporator.
  pipe(heat,[[.65,2.96,-.57],[.9,2.96,-.54],[.9,2.94,.55],[.58,2.89,.6]],.025,mat.copper);
  pipe(heat,[[.48,2.64,.74],[.46,2.59,.91],[-.06,2.59,.91],[-.12,2.71,.87],[-.2,2.76,.7]],.018,mat.copper);
  cyl(heat,.045,.14,[-.07,2.64,.9],mat.gold,'x');
  pipe(heat,[[-.8,2.65,.65],[-.93,2.66,.66],[-.93,2.95,-.8],[.26,2.95,-.8],[.35,2.93,-.64]],.025,mat.copper);
  const duct=group('heatpump',[0,.42,-.16],{cut:.32,thermal:.1});
  pipe(duct,[[.83,2.65,.55],[.94,2.43,.55],[.91,2.2,.65],[.65,2.07,.72]],.105,mat.graphite);
  pipe(duct,[[-.7,2.61,-.65],[-.91,2.45,-.73],[-.94,1.88,-.73],[-.65,1.65,-.8]],.11,mat.graphite);
  // Clean reference geometry for heat-flow paths; these animate only in the thermal view.
  const airPaths = [
    {color:'#d9a15e',points:[[.6,2.75,.45],[.92,2.58,.5],[.94,2.08,.75],[.62,1.72,.75],[.2,1.45,.55]]},
    {color:'#cfa46e',points:[[.2,1.45,.55],[-.45,1.18,.2],[-.48,1.44,-.63],[-.9,1.91,-.78],[-.87,2.7,-.52],[-.49,2.72,.2]]},
    {color:'#69b5bc',points:[[-.49,2.72,.2],[-.49,2.76,.58],[-.2,2.76,.8],[.13,2.76,.67],[.2,2.76,.35]]},
    {color:'#dfa05c',points:[[.2,2.76,.35],[.24,2.76,.16],[.51,2.76,.15],[.6,2.75,.45]]},
  ];
  const refrigerantPaths = [
    {color:'#e79459',points:[[.52,2.99,-.58],[.88,3.01,-.5],[.9,3,.55],[.45,2.91,.6],[.25,2.75,.55]]},
    {color:'#d6ae68',points:[[.25,2.75,.55],[.46,2.63,.89],[-.06,2.64,.94],[-.17,2.74,.72]]},
    {color:'#76bec6',points:[[-.17,2.74,.72],[-.49,2.8,.55],[-.49,2.8,.15],[-.8,2.79,.15]]},
    {color:'#8cbfc2',points:[[-.8,2.79,.15],[-.94,3,-.2],[-.91,3.03,-.79],[.29,3.03,-.8],[.52,2.99,-.58]]},
  ];
  addMechanicalDetails({groups:{front,door,panels,control,spinning,tub,drive,suspension,base,heat,duct},mat,mesh,box,cyl,ring,pipe,rod,bolts,decal});

  // Batch static geometry by material while preserving the independently animated drum/fan.
  root.updateMatrixWorld(true);
  const consumed = new Set();
  function batch(parent,skip=new Set()) {
    const buckets=new Map(),inverse=parent.matrixWorld.clone().invert();
    parent.traverse(child=>{
      if(!child.isMesh||child.isInstancedMesh)return;
      let ancestor=child.parent;while(ancestor&&ancestor!==parent){if(skip.has(ancestor))return;ancestor=ancestor.parent;}
      if(!buckets.has(child.material))buckets.set(child.material,[]);buckets.get(child.material).push(child);
    });
    for(const [material,objects] of buckets){
      if(objects.length<2)continue;
      const baked=objects.map(object=>{const geo=object.geometry.index?object.geometry.toNonIndexed():object.geometry.clone();geo.applyMatrix4(inverse.clone().multiply(object.matrixWorld));return geo;});
      const merged=mergeGeometries(baked,false);
      if(merged){const combined=new THREE.Mesh(merged,material);combined.castShadow=objects.some(o=>o.castShadow);combined.receiveShadow=objects.some(o=>o.receiveShadow);parent.add(combined);for(const object of objects){consumed.add(object.geometry);object.removeFromParent();}}
      for(const geo of baked)geo.dispose();
    }
  }
  for(const piece of pieces)batch(piece.object,new Set(rotating));
  for(const moving of rotating)batch(moving);
  const retained=new Set();root.traverse(o=>{if(o.geometry)retained.add(o.geometry);});for(const geo of consumed)if(!retained.has(geo))geo.dispose();

  // Clone by part so selection highlights never leak to neighbouring components.
  const partMats = new Map();
  for(const piece of pieces){
    const cache=new Map();piece.object.traverse(child=>{if(child.isMesh){child.userData.partId=piece.id;child.userData.baseCastShadow=child.castShadow;child.layers.enable(2);targets.push(child);if(!cache.has(child.material)){const clone=child.material.clone();clone.userData.baseOpacity=clone.opacity;clone.userData.baseTransparent=clone.transparent;clone.userData.baseDepthWrite=clone.depthWrite;clone.userData.baseEmissive=clone.emissive?.clone();clone.userData.baseEmission=clone.emissiveIntensity;cache.set(child.material,clone);}child.material=cache.get(child.material);}});
    partMats.set(piece, [...cache.values()]);
  }
  const selectedColor=new THREE.Color('#49752c').multiplyScalar(.055);
  let lastStyle='';
  function update(amount, mode, selected, isolated) {
    const isCut=mode==='cutaway',isThermal=mode==='thermal';
    for(const piece of pieces){piece.object.rotation.y=piece.turn*amount;piece.object.position.copy(piece.base).addScaledVector(piece.delta,amount).add(piece.pivot).sub(piece.pivot.clone().applyQuaternion(piece.object.quaternion));}
    root.updateMatrixWorld(true);
    const style=`${mode}|${selected}|${isolated}`;if(style===lastStyle)return;lastStyle=style;
    for(const piece of pieces){
      const visibility=isThermal?piece.thermal:isCut?piece.cut:1;
      piece.object.visible=isolated?piece.id===selected:visibility>0;
      for(const m of partMats.get(piece)){
        const opacity=isolated?1:visibility;
        m.opacity=m.userData.baseOpacity*opacity;const transparent=m.userData.baseTransparent||opacity<1;if(m.transparent!==transparent){m.transparent=transparent;m.needsUpdate=true;}m.depthWrite=m.userData.baseDepthWrite&&opacity>=.5;
        if(m.emissive){m.emissive.copy(m.userData.baseEmissive);m.emissiveIntensity=m.userData.baseEmission;if(piece.id===selected&&!isolated)m.emissive.add(selectedColor);}
      }
      piece.object.traverse(o=>{if(o.isMesh)o.castShadow=visibility>=.5&&o.userData.baseCastShadow;});
    }
  }
  function anchor(id, out = new THREE.Vector3()) {const p=anchors.get(id);return out.copy(p.anchor).applyMatrix4(p.object.matrixWorld);}
  return {root,pieces,targets,anchors,update,anchor,rotating,airPaths,refrigerantPaths,materials:mat};
}
