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
  pathVertices?: number[];
  pathPositions?: Float32Array;
  pathLength?: number;
  status?: "idle" | "pending" | "done" | "error";
  statusMessage?: string;
}

export interface SegmentationState {
  lines: SegmentLine[];
  currentLineId?: string;
}
