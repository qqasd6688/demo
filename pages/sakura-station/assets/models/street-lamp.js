import {group,cylinder,tube,box} from '../core/geometry.js';
import {paint} from '../core/materials.js';
export function createStreetLamp(){const g=group('curved-station-lamp');cylinder(g,.035,.065,3.45,[0,1.73,0],0x6c8976,12);tube(g,[[0,3.45,0],[0,3.64,.12],[0,3.68,.35],[0,3.6,.53]],.038,0x6b8673);box(g,[.32,.09,.5],[0,3.54,.53],0x7c947b);box(g,[.26,.025,.43],[0,3.48,.53],paint(0xf6e6b4,{emissive:0xf6ce8b,emissiveIntensity:.2}));cylinder(g,.12,.15,.12,[0,.06,0],0xb1b8a0,12);return g;}
