# 构建与测试指南

本项目只包含 Heat Method 测地线库与一个示例程序，构建步骤非常简单。

## 1. 准备环境

- 已安装 CMake ≥ 3.15
- 支持 C++17 的编译器（clang、gcc、MSVC 均可）
- Git（用于 CMake `FetchContent` 抓取 libigl）

> macOS（Homebrew）：`brew install cmake`
>
> Ubuntu：`sudo apt-get install build-essential cmake`

## 2. 配置与编译

```bash
cmake -S . -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build --target example_geodesic -j 8
```

配置阶段会自动下载 libigl（包含 Eigen），无需手动安装。若希望跳过下载，可在外部提前克隆 libigl 并通过 `CMAKE_PREFIX_PATH` 指向本地版本。

## 3. 运行示例

```bash
./build/examples/example_geodesic path/to/mesh.obj <source_id> <target_id> [output.json]
```

- `source_id`：距离场源点索引
- `target_id`：目标顶点
- `output.json`：可选，默认 `geodesic_path.json`

程序会输出：

1. 目标点距离值（Heat Method 距离场）
2. 顶点索引序列
3. `output.json` 中的 polyline 坐标

## 4. 调试建议

- 开启调试符号：`cmake -S . -B build -DCMAKE_BUILD_TYPE=Debug`
- 使用 Ninja：`cmake -G Ninja -S . -B build && ninja -C build example_geodesic`
- 若线性求解失败，请检查网格是否有退化三角形或孤立顶点。
