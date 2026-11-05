import { Vector3 } from '../vendor/three/build/three.module.min.js'
import { getWorldPoint, getMiniMapViewSector } from './geometry.js'
import { viewChanged } from './view-cache.js'

// 渲染器拥有地名投影与小地图，界面字段继续由原生 UI 层管理。
export function buildLabels(world) {
  for (const p of [...world.allPlaces, ...world.data.lanes]) {
    const selectable =
      p.kind === 'landmark' ||
      Number.isInteger(p.buildingIndex) ||
      Boolean(world.siteBuildings.get(p.id)?.length)
    const button = document.createElement(selectable ? 'button' : 'span')
    if (selectable) button.type = 'button'
    button.className = `map-label${p.category === '坊巷' ? ' lane-label' : ''}`
    if (selectable) button.dataset.id = p.id
    else button.style.pointerEvents = 'none'
    button.setAttribute(
      'aria-label',
      selectable ? (p.kind === 'landmark' ? `选择${p.name}` : `选择${p.name}对应建筑`) : p.name,
    )
    if (p.category !== '坊巷' && p.number) {
      const number = document.createElement('b')
      number.textContent = p.number
      button.append(number)
    }
    button.append(document.createTextNode(p.name))
    world.labelLayer.append(button)
    const [x, z] = getWorldPoint(p.position, world.origin)
    world.labels.push({
      place: p,
      element: button,
      // 坊巷贴近道路中心；景点卡片才需要悬在建筑上方。
      position: new Vector3(x, p.category === '坊巷' ? 0.15 : (p.labelHeight ?? 15), z),
      width: button.offsetWidth,
      height: button.offsetHeight,
    })
  }
}

export function updateLabels(world, time = 0) {
  if (world.labelEntrancePhase !== world.state.entrancePhase) {
    world.labelEntrancePhase = world.state.entrancePhase
    world.labelLayoutUntil = time + 950
  }
  const changed = viewChanged(world, 'labels', [world.state.selected?.id,
    world.state.laneDestination?.id, world.state.labels, world.state.driving,
    world.state.filter, world.state.entrancePhase])
  if (!changed && time > (world.labelLayoutUntil || 0)) return
  const w = world.stage.clientWidth,
    h = world.stage.clientHeight,
    distance = world.camera.position.distanceTo(world.controls.target)
  const stageRect = world.stage.getBoundingClientRect()
  const scaleX = w / stageRect.width
  const scaleY = h / stageRect.height
  const occupied = [world.miniPanel, world.environmentControls].filter(Boolean).map((element) => {
    const rect = element.getBoundingClientRect()
    return {
      left: (rect.left - stageRect.left) * scaleX - 5,
      right: (rect.right - stageRect.left) * scaleX + 5,
      top: (rect.top - stageRect.top) * scaleY - 5,
      bottom: (rect.bottom - stageRect.top) * scaleY + 5,
    }
  })
  const ordered = world.labels.slice().sort((a, b) => {
    const priority = (item) =>
      item.place.id === world.state.selected?.id
        ? 100
        : item.place.featured
          ? 30
          : item.place.category === '坊巷'
            ? 3
            : 10
    return priority(b) - priority(a)
  })
  for (const label of ordered) {
    const selected =
        label.place.id === (world.state.selected?.id ?? world.state.laneDestination?.id),
      p = label.place
    if (label.selected !== selected) {
      label.element.setAttribute('aria-pressed', String(selected))
      label.selected = selected
    }
    if (
      world.state.driving ||
      !world.state.labels ||
      // 坊巷名称是基础地名，不跟随左侧的景点分类筛选隐藏。
      (!selected &&
        p.category !== '坊巷' &&
        world.state.filter !== '全部' &&
        p.category !== world.state.filter) ||
      (!selected && distance > 900 && !p.featured && p.category !== '坊巷')
    ) {
      if (!label.element.hidden) label.element.hidden = true
      continue
    }
    world.scratch.copy(label.position).project(world.camera)
    const lane = p.category === '坊巷'
    const x = (world.scratch.x * 0.5 + 0.5) * w,
      y = (-world.scratch.y * 0.5 + 0.5) * h - (lane ? 0 : 15)
    // 道路名称以自身中心对齐投影点，不能复用景点卡片的向上偏移。
    // 使用整数位置，避免缩放停下后小字仍落在半像素上产生发虚。
    const laneLeft = Math.round(x - label.width / 2)
    const laneTop = Math.round(y - label.height / 2)
    const rect = {
      left: lane ? laneLeft - 5 : x - label.width / 2 - 5,
      right: lane ? laneLeft + label.width + 5 : x + label.width / 2 + 5,
      top: lane ? laneTop - 5 : y - label.height - 6,
      bottom: lane ? laneTop + label.height + 5 : y + 20,
    }
    const outside =
      world.scratch.z < -1 || world.scratch.z > 1 || x < 35 || x > w - 70 || y < 30 || y > h - 20
    const covered =
      (!selected && x < 250 && y < 115) ||
      occupied.some(
        (r) =>
          rect.left < r.right && rect.right > r.left && rect.top < r.bottom && rect.bottom > r.top,
      )
    if (label.element.hidden !== (outside || covered)) label.element.hidden = outside || covered
    if (label.element.hidden) continue
    const transform = lane
      ? `translate(${laneLeft}px,${laneTop}px)`
      : `translate(${x.toFixed(1)}px,${y.toFixed(1)}px) translate(-50%,-100%)`
    if (label.transform !== transform) {
      label.element.style.transform = transform
      label.transform = transform
    }
    occupied.push(rect)
  }
}

