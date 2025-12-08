# Heat Method 测地线工具集

该仓库精简为单一职责：在三角网格上通过 Heat Method 计算测地线距离与路径，并导出可直接喂给 Three.js 的 polyline 数据。所有非测地线代码（分割、展开、xatlas 等）均已移除，以便专注于这一算法。

## 特性

- 预计算拉普拉斯、质量与梯度算子，并使用 `SimplicialLLT` 进行稀疏分解，实现多次查询时的常数时间回代。
- 完整实现 Heat Method 四个步骤：短时热扩散、梯度归一化、泊松求解、沿 `-∇φ` 的离散梯度下降路径追踪。
- `examples/example_geodesic` 示例可读取 OBJ、输出 JSON polyline，直接在 Web 端用 `TubeGeometry` 绘制。

## 依赖

- CMake ≥ 3.15
- C++17 编译器
- [libigl](https://github.com/libigl/libigl)（由 CMake `FetchContent` 自动获取，附带 Eigen）

## 构建

```bash
cmake -S . -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build --target example_geodesic -j 8
```

## 使用示例

```bash
./build/examples/example_geodesic bunny.obj 12 487 geodesic_path.json
```

- `12`：源点顶点索引（距离为 0）。
- `487`：目标顶点。
- `geodesic_path.json`：输出 polyline。

示例输出格式：

```json
{
  "path": [
    { "x": 0.0012, "y": 0.2803, "z": -0.1619 },
    ...
  ]
}
```

## Three.js 可视化

```js
const polyline = await fetch('geodesic_path.json').then(r => r.json());
const curve = new THREE.CatmullRomCurve3(polyline.path.map(p => new THREE.Vector3(p.x, p.y, p.z)));
const radius = modelBoundingBox.getSize(new THREE.Vector3()).length() * 0.001;
const geom = new THREE.TubeGeometry(curve, 32, radius, 6, false);
const mat = new THREE.MeshBasicMaterial({ color: 0xff5c5c });
mat.polygonOffset = true;
mat.polygonOffsetFactor = 1;
mat.polygonOffsetUnits = 1;
scene.add(new THREE.Mesh(geom, mat));
```

## 本地可视化模块

仓库提供了一个基于 Three.js 的轻量查看器（`visualization/`）：

```bash
# 1. 运行 Heat Method，生成 JSON
./scripts/run_geodesic.sh obj/test_large.obj 0 1680 results/large_path.json

# 2. 启动静态服务器
./scripts/serve_visualizer.sh 4173

# 3. 浏览器访问
open http://localhost:4173
```

界面支持：

- “加载默认测试模型” 按钮会读取 `obj/test_large.obj` 与 `results/large_path.json`
- 导入任意 OBJ（原始模型）与测地线 JSON（`{ path: [...] }` 格式）
- 使用 `TubeGeometry` + `polygonOffset` 绘制管状裁线，可平移缩放查看

## API 概览

```cpp
#include "uv_geodesic.h"

UVGeodesic::HeatGeodesicSolver solver(V, F);       // 构造时完成预分解
Eigen::VectorXd field = solver.computeDistance({source}); // 距离场
auto path = solver.tracePath(field, source, target);      // 最短路径
```

`computeDistance` 支持多个源点；`tracePath` 默认按 `distance_field` 做贪心下降，可通过 `descent_epsilon` 控制降幅阈值。`GeodesicPath` 中提供源到目标的顶点序列、世界坐标 polyline 以及目标点距离。
