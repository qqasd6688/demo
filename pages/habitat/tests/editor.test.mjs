import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../assets/vendor/three/build/three.module.min.js';
import { createDesignStore, designKey, finishes, constrainPose } from '../assets/design-state.js';
import { layouts } from '../assets/layouts.js';
import { createState } from '../assets/state.js';

const {buildHome}=await import('../assets/model.js');
const memory=()=>{const data=new Map();return {getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v)};};
const descriptors=[{id:'sofa',kind:'textile',initial:{x:1,z:2,rotation:0}},{id:'desk',kind:'wood',initial:{x:-1,z:0,rotation:0}}];

test('家具编辑按户型保存，刷新恢复，非法记录不破坏默认布局',()=>{
  const storage=memory(),family=createDesignStore('family',descriptors,storage),next=family.snapshot;
  next.sofa={x:2,z:3,rotation:450,finish:'sage'};family.commit(next);
  assert.deepEqual(createDesignStore('family',descriptors,storage).snapshot.sofa,{x:2,z:3,rotation:90,finish:'sage'});
  assert.equal(createDesignStore('grand',descriptors,storage).snapshot.sofa.finish,'original');
  storage.setItem(designKey('compact'),JSON.stringify({version:1,items:{sofa:{x:'bad',z:8,rotation:20,finish:'unknown'},ghost:{x:4}}}));
  assert.deepEqual(createDesignStore('compact',descriptors,storage).snapshot,createDesignStore('grand',descriptors,storage).defaults);
  storage.setItem(designKey('compact'),'{broken');assert.equal(createDesignStore('compact',descriptors,storage).snapshot.sofa.x,1);
});
test('位置和材质共同撤销，恢复单件及全屋可撤销，新操作清空重做',()=>{
  const store=createDesignStore('test',descriptors,memory()),initial=store.snapshot,next=store.snapshot;
  next.sofa.x=3;next.sofa.finish='leather';store.commit(next);
  store.undo();assert.deepEqual(store.snapshot,initial);assert.equal(store.canRedo,true);
  store.redo();assert.equal(store.snapshot.sofa.finish,'leather');
  store.reset('sofa');assert.deepEqual(store.snapshot,initial);store.undo();assert.equal(store.snapshot.sofa.x,3);
  store.reset();store.undo();assert.equal(store.snapshot.sofa.finish,'leather');
  store.undo();const other=store.snapshot;other.desk.finish='walnut';store.commit(other);assert.equal(store.canRedo,false);
  const unavailable=createDesignStore('offline',descriptors,{getItem(){throw Error();},setItem(){throw Error();}}),p=unavailable.snapshot;p.sofa.x=5;
  assert.equal(unavailable.commit(p).saved,false);assert.equal(unavailable.snapshot.sofa.x,5);unavailable.undo();assert.equal(unavailable.snapshot.sofa.x,1);
});
test('10cm / 15度吸附和旋转后的家具边界约束',()=>{
  const footprint={minX:-2,maxX:2,minZ:-.5,maxZ:.5},layout={width:8,depth:6};
  const p=constrainPose({x:9,z:9,rotation:91,finish:'original'},footprint,layout,true);
  assert.deepEqual(p,{x:3.5,z:1,rotation:90,finish:'original'});
  assert.deepEqual(constrainPose({x:.26,z:-.24,rotation:-2,finish:'oak'},footprint,layout,true),{x:.3,z:-.2,rotation:0,finish:'oak'});
  assert.equal(constrainPose({x:.267,z:.242,rotation:7,finish:'oak'},footprint,layout).x,.267);
});

