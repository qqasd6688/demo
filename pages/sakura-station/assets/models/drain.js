import {group,box} from '../core/geometry.js';
export function createDrain(){const g=group('weathered-drain-grate');box(g,[.63,.035,.3],[0,0,0],0x525e55);for(let i=0;i<10;i++)box(g,[.026,.018,.27],[-.28+i*.062,.024,0],i<3?0x97755a:0x889184);return g;}
