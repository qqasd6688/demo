// Forward photon mapping through a periodic height field. The bright folds are
// refractive concentration, not cell borders. All work happens once in a worker.
export function createWaveField(size = 768) {
  const count = size * size, dx = new Float32Array(count), dy = new Float32Array(count), energy = new Float32Array(count);
  const waves = new Uint8Array(count * 4), tau = Math.PI * 2;
  const spectrum = [[2,1,.13,.3],[-1,3,.12,2.1],[4,2,.10,4.8],[-3,5,.085,1.7],
    [6,-2,.075,3.9],[1,7,.065,.9],[-7,-3,.056,5.1],[5,8,.047,2.7],
    [-9,4,.041,.2],[9,-7,.036,3.4],[3,12,.030,5.8],[-12,-5,.026,1.2],
    [14,3,.021,4.2],[-8,15,.018,2.4],[17,-11,.014,.7],[11,19,.011,5.5]];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = y * size + x, u = x / size, v = y / size;
    for (const [a, b, strength, phase] of spectrum) {
      const k = Math.cos((a * u + b * v) * tau + phase) * strength / Math.hypot(a, b);
      dx[i] += k * a; dy[i] += k * b;
    }
  }
  // Four light samples per texel; bilinear splatting gives antialiased caustics.
  for (let y = 0; y < size * 2; y++) for (let x = 0; x < size * 2; x++) {
    const px = x * .5, py = y * .5, ix = Math.floor(px), iy = Math.floor(py), i = iy * size + ix;
    const fx = px - ix, fy = py - iy, right = iy * size + (ix + 1) % size, down = ((iy + 1) % size) * size + ix, corner = ((iy + 1) % size) * size + (ix + 1) % size;
    const gx = (dx[i] * (1-fx) + dx[right] * fx) * (1-fy) + (dx[down] * (1-fx) + dx[corner] * fx) * fy;
    const gy = (dy[i] * (1-fx) + dy[right] * fx) * (1-fy) + (dy[down] * (1-fx) + dy[corner] * fx) * fy;
    const tx = (px + gx * size * .095 + size) % size, ty = (py + gy * size * .095 + size) % size, bx = Math.floor(tx), by = Math.floor(ty), wx = tx - bx, wy = ty - by;
    energy[by * size + bx] += (1-wx) * (1-wy) * .25;
    energy[by * size + (bx+1)%size] += wx * (1-wy) * .25;
    energy[((by+1)%size) * size + bx] += (1-wx) * wy * .25;
    energy[((by+1)%size) * size + (bx+1)%size] += wx * wy * .25;
  }
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = y * size + x, k = i * 4;
    const e = energy[i] * .56 + (energy[y*size+(x+1)%size] + energy[y*size+(x+size-1)%size] + energy[((y+1)%size)*size+x] + energy[((y+size-1)%size)*size+x]) * .11;
    waves[k] = Math.max(0, Math.min(255, (dx[i] * .72 + .5) * 255));
    waves[k+1] = Math.max(0, Math.min(255, (dy[i] * .72 + .5) * 255));
    waves[k+2] = Math.sqrt(Math.min(1, e / 8)) * 255;
    waves[k+3] = (Math.sin(x/size*tau*3 + Math.sin(y/size*tau*2)) * .22 + Math.sin((x+y)/size*tau*7) * .12 + .5) * 255;
  }
  return { waves, size };
}
