import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { layouts, wallSegments, getLayout } from '../assets/layouts.js';
import { createState, saveState, applyScene, storageKey } from '../assets/state.js';
import { floorPlanSvg } from '../assets/floorplan.js';

const storage = () => { const map = new Map(); return { getItem:key => map.get(key), setItem:(key,value) => map.set(key,value) }; };
for (const layout of layouts) {
  test(`${layout.area}㎡：分区覆盖完整、无重叠，门窗处于有效墙段内`, () => {
    assert.equal(layout.width * layout.depth, layout.area);
    let area = 0;
    for (const room of layout.rooms) {
      const [x0,x1,z0,z1] = room.bounds;
      area += (x1-x0)*(z1-z0);
      assert.ok(x0 >= -layout.width/2 && x1 <= layout.width/2 && z0 >= -layout.depth/2 && z1 <= layout.depth/2);
      for (const other of layout.rooms.filter(r=>r.id!==room.id)) {
        const [a,b,c,d] = other.bounds;
        assert.ok(Math.min(x1,b)<=Math.max(x0,a) || Math.min(z1,d)<=Math.max(z0,c), `${room.id} overlaps ${other.id}`);
      }
    }
    assert.ok(Math.abs(area-layout.area)<1e-8);
    const walls=wallSegments(layout);
    for (const wall of walls) {
      const holes=[...wall.holes,...wall.windows.map(w=>({start:w.center-w.width/2,end:w.center+w.width/2}))].sort((a,b)=>a.start-b.start);
      for (const hole of holes) assert.ok(hole.start>=wall.start-1e-8 && hole.end<=wall.end+1e-8 && hole.end>hole.start);
      for (let i=1;i<holes.length;i++) assert.ok(holes[i].start>=holes[i-1].end,'door overlaps a window');
    }
    assert.equal(walls.flatMap(w=>w.holes).filter(h=>h.room==='entry').length,1);
    for (const room of layout.rooms.filter(r=>r.door)) assert.equal(walls.flatMap(w=>w.holes).filter(h=>h.room===room.id).length,1);
  });
  test(`${layout.area}㎡：设备唯一、预设覆盖新增房间，二维图与数据一致`, async () => {
    const state=createState(storage(),layout.id);
    assert.equal(state.devices.length,{compact:25,family:28,grand:33}[layout.id]);
    assert.equal(new Set(state.devices.map(d=>d.id)).size,state.devices.length);
    assert.ok(state.devices.every(d=>layout.rooms.some(r=>r.id===d.room)));
    assert.equal(state.devices.filter(d=>d.room==='master'&&d.type==='light').length,3);
    for (const name of ['movie','sleep','home','away']) {
      applyScene(state,name);
      assert.ok(state.devices.filter(d=>d.type==='light').every(d=>Number.isFinite(d.kelvin)&&Number.isFinite(d.brightness)));
    }
    assert.deepEqual(state.devices.filter(d=>d.on).map(d=>d.id),['kitchen-fridge']);
    assert.equal(await readFile(new URL(`../assets/plans/${layout.id}.svg`,import.meta.url),'utf8'),floorPlanSvg(layout));
  });
}
test('三套户型分别保存状态，切换不会覆盖相同设备 ID 的其他户型数据', () => {
  const db=storage();
  layouts.forEach((layout,index)=>{const state=createState(db,layout.id);state.devices[0].brightness=21+index*17;state.day=index%2?'night':'day';saveState(state,db);});
  layouts.forEach((layout,index)=>{const restored=createState(db,layout.id);assert.equal(restored.devices[0].brightness,21+index*17);assert.equal(restored.day,index%2?'night':'day');});
  assert.equal(new Set(layouts.map(l=>storageKey(l.id))).size,3);
  assert.equal(getLayout('invalid').id,'family');
});
test('本地三维模块依赖及 glTF 二进制、材质资源完整', async () => {
  const base=new URL('../assets/',import.meta.url), visited=new Set();
  async function checkModule(url) {
    if(visited.has(url.href))return; visited.add(url.href);
    const source=await readFile(url,'utf8');
    const imports=[...source.matchAll(/(?:from\s*|import\s*\()(['"])(\.{1,2}\/[^'"]+)\1/g)];
    for(const match of imports) await checkModule(new URL(match[2],url));
  }
  await checkModule(new URL('main.js',base));
  assert.ok(visited.size>20);
  const modelUrl=new URL('models/lounge-chair/chair.gltf',base), model=JSON.parse(await readFile(modelUrl,'utf8'));
  for(const resource of [...model.buffers,...model.images]) assert.ok((await stat(new URL(resource.uri,modelUrl))).size>100);
  for(const name of ['floor','walnut','oak','fabric','marble']) for(const map of ['color','normal','roughness']) assert.ok((await stat(new URL(`materials/${name}_${map}.jpg`,base))).size>1000);
  assert.ok((await stat(new URL('materials/studio_1k.hdr',base))).size>1000);
});
