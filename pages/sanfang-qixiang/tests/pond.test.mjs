import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { Scene, Vector3 } from '../assets/vendor/three/build/three.module.min.js'
import { LIN_ZEXU_MEMORIAL } from '../assets/data/linzexu-memorial.js'
import { getWorldPoint, isPointInRing } from '../assets/runtime/geometry.js'
import { createGroundWithPondHoles } from '../assets/runtime/river-geometry.js'
import { buildPondLife, createPondLayout, distanceToPondShore, getKoiPose, updatePondLife } from '../assets/runtime/pond-life.js'

test('馆区绿地轮廓不伸入池塘，半透明水面下不能露出岸上地面', () => {
  const cross = (a,b,c) => (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])
  for (const garden of LIN_ZEXU_MEMORIAL.gardens) for (const pond of LIN_ZEXU_MEMORIAL.ponds) {
    assert.ok(!garden.some(p=>isPointInRing(p,pond)) && !pond.some(p=>isPointInRing(p,garden)), '绿地与池塘内部不能重叠')
    for(let i=0;i<garden.length;i++) for(let j=0;j<pond.length;j++) {
      const a=garden[i],b=garden[(i+1)%garden.length],c=pond[j],d=pond[(j+1)%pond.length]
      assert.ok(!(cross(a,b,c)*cross(a,b,d)<0 && cross(c,d,a)*cross(c,d,b)<0), '绿地边线不能穿过池岸')
    }
  }
})

test('地面实际挖出池塘开口，不能用不透明地面盖住水下锦鲤', () => {
  const ring=[[-3,-2],[3,-2],[3,2],[-3,2]]
  const geometry=createGroundWithPondHoles(20,20,new Vector3(),[ring])
  const p=geometry.attributes.position,index=geometry.index.array
  let area=0
  for(let i=0;i<index.length;i+=3){
    const [a,b,c]=index.slice(i,i+3)
    area+=Math.abs((p.getX(b)-p.getX(a))*(p.getY(c)-p.getY(a))-(p.getY(b)-p.getY(a))*(p.getX(c)-p.getX(a)))/2
  }
  assert.ok(Math.abs(area-376)<1e-5)
  assert.ok(geometry.attributes.uv.array.every(value=>value>=0&&value<=1),'挖孔后仍保留原地面贴图的 0–1 范围')
  geometry.dispose()
})

test('锦鲤完整游动路径与身体余量始终留在实际凹形池岸内', async () => {
  const data=JSON.parse(await readFile(new URL('../assets/data/map-data.json',import.meta.url)))
  for(const [i,ring] of LIN_ZEXU_MEMORIAL.ponds.entries()){
    const projected=ring.map(p=>getWorldPoint(p,data.meta.origin)),layout=createPondLayout(projected,i+1)
    assert.ok(layout)
    assert.ok(layout.clusters.length>=2)
    for(const fish of layout.fish)for(let time=0;time<=180;time+=.7){
      const pose=getKoiPose(layout,fish,time)
      assert.ok(Object.values(pose).every(Number.isFinite))
      assert.ok(isPointInRing([pose.x,pose.z],projected))
      assert.ok(distanceToPondShore([pose.x,pose.z],projected)>fish.size*.95)
      assert.ok(pose.y+.245*fish.size<.07,'鱼背和鱼鳍在水面下')
    }
  }
})

test('池底、荷叶、荷花与锦鲤几何完整，并共用水面时钟更新', () => {
  const world={scene:new Scene(),waterClock:0}
  buildPondLife(world,[[[-14,-10],[14,-10],[14,10],[5,10],[5,6],[-14,6]]])
  assert.ok(world.pondLife.root.getObjectByName('pink-lotus-blossoms'))
  assert.ok(world.pondLife.root.getObjectByName('lotus-leaf-clusters'))
  const bed=world.pondLife.root.getObjectByName('silt-and-stone-pond-bed')
  assert.ok(Array.from(bed.geometry.attributes.position.array).filter((_,i)=>i%3===1).every(y=>y<-.25))
  let triangles=0
  world.scene.traverse(mesh=>{
    if(!mesh.geometry)return
    for(const a of Object.values(mesh.geometry.attributes))assert.ok(a.array.every(Number.isFinite))
    if(mesh.isMesh)triangles+=(mesh.geometry.index?.count??mesh.geometry.attributes.position.count)/3*(mesh.isInstancedMesh?mesh.count:1)
  })
  assert.ok(triangles<150000)
  const mesh=world.pondLife.fishMeshes[0].mesh,before=mesh.instanceMatrix.array.slice()
  world.waterClock=12;updatePondLife(world)
  assert.notDeepEqual(mesh.instanceMatrix.array,before)
  assert.equal(world.pondLife.time.value,12)
  world.scene.traverse(mesh=>{mesh.geometry?.dispose();mesh.material?.dispose();if(mesh.isInstancedMesh)mesh.dispose()})
})
