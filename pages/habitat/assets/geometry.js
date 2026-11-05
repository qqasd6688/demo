import * as T from './vendor/three/build/three.module.min.js';
import { RoundedBoxGeometry } from './vendor/three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from './vendor/three/examples/jsm/utils/BufferGeometryUtils.js';
export function geometryKit(root) {
  function uvMetres(g,material,offset=[0,0,0]) {const scale=material.userData.metreScale;if(!scale)return;const p=g.attributes.position,n=g.attributes.normal,uv=g.attributes.uv;for(let i=0;i<p.count;i++){const ax=Math.abs(n.getX(i)),ay=Math.abs(n.getY(i)),az=Math.abs(n.getZ(i));let u,v;if(ay>=ax&&ay>=az){u=p.getX(i)+offset[0];v=p.getZ(i)+offset[2];}else if(ax>=az){u=p.getZ(i)+offset[2];v=p.getY(i)+offset[1];}else{u=p.getX(i)+offset[0];v=p.getY(i)+offset[1];}uv.setXY(i,u/scale,v/scale);}}
  function mesh(geometry,material,x=0,y=0,z=0,parent=root){uvMetres(geometry,material,[x,y,z]);const m=new T.Mesh(geometry,material);m.position.set(x,y,z);m.castShadow=!material.transparent;m.receiveShadow=true;parent.add(m);return m;}
  function box(w,h,d,x,y,z,material,parent=root,r=.015){return mesh(r?new RoundedBoxGeometry(w,h,d,r>.05?4:2,Math.min(r,w/3,h/3,d/3)):new T.BoxGeometry(w,h,d),material,x,y,z,parent);}
  function cylinder(rt,rb,h,x,y,z,material,parent=root,segments=48){return mesh(new T.CylinderGeometry(rt,rb,h,segments),material,x,y,z,parent);}
  function sphere(w,h,d,x,y,z,material,parent=root){const g=new T.SphereGeometry(1,40,24);g.scale(w/2,h/2,d/2);return mesh(g,material,x,y,z,parent);}
  function cushion(w,h,d,x,y,z,material,parent=root){const g=new T.SphereGeometry(1,48,32),p=g.attributes.position;const pow=(v,e)=>Math.sign(v)*Math.pow(Math.abs(v),e);for(let i=0;i<p.count;i++){const sx=p.getX(i),sy=p.getY(i),sz=p.getZ(i);p.setXYZ(i,pow(sx,.29)*w/2,pow(sy,.42)*h/2+(Math.sin(sx*19+sz*11)*.002)*Math.abs(sy),pow(sz,.29)*d/2);}g.computeVertexNormals();return mesh(g,material,x,y,z,parent);}
  function group(x=0,y=0,z=0,angle=0,parent=root){const g=new T.Group();g.position.set(x,y,z);g.rotation.y=angle;parent.add(g);return g;}
  function line(points,r,material,parent=root){return mesh(new T.TubeGeometry(new T.CatmullRomCurve3(points.map(p=>new T.Vector3(...p))),Math.max(16,points.length*6),r,8,false),material,0,0,0,parent);}
  function lathe(profile,x,y,z,material,parent=root){return mesh(new T.LatheGeometry(profile.map(p=>new T.Vector2(...p)),48),material,x,y,z,parent);}
  function ring(radius,tube,x,y,z,material,parent=root){return mesh(new T.TorusGeometry(radius,tube,10,64),material,x,y,z,parent);}
  return {root,mesh,box,cylinder,sphere,cushion,group,line,lathe,ring};
}
export function batchStatic(root,exclusions=new Set()) {
  root.updateMatrixWorld(true);const inverse=root.matrixWorld.clone().invert(),batches=new Map();
  root.traverse(m=>{if(!m.isMesh||Array.isArray(m.material))return;let p=m;while(p&&p!==root){if(exclusions.has(p)||p.userData.moving||p.userData.editable)return;p=p.parent;}const key=`${m.material.uuid}:${!!m.geometry.index}:${m.castShadow}:${m.receiveShadow}:${m.userData.editRole||''}`;if(!batches.has(key))batches.set(key,[]);batches.get(key).push(m);});
  for(const meshes of batches.values()){if(meshes.length<2)continue;const gs=meshes.map(m=>m.geometry.clone().applyMatrix4(inverse.clone().multiply(m.matrixWorld)));const g=mergeGeometries(gs,false);if(g){const m=new T.Mesh(g,meshes[0].material);m.userData={...meshes[0].userData};m.castShadow=meshes[0].castShadow;m.receiveShadow=meshes[0].receiveShadow;root.add(m);meshes.forEach(m=>{m.removeFromParent();m.geometry.dispose();});}gs.forEach(g=>g.dispose());}
}
