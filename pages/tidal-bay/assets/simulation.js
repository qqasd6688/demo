import { shoreDistance } from './coast.js';

export class RipplePool {
  items = [];
  add(x, y, time) {
    if (!Number.isFinite(x + y + time) || shoreDistance(x, y) <= .02) return false;
    if (this.items.length === 4) this.items.shift();
    this.items.push([x, y, time, 1]);
    return true;
  }
  expire(time) {
    for (let i = this.items.length - 1; i >= 0; i--) if (time - this.items[i][2] > 4) this.items.splice(i, 1);
  }
}

export class ResolutionController {
  scale = 1;
  changes = 0;
  slow = 0;
  fast = 0;
  sample(frameMs, gpuMs) {
    // A low-refresh display or compositor throttling must not blur a GPU-light
    // scene. When GPU timing exists, only reduce pixels under actual GPU load.
    if (gpuMs > 9 || (frameMs > 19 && (!gpuMs || gpuMs > 5.5))) { this.slow++; this.fast = 0; }
    else if ((gpuMs > 0 && gpuMs < 5.5) || (frameMs < 17.5 && !gpuMs)) { this.fast++; this.slow = 0; }
    else { this.slow = 0; this.fast = 0; }
    let next = this.scale;
    if (this.slow >= 2 && this.scale > .55) { next = Math.max(.55, +(this.scale - .1).toFixed(2)); this.slow = 0; }
    else if (this.fast >= 5 && this.scale < 1) { next = Math.min(1, +(this.scale + .05).toFixed(2)); this.fast = 0; }
    if (next === this.scale) return false;
    this.scale = next; this.changes++; return true;
  }
}
