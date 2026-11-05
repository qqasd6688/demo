import * as THREE from '../vendor/three/build/three.module.min.js';
import {group,mesh} from './geometry.js';
import {paint} from './materials.js';
import {petalGeometry} from '../models/fallen-petals.js';
export const weatherPresets={sunny:{background:0xe6ebe2,sun:0xffebc7,intensity:2.65,ambient:1.75,fog:100},cloudy:{background:0xdce5e1,sun:0xe1eaf0,intensity:1.05,ambient:1.9,fog:85},rain:{background:0xb9cdcb,sun:0xc4d7e4,intensity:.65,ambient:1.5,fog:65},sunset:{background:0xe8d7c4,sun:0xffb372,intensity:2.35,ambient:1.3,fog:90},snow:{background:0xe1e9e7,sun:0xe4edf3,intensity:1.35,ambient:1.85,fog:75}};
export function createWeather(scene,lights,renderer){let current='sunny';const petals=group('floating-pink-sakura-petals'),rain=group('spring-rain'),snow=group('fine-snow');scene.add(petals,rain,snow);const particles=[];
  for(let i=0;i<76;i++){const m=mesh(petals,petalGeometry(),paint(i%2?0xe7a4b8:0xf3c4d0,{side:THREE.DoubleSide}),[0,0,0],false);m.castShadow=m.receiveShadow=false;m.scale.setScalar(.6+(i%5)*.13);particles.push({m,seed:i*2.391});}
  const drops=[];const rainMat=new THREE.MeshBasicMaterial({color:0xe1eeeb,transparent:true,opacity:.43,depthWrite:false});for(let i=0;i<230;i++){const m=mesh(rain,new THREE.CylinderGeometry(.007,.007,.18+(i%3)*.08,3),rainMat,[0,0,0],false);m.castShadow=m.receiveShadow=false;drops.push({m,seed:i*8.129});}
  const flakes=[];for(let i=0;i<120;i++){const m=mesh(snow,new THREE.IcosahedronGeometry(.025+(i%3)*.007,0),paint(0xf9faf2),[0,0,0],false);m.castShadow=m.receiveShadow=false;flakes.push({m,seed:i*4.8});}rain.visible=snow.visible=false;
  const background=new THREE.Color(),sunColor=new THREE.Color();let shadowProgress=0;
  function set(name){if(!weatherPresets[name])name='sunny';current=name;document.documentElement.dataset.weather=name;document.querySelectorAll('[data-weather]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.weather===name)));const url=new URL(location.href);url.searchParams.set('weather',name);history.replaceState(null,'',url);rain.visible=name==='rain';snow.visible=name==='snow';petals.visible=name!=='snow';shadowProgress=1;}
  document.querySelectorAll('[data-weather]').forEach(b=>b.addEventListener('click',()=>set(b.dataset.weather)));
  window.addEventListener('keydown',e=>{if(e.altKey||e.ctrlKey||e.metaKey)return;const key=Number(e.key);if(key>=1&&key<=5)set(Object.keys(weatherPresets)[key-1]);});
  set(new URLSearchParams(location.search).get('weather')||'sunny');
  function update(time,dt){const p=weatherPresets[current],a=1-Math.exp(-2.7*dt);background.set(p.background);sunColor.set(p.sun);scene.background.lerp(background,a);scene.fog.color.copy(scene.background);scene.fog.far=THREE.MathUtils.lerp(scene.fog.far,p.fog,a);lights.sun.color.lerp(sunColor,a);lights.sun.intensity=THREE.MathUtils.lerp(lights.sun.intensity,p.intensity,a);lights.hemi.intensity=THREE.MathUtils.lerp(lights.hemi.intensity,p.ambient,a);const targetX=current==='sunset'?-14:-8,targetY=current==='sunset'?8:15;lights.sun.position.x=THREE.MathUtils.lerp(lights.sun.position.x,targetX,a);lights.sun.position.y=THREE.MathUtils.lerp(lights.sun.position.y,targetY,a);if(shadowProgress>0){shadowProgress-=dt;renderer.shadowMap.needsUpdate=true;}
    for(const {m,seed} of particles){const fall=((time*.22+seed*.173)%1);const side=Math.sin(seed)>0?1:-1;m.position.set(side*5.4+Math.sin(seed*2.2+time*.22)*1.35+Math.sin(fall*4)*.3,5.3-fall*5.04,-1.2+Math.cos(seed)*1.2+fall*2.1);m.rotation.set(time*.65+seed,seed+time*.34,Math.sin(time*.6+seed));}
    if(rain.visible)for(const {m,seed} of drops){const fall=(time*1.7+seed)%1;m.position.set(Math.sin(seed*2.4)*7.6+fall*.16,.25+(1-fall)*7.5,Math.cos(seed*1.6)*7.6);m.rotation.z=.08;}
    if(snow.visible)for(const {m,seed} of flakes){const fall=(time*.13+seed)%1;m.position.set(Math.sin(seed*2.1)*7.4+Math.sin(time*.5+seed)*.25,.25+(1-fall)*7,Math.cos(seed*1.7)*7.4);}
  }
  return {update,set,get current(){return current;}};
}
