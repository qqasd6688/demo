import { STOPS, HALLS, GATES, BRIDGES, PAVILIONS, PATHS, shorePoint } from './layout.js';
import { createSoundscape } from './audio.js';

const $ = selector => document.querySelector(selector), $$ = selector => [...document.querySelectorAll(selector)];
const experience = $('#experience'), canvas = $('#garden'), soundscape = createSoundscape();
let world, booting = false, immersive = false, toastTimer, timeTimer, selectedStop = 'water', joystickPointer = null;
const debug = new URLSearchParams(location.search).has('debug'); $('#diagnostics').hidden = !debug;
function announce(message) { $('#toast').textContent = message; $('#toast').classList.add('visible'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 3300); }
function selectStop(id) {
  selectedStop = id; const stop = STOPS.find(s => s.id === id); if (!stop) return;
  $('#stop-number').textContent = stop.number; $('#stop-subtitle').textContent = stop.subtitle; $('#stop-title').textContent = stop.title; $('#stop-description').textContent = stop.text;
  $$('[data-stop]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.stop === id)));
}
function timeLabel(hour) { return hour < 8 ? '晨雾' : hour < 15.5 ? '清和' : hour < 19 ? '夕照' : '月夜'; }
function updateTime(hour) {
  const hours = Math.floor(hour), minutes = Math.round(hour % 1 * 60), text = `${String(hours + (minutes === 60 ? 1 : 0)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
  $('#time-digital').textContent = text; $('#scene-time').textContent = text; $('#time-caption').textContent = timeLabel(hour); $('#hour').value = hour;
  experience.classList.toggle('night', hour > 19 || hour < 5.8);
  $$('[data-hour]').forEach(button => button.setAttribute('aria-pressed', String(Math.abs(Number(button.dataset.hour) - hour) < .1)));
  $('#scene-weather').textContent = world?.state.weather === 'rain' ? '烟雨 · 入檐' : `${timeLabel(hour)} · 微风`;
}
function updateMode(mode) {
  const walk = mode === 'walk'; experience.classList.toggle('walking', walk);
  $('#walk-mode').setAttribute('aria-pressed', String(walk)); $('#orbit-mode').setAttribute('aria-pressed', String(!walk)); $('#walk-hud').hidden = !walk; $('#reticle').hidden = !walk;
  $('#joystick').hidden = !walk || !(navigator.maxTouchPoints > 0 || innerWidth < 781);
  $('#control-hint').innerHTML = walk ? '<span>W A S D 行走</span><i>·</i><span>拖动转头</span>' : '<span class="mouse-icon"></span>拖动环顾 <i>·</i> 滚轮远近';
}
function positionLabel(x, z) { return x < -37 ? '叠山西院' : x > 38 ? '竹影东院' : z < -24 ? '听雨轩前' : z > 30 ? '入胜前庭' : x > 9 && x < 18 && z > -3 && z < 9 ? '听雨亭' : '曲岸荷池'; }
function onFrame(frame) {
  const degrees = ((frame.yaw * 180 / Math.PI) % 360 + 360) % 360;
  $('#heading').textContent = ['北', '西北', '西', '西南', '南', '东南', '东', '东北'][Math.round(degrees / 45) % 8];
  $('#walk-position').textContent = positionLabel(frame.position.x, frame.position.z);
  const marker = $('#map-player'); if (marker) marker.setAttribute('transform', `translate(${frame.position.x} ${frame.position.z}) rotate(${-degrees})`);
  soundscape.update(frame.hour, frame.weather, frame.paused);
  // Read-only, visible debug output supports browser validation without hidden control hooks.
  if (debug) $('#diagnostics').textContent = `${frame.fps.toFixed(1)} fps · ${frame.drawCalls} draws\n${Math.round(frame.triangles / 1000)}k triangles / frame\n${frame.trees} trees · ${frame.bamboo} bamboo\n${frame.leafCards} leaf clusters\n${frame.mode} · ${frame.quality} · DPR ${frame.pixelRatio.toFixed(2)}\n${frame.position.x.toFixed(2)}, ${frame.position.y.toFixed(2)}, ${frame.position.z.toFixed(2)}\nwalk ${frame.distance.toFixed(2)} m · time ${frame.elapsed.toFixed(2)} s`;
}
function fail(error) {
  console.error(error); $('#loading').hidden = true; $('#fallback').hidden = false; $('#fallback-message').textContent = error.message || '场景加载暂时中断，请重新入园。';
}
async function boot() {
  if (booting) return; booting = true; $('#fallback').hidden = true; $('#loading').hidden = false; experience.classList.remove('ready');
  try {
    world?.dispose(); world = null;
    const { createWorld } = await import('./world.js');
    world = await createWorld(canvas, { progress(value, text) { $('#loading-bar').style.width = `${Math.round(value * 100)}%`; $('#loading-percent').textContent = `${Math.round(value * 100)}%`; $('#loading-text').textContent = text; }, onFrame, onMode: updateMode, onFailure: fail, onLock(locked) { $('#pointer-lock').textContent = locked ? 'Esc 释放视角' : '点击锁定视角'; } });
    updateMode('orbit'); updateTime(9.5); selectStop('water'); $('#quality').value = world.state.quality; experience.classList.add('ready'); setTimeout(() => { $('#loading').hidden = true; }, 750);
    if (world.materials.failures.length) announce('部分材质未能载入，已使用备用表面。');
  } catch (error) { fail(error); }
  finally { booting = false; }
}
$$('.stops [data-stop]').forEach(button => button.addEventListener('click', () => { world?.focus(button.dataset.stop); selectStop(button.dataset.stop); }));
$('#walk-mode').addEventListener('click', () => { world?.navigation.setMode('walk'); canvas.focus({ preventScroll: true }); announce(navigator.maxTouchPoints || innerWidth < 781 ? '左侧摇杆行走，拖动画面转头。' : 'W A S D 行走，拖动转头；Shift 快行。'); });
$('#orbit-mode').addEventListener('click', () => world?.navigation.setMode('orbit'));
$('#pointer-lock').addEventListener('click', async () => { if (document.pointerLockElement) document.exitPointerLock(); else if (!await world?.navigation.lock()) announce('可直接按住画面拖动转头。'); });
$('#reset').addEventListener('click', () => { world?.navigation.reset(); selectStop('water'); announce('回到曲岸初景。'); });
$('#hour').addEventListener('input', event => { const hour = Number(event.target.value); world?.setHour(hour, false); updateTime(hour); clearTimeout(timeTimer); timeTimer = setTimeout(() => world?.setHour(hour), 160); });
$$('[data-hour]').forEach(button => button.addEventListener('click', () => { const hour = Number(button.dataset.hour); clearTimeout(timeTimer); world?.setHour(hour); updateTime(hour); }));
$$('[data-weather]').forEach(button => button.addEventListener('click', () => { const weather = button.dataset.weather; world?.setWeather(weather); $$('[data-weather]').forEach(b => b.setAttribute('aria-pressed', String(b === button))); updateTime(world?.state.hour ?? 9.5); }));
$('#pause').addEventListener('click', () => { if (!world) return; world.state.paused = !world.state.paused; const paused = world.state.paused; $('#pause').setAttribute('aria-pressed', String(paused)); $('#pause').innerHTML = paused ? '<span>▷</span> 继续时光' : '<span>Ⅱ</span> 暂停时光'; announce(paused ? '风、水与游鱼停在此刻，仍可自由行走。' : '风又吹过了荷池。'); });
$('#quality').addEventListener('change', event => { world?.setQuality(event.target.value); announce(`已切换${event.target.selectedOptions[0].textContent}画质。`); });
$('#sound').addEventListener('click', async () => { const enabled = await soundscape.toggle(); $('#sound').setAttribute('aria-pressed', String(enabled)); $('#sound').setAttribute('aria-label', enabled ? '关闭环境音' : '开启环境音'); $('#sound').title = enabled ? '关闭环境音' : '开启环境音'; $('#sound').innerHTML = enabled ? '<svg viewBox="0 0 24 24"><path d="m11 5-5 4H3v6h3l5 4V5ZM15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/></svg>' : '<svg viewBox="0 0 24 24"><path d="m11 5-5 4H3v6h3l5 4V5ZM16 9l5 6m0-6-5 6"/></svg>'; announce(enabled ? '听见风、鸟与水。' : '环境音已关闭。'); });
function immersiveMode(value) { immersive = value; experience.classList.toggle('immersive', value); $('#leave-immersive').hidden = !value; if (value) $('#leave-immersive').focus(); else $('#immerse').focus(); }
$('#immerse').addEventListener('click', () => immersiveMode(true)); $('#leave-immersive').addEventListener('click', () => immersiveMode(false));
window.addEventListener('keydown', event => { if (event.key === 'Escape') { if (immersive) immersiveMode(false); settings(false); } });
function settings(value) { $('#settings').classList.toggle('open', value); $('#settings-toggle').setAttribute('aria-expanded', String(value)); }
$('#settings-toggle').addEventListener('click', () => settings(!$('#settings').classList.contains('open'))); $('#settings-close').addEventListener('click', () => settings(false));

function buildMap() {
  const polyline = points => points.map(p => p.join(',')).join(' ');
  let map = '<svg viewBox="-76 -61 152 122" role="img" aria-label="听雨园平面图，中央荷池，北侧听雨轩，西侧叠山院，东侧竹林"><rect class="map-ground" x="-69" y="-54" width="138" height="108" rx="1"/>';
  map += `<polygon class="map-pond" points="${polyline(Array.from({ length: 100 }, (_, i) => shorePoint(i / 100 * Math.PI * 2)))}"/>`;
  map += `<polyline class="map-path" points="${polyline(Array.from({ length: 101 }, (_, i) => shorePoint(i / 100 * Math.PI * 2, 4)))}"/>`;
  for (const points of PATHS) map += `<polyline class="map-path" points="${polyline(points)}"/>`;
  for (const h of HALLS) map += `<rect class="map-hall" x="${h.x - h.w / 2}" y="${h.z - h.d / 2}" width="${h.w}" height="${h.d}"/><text x="${h.x}" y="${h.z + 1}" text-anchor="middle">${h.name}</text>`;
  for (const p of PAVILIONS) map += `<circle class="map-hall" cx="${p.x}" cy="${p.z}" r="${p.r}"/>`;
  for (const bridge of BRIDGES) map += `<polyline class="map-path" points="${polyline([bridge.a, bridge.b])}"/>`;
  for (const gate of GATES) { const dx = Math.cos(gate.rotation) * gate.length / 2, dz = -Math.sin(gate.rotation) * gate.length / 2; map += `<path class="map-wall" d="M${gate.x - dx},${gate.z - dz}L${gate.x + dx},${gate.z + dz}"/>`; }
  map += '<text x="-49" y="-4" text-anchor="middle">叠 山</text><text x="52" y="3" text-anchor="middle">竹 林</text><text x="-5" y="3" text-anchor="middle" style="font-size:4px;letter-spacing:2px">荷池</text><text x="65" y="-57">北 ↑</text><g id="map-player"><circle class="map-dot" r="1.7"/><path d="M-2 -3 0 -6 2 -3" stroke="#a05a3b" fill="none"/></g></svg>';
  $('#garden-map').innerHTML = map;
  $('#map-stops').innerHTML = STOPS.map((s, i) => `<button data-destination="${s.id}"><small>0${i + 1}</small><div><strong>${s.title}</strong><span>${s.subtitle} ↗</span></div></button>`).join('');
  $$('[data-destination]').forEach(button => button.addEventListener('click', () => { world?.focus(button.dataset.destination); selectStop(button.dataset.destination); $('#map-dialog').close(); canvas.focus({ preventScroll: true }); }));
}
buildMap();
$('#map-toggle').addEventListener('click', () => { world?.navigation.suspend(); $('#map-dialog').showModal(); }); $('#map-close').addEventListener('click', () => $('#map-dialog').close());
$('#map-dialog').addEventListener('click', event => { if (event.target === $('#map-dialog')) { const r = event.target.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) event.target.close(); } });
const joystick = $('#joystick');
function updateJoystick(event) { const rect = joystick.getBoundingClientRect(), dx = event.clientX - rect.left - rect.width / 2, dy = event.clientY - rect.top - rect.height / 2, distance = Math.hypot(dx, dy), scale = distance > 31 ? 31 / distance : 1; $('#joystick-thumb').style.transform = `translate(${dx * scale}px,${dy * scale}px)`; if (world) { world.navigation.touch.x = dx * scale / 31; world.navigation.touch.y = dy * scale / 31; } }
joystick.addEventListener('pointerdown', event => { joystickPointer = event.pointerId; joystick.setPointerCapture(event.pointerId); updateJoystick(event); event.preventDefault(); });
joystick.addEventListener('pointermove', event => { if (event.pointerId === joystickPointer) updateJoystick(event); });
function resetJoystick() { joystickPointer = null; $('#joystick-thumb').style.transform = ''; if (world) world.navigation.touch.x = world.navigation.touch.y = 0; }
joystick.addEventListener('pointerup', resetJoystick); joystick.addEventListener('pointercancel', resetJoystick); joystick.addEventListener('lostpointercapture', resetJoystick); window.addEventListener('blur', resetJoystick);
window.addEventListener('resize', () => { if (world) updateMode(world.navigation.mode); });
$('#retry').addEventListener('click', boot);
window.addEventListener('pagehide', () => { world?.dispose(); soundscape.dispose(); }); window.addEventListener('pageshow', event => { if (event.persisted) location.reload(); });
boot();
