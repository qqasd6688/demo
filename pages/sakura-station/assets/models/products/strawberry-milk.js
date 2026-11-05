import {group,box,mesh} from '../../core/geometry.js';
import * as THREE from '../../vendor/three/build/three.module.min.js';
export function createStrawberryMilk(){const g=group('strawberry-milk-carton');box(g,[.13,.21,.12],[0,.105,0],0xf1dfd5);const top=mesh(g,new THREE.CylinderGeometry(.09,.09,.13,3),0xd8a1aa,[0,.245,0]);top.rotation.z=Math.PI/2;box(g,[.13,.09,.124],[0,.09,0],0xd89aa8);box(g,[.055,.035,.005],[0,.16,.063],0x7b9b6d,false);box(g,[.126,.004,.003],[0,.026,.062],0xd7c6b7,false);box(g,[.005,.035,.004],[-.055,.18,.062],0xe1c0b9,false);return g;}
