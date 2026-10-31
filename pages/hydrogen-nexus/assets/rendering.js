import * as THREE from './vendor/three/build/three.module.min.js';
import { EffectComposer } from './vendor/three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from './vendor/three/examples/jsm/postprocessing/RenderPass.js';
import { SSAOPass } from './vendor/three/examples/jsm/postprocessing/SSAOPass.js';
import { UnrealBloomPass } from './vendor/three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from './vendor/three/examples/jsm/postprocessing/OutputPass.js';
import { FXAAPass } from './vendor/three/examples/jsm/postprocessing/FXAAPass.js';

export function createRendering(renderer,scene,camera){
  const target=new THREE.WebGLRenderTarget(1,1,{type:THREE.HalfFloatType,samples:4});
  const composer=new EffectComposer(renderer,target);
  const beauty=new RenderPass(scene,camera);
  const ao=new SSAOPass(scene,camera,1,1,24);ao.kernelRadius=.85;ao.minDistance=.001;ao.maxDistance=.035;
  const bloom=new UnrealBloomPass(new THREE.Vector2(1,1),.18,.2,1.7);
  const output=new OutputPass();const aa=new FXAAPass();aa.enabled=false;
  for(const pass of [beauty,ao,bloom,output,aa])composer.addPass(pass);
  let width=1,height=1,quality='high';
  function resize(w,h){
    width=w;height=h;
    const pixelRatio=Math.min(window.devicePixelRatio*(quality==='high'?1.25:1),quality==='high'?2:1.35);
    renderer.setPixelRatio(pixelRatio);renderer.setSize(width,height,false);composer.setPixelRatio(pixelRatio);composer.setSize(width,height);
    // AO is deliberately rendered below beauty resolution; edge-aware shading stays inexpensive.
    ao.setSize(Math.ceil(width*pixelRatio*.65),Math.ceil(height*pixelRatio*.65));
  }
  return {resize,setQuality(value){quality=value;ao.enabled=value==='high';aa.enabled=value!=='high';bloom.strength=value==='high'?.18:.15;resize(width,height);},render(delta){ao.ssaoMaterial.uniforms.cameraProjectionMatrix.value.copy(camera.projectionMatrix);ao.ssaoMaterial.uniforms.cameraInverseProjectionMatrix.value.copy(camera.projectionMatrixInverse);composer.render(delta);},dispose(){for(const pass of composer.passes)pass.dispose();ao.ssaoMaterial.dispose();ao.noiseTexture.dispose();composer.dispose();}};
}
