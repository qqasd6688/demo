import { W, H, clamp, shoreDistance, terrainHeight, noise, hash } from './coast.js';
import { createSkin } from './skin.js';
import { createMarineAtlas } from './ecosystem.js';
import { createReef } from './reef.js';
import { loadScanMaterials, texel } from './materials.js';
import { createWaveField } from './waves.js';

// All terrain noise, slope lighting, depth and wave derivatives are evaluated once,
// off the animation thread. The frame shaders only sample the resulting textures.
self.onmessage = async ({ data: { shadow, width = 2048, height = 1280, reefWidth=3072, reefHeight=1920, waveSize=768 } }) => {
  try {
  const started = performance.now();
  const scans = await loadScanMaterials();
  const color = new Uint8Array(width * height * 4);
  const field = new Float32Array(width * height * 2);
  const shadowCanvas = new OffscreenCanvas(width, height);
  const ctx = shadowCanvas.getContext('2d');
  ctx.fillStyle = '#000';
  for (const tri of shadow) {
    ctx.beginPath();
    for (let j = 0; j < 3; j++) {
      const [x, y, z] = tri[j];
      const sx = (x + z * .62) / W * width, sy = (y - z * .42) / H * height;
      if (!j) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
    }
    ctx.fill();
  }
  const blurCanvas = new OffscreenCanvas(width, height), blur = blurCanvas.getContext('2d');
  blur.filter = 'blur(3px)'; blur.drawImage(shadowCanvas, 0, 0);
  const shade = blur.getImageData(0, 0, width, height).data;
  const blend = (a, b, t) => a.map((v, i) => v * (1 - t) + b[i] * t);
  for (let j = 0; j < height; j++) for (let i = 0; i < width; i++) {
    const x = (i + .5) / width * W, y = (j + .5) / height * H, k = (j * width + i) * 4;
    const d = shoreDistance(x, y), h = terrainHeight(x, y);
    const n = noise(x * 1.4 + 8, y * 1.4), fine = hash(i, j) - .5;
    const gx = (terrainHeight(x + .035, y) - h) / .035;
    const gy = (terrainHeight(x, y + .035) - h) / .035;
    const lighting = clamp(1 + gx * .36 + gy * .24, .81, 1.09);
    const dry = [231, 224, 200], wet = [163, 176, 147];
    const su=x*.36,sv=y*.36,si=texel(scans.sand,su,sv),sn=texel(scans.sandNormal,su,sv);
    const scanLight=(scans.sand.data[si]*.3+scans.sand.data[si+1]*.5+scans.sand.data[si+2]*.2)/165;
    const scanRelief=-(scans.sandNormal.data[sn]/127.5-1)*.42+(scans.sandNormal.data[sn+1]/127.5-1)*.48;
    let rgb;
    if (d < 0) {
      rgb = blend(wet, dry, clamp((-d - .05) * 2.2));
      const wind = Math.sin(y * 76 + x * 13 + noise(x * 3, y * 3) * 9);
      const ridge = wind * 1.8 * clamp(-d - .25) + Math.sin(x * 2.8 + y) * 4.5;
      const tide = Math.exp(-Math.pow((d + .34 + .028 * Math.sin(y * 7)) * 36, 2));
      const debris = tide * (noise(x * 80, y * 80) > .47 ? 28 : 3);
      rgb = rgb.map(v => v * lighting*(.89+scanLight*.11+scanRelief*.038) + fine * 3 + ridge - debris);
    } else {
      const depth = Math.max(0, -h);
      if (depth < .65) rgb = blend([177, 211, 175], [57, 171, 160], clamp(depth / .65));
      else if (depth < 2.3) rgb = blend([57, 171, 160], [15, 115, 132], clamp((depth - .65) / 1.65));
      else rgb = blend([15, 115, 132], [5, 52, 78], clamp((depth - 2.3) / 5.2));
      const ripples = Math.sin(y * 64 + x * 9 + n * 9) * 2.8 * Math.exp(-depth * .8);
      const beds = Math.pow(clamp((noise(x * 1.5, y * 1.6) - .4) * 3), 2) * clamp(depth - .7) * 12;
      rgb = rgb.map(v => v*(1+(scanLight-1)*.16+scanRelief*.045*Math.exp(-depth*.5)) + (n - .5) * 7 + ripples + fine - beds);
    }
    const shadowAlpha = shade[k + 3] / 255;
    for (let c = 0; c < 3; c++) color[k + c] = clamp((rgb[c] * (1 - shadowAlpha * .34)) / 255) * 255;
    color[k + 3] = 255;
    field[k / 2] = d; field[k / 2 + 1] = h;
  }
  const {waves,size}=createWaveField(waveSize);
  const skin = createSkin();
  const marine = createMarineAtlas(), reef = createReef(reefWidth,reefHeight,scans);
  self.postMessage({ color, field, waves, skin, marine, reef, width, height, waveSize: size, scanMaterials: 5, bakeMs: performance.now() - started }, [color.buffer, field.buffer, waves.buffer, skin.color.buffer, skin.detail.buffer, marine.data.buffer, marine.detail.buffer, reef.color.buffer, reef.detail.buffer]);
  } catch (error) { self.postMessage({error: error.message || String(error)}); }
};
