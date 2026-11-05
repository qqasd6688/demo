import {group,box,cylinder,chips} from '../core/geometry.js';
import {sign} from '../core/textures.js';
export function createRecyclingBin(){const g=group('can-and-bottle-recycling-bin');box(g,[.55,.81,.48],[0,.43,0],0x8da699);box(g,[.58,.13,.51],[0,.88,0],0xb4c6af);for(const x of [-.13,.13]){const h=cylinder(g,.075,.075,.012,[x,.906,.262],0x426458,16);h.rotation.x=Math.PI/2;}sign(g,'びん・かん',.37,.11,[0,.67,.246],{bg:'#d9e0c9',fg:'#476a5a'});chips(g,0,.24,.245,.45,.2,0x687f6b,8);return g;}
