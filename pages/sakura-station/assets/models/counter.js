import {group,box,chips} from '../core/geometry.js';
export function createCounter(){const g=group('wooden-cashier-counter');box(g,[1.55,.83,.73],[0,.44,0],0xb48e63);for(let i=0;i<8;i++)box(g,[.012,.73,.006],[-.68+i*.19,.43,.37],0x9d7b56,false);box(g,[1.68,.09,.83],[0,.89,0],0xded7bd);box(g,[1.56,.09,.75],[0,.08,0],0x777e64);chips(g,0,.7,.378,1.4,.4,0xc4a47a,8);return g;}
