import * as T from './vendor/three/build/three.module.min.js';
import { OrbitControls } from './vendor/three/examples/jsm/controls/OrbitControls.js';
import { EYE_HEIGHT, STOPS, floorAt, clamp } from './layout.js';

export const INITIAL = { position: [-14, 4.8, 28.5], target: [6, 2.6, -5] };

export function createNavigation(camera, canvas, collision, hooks = {}) {
  const orbit = new OrbitControls(camera, canvas);
  orbit.enableDamping = true; orbit.dampingFactor = .075; orbit.rotateSpeed = .48; orbit.zoomSpeed = .7; orbit.panSpeed = .6;
  orbit.minDistance = 3; orbit.maxDistance = 125; orbit.maxPolarAngle = Math.PI * .485; orbit.minPolarAngle = .13;
  camera.position.set(...INITIAL.position); orbit.target.set(...INITIAL.target); orbit.update();
  let mode = 'orbit', yaw = 0, pitch = 0, walkTime = 0, distance = 0, transition = null, drag = null, selected = STOPS[0], moved = false, disposed = false;
  const keys = new Set(), touch = { x: 0, y: 0 }, abort = new AbortController(), listenerOptions = { signal: abort.signal };
  const forward = new T.Vector3();
  function angles() { camera.rotation.order = 'YXZ'; yaw = camera.rotation.y; pitch = camera.rotation.x; }
  function focus(stop, immediate = false) {
    selected = stop;
    if (mode === 'walk') {
      let [x, , z] = stop.position;
      if (!collision.allowed(x, z)) {
        outer: for (let radius = .5; radius < 5; radius += .5) for (let a = 0; a < Math.PI * 2; a += .4) { const nx = x + Math.cos(a) * radius, nz = z + Math.sin(a) * radius; if (collision.allowed(nx, nz)) { x = nx; z = nz; break outer; } }
      }
      camera.position.set(x, floorAt(x, z) + EYE_HEIGHT, z); camera.lookAt(...stop.target); angles(); hooks.onPosition?.(camera.position, yaw); return;
    }
    const target = new T.Vector3(...stop.target), position = new T.Vector3(...stop.position);
    if (stop.id === 'water') { position.set(...INITIAL.position); target.set(...INITIAL.target); }
    else if (stop.id === 'pavilion') { position.set(27, 6.2, 16); target.set(13, 2.5, 3); }
    else if (stop.id === 'rock') { position.set(-38, 5.8, 15); target.set(-50, 4, -4); }
    else if (stop.id === 'hall') { position.set(-6, 5, -16); target.set(0, 3, -31); }
    if (immediate) { camera.position.copy(position); orbit.target.copy(target); orbit.update(); transition = null; }
    else transition = { from: camera.position.clone(), to: position, fromTarget: orbit.target.clone(), toTarget: target, time: 0 };
  }
  function setMode(value) {
    if (mode === value) return;
    mode = value; transition = null; keys.clear(); touch.x = touch.y = 0; drag = null; orbit.enabled = value === 'orbit';
    if (value === 'walk') focus(selected, true);
    else { if (document.pointerLockElement === canvas) document.exitPointerLock(); camera.getWorldDirection(forward); orbit.target.copy(camera.position).addScaledVector(forward, 12); camera.position.y += 2.7; orbit.update(); }
    hooks.onMode?.(mode);
  }
  function reset() { selected = STOPS[0]; if (mode === 'walk') setMode('orbit'); focus(selected); }
  const ignoreKey = event => /INPUT|SELECT|TEXTAREA|BUTTON/.test(event.target?.tagName) || !!document.querySelector('dialog[open]');
  window.addEventListener('keydown', event => {
    if (mode !== 'walk' || ignoreKey(event)) return;
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight'].includes(event.code)) { keys.add(event.code); event.preventDefault(); }
  }, listenerOptions);
  window.addEventListener('keyup', event => keys.delete(event.code), listenerOptions);
  window.addEventListener('blur', () => { keys.clear(); touch.x = touch.y = 0; drag = null; }, listenerOptions);
  document.addEventListener('visibilitychange', () => { if (document.hidden) { keys.clear(); touch.x = touch.y = 0; drag = null; } }, listenerOptions);
  canvas.addEventListener('pointerdown', event => { moved = false; if (mode === 'orbit') transition = null; if (mode !== 'walk' || event.button !== 0) return; drag = { id: event.pointerId, x: event.clientX, y: event.clientY }; canvas.setPointerCapture(event.pointerId); }, listenerOptions);
  canvas.addEventListener('pointermove', event => {
    if (mode !== 'walk') return;
    let dx = 0, dy = 0;
    if (document.pointerLockElement === canvas) { dx = event.movementX; dy = event.movementY; }
    else if (drag?.id === event.pointerId) { dx = event.clientX - drag.x; dy = event.clientY - drag.y; drag.x = event.clientX; drag.y = event.clientY; }
    if (Math.abs(dx) + Math.abs(dy) > 0) moved = true;
    yaw -= dx * .003; pitch = clamp(pitch - dy * .0025, -1.3, 1.3); camera.rotation.set(pitch, yaw, 0, 'YXZ');
  }, listenerOptions);
  const endDrag = () => { drag = null; };
  canvas.addEventListener('pointerup', endDrag, listenerOptions); canvas.addEventListener('pointercancel', endDrag, listenerOptions); canvas.addEventListener('lostpointercapture', endDrag, listenerOptions);
  document.addEventListener('pointerlockchange', () => hooks.onLock?.(document.pointerLockElement === canvas), listenerOptions);
  function update(dt, paused) {
    if (disposed) return;
    if (mode === 'orbit') {
      if (transition && !paused) { transition.time += dt; const t = clamp(transition.time / 1.8, 0, 1), smooth = t * t * (3 - 2 * t); camera.position.lerpVectors(transition.from, transition.to, smooth); orbit.target.lerpVectors(transition.fromTarget, transition.toTarget, smooth); if (t === 1) transition = null; }
      orbit.update(); return;
    }
    if (document.querySelector('dialog[open]')) { keys.clear(); return; }
    const right = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0) + touch.x;
    const ahead = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) - touch.y;
    const magnitude = Math.hypot(right, ahead);
    if (magnitude > .04) {
      const speed = keys.has('ShiftLeft') || keys.has('ShiftRight') ? 4.9 : 2.5;
      const norm = Math.max(1, magnitude), dx = (-Math.sin(yaw) * ahead + Math.cos(yaw) * right) / norm * speed * dt, dz = (-Math.cos(yaw) * ahead - Math.sin(yaw) * right) / norm * speed * dt;
      const pos = collision.move(camera.position, dx, dz), travelled = Math.hypot(pos.x - camera.position.x, pos.z - camera.position.z); distance += travelled; walkTime += travelled;
      camera.position.set(pos.x, pos.y + Math.sin(walkTime * 7) * .016, pos.z); hooks.onStep?.(travelled, walkTime);
    } else camera.position.y = T.MathUtils.damp(camera.position.y, floorAt(camera.position.x, camera.position.z) + EYE_HEIGHT, 8, dt);
    camera.rotation.set(pitch, yaw, 0, 'YXZ');
  }
  function suspend() { keys.clear(); touch.x = touch.y = 0; if (document.pointerLockElement === canvas) document.exitPointerLock(); }
  return { orbit, focus, setMode, reset, update, suspend, touch, get mode() { return mode; }, get distance() { return distance; }, get yaw() { camera.getWorldDirection(forward); return Math.atan2(-forward.x, -forward.z); }, get isDragging() { return moved; }, async lock() { if (mode !== 'walk') setMode('walk'); try { await canvas.requestPointerLock(); return true; } catch { return false; } }, dispose() { disposed = true; suspend(); abort.abort(); orbit.dispose(); } };
}
