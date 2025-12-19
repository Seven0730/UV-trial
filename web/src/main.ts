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
  <div class="main">
    <canvas id="viewport"></canvas>
    
    <!-- 左侧工具栏 -->
    <div class="sidebar" id="sidebar">
      <div class="sidebar-toggle" id="sidebarToggle">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <path d="M5 3l6 5-6 5V3z"/>
        </svg>
      </div>
      
      <div class="sidebar-content" id="sidebarContent">
        <div class="sidebar-header">
          <h1>Segmentation Viewer</h1>
        </div>
        
        <!-- 文件操作组 -->
        <div class="tool-group">
          <div class="group-title">文件操作</div>
          <button id="loadDefault" class="tool-btn">加载默认 OBJ</button>
          <label for="meshFile" class="tool-btn">导入 OBJ 文件<input id="meshFile" type="file" accept=".obj" /></label>
          <button id="exportJson" class="tool-btn">导出 JSON</button>
          <button id="exportObj" class="tool-btn">导出 OBJ (含分割线)</button>
        </div>
        
        <!-- 绘制工具组 -->
        <div class="tool-group">
          <div class="group-title">绘制工具</div>
          <button id="startLine" class="tool-btn">新建线</button>
          <button id="finishLine" class="tool-btn">结束当前线</button>
          <div style="display: flex; gap: 8px;">
            <button id="undoPoint" class="tool-btn" style="flex: 1; margin-bottom: 0;" title="撤销 (Ctrl+Z)">↶ 撤销</button>
            <button id="redoPoint" class="tool-btn" style="flex: 1; margin-bottom: 0;" title="重做 (Ctrl+Y)">↷ 重做</button>
          </div>
          <button id="deleteLine" class="tool-btn danger">删除当前线</button>
        </div>
        
        <!-- 显示设置组 -->
        <div class="tool-group">
          <div class="group-title">显示设置</div>
          <div class="tool-control">
            <label>线粗细</label>
            <input id="lineWidth" type="range" min="0.001" max="0.02" step="0.001" value="0.003" />
          </div>
          <div class="tool-control">
            <label>点大小</label>
            <input id="pointSize" type="range" min="0.002" max="0.02" step="0.001" value="0.006" />
          </div>
          <label class="tool-checkbox">
            <input id="showPoints" type="checkbox" />
            <span>显示路径点</span>
          </label>
        </div>
        
        <!-- 操作模式组 -->
        <div class="tool-group">
          <div class="group-title">操作模式</div>
          <select id="modeSelect" class="tool-select">
            <option value="draw" selected>划线模式</option>
            <option value="edit">微调模式</option>
          </select>
        </div>
        
        <!-- 状态信息 -->
        <div class="tool-group">
          <div id="progress" class="progress-text">idle</div>
        </div>
      </div>
    </div>
    
    <!-- 右侧线列表 -->
    <div class="line-list-panel" id="lineList">
      <div class="panel-header">线列表</div>
      <div id="lineListBody" class="line-list-body">暂无线条</div>
    </div>
    
    <!-- 状态栏 -->
    <div class="status" id="status">准备就绪</div>
    <div class="status bottom-right" id="lineInfo">lines: 0</div>
    
    <!-- 使用说明 -->
    <div class="help-overlay" id="helpOverlay">
      <strong>模式切换</strong> 划线模式：Shift+单击添加点；微调模式：单击拖动已有点，在表面滑动。<br/><br/>
      <strong>撤销/重做</strong> Ctrl+Z 撤销，Ctrl+Y 或 Ctrl+Shift+Z 重做操作。<br/><br/>
      <strong>路径</strong> 依网格边最短路生成，默认隐藏路径点，可通过复选框显示；线/点粗细可调。<br/><br/>
      <strong>拖拽/点击导入 OBJ</strong>，默认加载 <code>test_large.obj</code>。
    </div>
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
const redoPointBtn = document.querySelector<HTMLButtonElement>("#redoPoint")!;
const deleteLineBtn = document.querySelector<HTMLButtonElement>("#deleteLine")!;
const exportJsonBtn = document.querySelector<HTMLButtonElement>("#exportJson")!;
const exportObjBtn = document.querySelector<HTMLButtonElement>("#exportObj")!;
const lineWidthInput = document.querySelector<HTMLInputElement>("#lineWidth") as HTMLInputElement | null;
const pointSizeInput = document.querySelector<HTMLInputElement>("#pointSize") as HTMLInputElement | null;
const showPointsInput = document.querySelector<HTMLInputElement>("#showPoints") as HTMLInputElement | null;
const modeSelect = document.querySelector<HTMLSelectElement>("#modeSelect");
const lineInfoBox = document.querySelector<HTMLDivElement>("#lineInfo")!;
const lineListBody = document.querySelector<HTMLDivElement>("#lineListBody")!;
const sidebar = document.querySelector<HTMLDivElement>("#sidebar")!;
const sidebarToggle = document.querySelector<HTMLDivElement>("#sidebarToggle")!;

