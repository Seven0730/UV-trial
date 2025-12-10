import * as THREE from "three";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";

export interface ObjLoadOptions {
  onProgress?: (progress01: number) => void;
}

function applyMaterialFallback(group: THREE.Group) {
  group.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      const mesh = child as THREE.Mesh;
      const geometry = mesh.geometry as THREE.BufferGeometry;
      geometry.computeVertexNormals();

      if (Array.isArray(mesh.material)) {
        mesh.material = mesh.material.map((mat) => ensureStandardMaterial(mat));
      } else {
        mesh.material = ensureStandardMaterial(mesh.material);
      }
    }
  });
}

function ensureStandardMaterial(mat: THREE.Material | undefined): THREE.Material {
  if (mat) {
    // Preserve existing material/color; only enforce double side for thin meshes.
    mat.side = THREE.DoubleSide;
    // Enable polygon offset to prevent z-fighting with lines drawn on surface
    (mat as THREE.MeshStandardMaterial).polygonOffset = true;
    (mat as THREE.MeshStandardMaterial).polygonOffsetFactor = 1;
    (mat as THREE.MeshStandardMaterial).polygonOffsetUnits = 1;
    return mat;
  }
  return new THREE.MeshStandardMaterial({
    color: 0xd3d7dd,
    metalness: 0.05,
    roughness: 0.9,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  });
}

export async function loadOBJFromFile(file: File, opts: ObjLoadOptions = {}): Promise<THREE.Group> {
  const text = await file.text();
  const loader = new OBJLoader();
  const group = loader.parse(text);
  applyMaterialFallback(group);
  opts.onProgress?.(1);
  return group;
}

export async function loadOBJFromURL(url: string, opts: ObjLoadOptions = {}): Promise<THREE.Group> {
  const manager = new THREE.LoadingManager();
  const loader = new OBJLoader(manager);

  if (opts.onProgress) {
    manager.onProgress = (_item, loaded, total) => {
      opts.onProgress?.(total ? loaded / total : 0);
    };
  }

  return new Promise((resolve, reject) => {
    loader.load(
      url,
      (group) => {
        applyMaterialFallback(group);
        opts.onProgress?.(1);
        resolve(group);
      },
      (event) => {
        if (!opts.onProgress || !event.total) return;
        const ratio = Math.min(event.loaded / event.total, 1);
        opts.onProgress(ratio);
      },
      (err) => reject(err),
    );
  });
}
