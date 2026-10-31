# 数字展厅

## 简介

从原合集入口迁移而来的独立三维视觉实验。星空、发光地球、镜面台座和六个空白展位构成可拖拽环绕的数字展厅；展位不显示作品内容，也不承担其他作品的导航。

## 封面

![数字展厅封面](./assets/cover.webp)

## 功能点

- 星空、地球点阵轮廓、环形光带、粒子与镜面反射。
- 地球与六个展位依次入场，随后自动环绕。
- 左右拖拽调整环绕位置，支持用户主动暂停和继续动效。
- 六张卡片内容为空，没有封面、文字或作品跳转。
- 窄屏显示地球与两列空白展位；WebGL 不可用时保留静态展示。

## 技术栈

- 原生 HTML、CSS、JavaScript ES Modules；无框架、无后端。
- 本地 Three.js 0.185.0（WebGL 2）、Reflector、EffectComposer、辉光及 FXAA。
- 本地星空位图、Natural Earth 陆地轮廓和程序化面板 / 台座。

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
| 左右拖拽画面 | 改变展位环绕位置 |
| 暂停动效 / 继续动效 | 暂停或恢复场景动画 |

## 资源目录

| 路径 | 用途 |
| --- | --- |
| index.html / readme.md | 作品入口 / 当前使用说明 |
| assets/cover.webp | 真实页面截图，首页与本 README 共用 |
| assets/main.js、entrance.css | 启动、拖拽、暂停控件和响应式布局 |
| assets/scene.js、motion.js | 三维场景、镜面、入场及轨道计算 |
| assets/card-content.js | 为空白展位提供透明内容图层 |
| assets/images/starfield.webp | 本地星空背景 |
| assets/images/world-land.json | 本地陆地轮廓快照 |
| assets/vendor/three/ | 本地渲染库及完整附加依赖、MIT 许可 |

## 素材与许可

- [Three.js MIT 许可证](./assets/vendor/three/LICENSE)；[本地依赖说明](./assets/vendor/README.md)。
- Natural Earth 陆地轮廓为本地快照，仅用于装饰地球，素材记录见 [图片来源](./assets/images/README.md)。星空为原展厅生成素材。

## 数据与限制

没有作品数据、账户、远程接口或持久化存储。静态降级画面不包含三维环绕；手机采用两列空白面板以适配窄屏。

## 在合集仓库中开发

在仓库根目录运行 `pnpm dev`，访问 <http://localhost:5170/interactive-gallery/>；发布前运行 `pnpm build`。这些是合集维护命令，独立运行本作品不需要仓库根目录、其他作品或首页资源。封面、标题、简介发生变化时，手动同步合集入口 `site/index.html`。
