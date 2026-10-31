import {group,box,tube,chips} from '../core/geometry.js';
export function createWallPatina(){
  const g=group('age-marks-stucco-and-moss');
  // Rain wash under the rear gutter, old plaster patches and ground-level moss.
  for(const [x,w,h] of [[-2.8,.022,.27],[-2.74,.012,.19],[-.9,.018,.35],[1.65,.027,.23],[1.72,.011,.37]])box(g,[w,h,.003],[x,3.1-h*.5,-2.279],0xc7c4a5,false);
  chips(g,-1.6,.61,-2.282,1.4,.5,0xc3b89b,14);
  for(let i=0;i<15;i++)box(g,[.04+(i%4)*.019,.025+(i%3)*.017,.005],[-3+i*.41,.27,-2.284],i%2?0x8e9b78:0xa6ac85,false);
  const crack=tube(g,[[-3.281,.5,-1.6],[-3.281,.62,-1.57],[-3.281,.7,-1.61],[-3.281,.78,-1.59]],.004,0xb3ab8a,10);crack.castShadow=false;
  return g;
}
