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

  setCurrentLine(lineId: string) {
    const line = this.state.lines.find((l) => l.id === lineId);
    if (line) {
      this.state.currentLineId = lineId;
    }
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
    if (!line.segments) {
      line.segments = [];
    }
    if (line.segments.length === 0) {
      line.segments.push({ id: `${line.id}-seg-1`, points: [] });
    }
    const segment = line.segments[line.segments.length - 1];
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
    segment.points.push(point);
  }

  updateControlPoint(index: number, point: SurfacePoint) {
    const line = this.currentLine();
    if (!line) return;
    if (index < 0 || index >= line.controlPoints.length) return;
    const updated: SurfacePoint = {
      position: point.position.clone(),
      faceIndex: point.faceIndex,
      barycentric: point.barycentric,
      vertexIndex: point.vertexIndex,
      vertexIndices: point.vertexIndices,
    };
    line.controlPoints[index] = updated;
    if (line.segments) {
      let offset = 0;
      for (const seg of line.segments) {
        if (index < offset + seg.points.length) {
          seg.points[index - offset] = { ...updated, position: updated.position.clone() };
          break;
        }
        offset += seg.points.length;
      }
    }
  }

  setPathData(lineId: string, data: { pathPositions?: Float32Array; pathVertices?: number[] }) {
    const line = this.state.lines.find((l) => l.id === lineId);
    if (!line) return;
    line.pathPositions = data.pathPositions ?? line.pathPositions;
    line.pathVertices = data.pathVertices ?? line.pathVertices;
  }

  undoLast() {
    const line = this.currentLine();
    if (!line) return;
    const point = line.controlPoints.pop();
    if (line.segments && line.segments.length) {
      const lastSeg = line.segments[line.segments.length - 1];
      if (lastSeg.points.length) {
        lastSeg.points.pop();
      }
      if (lastSeg.points.length === 0) {
        line.segments.pop();
      }
    }
    if (line.controlPoints.length === 0) {
      this.removeLine(line.id);
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

  addSegment(lineId?: string) {
    let line = lineId ? this.state.lines.find((l) => l.id === lineId) : this.currentLine();
    if (!line) {
      const newId = this.startLine();
      line = this.state.lines.find((l) => l.id === newId);
    }
    if (!line) return;
    if (!line.segments) line.segments = [];
    const segId = `${line.id}-seg-${(line.segments.length || 0) + 1}`;
    line.segments.push({ id: segId, points: [] });
    return segId;
  }

  updateSegment(lineId: string, segmentId: string, points: SurfacePoint[]) {
    const line = this.state.lines.find((l) => l.id === lineId);
    if (!line || !line.segments) return;
    const seg = line.segments.find((s) => s.id === segmentId);
    if (!seg) return;
    seg.points = points.map((p) => ({
      position: p.position.clone(),
      faceIndex: p.faceIndex,
      barycentric: p.barycentric,
      vertexIndex: p.vertexIndex,
      vertexIndices: p.vertexIndices,
    }));
    // refresh aggregated control points
    line.controlPoints = line.segments.flatMap((s) => s.points.map((p) => ({ ...p, position: p.position.clone() })));
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
        pathPositions: l.pathPositions ? Array.from(l.pathPositions) : undefined,
        segments: l.segments?.map((s) => ({
          id: s.id,
          points: s.points.map((p) => ({
            position: p.position.toArray(),
            faceIndex: p.faceIndex,
            barycentric: p.barycentric,
            vertexIndex: p.vertexIndex,
            vertexIndices: p.vertexIndices,
          })),
        })),
      })),
    };
  }
}
