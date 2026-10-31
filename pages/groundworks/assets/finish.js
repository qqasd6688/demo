import * as THREE from './vendor/three/build/three.module.min.js';
import { RoomEnvironment } from './vendor/three/examples/jsm/environments/RoomEnvironment.js';

// Locally painted physical surfaces. Fine bump and roughness survive close inspection.
export function finishMaterials({ renderer, scene, M, textures, random }) {
  function surface(kind, size=256) {
    const canvas=document.createElement('canvas');canvas.width=canvas.height=size;
    const ctx=canvas.getContext('2d'),data=ctx.createImageData(size,size);
    for(let y=0;y<size;y++)for(let x=0;x<size;x++){
      const wave=Math.sin(x*.1+Math.sin(y*.08)*3);
      const grain=kind==='soil'?28:kind==='concrete'?15:kind==='rubber'?9:5;
      const n=210+(random()-.5)*grain+(kind==='concrete'?Math.sin(y*.42)*3:0)+(kind==='soil'?wave*5:0);
      const i=(y*size+x)*4;data.data[i]=data.data[i+1]=data.data[i+2]=n;data.data[i+3]=255;
    }
    ctx.putImageData(data,0,0);
    if(kind==='concrete'){
      for(let i=0;i<170;i++){ctx.fillStyle=`rgba(35,32,25,${.08+random()*.13})`;ctx.beginPath();ctx.arc(random()*size,random()*size,.3+random()*1.3,0,Math.PI*2);ctx.fill();}
      ctx.strokeStyle='#776f6220';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(0,127);ctx.lineTo(size,127);ctx.stroke();
    }
    if(kind==='paint')for(let i=0;i<35;i++){ctx.fillStyle='#78706750';ctx.fillRect(random()*size,random()*size,1+random()*4,.5);}
    const map=new THREE.CanvasTexture(canvas);map.wrapS=map.wrapT=THREE.RepeatWrapping;
    map.anisotropy=Math.min(renderer.capabilities.getMaxAnisotropy(),8);textures.add(map);return map;
  }
  const concrete=surface('concrete'),soil=surface('soil'),paint=surface('paint'),rubber=surface('rubber');
  for(const m of[M.concrete,M.concreteLight]){m.map=concrete;m.bumpMap=concrete;m.bumpScale=.045;m.roughness=.88;m.needsUpdate=true;}
  for(const m of[M.sand,M.soil,M.soil2,M.darkSoil]){m.map=soil;m.bumpMap=soil;m.bumpScale=.055;m.roughness=.98;m.needsUpdate=true;}
  for(const m of[M.yellow,M.gold,M.red,M.navy,M.white]){m.roughness=.42;m.metalness=.22;m.bumpMap=paint;m.bumpScale=.012;m.needsUpdate=true;}
  M.steel.roughness=.32;M.steel.metalness=.73;M.dark.roughness=.6;M.dark.metalness=.35;
  M.glass.color.set('#5f8790');M.glass.roughness=.12;M.glass.metalness=.3;M.glass.transparent=true;M.glass.opacity=.7;M.glass.depthWrite=false;
  M.tire.bumpMap=rubber;M.tire.bumpScale=.02;M.tire.roughness=.94;M.tire.needsUpdate=true;
  const room=new RoomEnvironment(),generator=new THREE.PMREMGenerator(renderer);
  const environment=generator.fromScene(room,.035);scene.environment=environment.texture;scene.environmentIntensity=.32;
  room.dispose();generator.dispose();
  return { environment, soil, concrete };
}

