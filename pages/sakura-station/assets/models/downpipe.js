import {group,tube,box} from '../core/geometry.js';
export function createDownpipe(){const g=group('oxidized-rainwater-downpipe');tube(g,[[0,3.31,-.2],[.06,3.1,-.15],[.07,2.9,0],[.07,.3,0],[.16,.13,.15]],.046,0x6c8171);for(const y of [.6,1.8,2.8])box(g,[.14,.05,.09],[.07,y,0],0x9a886e);return g;}
