import * as THREE from './vendor/three/build/three.module.min.js';
import { EffectComposer } from './vendor/three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from './vendor/three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from './vendor/three/examples/jsm/postprocessing/GTAOPass.js';
import { OutputPass } from './vendor/three/examples/jsm/postprocessing/OutputPass.js';
import { FullScreenQuad } from './vendor/three/examples/jsm/postprocessing/Pass.js';

export function createStudioEnvironment(renderer) {
  const studio = new THREE.Scene(); studio.background = new THREE.Color('#60696a');
  const resources=[];
  function softbox(position,size,intensity,color='#ffffff') {
    const geometry=new THREE.PlaneGeometry(...size);
    const material=new THREE.MeshBasicMaterial({color:new THREE.Color(color).multiplyScalar(intensity),side:THREE.DoubleSide,toneMapped:false});
    const card=new THREE.Mesh(geometry,material);card.position.set(...position);card.lookAt(0,1.6,0);studio.add(card);resources.push(geometry,material);
  }
  // Large photographic cards produce long controlled highlights on curved metal.
  softbox([-5,4,3],[4,7],5.2,'#fff3df');
  softbox([5,3,1],[1.7,7],4.1,'#e3efff');
  softbox([0,8,-1],[6,4],3.4);
  softbox([-2,4,-6],[5,2],4.8,'#e9f1ff');
  softbox([0,2.5,7],[.6,5],2.2);
  softbox([4,1,5],[2.6,8],.025,'#21302c');
  const pmrem=new THREE.PMREMGenerator(renderer);
  const target=pmrem.fromScene(studio,.025,.1,40);
  for(const resource of resources)resource.dispose();pmrem.dispose();
  return target;
}

class ProductAOPass extends GTAOPass {
  _overrideVisibility() {
    this.scene.traverse(object=>{
      const m=object.material;
      if(object.visible&&(object.isLine||object.isPoints||object.userData.skipAO||(m&&(m.opacity<.99||m.transmission>0||m.depthWrite===false)))) {
        object.visible=false;this._visibilityCache.push(object);
      }
    });
  }
}

export function createRenderPipeline(renderer,scene,camera) {
  const target=new THREE.WebGLRenderTarget(1,1,{type:THREE.HalfFloatType,samples:Math.min(4,renderer.capabilities.maxSamples)});
  const composer=new EffectComposer(renderer,target);
  const beauty=new RenderPass(scene,camera);
  const ao=new ProductAOPass(scene,camera,512,512);
  ao.normalMaterial.side=THREE.DoubleSide;
  ao.blendIntensity=.72;
  ao.updateGtaoMaterial({radius:.22,thickness:.8,distanceExponent:1.6,distanceFallOff:1,scale:1,samples:16,screenSpaceRadius:false});
  ao.updatePdMaterial({radius:5,rings:2,samples:12,lumaPhi:8,depthPhi:3,normalPhi:4});
  const output=new OutputPass();
  // Tone-map straight RGB, then restore premultiplied alpha for the transparent canvas.
  // Applying nonlinear tone mapping directly to premultiplied pixels creates bright grids/halos.
  output.material.fragmentShader=output.material.fragmentShader
    .replace('// tone mapping','gl_FragColor.rgb /= max(gl_FragColor.a, 0.00001);\n\t\t\t// tone mapping')
    .replace(/\}\s*$/, 'gl_FragColor.rgb *= gl_FragColor.a;\n\t\t}');
  composer.addPass(beauty);composer.addPass(ao);composer.addPass(output);
  return {
    setSize(width,height,pixelRatio=1) {
      composer.setPixelRatio(pixelRatio);composer.setSize(width,height);
      const scale=Math.min(pixelRatio,.9,1250/width);
      ao.setSize(Math.max(1,Math.round(width*scale)),Math.max(1,Math.round(height*scale)));
    },
    render(dt=0){composer.render(dt);},
    setAmbientOcclusion(value){ao.blendIntensity=value;},
    dispose(){ao.dispose();ao.gtaoMaterial.dispose();ao.blendMaterial.dispose();output.dispose();composer.dispose();}
  };
}

