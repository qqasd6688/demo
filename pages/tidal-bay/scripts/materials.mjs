// Reproducible, opt-in acquisition of the CC0 scan inputs used by the bay worker.
// Run from the work directory: node scripts/materials.mjs
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const root = new URL('../assets/materials/', import.meta.url);
await mkdir(root, { recursive: true });
const requests = [
  ['coral_ground_02', 'Diffuse', '2k', 'coral-albedo.jpg'],
  ['coral_ground_02', 'nor_gl', '1k', 'coral-normal.jpg'],
  ['coral_ground_02', 'Displacement', '1k', 'coral-height.jpg'],
  ['coast_sand_01', 'Diffuse', '1k', 'sand-albedo.jpg'],
  ['coast_sand_01', 'nor_gl', '1k', 'sand-normal.jpg'],
];
const cache = new Map(), manifest = [];
for (const [asset, map, size, file] of requests) {
  if (!cache.has(asset)) {
    const response = await fetch(`https://api.polyhaven.com/files/${asset}`);
    if (!response.ok) throw new Error(`Asset API ${response.status}`);
    cache.set(asset, await response.json());
  }
  const maps = cache.get(asset), key = Object.keys(maps).find(k => k.toLowerCase() === map.toLowerCase());
  const source = maps[key]?.[size]?.jpg;
  if (!source) throw new Error(`Missing ${asset}/${map}/${size}`);
  let bytes; try { bytes = await readFile(new URL(file, root)); } catch {}
  if (!bytes || createHash('md5').update(bytes).digest('hex') !== source.md5) {
    const response = await fetch(source.url);
    if (!response.ok) throw new Error(`Download ${response.status}: ${file}`);
    bytes = Buffer.from(await response.arrayBuffer());
  }
  if (createHash('md5').update(bytes).digest('hex') !== source.md5) throw new Error(`Checksum mismatch: ${file}`);
  await writeFile(new URL(file, root), bytes);
  manifest.push({ file, asset, map: key, size, bytes: bytes.length, source: source.url, page: `https://polyhaven.com/a/${asset}`, author: 'Rob Tuytel', license: 'CC0-1.0', md5: source.md5 });
  console.log(`${file}: ${Math.round(bytes.length / 1024)} KiB`);
}
await writeFile(new URL('sources.json', root), JSON.stringify(manifest, null, 2) + '\n');
