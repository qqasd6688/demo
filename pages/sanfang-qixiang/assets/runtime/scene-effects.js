import {
  AdditiveBlending,
  BufferGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PlaneGeometry,
  Points,
  ShaderMaterial,
} from '../vendor/three/build/three.module.min.js'
import { getWorldPoint } from './geometry.js'

// 流光严格沿已有街巷/导览中心线生成，转弯不跨越建筑；所有线段合为一个网格。
export function createRoadFlowGeometry(paths, width = 5.2, origin = null) {
  const vertices = [],
    flow = []
  let span = 0
  for (const source of paths) {
    const path = source.filter(
      (p, i) => !i || Math.hypot(p[0] - source[i - 1][0], p[1] - source[i - 1][1]) > 0.01,
    )
    if (path.length < 2) continue
    const distance = (p) => (origin ? Math.hypot(p[0] - origin[0], p[1] - origin[1]) : 0)
    // 入场由南端向外舒展，坊巷按与起点的距离接续，避免全部道路同步闪亮。
    if (origin && distance(path[0]) > distance(path.at(-1))) path.reverse()
    let along = distance(path[0])
    const offsets = path.map((p, i) => {
      const before = path[Math.max(0, i - 1)],
        after = path[Math.min(path.length - 1, i + 1)]
      const inLength = Math.hypot(p[0] - before[0], p[1] - before[1]),
        outLength = Math.hypot(after[0] - p[0], after[1] - p[1])
      const incoming = inLength
        ? [-(p[1] - before[1]) / inLength, (p[0] - before[0]) / inLength]
        : null
      const outgoing = outLength
        ? [-(after[1] - p[1]) / outLength, (after[0] - p[0]) / outLength]
        : incoming
      const nx = (incoming?.[0] ?? outgoing[0]) + outgoing[0],
        nz = (incoming?.[1] ?? outgoing[1]) + outgoing[1],
        normalLength = Math.hypot(nx, nz)
      if (normalLength < 0.001) return outgoing.map((v) => (v * width) / 2)
      // 相邻段共用转角截面，防止矩形条带在弯道叠亮或断开；尖角限制延伸。
      const miter = Math.min(
        1.4,
        1 / Math.max(0.1, (nx * outgoing[0] + nz * outgoing[1]) / normalLength),
      )
      return [
        (((nx / normalLength) * width) / 2) * miter,
        (((nz / normalLength) * width) / 2) * miter,
      ]
    })
    for (let i = 1; i < path.length; i++) {
      const [ax, az] = path[i - 1],
        [bx, bz] = path[i]
      const length = Math.hypot(bx - ax, bz - az)
      if (length < 0.01) continue
      for (const [end, side] of [
        [0, -1],
        [0, 1],
        [1, 1],
        [0, -1],
        [1, 1],
        [1, -1],
      ]) {
        const [nx, nz] = offsets[i - 1 + end]
        vertices.push((end ? bx : ax) + nx * side, 0.12, (end ? bz : az) + nz * side)
        flow.push(along + end * length, side)
      }
      along += length
    }
    span = Math.max(span, along)
  }
  const geometry = new BufferGeometry()
    .setAttribute('position', new Float32BufferAttribute(vertices, 3))
    .setAttribute('flowUv', new Float32BufferAttribute(flow, 2))
  geometry.userData.flowSpan = span
  return geometry
}

