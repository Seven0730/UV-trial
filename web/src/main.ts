import * as THREE from "three";
import { centerAndFit, disposeObject3D, setupLights } from "./core/three/helpers";
import { loadOBJFromFile, loadOBJFromURL } from "./core/three/loaders";
import { createThree, resizeRenderer, startRenderLoop } from "./core/three/scene";
import { LinePreview } from "./features/segmentation/linePreview";
import { MeshGraphBuilder } from "./features/segmentation/meshGraph";
import { pick } from "./features/segmentation/raycast";
import { SegmentationStore } from "./features/segmentation/store";
import "./style.css";

const DEFAULT_OBJ_URL = "/obj/test_large.obj"; // place models under web/public/obj

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("Root #app element missing");
}

app.innerHTML = `
  <div class="toolbar">
    <h1>Segmentation Viewer</h1>
    <button id="loadDefault">加载默认 OBJ</button>
    <label for="meshFile">导入 OBJ<input id="meshFile" type="file" accept=".obj" /></label>
    <button id="startLine">新建线</button>
    <button id="finishLine">结束线</button>
    <button id="undoPoint">撤销一点</button>
    <button id="deleteLine">删除当前线</button>
    <button id="exportJson">导出 JSON</button>
    <label style="margin-left:12px;">线粗<input id="lineWidth" type="range" min="0.001" max="0.02" step="0.001" value="0.003" style="vertical-align:middle;" /></label>
    <label style="margin-left:8px;">点粗<input id="pointSize" type="range" min="0.002" max="0.02" step="0.001" value="0.006" style="vertical-align:middle;" /></label>
    <label style="margin-left:8px; font-size:12px; color: var(--muted);"><input id="showPoints" type="checkbox" /> 显示路径点</label>
    <label style="margin-left:8px; font-size:12px; color: var(--muted);">
      模式
      <select id="modeSelect" style="vertical-align:middle;">
        <option value="draw" selected>划线模式</option>
        <option value="edit">微调模式</option>
      </select>
    </label>
    <div id="progress" style="color: var(--muted); font-size: 12px;">idle</div>
  </div>
  <div class="main">
    <canvas id="viewport"></canvas>
    <div class="sidepanel" id="lineList" style="position:absolute; right:16px; top:16px; width:240px; max-height:calc(100vh - 100px); overflow-y:auto; background:rgba(20,24,30,0.95); border:1px solid #2a2f3a; border-radius:8px; padding:12px; font-size:12px; color:var(--muted); pointer-events:auto; z-index:10;">
      <div style="font-weight:600; margin-bottom:10px; color:#fff; font-size:13px;">线列表</div>
      <div id="lineListBody">暂无线条</div>
    </div>
    <div class="status" id="status">准备就绪</div>
    <div class="overlay">
      <strong>模式切换</strong> 划线模式：Shift+单击添加点；微调模式：单击拖动已有点，在表面滑动。<br/><br/>
      <strong>路径</strong> 依网格边最短路生成，默认隐藏路径点，可通过复选框显示；线/点粗细可调。<br/><br/>
      <strong>拖拽/点击导入 OBJ</strong>，默认加载 <code>test_large.obj</code>。<br/><br/>
      当前线数量显示在右下角。
    </div>
    <div class="status bottom-right" id="lineInfo">lines: 0</div>
  </div>
`;

const canvas = document.querySelector<HTMLCanvasElement>("#viewport")!;
const statusBox = document.querySelector<HTMLDivElement>("#status")!;
const progressBox = document.querySelector<HTMLDivElement>("#progress")!;
const meshInput = document.querySelector<HTMLInputElement>("#meshFile")!;
const defaultButton = document.querySelector<HTMLButtonElement>("#loadDefault")!;
const startLineBtn = document.querySelector<HTMLButtonElement>("#startLine")!;
const finishLineBtn = document.querySelector<HTMLButtonElement>("#finishLine")!;
const undoPointBtn = document.querySelector<HTMLButtonElement>("#undoPoint")!;
const deleteLineBtn = document.querySelector<HTMLButtonElement>("#deleteLine")!;
const exportJsonBtn = document.querySelector<HTMLButtonElement>("#exportJson")!;
const lineWidthInput = document.querySelector<HTMLInputElement>("#lineWidth") as HTMLInputElement | null;
const pointSizeInput = document.querySelector<HTMLInputElement>("#pointSize") as HTMLInputElement | null;
const showPointsInput = document.querySelector<HTMLInputElement>("#showPoints") as HTMLInputElement | null;
const modeSelect = document.querySelector<HTMLSelectElement>("#modeSelect");
const lineInfoBox = document.querySelector<HTMLDivElement>("#lineInfo")!;
const lineListBody = document.querySelector<HTMLDivElement>("#lineListBody")!;

