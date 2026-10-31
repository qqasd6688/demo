import * as THREE from '../vendor/three/build/three.module.min.js';
import {box} from './geometry.js';
import {paint} from './materials.js';
const cache=new Map();
// Content art is explicitly preserved in flat mode; surface wear is geometry.
export function memo(key,draw){if(cache.has(key))return cache.get(key);const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=256;const ctx=canvas.getContext('2d');draw(ctx,1024,256);const t=new THREE.CanvasTexture(canvas);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=4;t.userData.graphic=/^(sign|label|poster|clock):/.test(key);cache.set(key,t);return t;}
export function sign(g,text,w,h,pos,{bg='#f3eedb',fg='#426653',sub='',font='bold 104px "Yu Gothic", "Microsoft YaHei", sans-serif'}={}){const map=memo(`sign:${text}:${sub}:${bg}:${fg}`,(c,W,H)=>{c.fillStyle=bg;c.fillRect(0,0,W,H);c.fillStyle=fg;c.textAlign='center';c.textBaseline='middle';c.font=font;c.fillText(text,W/2,sub?H*.40:H*.51,W*.88);if(sub){c.font='28px sans-serif';c.fillText(sub,W/2,H*.79,W*.85);}});return box(g,[w,h,.018],pos,paint(0xffffff,{map}),false);}
