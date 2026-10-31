import { clamp, coast, shoreDistance } from './coast.js';
export const defaults = Object.freeze({ glare: .8, waves: .65, caustics: 1.1, reef: .85, population: 164, speed: .8, ripple: .8, intro: true });
const limits = { glare: [0, 1.7], waves: [0, 1.5], caustics: [0, 2], reef: [0, 1], population: [40, 280], speed: [.2, 1.8], ripple: [.1, 1.5] };
export function sanitizeSettings(input = {}) {
  const result = { ...defaults };
  for (const [key, range] of Object.entries(limits)) if (typeof input?.[key] === 'number' && Number.isFinite(input[key])) result[key] = clamp(input[key], ...range);
  result.population = Math.round(result.population);
  if (typeof input?.intro === 'boolean') result.intro = input.intro;
  return result;
}
export function cameraView(aspect, progress = 1, zoom = 1) {
  const width = Math.min(16, 10 * aspect), height = width / aspect;
  const baseX = aspect < 1.2 ? Math.min(2.15, 16 - width) : (16 - width) * .5;
  const baseY = (10 - height) * .5;
  const t = clamp(progress), ease = 1 - Math.pow(1 - t, 3);
  const factor = (.56 + ease * .44) / zoom, vw = width * factor, vh = height * factor;
  const cx = (baseX + width * .5) * ease + (baseX + width * .56) * (1 - ease);
  const cy = (baseY + height * .5) * ease + (baseY + height * .65) * (1 - ease);
  return [clamp(cx - vw * .5, 0, 16 - vw), clamp(cy - vh * .5, 0, 10 - vh), vw, vh];
}
export function safeWaterPoint(x, y, view = [0, 0, 16, 10]) {
  const left = view[0] + .25, right = view[0] + view[2] - .25;
  x = clamp(x, left, right); y = clamp(y, view[1] + .35, view[1] + view[3] - .35);
  for (let i = 0; i < 40 && shoreDistance(x, y) < .35; i++) { x = Math.min(right, Math.max(x, coast(y) + .65)); if (shoreDistance(x, y) < .35) y -= .16; }
  return [x, clamp(y, view[1] + .2, view[1] + view[3] - .2)];
}
