const names = { living: ['客厅','Living room','sofa'], dining: ['餐厅','Dining room','dining'], kitchen: ['厨房','Kitchen','kitchen'], master: ['主卧','Master suite','bed'], guest: ['次卧','Guest bedroom','bed'], study: ['书房','Study','desk'], bath: ['卫生间','Bathroom','bath'], junior: ['儿童房','Junior suite','bed'], ensuite: ['主卫','En suite','bath'], hall: ['过廊','Gallery','home'] };
const room = (id, bounds, door, type = id) => { const [name,en,icon] = names[id]; return { id,type,name,en,icon,bounds,door,target:[(bounds[0]+bounds[1])/2,(bounds[2]+bounds[3])/2],nav:id!=='hall' }; };
const window = (room,side,center,width,sill=.65) => ({room,side,center,width,sill});
export const layouts = [
  { id:'compact', name:'晨光', area:85, width:10, depth:8.5, height:2.65, subtitle:'紧凑两居', description:'开放客餐厅 · 两间卧室 · 一厨一卫', theme:'oat', code:'01', plan:'./assets/plans/compact.svg',
    rooms:[room('living',[-5,1,.25,4.25]),room('dining',[-2,1,-4.25,.25]),room('kitchen',[-5,-2,-4.25,-1.75],{side:'east',center:-3,width:1.1}),room('master',[1,5,-4.25,-.75],{side:'south',center:2.8,width:1}),room('guest',[1,5,.75,4.25],{side:'north',center:2.9,width:1}),room('bath',[-5,-2,-1.75,.25],{side:'east',center:-.7,width:.8}),room('hall',[1,5,-.75,.75])],
    windows:[window('living','south',-2,4.5,.3),window('master','east',-2.5,2.2),window('guest','east',2.5,2.1)],
  },
  { id:'family', name:'林间', area:120, width:12, depth:10, height:2.75, subtitle:'舒适三空间', description:'两间卧室 · 独立书房 · 一厨一卫', theme:'sage', code:'02', plan:'./assets/plans/family.svg',
    rooms:[room('living',[-6,1.2,0,5]),room('dining',[-2.6,1.2,-5,0]),room('kitchen',[-6,-2.6,-5,-2],{side:'east',center:-3,width:1.1}),room('master',[1.2,6,-5,-.5],{side:'south',center:3.1,width:1.1}),room('guest',[1.2,3.8,1,5],{side:'west',center:1.6,width:1}),room('study',[3.8,6,1,5],{side:'north',center:4.7,width:.95}),room('bath',[-6,-2.6,-2,0],{side:'east',center:-1,width:.8}),room('hall',[1.2,6,-.5,1])],
    windows:[window('living','south',-2.6,5.2,.28),window('master','east',-2.8,2.9,.4),window('guest','south',2.5,1.6),window('study','south',4.9,1.6)],
  },
  { id:'grand', name:'云邸', area:220, width:20, depth:11, height:2.9, subtitle:'全景大平层', description:'三间卧室 · 双卫 · 独立书房 · 中岛厨房', theme:'walnut', code:'03', plan:'./assets/plans/grand.svg',
    rooms:[room('living',[-10,-2,0,5.5]),room('dining',[-2,3,0,5.5]),room('kitchen',[-10,-5,-5.5,-1],{side:'south',center:-6,width:1.4}),room('master',[2,7,-5.5,-1],{side:'south',center:4.8,width:1.2}),room('guest',[-5,-.5,-5.5,-1],{side:'south',center:-2,width:1}),room('junior',[6.5,10,0,5.5],{side:'north',center:8.1,width:1},'guest'),room('study',[3,6.5,0,5.5],{side:'north',center:4.6,width:1}),room('bath',[-.5,2,-5.5,-1],{side:'south',center:.75,width:.85}),room('ensuite',[7,10,-5.5,-1],{side:'west',center:-2.5,width:.9},'bath'),room('hall',[-10,10,-1,0])],
    windows:[window('living','south',-6,7.1,.18),window('dining','south',.5,4.2,.18),window('master','north',4.5,3.7,1.15),window('guest','north',-2.8,3.2,1.15),window('junior','east',3,3.3,.45),window('study','south',4.75,2.6,.35),window('kitchen','west',-3.4,2.6,1.25),window('ensuite','east',-4.1,1.4,1.4)],
  },
];
export const DEFAULT_LAYOUT = 'family';
export const getLayout = id => layouts.find(l=>l.id===id) || layouts.find(l=>l.id===DEFAULT_LAYOUT);
export function navigationRooms(layout) { return [{id:'all',name:'全屋',en:'Whole home',icon:'home',target:[0,0],area:layout.area},...layout.rooms.filter(r=>r.nav)]; }
export function edge(room, side) { const [x0,x1,z0,z1]=room.bounds; return side==='north'||side==='south' ? {axis:'x',fixed:side==='north'?z0:z1,start:x0,end:x1} : {axis:'z',fixed:side==='west'?x0:x1,start:z0,end:z1}; }
export function wallSegments(layout) {
  const lines = new Map();
  for(const r of layout.rooms) for(const side of ['north','south','west','east']) { const e=edge(r,side),key=`${e.axis}:${e.fixed}`; if(!lines.has(key))lines.set(key,[]); lines.get(key).push({...e,room:r,side}); }
  const result=[];
  for(const entries of lines.values()) {
    const cuts=[...new Set(entries.flatMap(e=>[e.start,e.end]))].sort((a,b)=>a-b);
    for(let i=0;i<cuts.length-1;i++) {
      const start=cuts[i],end=cuts[i+1],mid=(start+end)/2,owners=entries.filter(e=>mid>e.start&&mid<e.end);
      if(!owners.length)continue;
      const {axis,fixed}=owners[0], ids=owners.map(e=>e.room.id), exterior=owners.length===1;
      if(!exterior && ids.every(id=>['living','dining','hall'].includes(id)))continue;
      const holes=[];
      for(const e of owners) { const d=e.room.door; if(d?.side===e.side&&d.center>start&&d.center<end)holes.push({start:d.center-d.width/2,end:d.center+d.width/2,kind:'door',room:e.room.id,side:e.side}); }
      // A generous gallery entrance, independently from the room door openings.
      if(exterior&&axis==='z'&&fixed===layout.width/2&&owners[0].room.id==='hall') holes.push({start:Math.max(start,-.9),end:Math.min(end,.6),kind:'door',room:'entry',side:'east'});
      const windows=exterior?layout.windows.filter(w=>owners.some(e=>e.room.id===w.room&&e.side===w.side)):[];
      result.push({axis,fixed,start,end,exterior,normal:axis==='x'?[0,Math.sign(fixed)]:[Math.sign(fixed),0],holes,windows});
    }
  }
  return result;
}
