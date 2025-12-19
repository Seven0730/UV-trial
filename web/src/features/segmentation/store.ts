import * as THREE from "three";
import { SegmentLine, SurfacePoint, SegmentationState } from "./types";

interface HistoryEntry {
  state: string; // JSON serialized state
  currentLineId?: string;
}

export class SegmentationStore {
  private state: SegmentationState = { lines: [] };
  private nextId = 1;
  private history: HistoryEntry[] = [];
  private historyIndex = -1;
  private maxHistorySize = 50;

  constructor() {
    // 保存初始空状态到历史
    this.saveHistory();
  }

  private saveHistory() {
    // Remove all redo entries when making a new change
    this.history = this.history.slice(0, this.historyIndex + 1);
    
    // Save current state
    const entry: HistoryEntry = {
      state: JSON.stringify(this.serializeState()),
      currentLineId: this.state.currentLineId,
    };
    
    this.history.push(entry);
    
    // Limit history size
    if (this.history.length > this.maxHistorySize) {
      this.history.shift();
    } else {
      this.historyIndex++;
    }
  }

  // 公开方法，用于手动保存历史快照
  saveHistorySnapshot() {
    this.saveHistory();
  }

  private serializeState() {
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
        isClosed: l.isClosed,
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

  private deserializeState(data: any) {
    return {
      lines: data.lines.map((l: any) => ({
        id: l.id,
        controlPoints: l.controlPoints.map((c: any) => ({
          position: new THREE.Vector3().fromArray(c.position),
          faceIndex: c.faceIndex,
          barycentric: c.barycentric,
          vertexIndex: c.vertexIndex,
          vertexIndices: c.vertexIndices,
        })),
        pathVertices: l.pathVertices,
        pathPositions: l.pathPositions ? new Float32Array(l.pathPositions) : undefined,
        isClosed: l.isClosed,
        segments: l.segments?.map((s: any) => ({
          id: s.id,
          points: s.points.map((p: any) => ({
            position: new THREE.Vector3().fromArray(p.position),
            faceIndex: p.faceIndex,
            barycentric: p.barycentric,
            vertexIndex: p.vertexIndex,
            vertexIndices: p.vertexIndices,
          })),
        })),
      })),
    };
  }

  canUndo(): boolean {
    return this.historyIndex > 0;
  }

  canRedo(): boolean {
    return this.historyIndex < this.history.length - 1;
  }

  undo(): boolean {
    if (!this.canUndo()) return false;
    
    this.historyIndex--;
    const entry = this.history[this.historyIndex];
    const savedState = JSON.parse(entry.state);
    this.state.lines = this.deserializeState(savedState).lines;
    this.state.currentLineId = entry.currentLineId;
    
    return true;
  }

  redo(): boolean {
    if (!this.canRedo()) return false;
    
    this.historyIndex++;
    const entry = this.history[this.historyIndex];
    const savedState = JSON.parse(entry.state);
    this.state.lines = this.deserializeState(savedState).lines;
    this.state.currentLineId = entry.currentLineId;
    
    return true;
  }

  startLine(saveToHistory: boolean = true) {
    const id = `line-${this.nextId++}`;
    this.state.currentLineId = id;
    const line: SegmentLine = { id, controlPoints: [] };
    this.state.lines.push(line);
    if (saveToHistory) {
      this.saveHistory();
    }
    return id;
  }

  finishLine() {
    this.state.currentLineId = undefined;
    this.saveHistory();
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
    this.history = [];
    this.historyIndex = -1;
  }

  addControlPoint(sp: SurfacePoint | THREE.Vector3): void {
    const line = this.currentLine();
    if (!line) {
      this.startLine(false);  // 不保存历史，让 addControlPoint 最后一起保存
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
    // 不在这里保存历史，由调用方在设置 pathData 后手动保存
  }

  updateControlPoint(index: number, point: SurfacePoint, saveToHistory: boolean = true) {
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
    if (saveToHistory) {
      this.saveHistory();
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
    this.saveHistory();
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
      version: "1.0",
      timestamp: new Date().toISOString(),
      coordinateSystem: {
        description: "Three.js world space coordinates (centered and scaled model)",
        note: "Model is automatically centered at origin and scaled to fit viewport. Coordinates are after transformation.",
      },
      lines: this.state.lines.map((l) => ({
        id: l.id,
        controlPoints: l.controlPoints.map((c) => ({
          position: c.position.toArray(), // [x, y, z] in world space
          vertexIndex: c.vertexIndex, // Index in mesh geometry
        })),
        // Path vertex indices (can reconstruct full path from mesh)
        pathVertices: l.pathVertices,
      })),
    };
  }

  // 导出详细格式（包含所有数据）
  toDetailedJSON() {
    return {
      version: "1.0-detailed",
      timestamp: new Date().toISOString(),
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
