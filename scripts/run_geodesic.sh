#!/usr/bin/env bash
set -euo pipefail

if [ $# -lt 3 ]; then
    cat <<'USAGE'
用法:
  scripts/run_geodesic.sh <mesh.obj> <source_vertex> <target_vertex> [output.json]

说明:
  - mesh.obj       输入三角网格
  - source_vertex  距离场源点索引
  - target_vertex  目标顶点索引
  - output.json    可选，默认为 geodesic_path.json
USAGE
    exit 1
fi

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUILD_DIR="${PROJECT_ROOT}/build"

EXE="${BUILD_DIR}/examples/example_geodesic"

if [ ! -x "${EXE}" ]; then
    echo "[info] example_geodesic 未构建，正在自动构建…"
    cmake -S "${PROJECT_ROOT}" -B "${BUILD_DIR}" -DCMAKE_BUILD_TYPE="${CMAKE_BUILD_TYPE:-Release}"
    CORES=$( (command -v sysctl >/dev/null && sysctl -n hw.ncpu) || (command -v nproc >/dev/null && nproc) || echo 4 )
    cmake --build "${BUILD_DIR}" --target example_geodesic -j "${CORES}"
fi

exec "${EXE}" "$@"