// A cached orthographic projection with separable Gaussian blur provides a soft,
// shape-aware contact shadow. It is updated only when the assembly changes.
export function createContactShadow(renderer,scene,model) {
  const size=768,extent=11,ground=-.395;
  const camera=new THREE.OrthographicCamera(-extent/2,extent/2,extent/2,-extent/2,.01,8);
  camera.position.set(0,ground-.03,0);camera.up.set(0,0,1);camera.lookAt(0,3,0);camera.layers.set(2);
  const target=new THREE.WebGLRenderTarget(size,size),buffer=target.clone();
  const material=new THREE.ShaderMaterial({
    uniforms:{ground:{value:ground}},
    vertexShader:`varying float elevation;
      uniform float ground;
      void main(){vec4 local=vec4(position,1.0);
        #ifdef USE_INSTANCING
          local=instanceMatrix*local;
        #endif
        vec4 world=modelMatrix*local;elevation=max(0.0,world.y-ground);
        gl_Position=projectionMatrix*viewMatrix*world;}`,
    fragmentShader:`varying float elevation;void main(){float density=0.38*exp(-elevation*0.9);gl_FragColor=vec4(0.12,0.17,0.13,density);}`,
    side:THREE.DoubleSide,transparent:false,blending:THREE.NoBlending
  });
  const blur=new THREE.ShaderMaterial({
    uniforms:{map:{value:null},direction:{value:new THREE.Vector2()}},
    vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.0,1.0);}',
    fragmentShader:`uniform sampler2D map;uniform vec2 direction;varying vec2 vUv;
      void main(){vec4 color=texture2D(map,vUv)*0.227027;
        color+=texture2D(map,vUv+direction*1.384615)*0.316216;
        color+=texture2D(map,vUv-direction*1.384615)*0.316216;
        color+=texture2D(map,vUv+direction*3.230769)*0.070270;
        color+=texture2D(map,vUv-direction*3.230769)*0.070270;gl_FragColor=color;}`,
    depthTest:false,depthWrite:false
  });
  const quad=new FullScreenQuad(blur);
  const plane=new THREE.Mesh(new THREE.PlaneGeometry(extent,extent),new THREE.MeshBasicMaterial({map:target.texture,transparent:true,opacity:.85,depthWrite:false,side:THREE.DoubleSide,toneMapped:false}));
  plane.rotation.x=Math.PI/2;plane.position.y=ground;plane.userData.skipAO=true;scene.add(plane);
  const savedColor=new THREE.Color();
  return {
    update(){
      const renderTarget=renderer.getRenderTarget(),clearAlpha=renderer.getClearAlpha(),override=scene.overrideMaterial;
      renderer.getClearColor(savedColor);const hidden=[];
      model.traverse(o=>{if(o.isMesh&&o.visible&&(o.material.opacity<.5||o.material.transmission>0)){hidden.push(o);o.visible=false;}});
      scene.overrideMaterial=material;renderer.setClearColor(0x000000,0);renderer.setRenderTarget(target);renderer.clear();renderer.render(scene,camera);
      scene.overrideMaterial=override;for(const o of hidden)o.visible=true;
      for(const radius of [2.4,3.1]){
        blur.uniforms.map.value=target.texture;blur.uniforms.direction.value.set(radius/size,0);renderer.setRenderTarget(buffer);renderer.clear();quad.render(renderer);
        blur.uniforms.map.value=buffer.texture;blur.uniforms.direction.value.set(0,radius/size);renderer.setRenderTarget(target);renderer.clear();quad.render(renderer);
      }
      renderer.setRenderTarget(renderTarget);renderer.setClearColor(savedColor,clearAlpha);
    },
    dispose(){target.dispose();buffer.dispose();material.dispose();blur.dispose();quad.dispose();plane.geometry.dispose();plane.material.dispose();}
  };
}
