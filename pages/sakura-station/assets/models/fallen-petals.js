import * as THREE from '../vendor/three/build/three.module.min.js';
import {group,mesh} from '../core/geometry.js';
export function petalGeometry(){const s=new THREE.Shape();s.moveTo(0,-.05);s.bezierCurveTo(-.055,-.025,-.04,.04,-.012,.048);s.lineTo(0,.035);s.lineTo(.013,.048);s.bezierCurveTo(.047,.027,.049,-.024,0,-.05);return new THREE.ShapeGeometry(s,8);}
export function createFallenPetals(){const g=group('pink-petals-on-pavement');for(let i=0;i<100;i++){const side=i%2?-1:1;const x=side*5.25+Math.sin(i*13.7)*1.5,z=.25+Math.cos(i*9.1)*1.7;if(Math.abs(x)>7.75)continue;const p=mesh(g,petalGeometry(),i%3?0xe9b1c0:0xf2cbd2,[x,.236+i*.00001,z],false);p.rotation.set(-Math.PI/2,0,i*1.4);p.scale.setScalar(.5+(i%4)*.16);}return g;}