// 小地图底图只画一次；视角扇形与当前街巷以约 30 fps 叠加。
export function buildMiniMap(world) {
  world.miniBase = document.createElement('canvas')
  world.miniBase.width = 380
  world.miniBase.height = 280
  const ctx = world.miniBase.getContext('2d'),
    { scale, x, y } = world.miniTransform
  ctx.fillStyle = world.palette?.ground ?? '#eeebe3'
  ctx.fillRect(0, 0, 380, 280)
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(scale, scale)
  ctx.translate(-world.mapCenter.x, -world.mapCenter.z)
  ctx.fillStyle = world.palette?.wall ?? '#afb1a9'
  for (const building of world.projectedBuildings) {
    ctx.beginPath()
    for (const ring of [building.ring, ...building.holes]) {
      ring.forEach(([px, pz], i) => (i ? ctx.lineTo(px, pz) : ctx.moveTo(px, pz)))
      ctx.closePath()
    }
    ctx.fill('evenodd')
  }
  ctx.strokeStyle = world.palette?.road ?? '#e0dcd2'
  ctx.lineWidth = 4
  for (const road of world.data.roads) {
    ctx.beginPath()
    road.points.forEach((p, i) => {
      const [px, pz] = getWorldPoint(p, world.origin)
      if (i) ctx.lineTo(px, pz)
      else ctx.moveTo(px, pz)
    })
    ctx.stroke()
  }
  ctx.restore()
}

