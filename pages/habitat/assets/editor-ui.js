import { finishes } from './design-state.js';
import { icon } from './icons.js';

export function createEditorUI({getWorld,getRooms,getRoom,onMode,toast}) {
  const $=s=>document.querySelector(s),panel=$('#furniture-editor');
  let editing=false,lastId='',lastWorld=null;
  const editor=()=>getWorld()?.editor;
  const drawer=()=>innerWidth<=1050||document.body.classList.contains('immersive');
  function syncAccess(){panel.inert=!editing||(drawer()&&!panel.classList.contains('open'));}
  function setOpen(value){panel.classList.toggle('open',value);syncAccess();}
  function setMode(value){
    if(!editor())return;editing=value;lastId='';document.body.classList.toggle('editing',value);
    panel.hidden=!value;$('#inspector').hidden=value;$('#edit-ribbon').hidden=!value;
    $('#edit-toggle').setAttribute('aria-pressed',String(value));$('#edit-toggle').innerHTML=icon(value?'check':'sliders')+`<span>${value?'完成编辑':'编辑空间'}</span>`;
    $('#mobile-panel-label').textContent=value?'家具属性':'设备控制';$('#mobile-count').hidden=value;
    for(const id of ['markers-toggle','orbit-toggle'])$(`#${id}`).disabled=value;
    $('#orbit-toggle').setAttribute('aria-pressed','false');$('#orbit-toggle').classList.remove('active');
    setOpen(false);editor().setActive(value);if(value&&getRoom()!=='all')setRoom(getRoom());onMode(value);render();
    if(value)toast('拖动家具移动 · 拖动圆环旋转 · 自动保存');
  }
  function render(info=editor()?.info){
    if(!info||!editing)return;
    const {selected,pose,tool,snap,canUndo,canRedo,saved,dragging}=info;if(!selected)return;
    if(lastWorld!==getWorld()){
      lastWorld=getWorld();const items=editor().items;
      $('#furniture-select').innerHTML=getRooms().filter(r=>r.id!=='all').map(r=>`<optgroup label="${r.name}">${items.filter(i=>i.room===r.id).map(i=>`<option value="${i.id}">${i.name}</option>`).join('')}</optgroup>`).join('');
      $('#furniture-count').textContent=`${items.length} 件`;
    }
    if(lastId!==selected.id){
      lastId=selected.id;$('#furniture-title').textContent=selected.name;$('#furniture-select').value=selected.id;
      const room=getRooms().find(r=>r.id===selected.room),b=selected.footprint;
      $('#furniture-meta').textContent=`${room.name} · ${(b.maxX-b.minX).toFixed(2)} × ${(b.maxZ-b.minZ).toFixed(2)} m`;
      $('#finish-swatches').innerHTML=finishes[selected.kind].map(f=>`<button class="finish-swatch ${selected.kind}" data-finish="${f.id}" title="${f.name}" aria-label="${f.name}" aria-pressed="false"><i style="--swatch:${f.color}"><span>✓</span></i></button>`).join('');
      $('#finish-count').textContent=`0${finishes[selected.kind].length} FINISHES`;
    }
    $('#edit-selection-label').textContent=selected.name;
    document.querySelectorAll('#finish-swatches [data-finish]').forEach(el=>el.setAttribute('aria-pressed',String(el.dataset.finish===pose.finish)));
    $('#finish-name').textContent=finishes[selected.kind].find(f=>f.id===pose.finish)?.name;
    for(const [id,value]of [['furniture-x',pose.x],['furniture-z',pose.z],['furniture-angle',pose.rotation]]){const input=$(`#${id}`);if(document.activeElement!==input)input.value=Number(value.toFixed(id==='furniture-angle'?1:2));}
    document.querySelectorAll('[data-edit-tool]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.editTool===tool)));
    $('#edit-snap').setAttribute('aria-pressed',String(snap));$('#edit-precision').textContent=snap?'拖动吸附 10 cm · 旋转吸附 15°':'自由移动与旋转 · 输入数值可精确定位';
    $('#edit-undo').disabled=!canUndo;$('#edit-redo').disabled=!canRedo;
    $('#edit-save-status').textContent=dragging?'正在调整，松手保存':saved?'已保存到此浏览器':'暂未保存，浏览器存储不可用';
    panel.dataset.selected=selected.id;panel.dataset.finish=pose.finish;
  }
  function setRoom(id){if(!editing)return;const primary={living:'sofa',dining:'table',kitchen:'cabinet',master:'bed',guest:'bed',junior:'bed',study:'desk',bath:'vanity',ensuite:'vanity'};const item=editor()?.items.find(i=>i.id===`${id}-${primary[id]}`)||editor()?.items.find(i=>i.room===id);if(item)editor().select(item.id);}
  $('#edit-toggle').addEventListener('click',()=>setMode(!editing));$('#edit-done').addEventListener('click',()=>setMode(false));
  $('#editor-close').addEventListener('click',()=>setOpen(false));
  $('#furniture-select').addEventListener('change',e=>editor().select(e.target.value));
  $('#finish-swatches').addEventListener('click',e=>{const b=e.target.closest('[data-finish]');if(b)editor().change({finish:b.dataset.finish});});
  for(const [id,field]of [['furniture-x','x'],['furniture-z','z'],['furniture-angle','rotation']]){
    const input=$(`#${id}`),apply=()=>{if(input.value.trim()&&Number.isFinite(input.valueAsNumber))editor().change({[field]:input.valueAsNumber});input.blur();render();};
    input.addEventListener('change',apply);input.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();apply();}});
  }
  document.querySelectorAll('[data-edit-tool]').forEach(b=>b.addEventListener('click',()=>editor().setTool(b.dataset.editTool)));
  document.querySelectorAll('[data-rotate]').forEach(b=>b.addEventListener('click',()=>editor().rotate(Number(b.dataset.rotate))));
  $('#edit-snap').addEventListener('click',()=>editor().setSnap(!editor().info.snap));
  $('#edit-undo').addEventListener('click',()=>editor().undo());$('#edit-redo').addEventListener('click',()=>editor().redo());
  $('#edit-reset').addEventListener('click',()=>{editor().reset();toast('已恢复这件家具的位置、方向和材质，可撤销');});
  $('#edit-reset-all').addEventListener('click',()=>{editor().reset(true);toast('已恢复本户型的全部家具，可撤销');});
  return {render,setMode,setRoom,setOpen,syncAccess,get active(){return editing;},get open(){return panel.classList.contains('open');}};
}
