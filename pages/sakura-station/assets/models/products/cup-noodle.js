import {group,cylinder,box} from '../../core/geometry.js';
export function createCupNoodle(){const g=group('instant-noodle-cup');cylinder(g,.082,.062,.14,[0,.07,0],0xe6dfc7,12);cylinder(g,.086,.086,.012,[0,.147,0],0xd5a37a,12);box(g,[.089,.048,.004],[0,.08,.077],0xb97560,false);box(g,[.015,.004,.003],[.024,.096,.08],0xead8b9,false);return g;}
