# 微境材质来源

本目录包含两组 Poly Haven 的 CC0 扫描材质，共六张 1K JPEG。运行时从本地加载。[Poly Haven 许可](https://polyhaven.com/license)

| 文件名前缀 | 场景用途 | 来源 |
| --- | --- | --- |
| `rocky_terrain_` | 岩体和地形。地形着色器沿三个方向投影，再按表面朝向混合取样，减少陡坡拉伸。 | [Rocky Terrain](https://polyhaven.com/a/rocky_terrain) |
| `bark_brown_02_` | 树干和树皮的颜色、凹凸与粗糙度。 | [Bark Brown 02](https://polyhaven.com/a/bark_brown_02) |

每组都有 `Diffuse.jpg`、`nor_gl.jpg`、`arm.jpg` 三个后缀。颜色使用 sRGB，OpenGL 法线和 ARM 作为线性数据读取。ARM 的红、绿、蓝通道分别保存环境遮蔽、粗糙度和金属度，本作品的岩石与树皮材质使用其中的红、绿通道。[材质加载与地形着色](../materials.js)
