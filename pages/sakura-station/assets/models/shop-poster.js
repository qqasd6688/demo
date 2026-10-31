import {group,box} from '../core/geometry.js';
import {sign} from '../core/textures.js';
export function createShopPoster(){const g=group('fixed-seasonal-window-poster');box(g,[.48,.65,.012],[0,0,0],0xe6d6ad);sign(g,'春のおやつ',.45,.21,[0,.17,.015],{bg:'#e6d6ad',fg:'#937e50'});sign(g,'桜もち',.36,.17,[0,-.02,.015],{bg:'#e6d6ad',fg:'#b17f83'});sign(g,'150 円',.32,.14,[0,-.21,.015],{bg:'#e6d6ad',fg:'#7e8765'});for(const x of [-.15,.15]){const tape=box(g,[.14,.055,.007],[x,.31,.022],0xd5c9a6,false);tape.rotation.z=x>0?.17:-.1;}return g;}