// 侧边栏折叠控制
let sidebarCollapsed = false;
sidebarToggle.addEventListener("click", () => {
  sidebarCollapsed = !sidebarCollapsed;
  sidebar.classList.toggle("collapsed", sidebarCollapsed);
});

const three = createThree(canvas);
setupLights(three.scene);

const modelRoot = new THREE.Group();
three.scene.add(modelRoot);

let boundingSize = 1;
const linePreview = new LinePreview(three.scene, () => boundingSize);
const store = new SegmentationStore();
let meshGraph: MeshGraphBuilder | null = null;
let draggingTarget: { kind: "control"; index: number } | { kind: "path"; index: number } | null = null;
let activePathDragControlIndex: number | null = null;
let isDraggingControlPoint = false; // 标记是否正在拖动控制点
type InteractionMode = "draw" | "edit";
let mode: InteractionMode = "draw";

addTestBox();
resizeRenderer(three);
const stopLoop = startRenderLoop(three);
updateUndoRedoButtons(); // 初始化按钮状态
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
  store.startLine(false);  // 不保存历史，等添加第一个点时再保存
  rebuildPreview(); // 重新渲染所有线条（旧线保持可见）
  setStatus("新建线");
  updateLineInfo();
});

finishLineBtn.addEventListener("click", () => {
  store.finishLine();
  rebuildPreview(); // 重新渲染所有线条
  setStatus("已结束当前线");
  updateLineInfo();
});

undoPointBtn.addEventListener("click", () => {
  if (store.undo()) {
    rebuildPreview(); // 撤销后只刷新显示，不重新计算路径
    setStatus("撤销");
    updateLineInfo();
    updateUndoRedoButtons();
  } else {
    setStatus("无可撤销的操作");
  }
});

redoPointBtn.addEventListener("click", () => {
  if (store.redo()) {
    rebuildPreview(); // 重做后只刷新显示，不重新计算路径
    setStatus("重做");
    updateLineInfo();
    updateUndoRedoButtons();
  } else {
    setStatus("无可重做的操作");
  }
});

// 键盘快捷键
window.addEventListener("keydown", (event) => {
  // Ctrl+Z 或 Cmd+Z: 撤销
  if ((event.ctrlKey || event.metaKey) && event.key === "z" && !event.shiftKey) {
    event.preventDefault();
    if (store.undo()) {
      rebuildPreview(); // 撤销后只刷新显示
      setStatus("撤销");
      updateLineInfo();
      updateUndoRedoButtons();
    }
  }
  // Ctrl+Y 或 Cmd+Y 或 Ctrl+Shift+Z: 重做
  if (((event.ctrlKey || event.metaKey) && event.key === "y") || 
      ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key === "z")) {
    event.preventDefault();
    if (store.redo()) {
      rebuildPreview(); // 重做后只刷新显示
      setStatus("重做");
      updateLineInfo();
      updateUndoRedoButtons();
    }
  }
});

function updateUndoRedoButtons() {
  undoPointBtn.disabled = !store.canUndo();
  redoPointBtn.disabled = !store.canRedo();
}

