import { clamp, hash, noise } from './coast.js';

const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

// Albedo + roughness and a tangent-space micro-normal atlas. The scales, gill
// creases and lateral lines are baked once; none of their noise runs per frame.
export function createSkin() {
  const width = 1024, bandHeight = 256, height = bandHeight * 7;
  const color = new Uint8Array(width * height * 4), detail = new Uint8Array(color.length);
  const relief = new Float32Array(width * bandHeight);
  const colors = [[219, 83, 18], [28, 105, 179], [224, 184, 21], [184, 187, 151], [236, 209, 109], [126, 152, 151], [210, 226, 224]];
  for (let row = 0; row < 7; row++) {
    for (let y = 0; y < bandHeight; y++) for (let x = 0; x < width; x++) {
      const u = x / (width - 1), v = y / bandHeight, angle = v * Math.PI * 2;
      const dorsal = smooth(-.12, .9, Math.sin(angle));
      const belly = smooth(.05, .9, -Math.sin(angle));
      let c = [...colors[row]];
      if (row === 0) {
        const distance = Math.min(Math.abs(u - .20 - .018 * Math.sin(angle * 2)), Math.abs(u - .53 + .025 * Math.cos(angle)), Math.abs(u - .82 + .011 * Math.sin(angle)));
        c = mix(c, [27, 27, 20], 1 - smooth(.049, .057, distance));
        c = mix(c, [231, 229, 206], 1 - smooth(.034, .043, distance));
      } else if (row === 1) {
        const kidney = Math.pow((u - .48) / .31, 2) + Math.pow((Math.sin(angle) - .42) / .56, 2);
        const patch = 1 - smooth(.8, 1.08, kidney);
        c = mix(c, [7, 24, 47], patch);
        const opening = Math.pow((u - .51) / .17, 2) + Math.pow((Math.sin(angle) - .27) / .19, 2);
        c = mix(c, [31, 104, 177], (1 - smooth(.6, 1.1, opening)) * patch);
        c = mix(c, [232, 185, 14], 1 - smooth(.07, .15, u));
      } else if (row === 3) {
        const stripe = Math.min(Math.abs(u - .23), Math.abs(u - .49 + Math.sin(angle) * .025), Math.abs(u - .79));
        c = mix(c, [27, 32, 28], 1 - smooth(.028, .048, stripe));
        c = mix(c, [201, 173, 67], smooth(.83, 1, u) * .6);
      } else if (row === 4) {
        c = mix(c, [234, 177, 30], smooth(.62, .93, u) * .5 + (1 - smooth(.12, .26, u)) * .4);
        c = mix(c, [25, 32, 26], 1 - smooth(.021, .042, Math.abs(u - .79 + Math.sin(angle) * .012)));
        const spot = Math.pow((u - .27) / .085, 2) + Math.pow((Math.sin(angle) - .22) / .4, 2);
        c = mix(c, [30, 34, 26], 1 - smooth(.65, 1.1, spot));
        const chevron = Math.abs(Math.sin(u * 71 + Math.abs(Math.sin(angle)) * 12));
        c = mix(c, [173, 146, 66], (1 - smooth(.07, .22, chevron)) * .23);
      } else if (row > 4) {
        c = mix(c, [55, 92, 95], dorsal * (row === 6 ? .27 : .55));
        c = mix(c, [201, 217, 209], belly * .52);
        if (row === 5) c = mix(c, [55, 86, 86], smooth(.64, .9, Math.sin(u * 70 + Math.sin(angle) * 1.5)) * dorsal * .4);
      }
      // Overlapping small cycloid scales, staggered rows, with a narrow raised rim.
      const rows = row > 4 ? 24 : 34, columns = row > 4 ? 49 : 60;
      const sy = v * rows, iy = Math.floor(sy);
      const sx = u * columns + (iy % 2) * .5;
      const fx = sx - Math.floor(sx) - .5, fy = sy - iy - .5;
      const radius = Math.hypot(fx * 1.2, fy);
      const rim = Math.exp(-Math.pow((radius - .48) * 22, 2));
      const grain = hash(x + row * 983, y) - .5;
      const scaleTone = hash(Math.floor(sx)+row*103, iy)-.5;
      const pigment = noise(u*16+row*31, Math.sin(angle)*5)*.06-.03;
      const scales = (rim * .48 + (.5 - fy) * .13) * (1 - smooth(.76, .93, u));
      const gillU = .755 - .048 * Math.pow(Math.cos(angle), 2);
      const gill = Math.exp(-Math.pow((u - gillU) * 290, 2)) * (1 - dorsal * .82);
      const lateral = Math.exp(-Math.pow((Math.abs(Math.sin(angle)) - .12 - u * .09) * 95, 2)) * smooth(.10, .22, u) * (1 - smooth(.66, .77, u));
      relief[y * width + x] = scales * .09 - gill * .21 + lateral * .028 + grain * .003;
      const shade = 1 - dorsal * .22 + belly * .10 + (scales - .17) * .17 + scaleTone*.043 + pigment;
      const k = ((row * bandHeight + y) * width + x) * 4;
      for (let i = 0; i < 3; i++) color[k + i] = clamp((c[i] * shade - gill * 27 + lateral * 5 + grain * 2.4) / 255) * 255;
      color[k + 3] = (row > 4 ? 76 : 115) + scales * 65 + grain * 23;
    }
    for (let y = 0; y < bandHeight; y++) for (let x = 0; x < width; x++) {
      const at = (xx, yy) => relief[((yy + bandHeight) % bandHeight) * width + clamp(xx, 0, width - 1)];
      const dx = (at(x + 1, y) - at(x - 1, y)) * 2.6;
      const dy = (at(x, y + 1) - at(x, y - 1)) * 2.6;
      const k = ((row * bandHeight + y) * width + x) * 4;
      detail[k] = clamp(.5 - dx) * 255; detail[k + 1] = clamp(.5 - dy) * 255;
      detail[k + 2] = 255; detail[k + 3] = 255;
    }
  }
  return { color, detail, width, height };
}
