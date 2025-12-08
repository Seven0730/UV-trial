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
