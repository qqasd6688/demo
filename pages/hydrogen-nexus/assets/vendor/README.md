# 本地 Three.js 资源

本页面使用 Three.js 0.185.0（MIT），核心模块、几何工具和后处理组件均随页面发布，无 CDN 运行依赖。

- 核心模块与常用 addons 均保存在本作品目录内。
- SSAOPass、SSAOShader、SimplexNoise 来自 npm `three@0.185.0` 的官方发布内容。
- 核心与 addons 使用本作品内的相对路径导入，开发预览和独立运行使用相同文件。
- 精细模式使用 4 倍多重采样、超采样、SSAO、HDR 辉光及 ACES 色调映射；流畅模式降低渲染分辨率并关闭 SSAO，设备结构与动画保留。

许可证见 `three/LICENSE`。
