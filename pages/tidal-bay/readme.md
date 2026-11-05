# 潮间海湾

## 简介

一片可添加海洋访客、调节水光与潮汐的热带浅海。透明海水、折射光、珊瑚、鱼群、海龟、鳐鱼与水母构成可交互的俯视海洋世界。

## 封面

![潮间海湾封面](./assets/cover.webp)

## 功能点

- 十种海洋访客卡片，支持点击添加或拖入水面，并点击生物互动。
- 点击水面投下涟漪，键盘也可触发水面互动。
- 调节水面反光、波浪、焦散、涟漪、鱼群数量、珊瑚丰茂与游动节奏。
- 鱼群穿境、海豚跃水和海风事件。
- 缩放近观、缓缓入海的开场、暂停 / 继续和纯观景模式。
- 本地保存参数、恢复初始设置；模块 Worker 烘焙纹理。

## 技术栈

- 原生 HTML、CSS、JavaScript ES Modules；直接使用 WebGL 2 与 GLSL，无 Three.js 或框架。
- 模块 Web Worker、OffscreenCanvas、程序化鱼体和海洋生物网格。
- 本地扫描贴图、海岸 / 珊瑚 / 焦散烘焙、自适应渲染分辨率及 MSAA。
- localStorage 保存海湾参数。

## 独立运行

完整复制本作品目录，保留所有子目录。在副本中运行以下命令即可单独预览。

```powershell
python -m http.server 8000 --bind 127.0.0.1
```

用支持 WebGL 2、模块 Worker 和 OffscreenCanvas 的浏览器打开 <http://127.0.0.1:8000/>。目录可以改名，也可整体部署到静态站点的子路径。

## 操作说明

在合集仓库根目录运行 `pnpm dev`，打开 <http://localhost:5170/tidal-bay/>。

| 操作 | 效果 |
| --- | --- |
| 点击或轻触水面，或聚焦画布后按 Enter | 在点击位置或键盘预设位置投下涟漪 |
| 生物卡片点击或拖入海水 | 添加海洋访客 |
| 滚轮，或聚焦画布后按 + / −、0 | 在 1 至 1.9 倍间缩放，按 0 恢复全景 |
| 参数面板与事件按钮 | 调节海湾，触发鱼群、海豚或海风 |
| 空格 / 暂停按钮 | 暂停或继续 |
| 重播开场 / 恢复初始 | 重看入海镜头，或重置参数、鱼群、访客及缩放 |
| 纯观景 / Esc | 隐藏或恢复界面，按 Esc 退出纯观景并收起参数面板 |

## 资源目录

| 路径 | 用途 |
| --- | --- |
| index.html / readme.md | 作品入口 / 当前使用说明 |
| assets/cover.webp | 真实页面截图，首页与本 README 共用 |
| assets/main.js、style.css、interface.js、settings.js | WebGL 启动、卡片、参数界面与存储 |
| assets/coast.js、bake-worker.js、reef.js、waves.js | 海岸、珊瑚和折射光场烘焙 |
| assets/geometry.js、skin.js、ecosystem.js | 鱼体、植物与海洋访客网格 |
| assets/shaders.js、marine-shaders.js、marine-materials.js、lighting.js | 水体、鱼皮和海洋生物材质、统一照明 |
| assets/materials.js、materials/ | 五张本地扫描贴图与来源校验记录 |
| assets/simulation.js | 相机、涟漪和渲染分辨率控制 |

## 素材与许可

- 五张扫描贴图来自 Poly Haven 的 Coral Ground 02 与 Coast Sand 01，记录为 Rob Tuytel 的 CC0 作品；见 [素材许可](./assets/materials/LICENSE.md) 与 [来源清单](./assets/materials/sources.json)。
- 生物、珊瑚形态、海岸、粒子、水体和光场逻辑由本作品代码生成；珊瑚扫描用于表面微纹理，不是完整珊瑚模型。

## 数据与限制

启动时 Worker 用本地贴图烘焙海岸和珊瑚，初始化时间取决于设备。相机采用俯视缩放，游动路线与水光为视觉模拟。

参数面板的七个数值和开场开关使用 `tidal-bay:ecosystem:v3` 自动保存在当前来源。手动添加的访客、暂停状态与镜头缩放只对本次游览有效。浏览器限制存储时，调整仍会在本次生效。
