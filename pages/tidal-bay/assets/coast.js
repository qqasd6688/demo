export const W = 16, H = 10;
export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export function coast(y) {
  const t = 10 - y;
  return 6.5 - .91 * t + .62 * Math.sin(t * .83) + .14 * Math.sin(t * 2.7 + .3);
}
export function shoreDistance(x, y) {
  const slope = (coast(y + .015) - coast(y - .015)) / .03;
  return (x - coast(y)) / Math.sqrt(1 + slope * slope);
}
export function hash(x, y) {
  let n = Math.imul(x, 374761393) + Math.imul(y, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}
export function noise(x, y) {
  const a = Math.floor(x), b = Math.floor(y);
  let u = x - a, v = y - b;
  u *= u * (3 - 2 * u); v *= v * (3 - 2 * v);
  return (hash(a, b) * (1 - u) + hash(a + 1, b) * u) * (1 - v) + (hash(a, b + 1) * (1 - u) + hash(a + 1, b + 1) * u) * v;
}
export function dune(x, y) {
  return .26 * noise(x * .7, y * .9) + .18 * Math.sin(x * 1.9 + y * .55) + .08 * noise(x * 2.4, y * 2.4);
}
export function terrainHeight(x, y) {
  const d = shoreDistance(x, y);
  return d < 0 ? -d * .08 + dune(x, y) * clamp(-d * 2) : -d * (.3 + .055 * d);
}
export function random(seed = 47) {
  return () => { seed = Math.imul(seed ^ seed >>> 15, 1 | seed); seed ^= seed + Math.imul(seed ^ seed >>> 7, 61 | seed); return ((seed ^ seed >>> 14) >>> 0) / 4294967296; };
}
