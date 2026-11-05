import * as T from './vendor/three/build/three.module.min.js';
import { createPalette } from './resources.js';
import { geometryKit, batchStatic } from './geometry.js';
import { wallSegments, edge } from './layouts.js';
import { furnishRoom } from './furnishings.js';
import { createFurnitureRegistry } from './furniture.js';

export function buildHome(scene, definitions, layout, resources) {
  const root=new T.Group();scene.add(root);const materials=createPalette(resources,layout.theme),m=materials;
  const {box,mesh,group,line,cylinder}=geometryKit(root),devices=new Map(),walls=[],pickables=[],windowViews=[];
  const furniture=createFurnitureRegistry(root,resources,layout);
  const glowCanvas=document.createElement('canvas');glowCanvas.width=glowCanvas.height=64;const gc=glowCanvas.getContext('2d'),gg=gc.createRadialGradient(32,32,0,32,32,32);gg.addColorStop(0,'#ffe3a33d');gg.addColorStop(1,'#ffe3a300');gc.fillStyle=gg;gc.fillRect(0,0,64,64);const glowMap=new T.CanvasTexture(glowCanvas);glowMap.colorSpace=T.SRGBColorSpace;
  function register(id,model,anchor,extras={}) {if(!definitions.some(d=>d.id===id))throw new Error(`Unknown device: ${id}`);const item={id,model,anchor:new T.Vector3(...anchor),...extras};devices.set(id,item);return item;}
  function light(id,model,space,pos,emissionMeshes,power,distance,spot) {
    const light=spot?new T.SpotLight('#ffddb0',0,distance,1.12,.75,1.5):new T.PointLight('#ffddb0',0,distance,1.5);light.position.set(...pos);space.add(light);
    if(spot){light.target.position.set(pos[0],.05,pos[2]);space.add(light.target);light.castShadow=['living-pendant','dining-pendant','master-main'].includes(id);light.shadow.mapSize.set(1024,1024);light.shadow.bias=-.0002;light.shadow.normalBias=.025;light.shadow.radius=3;}
    const pool=new T.Mesh(new T.PlaneGeometry(distance*.7,distance*.7),new T.MeshBasicMaterial({map:glowMap,transparent:true,opacity:0,depthWrite:false,blending:T.AdditiveBlending}));pool.userData.excludeEditBounds=true;pool.rotation.x=-Math.PI/2;pool.position.set(pos[0],.047,pos[2]);space.add(pool);
    return register(id,model,[space.position.x+pos[0],pos[1]+.16,space.position.z+pos[2]],{light,pool,power,emissionMeshes,space});
  }
  box(layout.width+.2,.22,layout.depth+.2,0,-.15,0,m.stone,root,.06);
  for(const room of layout.rooms){const [x0,x1,z0,z1]=room.bounds;let fm=['kitchen','bath'].includes(room.type)||layout.theme==='walnut'&&['living','dining','hall'].includes(room.type)?m.stone:m.floor;box(x1-x0-.015,.035,z1-z0-.015,(x0+x1)/2,.002,(z0+z1)/2,fm,root,0);}
  function wallEntry(g,axis,fixed,start,end,exterior,normal,height=layout.height){const x=axis==='x'?(start+end)/2:fixed,z=axis==='z'?(start+end)/2:fixed;const bounds=new T.Box3(new T.Vector3(axis==='x'?start:fixed-.085,.16,axis==='z'?start:fixed-.085),new T.Vector3(axis==='x'?end:fixed+.085,height,axis==='z'?end:fixed+.085));g.userData.moving=true;const wall={group:g,x,z,axis,length:end-start,exterior,normal:new T.Vector2(...normal),height,amount:1,bounds,decorations:[]};walls.push(wall);return wall;}
  function windowView(run,win,wall){
    const e=edge(layout.rooms.find(r=>r.id===win.room),win.side),x=e.axis==='x'?win.center:e.fixed,z=e.axis==='z'?win.center:e.fixed;
    // Local positive Z points out through the exterior wall.
    const angle=win.side==='east'?Math.PI/2:win.side==='west'?-Math.PI/2:win.side==='north'?Math.PI:0,g=group(x,0,z,angle);g.userData.moving=true;wall.decorations.push(g);
    const top=layout.height-.22,height=top-win.sill;
    box(win.width,height,.012,0,win.sill+height/2,0,m.glass,g,0);
    for(const xx of [-win.width/2,win.width/2,...(win.width>3?[-win.width/6,win.width/6]:[0])])box(.028,height+.04,.055,xx,win.sill+height/2,0,m.black,g,.004);
    for(const yy of [win.sill,top])box(win.width+.055,.035,.065,0,yy,0,m.black,g,.003);
    box(win.width+.12,.035,.2,0,win.sill-.02,-.02,m.stone,g,.008);
    const canvas=document.createElement('canvas');canvas.width=512;canvas.height=256;const c=canvas.getContext('2d'),gradient=c.createLinearGradient(0,0,0,256);gradient.addColorStop(0,'#b6c8ca');gradient.addColorStop(.6,'#e6e5d6');gradient.addColorStop(1,'#9bac96');c.fillStyle=gradient;c.fillRect(0,0,512,256);for(let layer=0;layer<3;layer++){c.fillStyle=['#adbdad','#96ab93','#7e977f'][layer];c.beginPath();c.moveTo(0,256);for(let xx=0;xx<=512;xx+=4)c.lineTo(xx,160+layer*27+Math.sin(xx/110+layer)*23);c.lineTo(512,256);c.fill();}const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;
    const vm=new T.MeshBasicMaterial({map:texture,side:T.DoubleSide});vm.userData.ownedMap=true;const landscape=mesh(new T.PlaneGeometry(win.width,height),vm,0,win.sill+height/2,.12,g);landscape.castShadow=false;landscape.userData.excludeAO=true;windowViews.push(vm);
    const curtainGroup=group(0,0,-.16,0,g),panels=[],cloth=m.linen.clone();cloth.side=T.DoubleSide;const curtainH=layout.height-.34;
    for(const sign of [-1,1]){const panel=group(sign*win.width*.43,0,0,0,curtainGroup),geo=new T.PlaneGeometry(.76,curtainH,64,36),p=geo.attributes.position;for(let i=0;i<p.count;i++){const xx=p.getX(i),yy=p.getY(i),v=(curtainH/2-yy)/curtainH;p.setXYZ(i,xx,yy+curtainH/2+.1,Math.sin(xx*54)*(.035+.025*v)+Math.sin(v*7+xx*17)*.008);}geo.computeVertexNormals();mesh(geo,cloth,0,0,0,panel);panels.push(panel);}
    box(win.width+.15,.028,.035,0,layout.height-.2,-.16,m.brass,g,.005);
    if(win.room==='master')register('master-curtain',curtainGroup,[x,layout.height-.25,z],{curtain:{g:curtainGroup,panels,width:win.width}});
  }
  for(const run of wallSegments(layout)){
    const g=group(),wall=wallEntry(g,run.axis,run.fixed,run.start,run.end,run.exterior,run.normal);
    const holes=[...run.holes,...run.windows.map(w=>({start:w.center-w.width/2,end:w.center+w.width/2,kind:'window',win:w}))].sort((a,b)=>a.start-b.start);
    const slab=(start,end,bottom,top)=>{if(end-start<.01||top-bottom<.01)return;box(run.axis==='x'?end-start:.16,top-bottom,run.axis==='z'?end-start:.16,run.axis==='x'?(start+end)/2:run.fixed,(top+bottom)/2,run.axis==='z'?(start+end)/2:run.fixed,m.wall,g,.008);};
    let cursor=run.start;
    for(const h of holes){const start=Math.max(run.start,h.start),end=Math.min(run.end,h.end);slab(cursor,start,.12,layout.height);if(h.kind==='window'){slab(start,end,.12,h.win.sill);slab(start,end,layout.height-.22,layout.height);windowView(run,h.win,wall);}else{slab(start,end,2.22,layout.height);if(h.room!=='entry'){const x=run.axis==='x'?start:run.fixed,z=run.axis==='z'?start:run.fixed,angle=run.axis==='x'?-.65:Math.PI/2-.65;const door=group(x,0,z,angle);box(end-start-.05,2.1,.035,(end-start-.05)/2,1.08,0,m.walnut,door,.01);box(.12,.02,.035,end-start-.2,1.02,.045,m.brass,door,.005);door.updateMatrixWorld(true);const b=new T.Box3().setFromObject(door);door.userData.moving=true;walls.push({group:door,x,z,axis:run.axis,length:end-start,exterior:false,normal:new T.Vector2(),height:2.2,amount:1,bounds:b,decorations:[]});}}cursor=Math.max(cursor,end);}
    slab(cursor,run.end,.12,layout.height);
    box(run.axis==='x'?run.end-run.start+.02:.18,.035,run.axis==='z'?run.end-run.start+.02:.18,run.axis==='x'?(run.start+run.end)/2:run.fixed,layout.height+.002,run.axis==='z'?(run.start+run.end)/2:run.fixed,m.trim,g,.005);
    // Skirting stays in place when the tall wall is cut away.
    for(const interval of [[run.start,...run.holes.flatMap(h=>[h.start,h.end]),run.end]])for(let i=0;i<interval.length-1;i+=2)box(run.axis==='x'?interval[i+1]-interval[i]:.18,.085,run.axis==='z'?interval[i+1]-interval[i]:.18,run.axis==='x'?(interval[i+1]+interval[i])/2:run.fixed,.067,run.axis==='z'?(interval[i+1]+interval[i])/2:run.fixed,m.trim,root,.004);
  }
  for(const room of layout.rooms.filter(r=>r.nav))furnishRoom(room,{root,materials:m,resources,layout,register,light,furniture});
  for(const d of definitions)if(!devices.has(d.id))throw new Error(`Device has no mesh: ${d.id}`);
  const excluded=new Set();
  for(const item of devices.values()) {excluded.add(item.model);if(item.pool)excluded.add(item.pool);if(!item.curtain)batchStatic(item.model,new Set([item.screen,item.led,item.air,item.drum,item.fan,...(item.emissionMeshes||[])].filter(Boolean)));}
  for(const item of furniture.items.values())batchStatic(item.model,excluded);
  batchStatic(root,excluded);
  furniture.finalize();
  for(const item of devices.values())item.model.traverse(o=>{if(o.isMesh){o.userData.deviceId=item.id;pickables.push(o);}});
  root.updateMatrixWorld(true);
  for(const device of devices.values()) {
    let parent=device.model;while(parent&&!parent.userData.editable)parent=parent.parent;
    if(parent){device.furniture=parent;device.anchorLocal=parent.worldToLocal(device.anchor.clone());}
  }
  function updateFurnitureAnchors(){root.updateMatrixWorld(true);for(const device of devices.values())if(device.furniture)device.anchor.copy(device.anchorLocal).applyMatrix4(device.furniture.matrixWorld);}
  return {root,devices,walls,pickables,windowViews,materials,furniture,updateFurnitureAnchors,dispose(){const geos=new Set(),mats=new Set(),textures=new Set();root.traverse(o=>{if(o.isLight)o.shadow?.dispose();if(o.isMesh){geos.add(o.geometry);for(const material of Array.isArray(o.material)?o.material:[o.material]){mats.add(material);if(material.userData.ownedMap&&material.map)textures.add(material.map);}}});root.removeFromParent();geos.forEach(g=>g.dispose());mats.forEach(m=>m.dispose());furniture.dispose();textures.forEach(t=>t.dispose());glowMap.dispose();}};
}
