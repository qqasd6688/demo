import { createWorld } from './world.js';

const $ = selector => document.querySelector(selector);
let world, immersive = false, toastTimer, offlineReady = false;
const names = {excavator:'履带挖掘机',truck:'渣土运输车',crane:'塔式起重机',mixer:'混凝土搅拌车',loader:'轮式装载机'};
function announce(message){$('#toast').textContent=message;$('#toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('visible'),3000);}
function update(s){
  const mins=Math.floor(s.hour*60),label=`${String(Math.floor(mins/60)).padStart(2,'0')}:${String(mins%60).padStart(2,'0')}`;
  $('#clock').value=label;$('#clock').textContent=label;
  if(document.activeElement!==$('#time'))$('#time').value=s.hour;
  $('#time').setAttribute('aria-valuetext',label);
  $('#day-count').innerHTML=`第 ${String(s.day).padStart(2,'0')} 天 <i>·</i> ${s.paused?'时间已暂停':'时间流动中'}`;
  const storm=s.weather==='storm',p=s.truckPhase;
  $('#excavator-status').textContent=storm?'慢速 · 雨中清理':p<12?'开挖 · 装入运输车':'开挖 · 整理基坑';
  $('#truck-status').textContent=p<12?'待装 · 接运土方':p<31?'运输 · 前往卸料区':p<36?'卸料 · 翻斗倾倒':'返程 · 返回装料区';
  $('#crane-status').textContent=storm?'避风 · 暂停吊运':s.cranePhase<14?'起吊 · 转运预制构件':'回转 · 结构吊装';
  $('#mixer-status').textContent=storm?'慢速 · 持续搅拌':'搅拌 · 基础浇筑';
  $('#loader-status').textContent=storm?'慢速 · 场地清理':'铲运 · 物料转运';
  $('#activity-count').textContent=storm?'04 作业 / 01 避风':'05 台设备';
  $('#view-label').textContent=s.focus?`跟随 · ${names[s.focus]}`:s.orbit?'第三人称 · 自动环绕':'第三人称 · 自由观察';
  document.querySelectorAll('[data-machine]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.machine===s.focus)));
  const phase=s.hour<5||s.hour>=20?'星夜 · 灯火未眠':s.hour<8?'晨曦 · 开启新一天':s.hour>=17?'暮色 · 金色时刻':'晴朗 · 日光正好';
  $('#weather-caption').textContent=storm?'暴雨 · 听雨落下':s.weather==='overcast'?'阴天 · 云影缓行':phase;
  $('#temperature').textContent=storm?'19°C':s.weather==='overcast'?'22°C':s.hour<7||s.hour>19?'18°C':'26°C';
  // A small, read-only DOM diagnostic surface for local browser verification.
  const stage=$('#stage');stage.dataset.hour=s.hour.toFixed(3);stage.dataset.elapsed=s.elapsed.toFixed(3);stage.dataset.truckPhase=s.truckPhase.toFixed(2);stage.dataset.cranePhase=s.cranePhase.toFixed(2);stage.dataset.weather=s.weather;stage.dataset.fps=s.fps;stage.dataset.drawCalls=s.calls;
}
function boot(){
  try{world=createWorld($('#world'),update);$('#loading').hidden=true;document.body.classList.add('ready');}
  catch(error){console.error('方寸工地启动失败',error);fail('当前浏览器未能创建三维场景，请检查 Chrome 的图形加速是否开启，然后重试。');}
}
function fail(message){$('#loading').hidden=true;$('#error-state').hidden=false;$('#error-message').textContent=message;world?.dispose();document.querySelectorAll('.control-deck button,.control-deck input,.view-tools button,.machine-row').forEach(b=>b.disabled=true);}
function pause(){if(!world)return;world.state.paused=!world.state.paused;const p=world.state.paused;$('#pause').setAttribute('aria-pressed',String(p));$('#pause').setAttribute('aria-label',p?'继续施工':'暂停施工');$('#pause-icon').innerHTML=p?'<path d="m9 5 10 7-10 7Z"/>':'<path d="M8 6v12M16 6v12"/>';$('#run-label').textContent=p?'时间停在此刻':'世界正在建造';announce(p?'施工与昼夜已暂停，仍可自由观察':'继续建造，时间重新流动');}
function reset(){world?.home();$('#orbit').setAttribute('aria-pressed','false');announce('已回到沙盘全景');}
function focusMode(){immersive=!immersive;document.body.classList.toggle('immersive',immersive);$('#exit-focus').hidden=!immersive;$('#focus-toggle').setAttribute('aria-pressed',String(immersive));world?.resize();}
$('#pause').addEventListener('click',pause);
$('#speed').addEventListener('click',()=>{if(!world)return;const next={1:2,2:4,4:1}[world.state.speed];world.state.speed=next;$('#speed').textContent=next+'×';$('#speed').setAttribute('aria-label',`切换模拟速度，当前${next}倍`);announce(`模拟速度 ${next}×`);});
$('#time').addEventListener('input',e=>world?.setHour(Number(e.target.value)));
document.querySelectorAll('[data-hour]').forEach(b=>b.addEventListener('click',()=>{world?.setHour(Number(b.dataset.hour));announce(`时间已切换至 ${b.textContent}`);}));
document.querySelectorAll('[data-weather]').forEach(b=>b.addEventListener('click',()=>{if(!world)return;world.state.weather=b.dataset.weather;document.querySelectorAll('[data-weather]').forEach(btn=>btn.setAttribute('aria-pressed',String(btn===b)));announce(b.dataset.weather==='storm'?'暴雨来临 · 设备减速，塔吊避风停机':b.dataset.weather==='sunny'?'云层散去 · 日光回到工地':'云影笼罩 · 漫射光照亮沙盘');update(world.getSnapshot());}));
document.querySelectorAll('[data-machine]').forEach(b=>b.addEventListener('click',()=>{if(!world)return;if(world.state.focus===b.dataset.machine){reset();return;}world.focus(b.dataset.machine);$('#orbit').setAttribute('aria-pressed','false');announce(`正在观察${names[b.dataset.machine]} · 拖动可退出跟随`);}));
$('#reset-view').addEventListener('click',reset);
$('#orbit').addEventListener('click',()=>{if(!world)return;world.state.orbit=!world.state.orbit;world.state.focus=null;$('#orbit').setAttribute('aria-pressed',String(world.state.orbit));announce(world.state.orbit?'环绕观察已开启':'环绕观察已关闭');});
$('#zoom-in').addEventListener('click',()=>world?.zoom(.82));$('#zoom-out').addEventListener('click',()=>world?.zoom(1.22));
$('#focus-toggle').addEventListener('click',focusMode);$('#exit-focus').addEventListener('click',focusMode);
$('#help').addEventListener('click',()=>$('#guide').showModal());$('#close-guide').addEventListener('click',()=>$('#guide').close());$('#start-exploring').addEventListener('click',()=>$('#guide').close());
$('#guide').addEventListener('click',e=>{if(e.target===$('#guide')){const r=$('#guide').getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)$('#guide').close();}});
document.addEventListener('keydown',e=>{if(e.target.matches('input,textarea,select')||$('#guide').open||e.ctrlKey||e.metaKey||e.altKey||e.repeat)return;if(e.code==='Space'){if(e.target.matches('button,a'))return;e.preventDefault();pause();}if(e.key.toLowerCase()==='r')reset();if(e.key.toLowerCase()==='f')focusMode();if(e.key==='Escape'&&immersive)focusMode();});
$('#retry').addEventListener('click',()=>location.reload());
$('#world').addEventListener('webglcontextlost',e=>{e.preventDefault();fail('图形上下文已中断。关闭其他较重的三维页面后，点击重新加载。');});
addEventListener('pagehide',()=>world?.dispose(),{once:true});
addEventListener('pageshow',e=>{if(e.persisted)location.reload();});
function showOfflineState(){const label=offlineReady?(navigator.onLine?'离线就绪':'离线运行'):'本地运行';$('#offline-state').innerHTML=`<i></i> ${label}`;$('#offline-state').title=offlineReady?'本页资源已缓存，断网后也可重新打开':'所有资源均来自本地，无外部服务';}
// Vite serves source via development-only module routes. Cache the static release only.
if('serviceWorker'in navigator&&!import.meta.hot){
  navigator.serviceWorker.register('./sw.js',{scope:'./'}).then(async registration=>{
    await navigator.serviceWorker.ready;
    const check=async()=>{const keys=await caches.keys();const prefix=`groundworks:${new URL(registration.scope).pathname}:`;offlineReady=keys.some(k=>k.startsWith(prefix));showOfflineState();};
    if(registration.active)await check();
    navigator.serviceWorker.addEventListener('controllerchange',check);
  }).catch(error=>{console.warn('离线缓存未启用，仍可通过本地服务器离线运行。',error.message);});
}
addEventListener('online',showOfflineState);addEventListener('offline',showOfflineState);
boot();
