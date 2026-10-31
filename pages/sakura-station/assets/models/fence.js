import {group,box,beam,chips} from '../core/geometry.js';
export function createFence(){const g=group('aged-station-boundary-fence');for(let i=0;i<10;i++){const x=-2.1+i*.47;box(g,[.07,.85,.07],[x,.42,0],0x9aaa8b);for(const y of [.3,.67])box(g,[.46,.055,.055],[x+.21,y,0],0xb0b798);}chips(g,0,.68,.031,4,.1,0x7e8d6e,8);return g;}
