// Web Worker skeleton for the Heat Method geodesic solver.
// This currently only defines message plumbing; actual geometry-processing-js logic will be wired later.

import {
  ComputeGeodesicMessage,
  GeodesicResponse,
  GeodesicResult,
  IncomingMessage,
} from "./types";

let meshReady = false;
let positions: Float32Array | null = null;
let indices: Uint32Array | Uint16Array | null = null;

// Placeholder solver; replace with real Heat Method once geometry-processing-js is wired.
async function solveGeodesic(_sourceVertex: number, _t = 1e-3): Promise<GeodesicResult> {
  if (!positions || !indices) {
    throw new Error("Mesh not initialized");
  }

  // TODO: hook up geometry-processing-js Heat Method here.
  // For now, return an empty path so the main thread plumbing can be developed.
  return {
    distances: new Float32Array(positions.length / 3),
    pathVertices: [],
    pathPositions: new Float32Array(),
  };
}

self.onmessage = async (event: MessageEvent) => {
  const { data } = event;
  const msg = data as IncomingMessage & { requestId?: string };
  const requestId = msg.requestId ?? "unknown";

  try {
    switch (msg.type) {
      case "init-mesh": {
        positions = msg.positions;
        indices = msg.indices;
        meshReady = true;
        break;
      }
      case "compute-geodesic": {
        if (!meshReady || !positions || !indices) {
          throw new Error("Mesh not initialized");
        }
        const result = await solveGeodesic(msg.sourceVertex, msg.t);
        postMessage(<GeodesicResponse>{
          type: "geodesic-result",
          requestId,
          payload: result,
        });
        break;
      }
      case "dispose": {
        positions = null;
        indices = null;
        meshReady = false;
        close();
        break;
      }
      default:
        throw new Error(`Unknown message type: ${(msg as IncomingMessage).type}`);
    }
  } catch (err) {
    postMessage(<GeodesicResponse>{
      type: "error",
      requestId,
      error: (err as Error).message,
    });
  }
};
