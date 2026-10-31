# 栖居 HABITAT

## 简介

可以布置家具、替换材质并控制灯光家电的三维住宅。切换三套概念户型，自由观察空间，并让家具布局与设备状态在浏览器中分别保存。

## 封面

![栖居 HABITAT封面](./assets/cover.webp)

## 功能点

- 85㎡、120㎡、220㎡三套住宅与对应的房间导航、家电清单和二维户型图。
- 逐个控制照明、空调、电视、窗帘等设备，并应用四种生活场景。
- 移动、旋转家具，替换预设材质；提供精确输入、吸附和撤销 / 重做。
- 三维与俯视切换、自动隐藏遮挡墙体、设备标记、全屏看房和手机控制抽屉。
- 按户型分别保存设备及家具编辑状态，支持恢复默认布局。

## 技术栈

- 原生 HTML、CSS、JavaScript ES Modules；无框架、无后端。
- 本地 Three.js 0.185.0（WebGL 2）、OrbitControls、GLTFLoader、HDRLoader。
- 本地 PBR 贴图、glTF 家具、HDR 环境、GTAO / 辉光后处理及 SVG 户型图。
- localStorage 保存户型选择、设备状态和家具编辑结果。

## 独立运行

完整复制本作品目录，在复制后的目录中打开终端，运行：

```powershell
python -m http.server 8000 --bind 127.0.0.1
```

访问 <http://127.0.0.1:8000/>。也可交给其他静态 HTTP / HTTPS 服务托管；无需安装本仓库的 pnpm 依赖、执行构建或启动后端。运行文件都在当前目录，目录可以改名，支持部署在站点子路径。

页面使用 ES 模块和本地资源加载，请通过 HTTP / HTTPS 访问，不直接双击 HTML。使用支持 WebGL 2 的现代浏览器。

## 操作说明

| 操作 | 效果 |
| --- | --- |
| 左键 / 单指拖动；滚轮 / 双指捏合 | 旋转、缩放；右键 / 双指拖动平移 |
| 点击房间、设备或设备标记 | 聚焦房间或打开独立控制面板 |
| 编辑空间 | 拖动家具，使用圆环或输入框旋转、调整位置与材质 |
| 编辑时方向键；Q / E；Shift | 移动 10cm、旋转 15°；Shift 切换至 1cm / 1° |
| Ctrl+Z / Ctrl+Shift+Z | 撤销 / 重做家具编辑；macOS 使用对应 Command 组合键 |
| Home / Esc | 复位视角 / 退出全屏或取消未完成编辑 |

## 资源目录

| 路径 | 用途 |
| --- | --- |
| index.html / readme.md | 作品入口 / 当前使用说明 |
| assets/cover.webp | 真实页面截图，首页与本 README 共用 |
| assets/main.js、style.css、editor.css | 界面、户型选择和手机控制抽屉 |
| assets/layouts.js、state.js、design-state.js | 户型、设备、编辑状态与持久化 |
| assets/editor.js、editor-ui.js、furniture.js | 家具拾取、拖拽、材质替换和编辑界面 |
| assets/world.js、model.js、furnishings.js、rendering.js | 三维建筑、家具装配、相机与后处理 |
| assets/materials/、models/ | PBR / HDR、扶手椅 glTF、二进制和贴图及来源记录 |
| assets/plans/、floorplan.js | 三套二维户型图和绘制逻辑 |
| assets/vendor/three/ | 本地渲染库及完整附加依赖、MIT 许可 |

## 素材与许可

- [Three.js MIT 许可证](./assets/vendor/three/LICENSE)。所需核心、加载器和后处理模块均已包含。
- 木作、织物与环境素材来自 Poly Haven，石材来自 ambientCG，素材记录为 CC0；见 [材质来源清单](./assets/materials/attribution.json)。
- 扶手椅 glTF、二进制与贴图均在本目录，见 [模型来源与许可](./assets/models/lounge-chair/attribution.json)。其余建筑和家具由程序生成。

## 数据与限制

户型是概念设计，不是实测住宅或施工图；设备数据是浏览器内模拟，未接入真实家电。家具限制在户型外轮廓内，但没有内墙 / 家具碰撞避让，二维 SVG 不包含编辑后的家具位置。保存键以 habitat- 开头，各户型与编辑状态独立；清除当前站点存储会重置保存内容。离线使用需保持本地 HTTP 服务可用，没有 Service Worker 离线重载保证。

## 在合集仓库中开发

在仓库根目录运行 `pnpm dev`，访问 <http://localhost:5170/habitat/>；发布前运行 `pnpm build`。这些是合集维护命令，独立运行本作品不需要仓库根目录、其他作品或首页资源。封面、标题、简介发生变化时，手动同步合集入口 `site/index.html`。
