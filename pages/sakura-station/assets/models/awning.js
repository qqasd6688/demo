import {group,box,beam} from '../core/geometry.js';
export function createAwning(){const g=group('striped-shop-awning');for(let i=0;i<18;i++){const x=-3.19+i*.375;const p=box(g,[.375,.055,.7],[x,2.52,2.6],i%2?0xe9ddbd:0x6f967a);p.rotation.x=.12;box(g,[.375,.19,.055],[x,2.39,2.947],i%2?0xe1d6b8:0x6b8f74);}for(const x of [-3.2,.15,3.2])beam(g,[x,2.02,2.25],[x,2.48,2.94],.022,0x657864);return g;}