// Three passes: HDR scene, half-resolution depth AO, then edge-aware resolve / soft glow.
// No fetched HDR panorama or external post-processing assets are required.
export function createFinish(renderer, scene, camera) {
  const target=new THREE.WebGLRenderTarget(1,1,{type:THREE.HalfFloatType,samples:4});
  target.depthTexture=new THREE.DepthTexture(1,1,THREE.UnsignedIntType);
  const aoTarget=new THREE.WebGLRenderTarget(1,1,{depthBuffer:false});
  const quadScene=new THREE.Scene(),quadCamera=new THREE.OrthographicCamera(-1,1,1,-1,0,1);
  const geometry=new THREE.PlaneGeometry(2,2);
  const quad=new THREE.Mesh(geometry);quad.frustumCulled=false;quadScene.add(quad);
  const vertex='varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.0,1.0);}';
  const ao=new THREE.ShaderMaterial({depthTest:false,depthWrite:false,uniforms:{
    tDepth:{value:target.depthTexture},resolution:{value:new THREE.Vector2()},invProjection:{value:camera.projectionMatrixInverse},projection:{value:camera.projectionMatrix}
  },vertexShader:vertex,fragmentShader:`
    varying vec2 vUv;
    uniform sampler2D tDepth; uniform vec2 resolution; uniform mat4 invProjection; uniform mat4 projection;
    vec3 positionAt(vec2 uv){float d=textureLod(tDepth,uv,0.).r;vec4 p=invProjection*vec4(uv*2.-1.,d*2.-1.,1.);return p.xyz/p.w;}
    void main(){
      vec3 p=positionAt(vUv); vec3 n=normalize(cross(dFdx(p),dFdy(p)));if(dot(n,-p)<0.)n=-n;
      if(textureLod(tDepth,vUv,0.).r>.99998){gl_FragColor=vec4(1.);return;}
      float radius=1.25; vec2 pixelRadius=vec2(projection[0][0],projection[1][1])*radius/max(-p.z,.1)*.5;
      float occ=0.;
      for(int i=0;i<16;i++){
        float f=(float(i)+.5)/16.;float a=float(i)*2.399963;
        vec2 uv=vUv+vec2(cos(a),sin(a))*pixelRadius*sqrt(f);
        vec3 delta=positionAt(clamp(uv,vec2(.001),vec2(.999)))-p;float dist=length(delta);
        float angle=max(dot(n,delta/max(dist,.001))-.055,0.);
        occ+=angle*(1.-smoothstep(.08,radius*1.5,dist));
      }
      float visibility=clamp(1.-occ*.235,.24,1.);gl_FragColor=vec4(vec3(visibility),1.);
    }`});
  const resolve=new THREE.ShaderMaterial({depthTest:false,depthWrite:false,toneMapped:true,uniforms:{
    tColor:{value:target.texture},tAO:{value:aoTarget.texture},resolution:{value:new THREE.Vector2()},glow:{value:.12},invProjection:{value:camera.projectionMatrixInverse},tDepth:{value:target.depthTexture},background:{value:scene.background}
  },vertexShader:vertex,fragmentShader:`
    varying vec2 vUv;uniform sampler2D tColor;uniform sampler2D tAO;uniform sampler2D tDepth;uniform vec2 resolution;uniform float glow;uniform mat4 invProjection;uniform vec3 background;
    float viewDepth(vec2 uv){float d=textureLod(tDepth,uv,0.).r;vec4 p=invProjection*vec4(uv*2.-1.,d*2.-1.,1.);return -p.z/p.w;}
    void main(){
      vec2 px=1./resolution;vec3 c=texture2D(tColor,vUv).rgb;float ao=texture2D(tAO,vUv).r*2.;float weight=2.;float depth=viewDepth(vUv);
      vec3 bloom=vec3(0.);
      for(int i=0;i<8;i++){
        float a=float(i)*.785398;vec2 dir=vec2(cos(a),sin(a));vec2 q=vUv+dir*px*2.;
        float w=exp(-abs(viewDepth(q)-depth)*5.);ao+=textureLod(tAO,q,0.).r*w;weight+=w;
        vec3 light=textureLod(tColor,vUv+dir*px*6.,0.).rgb;bloom+=max(light-vec3(1.6),vec3(0.));
      }
      c*=mix(1.,ao/weight,.9);c+=bloom*glow/8.;
      gl_FragColor=vec4(c,1.);
      #include <tonemapping_fragment>
      // Preserve the paper-colored backdrop without erasing transparent rain or glow.
      if(textureLod(tDepth,vUv,0.).r>.99998)gl_FragColor.rgb=max(vec3(0.),gl_FragColor.rgb+background-toneMapping(background));
      #include <colorspace_fragment>
    }`});
  const drawingSize=new THREE.Vector2();
  return {
    resize(){renderer.getDrawingBufferSize(drawingSize);target.setSize(drawingSize.x,drawingSize.y);aoTarget.setSize(Math.ceil(drawingSize.x/2),Math.ceil(drawingSize.y/2));ao.uniforms.resolution.value.copy(drawingSize);resolve.uniforms.resolution.value.copy(drawingSize);},
    render(){
      renderer.info.reset();renderer.info.autoReset=false;
      renderer.setRenderTarget(target);renderer.render(scene,camera);
      quad.material=ao;renderer.setRenderTarget(aoTarget);renderer.render(quadScene,quadCamera);
      quad.material=resolve;renderer.setRenderTarget(null);renderer.render(quadScene,quadCamera);
    },
    dispose(){target.depthTexture.dispose();target.dispose();aoTarget.dispose();geometry.dispose();ao.dispose();resolve.dispose();}
  };
}
