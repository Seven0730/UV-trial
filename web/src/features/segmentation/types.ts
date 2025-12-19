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
  segments?: Segment[];
  pathVertices?: number[];
  pathPositions?: Float32Array;
  isClosed?: boolean; // 是否为闭合线（套圈）
}

export interface SegmentationState {
  lines: SegmentLine[];
  currentLineId?: string;
}

export interface Segment {
  id: string;
  points: SurfacePoint[];
}
