# UV Unwrapping Algorithms - 手动分割与自动展开算法库

这是一个全面的 UV 展开算法实现库，包含多种手动分割策略和自动展开算法。

## 📚 目录

- [特性](#特性)
- [算法概览](#算法概览)
  - [手动分割方法](#手动分割方法)
  - [UV 展开算法](#uv-展开算法)
  - [工业级库集成](#工业级库集成)
- [依赖项](#依赖项)
- [构建](#构建)
- [使用示例](#使用示例)
- [算法详解](#算法详解)
- [参考资料](#参考资料)

## ✨ 特性

### 手动分割方法（6种）

1. **按拓扑环（Edge Loop）分割**
   - 适用：角色脖子、衣服袖口、裤脚、机械部件接合处
   - 优点：UV 形状规整，容易 relax 和 pack

2. **高曲率切线（High-Curvature Seam）**
   - 适用：人头后侧、手臂/大腿内侧、有机形体
   - 优点：释放曲面拉伸，减少 UV 扭曲

3. **不可展开区域切线（Non-developable Area Cuts）**
   - 基于高斯曲率：正高斯曲率（凸包）、负高斯曲率（鞍形）
   - 优点：获得最平滑 UV

4. **按纹理方向切（Texture-flow Seams）**
   - 适用：衣服布纹、木纹、金属拉丝效果
   - 优点：贴图质量最高

5. **按细节区分（Detail Isolation）**
   - 适用：角色脸部、装饰花纹、logo 区域
   - 优点：面片纹素密度可以更大

6. **按镜像/重复要求切（Symmetry / Overlap Cuts）**
   - 适用：左右镜像角色、重复机械件、模块化场景
   - 优点：大幅节省贴图空间

### UV 展开算法（3种）

1. **LSCM（Least Squares Conformal Maps）**
   - 最小二乘保角映射
   - 特点：保持角度、拉伸少、速度快
   - 适用：角色类模型、有曲面结构的物体

2. **ABF / ABF++（Angle Based Flattening）**
   - 基于角度的展平
   - 特点：更少的拉伸、更均匀的 UV
   - 适用：高精模型、需要极高质量纹理 UV

3. **ARAP UV Relaxation**
   - As-Rigid-As-Possible 优化
   - 用于优化和改善 UV 质量

### 工业级库集成（2个）

1. **xatlas**
   - 功能：自动 seam 生成、LSCM 展开、自动 pack
   - 支持：WebAssembly
   - GitHub: https://github.com/jpcy/xatlas

2. **UVAtlas**（Windows 平台）
   - 功能：图形硬件加速、Chart 分割、Stretch 分析
   - GitHub: https://github.com/Microsoft/UVAtlas

## 📦 依赖项

### 主要库

- **libigl** (v2.5.0+)
  - 轻量、高效、示例丰富
  - https://libigl.github.io

- **Eigen** (自动包含在 libigl 中)
  - 线性代数库

- **xatlas**
  - 自动 UV 生成
  - https://github.com/jpcy/xatlas

### 可选库

- **OpenMesh** (10.0.0+)
  - 稳定，适合操作拓扑
  - https://www.graphics.rwth-aachen.de/software/openmesh/

- **UVAtlas**（仅 Windows）
  - 微软 DirectXMesh 库的一部分

## 🔨 构建

### macOS / Linux

```bash
mkdir build
cd build
cmake ..
make -j8
```

### Windows

```bash
mkdir build
cd build
cmake ..
cmake --build . --config Release
```

### CMake 选项

```cmake
option(USE_LIBIGL "Use libigl library" ON)
option(USE_OPENMESH "Use OpenMesh library" ON)
option(USE_XATLAS "Use xatlas library" ON)
option(USE_UVATLAS "Use UVAtlas library" ON)
```

## 🚀 使用示例

### 示例 1：边环分割

```cpp
#include "uv_segmentation.h"

// 检测边环
auto edge_loops = UVUnwrapping::detectEdgeLoops(V, F, 30.0);

// 按边环分割
auto islands = UVUnwrapping::segmentByEdgeLoops(V, F, edge_loops);
```

运行示例：
```bash
./examples/example_edge_loop model.obj
```

### 示例 2：高斯曲率分割

```cpp
#include "uv_segmentation.h"

// 计算高斯曲率
auto K = UVUnwrapping::computeGaussianCurvature(V, F);

// 按高斯曲率分割
auto islands = UVUnwrapping::segmentByGaussianCurvature(V, F, 0.01);
```

运行示例：
```bash
./examples/example_curvature model.obj
```

### 示例 3：LSCM UV 展开

```cpp
#include "uv_unwrapping.h"

// LSCM 展开
auto result = UVUnwrapping::unwrapLSCM(V, F);

// 松弛优化
UVUnwrapping::relaxUV(V, F, result.UV, 10);

// 分析质量
double distortion = result.distortion;
Eigen::VectorXd stretch = result.stretch;
```

运行示例：
```bash
./examples/example_lscm model.obj output.obj
```

### 示例 4：ABF UV 展开

```cpp
#include "uv_unwrapping.h"

// ABF 展开
auto result = UVUnwrapping::unwrapABF(V, F, 1000, 1e-6);
```

运行示例：
```bash
./examples/example_abf model.obj output.obj
```

### 示例 5：xatlas 自动化

```cpp
#include "xatlas_wrapper.h"

UVUnwrapping::XAtlasWrapper wrapper;
UVUnwrapping::XAtlasWrapper::Options options;

options.resolution = 1024;
options.padding = 2.0f;

auto [UV, islands] = wrapper.generate(V, F, options);
```

运行示例：
```bash
./examples/example_xatlas model.obj
```

### 示例 6：完整流程

运行完整的 UV 展开流程（分割 → 展开 → 优化 → 打包）：

```bash
./examples/example_pipeline model.obj output.obj
```

## 📖 算法详解

### 1. 边环分割 (Edge Loop Segmentation)

#### 原理
通过检测二面角大于阈值的边，识别特征边环。

#### 应用场景
- 角色模型的脖子、手腕、脚踝
- 衣服的袖口、裤脚
- 机械部件的螺纹起点、零件拼接处

#### 优缺点
✅ 优点：
- UV 形状规整
- 容易进行后续 relax 和 pack 操作
- 适合规则形状

❌ 缺点：
- 需要明确的拓扑环
- 不适合无规则曲面

### 2. 高曲率切线 (High-Curvature Seam)

#### 原理
计算主曲率，在曲率变化剧烈的区域放置切线。

#### 应用场景
- 人头后侧切一圈
- 手臂/大腿的内侧 seam
- 鱼、动物、卡通角色的背鳍/腹鳍边缘

#### 优缺点
✅ 优点：
- 释放曲面拉伸
- 减少 UV 扭曲
- 适合有机形体

❌ 缺点：
- seam 位置不一定隐蔽
- 需要配合可视性方案

### 3. 不可展开区域切线 (Non-developable Area Cuts)

#### 数学原理
基于高斯曲率 K = κ₁ × κ₂（κ₁, κ₂ 为主曲率）：

- **正高斯曲率** (K > 0)：凸包，必需切割
- **零高斯曲率** (K = 0)：平面/圆柱，可展开
- **负高斯曲率** (K < 0)：鞍形，通常需要切割

#### 应用场景
- 头部顶部（凸）
- 脚跟的折角
- 异形曲面、怪物皮肤

#### 优缺点
✅ 优点：
- 获得最平滑的 UV
- 数学上最优

❌ 缺点：
- seam 较多
- 但可被纹理隐藏

### 4. LSCM（最小二乘保角映射）

#### 数学原理
最小化能量函数：

```
E = Σ ||∇u × ∇v||²
```

其中 u, v 是 UV 坐标。保持三角形角度不变（保角性质）。

#### 特点
- 保持三角形角度（保角）
- 拉伸少
- 展开速度快 O(n)
- 线性系统求解

#### 实现参考
- libigl: `igl::lscm()`
- 论文: Lévy et al., "Least Squares Conformal Maps for Automatic Texture Atlas Generation", 2002

#### 适用场景
- 角色类模型
- 有曲面结构的物体
- 需要快速展开的情况

### 5. ABF/ABF++（基于角度的展平）

#### 数学原理
优化目标：使展平后的角度尽可能接近原始 3D 角度

```
E = Σ (α_i - α_i^3D)² / α_i^3D
```

约束条件：
1. 每个三角形的角度和 = π
2. 每个内部顶点周围的角度和 = 2π

#### 特点
- 更少的拉伸（比 LSCM 更优）
- 更均匀的 UV 分布
- 需要迭代优化
- 计算时间较长

#### 实现参考
- OpenABF: https://github.com/educelab/OpenABF
- 论文: Sheffer et al., "ABF++: Fast and Robust Angle Based Flattening", 2005

#### 适用场景
- 高精模型
- 需要极高质量纹理 UV
- 离线渲染
- 重要的主角资产

### 6. xatlas

#### 功能
1. **自动 Chart 生成**
   - 基于法向偏差、圆度、直线度等权重
   - 智能 seam 放置

2. **LSCM 展开**
   - 每个 chart 独立展开

3. **自动打包**
   - 矩形打包算法
   - 可配置间距和对齐

#### 参数调优

```cpp
options.normal_deviation_weight = 2.0f;  // ↑ 更多 charts
options.roundness_weight = 0.01f;        // ↑ 更圆的 charts
options.straightness_weight = 6.0f;      // ↑ 更直的边界
options.padding = 2.0f;                  // ↑ 更多间距
```

#### 适用场景
- 需要完全自动化的场景
- 游戏资产批量处理
- 实时/在线 UV 生成
- 不需要精细控制 seam 位置

## 📊 算法比较

| 算法 | 速度 | 质量 | 自动化 | 适用场景 |
|------|------|------|--------|----------|
| LSCM | ⚡⚡⚡ | ⭐⭐⭐ | 半自动 | 通用 |
| ABF++ | ⚡ | ⭐⭐⭐⭐⭐ | 半自动 | 高质量 |
| xatlas | ⚡⚡ | ⭐⭐⭐⭐ | 全自动 | 批量处理 |
| UVAtlas | ⚡⚡⚡ | ⭐⭐⭐⭐ | 全自动 | Windows |

## 🔧 高级用法

### 组合使用不同策略

```cpp
// 1. 先用高斯曲率分割大的区域
auto islands = segmentByGaussianCurvature(V, F, 0.01);

// 2. 对重要区域（如脸部）单独处理
std::vector<int> face_detail = {/* 脸部面索引 */};
auto detail_islands = segmentByDetailIsolation(V, F, face_detail);

// 3. 对每个岛应用 LSCM
for (const auto& island : islands) {
    auto UV_island = unwrapIslandLSCM(V, F, island);
    // ...
}

// 4. 打包所有 UV 岛
auto UV_packed = packUVIslands(islands, UV_coords, 0.01);
```

### 自定义纹理方向

```cpp
// 木纹沿 Y 轴
Eigen::Vector3d wood_grain_dir(0, 1, 0);
auto islands = segmentByTextureFlow(V, F, wood_grain_dir, 45.0);
```

### 镜像对称

```cpp
// YZ 平面镜像（X=0）
Eigen::Vector4d symmetry_plane(1, 0, 0, 0);  // x + 0 = 0
auto islands = segmentBySymmetry(V, F, symmetry_plane, 1e-6);
```

## 📚 参考资料

### 论文

1. **LSCM**
   - Lévy, B., Petitjean, S., Ray, N., & Maillot, J. (2002). "Least Squares Conformal Maps for Automatic Texture Atlas Generation". SIGGRAPH 2002.

2. **ABF++**
   - Sheffer, A., Lévy, B., Mogilnitsky, M., & Bogomyakov, A. (2005). "ABF++: Fast and Robust Angle Based Flattening". ACM TOG.

3. **Spectral Conformal Parameterization**
   - Mullen, P., Tong, Y., Alliez, P., & Desbrun, M. (2008). "Spectral Conformal Parameterization". Computer Graphics Forum.

### 开源库

- **libigl**: https://libigl.github.io
  - Tutorial: https://libigl.github.io/tutorial/
  - LSCM Example: https://github.com/libigl/libigl/blob/main/tutorial/502_LSCMParam/main.cpp

- **xatlas**: https://github.com/jpcy/xatlas
  - 简单、高效、无依赖

- **OpenABF**: https://github.com/educelab/OpenABF
  - ABF++ 实现

- **UVAtlas**: https://github.com/Microsoft/UVAtlas
  - 微软官方实现

- **OpenMesh**: https://www.graphics.rwth-aachen.de/software/openmesh/
  - 半边数据结构

### 书籍

- **Polygon Mesh Processing**
  - Botsch, M., Kobbelt, L., Pauly, M., Alliez, P., & Lévy, B.
  - 第6章：Parameterization

## 📝 许可证

本项目采用 MIT 许可证。

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📧 联系

如有问题或建议，请通过 GitHub Issues 联系。

---

**Happy UV Unwrapping! 🎨**
# UV-trial
