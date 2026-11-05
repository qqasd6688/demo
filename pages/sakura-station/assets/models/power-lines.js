import {group,tube} from '../core/geometry.js';
import {westAnchors} from './pole-west.js';
import {eastAnchors} from './pole-east.js';
export function createPowerLines(){const g=group('three-anchored-catenary-power-lines');for(let i=0;i<3;i++){const a=westAnchors[i],b=eastAnchors[i],points=[];for(let j=0;j<=24;j++){const t=j/24;points.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t-(i===2?1.1:.83)*4*t*(1-t),a[2]+(b[2]-a[2])*t]);}const wire=tube(g,points,i===2?.017:.014,0x405249,64);wire.userData.anchors={start:a,end:b};}return g;}