// 场景氛围复用道路、选中/导览状态和唯一帧循环，不创建监听器或定时器。
export function buildSceneEffects(world) {
  const clock = { value: 0 },
    root = new Group()
  root.name = 'sanfang-scene-effects'
  const paths = world.data.roads
    .filter((road) =>
      /南后街|衣锦坊|文儒坊|光禄坊|郎官巷|塔巷|黄巷|安民巷|宫巷|吉庇/.test(road.name || ''),
    )
    .map((road) => road.points.map((point) => getWorldPoint(point, world.origin)))
  const flowOrigin =
    world.data.roads
      .filter((road) => road.name === '南后街')
      .flatMap((road) => road.points.map((point) => getWorldPoint(point, world.origin)))
      .sort((a, b) => b[1] - a[1])[0] ?? null
  const roadFlow = new Mesh(
    createRoadFlowGeometry(paths, 5.2, flowOrigin),
    new ShaderMaterial({
      uniforms: {
        effectTime: { value: 0 },
        strength: { value: 0 },
        speed: { value: 1 },
        cycleLength: { value: 0 },
        pigment: { value: new Color('#b59461') },
        sheen: { value: new Color('#dcc393') },
      },
      transparent: true,
      toneMapped: false,
      depthWrite: false,
      side: DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
      vertexShader: `attribute vec2 flowUv; varying vec2 vFlow;
      void main(){vFlow=flowUv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
      fragmentShader: `uniform float effectTime; uniform float strength;
      uniform float speed; uniform float cycleLength; uniform vec3 pigment; uniform vec3 sheen;
      varying vec2 vFlow;
      void main(){
        float behind=effectTime*speed-vFlow.x;
        if(cycleLength>0.)behind=mod(behind+18.,cycleLength)-18.;
        float sweep=smoothstep(-18.,16.,behind)*(1.-smoothstep(28.,180.,behind));
        // 淡金颜料般的柔边与细微明暗，只在光晕经过处着色，不留下常亮中线。
        float drift=sin(vFlow.x*.23)*.045+sin(vFlow.x*.61)*.025;
        float edge=abs(vFlow.y+drift);
        float brush=(1.-smoothstep(.12,.94,edge))*(.9+.1*cos(vFlow.x*.37+vFlow.y*9.));
        float glint=exp(-pow((behind-24.)/30.,2.));
        float alpha=sweep*brush*(.46+glint*.26)*smoothstep(0.,1.,strength);
        if(alpha<.004)discard;
        gl_FragColor=vec4(mix(pigment,sheen,glint*.75),alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    }),
  )
  roadFlow.name = 'street-golden-flow'
  roadFlow.renderOrder = 3
  roadFlow.visible = false
  root.add(roadFlow)

  // 只用二十片低空软雾形成巷道间的层次；晴天清晨可见，其他天气平滑淡出。
  const mist = new InstancedMesh(
    new PlaneGeometry(1, 1),
    new ShaderMaterial({
      uniforms: { effectTime: clock, strength: { value: 0 } },
      transparent: true,
      depthWrite: false,
      vertexShader: `uniform float effectTime;varying vec2 vUv;varying float vSeed;
      void main(){
        vUv=uv;vSeed=instanceMatrix[3].x*0.03;
        vec4 center=modelViewMatrix*instanceMatrix*vec4(0.0,0.0,0.0,1.0);
        center.x+=sin(effectTime*0.06+vSeed)*12.0;
        center.xy+=position.xy*vec2(length(instanceMatrix[0].xyz),length(instanceMatrix[1].xyz));
        gl_Position=projectionMatrix*center;
      }`,
      fragmentShader: `uniform float effectTime;uniform float strength;varying vec2 vUv;varying float vSeed;
      void main(){
        vec2 p=(vUv-0.5)*2.0;
        float cloud=0.7+0.3*sin(vUv.x*14.0+sin(vUv.y*9.0+vSeed)+effectTime*0.2);
        float alpha=(1.0-smoothstep(0.15,1.0,length(p)))*cloud*strength*0.27;
        if(alpha<0.003)discard;
        gl_FragColor=vec4(0.91,0.86,0.77,alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    }),
    20,
  )
  const dummy = new Object3D()
  const streetPoints = paths.flat()
  for (let i = 0; i < mist.count; i++) {
    const p = streetPoints[Math.floor((i / mist.count) * streetPoints.length)] ?? [
      world.mapCenter.x,
      world.mapCenter.z,
    ]
    dummy.position.set(p[0], 5 + (i % 3) * 2, p[1])
    dummy.scale.set(75 + (i % 4) * 16, 14 + (i % 3) * 4, 1)
    dummy.updateMatrix()
    mist.setMatrixAt(i, dummy.matrix)
  }
  mist.name = 'morning-alley-mist'
  mist.frustumCulled = false
  mist.visible = false
  root.add(mist)

  // 七只低面数飞鸟按编队掠过屋顶，翅膀在顶点着色器中拍动。
  const birdGeometry = new BufferGeometry().setAttribute(
    'position',
    new Float32BufferAttribute(
      [
        0, 0, -1, -0.17, 0, 0.7, 0.17, 0, 0.7, 0, 0, -0.35, -1.9, 0, 0.3, -0.2, 0, 0.7, 0, 0, -0.35,
        0.2, 0, 0.7, 1.9, 0, 0.3,
      ],
      3,
    ),
  )
  birdGeometry.setAttribute(
    'birdPhase',
    new InstancedBufferAttribute(new Float32Array([0, 1.3, 2.7, 4, 5.4, 6.6, 8]), 1),
  )
  const birdMaterial = new MeshBasicMaterial({ color: '#514b40', side: DoubleSide })
  birdMaterial.onBeforeCompile = (shader) => {
    shader.uniforms.effectTime = clock
    shader.vertexShader =
      'uniform float effectTime;attribute float birdPhase;\n' +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\ntransformed.y += abs(position.x)*sin(effectTime*8.0+birdPhase)*0.6;',
      )
  }
  birdMaterial.customProgramCacheKey = () => 'sanfang-bird-wings-v1'
  const birds = new InstancedMesh(birdGeometry, birdMaterial, 7)
  birds.name = 'rooftop-birds'
  birds.frustumCulled = false
  birds.visible = false
  root.add(birds)

  const feedback = new Group()
  feedback.name = 'heart-tree-feedback'
  if (world.heartTree) {
    feedback.position.copy(world.heartTree.position)
    feedback.rotation.y = world.heartTree.rotation.y
  }
  const leafGeometry = new BufferGeometry().setAttribute(
    'position',
    new Float32BufferAttribute(
      [0, 0.85, 0, -0.32, 0, 0.08, 0, -0.85, 0, 0, 0.85, 0, 0, -0.85, 0, 0.32, 0, 0.08],
      3,
    ),
  )
  const fallingLeaves = new InstancedMesh(
    leafGeometry,
    new MeshBasicMaterial({ color: '#a0b564', side: DoubleSide }),
    36,
  )
  const tint = new Color()
  for (let i = 0; i < fallingLeaves.count; i++)
    fallingLeaves.setColorAt(i, tint.set(i % 5 === 0 ? '#e6c47b' : '#8ba455'))
  fallingLeaves.frustumCulled = false
  feedback.add(fallingLeaves)
  const sparkPositions = []
  for (let i = 0; i < 28; i++) {
    const angle = i * 2.39996
    sparkPositions.push(Math.cos(angle) * (5 + (i % 6)), 17 + (i % 11), Math.sin(angle) * 5)
  }
  const sparkAge = { value: 10 }
  const sparks = new Points(
    new BufferGeometry().setAttribute('position', new Float32BufferAttribute(sparkPositions, 3)),
    new ShaderMaterial({
      uniforms: { age: sparkAge },
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      vertexShader: `uniform float age;varying float vAlpha;
      void main(){vec3 p=position;p.x+=sin(age*2.0+position.y)*1.2;p.y+=age*0.6;
        vec4 mv=modelViewMatrix*vec4(p,1.0);gl_Position=projectionMatrix*mv;
        gl_PointSize=clamp(650.0/max(1.0,-mv.z),2.5,8.0);
        vAlpha=smoothstep(0.0,0.25,age)*(1.0-smoothstep(1.8,4.8,age))*(0.55+0.45*sin(age*3.0+position.x));}`,
      fragmentShader: `varying float vAlpha;void main(){float r=length(gl_PointCoord-0.5)*2.0;
      float alpha=(1.0-smoothstep(0.0,1.0,r))*vAlpha;if(alpha<0.01)discard;
      gl_FragColor=vec4(1.0,0.73,0.27,alpha);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
    }),
  )
  feedback.add(sparks)
  feedback.visible = false
  root.add(feedback)
  world.effects = {
    root,
    clock,
    lastFrame: 0,
    roadFlow,
    paths,
    flowOrigin,
    pathKey: 'default',
    flowStarted: null,
    mist,
    birds,
    birdStarted: 0,
    previousTime: world.state.timeOfDay,
    feedback,
    fallingLeaves,
    sparkAge,
    treeStarted: -Infinity,
    dummy,
  }
  world.scene.add(root)
}

export function triggerHeartTree(world) {
  if (!world.effects || !world.heartTree) return
  world.effects.treeStarted = world.effects.clock.value
}

// 前台累计时钟避免切回标签页时跳跃；所有效果只在现有 render 中更新。
export function updateSceneEffects(world, time) {
  const fx = world.effects
  if (!fx) return
  const delta = fx.lastFrame ? Math.max(0, Math.min(0.1, (time - fx.lastFrame) / 1000)) : 0
  fx.lastFrame = time
  fx.clock.value += delta
  const now = fx.clock.value,
    complete = world.state.entrancePhase === 'complete'
  if (world.state.entrancePhase === 'buildings' || complete) fx.flowStarted ??= now
  const route = world.state.tour ? world.tourRoute : null
  const pathKey = route ?? world.state.laneDestination?.id ?? 'default'
  if (pathKey !== fx.pathKey) {
    const paths = route
      ? [route.curve.getSpacedPoints(Math.ceil(route.length / 4)).map((p) => [p.x, p.z])]
      : world.state.laneDestination
        ? world.activeLaneSegments.map((path) => path.map((p) => getWorldPoint(p, world.origin)))
        : fx.paths
    const geometry = createRoadFlowGeometry(
      paths,
      5.2,
      pathKey === 'default' ? fx.flowOrigin : null,
    )
    fx.roadFlow.geometry.dispose()
    fx.roadFlow.geometry = geometry
    fx.pathKey = pathKey
  }
  const flowAge = now - (fx.flowStarted ?? now)
  const flowStrength =
    route || world.state.laneDestination ? 1 : Math.max(0, Math.min(1, (10 - flowAge) / 1.5))
  fx.roadFlow.visible = fx.flowStarted !== null && flowStrength > 0
  fx.roadFlow.material.uniforms.strength.value = flowStrength
  // 从铺路结束时起算，保证首道暖金流光出现在街巷起点，而不是已运行到半途。
  fx.roadFlow.material.uniforms.effectTime.value = flowAge
  fx.roadFlow.material.uniforms.speed.value =
    pathKey === 'default' ? (fx.roadFlow.geometry.userData.flowSpan + 180) / 9.5 : 48
  fx.roadFlow.material.uniforms.cycleLength.value = pathKey === 'default' ? 0 : 360
  const morning = complete && world.state.timeOfDay === 'dawn' && world.state.weather === 'sunny'
  const mistStrength = fx.mist.material.uniforms.strength
  mistStrength.value += ((morning ? 1 : 0) - mistStrength.value) * (1 - Math.exp(-delta * 2))
  fx.mist.visible = mistStrength.value > 0.005
  if (fx.previousTime !== world.state.timeOfDay) {
    fx.birdStarted = now
    fx.previousTime = world.state.timeOfDay
  }
  const birdAge = (now - fx.birdStarted) % 46
  fx.birds.visible =
    world.birdsEnabled !== false &&
    complete &&
    world.state.weather === 'sunny' &&
    ['dawn', 'day'].includes(world.state.timeOfDay) &&
    birdAge < 18
  if (fx.birds.visible) {
    for (let i = 0; i < fx.birds.count; i++) {
      const p = birdAge / 18,
        wing = i % 2 ? 1 : -1,
        rank = Math.ceil(i / 2)
      fx.dummy.position.set(
        world.minPoint[0] - 80 + p * (world.width + 160) - rank * 12,
        85 + Math.sin(p * Math.PI) * 22 + (i % 3) * 3,
        world.mapCenter.z + world.depth * 0.18 - p * world.depth * 0.35 + wing * rank * 11,
      )
      fx.dummy.rotation.set(0, Math.atan2(-(world.width + 160), world.depth * 0.35), 0)
      fx.dummy.scale.setScalar(2)
      fx.dummy.updateMatrix()
      fx.birds.setMatrixAt(i, fx.dummy.matrix)
    }
    fx.birds.instanceMatrix.needsUpdate = true
  }
  if (world.state.selected?.id !== 'heart-tree') fx.treeStarted = -Infinity
  const treeAge = now - fx.treeStarted
  fx.feedback.visible = complete && treeAge < 5
  const canopy = world.heartTree?.userData.canopy
  if (canopy)
    canopy.rotation.z = fx.feedback.visible
      ? Math.sin(treeAge * 5.5) * Math.exp(-treeAge * 0.9) * 0.035
      : 0
  if (fx.feedback.visible) {
    fx.sparkAge.value = treeAge
    for (let i = 0; i < fx.fallingLeaves.count; i++) {
      const p = Math.max(0, Math.min(1, (treeAge - (i % 6) * 0.13) / 4)),
        angle = i * 2.39996
      fx.dummy.position.set(
        Math.cos(angle) * (5 + (i % 7)) + Math.sin(p * 7 + angle) * p * 3 + p * 3,
        22 + (i % 7) - p * 18 - p * p * 10,
        Math.sin(angle) * 5 + Math.cos(p * 5 + angle) * p * 3,
      )
      fx.dummy.rotation.set(
        treeAge * 1.5 + angle,
        treeAge * 2 + angle,
        Math.sin(treeAge * 3 + angle),
      )
      fx.dummy.scale.setScalar(Math.min(1, p / 0.08, (1 - p) / 0.15) * (0.8 + (i % 3) * 0.2))
      fx.dummy.updateMatrix()
      fx.fallingLeaves.setMatrixAt(i, fx.dummy.matrix)
    }
    fx.fallingLeaves.instanceMatrix.needsUpdate = true
  }
}
