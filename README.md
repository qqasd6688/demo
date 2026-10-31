# Vibe Pages

每个想法一个目录，存放独立的 HTML、CSS、JavaScript 和资源，通过 GitHub Pages 统一发布。

## 目录结构

```text
pages/                      # 每个作品一个文件夹
  interactive-gallery/      # 从原首页迁移的三维数字展厅
    index.html
    assets/                 # 独立的场景、图片、样式和本地 Three.js
  my-page/
    index.html              # 页面入口（必需）
    readme.md               # 标题、简介、功能点、技术栈、封面与操作说明
    tests/                  # 作品专属测试（需要时，不发布）
    scripts/                # 作品专属资源工具（需要时，不发布）
    assets/                 # 页面自己的样式、脚本、图片等
      cover.webp            # 新作品的真实截图封面，供首页直接引用
site/index.html             # 手动维护的浅色作品集首页
site/assets/                # 首页的原生 JS、CSS、图标；封面保存在各作品内
site/tests/                 # 首页测试
templates/basic/            # 可复制的页面模板
scripts/build.mjs           # 复制首页与页面资源到 dist/
vite.config.mjs             # 源码 URL 映射与 Vite 原生开发服务
pnpm-lock.yaml              # pnpm 依赖锁文件
.github/workflows/pages.yml # GitHub Pages 自动部署
dist/                       # 构建产物，不提交到仓库
```

## 新建页面

在仓库根目录执行（PowerShell）：

```powershell
Copy-Item -Path templates/basic -Destination pages/my-page -Recurse
```

将 `my-page` 换成小写英文、数字和短横线组成的目录名，例如 `coffee-landing`、`pomodoro`。也可以直接创建作品目录。每个新作品都必须包含 `index.html`、`readme.md` 和自己的封面图；模板只提供页面起点，交付前仍需补齐说明和真实截图。完整规范及 README 最小结构见 [AGENTS.md](./AGENTS.md)。

新增、修改或删除作品时，**同步手动编辑 `site/index.html`**：

- 标题：卡片中的 `<h3>`，保持唯一的标题 ID 和 `aria-labelledby`。
- 简介：卡片中可见的 `<p>`，保持对应的 `aria-describedby`。
- 地址：链接 `href` 和卡片 `data-href`，例如 `./my-page/`；使用 `target="_blank"` 和 `rel="noopener noreferrer"` 在新页签打开。
- 截图：图片 `src` 和卡片 `data-cover`，新作品直接引用 `./my-page/assets/cover.webp`。
- 分类：`data-category` 使用 `nature`、`space`、`system` 或 `visual`；`data-keywords` 补充搜索词。
- 数量：作品标题旁、全部作品按钮、结果提示及介绍区中的数量。

首页是完整静态 HTML，不读取 `page.json`，不自动扫描 `pages/`、生成导航或监听元数据。构建原样复制首页。卡片不分组、不补占位，点击作品在新页签打开，入口页保持原有筛选与浏览位置。禁用 JavaScript 后仍能查看和进入全部作品；分类与搜索在 JavaScript 开启后提供。

### 作品截图

首页采用浅色背景和横向作品截图，每张卡片展示截图、标题和简介。通过内置浏览器打开实际作品，等待资源和入场动画完成，再截取清晰画面并压缩为 WebP。新作品将封面保存在自己的 `pages/<slug>/assets/cover.webp`，需要无损清晰度时可用 `cover.png`，在作品 README 中嵌入同一图片，首页直接引用该文件。

截图以 16:9 比例展示，建议宽度至少 1200px，请确保主体完整，避免截入加载提示、错误提示或弹窗。所有作品的首页截图均已归入各自的 `assets/cover.webp`，替换图片时同步检查所有引用，不另建集中截图副本。

### 数字展厅

原三维入口迁移到 `pages/interactive-gallery/`，访问 `http://localhost:5170/interactive-gallery/`。其星空、地球、镜面台座和六张空白卡片作为独立视觉作品保留，支持入场动画、自动环绕、拖拽以及手动暂停/继续。卡片没有作品图片、文字或跳转。

