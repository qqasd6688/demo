const $ = selector => document.querySelector(selector);
const experience = $('#experience');
const controls = [...document.querySelectorAll('.view-tools button, .time-console button, .time-console input, .world-views button')];
let world;
let booting = false;
let immersive = false;

function announce(message) { $('#announcement').textContent = message; }
function timeLabel(value) {
  const minutes = Math.floor(value * 60) % 1440;
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}
function updateClock(hour) {
  const label = timeLabel(hour);
  $('#clock').textContent = label;
  $('#time').value = hour;
  $('#time').setAttribute('aria-valuetext', label);
  $('#phase').textContent = hour < 5 || hour >= 20 ? '星夜 · 萤火入梦' : hour < 8 ? '晨曦 · 山林初醒' : hour < 16.5 ? '日光 · 万物生长' : '暮色 · 云染余晖';
}
function fail(error) {
  console.error('微境场景未能运行：', error);
  $('#loading').hidden = true; $('#fallback').hidden = false; $('#world').hidden = true;
  $('#fallback-message').textContent = error.message?.includes('上下文') ? error.message : '当前设备无法开启三维场景，先欣赏这方微境。';
  controls.forEach(control => control.disabled = true);
  experience.classList.add('ready');
}
async function boot() {
  if (booting) return;
  booting = true; controls.forEach(control => control.disabled = true);
  $('#loading').hidden = false; $('#fallback').hidden = true; $('#world').hidden = false;
  experience.classList.remove('ready', 'paused');
  try {
    world?.dispose(); world = null;
    const { createWorld } = await import('./world.js');
    world = await createWorld({ canvas: $('#world'), host: $('#world-stage'), onTime: updateClock, onFailure: fail });
    controls.forEach(control => control.disabled = false);
    selectView('all');
    $('#orbit').setAttribute('aria-pressed', 'false'); $('#orbit').setAttribute('aria-label', '开启自动环绕');
    $('#atmosphere').setAttribute('aria-pressed', 'true');
    $('#pause').setAttribute('aria-pressed', 'false'); $('#pause').setAttribute('aria-label', '暂停时间');
    $('#play-icon').setAttribute('d', 'M7 5v10M13 5v10');
    $('.time-heading>span:first-child').innerHTML = '<i></i> 世界正在呼吸';
    experience.classList.add('ready');
    $('#loading').hidden = true;
  } catch (error) { fail(error); }
  finally { booting = false; }
}
function pause(value) {
  if (!world) return;
  world.state.paused = value;
  experience.classList.toggle('paused', value);
  $('#pause').setAttribute('aria-pressed', String(value));
  $('#pause').setAttribute('aria-label', value ? '继续时间' : '暂停时间');
  $('#pause').title = value ? '继续时间' : '暂停时间';
  $('#play-icon').setAttribute('d', value ? 'M7 4.5 15 10 7 15.5Z' : 'M7 5v10M13 5v10');
  $('.time-heading>span:first-child').innerHTML = value ? '<i></i> 时间停在此刻' : '<i></i> 世界正在呼吸';
  announce(value ? '世界时间与动画已暂停，仍可旋转观察。' : '世界时间继续流动。');
}
$('#pause').addEventListener('click', () => pause(!world?.state.paused));
$('#time').addEventListener('input', event => world?.setHour(Number(event.target.value)));
document.querySelectorAll('[data-time]').forEach(button => button.addEventListener('click', () => { world?.setHour(Number(button.dataset.time)); announce(`已切换到${button.textContent}。`); }));
$('#orbit').addEventListener('click', () => {
  if (!world) return;
  world.state.orbit = !world.state.orbit;
  $('#orbit').setAttribute('aria-pressed', String(world.state.orbit));
  $('#orbit').setAttribute('aria-label', world.state.orbit ? '关闭自动环绕' : '开启自动环绕');
  announce(world.state.orbit ? (world.state.paused ? '自动环绕已开启，继续时间后开始转动。' : '自动环绕已开启。') : '自动环绕已关闭。');
});
$('#atmosphere').addEventListener('click', () => { if (!world) return; world.setAtmosphere(!world.state.atmosphere); $('#atmosphere').setAttribute('aria-pressed', String(world.state.atmosphere)); announce(world.state.atmosphere ? '云雾已显示。' : '云雾已隐藏。'); });
const viewNotes={all:'沿雪线而上，或在林间停留。',alpine:'岩脊托起积雪，融水在山间汇成第一道溪流。',forest:'针叶之下，有蕨类、菌菇、倒木与悄然生长的苔藓。',water:'睡莲浮在倒影间，游鱼与蝴蝶经过这一片静水。'};
function selectView(id){document.querySelectorAll('[data-view]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.view===id)));$('#view-note').textContent=viewNotes[id];}
document.querySelectorAll('[data-view]').forEach(button=>button.addEventListener('click',()=>{world?.focus(button.dataset.view);selectView(button.dataset.view);}));
$('#reset').addEventListener('click', () => { world?.reset(); selectView('all'); announce('已恢复等距视角。'); });
function setImmersive(value) {
  immersive = value;
  experience.classList.toggle('immersive', value);
  $('#immerse').setAttribute('aria-pressed', String(value));
  $('#leave-immersive').hidden = !value;
  if (value) $('#leave-immersive').focus(); else $('#immerse').focus();
}
$('#immerse').addEventListener('click', () => setImmersive(true));
$('#leave-immersive').addEventListener('click', () => setImmersive(false));
document.addEventListener('keydown', event => { if (event.key === 'Escape' && immersive) setImmersive(false); if (event.code === 'Space' && event.target === $('#world')) { event.preventDefault(); pause(!world?.state.paused); } });
$('#retry').addEventListener('click', boot);
window.addEventListener('pagehide', () => world?.dispose());
window.addEventListener('pageshow', event => { if (event.persisted) boot(); });
boot();
