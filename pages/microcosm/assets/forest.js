import * as THREE from './vendor/three/build/three.module.min.js';
import { seededRandom, heightAt, waterDistance, relief } from './landscape.js';

// Geometry is shared and instanced: individual boughs, leaves and forest-floor details
// remain inspectable up close without creating a draw call for each plant.
export function createForest(surfaces, time) {
  const random=seededRandom(223),root=new THREE.Group(),dummy=new THREE.Object3D(),buckets=new Map();
  function bucket(name,geometry,material){buckets.set(name,{geometry,material,items:[]});}
  function add(name,x,y,z,sx,sy,sz,color,ry=0,rz=0,rx=0){buckets.get(name).items.push({x,y,z,sx,sy,sz,color,rx,ry,rz});}
  const foliage=new THREE.MeshStandardMaterial({roughness:.84,side:THREE.DoubleSide});
  foliage.onBeforeCompile=shader=>{
    shader.uniforms.forestTime=time;
    shader.vertexShader='uniform float forestTime;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
      #ifdef USE_INSTANCING
      float phase=instanceMatrix[3].x*1.7+instanceMatrix[3].z;
      transformed.z+=sin(forestTime*.65+phase)*.018*max(0.,position.x);
      #endif`);
  };
  const branchPositions=[];
  for(let i=1;i<=12;i++) {
    const t=i/13, width=Math.sin(t*Math.PI)*.22+.015, height=.08*Math.sin(t*Math.PI);
    for(const side of [-1,1]) for(const tilt of [-.35,.35]) {
      branchPositions.push(t-.1,height,0,t-.15,height+width*tilt,width*side,t+.025,height+.022,0);
    }
  }
  const bough=new THREE.BufferGeometry();bough.setAttribute('position',new THREE.Float32BufferAttribute(branchPositions,3));bough.computeVertexNormals();
  bucket('bough',bough,foliage);
  bucket('twig',new THREE.CylinderGeometry(.012,.025,1,6),surfaces.bark);
  bucket('trunk',new THREE.CylinderGeometry(.025,.065,1,9,3),surfaces.bark);
  const leafGeometry=new THREE.SphereGeometry(1,7,5);
  const leafVertices=leafGeometry.attributes.position;
  for(let i=0;i<leafVertices.count;i++){const x=leafVertices.getX(i),y=leafVertices.getY(i),z=leafVertices.getZ(i);const d=1+Math.sin(x*14+y*19+z*11)*.14;leafVertices.setXYZ(i,x*d,y*d,z*d);}
  leafGeometry.computeVertexNormals();
  bucket('leaves',leafGeometry,foliage);
  const leafBlade=new THREE.BufferGeometry();leafBlade.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0,.5,.18,.27,1,.05,0,0,0,0,1,.05,0,.5,.18,-.27],3));leafBlade.computeVertexNormals();
  bucket('leaf',leafBlade,foliage);
  bucket('moss',new THREE.IcosahedronGeometry(1,1),new THREE.MeshStandardMaterial({roughness:1}));
  const greens=['#1f4939','#285a43','#356b4e','#467650','#537d54'];
  const lightGreens=['#647f3e','#8c994c','#506e39','#a5a660','#6b8a4e'];
  const trees=[];
  for(let i=0;i<900;i++) {
    const x=(random()-.5)*7.95,z=(random()-.5)*7.95,y=heightAt(x,z);
    if(waterDistance(x,z)<1.9||y>.8||(Math.abs(x)<1.7&&z>1.25)||Math.hypot(x-2.35,z-2.45)<.5||Math.hypot(x+2.25,z-2.95)<.38)continue;
    if(trees.some(t=>Math.hypot(t.x-x,t.z-z)<.26))continue;
    const h=.65+random()*.88, pine=random()<.8;
    trees.push({x,z});add('trunk',x,y+h*.45,z,.65+random()*.5,h,.65+random()*.5);
    if(pine) {
      const color=greens[Math.floor(random()*greens.length)];
      const phase=random()*6.28;
      for(let tier=0;tier<9;tier++) {
        const p=tier/9, radius=h*(.29*(1-p)+.025),branches=7;
        for(let j=0;j<branches;j++) {
          const a=phase+j/branches*Math.PI*2+tier*.57, length=radius*(.8+random()*.35);
          add('bough',x,y+h*(.2+p*.8),z,length,length*.9,length,color,a,-.12+random()*.2);
          if(tier%2===0)add('twig',x+Math.cos(a)*length*.4,y+h*(.2+p*.8),z-Math.sin(a)*length*.4,.55,length,.55,undefined,a,Math.PI/2-.15);
        }
      }
    } else {
      for(let j=0;j<6;j++) {
        const a=j*2.399, length=h*(.22+random()*.17),bx=x+Math.cos(a)*length*.5,bz=z+Math.sin(a)*length*.5;
        add('twig',bx,y+h*.65,bz,1,length*1.6,1,undefined,-a,-Math.PI/4);
      }
      for(let j=0;j<46;j++) {
        const a=random()*Math.PI*2,r=Math.sqrt(random())*h*.31,bx=x+Math.cos(a)*r,bz=z+Math.sin(a)*r;
        const by=y+h*(.72+random()*.35)-r*.28;
        const s=h*(.07+random()*.055),color=lightGreens[Math.floor(random()*lightGreens.length)];
        add('leaves',bx,by,bz,s,s*.7,s,color,random()*6.28);
        for(let k=0;k<2;k++)add('leaf',bx,by+s*.5,bz,s*1.7,s,s,color,random()*6.28);
      }
    }
  }
  const grassPositions=[];
  for(let j=0;j<9;j++) {const a=j*2.4,x=Math.cos(a)*.06,z=Math.sin(a)*.06,h=.07+random()*.12;grassPositions.push(x-.008,0,z,x+.008,0,z,x+.04,h*.65,z+.02,x+.008,0,z,x+.055,h,z+.03,x+.04,h*.65,z+.02);}
  const grass=new THREE.BufferGeometry();grass.setAttribute('position',new THREE.Float32BufferAttribute(grassPositions,3));grass.computeVertexNormals();bucket('grass',grass,foliage);
  const fernPositions=[];
  for(let j=1;j<=10;j++){const t=j/11,w=Math.sin(t*Math.PI)*.2;for(const s of [-1,1])fernPositions.push(t-.06,Math.sin(t*Math.PI)*.2,0,t-.13,Math.sin(t*Math.PI)*.2,w*s,t+.03,Math.sin(t*Math.PI)*.2,0);}
  const fern=new THREE.BufferGeometry();fern.setAttribute('position',new THREE.Float32BufferAttribute(fernPositions,3));fern.computeVertexNormals();bucket('fern',fern,foliage);
  bucket('flower',new THREE.SphereGeometry(1,5,4),new THREE.MeshStandardMaterial({roughness:.65}));
  for(let i=0;i<6500;i++) {
    const x=(random()-.5)*8.1,z=(random()-.5)*8.1,y=heightAt(x,z),d=waterDistance(x,z);
    if(y>.85||d<1.4)continue;
    const s=.45+random()*.65;
    add('grass',x,y+.01,z,s,s,s,random()<.5?'#81934c':'#4e733d',random()*6.28);
    if(i%4===0)add('moss',x,y+.01,z,.04+random()*.07,.025,.06,random()<.5?'#668244':'#82954a');
    if(i%35===0)for(let j=0;j<7;j++)add('fern',x,y+.025,z,.18,.22,.18,'#497b45',j/7*Math.PI*2,-.1);
    if(i%12===0)for(let p=0;p<5;p++){const a=p*Math.PI*.4;add('flower',x+Math.cos(a)*.021,y+.1,z+Math.sin(a)*.021,.025,.012,.014,random()<.6?'#f1e4b7':'#a99bc4',a);}
  }
  for(const [name,{geometry,material,items}] of buckets) {
    const mesh=new THREE.InstancedMesh(geometry,material,items.length);mesh.name=name;
    items.forEach((a,i)=>{dummy.position.set(a.x,a.y,a.z);dummy.scale.set(a.sx,a.sy,a.sz);dummy.rotation.set(a.rx,a.ry,a.rz);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);if(a.color)mesh.setColorAt(i,new THREE.Color(a.color));});
    mesh.instanceMatrix.needsUpdate=true;mesh.castShadow=!['flower','moss','grass'].includes(name);mesh.receiveShadow=true;root.add(mesh);
  }
  return root;
}
