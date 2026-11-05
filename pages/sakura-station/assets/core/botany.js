import {sphere,beam,box} from './geometry.js';
// Each crown is sculpted around its own branch endpoints; no merged or instanced geometry.
export function blossomCrown(g,center,r,seed){const colors=[0xe2a7b5,0xf1c4cc,0xf4d4d5,0xeeb7c6,0xe9b1c1];for(let i=0;i<21;i++){const a=i*2.39996+seed,y=(i/20-.5)*1.5;const ring=Math.sqrt(Math.max(.08,1-y*y));const pos=[center[0]+Math.cos(a)*r*ring*.75,center[1]+y*r*.65,center[2]+Math.sin(a)*r*ring*.65];const b=sphere(g,r*(.31+(i%3)*.035),pos,colors[(i+seed)%colors.length],1);b.scale.set(1,.83,1);b.rotation.set(i*.7,i*.93,i*.2);}}
export function moss(g,x,z,r=.3){for(let i=0;i<8;i++){const a=i*2.4;const p=sphere(g,.06+(i%3)*.03,[x+Math.cos(a)*r,.02,z+Math.sin(a)*r],i%2?0x849761:0x9eaa75);p.scale.y=.18;}}
export function grass(g,x,z,seed=0){for(let i=0;i<6;i++){const a=i*1.7+seed;const b=box(g,[.024,.11+(i%3)*.04,.012],[x+Math.cos(a)*.07,.06,z+Math.sin(a)*.07],i%2?0x81986a:0x9cac73,false);b.rotation.z=Math.sin(a)*.35;}}
