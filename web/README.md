# UV Geodesic Viewer (frontend)

Vite + TypeScript + Three.js skeleton for viewing large OBJ meshes and (later) visualizing geodesic lines.

## Quickstart

```bash
cd web
npm install           # requires network access
npm run dev           # http://localhost:4173
```

### Sample assets

- The default button loads `/obj/test_large.obj`. Place your OBJ under `web/public/obj/` (e.g. `mkdir -p public/obj && cp ../obj/test_large.obj public/obj/`).
- You can also drag & drop or use the file picker.

## Current features (Phase 0/1)

- Three.js scene with OrbitControls, lights, resize-safe render loop.
- OBJLoader with progress indicator; supports <input type="file"> and drag/drop for 50MB+ files.
- Bounding-box fit + camera recentering after each load.
- Raycast pick + shift+click to drop control points on the mesh; inline line preview (straight screen-space polyline). This will later be swapped to geodesic output.

> 中文小贴士：默认的 `/obj/test_large.obj` 需要放在 `web/public/obj/` 下（示例拷贝：`mkdir -p web/public/obj && cp ../obj/test_large.obj web/public/obj/`）。打不开默认模型时，先确认该文件存在；本地导入可直接拖拽或用文件选择框。
