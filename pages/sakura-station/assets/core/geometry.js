import * as THREE from '../vendor/three/build/three.module.min.js';
import {paint,edge,glass,silhouette} from './materials.js';
export const group=(name)=>{const g=new THREE.Group();g.name=name;return g;};
export function mesh(g,geometry,color,pos=[0,0,0],outline=true){const m=new THREE.Mesh(geometry,color?.isMaterial?color:paint(color));m.position.set(...pos);m.castShadow=!m.material.transparent;m.receiveShadow=true;g.add(m);if(outline){const e=new THREE.LineSegments(new THREE.EdgesGeometry(geometry,32),edge);e.name='geometric-outline';m.add(e);}return m;}
export const box=(g,size,pos,color,outline=true)=>mesh(g,new THREE.BoxGeometry(...size),color,pos,outline);
export const cylinder=(g,rt,rb,h,pos,color,n=12,outline=true)=>mesh(g,new THREE.CylinderGeometry(rt,rb,h,n),color,pos,outline);
export function sphere(g,r,pos,color,detail=0){const m=mesh(g,new THREE.IcosahedronGeometry(r,detail),color,pos,false);const outline=new THREE.Mesh(m.geometry,silhouette);outline.name='geometric-silhouette';outline.scale.setScalar(1.008);m.add(outline);return m;}
export function beam(g,a,b,r,color,n=8){const av=new THREE.Vector3(...a),bv=new THREE.Vector3(...b);const m=cylinder(g,r,r,av.distanceTo(bv),av.clone().add(bv).multiplyScalar(.5).toArray(),color,n,false);m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),bv.sub(av).normalize());return m;}
export function tube(g,points,r,color,segments=32){const curve=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)));return mesh(g,new THREE.TubeGeometry(curve,segments,r,6,false),color,[0,0,0],false);}
export function ring(g,r,t,pos,color,rotation=[Math.PI/2,0,0]){const m=mesh(g,new THREE.TorusGeometry(r,t,6,32),color,pos,false);m.rotation.set(...rotation);return m;}
export function pane(g,size,pos){const m=box(g,size,pos,glass,false);m.castShadow=false;m.renderOrder=3;return m;}
export function place(parent,asset,pos,rotation=0){asset.position.set(...pos);asset.rotation.y=rotation;parent.add(asset);return asset;}
export function chips(g,x,y,z,w,h,color=0xa19d83,count=7){for(let i=0;i<count;i++){const px=x+Math.sin(i*27.71)*w*.45;const py=y+Math.cos(i*8.3)*h*.42;const s=Math.min(1,Math.min(w,h)*4);const p=box(g,[(.012+((i*7)%5)*.009)*s,(.007+((i*3)%4)*.01)*s,.003],[px,py,z],color,false);p.rotation.z=Math.sin(i*4.4)*.7;}}
export function scuffs(g,w,d,y,color=0xc9be9c){for(let i=0;i<9;i++){const p=box(g,[.05+(i%4)*.025,.003,.01],[Math.sin(i*17)*w*.42,y,Math.cos(i*7)*d*.4],color,false);p.rotation.y=i*1.7;}}
