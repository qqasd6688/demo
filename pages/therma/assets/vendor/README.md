# THERMA 的渲染依赖

本目录随作品发布 Three.js 0.185.0。保留 `three/build/` 和 `three/examples/jsm/` 的相对位置，以便附加模块从本地加载同一套核心。[MIT 许可证](./three/LICENSE)

- OrbitControls 控制正交相机的旋转与缩放。RoundedBoxGeometry 和 BufferGeometryUtils 用于搭建和组合洗烘机部件。
- 场景通过 EffectComposer、RenderPass、GTAOPass 与 OutputPass 绘制。作品在 GTAOPass 基础上对透明件单独处理，避免舱门玻璃遮住内部结构。
- 摄影棚反射由作品代码中的灯板生成。导出 PNG 时按目标尺寸重新运行同一条渲染流程。[渲染实现](../rendering.js) · [相机与导出](../scene.js)
