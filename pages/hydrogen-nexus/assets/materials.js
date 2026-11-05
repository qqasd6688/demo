import * as THREE from './vendor/three/build/three.module.min.js';

// Procedural, locally generated material maps. No network or bitmap dependencies.
export function createMaterials(renderer) {
  const textures=[];
  function texture(size,draw,repeat=[1,1],color=false){
    const canvas=document.createElement('canvas');canvas.width=canvas.height=size;
    draw(canvas.getContext('2d'),size);
    const map=new THREE.CanvasTexture(canvas);map.wrapS=map.wrapT=THREE.RepeatWrapping;map.repeat.set(...repeat);map.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
    if(color)map.colorSpace=THREE.SRGBColorSpace;textures.push(map);return map;
  }
  let seed=103;
  const random=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};
  const brushed=texture(512,(ctx,n)=>{ctx.fillStyle='#909090';ctx.fillRect(0,0,n,n);for(let y=0;y<n;y++){const v=110+Math.floor(random()*70);ctx.strokeStyle=`rgb(${v},${v},${v})`;ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(n,y);ctx.stroke();}},[1,2]);
  const grain=texture(256,(ctx,n)=>{const image=ctx.createImageData(n,n);for(let i=0;i<image.data.length;i+=4){const v=185+random()*45;image.data.set([v,v,v,255],i);}ctx.putImageData(image,0,0);},[3,3]);
  const paving=texture(512,(ctx,n)=>{ctx.fillStyle='#334452';ctx.fillRect(0,0,n,n);for(let i=0;i<20000;i++){const v=40+random()*38;ctx.fillStyle=`rgba(${v},${v+9},${v+18},.2)`;ctx.fillRect(random()*n,random()*n,1,1);}ctx.strokeStyle='#1f303e';ctx.lineWidth=4;ctx.strokeRect(2,2,n-4,n-4);ctx.strokeStyle='#456071';ctx.lineWidth=1;ctx.strokeRect(6,6,n-12,n-12);},[14,10],true);
  const warning=texture(128,(ctx,n)=>{ctx.fillStyle='#17212b';ctx.fillRect(0,0,n,n);ctx.strokeStyle='#c1a24f';ctx.lineWidth=19;for(let i=-n;i<n*2;i+=44){ctx.beginPath();ctx.moveTo(i,0);ctx.lineTo(i+n,n);ctx.stroke();}},[6,1],true);
  const solarCells=texture(512,(ctx,n)=>{ctx.fillStyle='#12365d';ctx.fillRect(0,0,n,n);for(let x=0;x<4;x++)for(let y=0;y<8;y++){ctx.fillStyle=(x+y)%2?'#1b4874':'#17416e';ctx.fillRect(x*128+4,y*64+3,120,58);ctx.strokeStyle='#81b4c3';ctx.lineWidth=.8;for(let j=0;j<5;j++){ctx.beginPath();ctx.moveTo(x*128+8,y*64+10+j*9);ctx.lineTo(x*128+121,y*64+10+j*9);ctx.stroke();}}},[1,1],true);
  const metal=new THREE.MeshPhysicalMaterial({color:'#7a99ac',metalness:.94,roughness:.31,roughnessMap:brushed,bumpMap:brushed,bumpScale:.007,clearcoat:.2,clearcoatRoughness:.25});
  const pale=new THREE.MeshPhysicalMaterial({color:'#9dafb9',metalness:.55,roughness:.32,roughnessMap:grain,clearcoat:.45,clearcoatRoughness:.25});
  const dark=new THREE.MeshPhysicalMaterial({color:'#183341',metalness:.7,roughness:.38,roughnessMap:grain,clearcoat:.3});
  const trim=new THREE.MeshStandardMaterial({color:'#4a6576',metalness:.88,roughness:.33,roughnessMap:brushed});
  const black=new THREE.MeshStandardMaterial({color:'#09141c',metalness:.15,roughness:.8});
  const copper=new THREE.MeshStandardMaterial({color:'#ac7756',metalness:.85,roughness:.31,roughnessMap:brushed});
  const rubber=new THREE.MeshStandardMaterial({color:'#131e26',roughness:.95});
  const safety=new THREE.MeshStandardMaterial({map:warning,metalness:.15,roughness:.6});
  const glass=new THREE.MeshPhysicalMaterial({color:'#24677f',metalness:.45,roughness:.12,clearcoat:1,clearcoatRoughness:.08,envMapIntensity:1.5});
  const solar=new THREE.MeshPhysicalMaterial({map:solarCells,color:'#8cabd4',metalness:.25,roughness:.28,clearcoat:.8,clearcoatRoughness:.12,envMapIntensity:.55});
  const ground=new THREE.MeshStandardMaterial({map:paving,color:'#4c667d',metalness:.18,roughness:.76});
  const emissive=(hex,intensity=2)=>new THREE.MeshStandardMaterial({color:hex,emissive:hex,emissiveIntensity:intensity,metalness:.25,roughness:.3});
  return {metal,pale,dark,trim,black,copper,rubber,safety,glass,solar,ground,emissive,textures,dispose(){textures.forEach(t=>t.dispose());}};
}
