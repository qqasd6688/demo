import * as THREE from './vendor/three/build/three.module.min.js';
import { Reflector } from './vendor/three/examples/jsm/objects/Reflector.js';
import { EffectComposer } from './vendor/three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from './vendor/three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from './vendor/three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from './vendor/three/examples/jsm/postprocessing/OutputPass.js';
import { FXAAPass } from './vendor/three/examples/jsm/postprocessing/FXAAPass.js';
import { RoomEnvironment } from './vendor/three/examples/jsm/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from './vendor/three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { createCardContent } from './card-content.js';
const skyUrl = new URL('./images/starfield.webp', import.meta.url).href;
import {
  CARD_HEIGHT,
  CARD_WIDTH,
  ENTRANCE_DURATION,
  ORBIT_SECONDS,
  ORBIT_DEPTH,
  SEAT_ANGLES,
  getCardProjection,
  getEntranceState,
  getOrbitPosition,
} from './motion.js';

const vertex = `
  varying vec2 vUv;
  varying vec3 vWorld;
  varying vec3 vNormal;
  void main() {
    vUv = uv;
    vWorld = (modelMatrix * vec4(position, 1.)).xyz;
    vNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.);
  }
`;

// 页面私有的单一场景：拥有所有 GPU 资源、投影、计时、尺寸观察与回收。
export async function createEntranceScene({
  canvas,
  host,
  cards,
  entries,
  onFailure,
  skipEntrance = false,
}) {
  const response = await fetch(
    new URL('./images/world-land.json', import.meta.url),
  );
  if (!response.ok) throw new Error(`地球轮廓加载失败：${response.status}`);
  const landData = await response.json();
  const skyImage = new Image();
  skyImage.src = skyUrl;
  const [coverImages] = await Promise.all([
    Promise.all(
      entries.map(async (entry) => {
        if (!entry.cover) return null;
        const image = new Image();
        image.src = entry.cover;
        try {
          await image.decode();
          return image;
        } catch {
          // 单个页面的封面失效时仍然保留入口与其他卡片的三维场景。
          return null;
        }
      }),
    ),
    skyImage.decode(),
    document.fonts.ready,
  ]);
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.9;
  const scene = new THREE.Scene();
  // 展品距相机均超过一米；收紧近裁面，提高掠射角下底座细节的深度精度。
  const camera = new THREE.PerspectiveCamera(39, 16 / 9, 1, 100);
  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();
  let mirror;
  let composer;
  let bloom;
  let outputPass;
  let antialiasPass;
  let environmentTarget;
  let observer;
  let frame = 0;
  let destroyed = false;
  let width = 1;
  let height = 1;
  let mobile = false;
  let elapsed = 0;
  let phase = 0;
  let previous = 0;
  let entranceSkipped = skipEntrance;
  const settledEntrance = getEntranceState(ENTRANCE_DURATION);
  let playback = {
    paused: false,
    hidden: false,
    interacting: false,
    focused: -1,
  };
  const time = { value: 0 };
  // 细轨半径 3.2、上下浮动 0.08、卫星半径 0.15；最下缘仍高于台面 0.29。
  const globeCenter = new THREE.Vector3(0, 5.05, 0);

  function mesh(geometry, material, parent = scene) {
    geometries.add(geometry);
    materials.add(material);
    const object = new THREE.Mesh(geometry, material);
    parent.add(object);
    return object;
  }

  function ring(radius, thickness, color, parent = scene) {
    return mesh(
      new THREE.TorusGeometry(radius, thickness, 8, 160),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(color).multiplyScalar(1.6),
        transparent: true,
        depthWrite: false,
        opacity: 0.85,
      }),
      parent,
    );
  }

  function platform(radius, parent, front, phaseOffset) {
    const group = new THREE.Group();
    parent.add(group);
    // 卡片底座每层只绘制一个实体；腰线、描边和光纹共用表面，消除透明薄层的深度争抢。
    for (let level = 0; level < 3; level++) {
      const r = radius * (1 - level * 0.17);
      const bottom = level * 0.095;
      const top = bottom + 0.08;
      const profile = [
        new THREE.Vector2(0, bottom),
        new THREE.Vector2(r * 0.985, bottom),
        new THREE.Vector2(r, bottom + 0.018),
        new THREE.Vector2(r, top - 0.025),
        new THREE.Vector2(r - 0.05, top),
        new THREE.Vector2(0, top),
      ];
      const disc = mesh(
        new THREE.LatheGeometry(profile, 6),
        new THREE.ShaderMaterial({
          uniforms: {
            uTime: time,
            uFront: front,
            uPhase: { value: phaseOffset },
            uRadius: { value: r },
            uBottom: { value: bottom },
            uLevel: { value: level },
          },
          vertexShader: `
            varying vec3 vLocal; varying vec3 vNormal;
            void main(){
              vLocal=position; vNormal=normal;
              gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);
            }`,
          fragmentShader: `
            uniform float uRadius; uniform float uBottom; uniform float uLevel;
            uniform float uTime; uniform float uFront; uniform float uPhase;
            varying vec3 vLocal; varying vec3 vNormal;
            // 按实际屏幕像素积分细线，并保持总亮度；远排缩小时不会忽亮忽灭。
            float etchedLine(float distance,float width){
              float pixel=max(fwidth(distance),.0001);
              float footprint=max(width,pixel);
              return exp(-pow(abs(distance)/footprint,2.))*width/footprint;
            }
            void main(){
              vec3 n=normalize(vNormal);
              float top=smoothstep(.82,.98,n.y);
              float height=clamp((vLocal.y-uBottom)/.08,0.,1.);
              // 宽幅固定金属明暗保留倒角质感，不使用随观看角度跳变的镜面亮斑。
              float light=.65+.35*max(dot(n,normalize(vec3(-.45,1.,.65))),0.);
              float waist=exp(-pow(abs(height-.43)/.24,2.));
              vec3 side=mix(vec3(.006,.018,.052),vec3(.025,.085,.18),waist)*light;
              float bevel=smoothstep(.65,.85,height)*(1.-smoothstep(.9,1.,height));
              side+=vec3(.015,.065,.16)*bevel;
              vec2 p=vLocal.xz;
              // 三层流光错开经过六边形轮廓，共用场景时钟，暂停时停在当前亮度和位置。
              float angle=atan(p.y,p.x+.00001);
              float travel=angle-uTime*.62+uPhase-uLevel*.42;
              float arc=pow(.5+.5*cos(travel),10.);
              float strength=mix(.12,1.,uFront);
              float flow=arc*strength;
              float breathe=(.5+.5*sin(uTime*1.35+uPhase))*strength;
              float hex=max(abs(p.x),max(abs(.5*p.x+.8660254*p.y),abs(-.5*p.x+.8660254*p.y)));
              float edge=(uRadius-.05)*.8660254-hex;
              float rim=etchedLine(edge-.032,.022);
              vec3 face=vec3(.008,.028,.067)*light;
              face+=mix(vec3(.035,.10,.22),vec3(.08,.28,.39),uLevel*.5)*rim;
              face+=vec3(.08,.65,1.1)*flow*rim;
              side+=vec3(.025,.23,.42)*flow*waist;
              if(uLevel>1.5){
                float radial=length(p)/(uRadius*.8);
                float pool=exp(-radial*radial*7.);
                float dial=etchedLine(radial-.72,.012)+etchedLine(radial-.88,.009)*.45;
                face+=vec3(.008,.12,.22)*pool+vec3(.015,.08,.14)*dial;
                face+=vec3(.012,.09,.16)*pool*breathe;
                face+=vec3(.045,.38,.65)*dial*flow;
              }
              gl_FragColor=vec4(mix(side,face,top),1.);
            }`,
        }),
        group,
      );
      disc.rotation.y = Math.PI / 6;
    }
    return group;
  }

  function dispose() {
    if (destroyed) return;
    destroyed = true;
    cancelAnimationFrame(frame);
    observer?.disconnect();
    canvas.removeEventListener('webglcontextlost', handleContextLost);
    mirror?.getRenderTarget().dispose();
    bloom?.dispose();
    outputPass?.dispose();
    antialiasPass?.dispose();
    composer?.dispose();
    environmentTarget?.dispose();
    geometries.forEach((geometry) => geometry.dispose());
    materials.forEach((material) => material.dispose());
    textures.forEach((texture) => texture.dispose());
    renderer.dispose();
    renderer.forceContextLoss();
  }

  function handleContextLost(event) {
    event.preventDefault();
    dispose();
    onFailure();
  }

  try {
    const skyTexture = new THREE.Texture(skyImage);
    skyTexture.colorSpace = THREE.SRGBColorSpace;
    skyTexture.needsUpdate = true;
    textures.add(skyTexture);
    scene.background = skyTexture;
    scene.backgroundIntensity = 0.09;
    // 只烘焙一次棚灯环境；反射贴图由场景统一回收，不增加逐帧渲染。
    const studio = new RoomEnvironment();
    studio.traverse((object) => {
      if (object.isLight) object.intensity *= 0.2;
      if (!object.isMesh) return;
      if (object.material.emissiveIntensity > 1) {
        object.material.emissive.set(0x94cfff);
        object.material.emissiveIntensity *= 0.18;
      } else {
        object.material.color.set(0x0a1e3d);
      }
    });
    const pmrem = new THREE.PMREMGenerator(renderer);
    try {
      environmentTarget = pmrem.fromScene(studio, 0.025);
      scene.environment = environmentTarget.texture;
    } finally {
      studio.dispose();
      pmrem.dispose();
    }
    composer = new EffectComposer(renderer);
    // 辉光需要回写颜色缓冲；使用独立抗锯齿通道，避开部分显卡的多采样回写异常。
    composer.addPass(new RenderPass(scene, camera));
    bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.48, 0.35, 0.95);
    // 光晕扩散前过滤非有限颜色，避免一个异常像素经多级模糊污染整片画面。
    bloom.highPassUniforms.smoothWidth.value = 0.25;
    bloom.materialHighPassFilter.fragmentShader = `
      uniform sampler2D tDiffuse;
      uniform float luminosityThreshold; uniform float smoothWidth;
      varying vec2 vUv;
      float finiteColor(float value){return value>=0. && value<64. ? value : 0.;}
      void main(){
        vec3 source=texture2D(tDiffuse,vUv).rgb;
        vec3 color=vec3(finiteColor(source.r),finiteColor(source.g),finiteColor(source.b));
        float light=dot(color,vec3(.2126,.7152,.0722));
        float alpha=smoothstep(luminosityThreshold,luminosityThreshold+smoothWidth,light);
        gl_FragColor=vec4(color*alpha,alpha);
      }`;
    composer.addPass(bloom);
    outputPass = new OutputPass();
    composer.addPass(outputPass);
    antialiasPass = new FXAAPass();
    composer.addPass(antialiasPass);
    scene.add(new THREE.HemisphereLight(0x94dcff, 0x030c25, 3));
    const light = new THREE.PointLight(0x19bcff, 70, 30);
    light.position.set(0, 5, 3);
    scene.add(light);
    const keyLight = new THREE.DirectionalLight(0x8acbff, 1.4);
    keyLight.position.set(-5, 9, 6);
    scene.add(keyLight);
    const edgeLight = new THREE.DirectionalLight(0x3878ff, 2);
    edgeLight.position.set(6, 3, -4);
    scene.add(edgeLight);

    // 星空只有少量亮点，近星轻闪；所有装饰均使用统一时间，暂停时无需逐个停定时器。
    const starPositions = [];
    const starSeeds = [];
    for (let i = 0; i < 1500; i++) {
      const n = (Math.sin(i * 127.1 + 3) * 43758.5453) % 1;
      const f = Math.abs(n);
      starPositions.push(
        (((i * 0.6180339) % 1) - 0.5) * 70,
        3 + f * 24,
        -12 - (i % 9) * 2,
      );
      starSeeds.push(f);
    }
    const starGeometry = new THREE.BufferGeometry();
    starGeometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(starPositions, 3),
    );
    starGeometry.setAttribute(
      'seed',
      new THREE.Float32BufferAttribute(starSeeds, 1),
    );
    const starMaterial = new THREE.ShaderMaterial({
      uniforms: { uTime: time },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: `attribute float seed; varying float vSeed; void main(){vSeed=seed; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); gl_PointSize=seed>.97?3.:1.4;}`,
      fragmentShader: `uniform float uTime; varying float vSeed; void main(){float a=1.-smoothstep(.08,.5,length(gl_PointCoord-.5)); float flicker=.6+.4*sin(uTime*(.3+vSeed)+vSeed*60.); gl_FragColor=vec4(.32,.64,1.,a*(.22+vSeed*.7)*flicker);}`,
    });
    geometries.add(starGeometry);
    materials.add(starMaterial);
    scene.add(new THREE.Points(starGeometry, starMaterial));

    // 极光置于展厅后景；两层褶皱光幕错峰扫过，共用场景时间与暂停、回收机制。
    const aurora = mesh(
      new THREE.PlaneGeometry(64, 28),
      new THREE.ShaderMaterial({
        vertexShader: vertex,
        uniforms: { uTime: time },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fragmentShader: `
          uniform float uTime; varying vec2 vUv;
          void main(){
            vec2 uv=vUv; vec3 light=vec3(0.);
            float sides=.28+.72*smoothstep(.08,.32,abs(uv.x-.5));
            float bounds=smoothstep(.03,.14,uv.x)*(1.-smoothstep(.86,.97,uv.x));
            bounds*=smoothstep(.12,.24,uv.y)*(1.-smoothstep(.7,.93,uv.y));
            for(int i=0;i<2;i++){
              float layer=float(i); float t=uTime*.24+layer*4.7;
              float x=uv.x+.018*sin(uv.x*18.+t)+.009*sin(uv.x*51.-t*.7);
              float ridge=.3+layer*.11+.065*sin(x*10.-t*.45)+.035*sin(x*23.+t*.6);
              float h=uv.y-ridge;
              float height=.19+.065*sin(x*13.+t*.4);
              float veil=smoothstep(-.016,.025,h)*exp(-max(h,0.)/height*3.);
              float folds=.3+.7*pow(.5+.5*sin(x*76.+sin(x*19.-t)*2.+h*5.),2.);
              float fibers=.65+.35*sin(x*340.+sin(x*37.+t)*3.+h*8.);
              float hem=exp(-pow(abs(h)/.011,2.))*.24;
              float phase=fract((uTime+4.+layer*8.)/20.);
              float travel=mix(-.2,1.2,phase);
              float sweep=exp(-pow(abs(uv.x-travel)/.23,2.));
              float arrival=smoothstep(0.,.1,phase)*(1.-smoothstep(.88,1.,phase));
              float strength=(.035+sweep*arrival*.72)*(1.-layer*.3);
              vec3 color=mix(vec3(.025,.42,.9),vec3(.035,.85,.7),exp(-max(h,0.)*22.));
              color=mix(color,vec3(.16,.18,.65),smoothstep(.07,.26,h)*.65);
              light+=color*(veil*folds*fibers+hem)*strength;
            }
            gl_FragColor=vec4(light*sides*bounds*.4,1.);
          }`,
      }),
    );
    aurora.position.set(0, 11, -18);
    aurora.renderOrder = -1;

    // 反射面只采样一次半分辨率场景；其上的透明网格独立计算径向脉冲。
    mirror = new Reflector(new THREE.PlaneGeometry(100, 100), {
      color: 0x163561,
      textureWidth: 1024,
      textureHeight: 512,
      clipBias: 0.003,
      multisample: 0,
      shader: {
        uniforms: THREE.UniformsUtils.clone(Reflector.ReflectorShader.uniforms),
        vertexShader: `
          uniform mat4 textureMatrix; varying vec4 vMirror; varying vec3 vWorld;
          void main(){ vMirror=textureMatrix*vec4(position,1.); vWorld=(modelMatrix*vec4(position,1.)).xyz;
            gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }
        `,
        // 有限采样的纵向柔化与距离衰减，避免镜面复制出第二个明亮球体。
        fragmentShader: `
          uniform sampler2D tDiffuse; varying vec4 vMirror; varying vec3 vWorld;
          void main(){
            vec2 uv=vMirror.xy/vMirror.w; vec3 reflected=vec3(0.);
            float blur=.0004+max(vWorld.z,0.)*.00025;
            for(int i=-1;i<=1;i++) for(int j=-1;j<=1;j++)
              reflected+=texture2D(tDiffuse,uv+vec2(float(j)*blur,float(i)*blur*2.5)).rgb/9.;
            float fade=exp(-max(vWorld.z-1.,0.)*.21);
            gl_FragColor=vec4(vec3(.001,.005,.022)+reflected*.43*fade,1.);
          }
        `,
      },
    });
    mirror.rotation.x = -Math.PI / 2;
    mirror.position.y = 0.832;
    geometries.add(mirror.geometry);
    materials.add(mirror.material);
    scene.add(mirror);
    const floor = mesh(
      new THREE.PlaneGeometry(100, 100),
      new THREE.ShaderMaterial({
        vertexShader: vertex,
        uniforms: { uTime: time },
        transparent: true,
        depthWrite: false,
        fragmentShader: `
        uniform float uTime; varying vec3 vWorld;
        void main(){
          vec2 p=vWorld.xz; float r=length(p);
          vec2 g=abs(fract(p/1.6-.5)-.5)/max(fwidth(p/1.6),vec2(.001));
          float grid=1.-min(min(g.x,g.y),1.);
          float pulse=exp(-pow(abs(r-mod(uTime*.95,16.))/.36,2.));
          vec3 color=vec3(.002,.008,.03)+vec3(.02,.17,.6)*grid*.6+vec3(.08,.5,1.)*grid*pulse*1.7;
          float fade=exp(-r*.055);
          gl_FragColor=vec4(color*fade,.42);
        }`,
      }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0.85;

    // 球体独享圆形金属基座，卡片继续使用原有六边形台座。
    const corePlatform = new THREE.Group();
    scene.add(corePlatform);
    corePlatform.position.y = 0.85;
    const coreTiers = [
      { radius: 2.18, bottom: 0, top: 0.12 },
      { radius: 2.06, bottom: 0.13, top: 0.32 },
      { radius: 1.87, bottom: 0.34, top: 0.48 },
    ];
    const corePulses = [];
    const corePulsePeriod = 5.8;
    coreTiers.forEach(({ radius, bottom, top }, level) => {
      const tierPulse = { value: 0 };
      const material = new THREE.MeshPhysicalMaterial({
        color: level === 2 ? 0x254569 : 0x183451,
        metalness: 0.86,
        roughness: 0.26,
        clearcoat: 0.35,
        clearcoatRoughness: 0.24,
        envMapIntensity: 1.8,
      });
      // 保留真实金属反射，将灯带、蚀刻和宽幅柔光合入实体材质，避免额外薄层争抢深度。
      material.onBeforeCompile = (shader) => {
        Object.assign(shader.uniforms, {
          uStagePulse: tierPulse,
          uStageRadius: { value: radius },
          uStageBottom: { value: bottom },
          uStageTop: { value: top },
          uStageLevel: { value: level },
        });
        shader.vertexShader = shader.vertexShader
          .replace(
            '#include <common>',
            '#include <common>\nvarying vec3 vStageLocal;',
          )
          .replace(
            '#include <begin_vertex>',
            '#include <begin_vertex>\nvStageLocal=position;',
          );
        shader.fragmentShader = shader.fragmentShader
          .replace(
            '#include <common>',
            `
            #include <common>
            varying vec3 vStageLocal;
            uniform float uStagePulse; uniform float uStageRadius;
            uniform float uStageBottom; uniform float uStageTop; uniform float uStageLevel;
            float stageLine(float d,float width){
              float footprint=max(width,fwidth(d));
              return exp(-pow(abs(d)/footprint,2.))*width/footprint;
            }`,
          )
          .replace(
            '#include <emissivemap_fragment>',
            `
            #include <emissivemap_fragment>
            float stageHeight=(vStageLocal.y-uStageBottom)/(uStageTop-uStageBottom);
            float stageTop=smoothstep(uStageTop-.008,uStageTop-.001,vStageLocal.y);
            float stageRadius=length(vStageLocal.xz);
            float stageAngle=atan(vStageLocal.x,vStageLocal.z);
            // 环形灯槽有可读的宽度，点亮整个圆周，顶沿与侧壁同步传递能量。
            float stageBand=smoothstep(.52,.64,stageHeight)*(1.-smoothstep(.82,.92,stageHeight));
            float stageLip=stageLine(stageRadius-(uStageRadius-.065),.022)*stageTop;
            float stageGroove=stageLine(stageHeight-.26,.045)*(1.-stageTop);
            float stageReflection=stageLine(stageAngle-.7,.18)+stageLine(stageAngle+.85,.24);
            float stageFront=stageLine(stageAngle,.12);
            totalEmissiveRadiance+=vec3(.012,.04,.09)*(1.-stageTop);
            totalEmissiveRadiance+=vec3(.035,.12,.25)*(stageReflection*.45+stageFront*.28)*(1.-stageTop);
            totalEmissiveRadiance+=vec3(.025,.11,.23)*stageGroove*.45;
            totalEmissiveRadiance+=vec3(.045,.56,1.05)*(stageBand*(.035+uStagePulse*.72)+stageLip*(.16+uStagePulse*.84));
            float stageEtching=stageLine(stageRadius-(uStageRadius-.22),.009);
            totalEmissiveRadiance+=vec3(.025,.09,.16)*stageEtching*stageTop*.55;
            if(uStageLevel>1.5){
              float pool=exp(-pow(stageRadius/uStageRadius,2.)*8.);
              totalEmissiveRadiance+=vec3(.012,.24,.43)*pool*(.3+uStagePulse*.3)*stageTop;
            }
          `,
          );
      };
      mesh(
        new THREE.LatheGeometry(
          [
            new THREE.Vector2(0, bottom),
            new THREE.Vector2(radius - 0.045, bottom),
            new THREE.Vector2(radius - 0.012, bottom + 0.008),
            new THREE.Vector2(radius, bottom + 0.025),
            new THREE.Vector2(radius, top - 0.03),
            new THREE.Vector2(radius - 0.012, top - 0.012),
            new THREE.Vector2(radius - 0.04, top),
            new THREE.Vector2(0, top),
          ],
          160,
        ),
        material,
        corePlatform,
      );
      corePulses.push({ pulse: tierPulse, delay: (2 - level) * 1.05 });
    });

    // 顶层→中层→底层依次点亮后，地面接力扩散；三圈复用几何，启动时不会凭空出现远处光环。
    const rippleGeometry = new THREE.RingGeometry(0.98, 1.02, 160, 1);
    for (let i = 0; i < 3; i++) {
      const ripple = mesh(
        rippleGeometry,
        new THREE.ShaderMaterial({
          uniforms: {
            uTime: time,
            uOffset: { value: i * corePulsePeriod },
            uCycle: { value: corePulsePeriod * 3 },
            uLaunch: { value: 3.15 },
          },
          transparent: true,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
          vertexShader: `
            uniform float uTime; uniform float uOffset; uniform float uCycle; uniform float uLaunch;
            varying float vAcross; varying float vLife; varying float vEnabled;
            void main(){
              float age=uTime-uLaunch-uOffset;
              vLife=mod(max(age,0.),uCycle)/uCycle;
              vEnabled=step(0.,age);
              vAcross=(length(position.xy)-.98)/.04;
              float radius=2.22+vLife*8.6;
              vec2 p=normalize(position.xy)*(radius+(vAcross-.5)*.045);
              gl_Position=projectionMatrix*viewMatrix*vec4(p.x,.862,p.y,1.);
            }`,
          fragmentShader: `
            varying float vAcross; varying float vLife; varying float vEnabled;
            void main(){
              float line=exp(-pow(abs(vAcross-.5)*4.,2.));
              float fade=smoothstep(0.,.012,vLife)*pow(1.-vLife,1.8)*vEnabled;
              gl_FragColor=vec4(.07,.48,.95,line*fade*.52);
            }`,
        }),
      );
      // 顶点着色器负责扩散半径，静态单位圆的包围盒不参与裁剪。
      ripple.frustumCulled = false;
    }
    // 球面、光晕、文字和两条轨道共用升起坐标，完成后仍回到原来的空间关系。
    const globeRig = new THREE.Group();
    globeRig.position.copy(globeCenter);
    scene.add(globeRig);
    const globe = new THREE.Group();
    globeRig.add(globe);

    // 本地程序纹理只作地球轮廓示意，不请求地图服务；点阵与经纬线贴在真实球面上。
    const mapCanvas = document.createElement('canvas');
    mapCanvas.width = 1536;
    mapCanvas.height = 768;
    const context = mapCanvas.getContext('2d');
    const continents = landData.features.flatMap(({ geometry }) =>
      geometry.type === 'Polygon'
        ? geometry.coordinates
        : geometry.coordinates.flat(),
    );
    const path = new Path2D();
    for (const land of continents) {
      land.forEach(([lng, lat], i) => {
        const x = ((lng + 180) / 360) * 1536;
        const y = ((90 - lat) / 180) * 768;
        if (i === 0) path.moveTo(x, y);
        else path.lineTo(x, y);
      });
      path.closePath();
    }
    context.strokeStyle = 'rgba(65,166,255,.6)';
    context.lineWidth = 1;
    context.stroke(path);
    for (let y = 8; y < 760; y += 4) {
      for (let x = 2; x < 1536; x += 4) {
        if (!context.isPointInPath(path, x, y)) continue;
        context.fillStyle = `rgba(80,195,255,${0.4 + 0.5 * Math.abs(Math.sin(x * y))})`;
        context.fillRect(x, y, 2, 2);
      }
    }
    context.strokeStyle = 'rgba(49,146,246,.035)';
    context.beginPath();
    for (let x = 0; x <= 1536; x += 64) {
      context.moveTo(x, 0);
      context.lineTo(x, 768);
    }
    for (let y = 0; y <= 768; y += 64) {
      context.moveTo(0, y);
      context.lineTo(1536, y);
    }
    context.stroke();
    // 地表节点与短弧一起写入贴图，随球体转动，避免光点浮在屏幕平面上。
    const nodes = [];
    for (let i = 0; i < 250; i++) {
      const x = 24 + ((i * 337) % 1488);
      const y = 130 + ((i * 193) % 470);
      if (context.isPointInPath(path, x, y)) nodes.push([x, y]);
      if (nodes.length === 36) break;
    }
    nodes.forEach(([x, y], i) => {
      const flare = context.createRadialGradient(x, y, 0, x, y, 12);
      flare.addColorStop(0, 'rgba(224,255,255,.95)');
      flare.addColorStop(0.12, 'rgba(108,226,255,.85)');
      flare.addColorStop(0.35, 'rgba(25,138,255,.32)');
      flare.addColorStop(1, 'rgba(10,75,255,0)');
      context.fillStyle = flare;
      context.fillRect(x - 12, y - 12, 24, 24);
      const next = nodes[(i + 3) % nodes.length];
      if (Math.abs(next[0] - x) > 260 || Math.abs(next[1] - y) > 160) return;
      context.strokeStyle = 'rgba(65,170,255,.2)';
      context.lineWidth = 0.8;
      context.beginPath();
      context.moveTo(x, y);
      context.quadraticCurveTo(
        (x + next[0]) / 2,
        Math.min(y, next[1]) - 35,
        ...next,
      );
      context.stroke();
    });
    const map = new THREE.CanvasTexture(mapCanvas);
    textures.add(map);
    const sphereMaterial = new THREE.ShaderMaterial({
      vertexShader: vertex,
      uniforms: { uTime: time, uMap: { value: map } },
      fragmentShader: `
        uniform float uTime; uniform sampler2D uMap; varying vec2 vUv; varying vec3 vNormal; varying vec3 vWorld;
        void main(){
          vec3 n=normalize(vNormal); vec3 eye=normalize(cameraPosition-vWorld);
          float facing=clamp(dot(n,eye),0.,1.); float rim=pow(1.-facing,4.);
          vec4 sampleMap=texture2D(uMap,vUv);
          vec3 tex=sampleMap.rgb*sampleMap.a;
          float band=exp(-pow(abs(vUv.y-fract(uTime/6.))/.018,2.))*pow(max(sin(uTime*1.047),0.),6.);
          vec3 lightDir=normalize(vec3(-.7,1.2,.65));
          float light=max(dot(n,lightDir),0.);
          float gloss=pow(max(dot(n,normalize(lightDir+eye)),0.),72.);
          float softbox=pow(max(dot(n,normalize(vec3(.5,1.,.4)+eye)),0.),18.);
          float atmosphericLight=.6+max(n.y,0.)*.85+max(-n.y,0.)*.45;
          vec3 c=mix(vec3(.001,.008,.045),vec3(.012,.065,.24),light*.8);
          c+=tex*vec3(.4,.85,1.6)*(1.+light*.8);
          c+=vec3(.025,.48,1.4)*rim*atmosphericLight*2.6;
          c+=vec3(.2,.65,1.2)*gloss*.8+vec3(.02,.12,.4)*softbox*.32;
          c+=vec3(.12,.7,1.5)*band*(.1+length(tex))*.7;
          gl_FragColor=vec4(c,1.);
        }`,
    });
    const sphere = mesh(
      new THREE.SphereGeometry(2, 96, 64),
      sphereMaterial,
      globe,
    );
    sphere.rotation.y = 2.2;
    mesh(
      new THREE.SphereGeometry(2.045, 96, 64),
      new THREE.ShaderMaterial({
        vertexShader: vertex,
        transparent: true,
        depthWrite: false,
        side: THREE.BackSide,
        blending: THREE.AdditiveBlending,
        fragmentShader: `
          varying vec3 vNormal; varying vec3 vWorld;
          void main(){
            vec3 n=normalize(vNormal); vec3 eye=normalize(cameraPosition-vWorld);
            float edge=pow(clamp(1.-abs(dot(n,eye)),0.,1.),3.);
            gl_FragColor=vec4(.08,.65,1.6,edge*.34);
          }`,
      }),
      globe,
    );

    // 标题同样进入三维深度测试，前排卡片经过球体时不会出现文字穿透。
    const labelCanvas = document.createElement('canvas');
    labelCanvas.width = 2048;
    labelCanvas.height = 512;
    const labelContext = labelCanvas.getContext('2d');
    labelContext.fillStyle = '#effaff';
    labelContext.textAlign = 'center';
    labelContext.font = '800 350px Arial';
    labelContext.fillText('ai demo', 1024, 305);
    labelContext.font = '500 63px Arial';
    labelContext.letterSpacing = '9px';
    labelContext.fillText('INTERACTIVE DIGITAL GALLERY', 1024, 435);
    const labelTexture = new THREE.CanvasTexture(labelCanvas);
    textures.add(labelTexture);
    const labelMaterial = new THREE.SpriteMaterial({
      map: labelTexture,
      color: 0xcbd9ed,
      depthWrite: false,
    });
    materials.add(labelMaterial);
    const label = new THREE.Sprite(labelMaterial);
    label.scale.set(3.8, 0.95, 1);
    globeRig.add(label);

    // 球体局部柔光与高亮阈值辉光叠加，HTML 文字不参与后期处理。
    const glowCanvas = document.createElement('canvas');
    glowCanvas.width = glowCanvas.height = 128;
    const glowContext = glowCanvas.getContext('2d');
    const gradient = glowContext.createRadialGradient(64, 64, 4, 64, 64, 64);
    gradient.addColorStop(0, 'rgba(26,181,255,.5)');
    gradient.addColorStop(0.46, 'rgba(17,115,255,.16)');
    gradient.addColorStop(1, 'rgba(0,40,150,0)');
    glowContext.fillStyle = gradient;
    glowContext.fillRect(0, 0, 128, 128);
    const glowMap = new THREE.CanvasTexture(glowCanvas);
    textures.add(glowMap);
    const glowMaterial = new THREE.SpriteMaterial({
      map: glowMap,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      opacity: 0.6,
    });
    materials.add(glowMaterial);
    const glow = new THREE.Sprite(glowMaterial);
    glow.scale.set(7.5, 7.5, 1);
    globeRig.add(glow);

    const orbit = new THREE.Group();
    orbit.rotation.set(-1.14, 0.12, -0.28);
    globeRig.add(orbit);
    // 行星带姿态固定：径向细纹、分层亮轨与两道游走光弧共同形成带状体积。
    mesh(
      new THREE.RingGeometry(2.32, 3.02, 256, 1),
      new THREE.ShaderMaterial({
        vertexShader: vertex,
        uniforms: { uTime: time },
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        fragmentShader: `
          uniform float uTime; varying vec2 vUv;
          void main(){
            vec2 p=(vUv-.5)*6.04; float r=length(p); float a=atan(p.y,p.x);
            float band=(r-2.32)/.7;
            float fade=smoothstep(0.,.045,band)*(1.-smoothstep(.85,1.,band));
            // 细纹小于屏幕像素时渐变为平均亮度，避免随透视移动产生摩尔纹闪烁。
            float radialWidth=max(fwidth(r),.001);
            float stripe=r*180.+sin(a*8.-uTime*.2)*.35;
            float fine=pow(.5+.5*sin(stripe),5.);
            fine=mix(.246,fine,1.-smoothstep(.8,3.,fwidth(stripe)));
            float inner=exp(-pow(abs(r-2.39)/max(.012,radialWidth),2.));
            float middle=exp(-pow(abs(r-2.64)/max(.022,radialWidth),2.));
            float outer=exp(-pow(abs(r-2.86)/max(.009,radialWidth),2.));
            float arc=pow(.5+.5*cos(a-uTime*.48),22.);
            float arc2=pow(.5+.5*cos(a+uTime*.31+2.5),34.);
            float lanes=inner*.85+middle*.7+outer*.55;
            float grainPhase=a*80.+r*120.-uTime*.35;
            float grain=.85+.15*sin(grainPhase)*(1.-smoothstep(.8,3.,fwidth(grainPhase)));
            vec3 color=mix(vec3(.015,.08,.5),vec3(.08,.5,1.3),fine*.55+band*.25);
            color+=vec3(.18,.85,1.8)*lanes;
            color+=vec3(.35,1.1,2.2)*(arc+arc2*.65)*(lanes+.15)*1.5;
            float alpha=(.18+fine*.24+lanes*.55+(arc+arc2)*.2)*fade;
            gl_FragColor=vec4(color*grain,alpha);
          }`,
      }),
      orbit,
    );
    const innerBandEdge = ring(2.36, 0.006, 0x2ebdff, orbit);
    innerBandEdge.material.opacity = 0.5;
    const outerBandEdge = ring(2.91, 0.004, 0x477dff, orbit);
    outerBandEdge.material.opacity = 0.35;

    // 细轨独立翻飞，外层辉光、实体亮芯和卫星拖尾均共享这一坐标系。
    const satelliteRadius = 3.2;
    const orbit2 = new THREE.Group();
    globeRig.add(orbit2);
    mesh(
      new THREE.TorusGeometry(satelliteRadius, 0.016, 12, 256),
      new THREE.ShaderMaterial({
        vertexShader: vertex,
        // 管壁仅保留固定的截面层次，不使用随视角变化的镜面高光或点状追光。
        fragmentShader: `
          varying vec2 vUv;
          void main(){
            float tube=.5+.5*cos(vUv.y*6.283185);
            vec3 c=mix(vec3(.025,.16,.36),vec3(.09,.38,.7),tube);
            gl_FragColor=vec4(c,1.);
          }`,
      }),
      orbit2,
    );
    const orbitHalo = ring(satelliteRadius, 0.045, 0x208dff, orbit2);
    orbitHalo.material.blending = THREE.AdditiveBlending;
    orbitHalo.material.depthWrite = false;
    orbitHalo.material.opacity = 0.09;

    const satellite = new THREE.Group();
    orbit2.add(satellite);
    mesh(
      new THREE.SphereGeometry(0.15, 48, 32),
      new THREE.ShaderMaterial({
        vertexShader: vertex,
        fragmentShader: `
          varying vec3 vNormal; varying vec3 vWorld;
          void main(){
            vec3 n=normalize(vNormal); vec3 eye=normalize(cameraPosition-vWorld);
            vec3 light=normalize(vec3(-.6,1.,1.5));
            float diffuse=max(dot(n,light),0.);
            float rim=pow(1.-clamp(dot(n,eye),0.,1.),3.);
            float highlight=pow(max(dot(n,normalize(light+eye)),0.),64.);
            vec3 color=mix(vec3(.002,.018,.075),vec3(.025,.28,.85),diffuse);
            color+=vec3(.15,.65,1.4)*rim*.9+vec3(.7,.95,1.4)*highlight*2.;
            gl_FragColor=vec4(color,1.);
          }
        `,
      }),
      satellite,
    );
    const satelliteGlowMaterial = new THREE.SpriteMaterial({
      map: glowMap,
      color: 0x51cfff,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      opacity: 0.75,
    });
    materials.add(satelliteGlowMaterial);
    const satelliteGlow = new THREE.Sprite(satelliteGlowMaterial);
    satelliteGlow.scale.set(0.85, 0.85, 1);
    satellite.add(satelliteGlow);

    // 复用带状几何更新渐细拖尾，避免每帧新建管线或只画一根像素线。
    const trailCount = 64;
    const trailGeometry = new THREE.BufferGeometry();
    trailGeometry.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array(trailCount * 6), 3),
    );
    const trailUvs = [];
    const trailIndices = [];
    for (let i = 0; i < trailCount; i++) {
      trailUvs.push(0, 1 - i / (trailCount - 1), 1, 1 - i / (trailCount - 1));
      if (i < trailCount - 1) {
        const j = i * 2;
        trailIndices.push(j, j + 1, j + 2, j + 1, j + 3, j + 2);
      }
    }
    trailGeometry.setAttribute(
      'uv',
      new THREE.Float32BufferAttribute(trailUvs, 2),
    );
    trailGeometry.setIndex(trailIndices);
    trailGeometry.boundingSphere = new THREE.Sphere(
      new THREE.Vector3(),
      satelliteRadius + 0.1,
    );
    mesh(
      trailGeometry,
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        vertexShader: `varying vec2 vUv; void main(){vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
        fragmentShader: `varying vec2 vUv; void main(){float crossGlow=exp(-pow(abs(vUv.x-.5)*3.,2.)); float fade=pow(max(vUv.y,0.),1.7); gl_FragColor=vec4(.12,.6,1.6,crossGlow*fade*.8);}`,
      }),
      orbit2,
    );

    // 柔光束没有硬质筒壁；微尘、短光点、长拖尾共用一批实例和同一时间。
    const column = mesh(
      new THREE.PlaneGeometry(2.2, 15),
      new THREE.ShaderMaterial({
        vertexShader: vertex,
        uniforms: { uTime: time },
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        fragmentShader: `uniform float uTime; varying vec2 vUv; void main(){float edge=pow(max(1.-abs(vUv.x-.5)*2.,0.),3.); float lane=pow(.5+.5*sin(vUv.x*48.+sin(vUv.y*5.-uTime*.6)),14.); float fade=smoothstep(0.,.06,vUv.y)*(1.-smoothstep(.6,1.,vUv.y)); gl_FragColor=vec4(.025,.28,1.,edge*(.09+lane*.12)*fade*(.8+.2*sin(uTime*.8)));}`,
      }),
    );
    column.position.set(0, 8.3, -0.6);
    const particleGeometry = new THREE.InstancedBufferGeometry();
    particleGeometry.setIndex([0, 1, 2, 0, 2, 3]);
    particleGeometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(
        [-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0],
        3,
      ),
    );
    particleGeometry.setAttribute(
      'uv',
      new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2),
    );
    const seeds = [];
    for (let i = 0; i < 180; i++) {
      // 独立散列位置、寿命与速度，避免相关种子排列出规律斜线。
      for (let channel = 0; channel < 4; channel++) {
        const value = Math.abs(
          (Math.sin(i * 93.71 + channel * 43.13 + 2) * 43758.5453) % 1,
        );
        seeds.push(channel === 2 ? value * Math.PI * 2 : value);
      }
    }
    particleGeometry.setAttribute(
      'aSeed',
      new THREE.InstancedBufferAttribute(new Float32Array(seeds), 4),
    );
    particleGeometry.instanceCount = 180;
    const particles = mesh(
      particleGeometry,
      new THREE.ShaderMaterial({
        uniforms: { uTime: time },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        vertexShader: `
        attribute vec4 aSeed; uniform float uTime; varying vec2 vUv; varying float vFade; varying float vHero;
        void main(){
          vUv=uv; vHero=step(.74,aSeed.w);
          float life=fract(uTime*(.055+aSeed.w*.11)+aSeed.x);
          float radius=.2+pow(aSeed.y,1.7)*5.; float angle=aSeed.z+life*.35;
          vec3 center=vec3(sin(angle)*radius, .95+life*13., cos(angle)*radius*.55-.4);
          float length=mix(.055+aSeed.y*.09,.6+aSeed.y*1.4,vHero);
          float width=mix(.014+aSeed.y*.018,.012+aSeed.y*.019,vHero);
          vec3 right=vec3(viewMatrix[0][0],viewMatrix[1][0],viewMatrix[2][0]);
          vec3 world=center+right*position.x*width+vec3(0.,position.y*length,0.);
          vFade=smoothstep(0.,.1,life)*(1.-smoothstep(.75,1.,life));
          gl_Position=projectionMatrix*viewMatrix*vec4(world,1.);
        }
      `,
        fragmentShader: `
        varying vec2 vUv; varying float vFade; varying float vHero;
        void main(){
          float crossGlow=exp(-pow(abs(vUv.x-.5)*4.5,2.));
          float head=exp(-pow(abs(vUv.y-.88)/.11,2.));
          float tail=pow(vUv.y,2.)*(1.-smoothstep(.88,1.,vUv.y));
          float dotGlow=exp(-pow(abs(vUv.y-.5)*3.,2.));
          float alpha=crossGlow*mix(dotGlow*.42,head*.9+tail*.32,vHero)*vFade;
          gl_FragColor=vec4(mix(vec3(.08,.45,1.),vec3(.7,.95,1.8),head*vHero),alpha);
        }
      `,
      }),
    );
    particles.frustumCulled = false;
    // 上升粒子属于背景，先于实体绘制，避免从后排卡片表面穿过、被误认为边框流光。
    particles.material.transparent = false;
    particles.renderOrder = -1;
    const meteor = mesh(
      new THREE.CylinderGeometry(0, 0.014, 2, 6),
      new THREE.MeshBasicMaterial({
        color: 0xa3edff,
        transparent: true,
        opacity: 0,
      }),
    );
    meteor.rotation.z = -0.8;

    const portals = entries.map((entry, index) => {
      const image = coverImages[index];
      const cover = image ? new THREE.Texture(image) : null;
      const crop = new THREE.Vector2(1, 1);
      if (cover) {
        cover.colorSpace = THREE.SRGBColorSpace;
        cover.needsUpdate = true;
        textures.add(cover);
        const imageAspect = image.naturalWidth / image.naturalHeight;
        const panelAspect = CARD_WIDTH / (CARD_HEIGHT * 0.74);
        if (imageAspect > panelAspect) crop.x = panelAspect / imageAspect;
        else crop.y = imageAspect / panelAspect;
      }
      const group = new THREE.Group();
      const seat = new THREE.Group();
      scene.add(seat);
      seat.add(group);
      group.position.y = CARD_HEIGHT / 2 + 0.4;
      // 卡片边框与底座共用深度权重，进入前排时一同渐亮。
      const front = { value: 0 };
      const base = platform(1.64, seat, front, index * 1.05);
      const content = new THREE.CanvasTexture(createCardContent(cards[index]));
      content.colorSpace = THREE.SRGBColorSpace;
      content.anisotropy = Math.min(
        8,
        renderer.capabilities.getMaxAnisotropy(),
      );
      textures.add(content);
      const cardMaterial = new THREE.ShaderMaterial({
        vertexShader: vertex,
        // 面板输出 alpha 恒为 1，先写实体深度，避免环绕时与整片光晕交换透明排序。
        transparent: false,
        uniforms: {
          uTime: time,
          uCover: { value: cover },
          uContent: { value: content },
          uHasCover: { value: cover ? 1 : 0 },
          uCrop: { value: crop },
          uPhase: { value: index * 1.05 },
          uFront: front,
        },
        fragmentShader: `
          uniform float uTime; uniform sampler2D uCover; uniform sampler2D uContent; uniform vec2 uCrop; uniform float uHasCover; uniform float uFront; uniform float uPhase;
          varying vec2 vUv;
          void main(){
            vec2 uv=vUv; vec2 p=uv*vec2(${CARD_WIDTH},${CARD_HEIGHT}); vec2 d=min(p,vec2(${CARD_WIDTH},${CARD_HEIGHT})-p);
            float edge=min(d.x,d.y); float aa=max(fwidth(edge),.001);
            float rim=1.-smoothstep(.018,.032+aa,edge);
            float inner=(1.-smoothstep(.003,.009+aa,abs(edge-.065)))*.3;
            float bevel=exp(-edge*28.);
            float perimeter;
            if(d.x<d.y) perimeter=uv.x<.5?${2 * (CARD_WIDTH + CARD_HEIGHT)}-p.y:${CARD_WIDTH}+p.y;
            else perimeter=uv.y<.5?p.x:${2 * CARD_WIDTH + CARD_HEIGHT}-p.x;
            // 光带沿完整周长连续移动；亮暗对比来自边框本身，不靠叠加点光或反射。
            float wave=.5+.5*cos(perimeter/${2 * (CARD_WIDTH + CARD_HEIGHT)}*6.283185-uTime*.48+uPhase);
            float flow=pow(wave,6.)*uFront;
            vec3 c=mix(vec3(.003,.013,.05),vec3(.018,.085,.25),uv.y);
            if(uHasCover>.5 && uv.y>.26){ vec2 photo=(vec2(uv.x,(uv.y-.26)/.74)-.5)*uCrop+.5; c=mix(c,texture2D(uCover,photo).rgb,.94*smoothstep(.26,.4,uv.y)); }
            c+=vec3(.1,.4,.9)*bevel*.2;
            // 描边覆盖封面颜色，亮度不受图片影响；前排光带清晰，后排仅保留静态细边。
            vec3 edgeColor=vec3(.045,.16,.28)+vec3(.3,.8,1.2)*flow;
            c=mix(c,edgeColor,rim);
            c+=vec3(.1,.3,1.)*inner;
            vec4 content=texture2D(uContent,uv);
            c=mix(c,content.rgb,content.a);
            gl_FragColor=vec4(c,1.);
          }`,
      });
      const panel = mesh(
        new THREE.PlaneGeometry(CARD_WIDTH, CARD_HEIGHT),
        cardMaterial,
        group,
      );
      // 轻薄侧边使用不受灯光影响的材质，避免环境灯及点光源重新生成反光亮斑。
      const side = mesh(
        new RoundedBoxGeometry(
          CARD_WIDTH + 0.05,
          CARD_HEIGHT + 0.05,
          0.1,
          2,
          0.012,
        ),
        new THREE.MeshBasicMaterial({ color: 0x15416d }),
        group,
      );
      side.position.z = -0.065;
      const backing = mesh(
        new RoundedBoxGeometry(
          CARD_WIDTH + 0.025,
          CARD_HEIGHT + 0.025,
          0.025,
          2,
          0.008,
        ),
        new THREE.MeshBasicMaterial({ color: 0x081a35 }),
        group,
      );
      backing.position.z = -0.125;
      return { seat, group, base, panel, cardMaterial };
    });

    // 射线仅用于点击命中检测；图文由面板深度自然遮挡，不再整块开关可见性。
    const globeOccluder = new THREE.Sphere(globeCenter.clone(), 2);
    const panelOccluders = [];
    const raycaster = new THREE.Raycaster();
    const pointerPosition = new THREE.Vector2();
    const globeHit = new THREE.Vector3();
    const intersections = [];

    function getEntryAt(clientX, clientY) {
      if (destroyed || mobile) return -1;
      const bounds = canvas.getBoundingClientRect();
      pointerPosition.set(
        ((clientX - bounds.left) / bounds.width) * 2 - 1,
        1 - ((clientY - bounds.top) / bounds.height) * 2,
      );
      raycaster.setFromCamera(pointerPosition, camera);
      intersections.length = 0;
      raycaster.intersectObjects(panelOccluders, false, intersections);
      const hit = intersections[0];
      if (!hit) return -1;
      if (
        raycaster.ray.intersectSphere(globeOccluder, globeHit) &&
        globeHit.distanceTo(camera.position) < hit.distance
      )
        return -1;
      return portals.findIndex((portal) => portal.panel === hit.object);
    }

    function render() {
      time.value = elapsed;
      const entrance =
        entranceSkipped || elapsed >= ENTRANCE_DURATION
          ? settledEntrance
          : getEntranceState(elapsed);
      globeRig.position.y = THREE.MathUtils.lerp(
        1.46,
        globeCenter.y,
        entrance.globe,
      );
      globeRig.scale.setScalar(THREE.MathUtils.lerp(0.06, 1, entrance.globe));
      orbit.visible = orbit2.visible = entrance.rings > 0;
      orbit.scale.setScalar(Math.max(0.001, entrance.rings));
      orbit2.scale.setScalar(Math.max(0.001, entrance.rings));
      label.material.opacity = entrance.label;
      globeOccluder.center.copy(globeRig.position);
      globeOccluder.radius = 2 * globeRig.scale.x;
      const ignition = elapsed % corePulsePeriod;
      corePulses.forEach(({ pulse, delay }) => {
        const stage = ignition - delay;
        // 每层缓入 0.25 秒、保持至 0.8 秒，再缓退；与下一层轻微交叠，不整座同步闪白。
        pulse.value =
          THREE.MathUtils.smoothstep(stage, 0, 0.25) *
          (1 - THREE.MathUtils.smoothstep(stage, 0.8, 1.45));
      });
      sphere.rotation.y = 2.2 + (elapsed * Math.PI * 2) / 70;
      orbit2.rotation.set(
        1.05 + Math.sin((elapsed * Math.PI * 2) / 14) * 0.55,
        -0.22 + Math.sin((elapsed * Math.PI * 2) / 21) * 0.22,
        0.48 + Math.sin((elapsed * Math.PI * 2) / 17) * 0.42,
      );
      orbit2.position.y = Math.sin((elapsed * Math.PI * 2) / 14) * 0.08;
      const satelliteAngle = (elapsed * Math.PI) / 4;
      satellite.position.set(
        Math.cos(satelliteAngle) * satelliteRadius,
        Math.sin(satelliteAngle) * satelliteRadius,
        0,
      );
      const trailPositions = trailGeometry.attributes.position;
      for (let i = 0; i < trailCount; i++) {
        const a = satelliteAngle - i * 0.0085;
        const halfWidth = 0.024 * (1 - i / (trailCount - 1)) + 0.001;
        trailPositions.setXYZ(
          i * 2,
          Math.cos(a) * (satelliteRadius - halfWidth),
          Math.sin(a) * (satelliteRadius - halfWidth),
          0,
        );
        trailPositions.setXYZ(
          i * 2 + 1,
          Math.cos(a) * (satelliteRadius + halfWidth),
          Math.sin(a) * (satelliteRadius + halfWidth),
          0,
        );
      }
      trailPositions.needsUpdate = true;
      glow.material.opacity =
        (0.5 + Math.sin(elapsed * 1.4) * 0.08) * entrance.globe;
      const meteorProgress = (elapsed % 18) / 1.4;
      meteor.visible = meteorProgress < 1;
      meteor.position.set(-7 + meteorProgress * 8, 10 - meteorProgress * 5, -9);
      meteor.material.opacity =
        Math.max(0, Math.sin(meteorProgress * Math.PI)) * 0.65;

      const positions = portals.map((_, i) => getOrbitPosition(i, phase));
      portals.forEach((portal, i) => {
        portal.seat.visible = !mobile;
        const p = positions[i];
        portal.seat.position.set(p.x, 0.85, p.z);
        portal.seat.scale.setScalar(
          0.45 + 0.55 * Math.pow((p.z + ORBIT_DEPTH) / (2 * ORBIT_DEPTH), 1.7),
        );
        // 抵消座位缩放，保证远排卡片也从画面上方进入；底座始终留在原位。
        portal.group.position.y =
          CARD_HEIGHT / 2 +
          0.4 +
          entrance.cards[i].offset / portal.seat.scale.x;
        portal.group.visible = entrance.cards[i].visible;
        // 卡片轻微向中心收拢，始终以正面朝向观看者；底座与卡片共享座位坐标。
        portal.group.rotation.y = p.yaw;
        // 随深度渐入/渐出，避免前两席换位时边框突然开关。
        portal.cardMaterial.uniforms.uFront.value = THREE.MathUtils.smoothstep(
          p.z,
          ORBIT_DEPTH * 0.2,
          ORBIT_DEPTH * 0.7,
        );
        portal.group.updateWorldMatrix(true, false);
        if (!mobile && cards[i]) {
          cards[i].style.transform =
            `matrix3d(${getCardProjection(camera, portal.group.matrixWorld, width, height).join(',')})`;
          cards[i].style.zIndex = `${Math.round(100 + p.z * 10)}`;
          cards[i].style.pointerEvents = portal.group.visible ? '' : 'none';
        }
      });
      label.position
        .copy(camera.position)
        .sub(globeRig.position)
        .normalize()
        .multiplyScalar(2.04);
      scene.updateMatrixWorld(true);
      panelOccluders.length = 0;
      portals.forEach((portal) => {
        if (portal.group.visible) panelOccluders.push(portal.panel);
      });
      composer.render();
    }

    function tick(timestamp) {
      frame = 0;
      if (destroyed || playback.hidden || playback.paused) return;
      const delta = previous
        ? Math.min((timestamp - previous) / 1000, 0.05)
        : 0;
      previous = timestamp;
      elapsed += delta;
      // 入场结束这一帧只累计结束后的时间，暂停和后台停帧沿用同一时钟。
      const orbitDelta = entranceSkipped
        ? delta
        : Math.min(delta, Math.max(0, elapsed - ENTRANCE_DURATION));
      if (!playback.interacting && playback.focused < 0 && !mobile)
        phase =
          (phase + (orbitDelta * Math.PI * 2) / ORBIT_SECONDS) % (Math.PI * 2);
      render();
      frame = requestAnimationFrame(tick);
    }

    function setPlayback(next) {
      if (next.interacting || next.focused >= 0) entranceSkipped = true;
      // 键盘聚焦入口时恢复可阅读的前排位置，避免焦点落在球体背后。
      if (next.focused >= 0 && next.focused !== playback.focused && !mobile)
        phase = (-SEAT_ANGLES[next.focused] * Math.PI) / 180;
      playback = next;
      cancelAnimationFrame(frame);
      frame = 0;
      previous = 0;
      if (destroyed) return;
      if (!next.hidden) render();
      if (!next.paused && !next.hidden) frame = requestAnimationFrame(tick);
    }

    // 拖拽直接改变整组唯一相位；松手由原有帧循环接续，不创建第二个计时器。
    function dragBy(deltaX) {
      if (destroyed || mobile || playback.hidden) return;
      entranceSkipped = true;
      phase =
        (phase + (deltaX / Math.max(width, 1)) * Math.PI * 2) % (Math.PI * 2);
      render();
    }

    function resize() {
      if (destroyed) return;
      width = host.clientWidth;
      height = Math.max(1, host.clientHeight);
      mobile = width < 760;
      // 窄屏直接呈现可访问的两列入口，不等待桌面空间中的落位动画。
      if (mobile) entranceSkipped = true;
      camera.aspect = width / height;
      camera.position.set(
        0,
        mobile ? globeCenter.y + 0.45 : 3.4,
        mobile ? 13 : 16 * Math.max(1, 1.85 / camera.aspect),
      );
      camera.lookAt(0, mobile ? globeCenter.y - 1.15 : 3, 0);
      // 只移动画面取景，球体、底座及轨道相对位置不变；HTML 也使用此投影矩阵。
      if (mobile) camera.clearViewOffset();
      else
        camera.setViewOffset(width, height, 0, -height * 0.08, width, height);
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld();
      renderer.setSize(width, height, false);
      composer.setSize(width, height);
      // 光晕不需要与文字同分辨率；宽高减半，将模糊像素量降至原来的四分之一。
      bloom.setSize(
        width * renderer.getPixelRatio() * 0.5,
        height * renderer.getPixelRatio() * 0.5,
      );
      if (mobile)
        cards.forEach((card) => {
          card.style.transform = '';
          card.style.zIndex = '';
          card.style.pointerEvents = '';
        });
      render();
    }

    canvas.addEventListener('webglcontextlost', handleContextLost);
    // 所有展品仍可见时预编译，避免入场途中第一次显示卡片/轨道才编译造成停顿。
    await renderer.compileAsync(scene, camera);
    observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();
    return { setPlayback, dragBy, getEntryAt, dispose };
  } catch (error) {
    dispose();
    throw error;
  }
}
