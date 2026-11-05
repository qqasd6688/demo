import {group,box,beam} from '../core/geometry.js';
import {paint} from '../core/materials.js';
export function createCeilingLight(){const g=group('fluorescent-ceiling-light');box(g,[1.35,.07,.22],[0,0,0],0x8c9a87);box(g,[1.22,.055,.14],[0,-.04,0],paint(0xfff2cd,{emissive:0xffe1a0,emissiveIntensity:.5}));for(const x of [-.5,.5])beam(g,[x,.02,0],[x,.18,0],.015,0x6f7f6e);return g;}
