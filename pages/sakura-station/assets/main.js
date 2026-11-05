import {createRenderer} from './core/renderer.js';
import {DioramaControls} from './core/controls.js';
import {createWorld} from './map/world.js';
import {createWeather} from './core/weather.js';
const canvas=document.getElementById('scene'),loader=document.getElementById('loading');
const progress=(value,label)=>{document.getElementById('loading-progress').style.width=`${value}%`;document.getElementById('loading-label').textContent=label;};
async function start(){const {renderer,scene,camera,lights}=createRenderer(canvas);const controls=new DioramaControls(camera,canvas);controls.theta=controls.nextTheta;controls.phi=controls.nextPhi;controls.logRadius=controls.nextLog;controls.update(1);progress(8,'唤醒温柔的日光');const world=await createWorld(progress);scene.add(world);world.updateMatrixWorld(true);world.traverse(o=>{o.matrixAutoUpdate=false;o.matrixWorldAutoUpdate=false;});const weather=createWeather(scene,lights,renderer);progress(92,'准备第一缕日光');await renderer.compileAsync(scene,camera);renderer.render(scene,camera);progress(100,'春日小站已就绪');requestAnimationFrame(()=>{loader.classList.add('leaving');setTimeout(()=>loader.remove(),600);});
  let previous=performance.now(),elapsed=0,frames=0,sample=previous;function frame(now){const dt=Math.min((now-previous)/1000,.05);previous=now;elapsed+=dt;controls.update(dt);weather.update(elapsed,dt);renderer.render(scene,camera);frames++;if(frames%90===0){canvas.dataset.fps=(90000/(now-sample)).toFixed(1);canvas.dataset.drawCalls=String(renderer.info.render.calls);canvas.dataset.triangles=String(renderer.info.render.triangles);sample=now;}requestAnimationFrame(frame);}requestAnimationFrame(frame);
  window.addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);controls.resize();});
  canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();location.reload();});
  // Read-only diagnostics for local acceptance checks, never rendered as UI.
  window.__sakura={scene,camera,renderer,controls,weather,get stats(){let meshes=0,instances=0;scene.traverse(o=>{if(o.isMesh)meshes++;if(o.isInstancedMesh)instances++;});return {meshes,instances,drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,weather:weather.current,style:new URLSearchParams(location.search).get('style')||'flat'};}};
}
start().catch(error=>{console.error(error);progress(0,'场景未能打开，请刷新后重试');});