// Geometry integration only: generated CanvasTextures are not rendered in Node.
const gradient={addColorStop(){}};
globalThis.document={createElement:()=>({width:1,height:1,getContext:()=>new Proxy({createLinearGradient:()=>gradient,createRadialGradient:()=>gradient},{get:(o,k)=>o[k]||(()=>{})})})};
function resources(){
  const chair=new T.Group();for(const part of ['legs','pillow']){const material=new T.MeshPhysicalMaterial({name:`modern_arm_chair_01_${part}`});const mesh=new T.Mesh(new T.BoxGeometry(.5,.3,.5),material);mesh.position.y=part==='legs'?.2:.5;chair.add(mesh);}
  return {maps:Object.fromEntries(['floor','walnut','oak','fabric','marble'].map(k=>[k,{}])),chair};
}
for(const layout of layouts)test(`${layout.area}㎡：全部家具具备独立拾取与4–5种材质，切换不污染其他家具`,()=>{
  const home=buildHome(new T.Scene(),createState(memory(),layout.id).devices,layout,resources()),registry=home.furniture;
  try{
    for(const id of ['living-sofa','living-console','dining-table','master-bed','master-wardrobe','kitchen-cabinet'])assert.ok(registry.items.has(id));
    assert.ok(layout.rooms.filter(r=>r.nav).every(r=>[...registry.items.values()].some(i=>i.room===r.id)));
    for(const item of registry.items.values()){
      assert.ok(finishes[item.kind].length>=3&&finishes[item.kind].length<=5);
      assert.ok(item.slots.length>0);assert.ok(registry.pickables.some(m=>m.userData.furnitureId===item.id));
    }
    const chair=registry.items.get('dining-chair-1'),other=registry.items.get('dining-chair-2'),original=chair.slots.map(s=>s.mesh.material),others=other.slots.map(s=>s.mesh.material),uv=chair.slots.map(s=>Array.from(s.mesh.geometry.attributes.uv.array));
    registry.apply(chair.id,{...chair.initial,finish:'leather-walnut'});
    assert.ok(chair.slots.every((s,i)=>s.mesh.material!==original[i]));assert.deepEqual(other.slots.map(s=>s.mesh.material),others);
    assert.notEqual(chair.slots.find(s=>s.role==='frame').mesh.material,chair.slots.find(s=>s.role==='surface').mesh.material);
    registry.apply(chair.id,{...chair.initial,finish:'original'});
    assert.deepEqual(chair.slots.map(s=>s.mesh.material),original);assert.deepEqual(chair.slots.map(s=>Array.from(s.mesh.geometry.attributes.uv.array)),uv);
    for(const item of registry.items.values())for(const finish of finishes[item.kind]){registry.apply(item.id,{...item.initial,finish:finish.id});assert.equal(item.finish,finish.id);} 
  }finally{home.dispose();}
});
test('床头柜与书桌移动旋转后，灯光、发光部件和设备锚点跟随且互相独立',()=>{
  const layout=layouts.find(l=>l.id==='family'),home=buildHome(new T.Scene(),createState(memory(),layout.id).devices,layout,resources());
  try{
    for(const [id,deviceId]of [['master-nightstand-1','master-left'],['study-desk','study-lamp'],['living-console','living-strip']]){
      const item=home.furniture.items.get(id),device=home.devices.get(deviceId),local=device.light.position.clone(),poolLocal=device.pool.position.clone(),rightBefore=home.devices.get('master-right').anchor.clone();
      assert.equal(device.furniture,item.model);assert.equal(device.light.parent,item.model);assert.equal(device.pool.parent,item.model);
      home.furniture.apply(id,{x:0,z:0,rotation:90,finish:'walnut'});home.updateFurnitureAnchors();
      assert.ok(device.light.getWorldPosition(new T.Vector3()).distanceTo(local.applyMatrix4(item.model.matrixWorld))<1e-6);
      assert.ok(device.pool.getWorldPosition(new T.Vector3()).distanceTo(poolLocal.applyMatrix4(item.model.matrixWorld))<1e-6);
      assert.ok(device.anchor.distanceTo(device.anchorLocal.clone().applyMatrix4(item.model.matrixWorld))<1e-6);
      assert.ok(home.devices.get('master-right').anchor.distanceTo(rightBefore)<1e-6);
      assert.ok(device.emissionMeshes.every(m=>m.material.emissive instanceof T.Color));
    }
    const pendant=home.devices.get('living-pendant');assert.equal(pendant.light.target.parent,pendant.furniture);
    assert.ok(home.devices.get('study-monitor').furniture===home.furniture.items.get('study-desk').model);
  }finally{home.dispose();}
});
