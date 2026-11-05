import { layouts, getLayout, navigationRooms, DEFAULT_LAYOUT } from './layouts.js';
import { createState, saveState, applyScene, estimatedWatts, modes } from './state.js';
import { icon, hydrateIcons } from './icons.js';
import { createEditorUI } from './editor-ui.js';

const $ = selector => document.querySelector(selector);
hydrateIcons();
let initialLayout = DEFAULT_LAYOUT; try { initialLayout = getLayout(localStorage.getItem('habitat-active-layout')).id; } catch {}
let state = createState(null,initialLayout), layout = getLayout(initialLayout), rooms = navigationRooms(layout);
let switching = false, loadingTimer;
let selectedId = 'living-pendant', selectedRoom = 'all', world = null, toastTimer;
const selected = () => state.devices.find(d => d.id === selectedId);
const roomName = id => rooms.find(r => r.id === id)?.name || '';
const typeNames = { light: '照明', tv: '影音', ac: '温控', fridge: '冷藏', oven: '烹饪', hob: '烹饪', hood: '通风', washer: '清洁', robot: '清洁', monitor: '工作', curtain: '遮阳' };
const englishTypes = { light: 'LIGHTING', tv: 'ENTERTAINMENT', ac: 'CLIMATE', fridge: 'REFRIGERATION', oven: 'COOKING', hob: 'COOKING', hood: 'VENTILATION', washer: 'CLEANING', robot: 'CLEANING', monitor: 'WORKSPACE', curtain: 'DAYLIGHT' };
const feedback = { light: '光落下来，家就有了温度。', tv: '留一段时间，给喜欢的故事。', ac: '把温度调到，刚刚好的舒服。', fridge: '把新鲜，留给生活的下一刻。', oven: '等待一份热气腾腾的小确幸。', hob: '从一餐一饭，拾起生活的烟火。', hood: '留住饭菜香，让空气清爽。', washer: '把琐碎交给它，把时间留给你。', robot: '它照顾地面，你照顾生活。', monitor: '一隅安静，专注此刻。', curtain: '让窗外的光，按你的心意进来。' };
function toast(message) { $('#toast').textContent = message; $('#toast').classList.add('visible'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 2700); }
function deviceStatus(d) { if (d.type === 'curtain') return `打开 ${d.openness}%`; if (!d.on) return '已关闭'; if (d.type === 'light') return `${d.brightness}%`; if (d.type === 'ac' || d.type === 'fridge' || d.type === 'oven') return `${d.temperature}°C`; return d.type === 'robot' || d.type === 'washer' ? '运行中' : '已开启'; }
const editorUI=createEditorUI({getWorld:()=>world,getRooms:()=>rooms,getRoom:()=>selectedRoom,toast,onMode:value=>{setInspectorOpen(false);syncInspectorAccess();if(!value)setRoom(selectedRoom,false);}});

function renderNavigation() { $('#room-nav').innerHTML = rooms.map(r => `<button class="room-button ${r.id === 'all' ? 'active' : ''}" data-room="${r.id}" aria-pressed="${r.id === 'all'}">${icon(r.icon)}<span>${r.name}</span><small>${r.id === 'all' ? `${layout.area} m²` : String(state.devices.filter(d => d.room === r.id).length).padStart(2, '0')}</small></button>`).join(''); }

