import {group,box,chips} from '../core/geometry.js';
import {sign} from '../core/textures.js';
export function createPostbox(){const g=group('rural-japanese-postbox');box(g,[.22,.75,.2],[0,.4,0],0xa76a58);box(g,[.53,.67,.38],[0,1.08,0],0xb96f5b);box(g,[.58,.07,.43],[0,1.45,0],0xcd8a70);box(g,[.35,.042,.015],[0,1.29,.201],0x644f3e);sign(g,'〒',.23,.19,[0,1.06,.2],{bg:'#b96f5b',fg:'#f4e4c4'});box(g,[.27,.13,.01],[0,.88,.2],0xe4d3af);chips(g,0,.9,.211,.45,.45,0x955b45,8);box(g,[.4,.06,.35],[0,.03,0],0xb5b29a);return g;}
