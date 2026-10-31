import * as THREE from './vendor/three/build/three.module.min.js';

export function addMechanicalDetails({ groups:g, mat, mesh, box, cyl, ring, pipe, rod, bolts, decal }) {
  const TAU = Math.PI * 2;
  const radial = (r, a, z, cy=1.46) => [Math.sin(a)*r,cy+Math.cos(a)*r,z];
  const instance = (parent, geometry, material, transforms) => {
    const m = new THREE.InstancedMesh(geometry, material, transforms.length), dummy = new THREE.Object3D();
    transforms.forEach((t,i)=>{dummy.position.set(...(t.p||[0,0,0]));dummy.rotation.set(...(t.r||[0,0,0]));dummy.scale.set(...(t.s||[1,1,1]));dummy.updateMatrix();m.setMatrixAt(i,dummy.matrix);});
    m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;
  };

  // A machined multi-step door bezel, recessed handle and fastening hardware.
  const lip = new THREE.LatheGeometry([new THREE.Vector2(.744,-.016),new THREE.Vector2(.752,-.031),new THREE.Vector2(.772,-.032),new THREE.Vector2(.782,-.022),new THREE.Vector2(.782,.018),new THREE.Vector2(.77,.028),new THREE.Vector2(.753,.026)],160);
  mesh(g.door,lip,mat.edge,[0,1.46,1.275],[Math.PI/2,0,0]);
  ring(g.door,.891,.0055,[0,1.46,1.277],mat.steel,'z',160);
  ring(g.door,.806,.003,[0,1.46,1.358],mat.edge,'z',160);
  const boltLocations=[];
  for(let i=0;i<12;i++)boltLocations.push(radial(.816,i*TAU/12,1.17));
  bolts(g.door,boltLocations,.013);
  box(g.door,[.052,.21,.09],[.837,1.46,1.33],mat.rubber,.022);
  for(const y of [1.36,1.56]){cyl(g.door,.047,.12,[-.91,y,1.15],mat.steel,'y');bolts(g.door,[[-.91,y+.07,1.15]],.021,'y');}
  box(g.front,[.07,.17,.025],[.96,1.46,1.14],mat.dark,.015);
  box(g.front,[.024,.076,.028],[.96,1.46,1.159],mat.black,.008);
  decal(g.front,'TH–01   /   PRECISION CARE',.8,.045,[-.55,.67,1.154],'#66746d','transparent','500 48px Arial');
  // Rolled panel returns and a fine isolation seam at the cabinet foot.
  for(const x of [-1.13,1.13])box(g.front,[.035,2.23,.09],[x,1.42,1.026],mat.edge,.007);
  box(g.front,[2.17,.017,.024],[0,.275,1.147],mat.rubber,.004);
  for(const panel of g.panels){
    const side=panel.userData.side;
    for(const z of [-1.02,1.02])box(panel,[.065,2.72,.026],[side*1.14,1.73,z],mat.aluminum,.006);
    for(const y of [.36,3.08])box(panel,[.11,.025,2.06],[side*1.135,y,0],mat.aluminum,.005);
    const channels=[];for(let j=0;j<2;j++)channels.push({p:[side*1.219,1.55,-.43+j*.86],s:[.009,1.72,.10]});
    instance(panel,new THREE.BoxGeometry(1,1,1),mat.porcelain,channels);
    for(const y of [.43,2.98])bolts(panel,[[side*1.225,y,-.86],[side*1.225,y,.86]],.017,'x');
  }

  // Knurled encoder wheel, indicator scale, touch control icons and a crisp display.
  const knurl=[];
  for(let i=0;i<72;i++){const a=i*TAU/72;knurl.push({p:[-.23+Math.sin(a)*.14,2.88+Math.cos(a)*.14,1.226],r:[0,0,-a],s:[.0035,.007,.05]});}
  instance(g.control,new THREE.BoxGeometry(1,1,1),mat.edge,knurl);
  for(let i=0;i<13;i++){const a=(i/12*1.6-.8)*Math.PI;rod(g.control,[-.23+Math.sin(a)*.171,2.88+Math.cos(a)*.171,1.151],[-.23+Math.sin(a)*.185,2.88+Math.cos(a)*.185,1.151],.0024,mat.aluminum);}
  ring(g.control,.15,.003,[-.23,2.88,1.18],mat.led);
  decal(g.control,'AUTO DOSE',.31,.032,[-.82,2.9,1.191],'#6e7e72','transparent','500 52px Arial');
  decal(g.control,'I I',.06,.06,[1.01,2.88,1.18],'#d1ddd1','transparent','600 200px Arial');
  // Circuit-board traces, IC pins, capacitors and plugged ribbon cable.
  const pcbCanvas=document.createElement('canvas');pcbCanvas.width=1024;pcbCanvas.height=256;const ctx=pcbCanvas.getContext('2d');
  ctx.fillStyle='#1a4935';ctx.fillRect(0,0,1024,256);ctx.lineWidth=2;
  for(let i=0;i<34;i++){const y=10+i*7;ctx.strokeStyle=i%3?'#568167':'#92ad7c';ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(100+(i%5)*21,y);ctx.lineTo(170+(i%5)*21,y+25);ctx.lineTo(600+(i%8)*41,y+25);ctx.lineTo(650+(i%8)*41,y);ctx.lineTo(1024,y);ctx.stroke();}
  ctx.font='14px monospace';ctx.fillStyle='#bdceb2';ctx.fillText('TH-CTRL / R2.4    01–08',50,238);
  const pcbMap=new THREE.CanvasTexture(pcbCanvas);pcbMap.colorSpace=THREE.SRGBColorSpace;
  mesh(g.control,new THREE.PlaneGeometry(1.83,.28),new THREE.MeshStandardMaterial({map:pcbMap,roughness:.62}),[.1,2.87,.843],[0,Math.PI,0]);
  const pins=[];for(let i=0;i<32;i++)pins.push({p:[-.66+i*.047,2.76,.807],s:[.012,.027,.025]});
  instance(g.control,new THREE.BoxGeometry(1,1,1),mat.gold,pins);
  for(let i=0;i<4;i++)cyl(g.control,.028,.074,[.45+i*.1,2.95,.795],mat.dark);
  for(let i=0;i<6;i++)pipe(g.control,[[.6+i*.013,2.77,.83],[.66+i*.013,2.68,.74],[.85+i*.013,2.67,.6]],.004,i%2?mat.insulator:mat.graphite);

  // Drum flange, welded seam, embossed backplate and perforated lifting paddles.
  const rolled = new THREE.LatheGeometry([new THREE.Vector2(.738,.76),new THREE.Vector2(.739,.794),new THREE.Vector2(.749,.809),new THREE.Vector2(.773,.811),new THREE.Vector2(.782,.8),new THREE.Vector2(.782,.783),new THREE.Vector2(.775,.768)],160);
  mesh(g.spinning,rolled,mat.steel,[0,0,0],[Math.PI/2,0,0]);
  ring(g.spinning,.751,.004,[0,0,-.74],mat.edge);
  ring(g.spinning,.751,.004,[0,0,.72],mat.edge);
  for(let i=0;i<3;i++){
    const a=i*TAU/3+.3;
    const holes=[];for(let j=0;j<13;j++)for(let offset of [-.027,.027])holes.push({p:[Math.cos(a)*.626+Math.sin(a)*offset,Math.sin(a)*.626-Math.cos(a)*offset,-.55+j*.086],r:[Math.PI/2,a-Math.PI/2,0]});
    instance(g.spinning,new THREE.SphereGeometry(.009,8,4),mat.dark,holes);
  }
  const stiffeners=[];
  for(let i=0;i<18;i++){const a=i*TAU/18;stiffeners.push({p:[Math.cos(a)*.45,Math.sin(a)*.45,-.77],r:[0,0,a],s:[.32,.016,.014]});}
  instance(g.spinning,new THREE.BoxGeometry(1,1,1),mat.aluminum,stiffeners);
  // Cast outer-tub flanges and twelve radial connection lugs.
  for(let i=0;i<12;i++){
    const a=i*TAU/12,p=radial(.91,a,-.03);
    const lug=box(g.tub,[.12,.075,.14],p,mat.plastic,.017);lug.rotation.z=-a;
    bolts(g.tub,[radial(.92,a,.05)],.023);
  }
  for(const z of [-.78,.8])ring(g.tub,.905,.013,[0,1.46,z],mat.graphite);
  box(g.tub,[.23,.12,.075],[.54,2.14,.8],mat.plastic,.02);
  cyl(g.tub,.043,.1,[.54,2.14,.87],mat.gold);
  pipe(g.tub,[[.54,2.14,.91],[.75,2.08,.91],[.93,1.91,.85]],.009,mat.dark);

  // Individually wound stator teeth; each turn is physical enamelled copper wire.
  const turns=[];
  for(let tooth=0;tooth<24;tooth++){
    const a=tooth*TAU/24;
    for(let turn=0;turn<7;turn++)turns.push({p:[Math.sin(a)*(.38+turn*.0165),1.46+Math.cos(a)*(.38+turn*.0165),-1.085],r:[Math.PI/2,0,-a],s:[.033,.043,.033]});
  }
  instance(g.drive,new THREE.TorusGeometry(1,.115,6,14),mat.winding,turns);
  ring(g.drive,.582,.011,[0,1.46,-1.04],mat.aluminum);
  ring(g.drive,.568,.004,[0,1.46,-1.1],mat.dark);
  const rotorBolts=[];for(let i=0;i<8;i++)rotorBolts.push(radial(.54,i*TAU/8,-1.11));bolts(g.drive,rotorBolts,.017);
  decal(g.drive,'DIRECT DRIVE · TH01',.34,.06,[0,1.24,-1.144],'#53695e','transparent','500 60px Arial').rotation.y=Math.PI;
  box(g.drive,[.18,.085,.08],[.46,1.09,-1.1],mat.insulator,.009);
  for(let i=0;i<3;i++)pipe(g.drive,[[.43+i*.03,1.08,-1.13],[.5+i*.03,.95,-1.17],[.7+i*.03,.92,-1.05]],.009,i===0?mat.copper:mat.rubber);

  // Damper collars, stamped mounting plates, bolts and adjustable foot threads.
  for(const side of [-1,1]){
    box(g.suspension,[.2,.045,.19],[side*.98,.25,.52],mat.aluminum,.01);
    bolts(g.suspension,[[side*.93,.28,.57],[side*1.03,.28,.47]],.022,'y');
    ring(g.suspension,.074,.009,[side*.98,.26,.595],mat.edge);
    box(g.suspension,[.18,.04,.13],[side*.82,2.64,-.35],mat.edge,.009);
    bolts(g.suspension,[[side*.82,2.67,-.35]],.025,'y');
  }
  const studs=[];
  for(const x of [-1.08,1.08])for(const z of [-.94,.94])for(let i=0;i<6;i++)studs.push({p:[x,.126+i*.01,z],r:[Math.PI/2,0,0]});
  instance(g.base,new THREE.TorusGeometry(.06,.004,4,20),mat.steel,studs);
  for(const x of [-1.08,1.08])for(const z of [-.94,.94])bolts(g.base,[[x,.25,z]],.05,'y');
  for(let i=0;i<7;i++)box(g.base,[1.85,.023,.012],[0,.264,-.73+i*.23],mat.graphite,.003);
  for(const x of [-1.08,1.08])for(const z of [-.94,.94])for(const y of [.52,1.02,2.5])bolts(g.base,[[x,y,z+.031]],.016);
  ring(g.base,.121,.014,[.66,.42,.858],mat.edge);
  for(let i=0;i<6;i++){const a=i*TAU/6;rod(g.base,[.66+Math.sin(a)*.025,.42+Math.cos(a)*.025,.86],[.66+Math.sin(a)*.093,.42+Math.cos(a)*.093,.86],.009,mat.plastic);}
  box(g.base,[.22,.015,.24],[.65,.296,.36],mat.edge,.009);
  pipe(g.base,[[-.86,.31,-.72],[-.95,.6,-.6],[-.98,1.2,-.7],[-.99,2.3,-.83],[-.9,2.6,-.8]],.018,mat.rubber);

  // Brazed heat-exchanger U-bends, stamped end sheets and inlet manifolds.
  for(const cx of [-.49,.23]){
    for(let y=0;y<3;y++)for(let z=0;z<4;z++){
      const cy=2.625+y*.105,cz=.065+z*.18;
      pipe(g.heat,[[cx+.31,cy,cz-.045],[cx+.35,cy,cz-.045],[cx+.37,cy,cz],[cx+.35,cy,cz+.045],[cx+.31,cy,cz+.045]],.012,mat.copper);
    }
    bolts(g.heat,[[cx-.29,2.915,.02],[cx+.29,2.915,.02],[cx-.29,2.915,.69],[cx+.29,2.915,.69]],.014,'y');
    const plate=box(g.heat,[.4,.002,.09],[cx,2.918,.51],mat.edge,.001);
    const label=decal(g.heat,cx<0?'EVAPORATOR':'CONDENSER',.39,.07,[cx,2.921,.51],'#304b4f','transparent','600 70px Arial');label.rotation.x=-Math.PI/2;
  }
  // Compressor terminal box, anti-vibration mounts and service fittings.
  box(g.heat,[.16,.12,.13],[.52,2.98,-.59],mat.graphite,.021);
  for(const x of [.3,.74]){ring(g.heat,.055,.009,[x,2.61,-.58],mat.edge,'y');bolts(g.heat,[[x,2.625,-.58]],.023,'y');}
  cyl(g.heat,.041,.08,[.88,2.96,-.54],mat.gold,'y');cyl(g.heat,.03,.043,[.88,3.02,-.54],mat.dark,'y');
  ring(g.heat,.028,.006,[.9,2.94,.32],mat.gold);
  pipe(g.heat,[[.52,3.02,-.64],[.37,3.02,-.8],[.1,2.96,-.84],[-.2,2.9,-.85]],.009,mat.dark);
  const clips=[];for(let i=0;i<4;i++)clips.push({p:[.9,2.94,-.22+i*.21],r:[0,0,0]});
  instance(g.heat,new THREE.TorusGeometry(.029,.007,6,12),mat.rubber,clips);
  ring(g.heat,.246,.012,[-.56,2.82,-.58],mat.edge,'y');
  for(let i=0;i<4;i++){const a=i*TAU/4;rod(g.heat,[-.56,2.824,-.58],[-.56+Math.sin(a)*.245,2.824,-.58+Math.cos(a)*.245],.009,mat.graphite);}
  cyl(g.heat,.048,.016,[-.56,2.833,-.58],mat.steel,'y');
  for(const x of [-.95,.95])for(const z of [-.88,.83])bolts(g.heat,[[x,2.56,z]],.023,'y');
  // A short corrugated coupling at the warm-air supply and band clamps.
  for(let i=0;i<7;i++)ring(g.duct,.107,.009,[.927,2.24+i*.04,.55],mat.rubber,'y');
  for(const y of [2.23,2.5])ring(g.duct,.112,.009,[.927,y,.55],mat.aluminum,'y');
}
