import * as T from './vendor/three/build/three.module.min.js';
import { seeded } from './layout.js';

function canvasTexture(draw, size = 512, color = true) {
  const c = document.createElement('canvas'); c.width = c.height = size; draw(c.getContext('2d'), size);
  const t = new T.CanvasTexture(c); t.colorSpace = color ? T.SRGBColorSpace : T.NoColorSpace; t.wrapS = t.wrapT = T.RepeatWrapping; t.anisotropy = 8; return t;
}

function worldUV(material, scale = 1) {
  material.onBeforeCompile = shader => {
    shader.vertexShader = 'varying vec3 vGardenWorld;\n' + shader.vertexShader;
    shader.fragmentShader = 'varying vec3 vGardenWorld;\n' + shader.fragmentShader;
    if (material.userData.limestone) shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', '#include <map_fragment>\nfloat mineralLuma=dot(diffuseColor.rgb,vec3(.2126,.7152,.0722));diffuseColor.rgb=mix(vec3(mineralLuma)*vec3(.92,.98,1.),diffuseColor.rgb,.18);');
    if (material.userData.plaster) shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', '#include <map_fragment>\nfloat wallAge=1.-smoothstep(.5,1.5,vGardenWorld.y);float streak=.5+.5*sin(vGardenWorld.x*23.+vGardenWorld.z*31.);diffuseColor.rgb*=1.3-wallAge*(.24+streak*.14);');
    shader.vertexShader = shader.vertexShader.replace('#include <uv_vertex>', `#include <uv_vertex>
      vec4 pWorld=vec4(position,1.); vec3 nWorld=normal;
      #ifdef USE_INSTANCING
        pWorld=instanceMatrix*pWorld; nWorld=mat3(instanceMatrix)*nWorld;
      #endif
      pWorld=modelMatrix*pWorld;vGardenWorld=pWorld.xyz; nWorld=normalize(mat3(modelMatrix)*nWorld);
      vec3 an=abs(nWorld); vec2 worldTile=an.y>an.x&&an.y>an.z?pWorld.xz:(an.x>an.z?pWorld.zy:pWorld.xy);
      worldTile*=${scale.toFixed(5)};
      #ifdef USE_MAP
        vMapUv=worldTile;
      #endif
      #ifdef USE_NORMALMAP
        vNormalMapUv=worldTile;
      #endif
      #ifdef USE_ROUGHNESSMAP
        vRoughnessMapUv=worldTile;
      #endif`);
  };
  material.customProgramCacheKey = () => `garden-world-uv-${scale}-${!!material.userData.limestone}-${!!material.userData.plaster}`;
  return material;
}

