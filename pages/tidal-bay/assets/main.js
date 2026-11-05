import { W, H, coast, random, clamp } from './coast.js';
import { species, createFish, createPalm, indexMesh } from './geometry.js';
import * as shaders from './shaders.js';
import { RipplePool, ResolutionController } from './simulation.js';
import { marineSpecies, createMarine } from './ecosystem.js';
import * as marineShaders from './marine-shaders.js';
import { setupInterface } from './interface.js';
import { cameraView, safeWaterPoint } from './settings.js';

const canvas = document.querySelector('#bay');
const motion = document.querySelector('#motion');
const error = document.querySelector('#error');
document.querySelector('#retry').addEventListener('click', () => location.reload());
const gl = canvas.getContext('webgl2', { alpha: false, antialias: true, depth: true, stencil: false, powerPreference: 'high-performance' });
let stopped = false;
function fail(reason) {
  stopped = true; error.hidden = false; canvas.dataset.state = 'error';
  document.querySelector('#loading').hidden = true;
  console.error('[tidal-bay]', reason);
}
if (!gl) fail('WebGL 2 unavailable'); else start().catch(fail);

async function start() {
  const started = performance.now(), rng = random(1087);
  let ready = false, dirty = true, introStart = 0, zoom = 1, stormStart = -100, migrationStart = -100;
  const ui = setupInterface({ settings(value) { const countChanged = settings.population !== value.population; settings = value; if (ready && countChanged) populateFish(); dirty = true; }, spawn, event: sceneEvent });
  let settings = ui.settings;
  const gpuTimer = gl.getExtension('EXT_disjoint_timer_query_webgl2');
  const anisotropy = gl.getExtension('EXT_texture_filter_anisotropic');
  const queries = [], gpuSamples = [], frameSamples = [], cpuSamples = [];
  const palm = createPalm();
  // Keep the tree at the edge of the composition, with its shadow over the sand.
  for (let i = 0; i < palm.vertices.length; i += 13) { palm.vertices[i] = palm.vertices[i] * .72 - .48; palm.vertices[i + 1] = palm.vertices[i + 1] * .72 + 3.05; }
  palm.shadow = palm.shadow.map(tri => tri.map(([x, y, z]) => [x * .72 - .48, y * .72 + 3.05, z]));
  const worker = new Worker(new URL('./bake-worker.js', import.meta.url), { type: 'module' });
  let bakePromise = new Promise((resolve, reject) => {
    const finishWorker=()=>{worker.terminate();worker.onmessage=null;worker.onerror=null;};
    worker.onmessage = e => { finishWorker();if(e.data.error)reject(new Error(e.data.error));else resolve(e.data); };
    worker.onerror = e => { finishWorker();reject(new Error(e.message)); };
  });
  const compactBake=innerWidth<700;
  worker.postMessage({ shadow:palm.shadow, width:compactBake?1536:2048, height:compactBake?960:1280, reefWidth:compactBake?2048:3072, reefHeight:compactBake?1280:1920, waveSize:compactBake?512:768 });

  function program(vs, fs) {
    const p = gl.createProgram();
    for (const [type, source] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
      const s = gl.createShader(type); gl.shaderSource(s, source); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      gl.attachShader(p, s); gl.deleteShader(s);
    }
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const uniforms = new Map();
    return { p, u(name) { if (!uniforms.has(name)) uniforms.set(name, gl.getUniformLocation(p, name)); return uniforms.get(name); } };
  }
  const waterProgram = program(shaders.surfaceVertex, shaders.waterFragment);
  const terrainProgram = program(shaders.surfaceVertex, shaders.terrainFragment);
  const fishProgram = program(shaders.fishVertex, shaders.fishFragment);
  const shadowProgram = program(shaders.shadowVertex, shaders.shadowFragment);
  const palmProgram = program(shaders.palmVertex, shaders.palmFragment);
  const marineProgram = program(marineShaders.vertex, marineShaders.fragment);

  function texture(data, width, height, { field = false, repeat = false, mipmaps = false } = {}) {
    const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
    if (data instanceof HTMLCanvasElement) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, data);
    else gl.texImage2D(gl.TEXTURE_2D, 0, field ? gl.RG16F : gl.RGBA8, width, height, 0, field ? gl.RG : gl.RGBA, field ? gl.FLOAT : gl.UNSIGNED_BYTE, data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mipmaps ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE);
    if (mipmaps) gl.generateMipmap(gl.TEXTURE_2D);
    if (mipmaps && anisotropy) gl.texParameterf(gl.TEXTURE_2D, anisotropy.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(4, gl.getParameter(anisotropy.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
    return tex;
  }
  function bindTexture(p, name, tex, unit) {
    gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, tex); gl.uniform1i(p.u(name), unit);
  }
  function geometry(data, dimensions = 13) {
    const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
    const indexed = dimensions === 13 ? indexMesh(data) : null;
    const count = data.length / dimensions;
    if (indexed) data = indexed.vertices;
    const buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buffer); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    if (dimensions === 2) { gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0); }
    else {
      let offset = 0;
      [3, 3, 2, 2, 3].forEach((size, i) => { gl.enableVertexAttribArray(i); gl.vertexAttribPointer(i, size, gl.FLOAT, false, 52, offset * 4); offset += size; });
    }
    if (indexed) {
      const elements = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, elements); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indexed.indices, gl.STATIC_DRAW);
    }
    return { vao, count, vertexCount: data.length / dimensions };
  }
  function instanceBuffer(g, count) {
    gl.bindVertexArray(g.vao);
    const buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buffer); gl.bufferData(gl.ARRAY_BUFFER, count * 32, gl.DYNAMIC_DRAW);
    for (let i = 0; i < 2; i++) { gl.enableVertexAttribArray(5 + i); gl.vertexAttribPointer(5 + i, 4, gl.FLOAT, false, 32, i * 16); gl.vertexAttribDivisor(5 + i, 1); }
    return buffer;
  }
  const fullscreen = geometry(new Float32Array([0, 0, 2, 0, 0, 2]), 2);
  const shoreVertices = [];
  for (let i = 0; i < 256; i++) {
    const y = i / 256, next = (i + 1) / 256;
    const x = clamp((coast(y * H) - .12) / W), nx = clamp((coast(next * H) - .12) / W);
    shoreVertices.push(x, y, 1, y, nx, next, 1, y, 1, next, nx, next);
  }
  const waterMesh = geometry(new Float32Array(shoreVertices), 2);
  const palmMesh = geometry(palm.vertices);
  const capacity = 384;
  const schools = species.map((s, row) => {
    const g = geometry(createFish(row));
    return { g, row, fish: [], data: new Float32Array(capacity * 8), buffer: instanceBuffer(g, capacity) };
  });
  const marine = marineSpecies.map((s, kind) => {
    const g = geometry(createMarine(kind));
    return { g, kind, animals: [], data: new Float32Array(24 * 8), buffer: instanceBuffer(g, 24) };
  });
  const shadows = geometry(new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), 2);
  const shadowData = new Float32Array(640 * 8), shadowBuffer = instanceBuffer(shadows, 640);
  const fishFbo = gl.createFramebuffer(), fishResolveFbo = gl.createFramebuffer(), fishDepth = gl.createRenderbuffer(), fishColor = gl.createRenderbuffer(), fishTexture = texture(null, 1, 1);
  const msaaSamples = Math.min(4, gl.getParameter(gl.MAX_SAMPLES));
  let baked = await bakePromise;
  const bakeInfo={bakeMs:Math.round(baked.bakeMs),scanMaterials:baked.scanMaterials,reefAtlas:[baked.reef.width,baked.reef.height]};
  const colorTexture = texture(baked.color, baked.width, baked.height);
  const fieldTexture = texture(baked.field, baked.width, baked.height, { field: true });
  const reefTexture = texture(baked.reef.color, baked.reef.width, baked.reef.height, { mipmaps: true });
  const reefDetail = texture(baked.reef.detail, baked.reef.width, baked.reef.height, { mipmaps: true });
  const wavesTexture = texture(baked.waves, baked.waveSize, baked.waveSize, { repeat: true, mipmaps: true });
  const skin = texture(baked.skin.color, baked.skin.width, baked.skin.height, { mipmaps: true });
  const skinNormal = texture(baked.skin.detail, baked.skin.width, baked.skin.height, { mipmaps: true });
  const marineAtlas = texture(baked.marine.data, baked.marine.width, baked.marine.height, { mipmaps: true });
  const marineNormal = texture(baked.marine.detail, baked.marine.width, baked.marine.height, { mipmaps: true });
  // GPU uploads are synchronous copies: release the large CPU bake buffers.
  baked=null; bakePromise=null;
  const rippleData = new Float32Array(16), ripplePool = new RipplePool(), ripples = ripplePool.items;
  const resolution = new ResolutionController(), view = new Float32Array(4), waterSettings = new Float32Array(4);
  let scale = 1, aspect = 1, time = 0, previous = 0, lastReport = 0, lastAdapt = 0;
  let paused = false, frame = 0, width = 0, height = 0, shadowCount = 0, fishCount = 0, visitorCount = 0, drawCalls = 0;
  let baseView = [0, 0, 16, 10], lastWake = -1, lastPointer = null;
  const fishCenters = [[5.4, 6.2], [8.6, 5.1], [4.0, 3.3], [8.4, 2.7], [5.2, 7.5], [12.1, 7.6], [10, 5.4]];
  const marineCenters = [[[7.8, 5.2], [11.4, 7.8]], [[6.8, 8.0], [5.5, 3.6]], [[11.8, 3.1], [4.5, 5.2]], [[5.3, 6.6], [9.6, 4.0], [12.0, 8.1]], [[6.9, 2.5], [10.5, 5.6], [4.6, 4.0], [13.3, 3.9]], [[10.8, 2.0], [8.7, 6.8]], [[12.3, 5.0]], [[9.5, 5.0]]];
  function fitPoint(x, y) {
    if (aspect < 1.2) x = baseView[0] + x / 16 * baseView[2];
    return safeWaterPoint(x, y, baseView);
  }
  function newFish(row, index, custom) {
    const center = custom || fishCenters[row];
    return { phase: rng() * Math.PI * 2, seed: rng(), offsetX: (rng() - .5) * (row === 6 ? 2.3 : 1.1), offsetY: (rng() - .5) * (row === 6 ? .75 : 1.0), size: species[row].length * (row === 6 ? .67 : .62) * (.78 + rng() * .35), depth: .3 + rng() * .85, center, custom: !!custom, index, born: time };
  }
  function populateFish() {
    const counts = [7, 7, 5, 4, 6, 3, Math.max(8, settings.population - 32)];
    schools.forEach((school, row) => { school.fish = Array.from({ length: counts[row] }, (_, i) => newFish(row, i)); });
    updateCounts();
  }
  function makeAnimal(kind, x, y, custom = false) {
    const spec = marineSpecies[kind];
    return { x, y, custom, phase: rng() * Math.PI * 2, size: spec.size * (.87 + rng() * .24), depth: spec.depth + rng() * .15, born: time, reactUntil: -10, px: x, py: y, splash: false };
  }
  function populateMarine() {
    marine.forEach((group, kind) => { group.animals = marineCenters[kind].slice(0, marineSpecies[kind].count).map(([x, y]) => makeAnimal(kind, x, y)); });
    updateCounts();
  }
  function updateCounts() {
    fishCount = schools.reduce((n, s) => n + s.fish.length, 0); visitorCount = marine.reduce((n, s) => n + s.animals.length, 0);
    ui.count(fishCount, visitorCount); canvas.dataset.fish = String(fishCount); canvas.dataset.visitors = String(visitorCount);
  }
  function updateCamera() { view.set(cameraView(aspect, settings.intro ? (time - introStart) / 5.8 : 1, zoom)); }
  function resize() {
    aspect = innerWidth / innerHeight; baseView = cameraView(aspect);
    const dpr = Math.min(devicePixelRatio || 1, 1.5), density = Math.min(dpr, Math.sqrt(2400000 / (innerWidth * innerHeight)));
    width = Math.max(1, Math.round(innerWidth * density * scale)); height = Math.max(1, Math.round(innerHeight * density * scale));
    canvas.width = width; canvas.height = height;
    gl.bindTexture(gl.TEXTURE_2D, fishTexture); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fishResolveFbo); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, fishTexture, 0);
    gl.bindRenderbuffer(gl.RENDERBUFFER, fishDepth); gl.renderbufferStorageMultisample(gl.RENDERBUFFER, msaaSamples, gl.DEPTH_COMPONENT24, width, height);
    gl.bindRenderbuffer(gl.RENDERBUFFER, fishColor); gl.renderbufferStorageMultisample(gl.RENDERBUFFER, msaaSamples, gl.RGBA8, width, height);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fishFbo); gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, fishColor);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, fishDepth);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('Underwater framebuffer incomplete');
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); updateCamera(); dirty = true;
    if (ready && document.hidden) render();
  }
  resize(); populateFish(); populateMarine(); addEventListener('resize', resize);
  function worldPoint(clientX, clientY) {
    const r = canvas.getBoundingClientRect();
    return [view[0] + (clientX - r.left) / r.width * view[2], view[1] + (1 - (clientY - r.top) / r.height) * view[3]];
  }
  function addRipple(x, y, strength = settings.ripple) {
    if (ripplePool.add(x, y, time)) ripples[ripples.length - 1][3] = strength;
    canvas.dataset.ripples = String(ripples.length); dirty = true;
  }
  function spawn(id, clientX, clientY) {
    if (!ready) return false;
    let p = clientX === undefined ? [view[0] + view[2] * (.35 + rng() * .35), view[1] + view[3] * (.3 + rng() * .35)] : worldPoint(clientX, clientY);
    p = safeWaterPoint(...p, view);
    const kind = marineSpecies.findIndex(s => s.id === id);
    if (kind >= 0) {
      if (marine[kind].animals.length >= 18) { ui.announce('这类访客已经很多了，让海湾留一点呼吸的空间'); return false; }
      marine[kind].animals.push(makeAnimal(kind, ...p, true));
    } else {
      const row = id === 'school' ? 6 : id === 'clown' ? 0 : 1 + Math.floor(rng() * 4);
      const count = row === 6 ? 20 : 3;
      if (fishCount + count > 360) { ui.announce('海湾已很热闹，可以先减少鱼群数量'); return false; }
      for (let i = 0; i < count; i++) schools[row].fish.push(newFish(row, schools[row].fish.length, p));
    }
    updateCounts(); addRipple(...p, .6); dirty = true;
    if (document.hidden) { render(); report(performance.now()); }
    return true;
  }
  function sceneEvent(id) {
    if (!ready) return;
    if (id === 'intro') { introStart = time; zoom = 1; if (!settings.intro) { settings.intro = true; document.querySelector('[data-setting="intro"]').checked = true; } }
    if (id === 'reset') { populateFish(); populateMarine(); zoom = 1; stormStart = migrationStart = -100; }
    if (id === 'storm') stormStart = time;
    if (id === 'migration') migrationStart = time;
    if (id === 'dolphin') { const p = safeWaterPoint(view[0] + view[2] * .5, view[1] + view[3] * .5, view); marine[7].animals = [makeAnimal(7, ...p, true)]; updateCounts(); }
    dirty = true;
    if (document.hidden) { render(); report(performance.now()); }
  }
  canvas.addEventListener('pointerdown', e => {
    if (e.button !== 0 && e.pointerType !== 'touch') return;
    const p = worldPoint(e.clientX, e.clientY); addRipple(...p);
    for (const group of marine) for (const animal of group.animals) if (Math.hypot(p[0] - animal.px, p[1] - animal.py) < animal.size * .45) {
      animal.reactUntil = time + 2.5; ui.announce(group.kind === 3 ? '海龟轻轻划动鳍肢，回应了你的问候' : group.kind === 4 || group.kind === 5 ? '水母舒展伞缘，泛起一圈柔光' : '它轻轻转身，掠过你的指尖');
      break;
    }
  });
  canvas.addEventListener('pointermove', e => {
    if (e.pointerType === 'touch' && !e.buttons) return;
    const distance = lastPointer ? Math.hypot(e.clientX - lastPointer[0], e.clientY - lastPointer[1]) : 0;
    if (time - lastWake > .25 && distance > 10) { addRipple(...worldPoint(e.clientX, e.clientY), settings.ripple * .28); lastWake = time; lastPointer = [e.clientX, e.clientY]; }
    if (!lastPointer) lastPointer = [e.clientX, e.clientY];
  });
  canvas.addEventListener('pointerleave', () => { lastPointer = null; });
  canvas.addEventListener('dragover', e => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
  canvas.addEventListener('drop', e => { e.preventDefault(); const id = e.dataTransfer.getData('text/plain'); if (['manta','eagle','stingray','turtle','jelly','nettle','school','reef-fish','clown','shark'].includes(id)) spawn(id, e.clientX, e.clientY); document.body.classList.remove('is-dragging'); });
  canvas.addEventListener('wheel', e => { e.preventDefault(); zoom = clamp(zoom * Math.exp(-e.deltaY * .0007), 1, 1.9); dirty = true; }, { passive: false });
  function toggle() {
    paused = !paused; motion.setAttribute('aria-pressed', String(paused)); motion.setAttribute('aria-label', paused ? '继续动画' : '暂停动画');
    motion.querySelector('path').setAttribute('d', paused ? 'M9 5l9 7-9 7Z' : 'M9 6v12M15 6v12'); canvas.dataset.paused = String(paused); dirty = true;
  }
  motion.addEventListener('click', toggle);
  addEventListener('keydown', e => {
    if (e.target.matches('input,button')) return;
    if (e.code === 'Space') { e.preventDefault(); toggle(); }
    if (e.code === 'Enter' && e.target === canvas) { e.preventDefault(); addRipple(...safeWaterPoint(view[0] + view[2] * .6, view[1] + view[3] * .5, view)); }
    if (e.target === canvas && ['Equal','NumpadAdd','Minus','NumpadSubtract','Digit0'].includes(e.code)) { e.preventDefault(); zoom=e.code==='Digit0'?1:clamp(zoom*(e.code==='Equal'||e.code==='NumpadAdd'?1.25:.8),1,1.9);dirty=true; }
  });
  document.addEventListener('visibilitychange', () => { previous = 0; frameSamples.length = 0; gpuSamples.length = 0; dirty = true; });
  canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); fail('WebGL context lost. Reload to rebuild the procedural scene.'); });
  const percentile = (a, p) => a.length ? [...a].sort((a, b) => a - b)[Math.min(a.length - 1, Math.floor(a.length * p))] : 0;
  function pose(data, k, x, y, heading, size, phase, depth, speed, kind) {
    data[k] = x; data[k + 1] = y; data[k + 2] = heading; data[k + 3] = size;
    data[k + 4] = phase; data[k + 5] = depth; data[k + 6] = speed; data[k + 7] = kind;
  }
  function updateAnimals() {
    let shadowOffset = 0;
    const t = time * settings.speed;
    for (const school of schools) {
      const { row, fish, data } = school;
      fish.forEach((f, j) => {
        let x, y, heading;
        if (row === 6 && !f.custom) {
          const cluster = Math.floor(j / 46) % 3, centers = [[9.4, 7.0], [7.7, 4.0], [12.4, 2.5]], [cx, cy] = centers[cluster];
          const arc = (j % 46) / 46 * 3.0 - 1.5 + Math.sin(t * .12 + cluster) * .6;
          const drift = Math.sin(t * .11 + cluster * 2) * .7;
          x = cx + Math.sin(arc) * 1.85 + f.offsetX * .35 + drift;
          y = cy + Math.cos(arc) * .8 + f.offsetY * .45 + Math.cos(t * .10 + cluster) * .5;
          heading = Math.atan2(-Math.sin(arc) * .8, Math.cos(arc) * 1.85) + .25;
          if (time - migrationStart < 16) { const age = (time - migrationStart) / 16; x += Math.sin(age * Math.PI) * 1.5; y += Math.sin(age * Math.PI) * .45; }
        } else {
          const phase = (t - (f.custom ? f.born * settings.speed : 0)) * .11 + row * 1.28 + f.phase * .13;
          const radius = row === 5 ? .9 : .48;
          x = f.center[0] + Math.sin(phase) * radius + f.offsetX;
          y = f.center[1] + Math.cos(phase * .9) * .4 + f.offsetY + Math.sin(t * .3 + f.phase) * .06;
          heading = Math.atan2(-Math.sin(phase * .9) * .36, Math.cos(phase) * radius);
        }
        const p = f.custom ? safeWaterPoint(x, y, baseView) : fitPoint(x, y);
        pose(data, j * 8, ...p, heading, f.size, f.phase, f.depth, row === 6 ? 8 : row === 5 ? 3 : 5, row);
      });
      gl.bindBuffer(gl.ARRAY_BUFFER, school.buffer); gl.bufferSubData(gl.ARRAY_BUFFER, 0, data.subarray(0, fish.length * 8));
      shadowData.set(data.subarray(0, fish.length * 8), shadowOffset); shadowOffset += fish.length * 8;
    }
    for (const group of marine) {
      const { kind, animals, data } = group;
      for (let j = animals.length - 1; j >= 0; j--) if (kind === 7 && time - animals[j].born > 11) { animals.splice(j, 1); updateCounts(); }
      animals.forEach((a, j) => {
        const age = time - a.born, phase = (t - (a.custom ? a.born * settings.speed : 0)) * (kind > 3 && kind < 6 ? .045 : .075) + a.phase;
        const radius = kind > 3 && kind < 6 ? .25 : .65;
        let x = a.x + Math.sin(phase) * radius, y = a.y + Math.cos(phase * .83) * radius * .65;
        let heading = Math.atan2(-Math.sin(phase * .83) * .83 * .65, Math.cos(phase)), depth = a.depth;
        if (kind === 7) { x = a.x + (age - 5.5) * .40; y = a.y + Math.sin(age * .32) * .4; heading = .18; const jump = age > 2 && age < 6 ? Math.sin((age - 2) / 4 * Math.PI) : 0; depth = .2 - jump * 1.2; }
        const p = a.custom ? safeWaterPoint(x, y, baseView) : fitPoint(x, y); a.px = p[0]; a.py = p[1];
        const reaction = Math.max(0, a.reactUntil - time) / 2.5;
        heading += Math.sin(reaction * Math.PI) * .4;
        pose(data, j * 8, ...p, heading, a.size, a.phase + reaction, depth, kind < 3 ? 1.5 : kind === 3 ? 2 : kind < 6 ? 1.7 : 2.8, kind);
        if (kind === 7 && age > 6 && !a.splash) { addRipple(...p, 1.4); a.splash = true; }
      });
      gl.bindBuffer(gl.ARRAY_BUFFER, group.buffer); gl.bufferSubData(gl.ARRAY_BUFFER, 0, data.subarray(0, animals.length * 8));
      for (let j = 0; j < animals.length; j++) { shadowData.set(data.subarray(j * 8, j * 8 + 8), shadowOffset); shadowData[shadowOffset + 7] = kind + 10; shadowOffset += 8; }
    }
    shadowCount = shadowOffset / 8;
    gl.bindBuffer(gl.ARRAY_BUFFER, shadowBuffer); gl.bufferSubData(gl.ARRAY_BUFFER, 0, shadowData.subarray(0, shadowOffset));
  }
  function use(p) { gl.useProgram(p.p); gl.uniform4fv(p.u('uView'), view); gl.uniform1f(p.u('uTime'), time); }
  function render() {
    updateCamera(); updateAnimals(); drawCalls = 0;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fishFbo); gl.viewport(0, 0, width, height);
    gl.clearColor(0, 0, 0, 0); gl.depthMask(true); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.disable(gl.DEPTH_TEST); gl.enable(gl.BLEND); gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    use(shadowProgram); gl.bindVertexArray(shadows.vao); gl.drawArraysInstanced(gl.TRIANGLES, 0, shadows.count, shadowCount); drawCalls++;
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LESS);
    use(fishProgram); bindTexture(fishProgram, 'uSkin', skin, 0); bindTexture(fishProgram, 'uSkinNormal', skinNormal, 1); bindTexture(fishProgram, 'uWaves', wavesTexture, 2);
    for (const s of schools) if (s.fish.length) { gl.bindVertexArray(s.g.vao); gl.drawElementsInstanced(gl.TRIANGLES, s.g.count, gl.UNSIGNED_SHORT, 0, s.fish.length); drawCalls++; }
    use(marineProgram); bindTexture(marineProgram, 'uAtlas', marineAtlas, 0); bindTexture(marineProgram, 'uWaves', wavesTexture, 1); bindTexture(marineProgram, 'uNormal', marineNormal, 2);
    for (const kind of [0, 1, 2, 3, 6, 7, 4, 5]) {
      const s = marine[kind]; if (!s.animals.length) continue;
      gl.depthMask(kind !== 4 && kind !== 5); gl.bindVertexArray(s.g.vao); gl.drawElementsInstanced(gl.TRIANGLES, s.g.count, gl.UNSIGNED_SHORT, 0, s.animals.length); drawCalls++;
    }
    gl.depthMask(true);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, fishFbo); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, fishResolveFbo);
    gl.blitFramebuffer(0,0,width,height,0,0,width,height,gl.COLOR_BUFFER_BIT,gl.NEAREST);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, width, height);
    gl.clearColor(.02, .22, .31, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT); gl.disable(gl.BLEND);
    // Opaque water first. Shore is clipped by geometry; neither discard nor gl_FragDepth
    // is used, so the hidden bed is eligible for early-Z rejection.
    use(waterProgram); gl.uniform1f(waterProgram.u('uDepth'), 0);
    bindTexture(waterProgram, 'uColor', colorTexture, 0); bindTexture(waterProgram, 'uField', fieldTexture, 1); bindTexture(waterProgram, 'uWaves', wavesTexture, 2); bindTexture(waterProgram, 'uFish', fishTexture, 3); bindTexture(waterProgram, 'uReef', reefTexture, 4);
    bindTexture(waterProgram, 'uReefDetail', reefDetail, 5);
    rippleData.fill(0); ripples.forEach((r, i) => rippleData.set(r, i * 4));
    gl.uniform4fv(waterProgram.u('uRipples[0]'), rippleData); gl.uniform1i(waterProgram.u('uRippleCount'), ripples.length);
    waterSettings.set([settings.glare, settings.waves, settings.caustics, settings.reef]); gl.uniform4fv(waterProgram.u('uSettings'), waterSettings);
    gl.uniform1f(waterProgram.u('uStorm'), time - stormStart < 18 ? Math.sin((time - stormStart) / 18 * Math.PI) : 0);
    gl.bindVertexArray(waterMesh.vao); gl.drawArrays(gl.TRIANGLES, 0, waterMesh.count); drawCalls++;
    use(terrainProgram); gl.uniform1f(terrainProgram.u('uDepth'), .8); bindTexture(terrainProgram, 'uColor', colorTexture, 0);
    gl.bindVertexArray(fullscreen.vao); gl.drawArrays(gl.TRIANGLES, 0, fullscreen.count); drawCalls++;
    use(palmProgram); gl.bindVertexArray(palmMesh.vao); gl.drawElements(gl.TRIANGLES, palmMesh.count, gl.UNSIGNED_SHORT, 0); drawCalls++;
    dirty = false;
  }
  function report(now) {
    const p50 = percentile(frameSamples, .5), p95 = percentile(frameSamples, .95);
    const stats = { state: 'ready', viewport: [innerWidth, innerHeight], renderSize: [width, height], scale, fps: frameSamples.length ? +(1000 / p50).toFixed(1) : null, frameP95Ms: +p95.toFixed(2), cpuMedianMs: +percentile(cpuSamples, .5).toFixed(3), gpuMedianMs: gpuSamples.length ? +percentile(gpuSamples, .5).toFixed(3) : null, gpuP95Ms: gpuSamples.length ? +percentile(gpuSamples, .95).toFixed(3) : null, gpuTimerAvailable: !!gpuTimer, fish: fishCount, visitors: visitorCount, ripples: ripples.length, paused, adaptations: resolution.changes, bakeMs: bakeInfo.bakeMs, drawCalls, fullscreenWaterPasses: 1, opaqueWaterFirst: true, samples: frameSamples.length, time: +time.toFixed(2), intro: time - introStart < 5.8 && settings.intro, event: time - stormStart < 18 ? 'storm' : time - migrationStart < 16 ? 'migration' : marine[7].animals.length ? 'dolphin' : null };
    stats.camera = Array.from(view, n => +n.toFixed(3)); stats.zoom = +zoom.toFixed(3);
    stats.msaa=msaaSamples;stats.scanMaterials=bakeInfo.scanMaterials;stats.reefAtlas=bakeInfo.reefAtlas;
    stats.focused = document.hasFocus(); stats.visible = !document.hidden;
    stats.fpsAverage = frameSamples.length ? +(1000 * frameSamples.length / frameSamples.reduce((a, b) => a + b, 0)).toFixed(1) : null;
    canvas.dataset.diagnostics = JSON.stringify(stats); canvas.dataset.ripples = String(ripples.length); lastReport = now;
  }
  function tick(now) {
    if (stopped) return; requestAnimationFrame(tick);
    if (document.hidden) { previous = 0; return; }
    const elapsed = previous ? now - previous : 0; previous = now;
    if (!paused) time += Math.min(.05, elapsed / 1000);
    ripplePool.expire(time);
    if (paused && !dirty) { if (now - lastReport > 1000) report(now); return; }
    const cpuStart = performance.now(); let query;
    if (gpuTimer && frame % 30 === 0 && queries.length < 4) { query = gl.createQuery(); gl.beginQuery(gpuTimer.TIME_ELAPSED_EXT, query); }
    render();
    if (query) { gl.endQuery(gpuTimer.TIME_ELAPSED_EXT); queries.push(query); }
    if (queries.length && gl.getQueryParameter(queries[0], gl.QUERY_RESULT_AVAILABLE)) {
      const q = queries.shift(); if (!gl.getParameter(gpuTimer.GPU_DISJOINT_EXT)) { gpuSamples.push(gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6); if (gpuSamples.length > 80) gpuSamples.shift(); } gl.deleteQuery(q);
    }
    frame++;
    if (!paused && elapsed > 0) { frameSamples.push(elapsed); cpuSamples.push(performance.now() - cpuStart); if (frameSamples.length > 600) frameSamples.shift(); if (cpuSamples.length > 600) cpuSamples.shift(); }
    if (now - lastReport > 1000) report(now);
    if (!paused && now - lastAdapt > 2200 && frameSamples.length > 90) {
      const p75 = percentile(frameSamples.slice(-120), .75), gpu = percentile(gpuSamples.slice(-12), .5);
      if (resolution.sample(p75, gpu)) { scale = resolution.scale; resize(); } lastAdapt = now;
    }
  }
  ready = true; render(); report(performance.now());
  canvas.dataset.state = 'ready'; canvas.dataset.startupMs = String(Math.round(performance.now() - started));
  document.querySelector('#loading').hidden = true;
  console.info('[tidal-bay] ecosystem ready', { bakeMs: bakeInfo.bakeMs, fish: fishCount, visitors: visitorCount, gpuTimer: !!gpuTimer });
  requestAnimationFrame(tick);
}
