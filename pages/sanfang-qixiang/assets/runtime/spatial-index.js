// 固定街灯仅影响 24 米内的表面。查询相邻网格，保持原光照公式与结果不变。
export function createLampIndex(lamps, radius = 24) {
  const cells = new Map();
  const neighbors = new Map();
  const key = (x, z) => `${x},${z}`;
  for (const lamp of lamps) {
    const cell = key(Math.floor(lamp.x / radius), Math.floor(lamp.z / radius));
    if (!cells.has(cell)) cells.set(cell, []);
    cells.get(cell).push(lamp);
  }
  return {
    count: lamps.length,
    query(x, z) {
      const cx = Math.floor(x / radius), cz = Math.floor(z / radius);
      const cell = key(cx, cz);
      if (!neighbors.has(cell)) {
        const nearby = [];
        for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
          nearby.push(...(cells.get(key(cx + dx, cz + dz)) || []));
        }
        neighbors.set(cell, nearby);
      }
      return neighbors.get(cell);
    },
  };
}
