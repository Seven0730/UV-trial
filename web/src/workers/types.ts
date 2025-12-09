export interface InitMeshMessage {
  type: "init-mesh";
  positions: Float32Array;
  indices: Uint32Array | Uint16Array;
}

export interface ComputeGeodesicMessage {
  type: "compute-geodesic";
  sourceVertex: number;
  t?: number;
}

export interface DisposeMessage {
  type: "dispose";
}

export type IncomingMessage = InitMeshMessage | ComputeGeodesicMessage | DisposeMessage;

export interface GeodesicResult {
  distances: Float32Array;
  pathVertices: number[];
  pathPositions: Float32Array;
  length?: number;
}

export interface GeodesicResponse {
  type: "geodesic-result" | "error";
  requestId: string;
  payload?: GeodesicResult;
  error?: string;
}
