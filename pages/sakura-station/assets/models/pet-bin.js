import {group,box,cylinder,chips} from '../core/geometry.js';
import {sign} from '../core/textures.js';
export function createPetBin(){const g=group('pet-bottle-bin');box(g,[.52,.78,.48],[0,.41,0],0xa4b8c0);box(g,[.56,.12,.53],[0,.85,0],0x809da8);const opening=cylinder(g,.08,.08,.018,[0,.86,.27],0x435d65,14);opening.rotation.x=Math.PI/2;sign(g,'ペットボトル',.4,.11,[0,.63,.246],{bg:'#d1ded8',fg:'#567481'});chips(g,0,.23,.244,.4,.25,0x85998f,6);return g;}
