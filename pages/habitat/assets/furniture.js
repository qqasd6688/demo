import * as T from './vendor/three/build/three.module.min.js';
import { finishes, constrainPose } from './design-state.js';

export function createFurnitureRegistry(root, resources, layout) {
  const items=new Map(),pickables=[],materials=new Map(),retained=new Set();
  const presetOptions={
    oat:{map:'fabric',color:'#f2e8d6',roughness:1,sheen:.7,scale:.264},
    sage:{map:'fabric',color:'#95ae87',roughness:1,sheen:.7,scale:.264},
    charcoal:{map:'fabric',color:'#666e72',roughness:1,sheen:.6,scale:.264},
    clay:{map:'fabric',color:'#be836c',roughness:1,sheen:.5,scale:.264},
    leather:{color:'#95603b',roughness:.39,clearcoat:.3,clearcoatRoughness:.4},
    oak:{map:'oak',color:'#e1cbaa',roughness:.72,clearcoat:.12,scale:.5},
    walnut:{map:'walnut',color:'#b7a291',roughness:.58,clearcoat:.2,scale:1},
    ivory:{color:'#e4dfd1',roughness:.4,clearcoat:.28},
    graphite:{color:'#454f4b',roughness:.72},
    marble:{map:'marble',color:'#f4eee3',roughness:.28,clearcoat:.4,scale:3},
    smoke:{map:'marble',color:'#62716e',roughness:.3,clearcoat:.4,scale:3},
    brass:{color:'#ba9657',metalness:.95,roughness:.3},
    steel:{color:'#a8b1b3',metalness:.95,roughness:.27},
    porcelain:{color:'#ede6d6',roughness:.18,clearcoat:.8},
    terracotta:{color:'#b97858',roughness:.95},
    'dark-glaze':{color:'#34433e',roughness:.2,clearcoat:.8},
  };
  function material(name) {
    if(materials.has(name))return materials.get(name);
    const {map,scale,...props}=presetOptions[name];
    const mat=new T.MeshPhysicalMaterial({...(map?resources.maps[map]:{}),...props,side:T.DoubleSide,normalScale:new T.Vector2(map==='fabric'?.5:.2,map==='fabric'?.5:.2)});
    mat.userData.metreScale=scale;materials.set(name,mat);return mat;
  }
  function register(id,name,kind,room,children,roles) {
    if(items.has(id))throw new Error(`Duplicate furniture: ${id}`);
    root.updateMatrixWorld(true);
    const bounds=new T.Box3();
    for(const child of children)child.traverse(o=>{if(o.isMesh&&!o.userData.excludeEditBounds)bounds.union(new T.Box3().setFromObject(o));});
    if(bounds.isEmpty())return;
    const center=bounds.getCenter(new T.Vector3()), model=new T.Group();model.position.set(center.x,0,center.z);model.userData.editable=true;root.add(model);model.updateMatrixWorld(true);
    children.forEach(child=>model.attach(child));
    const item={id,name,kind,room,model,roles,slots:[],finish:'original',initial:{x:center.x,z:center.z,rotation:0},footprint:{minX:bounds.min.x-center.x,maxX:bounds.max.x-center.x,minZ:bounds.min.z-center.z,maxZ:bounds.max.z-center.z},height:bounds.max.y};
    items.set(id,item);return item;
  }
  function finalize() {
    pickables.length=0;
    for(const item of items.values()) {
      item.slots=[];
      item.model.traverse(o=>{
      if(!o.isMesh||o.userData.excludeEditBounds)return;
      o.userData.furnitureId=item.id;pickables.push(o);
      const role=o.userData.editRole||item.roles(o.material);
      if(role){retained.add(o.material);item.slots.push({mesh:o,role,original:o.material,uv:o.geometry.attributes.uv?.clone()});}
      });
      if(!item.slots.length)throw new Error(`Furniture has no replaceable surface: ${item.id}`);
    }
  }
  function setFinish(item,id) {
    const finish=finishes[item.kind].find(f=>f.id===id)||finishes[item.kind][0];
    if(item.finish===finish.id)return;
    for(const slot of item.slots) {
      const mat=finish.id==='original'?slot.original:material(slot.role==='frame'?(finish.frame||finish.surface):finish.surface);
      slot.mesh.material=mat;
      const uv=slot.mesh.geometry.attributes.uv;
      if(uv&&slot.uv) {
        if(finish.id==='original'){uv.copy(slot.uv);uv.needsUpdate=true;}
        else if(mat.userData.metreScale) {
          const p=slot.mesh.geometry.attributes.position,n=slot.mesh.geometry.attributes.normal,scale=mat.userData.metreScale;
          for(let i=0;i<p.count;i++){
            const ax=Math.abs(n.getX(i)),ay=Math.abs(n.getY(i)),az=Math.abs(n.getZ(i));
            uv.setXY(i,(ay>=ax&&ay>=az?p.getX(i):ax>=az?p.getZ(i):p.getX(i))/scale,(ay>=ax&&ay>=az?p.getZ(i):p.getY(i))/scale);
          }
          uv.needsUpdate=true;
        }
      }
    }
    item.finish=finish.id;
  }
  function apply(id,pose,snap=false) {
    const item=items.get(id);if(!item)return;
    const p=constrainPose(pose,item.footprint,layout,snap);
    item.model.position.set(p.x,0,p.z);item.model.rotation.y=p.rotation*Math.PI/180;setFinish(item,p.finish);item.model.updateMatrixWorld(true);
    return p;
  }
  return {items,pickables,register,finalize,apply,
    snapshot(){return Object.fromEntries([...items.values()].map(i=>[i.id,{x:i.model.position.x,z:i.model.position.z,rotation:T.MathUtils.radToDeg(i.model.rotation.y),finish:i.finish}]));},
    applyAll(snapshot){for(const [id,pose]of Object.entries(snapshot))apply(id,pose);},
    dispose(){materials.forEach(m=>m.dispose());retained.forEach(m=>m.dispose());},
  };
}
