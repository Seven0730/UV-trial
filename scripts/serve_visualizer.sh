#!/usr/bin/env bash
set -euo pipefail

PORT="${1:-4173}"
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VIZ_DIR="${PROJECT_ROOT}/visualization"

if [ ! -d "${VIZ_DIR}" ]; then
    echo "未找到 visualization 目录"
    exit 1
fi

echo "Serving visualization on http://localhost:${PORT}"
cd "${VIZ_DIR}"
python3 -m http.server "${PORT}"
