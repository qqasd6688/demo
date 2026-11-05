import * as T from './vendor/three/build/three.module.min.js';
import { EffectComposer } from './vendor/three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from './vendor/three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from './vendor/three/examples/jsm/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from './vendor/three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from './vendor/three/examples/jsm/postprocessing/OutputPass.js';
import { createMaterials } from './materials.js';
import { createCollisionWorld, STOPS } from './layout.js';
import { buildLandscape } from './landscape.js';
import { buildArchitecture } from './architecture.js';
import { buildVegetation } from './vegetation.js';
import { createWater } from './water.js';
import { createEnvironment } from './environment.js';
import { createNavigation } from './navigation.js';

class GardenAO extends GTAOPass {
  _overrideVisibility() {
    this.scene.traverse(object => { const m = object.material; if (object.visible && (object.isPoints || object.isLine || object.userData.skipAO || m?.transparent || m?.alphaTest > 0)) { object.visible = false; this._visibilityCache.push(object); } });
  }
}
const nextPaint = () => new Promise(resolve => requestAnimationFrame(resolve));

export async function createWorld(canvas, hooks = {}) {
  let disposed = false, raf = 0, failed = false;
  const renderer = new T.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.outputColorSpace = T.SRGBColorSpace; renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.02;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFShadowMap; renderer.shadowMap.autoUpdate = false; renderer.info.autoReset = false;
  const scene = new T.Scene(), camera = new T.PerspectiveCamera(53, 1, .1, 550), root = new T.Group(); scene.add(root);
  const uniforms = { time: { value: 0 }, day: { value: 1 }, rain: { value: 0 }, wind: { value: 1 }, sun: { value: new T.Vector3(.4, .8, .2).normalize() } };
  const state = { paused: false, hour: 9.5, weather: 'clear', quality: 'medium', elapsed: 0 };
  hooks.progress?.(.05, '铺陈青石与木纹');
  const materials = await createMaterials(renderer, uniforms, value => hooks.progress?.(.05 + value * .3, '铺陈青石与木纹'));
  const collision = createCollisionWorld();
  hooks.progress?.(.38, '理水叠山 · 一池烟水'); await nextPaint(); buildLandscape(root, materials, collision);
  hooks.progress?.(.49, '起轩筑亭 · 粉墙黛瓦'); await nextPaint(); const architecture = buildArchitecture(root, materials, collision);
  hooks.progress?.(.64, '栽竹植松 · 庭院渐深'); await nextPaint(); const vegetation = buildVegetation(root, materials, collision, uniforms);
  hooks.progress?.(.77, '风过荷池 · 锦鲤入水'); await nextPaint(); const water = createWater(root, materials, uniforms);
  const navigation = createNavigation(camera, canvas, collision, hooks);
  hooks.progress?.(.83, '借一缕天光'); await nextPaint(); const environment = await createEnvironment(scene, renderer, uniforms);
  const target = new T.WebGLRenderTarget(1, 1, { type: T.HalfFloatType, samples: Math.min(2, renderer.capabilities.maxSamples) });
  const composer = new EffectComposer(renderer, target), beauty = new RenderPass(scene, camera), ao = new GardenAO(scene, camera, 640, 400);
  ao.blendIntensity = .48; ao.updateGtaoMaterial({ radius: .68, thickness: 2.2, distanceExponent: 1.7, distanceFallOff: 1, scale: 1, samples: 8, screenSpaceRadius: false });
  ao.updatePdMaterial({ radius: 5, rings: 2, samples: 8, lumaPhi: 10, depthPhi: 3, normalPhi: 4 });
  const bloom = new UnrealBloomPass(new T.Vector2(640, 400), .12, .55, 1.4), output = new OutputPass();
  composer.addPass(beauty); composer.addPass(ao); composer.addPass(bloom); composer.addPass(output);
  let width = 1, height = 1, ratio = 1;
  function resize() {
    width = Math.max(1, canvas.clientWidth); height = Math.max(1, canvas.clientHeight);
    ratio = Math.min(devicePixelRatio || 1, state.quality === 'high' ? 1.8 : state.quality === 'low' ? .9 : width < 780 ? 1 : 1.25);
    renderer.setPixelRatio(ratio); renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix();
    composer.setPixelRatio(ratio); composer.setSize(width, height);
    const aoRatio = state.quality === 'high' ? .8 : .55; ao.setSize(Math.max(1, Math.round(width * aoRatio)), Math.max(1, Math.round(height * aoRatio)));
    bloom.setSize(Math.round(width * .5), Math.round(height * .5));
  }
  const resizeObserver = new ResizeObserver(resize); resizeObserver.observe(canvas); resize();
  function quality(value) { state.quality = value; ao.enabled = value !== 'low'; bloom.enabled = value !== 'low'; water.setQuality(value); environment.setQuality(value); resize(); }
  quality(innerWidth < 600 ? 'low' : 'medium');
  renderer.debug.onShaderError = (gl, program, vertex, fragment) => { failed = true; const details = [gl.getProgramInfoLog(program), gl.getShaderInfoLog(vertex), gl.getShaderInfoLog(fragment)].filter(Boolean).join('\n'); console.error('听雨园着色器编译失败', details); hooks.onFailure?.(new Error('画面着色器编译失败，请重新入园。')); };
  hooks.progress?.(.9, '光影落定 · 即将入园'); await nextPaint();
  await renderer.compileAsync(scene, camera);
  if (failed) throw new Error('场景着色器编译失败');
  let last = performance.now(), measureStart = last, frames = 0, fps = 0, drawCalls = 0, triangles = 0, frameMilliseconds = 0, lastUi = 0;
  function render(now) {
    if (disposed || failed) return;
    raf = requestAnimationFrame(render);
    const dt = Math.min((now - last) / 1000, .05); last = now;
    if (!state.paused) { state.elapsed += dt; uniforms.time.value = state.elapsed; water.update(state.elapsed); }
    navigation.update(dt, state.paused); environment.update(state.elapsed, camera, navigation.mode);
    renderer.info.reset(); const before = performance.now(); composer.render(dt); frameMilliseconds = performance.now() - before;
    drawCalls = renderer.info.render.calls; triangles = renderer.info.render.triangles; frames++;
    if (now - measureStart > 1000) { fps = frames * 1000 / (now - measureStart); frames = 0; measureStart = now; }
    if (now - lastUi > 200) { hooks.onFrame?.({ position: camera.position, yaw: navigation.yaw, fps, drawCalls, triangles, frameMilliseconds, ...vegetation, distance: navigation.distance, mode: navigation.mode, quality: state.quality, pixelRatio: ratio, hour: state.hour, elapsed: state.elapsed, paused: state.paused, weather: state.weather }); lastUi = now; }
  }
  const abort = new AbortController();
  canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); failed = true; cancelAnimationFrame(raf); hooks.onFailure?.(new Error('图形上下文已中断，请重新入园恢复场景。')); }, { signal: abort.signal });
  const raycaster = new T.Raycaster(), plane = new T.Plane(new T.Vector3(0, 1, 0), .12), hit = new T.Vector3(); let down = null;
  canvas.addEventListener('pointerdown', event => { down = [event.clientX, event.clientY]; }, { signal: abort.signal });
  canvas.addEventListener('pointerup', event => {
    if (!down || state.paused || Math.hypot(event.clientX - down[0], event.clientY - down[1]) > 5) return;
    const rect = canvas.getBoundingClientRect(); raycaster.setFromCamera(new T.Vector2((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1), camera);
    if (raycaster.ray.intersectPlane(plane, hit)) water.splash(hit.x, hit.z);
  }, { signal: abort.signal });
  renderer.shadowMap.needsUpdate = true; hooks.progress?.(1, '满园已备，静候来人。'); render(performance.now());
  return {
    state, navigation, materials, collision,
    setHour(hour, environmentMap = true) { state.hour = hour; const light = environment.setHour(hour, environmentMap); architecture.setNight(light.night + (state.weather === 'rain' ? .15 : 0)); return light; },
    setWeather(value) { state.weather = value; const light = environment.setWeather(value); architecture.setNight(light.night + (value === 'rain' ? .15 : 0)); materials.stone.roughness = value === 'rain' ? .48 : .91; materials.roof.roughness = value === 'rain' ? .52 : .86; },
    setQuality: quality,
    focus(id) { const stop = STOPS.find(s => s.id === id); if (stop) navigation.focus(stop); },
    dispose() {
      if (disposed) return; disposed = true; cancelAnimationFrame(raf); abort.abort(); resizeObserver.disconnect(); navigation.dispose(); environment.dispose(); water.dispose(); ao.dispose(); bloom.dispose(); output.dispose(); composer.dispose();
      const geometries = new Set(), mats = new Set(), tex = new Set(materials.textures); scene.traverse(o => { if (o.geometry) geometries.add(o.geometry); if (o.material) for (const mat of Array.isArray(o.material) ? o.material : [o.material]) mats.add(mat); });
      for (const mat of mats) { for (const key of ['map', 'normalMap', 'roughnessMap', 'bumpMap']) if (mat[key]) tex.add(mat[key]); mat.dispose(); } for (const geo of geometries) geo.dispose(); for (const texture of tex) texture.dispose(); renderer.dispose();
    }
  };
}
