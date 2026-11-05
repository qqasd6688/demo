import * as THREE from './vendor/three/build/three.module.min.js';
import { seededRandom, heightAt, waterDistance, riverX, WATER, HALF } from './landscape.js';

export function createUnderstory(surfaces, time, daylight) {
  const root=new THREE.Group(),random=seededRandom(521),dummy=new THREE.Object3D();
  const stoneGeo=new THREE.IcosahedronGeometry(1,2),pos=stoneGeo.attributes.position;
  for(let i=0;i<pos.count;i++) {const x=pos.getX(i),y=pos.getY(i),z=pos.getZ(i),n=1+Math.sin(x*12+y*8+z*13)*.09+Math.sin(x*23-z*18)*.045;pos.setXYZ(i,x*n,y*n,z*n);}
  stoneGeo.computeVertexNormals();
  const stones=[];
  for(let i=0;i<240;i++) {
    const x=(random()-.5)*8.1,z=(random()-.5)*8.1,y=heightAt(x,z),d=waterDistance(x,z);
    if(d<.9||y>2)continue;
    const s=.04+random()*.16;
    stones.push({x,y:y+s*.15,z,sx:s*(1+random()),sy:s*.7,sz:s});
  }
  for(const [x,z,s] of [[-3.1,1.8,.42],[2.8,.2,.36],[-2.7,-.7,.32],[3.2,3.1,.3],[-1.8,3.65,.22]])stones.push({x,y:heightAt(x,z)+s*.15,z,sx:s*1.3,sy:s*.8,sz:s});
  const rocks=new THREE.InstancedMesh(stoneGeo,surfaces.rock,stones.length);
  stones.forEach((s,i)=>{dummy.position.set(s.x,s.y,s.z);dummy.scale.set(s.sx,s.sy,s.sz);dummy.rotation.set(random()*.7,random()*6.28,random()*.5);dummy.updateMatrix();rocks.setMatrixAt(i,dummy.matrix);});rocks.castShadow=true;rocks.receiveShadow=true;root.add(rocks);
  const mossMaterial=new THREE.MeshStandardMaterial({color:'#647b38',roughness:1});
  for(const stone of stones.slice(-5)) {
    const moss=new THREE.Mesh(new THREE.SphereGeometry(1,11,7,0,Math.PI*2,0,Math.PI*.44),mossMaterial);
    moss.position.set(stone.x,stone.y,stone.z);moss.scale.set(stone.sx*.98,stone.sy*1.1,stone.sz*.98);moss.receiveShadow=true;root.add(moss);
  }
  // Exposed roots descend across the damp, stratified cutaway.
  for(let i=0;i<20;i++) {
    const x=-3.8+random()*7.6,z=HALF-.04,y=heightAt(x,z);
    if(waterDistance(x,z)<1.7)continue;
    const length=.5+random()*1.1;
    const curve=new THREE.CatmullRomCurve3([new THREE.Vector3(x,y+.015,z-.15),new THREE.Vector3(x+.08,y-.2,z+.015),new THREE.Vector3(x-.08,y-length*.65,z-.035),new THREE.Vector3(x+.07,y-length,z-.09)]);
    const tube=new THREE.Mesh(new THREE.TubeGeometry(curve,16,.012+random()*.013,5,false),surfaces.bark);tube.castShadow=true;root.add(tube);
  }
  const woodEnd=new THREE.MeshStandardMaterial({color:'#baa280',roughness:.87});
  function log(a,b,r) {
    const dir=b.clone().sub(a),mid=a.clone().add(b).multiplyScalar(.5);
    const trunk=new THREE.Mesh(new THREE.CylinderGeometry(r*.8,r,dir.length(),12,5),surfaces.bark);
    trunk.position.copy(mid);trunk.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),dir.clone().normalize());trunk.castShadow=true;trunk.receiveShadow=true;root.add(trunk);
    for(const side of [-1,1]) {
      const end=new THREE.Mesh(new THREE.CircleGeometry(r*.83,20),woodEnd);end.position.copy(side===1?b:a);end.quaternion.copy(trunk.quaternion);end.rotateX(side===1?-Math.PI/2:Math.PI/2);root.add(end);
      for(let j=1;j<4;j++){const ring=new THREE.Mesh(new THREE.RingGeometry(r*j*.18,r*j*.18+.004,20),surfaces.bark);ring.position.z=.001;end.add(ring);}
    }
  }
  log(new THREE.Vector3(-2.65,heightAt(-2.65,.85)+.12,.85),new THREE.Vector3(-1.75,heightAt(-1.75,1.3)+.12,1.3),.1);
  log(new THREE.Vector3(2.45,heightAt(2.45,3.5)+.08,3.5),new THREE.Vector3(3.15,heightAt(3.15,3.2)+.07,3.2),.07);
  // Small fungi, their gills and pale spots reward a closer look.
  const stemMat=new THREE.MeshStandardMaterial({color:'#ddd2b6',roughness:.85});
  const capMat=new THREE.MeshPhysicalMaterial({color:'#ae5738',roughness:.46,clearcoat:.2,clearcoatRoughness:.4});
  const stemGeo=new THREE.CylinderGeometry(.014,.019,.1,6);
  const capGeo=new THREE.SphereGeometry(1,12,7,0,Math.PI*2,0,Math.PI*.54);
  for(let i=0;i<29;i++) {
    const x=-2.5+random()*.65,z=.85+random()*.7,y=heightAt(x,z),s=.6+random()*.65;
    const mushroom=new THREE.Group();mushroom.position.set(x,y,z);mushroom.scale.setScalar(s);
    const stem=new THREE.Mesh(stemGeo,stemMat);stem.position.y=.05;mushroom.add(stem);
    const cap=new THREE.Mesh(capGeo,capMat);cap.scale.set(.07,.044,.07);cap.position.y=.1;cap.castShadow=true;mushroom.add(cap);
    for(let j=0;j<4;j++){const a=j*2.399,spot=new THREE.Mesh(new THREE.SphereGeometry(.008,5,4),stemMat);spot.scale.y=.35;spot.position.set(Math.cos(a)*.035,.137,Math.sin(a)*.035);mushroom.add(spot);}
    root.add(mushroom);
  }
  const reedMat=new THREE.MeshStandardMaterial({color:'#60723e',roughness:.9});
  const seedMat=new THREE.MeshStandardMaterial({color:'#6c4f32',roughness:.95});
  for(let i=0;i<48;i++) {
    const a=1.2+random()*2.5,x=.4+Math.cos(a)*1.43,z=2.35+Math.sin(a)*1.1,y=heightAt(x,z);
    if(y<WATER-.04||y>WATER+.45)continue;
    const h=.15+random()*.26;
    const stem=new THREE.Mesh(new THREE.CylinderGeometry(.006,.009,h,4),reedMat);stem.position.set(x,y+h/2,z);stem.rotation.z=(random()-.5)*.2;root.add(stem);
    const seed=new THREE.Mesh(new THREE.CapsuleGeometry(.016,.065,3,5),seedMat);seed.position.set(x,y+h,z);root.add(seed);
  }
  const lilyMaterial=new THREE.MeshPhysicalMaterial({color:'#4a784b',roughness:.5,clearcoat:.35,side:THREE.DoubleSide});
  for(let i=0;i<13;i++) {
    const x=-.35+random()*.8,z=2.55+random()*.42,s=.07+random()*.07;
    const pad=new THREE.Mesh(new THREE.CircleGeometry(s,25,.15,Math.PI*2-.3),lilyMaterial);pad.rotation.set(-Math.PI/2,0,random()*6.28);pad.position.set(x,WATER+.018,z);pad.receiveShadow=true;root.add(pad);
    if(i%5===0)for(let j=0;j<7;j++){const p=new THREE.Mesh(new THREE.SphereGeometry(1,7,5),new THREE.MeshStandardMaterial({color:'#e8c5cd',roughness:.6}));p.scale.set(.018,.035,.011);const a=j*Math.PI*2/7;p.position.set(x+Math.cos(a)*.022,WATER+.044,z+Math.sin(a)*.022);p.rotation.z=Math.cos(a)*.5;p.rotation.x=Math.sin(a)*.5;root.add(p);}
  }
  const butterflies=[];
  for(let i=0;i<8;i++){
    const butterfly=new THREE.Group(),wings=[];
    const mat=new THREE.MeshStandardMaterial({color:i%2?'#ddb65f':'#9cc8e4',roughness:.55,side:THREE.DoubleSide});
    for(const side of [-1,1]){const wing=new THREE.Mesh(new THREE.SphereGeometry(1,8,5),mat);wing.scale.set(.045,.009,.03);wing.position.x=side*.035;butterfly.add(wing);wings.push(wing);}
    root.add(butterfly);butterflies.push({root:butterfly,wings,phase:random()*Math.PI*2,x:-1.8+random()*3.6,z:1+random()*2});
  }
  const fish=[];
  const fishMat=new THREE.MeshStandardMaterial({color:'#d69a64',roughness:.4,metalness:.15});
  for(let i=0;i<6;i++){
    const f=new THREE.Mesh(new THREE.SphereGeometry(1,9,6),fishMat);f.scale.set(.08,.025,.025);root.add(f);fish.push({mesh:f,phase:i*1.047});
  }
  return {root,update(t){
    for(const b of butterflies){b.root.position.set(b.x+Math.sin(t*.4+b.phase)*.25,-.45+Math.sin(t*.8+b.phase)*.12,b.z+Math.cos(t*.3+b.phase)*.3);b.root.rotation.y=t*.25+b.phase;b.wings.forEach((w,i)=>w.rotation.z=Math.sin(t*10+b.phase)*(i?-1:1)*.8);b.root.visible=daylight.value>.25;}
    for(const f of fish){const a=t*.18+f.phase;f.mesh.position.set(.4+Math.cos(a)*.65,WATER-.09,2.3+Math.sin(a)*.45);f.mesh.rotation.y=-a;}
  }};
}
