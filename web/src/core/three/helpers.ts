import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

export function setupLights(scene: THREE.Scene): THREE.Group {
  const group = new THREE.Group();

  const hemi = new THREE.HemisphereLight(0xffffff, 0x222222, 1.0);
  group.add(hemi);

  const dir = new THREE.DirectionalLight(0xffffff, 0.8);
  dir.position.set(1, 1, 1);
  group.add(dir);

  const fill = new THREE.DirectionalLight(0xffffff, 0.25);
  fill.position.set(-1, -0.5, 0.5);
  group.add(fill);

  scene.add(group);
  return group;
}

export function centerAndFit(
  object: THREE.Object3D,
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls,
): number {
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());

  const maxDim = Math.max(size.x, size.y, size.z);
  const fov = (camera.fov * Math.PI) / 180;
  const distance = Math.max(maxDim / (2 * Math.tan(fov / 2)), 0.001);
  const offset = 1.6;

  camera.position.copy(center);
  camera.position.x += distance * 0.8;
  camera.position.y += distance * 0.6;
  camera.position.z += distance * offset;
  camera.near = distance / 100;
  camera.far = distance * 100;
  camera.updateProjectionMatrix();

  controls.target.copy(center);
  controls.update();

  return size.length() || 1;
}

export function disposeObject3D(obj: THREE.Object3D) {
  obj.traverse((child) => {
    if ("geometry" in child && child.geometry instanceof THREE.BufferGeometry) {
      child.geometry.dispose();
    }
    if ("material" in child) {
      const mat = child.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) {
        mat.forEach((m) => m?.dispose());
      } else {
        mat?.dispose?.();
      }
    }
  });
}
