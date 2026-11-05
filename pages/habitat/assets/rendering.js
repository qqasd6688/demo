import * as T from './vendor/three/build/three.module.min.js';
import { EffectComposer } from './vendor/three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from './vendor/three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from './vendor/three/examples/jsm/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from './vendor/three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from './vendor/three/examples/jsm/postprocessing/OutputPass.js';

// Keep translucent glazing, light pools and the backdrop out of the normal prepass.
// Otherwise a transparent pane would incorrectly become a solid ambient occluder.
class InteriorAO extends GTAOPass {
  _overrideVisibility() {
    super._overrideVisibility();
    this.scene.traverse(object => {
      if (!object.isMesh || !object.visible) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      if (object.userData.excludeAO || materials.some(m => m.transparent || m.isShadowMaterial)) { object.visible = false; this._visibilityCache.push(object); }
    });
  }
}

export function createRendering(renderer, scene, camera, layout) {
  const target = new T.WebGLRenderTarget(1, 1, { type: T.HalfFloatType, samples: Math.min(4, renderer.capabilities.maxSamples) });
  const composer = new EffectComposer(renderer, target);
  const base = new RenderPass(scene, camera);
  const ao = new InteriorAO(scene, camera, 1, 1);
  ao.blendIntensity = .78;
  ao.updateGtaoMaterial({ radius: .65, distanceExponent: 1.4, thickness: .7, distanceFallOff: 1, scale: 1, samples: 16, screenSpaceRadius: false });
  ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 4, rings: 2, samples: 16 });
  ao.setSceneClipBox(new T.Box3(new T.Vector3(-layout.width/2-.3, -.4, -layout.depth/2-.3), new T.Vector3(layout.width/2+.3, layout.height+.5, layout.depth/2+.3)));
  const bloom = new UnrealBloomPass(new T.Vector2(1, 1), .09, .4, 1.5);
  const output = new OutputPass();
  composer.addPass(base); composer.addPass(ao); composer.addPass(bloom); composer.addPass(output);
  let quality = 'fine';
  return {
    render(dt) { composer.render(dt); },
    resize(w, h) { composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(w, h); },
    setQuality(value) { quality = value; ao.enabled = bloom.enabled = quality === 'fine'; },
    dispose() { for (const pass of [base, ao, bloom, output]) pass.dispose(); composer.dispose(); },
  };
}
