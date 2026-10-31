// 空白展位只保留透明图层，面板、流光和边框继续由三维场景绘制。
export function createCardContent() {
  const canvas = document.createElement('canvas');
  canvas.width = 960;
  canvas.height = 1428;
  return canvas;
}