三维场景的全部资源位于自己的 `assets/`，不依赖首页 `_site/` 目录。首页自身不加载 Three.js。作品通过 HTML 模块脚本加载代码，Three.js 核心与 addons 均使用作品内的相对路径导入；开发、发布及独立运行使用相同文件，不需要 import map 或专用解析插件。

### 单独复制与运行

每个 `pages/<slug>/` 都是可独立托管的静态作品。完整复制其中的 `index.html`、`readme.md`、`assets/` 及页面已有的 `sw.js` 等运行文件。在复制后的目录打开终端，执行：

```powershell
python -m http.server 8000 --bind 127.0.0.1
```

访问 <http://127.0.0.1:8000/>。可使用其他静态 HTTP / HTTPS 服务；不需要仓库根目录、pnpm 依赖或构建产物。浏览器需支持 WebGL 2，潮间海湾还需要模块 Worker 和 OffscreenCanvas。ES 模块与资源加载要求通过 HTTP / HTTPS 访问。

每个作品的 `readme.md` 说明当前功能、操作、资源和许可，不保存迭代日志，也不设置作品内 `docs/` 目录。作品不提供返回合集入口的控件，品牌标识仅作展示。

`node --test scripts/standalone-pages.test.mjs` 会逐个复制并改名，检查文档与封面、JavaScript 模块、CSS、glTF 资源、本地路径及离线预缓存依赖。作品专属测试保存在自己的 `tests/`，可在作品目录执行 `node --test tests/*.test.mjs`；资源生成等工具保存在自己的 `scripts/`。测试与工具不参与发布或首页入口生成，仓库根 `scripts/` 仅保留公共脚本。

## 本地预览

需要 Node.js 22.12 或以上，使用 pnpm 管理依赖。首次下载仓库后安装依赖，随后启动：

```powershell
pnpm install
pnpm dev
```

打开 <http://localhost:5170/> 查看作品集，单个页面地址为 `http://localhost:5170/<slug>/`。开发服务直接读取 `pages/`、`site/index.html` 和 `site/assets/` 源码，不依赖或改写 `dist/`。首页和作品均使用 Vite 原生热更新，CSS 更新即时替换，未声明热替换边界的 JavaScript 修改后自动刷新页面。手动维护入口 HTML 后可刷新浏览器预览。保持终端运行，按 `Ctrl+C` 停止服务。端口已占用时，可使用 `pnpm dev --port 5174`。

构建发布文件和预览最终效果：

```powershell
pnpm build
pnpm preview
```

`pnpm build` 生成静态文件到 `dist/`；`pnpm preview` 先构建再启动 <http://127.0.0.1:4173/>，不监视源文件。`pnpm test` 检查发布、开发热更新、独立资源及各作品。三维页面应通过 HTTP 访问，不要直接双击 HTML。

首页资源发布到 `dist/_site/`，各作品发布到 `dist/<slug>/`。资源使用 `./assets/xxx` 等相对路径，不要使用 `/assets/xxx`，否则会跳过 GitHub Pages 的 `/demo/` 仓库路径。链接其他作品用 `../<other-slug>/`。

## 发布到 GitHub Pages

首次设置：

1. 打开仓库的 **Settings → Pages**。
2. 在 **Build and deployment → Source** 中选择 **GitHub Actions**。
3. 提交文件并推送到 `main`。
4. 在 **Actions** 查看 `Deploy to GitHub Pages`，部署成功后即可访问。

之后每次推送到 `main` 都会重新构建并自动发布全部页面，也可以在 Actions 中手动运行工作流。

默认合集地址：<https://qqasd6688.github.io/demo/>。构建将 `pages/` 下每个页面目录复制到 `dist/` 根目录，线上地址不包含 `pages/`。只上传 `dist/`，模板、构建脚本、仓库说明不会作为网站内容发布。页面中的普通文件随页面发布；作品根部的 `tests/`、`scripts/`，以及隐藏文件、`node_modules` 和 `page.json` 会被排除。
