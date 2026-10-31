// 诊断仅由 ?renderStats=1 开启；正常页面不显示实现参数。
export function createRenderBudget(world) {
  const params = new URLSearchParams(location.search)
  const budget = {
    last: 0, samples: [], cpu: [], calls: [], triangles: [], reportAt: 0,
    scale: 1, lastChange: 0, slow: 0, fast: 0,
    adaptive: params.get('quality') !== 'native',
  }
  if (params.has('renderStats')) {
    const panel = document.createElement('output')
    panel.id = 'render-stats'
    panel.setAttribute('aria-label', '渲染诊断')
    panel.style.cssText = 'position:absolute;right:76px;bottom:12px;z-index:20;max-width:calc(100% - 110px);padding:9px 12px;background:#102b35e8;color:#dbf4e9;border:1px solid #8ba89a66;border-radius:8px;font:11px/1.65 monospace;white-space:pre-wrap;pointer-events:none'
    world.stage.append(panel)
    budget.panel = panel
  }
  world.renderer.info.autoReset = false
  world.renderBudget = budget
}

// 连续两轮过载才降低；连续六轮充裕才恢复。每轮至少两秒，避免显存重分配抖动。
// CPU 已过载时降分辨率没有帮助；后台恢复、入场和偶发长任务不作为降级依据。
export function chooseRenderScale(budget, frameMs, cpuMs, time) {
  if (!budget.adaptive || !Number.isFinite(frameMs) || !Number.isFinite(cpuMs)) return budget.scale
  // 30Hz 显示器、顶点/CPU 瓶颈等不会因减少像素而提速：试降无收益则恢复清晰度。
  if (budget.trial && time - budget.lastChange >= 6000) {
    const trial = budget.trial
    budget.trial = null
    if (frameMs > 20 && frameMs > trial.frameMs * .97) {
      budget.scale = trial.scale
      budget.lastChange = time
      budget.blockedUntil = time + 30000
      budget.slow = budget.fast = 0
      return budget.scale
    }
  }
  if (time < (budget.blockedUntil ?? 0)) return budget.scale
  budget.slow = frameMs > 20 && cpuMs < 13 ? budget.slow + 1 : 0
  budget.fast = frameMs < 17.5 && cpuMs < 10 ? budget.fast + 1 : 0
  if (time - budget.lastChange < 6000) return budget.scale
  const next = budget.slow >= 2 ? Math.max(0.7, budget.scale - 0.1)
    : budget.fast >= 6 ? Math.min(1, budget.scale + 0.05) : budget.scale
  if (Math.abs(next - budget.scale) > 0.001) {
    budget.trial = next < budget.scale ? { frameMs, scale: budget.scale } : null
    budget.scale = Math.round(next * 100) / 100
    budget.lastChange = time
    budget.slow = budget.fast = 0
  }
  return budget.scale
}

export function resizeRenderBuffer(world, width, height) {
  const ratio = Math.min(window.devicePixelRatio || 1, 1.8, Math.sqrt(3000000 / (width * height)))
    * (world.renderBudget?.scale ?? 1)
  // setPixelRatio 内部已经调整 drawing buffer；只在确实变化时调用。
  if (Math.abs(world.renderer.getPixelRatio() - ratio) > 0.001) world.renderer.setPixelRatio(ratio)
  world.renderer.setSize(width, height, false)
}

export function beginRenderFrame(world, time) {
  const budget = world.renderBudget
  if (!budget) return
  budget.started = performance.now()
  const dt = time - budget.last
  budget.last = time
  if (dt > 0 && dt < 250 && world.state.entrancePhase === 'complete') budget.samples.push(dt)
  world.renderer.info.reset()
}

export function endRenderFrame(world, time) {
  const budget = world.renderBudget
  if (!budget) return
  budget.cpu.push(performance.now() - budget.started)
  budget.calls.push(world.renderer.info.render.calls)
  budget.triangles.push(world.renderer.info.render.triangles)
  if (time - budget.reportAt < 2000) return
  budget.reportAt = time
  const average = (values) => values.reduce((a, b) => a + b, 0) / Math.max(1, values.length)
  const frames = budget.samples.sort((a, b) => a - b)
  if (frames.length > 15) {
    const previousScale = budget.scale
    const median = frames[Math.floor(frames.length * 0.5)]
    chooseRenderScale(budget, median, average(budget.cpu), time)
    if (previousScale !== budget.scale) resizeRenderBuffer(world, world.stage.clientWidth, world.stage.clientHeight)
    const result = {
      fps: +(1000 / average(frames)).toFixed(1),
      p95: +frames[Math.floor(frames.length * 0.95)].toFixed(1),
      cpu: +average(budget.cpu).toFixed(2),
      calls: Math.round(average(budget.calls)),
      triangles: Math.round(average(budget.triangles)),
      scale: budget.scale,
      buffer: `${world.canvas.width}×${world.canvas.height}`,
      vegetationNear: world.vegetation?.near.count ?? 0,
      vegetationFar: world.vegetation?.far.count ?? 0,
      shadowTexel: +((world.sun.shadow.camera.right - world.sun.shadow.camera.left) / world.sun.shadow.mapSize.x).toFixed(3),
    }
    if (budget.panel) {
      budget.panel.textContent = `${result.fps} fps · P95 ${result.p95} ms · CPU ${result.cpu} ms\n${result.calls} draws · ${result.triangles.toLocaleString()} triangles\n${result.buffer} · scale ${result.scale.toFixed(2)}\ntrees ${result.vegetationNear}/${result.vegetationFar} · shadow ${result.shadowTexel} m/texel`
      budget.panel.dataset.metrics = JSON.stringify(result)
    }
  }
  budget.samples.length = budget.cpu.length = budget.calls.length = budget.triangles.length = 0
}
