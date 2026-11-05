# 微境 MICROCOSM

## 简介

一方可以近看雪峰、森林和湖泊的悬浮生态岛。围绕微缩山海旋转观察，切换全景与局部镜头，看昼夜、云雾和自然细节缓慢变化。

## 封面

![微境 MICROCOSM封面](./assets/cover.webp)

## 功能点

- 积雪岩脊、针叶林、菌菇、倒木、树根、睡莲与微型动物。
- 全景、雪峰、林间和湖畔四个观察预设，自由旋转、缩放与复位。
- 常速约四分钟走完一昼夜。时间滑块提供星夜、晨曦、日光、暮色和子夜五个入口，星夜与子夜对应同一午夜。
- 暂停时间、切换云雾、自动环绕与纯观景模式。
- 本地 PBR 贴图、水面倒影、环境遮蔽、MSAA 与 FXAA 抗锯齿。

## 技术栈

- 原生 HTML、CSS、JavaScript ES Modules；无框架、无后端。
- 本地 Three.js 0.185.0（WebGL 2）、OrbitControls、程序地形和植被几何。
- 本地 Poly Haven PBR 贴图、自定义环境遮蔽和水面倒影。

## 独立运行

完整复制本作品目录，保留所有子目录。在副本中运行以下命令即可单独预览。

```powershell
python -m http.server 8000 --bind 127.0.0.1
```

用支持 WebGL 2 的浏览器打开 <http://127.0.0.1:8000/>。目录可以改名，也可整体部署到静态站点的子路径。

## 操作说明

在合集仓库根目录运行 `pnpm dev`，打开 <http://localhost:5170/microcosm/>。

| 操作 | 效果 |
| --- | --- |
| 拖动 / 滚轮 / 双指缩放 | 旋转并调整观察距离 |
| 全景 / 雪峰 / 林间 / 湖畔 | 切换观察位置 |
| 时间滑块与昼夜预设 | 调整岛屿的日光与夜色 |
| 暂停时间 / 云雾 / 环绕 | 控制时间、氛围和相机 |
| 画布获得焦点后使用方向键、+ / −、Home | 旋转、缩放或恢复默认视角 |
| 画布获得焦点后按空格 | 暂停或继续世界时间、生态动画和自动环绕，暂停后仍可手动旋转 |
| 沉浸 / Esc | 隐藏界面观景，按 Esc 或点「退出观景」恢复 |

## 资源目录

| 路径 | 用途 |
| --- | --- |
| index.html / readme.md | 作品入口 / 当前使用说明 |
| assets/cover.webp | 真实页面截图，首页与本 README 共用 |
| assets/main.js、style.css | 页面控制、时间状态与响应式界面 |
| assets/world.js、landscape.js、forest.js、understory.js | 地形、植被、林下生态和镜头 |
| assets/materials.js、textures/ | 本地岩石 / 树皮贴图及加载逻辑 |
| assets/occlusion.js | 环境遮蔽与抗锯齿处理 |
| assets/favicon.svg | 页面图标 |
| assets/vendor/three/ | 本地渲染库及完整附加依赖、MIT 许可 |

## 素材与许可

- [Three.js MIT 许可证](./assets/vendor/three/LICENSE)。
- 岩石、树皮的 Diffuse / Normal / ARM 贴图来自 Poly Haven，按 CC0 保存；详见 [材质来源说明](./assets/textures/README.md)。
- 地形、树木、生态细节、云雾和标识由程序生成，不需要运行时下载模型。

## 数据与限制

岛屿地貌、植被分布和动物活动均由程序生成。重新加载会回到 09:00 的初始视角。如需断网观景，可用本地静态服务器提供整个作品目录，包括两组扫描贴图。
