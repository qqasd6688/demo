import {group,box,pane,beam,chips} from '../core/geometry.js';
export function createShopShell(){const g=group('komorebi-store-shell');box(g,[6.6,.2,4.6],[0,.1,0],0xa8aaa0);box(g,[6.35,.04,4.35],[0,.22,0],0xe5dec6);for(let x=-3;x<3;x+=.5)for(let z=-2;z<2;z+=.5)box(g,[.488,.006,.488],[x+.22,.244,z+.22],((x+z)*2)%3===0?0xded8c1:0xeee7d0,false);box(g,[6.5,2.9,.15],[0,1.7,-2.2],0xe4d8b8);box(g,[.15,2.9,4.4],[-3.2,1.7,0],0xe8dfc2);box(g,[.15,.58,4.4],[3.2,.49,0],0xe3d6b5);box(g,[.15,.5,4.4],[3.2,2.91,0],0xe6dbc0);
  for(const z of [-2.15,-.8,.65,2.15])box(g,[.16,2.6,.085],[3.21,1.55,z],0x7e9083);for(const [z,d] of [[-1.5,1.25],[-.07,1.35],[1.4,1.38]])pane(g,[.025,1.88,d],[3.21,1.72,z]);
  box(g,[6.5,.27,.19],[0,.35,2.2],0x6b8b75);box(g,[6.6,.35,.25],[0,2.8,2.2],0xf3e9cd);
  for(const x of [-3.21,-1.47,.15,1.55,3.21])box(g,[.09,2.39,.12],[x,1.57,2.22],0x7b8a7b);for(const x of [-2.34,-.65,2.4]){pane(g,[1.54,2.09,.025],[x,1.56,2.225]);box(g,[1.56,.05,.09],[x,.63,2.25],0x829486);}
  // Glass is open to the complete modelled room, with no opaque facade texture.
  for(const x of [.52,1.18]){pane(g,[.63,2.18,.025],[x,1.53,2.245]);box(g,[.04,2.21,.07],[x+.31,1.53,2.27],0x557563);box(g,[.055,.42,.06],[x+(x<1? .2:-.2),1.32,2.3],0xddd8bd);box(g,[.57,.07,.01],[x,1.72,2.27],0x7d9c88,false);}
  box(g,[1.65,.075,.55],[.85,.23,2.56],0xb8b3a0);box(g,[1.1,.012,.4],[.85,.273,2.54],0x718b78);for(let i=0;i<12;i++)box(g,[.008,.006,.38],[.36+i*.087,.282,2.54],0x526f60,false);
  box(g,[6.56,.16,4.5],[0,3.18,0],0xc7c5ad);for(let i=0;i<4;i++)box(g,[6.3,.06,.07],[0,3.08,-1.75+i*1.1],0x8c9b8b);chips(g,-2.7,.6,2.305,.7,.4,0xb4ac8d,10);chips(g,.4,1.5,-2.115,5,2,0xc3b89b,12);return g;}
