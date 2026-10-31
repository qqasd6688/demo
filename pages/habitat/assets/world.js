import * as T from './vendor/three/build/three.module.min.js';
import { OrbitControls } from './vendor/three/examples/jsm/controls/OrbitControls.js';
import { loadResources } from './resources.js';
import { buildHome } from './model.js';
import { getLayout, navigationRooms } from './layouts.js';
import { icon } from './icons.js';
import { createRendering } from './rendering.js';
import { createEditor } from './editor.js';

const clamp = T.MathUtils.clamp;
export async function createWorld(canvas, viewport, state, callbacks) {
  const resources = await loadResources(), layout = getLayout(state.layoutId), rooms = navigationRooms(layout);
  document.querySelector('#markers').replaceChildren(); document.querySelector('#room-labels').replaceChildren(); delete canvas.dataset.renderReady;

  const renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, innerWidth < 700 ? 1.5 : 2));
  renderer.setClearColor('#000000', 0);
  renderer.outputColorSpace = T.SRGBColorSpace; renderer.toneMapping = T.NeutralToneMapping; renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false; renderer.shadowMap.needsUpdate = true;
  const scene = new T.Scene();
  const camera = new T.PerspectiveCamera(34, 1, .1, 150);
  const pmrem = new T.PMREMGenerator(renderer);
  const environmentTarget = pmrem.fromEquirectangular(resources.hdr); scene.environment = environmentTarget.texture; scene.environmentIntensity = .7;
  pmrem.dispose();
  const sky = new T.HemisphereLight('#fff8e9', '#a2ad95', 1.45); scene.add(sky);
  const sun = new T.DirectionalLight('#fff0d5', 3.2); sun.position.set(-5, 12, 7); sun.castShadow = true;
  sun.shadow.mapSize.set(innerWidth < 700 ? 2048 : 4096, innerWidth < 700 ? 2048 : 4096); Object.assign(sun.shadow.camera, { left: -layout.width*.7, right: layout.width*.7, top: layout.depth, bottom: -layout.depth, near: .5, far: 35 }); sun.shadow.bias = -.00015; sun.shadow.normalBias = .024; sun.shadow.radius = 3; scene.add(sun);
  const fill = new T.DirectionalLight('#dae4e5', .6); fill.position.set(8, 6, -8); scene.add(fill);
  const contactCanvas = document.createElement('canvas'); contactCanvas.width = contactCanvas.height = 256;
  const contactContext = contactCanvas.getContext('2d'); const gradient = contactContext.createRadialGradient(128, 128, 65, 128, 128, 128);
  gradient.addColorStop(0, '#46503b90'); gradient.addColorStop(.55, '#46503b35'); gradient.addColorStop(1, '#46503b00'); contactContext.fillStyle = gradient; contactContext.fillRect(0, 0, 256, 256);
  const contactMap = new T.CanvasTexture(contactCanvas); contactMap.colorSpace = T.SRGBColorSpace;
  const ground = new T.Mesh(new T.PlaneGeometry(layout.width * 1.5, layout.depth * 1.5), new T.MeshBasicMaterial({ map: contactMap, transparent: true, opacity: .45, depthWrite: false })); ground.rotation.x = -Math.PI / 2; ground.position.y = -.3; scene.add(ground);
  const home = buildHome(scene, state.devices, layout, resources);
  const rendering = createRendering(renderer, scene, camera, layout);
  renderer.info.autoReset = false;
  const controls = new OrbitControls(camera, canvas); controls.enableDamping = true; controls.dampingFactor = .065; controls.minDistance = 5; controls.maxDistance = 100; controls.minPolarAngle = .08; controls.maxPolarAngle = Math.PI * .46; controls.maxTargetRadius = layout.width / 2 + 1; controls.screenSpacePanning = true; controls.rotateSpeed = .65; controls.zoomSpeed = .8; controls.panSpeed = .6; controls.autoRotateSpeed = .5;
  controls.target.set(0, .3, 0); controls.cursor.set(0, .3, 0);
  const raycaster = new T.Raycaster(), pointer = new T.Vector2(), projected = new T.Vector3(), ray = new T.Ray();
  const intersection = new T.Vector3(), direction = new T.Vector3();
  const markersRoot = document.querySelector('#markers'), labelsRoot = document.querySelector('#room-labels');
  const markers = new Map();
  let selectedId = 'living-pendant', room = 'all', autoWalls = true, showMarkers = true, view = '3d', tween = null, dayValue = state.day === 'day' ? 1 : 0;
  let frame = 0, disposed = false, lastTime = 0, elapsed = 0, down = null, hovered = null, lastShadow = 0, quality = 'fine';
  let sampleStart = performance.now(), sampleFrames = 0;
  const editor=createEditor({canvas,camera,controls,scene,home,layout,onChange:callbacks.edit,onRender:()=>{renderer.shadowMap.needsUpdate=true;},onStart:()=>{tween=null;callbacks.hover(null);}});
  const allTarget = new T.Vector3(0, .2, 0);
  const ring = new T.Mesh(new T.RingGeometry(.3, .32, 64), new T.MeshBasicMaterial({ color: '#90a575', transparent: true, opacity: .6, side: T.DoubleSide, depthWrite: false })); ring.rotation.x = -Math.PI / 2; ring.position.y = .08; scene.add(ring);
  const labels = rooms.filter(r => r.id !== 'all').map(r => { const el = document.createElement('div'); el.className = 'room-label'; el.innerHTML = `${r.name}<span>${r.en.toUpperCase()}</span>`; labelsRoot.append(el); return { el, room: r, point: new T.Vector3(r.target[0], .08, r.target[1] + (r.id === 'living' ? 1.9 : .8)) }; });
  for (const device of state.devices) {
    const el = document.createElement('button'); el.className = 'device-marker'; el.type = 'button'; el.innerHTML = icon(device.icon); el.dataset.device = device.id; el.setAttribute('aria-label', `${rooms.find(r => r.id === device.room).name} · ${device.name}`);
    el.addEventListener('click', e => { e.stopPropagation(); select(device.id); callbacks.select(device.id); });
    markersRoot.append(el); markers.set(device.id, el);
  }
  function overviewDistance() {
    const aspect = viewport.clientWidth / viewport.clientHeight;
    const backward = new T.Vector3(view === 'top' ? .0001 : .5, view === 'top' ? 1 : .83, view === 'top' ? .081 : .78).normalize();
    const right = new T.Vector3(0,1,0).cross(backward).normalize(), up = backward.clone().cross(right);
    const tan = Math.tan(T.MathUtils.degToRad(camera.fov/2)); let distance=12;
    // Fit all eight building corners; wide apartments should use the available width.
    for (const x of [-layout.width/2-.2,layout.width/2+.2]) for (const y of [-.3,layout.height+.1]) for (const z of [-layout.depth/2-.2,layout.depth/2+.2]) {
      const p=new T.Vector3(x,y,z).sub(allTarget);
      distance=Math.max(distance,p.dot(backward)+Math.max(Math.abs(p.dot(right))/(tan*aspect*.9),Math.abs(p.dot(up))/(tan*.78)));
    }
    return clamp(distance,12,95);
  }
  function positionFor(target, distance, top = false) { return target.clone().add(new T.Vector3(top ? .0001 : .5, top ? 1 : .83, top ? .081 : .78).normalize().multiplyScalar(distance)); }
  function fit(immediate = false) { const target = allTarget.clone(); const pos = positionFor(target, overviewDistance(), view === 'top'); move(pos, target, immediate); }
  function move(position, target, immediate = false) {
    if (immediate) { camera.position.copy(position); controls.target.copy(target); controls.update(); tween = null; }
    else tween = { start: performance.now(), from: camera.position.clone(), to: position, fromTarget: controls.target.clone(), toTarget: target };
  }
  function resize(preserveView = false) { const w = viewport.clientWidth, h = viewport.clientHeight; if (!w || !h) return; camera.aspect = w / h; camera.setViewOffset(w, h, 0, Math.min(45, h * .07), w, h); camera.updateProjectionMatrix(); renderer.setSize(w, h, false); rendering.resize(w, h); if (!preserveView) { if (room === 'all') fit(true); else focusRoom(room, true); } }
  const observer = new ResizeObserver(() => resize()); observer.observe(viewport); resize();
  function updateDevices() {
    renderer.shadowMap.needsUpdate = true;
    for (const d of state.devices) {
      const item = home.devices.get(d.id), on = d.on;
      item.goal = on ? d.type === 'hob' ? .2 + .8 * d.level / 9 : (d.brightness ?? 100) / 100 : 0;
      if (item.light) { const c = new T.Color(d.kelvin <= 3000 ? '#ffce8a' : d.kelvin <= 4000 ? '#ffe9bf' : '#e1eeff'); item.light.color.copy(c); for (const mesh of item.emissionMeshes) mesh.material.emissive.copy(c); item.pool.material.color.copy(c); }
      if (item.screen) { item.screen.material.color.set(on ? d.type === 'oven' ? '#b48349' : '#ffffff' : '#030605'); item.screen.material.emissive.set(on ? d.type === 'oven' ? '#ff7b27' : d.mode === '电影' ? '#9bafcc' : d.mode === '音乐' ? '#d6b7a2' : '#ffffff' : '#000000'); }
      if (item.air) { item.air.visible = on; item.air.traverse(o => { if (o.isMesh) o.material.color.set(d.mode === '制热' ? '#e8bd91' : '#b6dbd3'); }); }
      const el = markers.get(d.id); el.classList.toggle('on', d.type === 'curtain' ? d.openness > 0 : on); el.setAttribute('aria-label', `${rooms.find(r => r.id === d.room).name} · ${d.name}，${d.type === 'curtain' ? `打开 ${d.openness}%` : on ? '已开启' : '已关闭'}`);
    }
  }
  function select(id) {
    selectedId = id;
    for (const [key, el] of markers) { el.classList.toggle('selected', key === id); el.setAttribute('aria-pressed', String(key === id)); }
    const p = home.devices.get(id).anchor; ring.position.set(p.x, .085, p.z);
  }
  function focusRoom(id, immediate = false) {
    room = id; view = '3d';
    if (id === 'all') { fit(); return; }
    const r = rooms.find(r => r.id === id); const target = new T.Vector3(r.target[0], .45, r.target[1]); const [x0, x1, z0, z1] = r.bounds;
    const distance = clamp(Math.max(x1 - x0, z1 - z0) * 2.65 / Math.min(camera.aspect, 1.1), 11, 30);
    const position = id === 'living' ? target.clone().add(new T.Vector3(.57, .88, -.82).normalize().multiplyScalar(distance)) : positionFor(target, distance);
    move(position, target, immediate);
  }
  function setView(type) { view = type; const distance = camera.position.distanceTo(controls.target); move(positionFor(controls.target, distance, type === 'top'), controls.target.clone()); }
  function zoom(amount) { const offset = camera.position.clone().sub(controls.target); const distance = clamp(offset.length() * amount, controls.minDistance, controls.maxDistance); move(controls.target.clone().add(offset.normalize().multiplyScalar(distance)), controls.target.clone()); }
  function pick(event) {
    const rect = canvas.getBoundingClientRect(); pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1); raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects(home.pickables, false).find(hit => {
      let parent = hit.object; while (parent) { if (!parent.visible) return false; parent = parent.parent; } return true;
    });
    if (!hit) return null;
    // Do not select an appliance through a solid wall that has deliberately been left visible.
    const wallHit = raycaster.intersectObjects(home.walls.filter(w => w.amount >= .3).map(w => w.group), true)[0];
    if (wallHit && wallHit.distance < hit.distance - .1) return null;
    return hit.object.userData.deviceId;
  }
  const onDown = e => { if(editor.active)return; down = { x: e.clientX, y: e.clientY, time: performance.now(), id: e.pointerId }; tween = null; };
  const onUp = e => { if(editor.active)return; if (down?.id === e.pointerId && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 6) { const id = pick(e); if (id) { select(id); callbacks.select(id); } } down = null; };
  const onMove = e => { if(editor.active)return; if (e.pointerType === 'touch' || down) { callbacks.hover(null); return; } const id = pick(e); if (id !== hovered) { hovered = id; canvas.style.cursor = id ? 'pointer' : 'grab'; } callbacks.hover(id, e.clientX, e.clientY); };
  const onLeave = () => { hovered = null; callbacks.hover(null); };
  const onKey = e => {
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '+', '=', '-', 'Home'].includes(e.key)) e.preventDefault(); else return;
    if (e.key === 'Home') { callbacks.reset(); return; }
    if (['+', '=', '-'].includes(e.key)) { zoom(e.key === '-' ? 1.16 : .86); return; }
    const s = new T.Spherical().setFromVector3(camera.position.clone().sub(controls.target));
    if (e.key === 'ArrowLeft') s.theta -= .16; if (e.key === 'ArrowRight') s.theta += .16; if (e.key === 'ArrowUp') s.phi -= .1; if (e.key === 'ArrowDown') s.phi += .1;
    s.phi = clamp(s.phi, controls.minPolarAngle, controls.maxPolarAngle); move(controls.target.clone().add(new T.Vector3().setFromSpherical(s)), controls.target.clone());
  };
  canvas.addEventListener('pointerdown', onDown); canvas.addEventListener('pointerup', onUp); canvas.addEventListener('pointermove', onMove); canvas.addEventListener('pointerleave', onLeave); canvas.addEventListener('keydown', onKey);
  const onCancel = () => { down = null; }; canvas.addEventListener('pointercancel', onCancel);
  controls.addEventListener('start', () => { tween = null; });
  const probesByRoom = new Map(rooms.filter(r => r.bounds).map(r => {
    const [x0, x1, z0, z1] = r.bounds;
    return [r.id, [[.5, .5], [.15, .15], [.85, .15], [.15, .85], [.85, .85]].map(([x, z]) => new T.Vector3(x0 + (x1 - x0) * x, .55, z0 + (z1 - z0) * z))];
  }));
  const probePoints = [...probesByRoom.values()].flat();
  function updateWalls(dt) {
    const overhead = camera.position.y / Math.max(1, camera.position.distanceTo(controls.target)) > .93;
    for (const wall of home.walls) {
      let hide = false;
      if (autoWalls) {
        if (overhead) hide = true;
        else if (wall.exterior) hide = (camera.position.x - wall.x) * wall.normal.x + (camera.position.z - wall.z) * wall.normal.y > 0;
        else {
          const targets = room === 'all' ? probePoints : probesByRoom.get(room);
          for (const p of targets) { direction.copy(p).sub(camera.position); const length = direction.length(); ray.set(camera.position, direction.normalize()); const hit = ray.intersectBox(wall.bounds, intersection); if (hit && camera.position.distanceTo(hit) < length - .15) { hide = true; break; } }
        }
      }
      const goal = hide ? .018 : 1;
      if (Math.abs(wall.amount - goal) > .002 && elapsed - lastShadow > .08) renderer.shadowMap.needsUpdate = true;
      wall.amount = T.MathUtils.damp(wall.amount, goal, 8, dt); wall.group.scale.y = wall.amount;
      if (wall.decorations) for (const decor of wall.decorations) decor.visible = wall.amount > .65;
    }
  }
  function project(point, el) { projected.copy(point).project(camera); const x = (projected.x * .5 + .5) * viewport.clientWidth, y = (-projected.y * .5 + .5) * viewport.clientHeight; el.style.left = `${x.toFixed(1)}px`; el.style.top = `${y.toFixed(1)}px`; return projected.z > -1 && projected.z < 1 && x > 12 && x < viewport.clientWidth - 12 && y > 85 && y < viewport.clientHeight - 100; }
  function tick(now) {
    if (disposed) return; frame = requestAnimationFrame(tick);
    if (now - lastTime < 1000 / 40) return;
    const dt = Math.min((now - lastTime) / 1000, .08); lastTime = now; elapsed += dt;
    if (tween) { const f = clamp((now - tween.start) / 780, 0, 1); const ease = 1 - (1 - f) ** 3; camera.position.lerpVectors(tween.from, tween.to, ease); controls.target.lerpVectors(tween.fromTarget, tween.toTarget, ease); if (f === 1) tween = null; }
    controls.update(dt); updateWalls(dt);
    dayValue = T.MathUtils.damp(dayValue, state.day === 'day' ? 1 : 0, 3, dt);
    sky.intensity = .1 + dayValue * .25; sun.intensity = .05 + dayValue * 2.0; fill.intensity = .08 + dayValue * .24; scene.environmentIntensity = .08 + dayValue * .65; ground.material.opacity = .25 + dayValue * .2;
    for (const material of home.windowViews) material.color.setRGB(.025 + dayValue * .975, .045 + dayValue * .955, .075 + dayValue * .925);
    for (const d of state.devices) {
      const item = home.devices.get(d.id); const goal = item.goal || 0;
      if (item.light) { item.light.intensity = T.MathUtils.damp(item.light.intensity, item.power * .2 * goal, 7, dt); item.pool.material.opacity = T.MathUtils.damp(item.pool.material.opacity, goal * (.2 + (1 - dayValue) * .65), 7, dt); }
      if (item.emissionMeshes) for (const mesh of item.emissionMeshes) mesh.material.emissiveIntensity = T.MathUtils.damp(mesh.material.emissiveIntensity, goal * (d.type === 'hob' ? 2 : .2 + (1 - dayValue) * 1.3), 7, dt);
      if (item.screen) item.screen.material.emissiveIntensity = T.MathUtils.damp(item.screen.material.emissiveIntensity, d.on ? .9 : 0, 6, dt);
      if (item.led) item.led.material.emissiveIntensity = d.on ? .8 : 0;
      if (item.air) { item.air.position.y = -.05 + Math.sin(elapsed * 1.7) * .08; item.air.traverse(o => { if (o.isMesh) o.material.opacity = .15 + Math.sin(elapsed * 1.7) * .06; }); }
      if (item.curtain) { const { panels, width } = item.curtain; panels.forEach((p, i) => { const sign = i ? 1 : -1, openness = d.openness / 100, x = sign * width * (.25 + .21 * openness), scale = width / 1.52 * (1 - .77 * openness); if ((Math.abs(p.position.x - x) > .005 || Math.abs(p.scale.x - scale) > .005) && elapsed - lastShadow > .12) renderer.shadowMap.needsUpdate = true; p.position.x = T.MathUtils.damp(p.position.x, x, 5, dt); p.scale.x = T.MathUtils.damp(p.scale.x, scale, 5, dt); }); }
      if (item.drum && d.on) item.drum.rotation.y += dt * (d.mode === '强力' ? 3.5 : 2);
      if (item.fan && d.on) item.fan.rotation.z += dt * (d.mode === '高速' ? 14 : 7);
      if (d.type === 'robot') { if (d.on) { item.model.position.x = item.origin.x + (1 + Math.sin(elapsed * .22)) * .4; item.model.position.z = item.origin.z + (1 + Math.cos(elapsed * .22)) * .4; item.model.rotation.y = -elapsed * .22; } else item.model.position.lerp(item.origin, Math.min(1, dt * 2)); item.anchor.set(item.model.position.x, .42, item.model.position.z); item.space.localToWorld(item.anchor); }
      const el = markers.get(d.id);
      const featured = viewport.clientWidth < 560 ? ['living-pendant', 'kitchen-fridge', 'master-main', 'study-lamp'].includes(d.id) : d.featured;
      const relevant = room === 'all' ? featured || selectedId === d.id : d.room === room;
      const posVisible = !editor.active && relevant && showMarkers && project(item.anchor, el);
      el.hidden = !posVisible;
    }
    for (const label of labels) label.el.hidden = !(!editor.active && room === 'all' && project(label.point, label.el));
    ring.visible = showMarkers&&!editor.active; const selected = home.devices.get(selectedId); ring.position.x = selected.anchor.x; ring.position.z = selected.anchor.z; ring.material.opacity = .3 + Math.sin(elapsed * 2) * .08;
    if (state.devices.some(d => d.type === 'robot' && d.on) && elapsed - lastShadow > .15) renderer.shadowMap.needsUpdate = true;
    if (renderer.shadowMap.needsUpdate) lastShadow = elapsed;
    renderer.info.reset(); rendering.render(dt); canvas.dataset.renderReady = 'true';
    if (++sampleFrames && now - sampleStart >= 1500) { canvas.dataset.fps = String(Math.round(sampleFrames * 1000 / (now - sampleStart))); canvas.dataset.drawCalls = String(renderer.info.render.calls); canvas.dataset.triangles = String(renderer.info.render.triangles); canvas.dataset.quality = quality; sampleFrames = 0; sampleStart = now; }
  }
  const onVisibility = () => { if (document.hidden) { cancelAnimationFrame(frame); } else { lastTime = sampleStart = performance.now(); sampleFrames = 0; cancelAnimationFrame(frame); frame = requestAnimationFrame(tick); } };
  document.addEventListener('visibilitychange', onVisibility);
  const onContextLost = e => { e.preventDefault(); cancelAnimationFrame(frame); callbacks.error('图形上下文已中断。点击“重新打开”恢复三维场景。'); }; canvas.addEventListener('webglcontextlost', onContextLost);
  updateDevices(); select(selectedId); fit(true); await renderer.compileAsync(scene,camera); tick(performance.now());
  return {
    focusRoom, select, updateDevices, setView, zoom, editor,
    setQuality(value) { quality = value; rendering.setQuality(value); renderer.setPixelRatio(Math.min(devicePixelRatio, value === 'fine' ? innerWidth < 700 ? 1.5 : 2 : 1)); resize(true); },
    setAutoWalls(value) { autoWalls = value; }, setMarkers(value) { showMarkers = value; }, setOrbit(value) { controls.autoRotate = value; },
    reset() { view = '3d'; room = 'all'; controls.autoRotate = false; fit(); },
    dispose() { disposed = true; cancelAnimationFrame(frame); observer.disconnect(); editor.dispose(); controls.dispose(); document.removeEventListener('visibilitychange', onVisibility); canvas.removeEventListener('webglcontextlost', onContextLost); for (const [name,handler] of [['pointerdown',onDown],['pointerup',onUp],['pointermove',onMove],['pointerleave',onLeave],['pointercancel',onCancel],['keydown',onKey]]) canvas.removeEventListener(name,handler); home.dispose(); ground.geometry.dispose(); ground.material.dispose(); contactMap.dispose(); ring.geometry.dispose(); ring.material.dispose(); rendering.dispose(); sun.shadow.dispose(); environmentTarget.dispose(); renderer.dispose(); },
  };
}
