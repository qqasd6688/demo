# 听雨园

## 简介

一园山水，半日闲。取意于江南古典园林的原创三维场景，约 140×110 米；可观景、入园行走，穿过月洞与曲桥，观察粉墙黛瓦、叠石、水亭、风荷与游鱼。

## 封面

![听雨园封面](./assets/cover.webp)

## 功能点

- 烟水、风荷、入胜、叠山、竹影和闲坐六景，支持游园图定位。
- 自由环绕观景与第一人称步行，包含岸线、桥面和墙体碰撞。
- 在「光景」中用 05:00 至 23:00 的滑块选择光照，或点晨雾、清和、夕照、月夜。天气可独立切换晴日或听雨。
- 平面水反射、荷叶、锦鲤、植被风动、夜间灯火和雨景。
- 可主动开启本地环境录音及程序雨声，默认静音。
- 精致、均衡、流畅三档画质，支持沉浸观察及手机触控行走。

## 技术栈

- 原生 HTML、CSS、JavaScript ES Modules；无框架、无后端。
- 本地 Three.js 0.185.0（WebGL 2）、HDRLoader、反射、GTAO 与辉光。
- 本地 PBR / HDR、程序化建筑和植物、碰撞运动、HTMLAudio 与 Web Audio。

## 独立运行

完整复制本作品目录，保留所有子目录。在副本中运行以下命令即可单独预览。

```powershell
python -m http.server 8000 --bind 127.0.0.1
```

用支持 WebGL 2 的浏览器打开 <http://127.0.0.1:8000/>。目录可以改名，也可整体部署到静态站点的子路径。

## 操作说明

在合集仓库根目录运行 `pnpm dev`，打开 <http://localhost:5170/suzhou-garden/>。

| 操作 | 效果 |
| --- | --- |
| 观景模式拖动 / 滚轮 / 右键 | 环顾 / 远近 / 平移 |
| WASD 或方向键；Shift | 入园模式行走；快行 |
| 手机摇杆 / 拖动画面 | 行走 / 转头 |
| 游园图或底部六景按钮 | 观景时平滑转到预设镜头，步行时直接抵达景点落脚处 |
| 重回初景 | 回到烟水的观景镜头 |
| 轻点池面 / 暂停时光 | 点水泛起涟漪。暂停后风、水与游鱼的动画停下，仍可行走 |
| 环境音 / 时光 / 天气 / 画质 | 主动控制声音、时间和渲染效果 |
| 入园后点击锁定视角 / Esc | 用鼠标移动转头，按 Esc 释放指针。沉浸时按 Esc 也能恢复界面 |

## 资源目录

| 路径 | 用途 |
| --- | --- |
| index.html / readme.md | 作品入口 / 当前使用说明 |
| assets/cover.webp | 真实页面截图，首页与本 README 共用 |
| assets/main.js、style.css、navigation.js | 页面、触屏控制、地图与行走 |
| assets/layout.js | 布局、岸线、桥面高度和碰撞 |
| assets/architecture.js、landscape.js、vegetation.js、geometry.js | 园林建筑、叠石、植物及几何工具 |
| assets/world.js、water.js、environment.js、materials.js | 渲染、水体、日夜、天气和材质 |
| assets/textures/ | 本地扫描贴图、HDR 天空和来源清单 |
| assets/audio.js、audio/ | 环境音开关、本地录音和署名 |
| assets/vendor/three/ | 本地渲染库及完整附加依赖、MIT 许可 |

## 素材与许可

- [Three.js MIT 许可证](./assets/vendor/three/LICENSE)。
- 扫描贴图和 HDR 天空来自 Poly Haven，按 CC0 保存；见 [材质来源说明](./assets/textures/README.md)、[贴图清单](./assets/textures/sources.json) 和 [天空清单](./assets/textures/sky-sources.json)。
- 风、晨鸟、虫鸣和水声取自 Tidewater 所附的 Freesound CC0 素材，并非苏州实地采录；见 [录音来源与作者](./assets/audio/CREDITS.md)。雨声由程序生成。

## 数据与限制

园林布局为原创设计。初始光景为 09:30 的清和晴日，时刻由用户选择。启动时视口宽度小于 600 px 会采用「流畅」，其他尺寸采用「均衡」。「流畅」关闭环境遮蔽和辉光，并降低渲染分辨率。画质、时刻和视角都只在本次游览有效。