export async function createMaterials(renderer, uniforms, progress) {
  const loader = new T.TextureLoader(), textures = [], failures = [];
  const anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  let loaded = 0;
  const load = async (name, color) => {
    try {
      const t = await loader.loadAsync(new URL(`./textures/${name}`, import.meta.url).href);
      t.colorSpace = color ? T.SRGBColorSpace : T.NoColorSpace; t.wrapS = t.wrapT = T.RepeatWrapping; t.anisotropy = anisotropy; textures.push(t); return t;
    } catch { failures.push(name); return null; }
    finally { progress?.(++loaded / 15); }
  };
  const bundles = await Promise.all(['stone_floor', 'rock_pitted_mossy', 'white_plaster_02', 'aerial_grass_rock', 'bark_brown_02'].map(async name => {
    const [map, normalMap, roughnessMap] = await Promise.all(['Diffuse', 'nor_gl', 'arm'].map((channel, i) => load(`${name}_${channel}.jpg`, i === 0)));
    return { map, normalMap, roughnessMap };
  }));
  const stone = worldUV(new T.MeshStandardMaterial({ ...bundles[0], color: '#a4aaa0', roughness: .91, normalScale: new T.Vector2(.65, .65) }), .24);
  const rock = worldUV(new T.MeshStandardMaterial({ ...bundles[1], color: '#b6c2bf', roughness: .95, normalScale: new T.Vector2(.65, .65) }), .38);
  rock.userData.limestone = true;
  const plaster = worldUV(new T.MeshStandardMaterial({ ...bundles[2], color: '#fffdf5', roughness: .94, normalScale: new T.Vector2(.28, .28) }), .42); plaster.userData.plaster = true;
  const ground = worldUV(new T.MeshStandardMaterial({ ...bundles[3], color: '#a5b48a', roughness: 1, normalScale: new T.Vector2(.6, .6) }), .13);
  const bark = worldUV(new T.MeshStandardMaterial({ ...bundles[4], color: '#777365', roughness: .95, normalScale: new T.Vector2(.75, .75) }), .52);
  const rng = seeded(24);
  const woodMap = canvasTexture((ctx, s) => {
    ctx.fillStyle = '#5b3b29'; ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 2200; i++) {
      const x = rng() * s, a = .025 + rng() * .15; ctx.strokeStyle = rng() > .5 ? `rgba(228,179,109,${a})` : `rgba(16,15,10,${a})`;
      ctx.lineWidth = .5 + rng() * 1.5; ctx.beginPath(); ctx.moveTo(x, 0);
      for (let y = 0; y <= s; y += 8) ctx.lineTo(x + Math.sin(y * .017 + x * .035) * 2.5 + Math.sin(y * .07) * .6, y); ctx.stroke();
    }
    for (let i = 0; i < 5; i++) { const x = rng() * s, y = rng() * s; for (let j = 0; j < 8; j++) { ctx.strokeStyle = 'rgba(25,16,9,.14)'; ctx.beginPath(); ctx.ellipse(x, y, 2 + j * 1.6, 9 + j * 6, 0, 0, Math.PI * 2); ctx.stroke(); } }
  });
  const tileMap = canvasTexture((ctx, s) => {
    ctx.fillStyle = '#454c4b'; ctx.fillRect(0, 0, s, s);
    for (let y = 0; y < s; y += 32) for (let x = 0; x < s; x += 32) {
      const value = 58 + rng() * 24; ctx.fillStyle = `rgb(${value},${value + 5},${value + 4})`; ctx.fillRect(x + 1, y + 1, 31, 31);
      ctx.fillStyle = 'rgba(9,18,18,.4)'; ctx.fillRect(x, y, 1.5, 32); ctx.fillRect(x, y + 30, 32, 2);
      ctx.fillStyle = 'rgba(190,198,171,.12)'; ctx.fillRect(x + 2, y + 2, 1, 27);
    }
    for (let i = 0; i < 22000; i++) { ctx.fillStyle = `rgba(${rng() > .6 ? '150,155,123' : '12,24,20'},${rng() * .12})`; ctx.fillRect(rng() * s, rng() * s, 1, 1); }
  });
  const wood = new T.MeshStandardMaterial({ map: woodMap, color: '#b8a68f', roughness: .72, bumpMap: woodMap, bumpScale: .025 });
  const darkWood = wood.clone(); darkWood.color.set('#655746');
  const roof = new T.MeshStandardMaterial({ map: tileMap, color: '#abb3ae', roughness: .86, bumpMap: tileMap, bumpScale: .06, side: T.DoubleSide });
  const metal = new T.MeshStandardMaterial({ color: '#756749', metalness: .72, roughness: .45 });
  const moss = new T.MeshStandardMaterial({ color: '#546735', roughness: 1 });
  const paleStone = rock.clone(); paleStone.color.set('#d5dbd6'); paleStone.onBeforeCompile = rock.onBeforeCompile; paleStone.customProgramCacheKey = rock.customProgramCacheKey;
  const paper = new T.MeshStandardMaterial({ color: '#f0dab0', roughness: .87, emissive: '#ffad50', emissiveIntensity: 0 });
  const glass = new T.MeshStandardMaterial({ color: '#a3baaa', roughness: .21, metalness: .1, transparent: true, opacity: .28, depthWrite: false });
  const leafMap = makeLeafTexture('broad', 73);
  const bambooMap = makeLeafTexture('bamboo', 29);
  const pineMap = makeLeafTexture('pine', 39);
  const leafMaterial = (map, color) => {
    const m = new T.MeshStandardMaterial({ map, color, roughness: .88, alphaTest: .5, side: T.DoubleSide, shadowSide: T.DoubleSide, alphaToCoverage: true });
    m.onBeforeCompile = shader => {
      shader.uniforms.uGardenTime = uniforms.time; shader.uniforms.uGardenWind = uniforms.wind; shader.uniforms.uGardenDay = uniforms.day;
      shader.vertexShader = 'uniform float uGardenTime; uniform float uGardenWind;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        vec3 treeAnchor=vec3(0.);
        #ifdef USE_INSTANCING
          treeAnchor=instanceMatrix[3].xyz;
        #endif
        float breeze=sin(uGardenTime*1.15+treeAnchor.x*.38+treeAnchor.z*.27);
        transformed.x+=breeze*.055*uGardenWind*(position.y+.6);
        transformed.z+=sin(uGardenTime*1.7+treeAnchor.z)*.025*uGardenWind;`);
      shader.fragmentShader = 'uniform float uGardenDay;\n' + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', 'outgoingLight+=diffuseColor.rgb*.045*uGardenDay;\n#include <opaque_fragment>');
    };
    m.customProgramCacheKey = () => 'garden-foliage-v1'; return m;
  };
  const leaves = leafMaterial(leafMap, '#7f9850'), bambooLeaves = leafMaterial(bambooMap, '#879e54'), pineLeaves = leafMaterial(pineMap, '#617545');
  const mapleLeaves = leafMaterial(leafMap, '#b0773c');
  const bamboo = new T.MeshStandardMaterial({ color: '#78814e', roughness: .75 });
  const lotus = new T.MeshStandardMaterial({ color: '#748b45', roughness: .68, side: T.DoubleSide });
  const petal = new T.MeshStandardMaterial({ color: '#e8b4b9', roughness: .66, side: T.DoubleSide });
  textures.push(woodMap, tileMap, leafMap, bambooMap, pineMap);
  return { stone, rock, plaster, ground, bark, wood, darkWood, roof, metal, moss, paleStone, paper, glass, leaves, bambooLeaves, pineLeaves, mapleLeaves, bamboo, lotus, petal, failures, textures };
}

function makeLeafTexture(kind, seed) {
  return canvasTexture((ctx, s) => {
    const r = seeded(seed);
    ctx.clearRect(0, 0, s, s);
    const narrow = kind !== 'broad';
    for (let branch = 0; branch < 24; branch++) {
      const angle = r() * Math.PI * 2, rad = Math.sqrt(r()) * s * .33;
      const cx = s / 2 + Math.cos(angle) * rad, cy = s / 2 + Math.sin(angle) * rad;
      const reach = 40 + r() * 55;
      ctx.strokeStyle = 'rgba(100,109,76,.8)'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(s / 2, s / 2); ctx.quadraticCurveTo(cx, s / 2, cx, cy); ctx.stroke();
      const count = kind === 'pine' ? 32 : narrow ? 13 : 10;
      for (let j = 0; j < count; j++) {
        const a = angle + (j % 2 ? 1 : -1) * (.4 + r() * 1.3), len = (narrow ? 30 : 22) + r() * (narrow ? 40 : 26);
        const x = cx + (r() - .5) * reach, y = cy + (r() - .5) * reach;
        ctx.save(); ctx.translate(x, y); ctx.rotate(a);
        const bright = 145 + r() * 95; const gradient = ctx.createLinearGradient(0, 0, len, 0);
        gradient.addColorStop(0, `rgb(${bright * .65},${bright * .72},${bright * .57})`); gradient.addColorStop(.55, `rgb(${bright},${bright},${bright * .88})`); gradient.addColorStop(1, `rgb(${bright * .85},${bright * .91},${bright * .76})`);
        ctx.fillStyle = gradient; const w = kind === 'pine' ? 2 : narrow ? 6 : 13;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.bezierCurveTo(len * .35, -w, len * .8, -w * .8, len, 0); ctx.bezierCurveTo(len * .8, w, len * .35, w, 0, 0); ctx.fill();
        if (!narrow) { ctx.strokeStyle = 'rgba(240,242,213,.22)'; ctx.lineWidth = .7; ctx.beginPath(); ctx.moveTo(2, 0); ctx.lineTo(len - 3, 0); ctx.stroke(); }
        ctx.restore();
      }
    }
  });
}

export function signTexture(text, vertical = false) {
  const c = document.createElement('canvas'); c.width = vertical ? 128 : 512; c.height = vertical ? 512 : 128; const ctx = c.getContext('2d');
  ctx.fillStyle = '#273529'; ctx.fillRect(0, 0, c.width, c.height); ctx.strokeStyle = '#a69769'; ctx.lineWidth = 4; ctx.strokeRect(8, 8, c.width - 16, c.height - 16);
  ctx.fillStyle = '#d2c28e'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = `${vertical ? 72 : 78}px "KaiTi","STKaiti","Noto Serif SC",serif`;
  if (vertical) [...text].forEach((v, i) => ctx.fillText(v, 64, 60 + i * 98)); else ctx.fillText(text, 256, 67);
  const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; return t;
}
