import {group,sphere,box} from '../core/geometry.js';
export function createShrub(){const g=group('clipped-rural-hedge');box(g,[1.1,.14,.55],[0,.07,0],0xa8ad8a);for(const [x,y,z,r] of [[-.35,.34,0,.34],[0,.43,-.03,.4],[.36,.35,.02,.31],[-.13,.27,.2,.23]])sphere(g,r,[x,y,z],x>0?0xa1b780:0x91a877,1);return g;}
