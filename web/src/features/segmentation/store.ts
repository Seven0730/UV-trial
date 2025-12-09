import * as THREE from "three";
import { SegmentLine, SurfacePoint, SegmentationState } from "./types";

export class SegmentationStore {
  private state: SegmentationState = { lines: [] };
  private nextId = 1;

  startLine() {
    const id = `line-${this.nextId++}`;
    this.state.currentLineId = id;
    const line: SegmentLine = { id, controlPoints: [] };
    this.state.lines.push(line);
    return id;
  }

  finishLine() {
    this.state.currentLineId = undefined;
  }

  clear() {
    this.state = { lines: [] };
    this.nextId = 1;
  }

  addControlPoint(sp: SurfacePoint | THREE.Vector3): void {
    const line = this.currentLine();
    if (!line) {
      this.startLine();
      return this.addControlPoint(sp);
    }
    const point: SurfacePoint =
      sp instanceof THREE.Vector3
        ? { position: sp.clone() }
        : {
            position: sp.position.clone(),
            faceIndex: sp.faceIndex,
            barycentric: sp.barycentric,
            vertexIndex: sp.vertexIndex,
            vertexIndices: sp.vertexIndices,
          };
    line.controlPoints.push(point);
    line.pathPositions = new Float32Array(line.controlPoints.flatMap((c) => c.position.toArray()));
  }

  undoLast() {
    const line = this.currentLine();
    if (!line) return;
    line.controlPoints.pop();
    if (line.controlPoints.length === 0) {
      this.removeLine(line.id);
    } else {
      line.pathPositions = new Float32Array(line.controlPoints.flatMap((c) => c.position.toArray()));
    }
  }

  currentLine() {
    if (!this.state.currentLineId) return undefined;
    return this.state.lines.find((l) => l.id === this.state.currentLineId);
  }

  getCurrentPoints(): THREE.Vector3[] {
    const line = this.currentLine();
    return line ? line.controlPoints.map((c) => c.position.clone()) : [];
  }

  getLines() {
    return this.state.lines;
  }

  removeLine(id: string) {
    this.state.lines = this.state.lines.filter((l) => l.id !== id);
    if (this.state.currentLineId === id) {
      this.state.currentLineId = undefined;
    }
  }

  setPathData(lineId: string, data: { pathPositions?: Float32Array; pathVertices?: number[]; pathLength?: number }) {
    const line = this.state.lines.find((l) => l.id === lineId);
    if (!line) return;
    line.pathPositions = data.pathPositions ?? line.pathPositions;
    line.pathVertices = data.pathVertices ?? line.pathVertices;
    line.pathLength = data.pathLength ?? line.pathLength ?? this.computeLength(line.pathPositions);
  }

  setStatus(lineId: string, status: SegmentLine["status"], statusMessage?: string) {
    const line = this.state.lines.find((l) => l.id === lineId);
    if (!line) return;
    line.status = status;
    line.statusMessage = statusMessage;
  }

  toJSON() {
    return {
      lines: this.state.lines.map((l) => ({
        id: l.id,
        controlPoints: l.controlPoints.map((c) => ({
          position: c.position.toArray(),
          faceIndex: c.faceIndex,
          barycentric: c.barycentric,
          vertexIndex: c.vertexIndex,
          vertexIndices: c.vertexIndices,
        })),
        pathVertices: l.pathVertices,
        pathLength: l.pathLength,
        pathPositions: l.pathPositions ? Array.from(l.pathPositions) : undefined,
        status: l.status,
        statusMessage: l.statusMessage,
      })),
    };
  }

  private computeLength(array?: Float32Array) {
    if (!array || array.length < 6) return undefined;
    let length = 0;
    for (let i = 3; i < array.length; i += 3) {
      const dx = array[i] - array[i - 3];
      const dy = array[i + 1] - array[i - 2];
      const dz = array[i + 2] - array[i - 1];
      length += Math.hypot(dx, dy, dz);
    }
    return length;
  }
}
