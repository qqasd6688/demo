// 只缓存界面投影工作；渲染循环、游客、水面、天气与入场始终按原设计运行。
export function viewChanged(world, name, values = []) {
  world.viewCache ??= new Map();
  let previous = world.viewCache.get(name);
  const matrix = world.camera.matrixWorld.elements;
  const projection = world.camera.projectionMatrix.elements;
  const epoch = world.overlayEpoch || 0;
  let changed = !previous || previous.epoch !== epoch || previous.values.length !== values.length;
  if (!previous) {
    previous = { matrix: new Float64Array(16), projection: new Float64Array(16), values: [] };
    world.viewCache.set(name, previous);
  }
  for (let i = 0; i < 16; i++) {
    if (Math.abs(previous.matrix[i] - matrix[i]) > 1e-8 || previous.projection[i] !== projection[i]) changed = true;
    previous.matrix[i] = matrix[i];
    previous.projection[i] = projection[i];
  }
  for (let i = 0; i < values.length; i++) if (previous.values[i] !== values[i]) changed = true;
  previous.values = values;
  previous.epoch = epoch;
  return changed;
}
