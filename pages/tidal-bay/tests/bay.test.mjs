import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { RipplePool, ResolutionController } from '../assets/simulation.js';
import { coast, shoreDistance, terrainHeight } from '../assets/coast.js';
import { createFish, species, createPalm, indexMesh } from '../assets/geometry.js';
import { createMarine, marineSpecies } from '../assets/ecosystem.js';
import { cameraView, safeWaterPoint, sanitizeSettings, defaults } from '../assets/settings.js';
import { createWaveField } from '../assets/waves.js';
import { createMarineAtlas } from '../assets/marine-materials.js';

test('coast distance and optical depth agree along the entire shoreline', () => {
  for (let y = 0; y <= 10; y += .025) {
    const x = coast(y);
    assert.ok(Math.abs(shoreDistance(x, y)) < 1e-9);
    assert.ok(shoreDistance(x - .1, y) < 0);
    assert.ok(shoreDistance(x + .1, y) > 0);
    assert.ok(terrainHeight(x + 1, y) < terrainHeight(x + .1, y));
  }
});

test('land taps are ignored; a fifth water tap replaces only the oldest ripple', () => {
  const pool = new RipplePool();
  assert.equal(pool.add(1, 9, 0), false);
  for (let i = 0; i < 6; i++) assert.equal(pool.add(8 + i, 4, i * .1), true);
  assert.equal(pool.items.length, 4);
  assert.deepEqual(pool.items.map(r => r[0]), [10, 11, 12, 13]);
  pool.expire(4.25);
  assert.deepEqual(pool.items.map(r => r[0]), [11, 12, 13]);
  pool.expire(5);
  assert.equal(pool.items.length, 0);
});

test('ripples leave baked water depth unchanged and paused simulation keeps their age', () => {
  const pool = new RipplePool(), before = terrainHeight(8, 4);
  pool.add(8, 4, 2);
  for (let i = 0; i < 100; i++) pool.expire(2);
  assert.equal(pool.items.length, 1);
  assert.equal(terrainHeight(8, 4), before);
});

test('resolution responds to sustained pressure and recovers with hysteresis', () => {
  const q = new ResolutionController();
  assert.equal(q.sample(25, 12), false);
  assert.equal(q.sample(25, 12), true);
  assert.equal(q.scale, .9);
  for (let i = 0; i < 30; i++) q.sample(25, 12);
  assert.equal(q.scale, .55);
  for (let i = 0; i < 4; i++) assert.equal(q.sample(8.3, 2), false);
  assert.equal(q.sample(8.3, 2), true);
  assert.equal(q.scale, .6);
  for (let i = 0; i < 100; i++) q.sample(8.3, 2);
  assert.equal(q.scale, 1);
  assert.equal(q.sample(16.7, null), false);
});

test('all seven fish meshes and palm are finite and retain articulated fins', () => {
  assert.equal(species.length, 7);
  for (let i = 0; i < species.length; i++) {
    const mesh = createFish(i);
    assert.equal(mesh.length % 39, 0);
    assert.ok(mesh.every(Number.isFinite));
    const vertices = Array.from({ length: mesh.length / 13 }, (_, j) => mesh.subarray(j * 13, j * 13 + 13));
    assert.ok(vertices.some(v => v[9] === 1));
    assert.ok(vertices.some(v => v[9] === -1));
    assert.ok(vertices.some(v => v[0] < -.7 && v[2] > .1));
    assert.ok(vertices.some(v => v[0] < -.7 && v[2] < -.1));
  }
  const palm = createPalm();
  assert.ok(palm.vertices.every(Number.isFinite));
  assert.ok(palm.shadow.length > 1000);
});

test('all marine meshes have finite unit normals and fit unsigned 16-bit indices', () => {
  assert.equal(marineSpecies.length, 8);
  for (let kind = 0; kind < marineSpecies.length; kind++) {
    const mesh = createMarine(kind), indexed = indexMesh(mesh);
    assert.equal(mesh.length % 39, 0);
    assert.ok(mesh.every(Number.isFinite), marineSpecies[kind].id);
    const count = indexed.vertices.length / 13;
    assert.ok(count < 65536);
    assert.ok(indexed.indices.every(i => i < count));
    assert.equal(indexed.indices.length, mesh.length / 13);
    for (let i = 0; i < indexed.vertices.length; i += 13) assert.ok(Math.abs(Math.hypot(...indexed.vertices.subarray(i + 3, i + 6)) - 1) < .0001);
  }
});

