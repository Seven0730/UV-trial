# 构建说明

## 快速开始

### macOS

```bash
# 安装依赖（如果使用 Homebrew）
brew install cmake eigen

# 构建
mkdir build && cd build
cmake ..
make -j8

# 运行示例
./examples/example_edge_loop ../test_models/sphere.obj
./examples/example_lscm ../test_models/sphere.obj output.obj
```

### Linux

```bash
# 安装依赖
sudo apt-get install cmake libeigen3-dev

# 构建
mkdir build && cd build
cmake ..
make -j8
```

### Windows

```bash
# 使用 Visual Studio 2019+
mkdir build
cd build
cmake -G "Visual Studio 16 2019" ..
cmake --build . --config Release
```

## 依赖说明

### 自动下载的依赖

CMake 会自动下载以下库：

1. **libigl** (v2.5.0)
   - 包含 Eigen
   - 提供网格处理功能

2. **xatlas**
   - 自动 UV 生成

### 可选依赖

3. **OpenMesh** (10.0.0)
   - 如果系统已安装，会自动检测
   - 否则跳过

4. **UVAtlas** (仅 Windows)
   - DirectXMesh 的一部分
   - 仅在 Windows 上可用

## 构建选项

```bash
# 禁用某些库
cmake -DUSE_OPENMESH=OFF ..
cmake -DUSE_XATLAS=OFF ..
cmake -DUSE_UVATLAS=OFF ..  # 非 Windows 平台自动禁用
```

## 测试模型

可以从以下网站下载测试模型：

- **Stanford 3D Scanning Repository**
  - https://graphics.stanford.edu/data/3Dscanrep/
  - Bunny, Dragon, Buddha

- **Thingi10K**
  - https://ten-thousand-models.appspot.com/
  - 大量测试模型

- **libigl Tutorial Data**
  - https://github.com/libigl/libigl-tutorial-data

## 常见问题

### Q: libigl 下载失败

A: 设置国内镜像或手动下载：

```bash
# 手动下载
git clone https://github.com/libigl/libigl.git external/libigl
cd external/libigl
git checkout v2.5.0

# 在 CMakeLists.txt 中指定路径
set(LIBIGL_PATH "${CMAKE_SOURCE_DIR}/external/libigl")
```

### Q: Eigen 找不到

A: libigl 已包含 Eigen，不需要单独安装。如果有问题：

```bash
# Ubuntu/Debian
sudo apt-get install libeigen3-dev

# macOS
brew install eigen
```

### Q: xatlas 编译错误

A: 确保使用 C++17：

```bash
cmake -DCMAKE_CXX_STANDARD=17 ..
```

## 性能优化

```bash
# Release 模式（推荐）
cmake -DCMAKE_BUILD_TYPE=Release ..

# 使用 Ninja（更快）
cmake -GNinja -DCMAKE_BUILD_TYPE=Release ..
ninja
```

## IDE 支持

### Visual Studio Code

1. 安装 C/C++ 和 CMake Tools 扩展
2. 打开项目文件夹
3. CMake: Configure
4. CMake: Build

### CLion

1. 直接打开项目文件夹
2. CLion 会自动识别 CMakeLists.txt

### Visual Studio

```bash
cmake -G "Visual Studio 16 2019" -A x64 ..
# 打开生成的 .sln 文件
```
