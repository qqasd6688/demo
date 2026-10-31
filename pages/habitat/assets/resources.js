import * as T from './vendor/three/build/three.module.min.js';
import { HDRLoader } from './vendor/three/examples/jsm/loaders/HDRLoader.js';
import { GLTFLoader } from './vendor/three/examples/jsm/loaders/GLTFLoader.js';
let pending;
export function loadResources() {
  if (!pending) pending = (async () => {
    const loader = new T.TextureLoader(), maps = {};
    await Promise.all(['floor','walnut','oak','fabric','marble'].map(async name => {
      const textures = await Promise.all(['color','normal','roughness'].map(kind => loader.loadAsync(new URL(`./materials/${name}_${kind}.jpg`,import.meta.url).href)));
      textures.forEach((texture,i) => { texture.colorSpace = i === 0 ? T.SRGBColorSpace : T.NoColorSpace; texture.wrapS = texture.wrapT = T.RepeatWrapping; texture.anisotropy = 8; });
      maps[name] = {map:textures[0],normalMap:textures[1],roughnessMap:textures[2]};
    }));
    const [hdr, chair] = await Promise.all([new HDRLoader().loadAsync(new URL('./materials/studio_1k.hdr',import.meta.url).href),new GLTFLoader().loadAsync(new URL('./models/lounge-chair/chair.gltf',import.meta.url).href)]);
    return { maps, hdr, chair:chair.scene };
  })().catch(error=>{pending=null;throw error;});
  return pending;
}
export function createPalette(resources, theme) {
  const mats = {}, physical = (name,options) => mats[name] = new T.MeshPhysicalMaterial(options);
  const textured = (name,map,color,scale,extra={}) => { const m=physical(name,{...resources.maps[map],color,roughness:1,normalScale:new T.Vector2(.45,.45),...extra});m.userData.metreScale=scale;return m; };
  textured('floor','floor','#dbd2c3',1.7,{roughness:.8,normalScale:new T.Vector2(.27,.27),clearcoat:.16,clearcoatRoughness:.45});
  textured('oak','oak','#c7b296',.5,{roughness:.75,normalScale:new T.Vector2(.25,.25)});
  textured('walnut','walnut','#b69b7f',1,{roughness:.66,clearcoat:.15,clearcoatRoughness:.4});
  textured('stone','marble','#f1eadd',3,{roughness:.36,normalScale:new T.Vector2(.07,.07),clearcoat:.32,clearcoatRoughness:.2});
  textured('fabric','fabric',theme==='walnut'?'#eee3d1':'#f6ecdc',.264,{roughness:1,sheen:.8,sheenColor:new T.Color('#e1d6c6'),normalScale:new T.Vector2(.7,.7)});
  textured('sage','fabric',theme==='walnut'?'#9e9d90':'#a1b099',.264,{roughness:1,sheen:.6,normalScale:new T.Vector2(.55,.55)});
  textured('linen','fabric','#e0dbce',.264,{roughness:1,sheen:.5,normalScale:new T.Vector2(.22,.22)});
  textured('rust','fabric','#986c50',.264,{roughness:1,sheen:.35,normalScale:new T.Vector2(.25,.25)});
  textured('rug','fabric','#e4dac6',.4,{roughness:1,normalScale:new T.Vector2(.9,.9),sheen:.45});
  physical('paint',{color:theme==='walnut'?'#595d56':theme==='sage'?'#657363':'#9d988a',roughness:.53});
  physical('wall',{color:'#ccc6ba',roughness:.92}); physical('trim',{color:'#e4dfd3',roughness:.55});
  physical('steel',{color:'#9ba3a3',metalness:.95,roughness:.28});physical('brass',{color:'#ab8d58',metalness:.92,roughness:.3});
  physical('black',{color:'#141a19',metalness:.35,roughness:.24,clearcoat:.6});physical('ceramic',{color:'#dfddd3',roughness:.18,clearcoat:.65});
  physical('glass',{color:'#b5c8c7',roughness:.06,metalness:.15,transparent:true,opacity:.2,depthWrite:false,side:T.DoubleSide,clearcoat:1});
  physical('earth',{color:'#453b2b',roughness:1});physical('leaf',{color:'#3f5c35',roughness:.68,side:T.DoubleSide});
  for(const [name,material] of Object.entries(mats))material.userData.surface=name;
  return mats;
}