export function drawMiniMap(world, time) {
  if (!world.miniBase || time - world.miniFrame < 32) return
  if (!viewChanged(world, 'minimap', [world.state.selected?.id, world.state.laneDestination?.id,
    world.state.tour, world.state.tourIndex, world.controls.target.x,
    world.controls.target.y, world.controls.target.z])) return
  world.miniFrame = time
  const ctx = world.miniCanvas.getContext('2d'),
    { scale, x, y } = world.miniTransform
  const project = ([px, pz]) => [
    x + (px - world.mapCenter.x) * scale,
    y + (pz - world.mapCenter.z) * scale,
  ]
  ctx.drawImage(world.miniBase, 0, 0)
  if (world.state.tour && world.tourRoute) {
    ctx.save()
    ctx.beginPath()
    world.tourRoute.points.forEach((point, index) => {
      const [px, py] = project([point.x, point.z])
      if (index) ctx.lineTo(px, py)
      else ctx.moveTo(px, py)
    })
    ctx.strokeStyle = '#ad4939'
    ctx.lineWidth = 2.8
    ctx.setLineDash([5, 4])
    ctx.stroke()
    ctx.restore()
  }
  if (world.state.laneDestination) {
    ctx.strokeStyle = '#ce6337'
    ctx.lineWidth = 5
    for (const segment of world.activeLaneSegments) {
      ctx.beginPath()
      segment.forEach((p, i) => {
        const [px, py] = project(getWorldPoint(p, world.origin))
        if (i) ctx.lineTo(px, py)
        else ctx.moveTo(px, py)
      })
      ctx.stroke()
    }
  }
  world.tourIds.forEach((id, i) => {
    const place = world.placesById.get(id)
    if (place.kind === 'landmark') return
    const [px, py] = project(getWorldPoint(place.position, world.origin))
    ctx.beginPath()
    ctx.arc(px, py, 8, 0, Math.PI * 2)
    ctx.fillStyle =
      world.state.selected?.id === id || (world.state.tour && i === world.state.tourIndex)
        ? '#a44637'
        : '#454b49'
    ctx.fill()
    ctx.fillStyle = '#ffffff'
    ctx.font = '10px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(String(Number(place.number)), px, py)
  })
  for (const landmark of world.landmarks) {
    const [px, py] = project(getWorldPoint(landmark.position, world.origin))
    ctx.save()
    ctx.translate(px, py)
    ctx.beginPath()
    ctx.moveTo(0, 5)
    ctx.bezierCurveTo(-10, -1, -5, -9, 0, -4)
    ctx.bezierCurveTo(5, -9, 10, -1, 0, 5)
    ctx.fillStyle = world.state.selected?.id === landmark.id ? '#a44637' : '#47713b'
    ctx.fill()
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 1.3
    ctx.stroke()
    ctx.restore()
  }
  const [px, py] = project([world.controls.target.x, world.controls.target.z])
  const radius = Math.max(
    10,
    Math.min(80, world.camera.position.distanceTo(world.controls.target) * scale * 0.32),
  )
  const sector = getMiniMapViewSector(
    world.camera.position.toArray(),
    world.controls.target.toArray(),
    world.camera.fov,
    world.camera.aspect,
  )
  ctx.save()
  // 以观察中心为扇形尖端，外圈表示缩放范围；无需额外的中心小圆点。
  const gradient = ctx.createRadialGradient(px, py, 0, px, py, radius)
  gradient.addColorStop(0, 'rgba(172,73,54,.10)')
  gradient.addColorStop(1, 'rgba(172,73,54,.32)')
  ctx.beginPath()
  ctx.moveTo(px, py)
  ctx.arc(px, py, radius, sector.start, sector.end)
  ctx.closePath()
  ctx.fillStyle = gradient
  ctx.fill()
  ctx.strokeStyle = '#ac4936cc'
  ctx.lineWidth = 2
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(px, py, radius, 0, Math.PI * 2)
  ctx.strokeStyle = '#655c4c80'
  ctx.lineWidth = 1.5
  ctx.stroke()
  ctx.restore()
}

export function updateCompass(world) {
  if (!viewChanged(world, 'compass', [world.controls.target.x, world.controls.target.y, world.controls.target.z])) return
  world.compassPoints ??= [new Vector3(), new Vector3()]
  const center = world.compassPoints[0].copy(world.controls.target).project(world.camera),
    north = world.compassPoints[1].copy(world.controls.target)
  north.z -= 50
  north.project(world.camera)
  const angle =
    (Math.atan2((north.x - center.x) * world.camera.aspect, north.y - center.y) * 180) / Math.PI
  world.state.compassAngle = angle.toFixed(1)
}