const three = createThree(canvas);
setupLights(three.scene);

const modelRoot = new THREE.Group();
three.scene.add(modelRoot);

let boundingSize = 1;
const linePreview = new LinePreview(three.scene, () => boundingSize);
const store = new SegmentationStore();
let meshGraph: MeshGraphBuilder | null = null;
let draggingTarget: { kind: "control"; index: number } | { kind: "path"; index: number } | null = null;
type InteractionMode = "draw" | "edit";
let mode: InteractionMode = "draw";

addTestBox();
resizeRenderer(three);
const stopLoop = startRenderLoop(three);
void loadFromURL(DEFAULT_OBJ_URL).catch((err) => setStatus(`默认模型加载失败: ${(err as Error).message}`));

window.addEventListener("resize", () => resizeRenderer(three));

meshInput.addEventListener("change", async (event) => {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;
  await loadFromFile(file);
  meshInput.value = "";
});

defaultButton.addEventListener("click", async () => {
  await loadFromURL(DEFAULT_OBJ_URL);
});

lineWidthInput?.addEventListener("input", () => {
  const val = parseFloat(lineWidthInput.value);
  linePreview.setStyles({ tubeRadiusFactor: val });
  rebuildPreview();
});

pointSizeInput?.addEventListener("input", () => {
  const val = parseFloat(pointSizeInput.value);
  linePreview.setStyles({ pointSizeFactor: val });
  rebuildPreview();
});

showPointsInput?.addEventListener("change", () => {
  linePreview.setStyles({ showPoints: !!showPointsInput.checked });
  rebuildPreview();
});

modeSelect?.addEventListener("change", () => {
  mode = (modeSelect.value as InteractionMode) ?? "draw";
  const modeText = mode === "draw" ? "划线模式" : "微调模式";
  setStatus(`已切换到${modeText}`);
  // 微调模式下尽量避免 Orbit 干扰，绘制时保持正常
  three.controls.enableRotate = mode !== "edit";
});

startLineBtn.addEventListener("click", () => {
  store.startLine();
  linePreview.update([]);
  setStatus("新建线");
  updateLineInfo();
});

finishLineBtn.addEventListener("click", () => {
  store.finishLine();
  linePreview.update([]);
  setStatus("已结束当前线");
  updateLineInfo();
});

undoPointBtn.addEventListener("click", () => {
  store.undoLast();
  linePreview.update(store.getCurrentPoints());
  setStatus("撤销一点");
  updateLineInfo();
});

deleteLineBtn.addEventListener("click", () => {
  const current = store.currentLine();
  if (!current) {
    setStatus("没有当前线可删除");
    return;
  }
  store.removeLine(current.id);
  linePreview.clear();
  updateLineInfo();
  setStatus(`已删除 ${current.id}`);
});

