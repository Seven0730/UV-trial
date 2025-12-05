# 网格分割算法库

用于UV展开前的网格预处理，提供6种核心分割算法。

## 功能

### 核心分割算法

1. **边缘环分割** (`detectEdgeLoops` + `segmentByEdgeLoops`)
   - 基于二面角检测特征边
   - 适用场景：角色脖子、衣服袖口、机械接合面

2. **高曲率分割** (`segmentByHighCurvature`)
   - 基于主曲率识别高曲率区域
   - 适用场景：人体关节、有机形体凹陷处

3. **高斯曲率分割** (`segmentByGaussianCurvature`)
   - 检测不可展开区域（正/负高斯曲率）
   - 适用场景：球形、鞍形等复杂曲面

4. **纹理流向分割** (`segmentByTextureFlow`)
   - 按指定方向切割网格
   - 适用场景：布纹、木纹、拉丝效果

5. **细节区域隔离** (`segmentByDetailIsolation`)
   - 将指定面集独立为UV岛
   - 适用场景：Logo、脸部、装饰图案

6. **对称分割** (`segmentBySymmetry`)
   - 沿对称平面切割
   - 适用场景：镜像角色、重复机械件

## 编译

```bash
mkdir build && cd build
cmake ..
make -j8
```

## 使用示例

### 边缘环分割
```bash
./examples/example_edge_loop ../test_plane.obj
```

### 曲率分割
```bash
./examples/example_curvature ../test_plane.obj
```

### 可视化缝合线
```bash
./examples/visualize_seams ../test_plane.obj seams
# 生成 seams_edgeloop.svg, seams_curvature.svg 等
```

### 列出缝合线
```bash
./examples/list_seams ../test_plane.obj
```

### 性能测试
```bash
./examples/perf_test ../test_models/3.obj
```

## 项目结构

```
.
├── include/
│   └── uv_segmentation.h       # API头文件
├── src/
│   ├── edge_loop_segmentation.cpp    # 边缘环算法
│   ├── curvature_segmentation.cpp    # 曲率算法
│   └── advanced_segmentation.cpp     # 高级算法
├── examples/
│   ├── example_edge_loop.cpp         # 边缘环示例
│   ├── example_curvature.cpp         # 曲率示例
│   ├── visualize_seams.cpp           # SVG可视化
│   ├── list_seams.cpp                # 文本输出
│   └── perf_test.cpp                 # 性能基准测试
└── test_models/                      # 测试网格
```

## API 参考

所有函数位于 `UVSegmentation` 命名空间。

### 数据结构

```cpp
struct Edge {
    int v0, v1;  // 顶点索引（v0 < v1）
};

struct UVIsland {
    std::vector<int> faces;        // 面索引
    std::vector<Edge> boundary;    // 边界边
    Eigen::Vector3d centroid;      // 质心
    double area;                   // 面积
};
```

### 主要函数

```cpp
// 检测边环
std::vector<std::vector<int>> detectEdgeLoops(
    const Eigen::MatrixXd& V,
    const Eigen::MatrixXi& F,
    double feature_angle = 30.0
);

// 按边环分割
std::vector<UVIsland> segmentByEdgeLoops(
    const Eigen::MatrixXd& V,
    const Eigen::MatrixXi& F,
    const std::vector<std::vector<int>>& edge_loops
);

// 高曲率分割
std::vector<UVIsland> segmentByHighCurvature(
    const Eigen::MatrixXd& V,
    const Eigen::MatrixXi& F,
    double curvature_threshold = 0.5
);

// 高斯曲率分割
std::vector<UVIsland> segmentByGaussianCurvature(
    const Eigen::MatrixXd& V,
    const Eigen::MatrixXi& F,
    double gaussian_threshold = 0.01
);

// 对称分割
std::vector<UVIsland> segmentBySymmetry(
    const Eigen::MatrixXd& V,
    const Eigen::MatrixXi& F,
    const Eigen::Vector4d& symmetry_plane,  // ax+by+cz+d=0
    double tolerance = 1e-6
);
```

## 依赖

- **libigl** v2.5.0 - 网格处理库
- **Eigen3** - 线性代数（通过libigl提供）
- **C++17** 编译器

## 性能

**小模型** (< 1K面): 所有算法 < 100ms  
**中模型** (1K-10K面): 边缘环 < 1s, 曲率 < 2s  
**大模型** (> 100K面): 性能降低，建议使用简化或采样

性能瓶颈在BFS遍历，对大模型建议：
- 使用`perf_test`工具分析
- 考虑空间分割加速（KD树、Octree）
- 或使用优化的第三方库（如xatlas）

## 许可

MIT License

## 贡献

欢迎提交Issue和Pull Request。
