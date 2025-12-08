import * as THREE from "three";
import { centerAndFit, disposeObject3D, setupLights } from "./core/three/helpers";
import { loadOBJFromFile, loadOBJFromURL } from "./core/three/loaders";
import { createThree, resizeRenderer, startRenderLoop } from "./core/three/scene";
import { LinePreview } from "./features/segmentation/linePreview";
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
    <h1>Geodesic Viewer</h1>
    <button id="loadDefault">加载默认 OBJ</button>
    <label for="meshFile">导入 OBJ<input id="meshFile" type="file" accept=".obj" /></label>
    <button id="startLine">新建线</button>
    <button id="finishLine">结束线</button>
    <button id="undoPoint">撤销一点</button>
    <button id="exportJson">导出 JSON</button>
    <div id="progress" style="color: var(--muted); font-size: 12px;">idle</div>
  </div>
  <div class="main">
    <canvas id="viewport"></canvas>
    <div class="status" id="status">准备就绪</div>
    <div class="overlay">
      <strong>Shift+单击模型添加控制点</strong>
      线条为屏幕拾取的直线预览，后续会替换成测地线。<br/><br/>
      <strong>拖拽/点击导入 OBJ</strong>
      支持 50MB 模型。默认尝试读取 <code>${DEFAULT_OBJ_URL}</code>。<br/>
      当前线数量会显示在右下角。
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
const exportJsonBtn = document.querySelector<HTMLButtonElement>("#exportJson")!;
const lineInfoBox = document.querySelector<HTMLDivElement>("#lineInfo")!;

const three = createThree(canvas);
setupLights(three.scene);

const modelRoot = new THREE.Group();
three.scene.add(modelRoot);

let boundingSize = 1;
const linePreview = new LinePreview(three.scene, () => boundingSize);
const store = new SegmentationStore();

addTestBox();
resizeRenderer(three);
const stopLoop = startRenderLoop(three);

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
  if (event.button !== 0 || !event.shiftKey) return; // require shift to avoid干扰旋转
  const hit = pick(event, three.camera, modelRoot);
  if (!hit) {
    setStatus("未命中模型");
    return;
  }
  store.addControlPoint({
    position: hit.point,
    faceIndex: hit.faceIndex,
    barycentric: hit.barycentric,
    vertexIndices: hit.vertexIndices,
  });
  linePreview.update(store.getCurrentPoints());
  const currentCount = store.getCurrentPoints().length;
  setStatus(`当前线点数: ${currentCount} | face #${hit.faceIndex} bary=(${hit.barycentric
    .map((v) => v.toFixed(2))
    .join(",")})`);
  updateLineInfo();
});

setupDragAndDrop(canvas);

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
  updateLineInfo();
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
}

// Keep eslint/TS happy until we implement cleanup hooks.
void stopLoop;
