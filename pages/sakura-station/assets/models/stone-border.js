import {group,box,sphere} from '../core/geometry.js';
import {grass} from '../core/botany.js';
export function createStoneBorder(){const g=group('front-verge-stones');for(let i=0;i<20;i++){const x=-7.5+i*.78;box(g,[.72,.17,.3],[x,.09,0],i%3?0xb7bca2:0xaab39b);if(i%2===0)grass(g,x,.2,i);}for(let i=0;i<12;i++){const m=sphere(g,.07,[Math.sin(i*13)*7.5,.01,.22],0xb2b99b);m.scale.y=.4;}return g;}