exportJsonBtn.addEventListener("click", () => {
  const json = JSON.stringify(store.toJSON(), null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "segmentation.json";
  a.click();
  URL.revokeObjectURL(url);
  setStatus("已导出 segmentation.json");
});

canvas.addEventListener("pointerdown", async (event) => {
  if (mode === "edit") {
    const hit = pick(event, three.camera, modelRoot);
    if (hit) {
      const target = findNearestEditablePoint(hit.point);
      if (target) {
        draggingTarget = target;
        setStatus(target.kind === "control" ? `拖动控制点 #${target.index + 1}` : `拖动路径点 #${target.index + 1}`);
        three.controls.enableRotate = false;
        return;
      }
    }
  }
  if (mode !== "draw" || event.button !== 0 || !event.shiftKey) return; // require shift to avoid干扰旋转
  const hit = pick(event, three.camera, modelRoot);
  if (!hit) {
    setStatus("未命中模型");
    return;
  }
  const vertexIndex = selectClosestVertex(hit);
  store.addControlPoint({
    position: hit.point,
    faceIndex: hit.faceIndex,
    barycentric: hit.barycentric,
    vertexIndices: hit.vertexIndices,
    vertexIndex,
  });
  // After adding a control point, recompute the entire path to ensure consistency
  recomputePathFromControlPoints();

  const currentCount = store.getCurrentPoints().length;
  setStatus(`当前线点数: ${currentCount} | face #${hit.faceIndex} bary=(${hit.barycentric
    .map((v) => v.toFixed(2))
    .join(",")})`);
  updateLineInfo();
});

setupDragAndDrop(canvas);

canvas.addEventListener("pointermove", (event) => {
  if (!draggingTarget) return;
  const hit = pick(event, three.camera, modelRoot);
  if (!hit) return;
  const vertexIndex = selectClosestVertex(hit);
  if (draggingTarget.kind === "control") {
    store.updateControlPoint(draggingTarget.index, {
      position: hit.point,
      faceIndex: hit.faceIndex,
      barycentric: hit.barycentric,
      vertexIndices: hit.vertexIndices,
      vertexIndex,
    });
    recomputePathFromControlPoints();
  } else if (draggingTarget.kind === "path") {
    updatePathVertex(draggingTarget.index, vertexIndex);
  }
});

canvas.addEventListener("pointerup", () => {
  draggingTarget = null;
  three.controls.enableRotate = mode !== "edit";
});
canvas.addEventListener("pointerleave", () => {
  draggingTarget = null;
  three.controls.enableRotate = mode !== "edit";
});

async function appendPathUsingGraph(hit: ReturnType<typeof pick>) {
  if (!meshGraph) {
    linePreview.update(store.getCurrentPoints());
    return;
  }
  const line = store.currentLine();
  if (!line) return;
  const nearestVertex = selectClosestVertex(hit);
  const prevVertex = line.pathVertices?.length ? line.pathVertices[line.pathVertices.length - 1] : undefined;

  if (prevVertex === undefined) {
    const pos = meshGraph.getPosition(nearestVertex);
    if (pos) {
      store.setPathData(line.id, {
        pathVertices: [nearestVertex],
        pathPositions: new Float32Array(pos.toArray()),
      });
      linePreview.update([pos.clone()]);
    }
    return;
  }

  const path = meshGraph.shortestPath(prevVertex, nearestVertex);
  if (!path.length) {
    linePreview.update(store.getCurrentPoints());
    return;
  }
  const positions: THREE.Vector3[] = [];
  const existing = line.pathPositions ? Array.from(line.pathPositions) : [];
  // convert to Vector3 and merge with existing path (skip duplicate start)
  for (let i = 0; i < path.length; i++) {
    const pos = meshGraph.getPosition(path[i]);
    if (pos) positions.push(pos.clone());
  }
  const merged = new Float32Array(existing.length + positions.length * 3 - 3);
  if (existing.length) merged.set(existing);
  let offset = existing.length;
  for (let i = 0; i < positions.length; i++) {
    if (existing.length && i === 0) continue; // skip duplicate start
    merged[offset++] = positions[i].x;
    merged[offset++] = positions[i].y;
    merged[offset++] = positions[i].z;
  }

  const mergedVertices = [...(line.pathVertices ?? []), ...path.slice(1)]; // skip first to avoid dup
  store.setPathData(line.id, { pathVertices: mergedVertices, pathPositions: merged });

  // Build Vector3 list for preview
  const allPoints: THREE.Vector3[] = [];
  for (let i = 0; i < merged.length; i += 3) {
    allPoints.push(new THREE.Vector3(merged[i], merged[i + 1], merged[i + 2]));
  }
  linePreview.update(allPoints);
}

function selectClosestVertex(hit: ReturnType<typeof pick>): number {
  const weights = hit.barycentric;
  const indices = hit.vertexIndices;
  if (!weights || !indices) return indices?.[0] ?? 0;
  let maxIdx = 0;
  if (weights[1] > weights[maxIdx]) maxIdx = 1;
  if (weights[2] > weights[maxIdx]) maxIdx = 2;
  const origIndex = indices[maxIdx];
  if (meshGraph) {
    const merged = meshGraph.getMergedIndex(origIndex);
    if (merged !== -1) return merged;
  }
  return origIndex;
}

async function loadFromFile(file: File) {
  setStatus(`读取本地 OBJ: ${file.name}`);
  try {
    const group = await loadOBJFromFile(file, { onProgress: handleProgress });
    swapModel(group);
    setStatus("本地模型加载成功");
  } catch (err) {
    setStatus(`OBJ 解析失败: ${(err as Error).message}`);
  } finally {
    handleProgress(0);
  }
}

async function loadFromURL(url: string) {
  setStatus(`加载远程 OBJ: ${url}`);
  try {
    const group = await loadOBJFromURL(url, { onProgress: handleProgress });
    swapModel(group);
    setStatus("远程模型加载成功");
  } catch (err) {
    setStatus(`下载/解析失败: ${(err as Error).message}`);
  } finally {
    handleProgress(0);
  }
}

function swapModel(group: THREE.Group) {
  while (modelRoot.children.length) {
    const child = modelRoot.children.pop();
    if (child) {
      modelRoot.remove(child);
      disposeObject3D(child);
    }
  }

  modelRoot.add(group);
  boundingSize = centerAndFit(group, three.camera, three.controls);
  store.clear();
  linePreview.clear();
  meshGraph = buildMeshGraph(group);
  updateLineInfo();
}

function setStatus(text: string) {
  statusBox.textContent = text;
}

function handleProgress(progress: number) {
  if (!progress || progress <= 0) {
    progressBox.textContent = "idle";
    return;
  }
  const pct = Math.round(progress * 100);
  progressBox.textContent = `${pct}%`;
}

function buildMeshGraph(group: THREE.Group): MeshGraphBuilder | null {
  let found: THREE.Mesh | null = null;
  group.traverse((child) => {
    if (found) return;
    const mesh = child as THREE.Mesh;
    if (mesh.isMesh && mesh.geometry instanceof THREE.BufferGeometry) {
      found = mesh;
    }
  });
  if (!found) return null;
  try {
    return new MeshGraphBuilder(found.geometry as THREE.BufferGeometry);
  } catch (err) {
    console.warn("Failed to build mesh graph", err);
    return null;
  }
}

function rebuildPreview() {
  const line = store.currentLine();
  if (!line) {
    linePreview.update([]);
    return;
  }
  if (line.pathPositions && line.pathPositions.length >= 3) {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i < line.pathPositions.length; i += 3) {
      pts.push(new THREE.Vector3(line.pathPositions[i], line.pathPositions[i + 1], line.pathPositions[i + 2]));
    }
    linePreview.update(pts);
    return;
  }
  linePreview.update(store.getCurrentPoints());
}

