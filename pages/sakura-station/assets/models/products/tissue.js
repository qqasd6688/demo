import {group,box} from '../../core/geometry.js';
export function createTissue(){const g=group('floral-tissue-box');box(g,[.24,.085,.13],[0,.043,0],0x9ab9ac);box(g,[.16,.004,.045],[0,.088,0],0x617f6f);const t=box(g,[.08,.06,.008],[0,.109,0],0xf5efdd,false);t.rotation.z=.3;box(g,[.013,.027,.003],[.105,.045,.067],0xd4d6bd,false);return g;}
