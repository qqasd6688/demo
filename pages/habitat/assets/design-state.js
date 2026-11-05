// Layout edits are independent from appliance state and from the other residences.
export const designKey = layoutId => `habitat-design-v1:${layoutId}`;
export const degrees = value => ((value % 360) + 360) % 360;
const round = value => Math.round(value * 1000) / 1000;
const clone = value => JSON.parse(JSON.stringify(value));

export const finishes = {
  textile: [
    {id:'original',name:'原配织物',color:'#ded3bf'},
    {id:'oat',name:'燕麦亚麻',color:'#e5d9c5',surface:'oat'},
    {id:'sage',name:'鼠尾草织物',color:'#94a38c',surface:'sage'},
    {id:'charcoal',name:'烟灰织物',color:'#696b68',surface:'charcoal'},
    {id:'leather',name:'焦糖皮革',color:'#aa7250',surface:'leather'},
  ],
  rug: [
    {id:'original',name:'原配地毯',color:'#ded3bf'},
    {id:'oat',name:'象牙圈绒',color:'#e5d9c5',surface:'oat'},
    {id:'sage',name:'苔绿编织',color:'#94a38c',surface:'sage'},
    {id:'charcoal',name:'烟灰编织',color:'#696b68',surface:'charcoal'},
    {id:'clay',name:'陶土织物',color:'#bb8970',surface:'clay'},
  ],
  wood: [
    {id:'original',name:'原配饰面',color:'#c2ab87'},
    {id:'oak',name:'自然白橡',color:'#cbb591',surface:'oak'},
    {id:'walnut',name:'深色胡桃',color:'#77604b',surface:'walnut'},
    {id:'ivory',name:'暖白烤漆',color:'#e3dfd4',surface:'ivory'},
    {id:'graphite',name:'石墨哑光',color:'#555d59',surface:'graphite'},
  ],
  stone: [
    {id:'original',name:'原配石材',color:'#c7c6c1'},
    {id:'marble',name:'暖白大理石',color:'#e5e1d8',surface:'marble'},
    {id:'smoke',name:'烟灰石材',color:'#727a78',surface:'smoke'},
    {id:'oak',name:'自然白橡',color:'#cbb591',surface:'oak'},
    {id:'walnut',name:'深色胡桃',color:'#77604b',surface:'walnut'},
  ],
  chair: [
    {id:'original',name:'原配组合',color:'#75634e'},
    {id:'oat-oak',name:'白橡 · 米白',color:'#dfd4bf',surface:'oat',frame:'oak'},
    {id:'sage-oak',name:'白橡 · 苔绿',color:'#96a28a',surface:'sage',frame:'oak'},
    {id:'leather-walnut',name:'胡桃 · 焦糖',color:'#ac7752',surface:'leather',frame:'walnut'},
    {id:'charcoal-walnut',name:'胡桃 · 烟灰',color:'#636964',surface:'charcoal',frame:'walnut'},
  ],
  metal: [
    {id:'original',name:'原配金属',color:'#b09a70'},
    {id:'brass',name:'拉丝黄铜',color:'#baa06d',surface:'brass'},
    {id:'steel',name:'拉丝银色',color:'#b4bcbb',surface:'steel'},
    {id:'ivory',name:'暖白涂层',color:'#e3dfd4',surface:'ivory'},
    {id:'graphite',name:'石墨哑光',color:'#555d59',surface:'graphite'},
  ],
  ceramic: [
    {id:'original',name:'原配釉面',color:'#dedbd0'},
    {id:'ivory',name:'象牙白釉',color:'#e3dfd4',surface:'porcelain'},
    {id:'clay',name:'赤陶哑光',color:'#b87d61',surface:'terracotta'},
    {id:'graphite',name:'墨色釉面',color:'#555d59',surface:'dark-glaze'},
  ],
};

// Clamp the rotated footprint to the apartment envelope, with optional 10 cm / 15° snap.
export function constrainPose(pose, footprint, layout, snap = false) {
  const rotation = degrees(snap ? Math.round(pose.rotation / 15) * 15 : pose.rotation);
  const r = rotation * Math.PI / 180, c = Math.cos(r), s = Math.sin(r);
  const corners = [[footprint.minX,footprint.minZ],[footprint.minX,footprint.maxZ],[footprint.maxX,footprint.minZ],[footprint.maxX,footprint.maxZ]];
  const xs = corners.map(([x,z])=>c*x+s*z), zs = corners.map(([x,z])=>-s*x+c*z);
  const xMin=-layout.width/2-Math.min(...xs), xMax=layout.width/2-Math.max(...xs);
  const zMin=-layout.depth/2-Math.min(...zs), zMax=layout.depth/2-Math.max(...zs);
  const x=snap?Math.round(pose.x*10)/10:pose.x, z=snap?Math.round(pose.z*10)/10:pose.z;
  return {x:round(xMin>xMax?(xMin+xMax)/2:Math.max(xMin,Math.min(xMax,x))),z:round(zMin>zMax?(zMin+zMax)/2:Math.max(zMin,Math.min(zMax,z))),rotation:round(rotation),finish:pose.finish};
}

export function createDesignStore(layoutId, descriptors, storage = null) {
  const defaults=Object.fromEntries(descriptors.map(item=>[item.id,{...item.initial,finish:'original'}]));
  let current=clone(defaults), past=[], future=[];
  function sanitize(raw) {
    const result=clone(defaults);
    for (const item of descriptors) {
      const value=raw?.[item.id]; if(!value || typeof value!=='object') continue;
      const pose=result[item.id];
      if(Number.isFinite(value.x)&&Number.isFinite(value.z)&&Number.isFinite(value.rotation)) {
        pose.x=Math.max(-100,Math.min(100,value.x));pose.z=Math.max(-100,Math.min(100,value.z));pose.rotation=degrees(value.rotation);
      }
      if(finishes[item.kind]?.some(f=>f.id===value.finish))pose.finish=value.finish;
    }
    return result;
  }
  try { storage ||= globalThis.localStorage; const raw=JSON.parse(storage?.getItem(designKey(layoutId))||'null');if(raw?.version===1)current=sanitize(raw.items); } catch {}
  function save() {try {storage?.setItem(designKey(layoutId),JSON.stringify({version:1,items:current}));return !!storage;}catch{return false;}}
  function commit(next) {
    const clean=sanitize(next);if(JSON.stringify(clean)===JSON.stringify(current))return {changed:false,saved:true};
    past.push(clone(current));if(past.length>50)past.shift();current=clean;future=[];return {changed:true,saved:save()};
  }
  return {
    get snapshot(){return clone(current);},get defaults(){return clone(defaults);},get canUndo(){return !!past.length;},get canRedo(){return !!future.length;},
    commit,
    undo(){if(!past.length)return false;future.push(clone(current));current=past.pop();return save();},
    redo(){if(!future.length)return false;past.push(clone(current));current=future.pop();return save();},
    reset(id){const next=clone(current);if(id)next[id]=clone(defaults[id]);return commit(id?next:defaults);},
  };
}