test('portrait and landscape cameras preserve proportions and stay inside the bay', () => {
  for (const aspect of [320 / 844, 390 / 844, 1, 1920 / 1080, 2560 / 1080]) for (const progress of [0, .3, 1]) for (const zoom of [1, 1.9]) {
    const [x, y, w, h] = cameraView(aspect, progress, zoom);
    assert.ok(Math.abs(w / h - aspect) < 1e-9);
    assert.ok(x >= 0 && y >= 0 && x + w <= 16.00001 && y + h <= 10.00001);
  }
});

test('dragging creatures onto sand or outside the viewport finds visible water', () => {
  for (const aspect of [320 / 844, 390 / 844, 1, 1920 / 1080]) {
    const view = cameraView(aspect);
    for (const point of [[-10, 12], [0, 10], [20, -5], [6, 5]]) {
      const [x, y] = safeWaterPoint(...point, view);
      assert.ok(shoreDistance(x, y) > 0);
      assert.ok(x >= view[0] && x <= view[0] + view[2]);
      assert.ok(y >= view[1] && y <= view[1] + view[3]);
    }
  }
});

test('stored settings are bounded and malformed values fall back safely', () => {
  assert.deepEqual(sanitizeSettings(null), defaults);
  const s = sanitizeSettings({population: 9000, speed: -3, caustics: NaN, glare: '1.1', intro: false, unknown: 5});
  assert.equal(s.population, 280); assert.equal(s.speed, .2);
  assert.equal(s.caustics, defaults.caustics); assert.equal(s.glare, defaults.glare);
  assert.equal(s.intro, false); assert.equal('unknown' in s, false);
});

test('a low-refresh compositor does not lower resolution when GPU rendering is fast', () => {
  const q = new ResolutionController();
  for (let i = 0; i < 20; i++) q.sample(33.3, 2.5);
  assert.equal(q.scale, 1);
  q.sample(33.3, null); q.sample(33.3, null);
  assert.equal(q.scale, .9);
});

test('baked refracted light conserves average energy with concentrated highlights', () => {
  const {waves,size}=createWaveField(128);
  let total=0,highlight=0,shadow=0;
  for(let i=0;i<waves.length;i+=4){
    const energy=(waves[i+2]/255)**2*8;
    total+=energy;if(energy>2)highlight++;if(energy<.6)shadow++;
  }
  assert.ok(Math.abs(total/(size*size)-1)<.04);
  assert.ok(highlight>size*size*.03,'light should concentrate into folds');
  assert.ok(shadow>size*size*.15,'folds should leave quieter regions');
});

test('marine material normals remain normalized and every animal has visible pigment', () => {
  const {data,detail,width}=createMarineAtlas(),size=512;
  for(let kind=0;kind<9;kind++){
    let min=255,max=0;
    for(let y=4;y<size;y+=19)for(let x=4;x<size;x+=19){
      const k=((Math.floor(kind/4)*size+y)*width+(kind%4)*size+x)*4;
      const len=Math.hypot(detail[k]/127.5-1,detail[k+1]/127.5-1,detail[k+2]/127.5-1);
      assert.ok(Math.abs(len-1)<.015,`normal length on material ${kind}`);
      min=Math.min(min,data[k]);max=Math.max(max,data[k]);
      assert.ok(data[k+3]>0);
    }
    assert.ok(max-min>10,`material ${kind} must retain its pigmentation`);
  }
});

test('all bundled scan maps match their recorded source checksum', async () => {
  const directory=new URL('../assets/materials/',import.meta.url);
  const manifest=JSON.parse(await readFile(new URL('sources.json',directory),'utf8'));
  assert.equal(manifest.length,5);
  for(const item of manifest){
    assert.equal(item.license,'CC0-1.0');
    assert.equal(new URL(item.source).hostname,'dl.polyhaven.org');
    const bytes=await readFile(new URL(item.file,directory));
    assert.equal(bytes.length,item.bytes,item.file);
    assert.equal(createHash('md5').update(bytes).digest('hex'),item.md5,item.file);
  }
});
