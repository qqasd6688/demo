# 数字展厅素材

| 本地文件 | 来源与用途 |
| --- | --- |
| [starfield.webp](./starfield.webp) | 为展厅生成的 1774 × 887 星空背景。页面预加载位图，星点闪烁、流星和上升光线由程序单独绘制。 |
| [world-land.json](./world-land.json) | Natural Earth 1:110m 陆地轮廓的 GeoJSON 快照，包含 127 个多边形要素。场景读取经纬度，先在 Canvas 绘制陆地边线和点阵，再贴到地球表面。 |

Natural Earth 数据属于公有领域。两项素材均从本目录加载，独立托管时需一并复制。[原始陆地数据](https://github.com/nvkelso/natural-earth-vector/blob/master/geojson/ne_110m_land.geojson) · [展厅场景](../scene.js)
