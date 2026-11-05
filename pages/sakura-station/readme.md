# 樱日小站

## 简介

樱花、乡村站台、街角便利店组成的日式微缩景观。以低多边形几何和柔和色块呈现春日小世界，可自由旋转、平移、缩放并切换五种天气。

## 封面

![樱日小站封面](./assets/cover.webp)

## 功能点

- 16×16 底座上的便利店、街道、铁路、站台及两侧樱花树。
- 店内货架、冰柜、收银台、十二种商品及透明玻璃饮料贩卖机。
- 雨伞、分类垃圾桶、长椅、路灯、站钟、电线杆及相连电线等独立道具。
- 晴日、薄云、春雨、夕照和细雪，天气过渡包含光照、背景和粒子变化。
- 可沿水平方向绕站台一周，抬高视角查看店内陈列。鼠标与触屏均可平移和连续缩放，俯仰角有限位。
- 可选 toon 色阶风格，支持通过 URL 设置天气与风格。

## 技术栈

- 原生 HTML、CSS、JavaScript ES Modules；无框架、无后端。
- 本地 Three.js 0.185.0（WebGL 2）、自定义 DioramaControls。
- 程序化几何、CanvasTexture 内容贴图、共享材质和静态阴影缓存。

## 独立运行

完整复制本作品目录，保留所有子目录。在副本中运行以下命令即可单独预览。

```powershell
python -m http.server 8000 --bind 127.0.0.1
```

用支持 WebGL 2 的浏览器打开 <http://127.0.0.1:8000/>。目录可以改名，也可整体部署到静态站点的子路径。

## 操作说明

在合集仓库根目录运行 `pnpm dev`，打开 <http://localhost:5170/sakura-station/>。

| 操作 | 效果 |
| --- | --- |
| 左键 / 单指拖动 | 环绕旋转 |
| 右键、中键、Shift 拖动 / 双指拖动 | 平移 |
| 滚轮 / 双指捏合 | 连续缩放 |
| 天气按钮 / 数字 1–5 | 晴日、薄云、春雨、夕照、细雪 |
| 点击或用 Tab 聚焦画布后，使用方向键、+ / − 或 Home | 平移、缩放或复位视角 |

## 资源目录

| 路径 | 用途 |
| --- | --- |
| index.html / readme.md | 作品入口 / 当前使用说明 |
| assets/cover.webp | 真实页面截图，首页与本 README 共用 |
| assets/main.js、style.css | 启动、加载进度、天气栏与布局 |
| assets/core/ | 渲染、几何、植物、交互、内容材质和天气 |
| assets/map/ | 世界和店内的资产装配 |
| assets/models/、models/products/ | 独立建筑、道具、植物和逐件商品模型 |
| assets/favicon.svg | 页面图标 |
| assets/vendor/three/ | 本地渲染库及完整附加依赖、MIT 许可 |

## 素材与许可

- [Three.js MIT 许可证](./assets/vendor/three/LICENSE)。
- 建筑、植物、商品、广告和包装图形由本作品代码生成，无外部模型、HDR、网络字体或 CDN。

## 数据与限制

默认使用平涂哑光材质。可用 `style=toon` 切换色阶风格，用 `weather` 指定 `sunny`、`cloudy`、`rain`、`sunset` 或 `snow`。例如打开 [春雨中的色阶小站](http://localhost:5170/sakura-station/?style=toon&weather=rain)。

天气按钮会更新当前 URL，因此复制地址即可分享同一天气和风格。相机位置只在当前页面有效，刷新会恢复初始构图。
