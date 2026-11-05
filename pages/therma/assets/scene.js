import * as THREE from './vendor/three/build/three.module.min.js';
import { OrbitControls } from './vendor/three/examples/jsm/controls/OrbitControls.js';
import { createWasher, PARTS } from './model.js';
import { createStudioEnvironment, createRenderPipeline, createContactShadow } from './rendering.js';

const ease = (t) => t < .5 ? 4*t*t*t : 1-Math.pow(-2*t+2,3)/2;
export function createScene({canvas,stage,onSelect,onCameraChange,onReady,onError}) {
  const renderer = new THREE.WebGLRenderer({canvas,antialias:true,alpha:true,powerPreference:'high-performance',preserveDrawingBuffer:true});
  renderer.setPixelRatio(1);renderer.setClearColor(0x000000,0);
  renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.96;
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;renderer.shadowMap.autoUpdate=false;
  renderer.transmissionResolutionScale=1;
  const scene=new THREE.Scene();
  const envTarget=createStudioEnvironment(renderer);scene.environment=envTarget.texture;scene.environmentIntensity=.7;
  const camera=new THREE.OrthographicCamera(-5,5,4,-4,.1,100);camera.position.set(7.35,6.1,8.85);
  const controls=new OrbitControls(camera,canvas);controls.target.set(.35,1.7,-.15);controls.enableDamping=true;controls.dampingFactor=.075;controls.enablePan=false;controls.minZoom=.65;controls.maxZoom=2.8;controls.minPolarAngle=.12;controls.maxPolarAngle=Math.PI*.57;controls.rotateSpeed=.65;controls.zoomSpeed=.8;
  const hemi=new THREE.HemisphereLight('#eef3ed','#59664e',.38);scene.add(hemi);
  const key=new THREE.DirectionalLight('#fff5e8',2.8);key.position.set(-3,7,6);key.castShadow=true;key.shadow.mapSize.set(3072,3072);key.shadow.camera.left=-5;key.shadow.camera.right=5;key.shadow.camera.top=6;key.shadow.camera.bottom=-4;key.shadow.normalBias=.008;key.shadow.bias=-.00008;key.shadow.radius=3;scene.add(key);
  const fill=new THREE.DirectionalLight('#dae9ff',.85);fill.position.set(5,3,1);scene.add(fill);
  const rim=new THREE.DirectionalLight('#e6f4ff',1.65);rim.position.set(1,5,-5);scene.add(rim);
  const washer=createWasher();scene.add(washer.root);
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(200,200),new THREE.ShadowMaterial({color:'#596e4a',opacity:.025}));floor.rotation.x=-Math.PI/2;floor.position.y=-.4;floor.receiveShadow=true;scene.add(floor);
  const shadowCanvas=document.createElement('canvas');shadowCanvas.width=shadowCanvas.height=256;const sctx=shadowCanvas.getContext('2d');const gradient=sctx.createRadialGradient(128,128,4,128,128,126);gradient.addColorStop(0,'rgba(66,88,48,0.18)');gradient.addColorStop(.45,'rgba(66,88,48,0.09)');gradient.addColorStop(1,'rgba(66,88,48,0)');sctx.fillStyle=gradient;sctx.fillRect(0,0,256,256);
  const contact=new THREE.Mesh(new THREE.PlaneGeometry(6.7,5.7),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(shadowCanvas),transparent:true,depthWrite:false}));contact.rotation.x=-Math.PI/2;contact.position.set(0,-.385,0);scene.add(contact);
  const grid=new THREE.GridHelper(14,28,'#a8b49a','#b5c1a8');grid.position.y=-.401;grid.material.transparent=true;grid.material.opacity=.038;scene.add(grid);
  const floorRing=new THREE.Mesh(new THREE.RingGeometry(2.85,2.856,160),new THREE.MeshBasicMaterial({color:'#b5c2a5',transparent:true,opacity:.16,side:THREE.DoubleSide}));floorRing.rotation.x=-Math.PI/2;floorRing.position.y=-.38;scene.add(floorRing);
  const contactShadow=createContactShadow(renderer,scene,washer.root);
  const pipeline=createRenderPipeline(renderer,scene,camera);
  const flowRoot=new THREE.Group();scene.add(flowRoot);flowRoot.visible=false;
  const streams=[];let activeLoop='air';
  const particleGeo=new THREE.SphereGeometry(.028,8,6);
  for(const [type,paths] of [['air',washer.airPaths],['refrigerant',washer.refrigerantPaths]]) {
    const loopGroup=new THREE.Group();flowRoot.add(loopGroup);loopGroup.userData.type=type;
    for(const path of paths){
      const curve=new THREE.CatmullRomCurve3(path.points.map(p=>new THREE.Vector3(...p)),false,'catmullrom',.2);
      const material=new THREE.MeshBasicMaterial({color:path.color,transparent:true,opacity:.16,depthWrite:false,depthTest:false});
      const tube=new THREE.Mesh(new THREE.TubeGeometry(curve,90,type==='air'?.045:.024,8,false),material);tube.renderOrder=10;loopGroup.add(tube);
      const thread=new THREE.Mesh(new THREE.TubeGeometry(curve,90,.008,5,false),new THREE.MeshBasicMaterial({color:path.color,transparent:true,opacity:.65,depthWrite:false,depthTest:false}));thread.renderOrder=11;loopGroup.add(thread);
      const count=Math.ceil(curve.getLength()*7);const dots=new THREE.InstancedMesh(particleGeo,new THREE.MeshBasicMaterial({color:path.color,depthTest:false}),count);dots.renderOrder=12;loopGroup.add(dots);streams.push({curve,dots,count,type});
      for(const position of [.32,.76]){const arrow=new THREE.Mesh(new THREE.ConeGeometry(.052,.13,10),new THREE.MeshBasicMaterial({color:path.color,depthTest:false}));arrow.position.copy(curve.getPointAt(position));arrow.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),curve.getTangentAt(position));arrow.renderOrder=13;loopGroup.add(arrow);}
    }
  }
  const annotations=document.querySelector('#annotations');
  const labels=PARTS.map((part,i)=>{const el=document.createElement('button');el.className='annotation';el.setAttribute('aria-label',`查看${part.name}`);el.innerHTML=`<span class="annotation-dot"></span><span class="annotation-line"></span><span class="annotation-text"><span class="annotation-index">0${i+1}</span>${part.short}</span>`;el.addEventListener('click',()=>onSelect(part.id));annotations.append(el);return {id:part.id,el,index:i};});
  for(const [name,point,left] of [['蒸发器 · 冷却除湿',[-.83,2.74,.69],true],['冷凝器 · 再热送风',[.54,2.74,.7],false],['变频压缩机',[.65,2.97,-.6],false]]){const el=document.createElement('span');el.className='annotation thermal-annotation';el.innerHTML=`<span class="annotation-dot"></span><span class="annotation-line"></span><span class="annotation-text">${name}</span>`;annotations.append(el);labels.unshift({id:'heatpump',el,point:new THREE.Vector3(...point),left,thermalOnly:true});}
  const state={mode:'exploded',amount:0,targetAmount:.65,selected:null,isolated:false,autoRotate:false,labels:true,paused:false,cameraPreset:'perspective'};
  let width=1,height=1,pixelRatio=1,frame=0,time=0,last=performance.now(),alive=true,visible=true,cameraTween=null,opening=true,dirty=true,shadowStamp='',lastShadowTime=0;
  let explosionTransition={from:0,to:.65,start:performance.now()+250,duration:2100};
  const targetPoint=new THREE.Vector3(),projected=new THREE.Vector3(),dummy=new THREE.Object3D();
  const initialTarget=new THREE.Vector3(.35,1.7,-.15);
  function fit(){width=stage.clientWidth;height=stage.clientHeight;const ratio=width/height;const mobile=innerWidth<=800;const span=mobile?Math.max(7.4,8.6/ratio):7.15;camera.left=-span*ratio/2;camera.right=span*ratio/2;camera.top=span/2;camera.bottom=-span/2;camera.updateProjectionMatrix();pixelRatio=Math.min(2,Math.max(1.5,devicePixelRatio),Math.sqrt(4200000/(width*height)));renderer.setPixelRatio(pixelRatio);renderer.setSize(width,height,false);pipeline.setSize(width,height,pixelRatio);dirty=true;}
  const observer=new ResizeObserver(fit);observer.observe(stage);fit();
  function setAmount(value,immediate=false){dirty=true;state.targetAmount=Math.max(0,Math.min(1,value));opening=false;if(immediate){explosionTransition=null;state.amount=state.targetAmount;}else explosionTransition={from:state.amount,to:state.targetAmount,start:performance.now(),duration:1100};}
  function setCamera(preset='perspective',zoom){
    const center=initialTarget.clone();let bounds;
    if(state.isolated){const relevant=washer.pieces.filter(p=>p.id===state.selected);bounds=new THREE.Box3();for(const p of relevant)bounds.expandByObject(p.object);bounds.getCenter(center);}
    const offsets={perspective:[7,4.4,9],front:[0,.02,11],side:[11,.02,.001],top:[.001,11,.001]};
    if(state.isolated&&state.selected==='drive')offsets.perspective=new THREE.Vector3(5,3,-10).applyQuaternion(washer.pieces.find(p=>p.id==='drive').object.quaternion).toArray();
    const destination=new THREE.Vector3(...offsets[preset]).add(center);
    if(bounds){const direction=new THREE.Vector3(...offsets[preset]).normalize(),right=new THREE.Vector3().crossVectors(new THREE.Vector3(0,1,0),direction).normalize(),up=new THREE.Vector3().crossVectors(direction,right).normalize();let halfWidth=0,halfHeight=0;for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z]){const corner=new THREE.Vector3(x,y,z).sub(center);halfWidth=Math.max(halfWidth,Math.abs(corner.dot(right)));halfHeight=Math.max(halfHeight,Math.abs(corner.dot(up)));}zoom=Math.max(.65,Math.min(2.65,.69*(camera.right-camera.left)/(halfWidth*2),.68*(camera.top-camera.bottom)/(halfHeight*2)));}
    cameraTween={from:camera.position.clone(),to:destination,fromTarget:controls.target.clone(),toTarget:center,fromZoom:camera.zoom,toZoom:zoom??(state.mode==='thermal'?1.13:1),start:performance.now(),duration:1050};state.cameraPreset=preset;onCameraChange(preset);
  }
  function setMode(mode){state.mode=mode;state.isolated=false;state.selected=null;flowRoot.visible=mode==='thermal';setAmount(mode==='exploded'?.65:0);setCamera('perspective');}
  function select(id){dirty=true;state.selected=id;labels.forEach(l=>l.el.classList.toggle('selected',l.id===id));if(state.isolated){state.isolated=false;setCamera(state.cameraPreset);}}
  function isolate(active){state.isolated=active;flowRoot.visible=state.mode==='thermal'&&!active;setCamera('perspective',active?1.55:undefined);}
  controls.addEventListener('change',()=>{dirty=true;});
  controls.addEventListener('start',()=>{cameraTween=null;state.autoRotate=false;document.querySelector('#rotate-toggle').setAttribute('aria-pressed','false');document.querySelector('#rotate-toggle').classList.remove('active');document.querySelectorAll('[data-camera]').forEach(b=>{b.classList.remove('active');b.setAttribute('aria-pressed','false');});});
  const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2();let pointerDown=null,lastHover=0;
  const hitTest=(event)=>{const rect=canvas.getBoundingClientRect();pointer.set((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);raycaster.setFromCamera(pointer,camera);const candidates=washer.targets.filter(m=>{let object=m;while(object){if(!object.visible)return false;object=object.parent;}return m.material.opacity>.4;});return raycaster.intersectObjects(candidates,false)[0]?.object.userData.partId;};
  canvas.addEventListener('pointerdown',e=>{pointerDown={x:e.clientX,y:e.clientY};});
  canvas.addEventListener('pointerup',e=>{if(pointerDown&&Math.hypot(e.clientX-pointerDown.x,e.clientY-pointerDown.y)<5){const id=hitTest(e);if(id)onSelect(id);}pointerDown=null;});
  canvas.addEventListener('pointercancel',()=>{pointerDown=null;});
  canvas.addEventListener('pointermove',e=>{const now=performance.now();if(!pointerDown&&now-lastHover>45){canvas.style.cursor=hitTest(e)?'pointer':'grab';lastHover=now;}});
  canvas.addEventListener('keydown',e=>{if(e.key==='0'){setCamera();}if(e.key==='+'||e.key==='='){camera.zoom=Math.min(2.8,camera.zoom*1.1);camera.updateProjectionMatrix();dirty=true;}if(e.key==='-'){camera.zoom=Math.max(.65,camera.zoom/1.1);camera.updateProjectionMatrix();dirty=true;}});
  function updateLabels(){
    const boxes=[];const canShow=state.labels&&!state.isolated&&(state.amount>.18||state.mode==='cutaway'||state.mode==='thermal');
    for(const label of labels){
      let show=canShow;
      if(label.thermalOnly)show=show&&state.mode==='thermal';
      else if(state.mode==='thermal')show=show&&['drum','base'].includes(label.id);
      if(state.mode==='cutaway')show=show&&!['shell','control','tub'].includes(label.id);
      if(label.point)projected.copy(label.point);else washer.anchor(label.id,projected);projected.project(camera);
      let x=(projected.x*.5+.5)*width,y=(-projected.y*.5+.5)*height;
      const left=label.left??['shell','control','tub','suspension'].includes(label.id);label.el.classList.toggle('left',left);
      const textWidth=label.el.offsetWidth||120;
      let bounds={x:left?x-textWidth:x,y:y-12,w:textWidth,h:25};
      if(x<15||x>width-15||y<70||y>height-135||projected.z>1)show=false;
      if(bounds.x<8||bounds.x+bounds.w>width-8)show=false;
      if(boxes.some(b=>Math.abs(b.y-bounds.y)<24&&b.x<bounds.x+bounds.w&&bounds.x<b.x+b.w))show=false;
      if(show)boxes.push(bounds);
      label.el.style.left=`${x}px`;label.el.style.top=`${y}px`;label.el.classList.toggle('visible',show);label.el.tabIndex=show&&!label.thermalOnly?0:-1;label.el.setAttribute('aria-hidden',String(!show));label.el.style.pointerEvents=show&&!label.thermalOnly?'auto':'none';
    }
  }
  function animate(now){
    if(!alive)return;frame=requestAnimationFrame(animate);if(!visible)return;
    const dt=Math.min((now-last)/1000,.05);last=now;if(!state.paused)time+=dt;
    if(explosionTransition||cameraTween||state.autoRotate||(state.mode==='thermal'&&!state.paused))dirty=true;
    if(explosionTransition){const t=Math.max(0,Math.min(1,(now-explosionTransition.start)/explosionTransition.duration));state.amount=THREE.MathUtils.lerp(explosionTransition.from,explosionTransition.to,ease(t));if(t===1){explosionTransition=null;opening=false;}}
    if(cameraTween){const t=Math.min(1,(now-cameraTween.start)/cameraTween.duration),e=ease(t);camera.position.lerpVectors(cameraTween.from,cameraTween.to,e);controls.target.lerpVectors(cameraTween.fromTarget,cameraTween.toTarget,e);camera.zoom=THREE.MathUtils.lerp(cameraTween.fromZoom,cameraTween.toZoom,e);camera.updateProjectionMatrix();if(t===1)cameraTween=null;}
    controls.autoRotate=state.autoRotate;controls.autoRotateSpeed=.65;controls.update(dt);
    if(!dirty)return;
    dirty=false;washer.update(state.amount,state.mode,state.selected,state.isolated);
    if(state.mode==='thermal'&&!state.paused){washer.rotating[0].rotation.z+=dt*.22;washer.rotating[1].rotation.y+=dt*5;}
    for(const group of flowRoot.children)group.visible=group.userData.type===activeLoop;
    if(flowRoot.visible){for(const s of streams){if(s.type!==activeLoop)continue;for(let i=0;i<s.count;i++){const t=(i/s.count+time*.31/s.curve.getLength())%1;dummy.position.copy(s.curve.getPointAt(t));dummy.scale.setScalar(s.type==='air'?.78:1.05);dummy.updateMatrix();s.dots.setMatrixAt(i,dummy.matrix);}s.dots.instanceMatrix.needsUpdate=true;}}
    const nextShadowStamp=`${state.mode}|${state.amount.toFixed(3)}|${state.isolated}|${state.selected}`;
    if(nextShadowStamp!==shadowStamp&&(now-lastShadowTime>60||!explosionTransition)){
      contactShadow.update();renderer.shadowMap.needsUpdate=true;shadowStamp=nextShadowStamp;lastShadowTime=now;
    }
    updateLabels();pipeline.render(dt);
    const diagnostic={ready:'true',mode:state.mode,explosion:state.amount.toFixed(3),selected:state.selected||'',isolated:String(state.isolated),flow:activeLoop,flowPaused:String(state.paused),quality:'MSAA4 + GTAO',drawWidth:String(canvas.width),drawHeight:String(canvas.height)};
    for(const [key,value] of Object.entries(diagnostic))if(canvas.dataset[key]!==value)canvas.dataset[key]=value;
  }
  function handleVisibility(){visible=!document.hidden;last=performance.now();}
  document.addEventListener('visibilitychange',handleVisibility);
  canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();cancelAnimationFrame(frame);onError(new Error('WebGL context lost'));});
  canvas.addEventListener('webglcontextrestored',()=>location.reload());
  requestAnimationFrame(now=>{animate(now);onReady();});
  async function capture(){
    const result=document.createElement('canvas'),ratio=height/width;
    // Keep exports within an 8 MP / 4096 px GPU budget, including portrait screens.
    result.width=Math.floor(Math.min(3840,4096/ratio,Math.sqrt(8000000/ratio)));result.height=Math.round(result.width*ratio);
    // Re-render the geometry at the export resolution instead of enlarging the preview.
    renderer.setPixelRatio(1);renderer.setSize(result.width,result.height,false);pipeline.setSize(result.width,result.height,1);
    try{
      pipeline.render(0);const ctx=result.getContext('2d');ctx.fillStyle='#f3f5ee';ctx.fillRect(0,0,result.width,result.height);ctx.drawImage(canvas,0,0);
      const scale=result.width/3840;ctx.save();ctx.scale(scale,scale);
      ctx.fillStyle='#344b38';ctx.font='500 47px Arial';ctx.fillText('T H E R M A  /  TH–01',96,102);
      ctx.fillStyle='#8b9b7d';ctx.font='28px Arial';ctx.fillText('HEAT PUMP WASHER / DRYER  ·  CONCEPT MODEL',96,result.height/scale-72);
      ctx.textAlign='right';ctx.fillText({assembled:'ASSEMBLED',exploded:'EXPLODED VIEW',cutaway:'CUTAWAY',thermal:'HEAT PUMP CYCLE'}[state.mode],result.width/scale-96,result.height/scale-72);ctx.restore();
    }finally{renderer.setPixelRatio(pixelRatio);renderer.setSize(width,height,false);pipeline.setSize(width,height,pixelRatio);dirty=true;}
    return new Promise(resolve=>result.toBlob(resolve,'image/png'));
  }
  function dispose(){alive=false;cancelAnimationFrame(frame);observer.disconnect();controls.dispose();document.removeEventListener('visibilitychange',handleVisibility);pipeline.dispose();contactShadow.dispose();const geometries=new Set(),materials=new Set(),textures=new Set();scene.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.material){for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m);}});for(const m of materials){for(const value of Object.values(m))if(value?.isTexture)textures.add(value);m.dispose();}for(const g of geometries)g.dispose();for(const t of textures)t.dispose();envTarget.dispose();renderer.dispose();}
  return {state,setMode,setAmount,setCamera,select,isolate,capture,dispose,setLoop(type){dirty=true;activeLoop=type;},setLabels(value){dirty=true;state.labels=value;},setRotation(value){dirty=true;state.autoRotate=value;},setPaused(value){dirty=true;state.paused=value;}};
}
