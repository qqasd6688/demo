import { writeFile } from 'node:fs/promises';
import { layouts } from '../assets/layouts.js';
import { floorPlanSvg } from '../assets/floorplan.js';
for (const layout of layouts) {
  const svg=floorPlanSvg(layout);
  await writeFile(new URL(`../assets/plans/${layout.id}.svg`,import.meta.url),svg);
  if (layout.id==='family') await writeFile(new URL('../assets/floor-plan.svg',import.meta.url),svg);
}
console.log('已更新 3 套户型 SVG 与旧版 120㎡链接。');
