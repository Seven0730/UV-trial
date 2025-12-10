import * as THREE from "three";

export interface SurfacePoint {
  vertexIndex?: number;
  vertexIndices?: [number, number, number];
  faceIndex?: number;
  barycentric?: [number, number, number];
  position: THREE.Vector3;
}

export interface SegmentLine {
  id: string;
  controlPoints: SurfacePoint[];
}

export interface SegmentationState {
  lines: SegmentLine[];
  currentLineId?: string;
}
