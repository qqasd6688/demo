import * as T from './vendor/three/build/three.module.min.js';
import { createDesignStore, finishes, degrees } from './design-state.js';

export function createEditor({canvas,camera,controls,scene,home,layout,onChange,onRender,onStart}) {
  const registry=home.furniture, store=createDesignStore(layout.id,[...registry.items.values()]);
  const raycaster=new T.Raycaster(),pointer=new T.Vector2(),plane=new T.Plane(new T.Vector3(0,1,0),0);
  const gizmo=new T.Group();gizmo.visible=false;scene.add(gizmo);
  const outlineMaterial=new T.LineDashedMaterial({color:'#7a9466',dashSize:.12,gapSize:.07,depthTest:false,transparent:true,opacity:.85});
  const handleMaterial=new T.MeshBasicMaterial({color:'#658352',depthTest:false,transparent:true,opacity:.94});
  const ringMaterial=new T.MeshBasicMaterial({color:'#819c6e',depthTest:false,transparent:true,opacity:.36,side:T.DoubleSide});
  let active=false,selected=null,tool='move',snap=true,drag=null,saved=true,rotateHandle;
  const pose=()=>registry.snapshot()[selected?.id];
  function info(){return {active,selected,tool,snap,pose:selected?pose():null,canUndo:store.canUndo,canRedo:store.canRedo,saved,dragging:!!drag};}
  function notify(){onChange?.(info());}
  function update(){home.updateFurnitureAnchors();if(selected){gizmo.position.set(selected.model.position.x,.075,selected.model.position.z);gizmo.rotation.y=selected.model.rotation.y;}onRender();}
  function clearGizmo(){gizmo.traverse(o=>o.geometry?.dispose());gizmo.clear();}
  function drawGizmo(){
    clearGizmo();if(!selected)return;
    const b=selected.footprint,p=.07,x0=b.minX-p,x1=b.maxX+p,z0=b.minZ-p,z1=b.maxZ+p;
    const line=new T.LineLoop(new T.BufferGeometry().setFromPoints([[x0,z0],[x1,z0],[x1,z1],[x0,z1]].map(([x,z])=>new T.Vector3(x,0,z))),outlineMaterial);line.computeLineDistances();line.renderOrder=100;gizmo.add(line);
    for(const [x,z]of [[x0,z0],[x1,z0],[x1,z1],[x0,z1]]){const dot=new T.Mesh(new T.SphereGeometry(.045,12,8),handleMaterial);dot.position.set(x,.02,z);dot.renderOrder=102;gizmo.add(dot);}
    const radius=Math.max(.45,Math.hypot(Math.max(Math.abs(x0),Math.abs(x1)),Math.max(Math.abs(z0),Math.abs(z1)))+.16);
    const ring=new T.Mesh(new T.TorusGeometry(radius,.014,6,96),ringMaterial);ring.rotation.x=Math.PI/2;ring.renderOrder=100;ring.userData.rotateHandle=true;gizmo.add(ring);
    rotateHandle=new T.Mesh(new T.SphereGeometry(.095,20,12),handleMaterial);rotateHandle.position.set(0,.04,-radius);rotateHandle.renderOrder=103;rotateHandle.userData.rotateHandle=true;gizmo.add(rotateHandle);
    const stem=new T.Line(new T.BufferGeometry().setFromPoints([new T.Vector3(0,0,z0),new T.Vector3(0,.04,-radius)]),outlineMaterial);stem.computeLineDistances();stem.renderOrder=101;gizmo.add(stem);update();
  }
  function select(id){const item=registry.items.get(id);if(!item)return;selected=item;drawGizmo();notify();}
  function setRay(e){const r=canvas.getBoundingClientRect();pointer.set((e.clientX-r.left)/r.width*2-1,1-(e.clientY-r.top)/r.height*2);raycaster.setFromCamera(pointer,camera);}
  function point(){return raycaster.ray.intersectPlane(plane,new T.Vector3());}
  function hitFurniture(){
    const hits=raycaster.intersectObjects(registry.pickables,false);
    const hit=hits.find(h=>{let o=h.object;while(o){if(!o.visible)return false;o=o.parent;}return true;});
    if(!hit)return null;
    const wall=raycaster.intersectObjects(home.walls.filter(w=>w.amount>=.3).map(w=>w.group),true)[0];
    return wall&&wall.distance<hit.distance-.1?null:hit.object.userData.furnitureId;
  }
  function commit(){const result=store.commit(registry.snapshot());if(result.changed)saved=result.saved;notify();}
  function finishDrag(cancel=false){
    if(!drag)return;const previous=drag;drag=null;
    if(cancel)registry.apply(selected.id,previous.pose);
    if(canvas.hasPointerCapture(previous.id))canvas.releasePointerCapture(previous.id);
    controls.enabled=true;canvas.classList.remove('furniture-dragging');canvas.style.cursor='grab';update();
    if(!cancel&&previous.moved)commit();else notify();
  }
  function onDown(e){
    if(!active||e.button!==0)return;
    if(drag){e.stopImmediatePropagation();e.preventDefault();return;}
    setRay(e);gizmo.updateMatrixWorld(true);
    const handle=selected&&raycaster.intersectObjects(gizmo.children,false).some(h=>h.object.userData.rotateHandle);
    const id=handle?selected.id:hitFurniture();if(!id)return;
    e.stopImmediatePropagation();e.preventDefault();onStart();canvas.focus({preventScroll:true});
    if(selected?.id!==id)select(id);
    const p=point();if(!p)return;
    drag={id:e.pointerId,x:e.clientX,y:e.clientY,point:p,pose:pose(),action:handle?'rotate':tool,moved:false};
    controls.enabled=false;canvas.setPointerCapture(e.pointerId);canvas.classList.add('furniture-dragging');canvas.style.cursor='grabbing';notify();
  }
  function onMove(e){
    if(!active)return;setRay(e);
    if(!drag){if(e.pointerType!=='touch')canvas.style.cursor=hitFurniture()?'grab':'default';return;}
    e.stopImmediatePropagation();e.preventDefault();if(e.pointerId!==drag.id)return;
    if(Math.hypot(e.clientX-drag.x,e.clientY-drag.y)<4&&!drag.moved)return;
    drag.moved=true;const p=point();if(!p)return;
    let next={...drag.pose};
    if(drag.action==='move'){next.x+=p.x-drag.point.x;next.z+=p.z-drag.point.z;}
    else {const from=Math.atan2(drag.point.x-next.x,drag.point.z-next.z),to=Math.atan2(p.x-next.x,p.z-next.z);next.rotation+=T.MathUtils.radToDeg(to-from);}
    registry.apply(selected.id,next,snap);update();notify();
  }
  function onUp(e){if(drag&&e.pointerId===drag.id){e.stopImmediatePropagation();finishDrag();}}
  function onCancel(e){if(drag&&e.pointerId===drag.id){e.stopImmediatePropagation();finishDrag(true);}}
  function change(fields){if(!selected)return;finishDrag();registry.apply(selected.id,{...pose(),...fields});update();commit();}
  function history(action){finishDrag(true);if(action==='undo'?!store.canUndo:!store.canRedo)return;saved=store[action]();registry.applyAll(store.snapshot);update();notify();}
  function onKey(e){
    if(!active)return;
    const input=e.target.closest('input,textarea,select,[contenteditable=true]');
    if(e.key==='Escape'&&drag){e.preventDefault();e.stopImmediatePropagation();finishDrag(true);return;}
    if(input)return;
    if((e.ctrlKey||e.metaKey)&&['z','y'].includes(e.key.toLowerCase())){e.preventDefault();history(e.key.toLowerCase()==='y'||e.shiftKey?'redo':'undo');return;}
    if(e.target!==canvas||!selected)return;
    const step=e.shiftKey?.01:.1,p=pose(),key=e.key.toLowerCase();
    if(!['arrowleft','arrowright','arrowup','arrowdown','q','e'].includes(key))return;
    e.preventDefault();e.stopImmediatePropagation();
    if(key==='arrowleft')p.x-=step;if(key==='arrowright')p.x+=step;if(key==='arrowup')p.z-=step;if(key==='arrowdown')p.z+=step;
    if(key==='q')p.rotation-=e.shiftKey?1:15;if(key==='e')p.rotation+=e.shiftKey?1:15;change(p);
  }
  for(const [event,handler]of [['pointerdown',onDown],['pointermove',onMove],['pointerup',onUp],['pointercancel',onCancel],['lostpointercapture',onCancel]])canvas.addEventListener(event,handler,true);
  document.addEventListener('keydown',onKey,true);
  registry.applyAll(store.snapshot);home.updateFurnitureAnchors();onRender();
  return {
    get active(){return active;},get selected(){return selected;},get info(){return info();},get items(){return [...registry.items.values()];},finishes,
    select,change,undo:()=>history('undo'),redo:()=>history('redo'),
    setActive(value){finishDrag();active=value;gizmo.visible=value;canvas.classList.toggle('editing-canvas',value);controls.autoRotate=false;if(value){onStart();if(!selected)select('living-sofa');}canvas.setAttribute('aria-label',value?'家具编辑：拖动家具移动，拖动圆环旋转；方向键微调，Q / E 旋转，Ctrl + Z 撤销':'三维户型：拖动旋转，滚轮缩放，点击家电打开菜单');notify();},
    setTool(value){finishDrag();tool=value;ringMaterial.opacity=tool==='rotate'?.7:.36;notify();},setSnap(value){snap=value;notify();},
    rotate(amount){if(selected)change({rotation:degrees(pose().rotation+amount)});},
    reset(all=false){finishDrag(true);const result=store.reset(all?undefined:selected?.id);saved=result.saved;registry.applyAll(store.snapshot);update();notify();},
    dispose(){finishDrag(true);for(const [event,handler]of [['pointerdown',onDown],['pointermove',onMove],['pointerup',onUp],['pointercancel',onCancel],['lostpointercapture',onCancel]])canvas.removeEventListener(event,handler,true);document.removeEventListener('keydown',onKey,true);clearGizmo();gizmo.removeFromParent();outlineMaterial.dispose();handleMaterial.dispose();ringMaterial.dispose();},
  };
}
