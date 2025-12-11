import * as THREE from "three";
import { SegmentLine } from "./types";

export class PathRenderer {
  private group = new THREE.Group();
  private tubeMaterial = new THREE.MeshStandardMaterial({
    color: 0xff5c5c,
    emissive: 0x300a0a,
    emissiveIntensity: 0.5,
    roughness: 0.3,
    metalness: 0.1,
    depthTest: true,
    depthWrite: true,
    polygonOffset: true,
    polygonOffsetFactor: -2, // Negative value pulls line toward camera
    polygonOffsetUnits: -2,
  });

  constructor(private scene: THREE.Scene, private sizeRef: () => number) {
    this.scene.add(this.group);
  }

  render(lines: SegmentLine[]) {
    this.clear();
    const radius = Math.max(this.sizeRef() * 0.0025, 5e-5);

    for (const line of lines) {
      if (!line.pathPositions || line.pathPositions.length < 6) continue;
      const points = this.positionsToPoints(line.pathPositions);
      
      // Use CatmullRomCurve3 for smooth interpolation between points
      const curve = new THREE.CatmullRomCurve3(points, false, "centripetal");
      
      // Increase tubular segments for smoother tube
      const tubularSegments = Math.max(points.length * 4, 32);
      const radialSegments = 8; // Smoother tube cross-section

      const tubeGeo = new THREE.TubeGeometry(curve, tubularSegments, radius, radialSegments, false);
      const tube = new THREE.Mesh(tubeGeo, this.tubeMaterial);
      tube.name = `geodesic-${line.id}`;
      tube.renderOrder = 999; // Render on top of the mesh
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
