import * as THREE from './vendor/three/build/three.module.min.js';
import { Pass, FullScreenQuad } from './vendor/three/examples/jsm/postprocessing/Pass.js';

const vertexShader = 'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}';
const reconstruct = `
  uniform sampler2D tDepth;
  uniform mat4 inverseProjection;
  vec3 pointAt(vec2 uv,float d){vec4 p=inverseProjection*vec4(uv*2.-1.,d*2.-1.,1.);return p.xyz/p.w;}
`;

// Filter only the half-resolution AO; scene color and material detail stay sharp.
export function createOcclusion(sceneTarget, camera) {
  return new OcclusionPass(sceneTarget, camera);
}

class OcclusionPass extends Pass {
  constructor(sceneTarget, camera) {
    super();
    this.camera = camera;
    const options = { depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter };
    this.targets = [new THREE.WebGLRenderTarget(1, 1, options), new THREE.WebGLRenderTarget(1, 1, options)];
    const depth = { value: sceneTarget.depthTexture };
    const inverse = { value: camera.projectionMatrixInverse };
    this.raw = new THREE.ShaderMaterial({ depthTest: false, depthWrite: false, vertexShader,
      uniforms: { tDepth: depth, inverseProjection: inverse, resolution: { value: new THREE.Vector2(1, 1) }, projectionScale: { value: 1 } },
      fragmentShader: `varying vec2 vUv;${reconstruct}
        uniform vec2 resolution;uniform float projectionScale;
        void main(){
          float depth=texture2D(tDepth,vUv).x;
          if(depth>.9999){gl_FragColor=vec4(1.);return;}
          vec3 p=pointAt(vUv,depth);vec2 texel=1./resolution;
          vec2 right=vUv+vec2(texel.x,0.),left=vUv-vec2(texel.x,0.);
          vec2 up=vUv+vec2(0.,texel.y),down=vUv-vec2(0.,texel.y);
          vec3 dr=pointAt(right,texture2D(tDepth,right).x)-p;
          vec3 dl=p-pointAt(left,texture2D(tDepth,left).x);
          vec3 du=pointAt(up,texture2D(tDepth,up).x)-p;
          vec3 dd=p-pointAt(down,texture2D(tDepth,down).x);
          vec3 n=cross(abs(dr.z)<abs(dl.z)?dr:dl,abs(du.z)<abs(dd.z)?du:dd);
          if(length(n)<.000001){gl_FragColor=vec4(1.);return;}
          n=normalize(n);if(n.z<0.)n=-n;
          float ao=0.;float radius=.42*projectionScale*resolution.y*.5;
          for(int i=0;i<24;i++){
            float r=sqrt((float(i)+.5)/24.)*radius;
            float a=float(i)*2.399963;
            vec2 uv=vUv+vec2(cos(a),sin(a))*r/resolution;
            float d=texture2D(tDepth,uv).x;vec3 diff=pointAt(uv,d)-p;float len=length(diff);
            if(d<.9999&&len>.012)ao+=max(0.,dot(n,diff/len)-.12)*max(0.,1.-len/.65);
          }
          float shade=clamp(1.-ao*(1.7/24.),.68,1.);gl_FragColor=vec4(vec3(shade),1.);
        }` });
    this.blur = new THREE.ShaderMaterial({ depthTest: false, depthWrite: false, vertexShader,
      uniforms: { tDepth: depth, inverseProjection: inverse, tAO: { value: null }, stepSize: { value: new THREE.Vector2() } },
      fragmentShader: `varying vec2 vUv;${reconstruct}
        uniform sampler2D tAO;uniform vec2 stepSize;
        void main(){
          float depth=texture2D(tDepth,vUv).x;
          if(depth>.9999){gl_FragColor=vec4(1.);return;}
          float z=pointAt(vUv,depth).z,total=0.,sum=0.;
          for(int i=-3;i<=3;i++){
            vec2 uv=vUv+stepSize*float(i);float d=texture2D(tDepth,uv).x;
            float weight=exp(-float(i*i)*.24)*exp(-abs(pointAt(uv,d).z-z)*45.);
            total+=texture2D(tAO,uv).r*weight;sum+=weight;
          }
          gl_FragColor=vec4(vec3(total/max(sum,.0001)),1.);
        }` });
    this.combine = new THREE.ShaderMaterial({ depthTest: false, depthWrite: false, vertexShader,
      uniforms: { tDiffuse: { value: null }, tAO: { value: this.targets[0].texture } },
      fragmentShader: 'varying vec2 vUv;uniform sampler2D tDiffuse;uniform sampler2D tAO;void main(){vec4 c=texture2D(tDiffuse,vUv);gl_FragColor=vec4(c.rgb*texture2D(tAO,vUv).r,c.a);}' });
    this.quad = new FullScreenQuad();
  }

  setSize(width, height) {
    this.width = Math.max(1, Math.ceil(width / 2));
    this.height = Math.max(1, Math.ceil(height / 2));
    this.targets.forEach(target => target.setSize(this.width, this.height));
    this.raw.uniforms.resolution.value.set(width, height);
  }

  render(renderer, writeBuffer, readBuffer) {
    this.raw.uniforms.projectionScale.value = this.camera.projectionMatrix.elements[5];
    this.quad.material = this.raw;
    renderer.setRenderTarget(this.targets[0]);
    this.quad.render(renderer);
    this.quad.material = this.blur;
    this.blur.uniforms.tAO.value = this.targets[0].texture;
    this.blur.uniforms.stepSize.value.set(1 / this.width, 0);
    renderer.setRenderTarget(this.targets[1]);
    this.quad.render(renderer);
    this.blur.uniforms.tAO.value = this.targets[1].texture;
    this.blur.uniforms.stepSize.value.set(0, 1 / this.height);
    renderer.setRenderTarget(this.targets[0]);
    this.quad.render(renderer);
    this.combine.uniforms.tDiffuse.value = readBuffer.texture;
    this.quad.material = this.combine;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.render(renderer);
  }

  dispose() {
    this.targets.forEach(target => target.dispose());
    this.raw.dispose();this.blur.dispose();this.combine.dispose();this.quad.dispose();
  }
}
