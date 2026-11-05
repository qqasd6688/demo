# 数字展厅的渲染依赖

本目录提供 Three.js 0.185.0。场景从 `three/build/three.module.min.js` 进入，核心与 addons 通过作品内的相对路径互引。独立托管时需完整保留 `three/` 目录。[MIT 许可证](./three/LICENSE)

| 模块 | 在展厅中的用途 |
| --- | --- |
| `Reflector`、`RoomEnvironment` | 镜面反射与物体表面的环境光照 |
| `RoundedBoxGeometry` | 展位和台座的圆角几何 |
| `EffectComposer`、`RenderPass`、`UnrealBloomPass`、`OutputPass`、`FXAAPass` | 绘制场景、处理辉光、输出颜色并平滑边缘 |

地球点阵、展位入场和拖拽环绕由作品代码控制。升级本地渲染库时，核心与附加模块应使用同一版本。[场景入口](../scene.js)
