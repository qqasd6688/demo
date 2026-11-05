// CC0 scan inputs are decoded once in the worker, then baked into scene atlases.
export async function loadScanMaterials() {
  const files = { coral: 'coral-albedo.jpg', coralNormal: 'coral-normal.jpg', coralHeight: 'coral-height.jpg', sand: 'sand-albedo.jpg', sandNormal: 'sand-normal.jpg' };
  const result = {};
  await Promise.all(Object.entries(files).map(async ([key, file]) => {
    const response = await fetch(new URL(`./materials/${file}`, import.meta.url));
    if (!response.ok) throw new Error(`Material ${file}: HTTP ${response.status}`);
    const bitmap = await createImageBitmap(await response.blob());
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height), context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(bitmap, 0, 0); bitmap.close();
    result[key] = { data: context.getImageData(0, 0, canvas.width, canvas.height).data, width: canvas.width, height: canvas.height };
  }));
  return result;
}
export function texel(map, u, v) {
  return ((Math.floor((v - Math.floor(v)) * map.height) * map.width) + Math.floor((u - Math.floor(u)) * map.width)) * 4;
}
