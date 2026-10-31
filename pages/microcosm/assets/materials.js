import * as THREE from './vendor/three/build/three.module.min.js';

// All photographed PBR maps are local. No network requests are made at runtime.
export async function loadSurfaces(renderer) {
  const loader = new THREE.TextureLoader();
  const textures = [];
  async function load(name, channel, color = false) {
    const texture = await loader.loadAsync(new URL(`./textures/${name}_${channel}.jpg`, import.meta.url).href);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    texture.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    textures.push(texture);
    return texture;
  }
  const [rockColor, rockNormal, rockARM, barkColor, barkNormal, barkARM] = await Promise.all([
    load('rocky_terrain', 'Diffuse', true), load('rocky_terrain', 'nor_gl'), load('rocky_terrain', 'arm'),
    load('bark_brown_02', 'Diffuse', true), load('bark_brown_02', 'nor_gl'), load('bark_brown_02', 'arm'),
  ]);
  const rock = new THREE.MeshStandardMaterial({ map: rockColor, normalMap: rockNormal, normalScale: new THREE.Vector2(.7,.7), roughnessMap: rockARM, aoMap: rockARM, aoMapIntensity: .65, roughness: .92, color: '#b8beb6' });
  const bark = new THREE.MeshStandardMaterial({ map: barkColor, normalMap: barkNormal, normalScale: new THREE.Vector2(.7,.7), roughnessMap: barkARM, aoMap: barkARM, aoMapIntensity: .7, roughness: .93, color: '#beb5a1' });
  const terrain = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .9 });
  terrain.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, { rockColor:{value:rockColor}, rockNormal:{value:rockNormal}, rockARM:{value:rockARM} });
    shader.vertexShader = 'attribute float snow; varying vec3 vTerrainPoint; varying vec3 vTerrainNormal; varying float vSnow;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvTerrainPoint=position;vTerrainNormal=normal;vSnow=snow;');
    shader.fragmentShader = `varying vec3 vTerrainPoint; varying vec3 vTerrainNormal; varying float vSnow;
      uniform sampler2D rockColor; uniform sampler2D rockNormal; uniform sampler2D rockARM;
      vec3 triWeights(){vec3 w=pow(abs(normalize(vTerrainNormal)),vec3(4.));return w/(w.x+w.y+w.z);}
      vec4 triSample(sampler2D tex){vec3 p=vTerrainPoint*.85;vec3 w=triWeights();return texture2D(tex,p.zy)*w.x+texture2D(tex,p.xz)*w.y+texture2D(tex,p.xy)*w.z;}
      ` + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      vec3 rockSample=triSample(rockColor).rgb;
      float mineral=dot(rockSample,vec3(.299,.587,.114));
      diffuseColor.rgb*=mix(vec3(.43)+mix(rockSample,vec3(mineral),.65)*1.35,vec3(.98),vSnow);`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
      vec3 p=vTerrainPoint*.85, w=triWeights(), ns=sign(vTerrainNormal);
      vec3 nx=texture2D(rockNormal,p.zy).xyz*2.-1.;
      vec3 ny=texture2D(rockNormal,p.xz).xyz*2.-1.;
      vec3 nz=texture2D(rockNormal,p.xy).xyz*2.-1.;
      vec3 detail=normalize(vec3(nx.z*ns.x,nx.y,nx.x)*w.x+vec3(ny.x,ny.z*ns.y,ny.y)*w.y+vec3(nz.x,nz.y,nz.z*ns.z)*w.z);
      normal=normalize(mix(normal,mat3(viewMatrix)*detail,.55*(1.-vSnow*.85)));`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
      roughnessFactor=mix(.67+triSample(rockARM).g*.28,.67,vSnow);`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <aomap_fragment>', `#include <aomap_fragment>
      reflectedLight.indirectDiffuse*=mix(.45+triSample(rockARM).r*.55,1.,vSnow);`);
  };
  const cliff = terrain.clone();
  cliff.onBeforeCompile = terrain.onBeforeCompile;
  cliff.side = THREE.DoubleSide;
  return { rock, bark, terrain, cliff, dispose(){ textures.forEach(texture=>texture.dispose()); } };
}

export function createWaterNormals() {
  const size=256, data=new Uint8Array(size*size*4);
  for(let y=0;y<size;y++) for(let x=0;x<size;x++) {
    const u=x/size*Math.PI*2,v=y/size*Math.PI*2;
    const dx=Math.cos(u*5+Math.sin(v*3))*.24+Math.cos(u*13+v*9)*.1;
    const dy=Math.cos(v*7+Math.sin(u*4))*.2+Math.cos(u*9-v*11)*.11;
    const n=new THREE.Vector3(-dx,-dy,1).normalize(),i=(y*size+x)*4;
    data[i]=(n.x*.5+.5)*255;data[i+1]=(n.y*.5+.5)*255;data[i+2]=(n.z*.5+.5)*255;data[i+3]=255;
  }
  const texture=new THREE.DataTexture(data,size,size);texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.magFilter=THREE.LinearFilter;texture.minFilter=THREE.LinearMipmapLinearFilter;texture.generateMipmaps=true;texture.needsUpdate=true;
  return texture;
}