function setRoom(id, focus = true) {
  selectedRoom = id;
  document.querySelectorAll('[data-room]').forEach(el => { el.classList.toggle('active', el.dataset.room === id); el.setAttribute('aria-pressed', String(el.dataset.room === id)); });
  const r = rooms.find(r => r.id === id); $('#space-title').innerHTML = `${id === 'all' ? '全屋漫游' : r.name}<span>${r.en}</span>`;
  if (focus) { world?.focusRoom(id); setViewButtons('3d'); }
  if(editorUI.active)editorUI.setRoom(id);
  else if (id !== 'all' && selected().room !== id) selectDevice(state.devices.find(d => d.room === id).id, false);
  else renderDeviceList();
}
$('#room-nav').addEventListener('click', e => { const button = e.target.closest('[data-room]'); if (button) setRoom(button.dataset.room); });
function selectDevice(id, open = true) {
  if(editorUI.active)return;
  selectedId = id; world?.select(id); renderInspector();
  if (selectedRoom !== 'all' && selected().room !== selectedRoom) setRoom(selected().room, false);
  if (open && (innerWidth <= 1050 || document.body.classList.contains('immersive'))) setInspectorOpen(true);
}
function renderInspector() {
  const d = selected();
  $('#hero-icon').innerHTML = icon(d.icon); $('#device-name').textContent = d.name; $('#device-room').textContent = `${roomName(d.room)} · ${typeNames[d.type]}`;
  $('#hero-index').textContent = `${String(state.devices.indexOf(d) + 1).padStart(2, '0')} / ${englishTypes[d.type]}`;
  $('#device-feedback p').textContent = feedback[d.type];
  const power = $('#device-power'); power.setAttribute('aria-label', d.type === 'curtain' ? `${d.name}开合` : `${d.name}电源`);
  let content = '';
  if (d.type === 'light') {
    content = `<label class="control-row" for="brightness"><span>亮度</span><output id="brightness-value">${d.brightness}<span> %</span></output></label><input class="range" id="brightness" data-field="brightness" type="range" min="0" max="100" value="${d.brightness}" style="--fill:${d.brightness}%"><div class="control-row"><span>色温</span><output id="kelvin-value">${d.kelvin} K</output></div><div class="temperature-options" aria-label="色温">${[[2700, '暖光'], [4000, '自然'], [5000, '冷白']].map(([k, name]) => `<button data-kelvin="${k}" class="${Math.abs(k - d.kelvin) < 500 ? 'active' : ''}" aria-pressed="${Math.abs(k - d.kelvin) < 500}"><i></i>${name}</button>`).join('')}</div>`;
  } else if (['ac', 'fridge', 'oven'].includes(d.type)) {
    content = `<div class="control-row"><span>${d.type === 'fridge' ? '冷藏室设定温度' : '设定温度'}</span><span>${d.type === 'ac' ? d.mode : d.type === 'fridge' ? '冷冻室 −18°C' : d.mode}</span></div><div class="temp-adjust"><button data-temp="-1" aria-label="降低温度">${icon('minus')}</button><strong id="temperature-value">${d.temperature}<small>°C</small></strong><button data-temp="1" aria-label="升高温度">${icon('plus')}</button></div>${modeButtons(d)}`;
    if (d.type === 'fridge') content += '<p class="control-note">模拟冷藏室 2–8°C · 冷冻室固定为 −18°C</p>';
  } else if (d.type === 'tv') {
    content = `<label class="control-row" for="volume"><span>音量 <small>（模拟）</small></span><output id="volume-value">${d.volume} %</output></label><input class="range" id="volume" data-field="volume" type="range" min="0" max="100" value="${d.volume}" style="--fill:${d.volume}%">${modeButtons(d)}<p class="control-note">屏幕氛围随模式切换，不播放实际音视频。</p>`;
  } else if (d.type === 'curtain') {
    content = `<label class="control-row" for="openness"><span>打开幅度</span><output id="openness-value">${d.openness} %</output></label><input class="range" id="openness" data-field="openness" type="range" min="0" max="100" value="${d.openness}" style="--fill:${d.openness}%"><div class="mode-buttons"><button data-curtain="0">全部合拢</button><button data-curtain="50">打开一半</button><button data-curtain="100">全部打开</button></div><p class="control-note">窗帘随遮挡墙体一同隐藏；旋转至外窗侧可查看开合。</p>`;
  } else if (d.type === 'hob') {
    content = `<label class="control-row" for="level"><span>火力档位</span><output id="level-value">${d.level} 档</output></label><input class="range" id="level" data-field="level" type="range" min="1" max="9" value="${d.level}" style="--fill:${d.level / 9 * 100}%"><div class="appliance-status"><span>双灶联动</span><strong>${d.on ? '加热中' : '待机'}</strong></div>`;
  } else {
    content = `<div class="control-row"><span>运行模式</span><span>${d.type === 'robot' ? '虚拟清洁演示' : '设备控制'}</span></div>${modeButtons(d)}<div class="appliance-status"><span>当前状态</span><strong id="appliance-state">${d.on ? '运行中' : '待机'}</strong></div>`;
  }
  $('#device-controls').innerHTML = content;
  renderPower(); renderDeviceList();
}
function modeButtons(d) { return modes[d.type] ? `<div class="mode-buttons" aria-label="运行模式">${modes[d.type].map(mode => `<button data-mode="${mode}" class="${d.mode === mode ? 'active' : ''}" aria-pressed="${d.mode === mode}">${mode}</button>`).join('')}</div>` : ''; }
function renderPower() { const d = selected(); const on = d.type === 'curtain' ? d.openness > 0 : d.on; $('#device-power').setAttribute('aria-checked', String(on)); $('#device-hero').classList.toggle('off', !on); $('#hero-status').textContent = d.type === 'curtain' ? `打开 ${d.openness}%` : d.on ? '已开启' : '已关闭'; }
function renderDeviceList() {
  const room = selectedRoom === 'all' ? selected().room : selectedRoom;
  const devices = state.devices.filter(d => d.room === room);
  $('#related-title').textContent = `${roomName(room)}的设备`; $('#related-count').textContent = `${String(devices.length).padStart(2, '0')} DEVICES`;
  $('#device-list').innerHTML = devices.map(d => `<button class="device-row ${d.id === selectedId ? 'selected' : ''} ${d.on ? 'on' : ''}" data-select="${d.id}" aria-label="控制${d.name}" aria-pressed="${d.id === selectedId}">${icon(d.icon)}<span>${d.name}</span><small>${deviceStatus(d)}</small><i class="row-light"></i></button>`).join('');
}
function commit({ controls = false, custom = true } = {}) {
  if (custom) state.scene = 'custom';
  world?.updateDevices(); if (controls) renderInspector(); else { renderPower(); renderDeviceList(); }
  renderSummary(); saveState(state);
}
function renderSummary() {
  const active = state.devices.filter(d => d.on && d.type !== 'curtain').length;
  $('#active-count').textContent = active; $('#mobile-count').textContent = active; $('#power-total').textContent = state.devices.reduce((sum, d) => sum + estimatedWatts(d), 0).toLocaleString('zh-CN');
  document.body.classList.toggle('night', state.day === 'night');
  document.querySelectorAll('[data-day]').forEach(el => { el.classList.toggle('active', el.dataset.day === state.day); el.setAttribute('aria-pressed', String(el.dataset.day === state.day)); });
  document.querySelectorAll('[data-scene]').forEach(el => { el.classList.toggle('active', el.dataset.scene === state.scene); el.setAttribute('aria-pressed', String(el.dataset.scene === state.scene)); });
  $('#scene-caption').textContent = state.day === 'night' ? '夜色温柔，留一盏灯等你。' : '日光漫进来，生活慢下来。';
}
$('#device-power').addEventListener('click', () => { const d = selected(); if (d.type === 'curtain') d.openness = d.openness > 0 ? 0 : 100; else { d.on = !d.on; if (d.on && d.type === 'light' && d.brightness === 0) d.brightness = 70; } commit({ controls: true }); toast(`${d.name} · ${deviceStatus(d)}`); });
$('#device-list').addEventListener('click', e => { const row = e.target.closest('[data-select]'); if (row) selectDevice(row.dataset.select); });
$('#device-controls').addEventListener('input', e => { const field = e.target.dataset.field; if (!field) return; const d = selected(); d[field] = Number(e.target.value); if (field === 'brightness') d.on = d.brightness > 0; e.target.style.setProperty('--fill', `${field === 'level' ? d[field] / 9 * 100 : d[field]}%`); const output = $(`#${field}-value`); if (output) output.textContent = `${d[field]} ${field === 'level' ? '档' : '%'}`; commit(); });
$('#device-controls').addEventListener('click', e => {
  const button = e.target.closest('button'); if (!button) return; const d = selected();
  if (button.dataset.kelvin) d.kelvin = Number(button.dataset.kelvin);
  else if (button.dataset.mode) d.mode = button.dataset.mode;
  else if (button.dataset.temp) { const [min, max, step] = d.type === 'fridge' ? [2, 8, 1] : d.type === 'oven' ? [80, 240, 10] : [16, 30, 1]; d.temperature = Math.max(min, Math.min(max, d.temperature + Number(button.dataset.temp) * step)); }
  else if (button.dataset.curtain !== undefined) d.openness = Number(button.dataset.curtain);
  else return;
  commit({ controls: true });
});
document.querySelectorAll('[data-day]').forEach(el => el.addEventListener('click', () => { state.day = el.dataset.day; commit({ custom: false }); }));
document.querySelectorAll('[data-scene]').forEach(el => el.addEventListener('click', () => { applyScene(state, el.dataset.scene); commit({ controls: true, custom: false }); toast(`${el.textContent.trim()} · 已为你调整全屋设备`); }));
function setViewButtons(view) { for (const id of ['3d', 'top']) { $(`#view-${id}`).classList.toggle('active', id === view); $(`#view-${id}`).setAttribute('aria-pressed', String(id === view)); } }
$('#view-3d').addEventListener('click', () => { world?.setView('3d'); setViewButtons('3d'); }); $('#view-top').addEventListener('click', () => { world?.setView('top'); setViewButtons('top'); });
$('#zoom-in').addEventListener('click', () => world?.zoom(.85)); $('#zoom-out').addEventListener('click', () => world?.zoom(1.18));
function resetView() { setRoom('all', false); world?.reset(); setViewButtons('3d'); $('#orbit-toggle').setAttribute('aria-pressed', 'false'); $('#orbit-toggle').classList.remove('active'); toast('已回到全屋视角'); }
$('#reset-view').addEventListener('click', resetView);
function toggleTool(id, action) { $(id).addEventListener('click', () => { const active = $(id).getAttribute('aria-pressed') !== 'true'; $(id).setAttribute('aria-pressed', String(active)); $(id).classList.toggle('active', active); action(active); }); }
toggleTool('#walls-toggle', value => { world?.setAutoWalls(value); $('#wall-status').textContent = value ? '遮挡墙体自动隐藏' : '完整墙体已显示'; toast(value ? '随视角自动隐藏遮挡墙体' : '显示完整墙体'); });
toggleTool('#markers-toggle', value => world?.setMarkers(value)); toggleTool('#orbit-toggle', value => world?.setOrbit(value));
toggleTool('#quality-toggle', value => { world?.setQuality(value ? 'fine' : 'smooth'); $('#quality-label').textContent = value ? '精细画质' : '流畅画质'; toast(value ? '精细画质 · 更丰富的光影细节' : '流畅画质 · 更轻盈的操作体验'); });
function syncInspectorAccess() { $('#inspector').inert = editorUI.active || (innerWidth <= 1050 || document.body.classList.contains('immersive')) && !$('#inspector').classList.contains('open'); editorUI.syncAccess(); }
function setInspectorOpen(value) { $('#inspector').classList.toggle('open', value); syncInspectorAccess(); }
$('#mobile-devices').addEventListener('click', () => {if(editorUI.active)editorUI.setOpen(!editorUI.open);else setInspectorOpen(!$('#inspector').classList.contains('open'));}); $('#inspector-close').addEventListener('click', () => setInspectorOpen(false));
function setImmersive(value) {
  document.body.classList.toggle('immersive', value);
  $('#fullscreen-toggle').setAttribute('aria-pressed', String(value));
  $('#fullscreen-toggle').title = value ? '退出全屏' : '全屏看房';
  $('#fullscreen-toggle').innerHTML = icon(value ? 'collapse' : 'expand') + '<span>' + (value ? '退出全屏' : '全屏看房') + '</span>';
  setInspectorOpen(false);
  editorUI.setOpen(false);
}
$('#fullscreen-toggle').addEventListener('click', async () => {
  if (document.body.classList.contains('immersive')) {
    setImmersive(false);
    if (document.fullscreenElement) await document.exitFullscreen();
  } else {
    setImmersive(true);
    try { await document.documentElement.requestFullscreen?.(); }
    catch { toast('已展开看房视图，按 Esc 返回'); }
  }
});
document.addEventListener('fullscreenchange', () => setImmersive(!!document.fullscreenElement));
document.addEventListener('keydown', e => { if (e.key === 'Escape' && document.body.classList.contains('immersive') && !document.fullscreenElement) setImmersive(false); });
addEventListener('resize', syncInspectorAccess); syncInspectorAccess();
function openPlan() { $('#plan-dialog').showModal(); }
$('#plan-open').addEventListener('click', openPlan); $('#fallback-plan').addEventListener('click', openPlan); $('#help-open').addEventListener('click', () => $('#help-dialog').showModal());
document.querySelectorAll('[data-close-dialog]').forEach(el => el.addEventListener('click', () => el.closest('dialog').close()));
document.querySelectorAll('dialog').forEach(dialog => dialog.addEventListener('click', e => { if (e.target === dialog) { const r = dialog.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dialog.close(); } }));
document.addEventListener('keydown', e => { if (e.key === 'Escape') {setInspectorOpen(false);editorUI.setOpen(false);} });
$('#retry').addEventListener('click', () => location.reload());
function showError(message) { $('#loading').hidden = true; $('#error-message').textContent = message; $('#error-panel').hidden = false; document.querySelectorAll('.view-toolbar button').forEach(el => { el.disabled = true; }); }
renderLayout(); renderInspector(); renderSummary();
async function bootWorld() {
clearTimeout(loadingTimer); $('#edit-toggle').disabled=true; $('#loading').hidden = false; $('#loading').classList.remove('loaded'); $('#error-panel').hidden = true;
try {
  const { createWorld } = await import('./world.js');
  world = await createWorld($('#home-canvas'), $('#viewport'), state, {
    select: selectDevice, reset: resetView, error: showError, edit: info=>editorUI.render(info),
    hover(id, x, y) { const el = $('#hover-label'); el.hidden = !id; if (!id) return; const device = state.devices.find(d => d.id === id); el.textContent = `${device.name} · ${deviceStatus(device)}`; const rect = $('#viewport').getBoundingClientRect(); el.style.left = `${Math.max(10, Math.min(x - rect.left + 15, rect.width - 190))}px`; el.style.top = `${Math.max(12, y - rect.top - 42)}px`; },
  });
  // Honour controls used while the local model and shader modules were loading.
  world.setAutoWalls($('#walls-toggle').getAttribute('aria-pressed') === 'true');
  world.setMarkers($('#markers-toggle').getAttribute('aria-pressed') === 'true');
  world.setOrbit($('#orbit-toggle').getAttribute('aria-pressed') === 'true');
  if ($('#quality-toggle').getAttribute('aria-pressed') !== 'true') world.setQuality('smooth');
  world.select(selectedId);
  if (selectedRoom !== 'all') world.focusRoom(selectedRoom, true);
  if ($('#view-top').getAttribute('aria-pressed') === 'true') world.setView('top');
  document.querySelectorAll('.view-toolbar button').forEach(el => { el.disabled = false; });
  $('#edit-toggle').disabled=false;
  $('#loading').classList.add('loaded'); loadingTimer = setTimeout(() => { $('#loading').hidden = true; }, 800);
  return true;

} catch (error) {
  console.error('住宅场景初始化失败', error); showError('当前浏览器未能创建三维场景。请确认已启用图形加速，或先查看二维户型图。');
  return false;
}
}