deleteLineBtn.addEventListener("click", () => {
  const current = store.currentLine();
  if (!current) {
    setStatus("没有当前线可删除");
    return;
  }
  store.removeLine(current.id);
  rebuildPreview(); // 重新渲染剩余的线条
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

exportObjBtn.addEventListener("click", () => {
  const objContent = exportMeshWithLines();
  if (!objContent) {
    setStatus("无模型或分割线可导出");
    return;
  }
  
  // 只导出OBJ文件（包含颜色信息）
  const objBlob = new Blob([objContent], { type: "text/plain" });
  const objUrl = URL.createObjectURL(objBlob);
  const objLink = document.createElement("a");
  objLink.href = objUrl;
  objLink.download = "model_with_segmentation.obj";
  objLink.click();
  URL.revokeObjectURL(objUrl);
  
  setStatus("已导出 OBJ 文件（含颜色）");
});

canvas.addEventListener("pointerdown", async (event) => {
  if (mode === "edit") {
    const hit = pick(event, three.camera, modelRoot);
    if (hit) {
      const target = findNearestEditablePoint(hit.point);
      if (target) {
        const line = store.currentLine();
        if (target.kind === "path" && line && meshGraph && line.pathVertices?.length) {
          const pathIndex = target.index;
          const oldVertex = line.pathVertices[pathIndex];
          const directCpIndex = line.controlPoints.findIndex((cp) => cp.vertexIndex === oldVertex);
          if (directCpIndex !== -1) {
            // 拖动已有控制点，保存历史
            store.saveHistorySnapshot();
            isDraggingControlPoint = true;
            activePathDragControlIndex = directCpIndex;
            draggingTarget = { kind: "control", index: directCpIndex };
            setStatus(`拖动控制点 #${directCpIndex + 1}`);
          } else {
            // 插入新控制点，保存历史
            store.saveHistorySnapshot();
            isDraggingControlPoint = true;
            
            // Insert a new control point once at drag start.
            const controlPathIndices: Array<{ cpIndex: number; pathIndex: number }> = [];
            for (let i = 0; i < line.controlPoints.length; i++) {
              const v = line.controlPoints[i].vertexIndex;
              if (v === undefined) continue;
              const pi = line.pathVertices.indexOf(v);
              if (pi !== -1) controlPathIndices.push({ cpIndex: i, pathIndex: pi });
            }
            controlPathIndices.sort((a, b) => a.pathIndex - b.pathIndex);

            let insertAt = line.controlPoints.length;
            for (let i = controlPathIndices.length - 1; i >= 0; i--) {
              if (controlPathIndices[i].pathIndex < pathIndex) {
                insertAt = controlPathIndices[i].cpIndex + 1;
                break;
              }
            }
            if (controlPathIndices.length && controlPathIndices[0].pathIndex > pathIndex) {
              insertAt = controlPathIndices[0].cpIndex;
            }

            line.controlPoints.splice(insertAt, 0, {
              position: line.pathPositions
                ? new THREE.Vector3(
                    line.pathPositions[pathIndex * 3],
                    line.pathPositions[pathIndex * 3 + 1],
                    line.pathPositions[pathIndex * 3 + 2],
                  )
                : hit.point.clone(),
              vertexIndex: oldVertex,
            });
            if (line.segments) {
              line.segments = [
                {
                  id: `${line.id}-seg-1`,
                  points: line.controlPoints.map((p) => ({ ...p, position: p.position.clone() })),
                },
              ];
            }
            recomputePathFromControlPoints();
            activePathDragControlIndex = insertAt;
            draggingTarget = { kind: "control", index: insertAt };
            setStatus(`拖动控制点 #${insertAt + 1} (新插入)`);
          }
        } else {
          // 拖动已有控制点，保存历史
          store.saveHistorySnapshot();
          isDraggingControlPoint = true;
          activePathDragControlIndex = null;
          draggingTarget = target;
          setStatus(target.kind === "control" ? `拖动控制点 #${target.index + 1}` : `拖动路径点 #${target.index + 1}`);
        }
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
  // 路径计算完成后保存历史，确保 pathPositions 也被保存
  store.saveHistorySnapshot();

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
    // 拖动过程中不保存历史
    store.updateControlPoint(draggingTarget.index, {
      position: hit.point,
      faceIndex: hit.faceIndex,
      barycentric: hit.barycentric,
      vertexIndices: hit.vertexIndices,
      vertexIndex,
    }, false);
    recomputePathFromControlPoints();
  } else if (draggingTarget.kind === "path") {
    updatePathVertex(draggingTarget.index, vertexIndex);
  }
});

canvas.addEventListener("pointerup", () => {
  // 拖动结束后保存历史状态
  if (isDraggingControlPoint) {
    store.saveHistorySnapshot();
    updateLineInfo(); // 更新按钮状态
    isDraggingControlPoint = false;
  }
  draggingTarget = null;
  activePathDragControlIndex = null;
  three.controls.enableRotate = mode !== "edit";
});
canvas.addEventListener("pointerleave", () => {
  // 拖动意外结束也保存历史
  if (isDraggingControlPoint) {
    store.saveHistorySnapshot();
    updateLineInfo(); // 更新按钮状态
    isDraggingControlPoint = false;
  }
  draggingTarget = null;
  activePathDragControlIndex = null;
  three.controls.enableRotate = mode !== "edit";
});

async function appendPathUsingGraph(hit: ReturnType<typeof pick>) {
  if (!meshGraph) {
    rebuildPreview();
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
      rebuildPreview();
    }
    return;
  }

  const path = meshGraph.shortestPath(prevVertex, nearestVertex);
  if (!path.length) {
    rebuildPreview();
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

  rebuildPreview();
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
  const lines = store.getLines();
  const currentLine = store.currentLine();
  const currentId = currentLine?.id;
  
  // 渲染所有线条，高亮当前线
  linePreview.renderAllLines(lines, currentId);
  
  // 设置当前选中的线（用于高亮）
  linePreview.setCurrentLine(currentId || null);
  
  // 显示当前线的路径点
  if (currentLine) {
    if (currentLine.pathPositions && currentLine.pathPositions.length >= 3) {
      // 已有路径数据，转换为 Vector3 数组并显示点
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i < currentLine.pathPositions.length; i += 3) {
        pts.push(new THREE.Vector3(
          currentLine.pathPositions[i],
          currentLine.pathPositions[i + 1],
          currentLine.pathPositions[i + 2]
        ));
      }
      linePreview.update(pts);
    } else {
      // 没有路径数据，显示控制点
      linePreview.update(store.getCurrentPoints());
    }
  } else {
    // 没有当前线，清除路径点显示
    linePreview.update([]);
  }
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
    rebuildPreview();
    return;
  }
  const cps = line.controlPoints;
  if (cps.length === 0) {
    store.setPathData(line.id, { pathVertices: [], pathPositions: new Float32Array() });
    rebuildPreview();
    return;
  }

  const pathVertices: number[] = [];
  const smoothPositions: THREE.Vector3[] = [];

  let currentVertex =
    cps[0].vertexIndex ?? selectClosestVertex({
      point: cps[0].position,
      faceIndex: cps[0].faceIndex ?? -1,
      barycentric: cps[0].barycentric ?? [1, 0, 0],
      vertexIndices: cps[0].vertexIndices ?? [0, 0, 0],
      triangle: [cps[0].position, cps[0].position, cps[0].position],
    } as any);

  pathVertices.push(currentVertex);

  // 收集所有控制点对应的顶点
  const controlVertices: number[] = [currentVertex];
  for (let i = 1; i < cps.length; i++) {
    const targetVertex = cps[i].vertexIndex ?? currentVertex;
    controlVertices.push(targetVertex);
    currentVertex = targetVertex;
  }

  // 对每段使用平滑路径
  for (let i = 0; i < controlVertices.length - 1; i++) {
    const startV = controlVertices[i];
    const endV = controlVertices[i + 1];
    
    // 使用 A* + 简化 + 平滑
    const smoothSegment = meshGraph.getSmoothPath(startV, endV, 4);
    
    // 同时获取原始顶点路径用于存储
    const rawSegment = meshGraph.shortestPath(startV, endV);
    
    // 合并顶点（跳过重复的起点）
    if (i === 0) {
      pathVertices.length = 0; // 清空，重新填充
      pathVertices.push(...rawSegment);
    } else {
      pathVertices.push(...rawSegment.slice(1));
    }
    
    // 合并平滑位置（跳过重复的起点）
    if (i === 0) {
      smoothPositions.push(...smoothSegment);
    } else if (smoothSegment.length > 0) {
      smoothPositions.push(...smoothSegment.slice(1));
    }
  }

  // 如果只有一个控制点
  if (controlVertices.length === 1) {
    const pos = meshGraph.getPosition(controlVertices[0]);
    if (pos) {
      smoothPositions.push(pos.clone());
    }
  }

  // 转换为 Float32Array
  const positions = new Float32Array(smoothPositions.length * 3);
  for (let i = 0; i < smoothPositions.length; i++) {
    positions[i * 3] = smoothPositions[i].x;
    positions[i * 3 + 1] = smoothPositions[i].y;
    positions[i * 3 + 2] = smoothPositions[i].z;
  }

  store.setPathData(line.id, {
    pathVertices,
    pathPositions: positions,
  });

  // 更新当前线的实时预览，同时保持其他线可见
  rebuildPreview();
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
  const prevVertex = pathIndex > 0 ? line.pathVertices[pathIndex - 1] : null;
  const nextVertex = pathIndex < line.pathVertices.length - 1 ? line.pathVertices[pathIndex + 1] : null;

  const leftPath = prevVertex !== null ? meshGraph.shortestPath(prevVertex, newVertex) : [newVertex];
  const rightPath = nextVertex !== null ? meshGraph.shortestPath(newVertex, nextVertex) : [newVertex];

  if ((prevVertex !== null && leftPath.length === 0) || (nextVertex !== null && rightPath.length === 0)) {
    const verts = [...line.pathVertices];
    verts[pathIndex] = newVertex;
    const positions = new Float32Array(line.pathPositions);
    positions[pathIndex * 3] = pos.x;
    positions[pathIndex * 3 + 1] = pos.y;
    positions[pathIndex * 3 + 2] = pos.z;
    store.setPathData(line.id, { pathVertices: verts, pathPositions: positions });
    rebuildPreview();
    return;
  }

  const prefix = line.pathVertices.slice(0, pathIndex);
  const suffix = nextVertex !== null ? line.pathVertices.slice(pathIndex + 2) : [];
  const leftSegment = prevVertex !== null ? leftPath.slice(1) : leftPath;
  const rightSegment = nextVertex !== null ? rightPath.slice(1) : [];
  const verts = [...prefix, ...leftSegment, ...rightSegment, ...suffix];

  const positions: number[] = [];
  for (const v of verts) {
    const p = meshGraph.getPosition(v);
    if (!p) continue;
    positions.push(p.x, p.y, p.z);
  }

  store.setPathData(line.id, { pathVertices: verts, pathPositions: new Float32Array(positions) });
  rebuildPreview();
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
  updateUndoRedoButtons();
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

function exportMeshWithLines(): string | null {
  // 获取原始网格数据
  let mesh: THREE.Mesh | null = null;
  modelRoot.traverse((child) => {
    if ((child as THREE.Mesh).isMesh && !mesh) {
      mesh = child as THREE.Mesh;
    }
  });

  if (!mesh || !meshGraph) return null;

  const geometry = mesh.geometry as THREE.BufferGeometry;
  const position = geometry.getAttribute("position");
  const normal = geometry.getAttribute("normal");
  const colorAttr = geometry.getAttribute("color"); // 获取顶点颜色属性
  const index = geometry.index;

  if (!position) return null;

  // 获取原始材质颜色作为默认颜色
  // 使用一个中性的灰色作为默认
  let defaultMeshColor = { r: 0.75, g: 0.75, b: 0.75 }; // 默认灰色
  const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
  if (material) {
    const mat = material as THREE.MeshStandardMaterial;
    // 如果材质没有启用 vertexColors 并且有颜色，使用材质颜色
    if (!mat.vertexColors && mat.color) {
      defaultMeshColor = { r: mat.color.r, g: mat.color.g, b: mat.color.b };
    }
  }

  // 检查是否有顶点颜色
  const hasVertexColors = colorAttr !== null && colorAttr !== undefined;

  let objContent = "# OBJ Export with Segmentation Lines and Colors\n";
  objContent += `# Generated: ${new Date().toISOString()}\n`;
  objContent += `# Vertices: ${position.count}\n`;
  objContent += `# Faces: ${index ? index.count / 3 : position.count / 3}\n`;
  objContent += "# Vertex Colors: Yes\n";
  objContent += "# Vertex format: v x y z r g b (RGB range 0-1)\n\n";

  // 导出所有顶点（带颜色）
  objContent += "# Mesh Vertices (with color)\n";
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    
    let r: number, g: number, b: number;
    if (hasVertexColors) {
      // 使用原始顶点颜色
      r = colorAttr.getX(i);
      g = colorAttr.getY(i);
      b = colorAttr.getZ(i);
    } else {
      // 使用材质颜色或默认颜色
      r = defaultMeshColor.r;
      g = defaultMeshColor.g;
      b = defaultMeshColor.b;
    }
    
    objContent += `v ${x.toFixed(6)} ${y.toFixed(6)} ${z.toFixed(6)} ${r.toFixed(6)} ${g.toFixed(6)} ${b.toFixed(6)}\n`;
  }
  objContent += "\n";

  // 导出法向量（如果有）
  if (normal) {
    objContent += "# Vertex Normals\n";
    for (let i = 0; i < normal.count; i++) {
      const nx = normal.getX(i);
      const ny = normal.getY(i);
      const nz = normal.getZ(i);
      objContent += `vn ${nx.toFixed(6)} ${ny.toFixed(6)} ${nz.toFixed(6)}\n`;
    }
    objContent += "\n";
  }

  // 导出面
  objContent += "# Mesh Faces\n";
  objContent += "g mesh\n";
  
  if (index) {
    const faceCount = index.count / 3;
    for (let i = 0; i < faceCount; i++) {
      const a = index.getX(i * 3) + 1;
      const b = index.getX(i * 3 + 1) + 1;
      const c = index.getX(i * 3 + 2) + 1;
      
      if (normal) {
        objContent += `f ${a}//${a} ${b}//${b} ${c}//${c}\n`;
      } else {
        objContent += `f ${a} ${b} ${c}\n`;
      }
    }
  } else {
    const faceCount = position.count / 3;
    for (let i = 0; i < faceCount; i++) {
      const a = i * 3 + 1;
      const b = i * 3 + 2;
      const c = i * 3 + 3;
      
      if (normal) {
        objContent += `f ${a}//${a} ${b}//${b} ${c}//${c}\n`;
      } else {
        objContent += `f ${a} ${b} ${c}\n`;
      }
    }
  }
  objContent += "\n";

  // 导出分割线（红色顶点）
  const lines = store.getLines();
  if (lines.length > 0 && meshGraph) {
    objContent += "# Segmentation Lines (red color)\n";
    
    let lineVertexOffset = position.count + 1;
    
    lines.forEach((line, lineIdx) => {
      if (!line.pathVertices || line.pathVertices.length < 2) return;
      
      objContent += `# Line: ${line.id}\n`;
      objContent += `g line_${lineIdx + 1}\n`;
      
      // 为这条线导出新的顶点（红色）
      const lineVertices: number[] = [];
      for (const vertexIdx of line.pathVertices) {
        const pos = meshGraph.getPosition(vertexIdx);
        if (pos) {
          // 红色顶点
          objContent += `v ${pos.x.toFixed(6)} ${pos.y.toFixed(6)} ${pos.z.toFixed(6)} 1.000 0.000 0.000\n`;
          lineVertices.push(lineVertexOffset++);
        }
      }
      
      // 导出线段
      for (let i = 0; i < lineVertices.length - 1; i++) {
        objContent += `l ${lineVertices[i]} ${lineVertices[i + 1]}\n`;
      }
      objContent += "\n";
    });
  }

  return objContent;
}
