import {group,box,chips} from '../core/geometry.js';
import {sign} from '../core/textures.js';
export function createPaperBin(){const g=group('paper-waste-bin');box(g,[.52,.78,.48],[0,.41,0],0xcfccb0);box(g,[.56,.12,.53],[0,.85,0],0xb1b696);box(g,[.33,.07,.015],[0,.83,.274],0x5f725d);sign(g,'紙・もえる',.38,.11,[0,.63,.246],{bg:'#e5debc',fg:'#71795c'});chips(g,0,.24,.244,.4,.2,0xafa684,8);return g;}