function addTestBox() {
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const mat = new THREE.MeshStandardMaterial({
    color: 0x5cd4ff,
    roughness: 0.5,
    metalness: 0.1,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(0, 0.5, 0);
  modelRoot.add(mesh);
  boundingSize = centerAndFit(mesh, three.camera, three.controls);
  store.clear();
  linePreview.clear();
  meshGraph = buildMeshGraph(modelRoot);
  updateLineInfo();
}

function recomputePathFromControlPoints() {
  const line = store.currentLine();
  if (!line || !meshGraph) {
    linePreview.update(store.getCurrentPoints());
    return;
  }
  const cps = line.controlPoints;
  if (cps.length === 0) {
    store.setPathData(line.id, { pathVertices: [], pathPositions: new Float32Array() });
    linePreview.update([]);
    return;
  }

  const positions: number[] = [];
  const pathVertices: number[] = [];

  const pushPos = (pos: THREE.Vector3) => {
    positions.push(pos.x, pos.y, pos.z);
  };

  let currentVertex =
    cps[0].vertexIndex ?? selectClosestVertex({
      point: cps[0].position,
      faceIndex: cps[0].faceIndex ?? -1,
      barycentric: cps[0].barycentric ?? [1, 0, 0],
      vertexIndices: cps[0].vertexIndices ?? [0, 0, 0],
      triangle: [cps[0].position, cps[0].position, cps[0].position],
    } as any);

  const firstPos = meshGraph.getPosition(currentVertex);
  if (firstPos) {
    pushPos(firstPos);
    pathVertices.push(currentVertex);
  }

  for (let i = 1; i < cps.length; i++) {
    const targetVertex = cps[i].vertexIndex ?? currentVertex;
    const segment = meshGraph.shortestPath(currentVertex, targetVertex);
    if (!segment.length) continue;
    // append skipping duplicate start
    for (let j = 1; j < segment.length; j++) {
      const v = segment[j];
      const pos = meshGraph.getPosition(v);
      if (pos) pushPos(pos);
      pathVertices.push(v);
    }
    currentVertex = targetVertex;
  }

  store.setPathData(line.id, {
    pathVertices,
    pathPositions: new Float32Array(positions),
  });

  const pts: THREE.Vector3[] = [];
  for (let i = 0; i < positions.length; i += 3) {
    pts.push(new THREE.Vector3(positions[i], positions[i + 1], positions[i + 2]));
  }
  linePreview.update(pts);
}

function findNearestControlPoint(target: THREE.Vector3): number | null {
  const line = store.currentLine();
  if (!line) return null;
  let nearest = -1;
  let minDist = Infinity;
  line.controlPoints.forEach((p, idx) => {
    const d = p.position.distanceTo(target);
    if (d < minDist) {
      minDist = d;
      nearest = idx;
    }
  });
  if (nearest === -1) return null;
  const threshold = boundingSize * 0.05;
  return minDist <= threshold ? nearest : null;
}

function findNearestEditablePoint(target: THREE.Vector3): { kind: "control"; index: number } | { kind: "path"; index: number } | null {
  const line = store.currentLine();
  if (!line) return null;

  let best: { kind: "control"; index: number } | { kind: "path"; index: number } | null = null;
  let minDist = Infinity;

  // check control points
  line.controlPoints.forEach((p, idx) => {
    const d = p.position.distanceTo(target);
    if (d < minDist) {
      minDist = d;
      best = { kind: "control", index: idx };
    }
  });

  // check path points
  if (line.pathPositions) {
    for (let i = 0; i < line.pathPositions.length; i += 3) {
      const vx = line.pathPositions[i];
      const vy = line.pathPositions[i + 1];
      const vz = line.pathPositions[i + 2];
      const d = target.distanceToSquared(new THREE.Vector3(vx, vy, vz));
      if (d < minDist * minDist) {
        minDist = Math.sqrt(d);
        best = { kind: "path", index: i / 3 };
      }
    }
  }

  const threshold = boundingSize * 0.05;
  return minDist <= threshold ? best : null;
}

function updatePathVertex(pathIndex: number, newVertex: number) {
  const line = store.currentLine();
  if (!line || !meshGraph || !line.pathVertices || !line.pathPositions) return;
  if (pathIndex < 0 || pathIndex >= line.pathVertices.length) return;
  const pos = meshGraph.getPosition(newVertex);
  if (!pos) return;

  const verts = [...line.pathVertices];
  verts[pathIndex] = newVertex;
  const positions = new Float32Array(line.pathPositions);
  positions[pathIndex * 3] = pos.x;
  positions[pathIndex * 3 + 1] = pos.y;
  positions[pathIndex * 3 + 2] = pos.z;

  store.setPathData(line.id, { pathVertices: verts, pathPositions: positions });

  const pts: THREE.Vector3[] = [];
  for (let i = 0; i < positions.length; i += 3) {
    pts.push(new THREE.Vector3(positions[i], positions[i + 1], positions[i + 2]));
  }
  linePreview.update(pts);
}

function setupDragAndDrop(target: HTMLElement) {
  ["dragenter", "dragover"].forEach((name) => {
    target.addEventListener(name, (event) => {
      event.preventDefault();
      event.stopPropagation();
      setStatus("释放以导入 OBJ");
    });
  });

  target.addEventListener("dragleave", (event) => {
    event.preventDefault();
    event.stopPropagation();
    setStatus("准备就绪");
  });

  target.addEventListener("drop", async (event) => {
    event.preventDefault();
    event.stopPropagation();
    const file = event.dataTransfer?.files?.[0];
    if (file) {
      await loadFromFile(file);
    } else {
      setStatus("未检测到文件");
    }
  });
}

function updateLineInfo() {
  const lines = store.getLines();
  const current = store.currentLine();
  lineInfoBox.textContent = `lines: ${lines.length}${current ? ` | 当前: ${current.id}` : ""}`;
  renderLineList(lines, current?.id);
}

// Keep eslint/TS happy until we implement cleanup hooks.
void stopLoop;

function renderLineList(lines: ReturnType<SegmentationStore["getLines"]>, currentId?: string) {
  if (!lineListBody) return;
  if (!lines.length) {
    lineListBody.innerHTML = `<div style="color: var(--muted);">暂无线条</div>`;
    return;
  }

  lineListBody.innerHTML = lines
    .map((line) => {
      const pts = line.controlPoints.length;
      const segs = line.segments?.length ?? 1;
      const active = line.id === currentId;
      const bg = active ? "rgba(76,149,255,0.08)" : "rgba(255,255,255,0.03)";
      const border = active ? "rgba(76,149,255,0.3)" : "rgba(255,255,255,0.05)";
      return `
        <div data-line-id="${line.id}" style="cursor:pointer; padding:6px; margin-bottom:6px; border:1px solid ${border}; border-radius:6px; background:${bg};">
          <div style="font-weight:600;">${line.id}${active ? " (当前)" : ""}</div>
          <div style="font-size:11px; color: var(--muted);">点: ${pts} | 段: ${segs}</div>
        </div>
      `;
    })
    .join("");

  // Add click handlers after HTML is set
  Array.from(lineListBody.querySelectorAll("[data-line-id]")).forEach((el) => {
    el.addEventListener("click", () => {
      const id = (el as HTMLElement).dataset.lineId;
      if (id) {
        console.log(`Switching to line: ${id}`); // Debug log
        store.setCurrentLine(id);
        rebuildPreview();
        updateLineInfo();
        setStatus(`已选中 ${id}`);
      }
    });
  });
}
