import { simulate, defaults, presets, equipment, H2_LHV } from './simulation.js';
import { createScene, colors } from './scene.js';

const $ = id => document.getElementById(id);
const format = (n, digits=1) => n.toLocaleString('en-US',{minimumFractionDigits:digits,maximumFractionDigits:digits});
const symbols={electric:'ϟ',heat:'♨',cold:'❄',hydrogen:'H₂',gas:'◇'};
let input={...defaults}, inventory=72, selected='electrolyzer', paused=false, elapsed=0, scene=null, modal=null;
let result=simulate(input,inventory), samples=[];
const controlSpecs=[
  {id:'solar',name:'太阳辐照',unit:'W/m²',min:0,max:1000,step:10,icon:'☀',color:'#d2b86c',group:'weather'},
  {id:'wind',name:'环境风速',unit:'m/s',min:0,max:30,step:.5,icon:'≋',color:'#7bbac8',group:'weather'},
  {id:'temperature',name:'环境温度',unit:'°C',min:-10,max:45,step:1,icon:'♧',color:'#7bbac8',group:'weather'},
  {id:'electric',name:'电负荷',unit:'kW',min:0,max:1000,step:10,icon:'ϟ',color:colors.electric,group:'load'},
  {id:'heat',name:'热负荷基准',unit:'kW',min:0,max:700,step:10,icon:'♨',color:colors.heat,group:'load'},
  {id:'cold',name:'冷负荷基准',unit:'kW',min:0,max:700,step:10,icon:'❄',color:colors.cold,group:'load'},
  {id:'hydrogen',name:'用氢需求',unit:'kg/h',min:0,max:8,step:.1,icon:'H₂',color:colors.hydrogen,group:'load'},
];
for(const c of controlSpecs){
  const row=document.createElement('div');row.className='slider-control';row.style.setProperty('--control-color',c.color);
  row.innerHTML=`<div class="slider-label"><label for="control-${c.id}"><span class="control-icon">${c.icon}</span>${c.name}</label><output id="value-${c.id}" for="control-${c.id}"></output></div><input type="range" id="control-${c.id}" min="${c.min}" max="${c.max}" step="${c.step}" value="${input[c.id]}" aria-label="${c.name}">`;
  $(`${c.group}-controls`).append(row);
  $(`control-${c.id}`).addEventListener('input',event=>{input[c.id]=Number(event.target.value);$('scenario').value='custom';syncControls();refresh();});
}
for(const d of equipment){
  const btn=document.createElement('button');btn.className='equipment-row';btn.dataset.device=d.id;btn.setAttribute('aria-label',`选择${d.name}`);
  btn.innerHTML=`<span class="node-icon" style="color:${colors[d.type]}">${symbols[d.type]}</span><span class="node-name">${d.name}</span><span class="node-state">待机</span>`;
  btn.addEventListener('click',()=>selectDevice(d.id));$('equipment-list').append(btn);
}
const devicePicker=document.createElement('select');devicePicker.id='device-picker';devicePicker.setAttribute('aria-label','选择设备');devicePicker.innerHTML=equipment.map(d=>`<option value="${d.id}">${d.code} · ${d.name}</option>`).join('');devicePicker.value=selected;$('device-detail').querySelector('.panel-heading').after(devicePicker);devicePicker.addEventListener('change',()=>selectDevice(devicePicker.value));
const focusButton=document.createElement('button');focusButton.id='focus-device';focusButton.textContent='设备特写';focusButton.setAttribute('aria-pressed','false');focusButton.title='近距离查看当前选中设备的结构与材质';document.querySelector('.view-buttons').append(focusButton);focusButton.addEventListener('click',()=>scene?.focus(focusButton.getAttribute('aria-pressed')!=='true'));
const qualitySelect=document.createElement('select');qualitySelect.id='render-quality';qualitySelect.setAttribute('aria-label','场景画质');qualitySelect.innerHTML='<option value="high">精细画质</option><option value="balanced">流畅画质</option>';document.querySelector('.stage-top-actions').prepend(qualitySelect);qualitySelect.addEventListener('change',()=>scene?.setQuality(qualitySelect.value));
function syncControls(){for(const c of controlSpecs){const slider=$(`control-${c.id}`);slider.value=input[c.id];slider.style.setProperty('--fill',`${(input[c.id]-c.min)/(c.max-c.min)*100}%`);$(`value-${c.id}`).innerHTML=`${format(input[c.id],c.step<1?1:0)}<small>${c.unit}</small>`;slider.setAttribute('aria-valuetext',`${input[c.id]} ${c.unit}`);}}
const activePower={solar:s=>s.pv,wind:s=>s.windPower,grid:s=>s.gridImport+s.gridExport,electrolyzer:s=>s.electrolyzer,tank:s=>Math.abs(s.storageRate),fuelcell:s=>s.fuelcellElectric,gas:s=>s.gas,chp:s=>s.chpElectric,boiler:s=>s.boilerHeat,absorption:s=>s.absorptionCold,chiller:s=>s.chillerCold,load:s=>s.electricServed+s.heatServed+s.coldServed+s.hydrogenServed};
function selectDevice(id){selected=id;devicePicker.value=id;scene?.select(id);renderDetail();document.querySelectorAll('.equipment-row').forEach(el=>el.classList.toggle('active',el.dataset.device===id));if(window.matchMedia('(max-width: 740px)').matches)$('device-detail').scrollIntoView({behavior:'smooth',block:'center'});}
function renderDetail(){
  const d=equipment.find(d=>d.id===selected);$('device-code').textContent=d.code;$('device-name').textContent=d.name;$('device-symbol').textContent=symbols[d.type];$('device-equation').textContent=d.equation;$('device-description').textContent=d.description;
  $('device-status').textContent=paused?'仿真已暂停':activePower[d.id](result)>.01?(d.id==='tank'?(result.storageRate>=0?'充氢中':'放氢中'):'运行中'):'待机 · 按需调度';
  $('device-metrics').innerHTML=d.metrics(result).map(([label,value,unit])=>`<div><span>${label}</span><strong>${format(value,unit===''?2:1)}</strong><small>${unit}</small></div>`).join('');
}
const sourceColors=['#63e6be','#62b5fa','#f4ca64','#ba9afb','#526c80'];
function renderSources(){
  const sources=[['光伏发电',result.pv],['风力发电',result.windPower],['热电联产',result.chpElectric],['燃料电池',result.fuelcellElectric],['电网购电',result.gridImport]];
  const total=sources.reduce((sum,[,v])=>sum+v,0);$('supply-total').textContent=format(total,0);
  let offset=0;const circumference=Math.PI*130;
  $('ring-segments').innerHTML=sources.map(([,value],i)=>{const size=total?value/total*circumference:0;const circle=`<circle cx="80" cy="80" r="65" stroke="${sourceColors[i]}" stroke-dasharray="${Math.max(0,size-2)} ${circumference}" stroke-dashoffset="${-offset}"/>`;offset+=size;return size>0?circle:'';}).join('');
  $('source-list').innerHTML=sources.map(([label,value],i)=>`<div class="source-row"><i style="background:${sourceColors[i]}"></i><span>${label}</span><b>${format(value,1)}</b><small>kW</small></div>`).join('');
}
function timeLabel(minutes,seconds=false){const secondsTotal=12*3600+Math.floor(minutes*60);const h=Math.floor(secondsTotal/3600)%24,m=Math.floor(secondsTotal/60)%60,s=secondsTotal%60;return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}${seconds?`:${String(s).padStart(2,'0')}`:''}`;}
function render(){
  $('sim-time').textContent=timeLabel(elapsed,true);
  $('kpi-power').textContent=format(result.generation,1);$('kpi-renewable').textContent=format(result.renewableShare,1);$('kpi-storage').textContent=format(inventory,1);$('kpi-heat').textContent=format(result.heatServed,1);
  $('storage-caption').textContent=`容量 120 kg · SOC ${format(inventory/120*100,1)}%`;
  $('heat-caption').textContent=`实际热需求 ${format(result.heatDemand,1)} kW`;
  for(const el of document.querySelectorAll('.equipment-row')){const running=activePower[el.dataset.device](result)>.01;const status=el.querySelector('.node-state');status.textContent=running?'● 运行':'○ 待机';status.classList.toggle('running',running);}
  const residual=Math.max(...Object.values(result.balance).map(Math.abs));
  $('balance-status').textContent=residual<1e-6?'守恒':'异常';
  $('balance-list').innerHTML=[['电','electric'],['热','heat'],['冷','cold'],['氢','hydrogen']].map(([name,key])=>`<div class="balance-list-row"><span><i style="background:${colors[key]}"></i>${name}母线残差</span><b>${format(Math.abs(result.balance[key]),3)} kW</b></div>`).join('');
  const shortages=Object.entries(result.unmet).filter(([,v])=>v>1e-6);
  let message='供需平衡 · 各能量母线守恒校验通过';
  if(shortages.length){const names={electric:'电',heat:'热',cold:'冷',hydrogen:'氢'};message=`供能不足：${shortages.map(([k,v])=>`${names[k]} ${format(v,1)} ${k==='hydrogen'?'kg/h':'kW'}`).join(' · ')}`;}
  else if(inventory<.1)message='储氢已耗尽 · 燃料电池待机，电网补电';
  else if(inventory>119.9)message='储氢接近满载 · 制氢自动限功率，余电上网';
  else if(result.hydrogenProduction>.01)message=`富余电力制氢 ${format(result.hydrogenProduction,2)} kg/h · 母线平衡`;
  else if(result.fuelcellElectric>.01)message=`氢能协同保供 ${format(result.fuelcellElectric,1)} kW · 母线平衡`;
  $('system-message').textContent=paused?`仿真已暂停 · ${message}`:message;
  $('system-message').style.color=shortages.length?'#ffb983':'';
  renderSources();renderDetail();scene?.update(result);
  if(modal==='ledger')renderLedger();
}
function refresh(){result=simulate(input,inventory);render();}
function record(){samples.push({minute:elapsed,renewable:result.pv+result.windPower,demand:result.electricDemand+result.chillerElectric+result.electrolyzer+result.compression,grid:result.gridImport});if(samples.length>61)samples.shift();renderChart();}
function renderChart(){
  const max=Math.max(200,Math.ceil(Math.max(...samples.flatMap(p=>[p.renewable,p.demand,p.grid]))/200)*200);$('chart-max').textContent=format(max,0);$('chart-mid').textContent=format(max/2,0);
  const intervalCount=Math.max(1,samples.length-1);
  for(const key of ['renewable','demand','grid']){
    const line=samples.map((point,i)=>`${i?'L':'M'}${i/intervalCount*800},${100-point[key]/max*95}`).join(' ');$(`trend-${key}`).setAttribute('d',line);
    if(key==='renewable')$('trend-area').setAttribute('d',`${line} L${(samples.length-1)/intervalCount*800},100 L0,100 Z`);
  }
  $('chart-start').textContent=timeLabel(samples[0]?.minute||0);$('chart-end').textContent=timeLabel(elapsed);
}
function row(label,value){return `<div class="ledger-row"><span>${label}</span><b>${format(value,3)} kW</b></div>`;}
function renderLedger(){
  const s=result;$('dialog-content').innerHTML=`<p class="ledger-intro">以整个园区转换设备与储氢罐为边界，使用低位热值（LHV）核算。制冷是搬运建筑内的热量，因此<strong>冷负荷吸热计入边界输入</strong>，冷机排热计入输出；储氢净变化可正可负。</p><div class="ledger-grid"><section class="ledger-block"><h3>进入系统</h3>${row('光伏与风电输出',s.pv+s.windPower)}${row('电网购电',s.gridImport)}${row('天然气输入 · LHV',s.gas)}${row('从冷负荷吸收的热量',s.coldServed)}<div class="ledger-row total"><span>总输入</span><b>${format(s.supply,3)} kW</b></div></section><section class="ledger-block"><h3>离开系统 / 进入储能</h3>${row('园区用电',s.electricServed)}${row('园区用热',s.heatServed)}${row('园区用氢 · LHV',s.hydrogenServed*H2_LHV)}${row('余电上网',s.gridExport)}${row('储氢净积累（负值为释放）',s.storagePower)}${row('转换损耗 + 压缩散热',s.conversionLoss)}${row('冷机环境排热',s.coolingReject)}${row('未利用余热',s.heatDump)}<div class="ledger-row total"><span>总输出 + 净积累</span><b>${format(s.use,3)} kW</b></div></section></div><div class="ledger-result"><span>Σ 输入 − Σ 输出 − Δ 储能</span><b>${format(Math.abs(s.balance.total),6)} kW · ${Math.abs(s.balance.total)<1e-6?'守恒通过':'请检查'}</b></div><p class="ledger-note">当前实际需求：电 ${format(s.electricDemand)} kW · 热 ${format(s.heatDemand)} kW · 冷 ${format(s.coldDemand)} kW · 氢 ${format(s.hydrogen)} kg/h。<br>当前缺供：电 ${format(s.unmet.electric)} kW · 热 ${format(s.unmet.heat)} kW · 冷 ${format(s.unmet.cold)} kW · 氢 ${format(s.unmet.hydrogen)} kg/h。<br>压缩功耗 ${format(s.compression)} kW 已独立计入电母线。可用储氢 ${format(s.inventory,2)} kg；净充放 ${format(s.storageRate,2)} kg/h。物理模型按一分钟步长积分，当前面板显示即时功率，图表为已采样历史。</p>`;
}
function renderGuide(){
  $('dialog-content').innerHTML=`<p class="ledger-intro">从能源输入、转换、存储到终端需求。点击场站中的设备或设备列表查看对应的参数、转换关系与调度逻辑。</p><div class="topology-row"><span class="electric">光伏 / 风电 / 电网</span><em>→ 电母线 →</em><span>园区电负荷</span><span class="cold">电驱冷机 → 冷负荷</span></div><div class="topology-row"><span class="electric">富余电力 + 水</span><em>→</em><span class="hydrogen">PEM 电解槽 → 压缩 → 储氢罐</span><em>→</em><span class="hydrogen">园区用氢</span></div><div class="topology-row"><span class="hydrogen">储氢罐</span><em>→</em><span class="hydrogen">燃料电池</span><em>→</em><span class="electric">电母线</span><span class="heat">低温回收热 → 供暖</span></div><div class="topology-row"><span class="gas">天然气</span><em>→</em><span class="heat">CHP 热电联产</span><em>→</em><span class="electric">电母线</span><span class="heat">高温余热 → 供暖 / 吸收制冷</span></div><div class="topology-row"><span class="gas">天然气</span><em>→</em><span class="heat">补热锅炉 → 热负荷</span><span class="cold">吸收制冷 → 冷负荷</span></div><div class="assumption-grid"><div><b>氢能回路</b>电解 LHV 效率 68%<br>压缩耗电 2 kWh/kg<br>燃料电池电 / 热效率 50% / 35%</div><div><b>热冷耦合</b>CHP 电 / 热效率 36% / 44%<br>锅炉热效率 90%<br>吸收制冷 COP 0.72</div><div><b>边界与容量</b>储氢 0–120 kg<br>电解电堆 0–320 kW<br>电网购电 ≤ 1,000 kW</div></div><p class="ledger-note">本页面为演示仿真，数值为透明的设计假设，并非实际设备保证值。采用准稳态功率调度，忽略启停时间、管损及小型循环泵功耗；燃料电池低温余热只用于供暖，不用于高温驱动制冷。氢低位热值取 33.33 kWh/kg；天然气取 9.7 kWh/Nm³。气象由控制面板独立指定，不随仿真时钟自动变化。流动粒子表示能源方向与相对流量，停机支路不播放流动。</p><div class="reference-links"><a href="https://www.energy.gov/cmei/fuels/hydrogen-production-electrolysis" target="_blank" rel="noopener noreferrer">DOE · 电解制氢原理 ↗</a><a href="https://www.energy.gov/cmei/fuels/fuel-cells" target="_blank" rel="noopener noreferrer">DOE · 燃料电池原理 ↗</a><a href="https://www.energy.gov/sites/default/files/2017/06/f35/CHP-Absorption%20Chiller-compliant.pdf" target="_blank" rel="noopener noreferrer">DOE · 吸收制冷 ↗</a></div>`;
}
function openDialog(type){modal=type;$('dialog-title').textContent=type==='ledger'?'能量守恒账本':'多能转换 · 系统拓扑';type==='ledger'?renderLedger():renderGuide();$('info-dialog').showModal();}
$('open-ledger').addEventListener('click',()=>openDialog('ledger'));$('open-ledger-secondary').addEventListener('click',()=>openDialog('ledger'));$('open-guide').addEventListener('click',()=>openDialog('guide'));
$('close-dialog').addEventListener('click',()=>$('info-dialog').close());$('info-dialog').addEventListener('close',()=>modal=null);$('info-dialog').addEventListener('click',event=>{if(event.target===$('info-dialog')){const rect=event.target.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)event.target.close();}});
$('scenario').addEventListener('change',event=>{if(presets[event.target.value]){input={...presets[event.target.value]};syncControls();refresh();}});
function setPaused(value){paused=value;scene?.setPaused(value);$('pause').textContent=value?'▶ 继续仿真':'Ⅱ 暂停仿真';$('pause').setAttribute('aria-pressed',String(value));render();}
$('pause').addEventListener('click',()=>setPaused(!paused));
$('reset-simulation').addEventListener('click',()=>{input={...defaults};inventory=72;elapsed=0;samples=[];$('scenario').value='balanced';syncControls();refresh();record();setPaused(false);});
$('labels-toggle').addEventListener('click',event=>{const show=event.currentTarget.getAttribute('aria-pressed')!=='true';event.currentTarget.setAttribute('aria-pressed',String(show));scene?.setLabels(show);});
for(const view of ['iso','top'])$(`view-${view}`).addEventListener('click',()=>{scene?.view(view);$('view-iso').classList.toggle('active',view==='iso');$('view-top').classList.toggle('active',view==='top');});
$('auto-rotate').addEventListener('click',event=>{const value=event.currentTarget.getAttribute('aria-pressed')!=='true';event.currentTarget.setAttribute('aria-pressed',String(value));event.currentTarget.classList.toggle('active',value);scene?.setAuto(value);});
$('zoom-in').addEventListener('click',()=>scene?.zoom(1.15));$('zoom-out').addEventListener('click',()=>scene?.zoom(1/1.15));
$('energy-legend').addEventListener('click',event=>{const button=event.target.closest('button');if(!button)return;document.querySelectorAll('[data-energy]').forEach(el=>{const active=el===button;el.classList.toggle('active',active);el.setAttribute('aria-pressed',String(active));});scene?.setFilter(button.dataset.energy);});
$('fullscreen').addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await $('stage').requestFullscreen();}catch{$('system-message').textContent='此浏览器不支持全屏，可使用场景缩放按钮查看。';}});
syncControls();render();record();
try{scene=createScene($('scene-host'),selectDevice);scene.update(result);$('scene-loading').hidden=true;}catch(error){$('scene-loading').innerHTML='<p>3D 场景暂不可用</p><p>请启用 WebGL / 浏览器硬件加速后刷新。</p><p>仿真控制台与设备参数仍可使用。</p>';console.error('NEXUS scene initialization:',error);}
document.querySelector('[data-device="electrolyzer"].equipment-row')?.classList.add('active');
const timer=setInterval(()=>{if(paused||document.hidden)return;const step=simulate(input,inventory,1/60);inventory=step.storage;elapsed+=1;refresh();record();},1000);
window.addEventListener('pagehide',()=>{clearInterval(timer);scene?.dispose();});
window.addEventListener('pageshow',event=>{if(event.persisted)location.reload();});
