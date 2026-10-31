import * as THREE from '../vendor/three/build/three.module.min.js';
export const style = new URLSearchParams(location.search).get('style') === 'toon' ? 'toon' : 'flat';
const ramp = new THREE.DataTexture(new Uint8Array([100,180,245]),3,1,THREE.RedFormat);
ramp.minFilter=ramp.magFilter=THREE.NearestFilter;ramp.needsUpdate=true;
const cache=new Map();
export function paint(color, options={}) {
  const key=options.map?null:JSON.stringify([color,options]);
  if(!options.map && cache.has(key))return cache.get(key);
  const props={color,side:THREE.FrontSide,...options};
  if(props.map&&!props.map.userData.graphic&&style==='flat')delete props.map;
  const mat=style==='toon'?new THREE.MeshToonMaterial({...props,gradientMap:ramp}):new THREE.MeshLambertMaterial({...props,flatShading:true});
  if(!options.map)cache.set(key,mat);return mat;
}
export const glass=new THREE.MeshPhysicalMaterial({color:0xc7e6dc,transparent:true,opacity:.115,roughness:.08,metalness:.05,depthWrite:false,side:THREE.DoubleSide});
export const edge=new THREE.LineBasicMaterial({color:0x344640,transparent:true,opacity:style==='toon'?.46:.22});
export const silhouette=new THREE.MeshBasicMaterial({color:0x617363,side:THREE.BackSide});
export const palette={cream:0xe9debe,ivory:0xf4eddb,green:0x527c69,dark:0x354d48,wood:0x9d7351,rust:0x9d634a,roof:0xb97461,pink:0xe7afbe};
