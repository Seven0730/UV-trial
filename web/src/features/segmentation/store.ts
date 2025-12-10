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
      })),
    };
  }
}
