import * as THREE from "three";
import { SegmentLine } from "./types";

export class PathRenderer {
  private group = new THREE.Group();
  private tubeMaterial = new THREE.MeshStandardMaterial({
    color: 0x00c2ff,
    emissive: 0x001018,
    roughness: 0.35,
    metalness: 0.05,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });

  constructor(private scene: THREE.Scene, private sizeRef: () => number) {
    this.scene.add(this.group);
  }

  render(lines: SegmentLine[]) {
    this.clear();
    const radius = Math.max(this.sizeRef() * 0.004, 1e-4);

    for (const line of lines) {
      if (!line.pathPositions || line.pathPositions.length < 6) continue;
      const points = this.positionsToPoints(line.pathPositions);
      const curve = new THREE.CatmullRomCurve3(points, false, "centripetal");
      const tubularSegments = Math.max(points.length * 2, 16);

      const tubeGeo = new THREE.TubeGeometry(curve, tubularSegments, radius, 6, false);
      const tube = new THREE.Mesh(tubeGeo, this.tubeMaterial);
      tube.name = `geodesic-${line.id}`;
      this.group.add(tube);
    }
  }

  clear() {
    while (this.group.children.length) {
      const child = this.group.children.pop()!;
      this.group.remove(child);
      const mesh = child as THREE.Mesh;
      mesh.geometry?.dispose?.();
    }
  }

  private positionsToPoints(array: Float32Array): THREE.Vector3[] {
    const points: THREE.Vector3[] = [];
    for (let i = 0; i < array.length; i += 3) {
      points.push(new THREE.Vector3(array[i], array[i + 1], array[i + 2]));
    }
    return points;
  }
}