function renderLayout() {
  renderNavigation(); $('#layout-current').textContent=layout.name+' · '+layout.area+'㎡'; $('#layout-area').textContent=layout.area; $('#residence-name').textContent=layout.name+' · '+layout.area; $('#residence-description').textContent=layout.subtitle;
  $('#plan-title').textContent=layout.name+' · '+layout.area+'㎡ 户型图'; $('#plan-image').src=layout.plan; $('#plan-image').alt=layout.name+layout.area+'平方米概念户型图，'+layout.description; $('#plan-description').textContent=layout.description; $('#plan-download').href=layout.plan; $('#plan-download').download=layout.name+'-'+layout.area+'平方米户型图.svg';
  $('#layout-options').innerHTML=layouts.map(l=>'<button class="layout-card '+(l.id===layout.id?'selected':'')+'" data-layout="'+l.id+'" aria-pressed="'+(l.id===layout.id)+'"><span class="layout-card-preview"><img src="'+l.plan+'" alt="'+l.name+'户型预览"></span><span class="layout-card-meta"><small>RESIDENCE '+l.code+'</small><strong>'+l.name+' <em>'+l.area+'<small>㎡</small></em></strong><span>'+l.subtitle+'</span><p>'+l.description+'</p><b>'+(l.id===layout.id?'当前户型':'探索这套户型 →')+'</b></span></button>').join('');
}
$('#layout-open').addEventListener('click',()=>$('#layout-dialog').showModal());
$('#layout-options').addEventListener('click',async event=>{
  const button=event.target.closest('[data-layout]');if(!button||switching)return;$('#layout-dialog').close();if(button.dataset.layout===layout.id)return;
  switching=true;$('#layout-open').disabled=true;saveState(state);$('#loading').hidden=false;$('#loading').classList.remove('loaded');await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);
  try {if(editorUI.active)editorUI.setMode(false);world?.dispose();world=null;layout=getLayout(button.dataset.layout);state=createState(null,layout.id);rooms=navigationRooms(layout);selectedId='living-pendant';selectedRoom='all';setInspectorOpen(false);$('#hover-label').hidden=true;renderLayout();setRoom('all',false);setViewButtons('3d');$('#orbit-toggle').setAttribute('aria-pressed','false');$('#orbit-toggle').classList.remove('active');renderInspector();renderSummary();const ready=await bootWorld();if(!ready)return;try{localStorage.setItem('habitat-active-layout',layout.id);}catch{}toast(layout.name+' · '+layout.area+'㎡，欢迎回家。');}
  finally{switching=false;$('#layout-open').disabled=false;}
});

$('#layout-open').disabled=true;
await bootWorld();
$('#layout-open').disabled=false;
addEventListener('pagehide', event => { saveState(state); if (!event.persisted) world?.dispose(); });
