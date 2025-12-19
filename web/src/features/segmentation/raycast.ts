import * as THREE from "three";

export interface RaycastHit {
  point: THREE.Vector3;
  faceIndex: number;
  barycentric: [number, number, number];
  vertexIndices: [number, number, number];
  triangle: [THREE.Vector3, THREE.Vector3, THREE.Vector3];
}

const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const tmpBary = new THREE.Vector3();

export function pick(
  event: PointerEvent,
  camera: THREE.Camera,
  target: THREE.Object3D,
): RaycastHit | null {
  const rect = (event.target as HTMLElement).getBoundingClientRect();
  ndc.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  ndc.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(ndc, camera);
  const hits = raycaster.intersectObject(target, true);
  if (!hits.length) return null;

  const hit = hits[0];
  const mesh = hit.object as THREE.Mesh;
  const geometry = mesh.geometry as THREE.BufferGeometry;
  const position = geometry.getAttribute("position") as THREE.BufferAttribute | undefined;
  if (!position) return null;

  const faceIndex = hit.faceIndex ?? -1;
  if (faceIndex < 0) return null;

  let a: number, b: number, c: number;
  if (geometry.index) {
    const index = geometry.index;
    a = index.getX(faceIndex * 3);
    b = index.getX(faceIndex * 3 + 1);
    c = index.getX(faceIndex * 3 + 2);
  } else {
    a = faceIndex * 3;
    b = faceIndex * 3 + 1;
    c = faceIndex * 3 + 2;
  }

  const vA = new THREE.Vector3().fromBufferAttribute(position, a);
  const vB = new THREE.Vector3().fromBufferAttribute(position, b);
  const vC = new THREE.Vector3().fromBufferAttribute(position, c);

  THREE.Triangle.getBarycoord(hit.point, vA, vB, vC, tmpBary);

  const result: RaycastHit = {
    point: hit.point.clone(),
    faceIndex,
    barycentric: [tmpBary.x, tmpBary.y, tmpBary.z],
    vertexIndices: [a, b, c],
    triangle: [vA, vB, vC],
  };
  return result;
}

/**
 * 批量射线投射 - 从NDC坐标数组投射到模型
 * @param ndcPoints 归一化设备坐标数组 (x, y 范围 -1 到 1)
 * @param camera 相机
 * @param target 目标对象
 * @returns 命中结果数组（未命中的位置为 null）
 */
export function pickMultiple(
  ndcPoints: THREE.Vector2[],
  camera: THREE.Camera,
  target: THREE.Object3D
): (RaycastHit | null)[] {
  const results: (RaycastHit | null)[] = [];
  const localRaycaster = new THREE.Raycaster();
  const localNdc = new THREE.Vector2();
  const localBary = new THREE.Vector3();

  for (const pt of ndcPoints) {
    localNdc.set(pt.x, pt.y);
    localRaycaster.setFromCamera(localNdc, camera);
    const hits = localRaycaster.intersectObject(target, true);

    if (!hits.length) {
      results.push(null);
      continue;
    }

    const hit = hits[0];
    const mesh = hit.object as THREE.Mesh;
    const geometry = mesh.geometry as THREE.BufferGeometry;
    const position = geometry.getAttribute("position") as THREE.BufferAttribute | undefined;
    
    if (!position || hit.faceIndex === undefined || hit.faceIndex < 0) {
      results.push(null);
      continue;
    }

    const faceIndex = hit.faceIndex;
    let a: number, b: number, c: number;
    
    if (geometry.index) {
      const index = geometry.index;
      a = index.getX(faceIndex * 3);
      b = index.getX(faceIndex * 3 + 1);
      c = index.getX(faceIndex * 3 + 2);
    } else {
      a = faceIndex * 3;
      b = faceIndex * 3 + 1;
      c = faceIndex * 3 + 2;
    }

    const vA = new THREE.Vector3().fromBufferAttribute(position, a);
    const vB = new THREE.Vector3().fromBufferAttribute(position, b);
    const vC = new THREE.Vector3().fromBufferAttribute(position, c);

    THREE.Triangle.getBarycoord(hit.point, vA, vB, vC, localBary);

    results.push({
      point: hit.point.clone(),
      faceIndex,
      barycentric: [localBary.x, localBary.y, localBary.z],
      vertexIndices: [a, b, c],
      triangle: [vA, vB, vC],
    });
  }

  return results;
}
