import * as THREE from "three";

interface Neighbor {
  v: number;
  w: number;
}

export class MeshGraphBuilder {
  private positions: THREE.Vector3[] = [];
  private adjacency: Neighbor[][] = [];
  private origToMerged: number[] = [];

  constructor(geometry: THREE.BufferGeometry, private mergeEps = 1e-5) {
    this.build(geometry);
  }

  getPosition(index: number): THREE.Vector3 | undefined {
    return this.positions[index];
  }

  getMergedIndex(originalIndex: number): number {
    if (originalIndex < 0 || originalIndex >= this.origToMerged.length) return -1;
    return this.origToMerged[originalIndex] ?? -1;
  }

  shortestPath(start: number, end: number): number[] {
    const n = this.positions.length;
    if (start < 0 || start >= n || end < 0 || end >= n) return [];
    const dist = new Float64Array(n).fill(Infinity);
    const prev = new Int32Array(n).fill(-1);
    const visited = new Uint8Array(n);

    dist[start] = 0;
    const heap: Array<{ v: number; d: number }> = [{ v: start, d: 0 }];

    while (heap.length) {
      heap.sort((a, b) => a.d - b.d); // small n; keep simple
      const { v, d } = heap.shift()!;
      if (visited[v]) continue;
      visited[v] = 1;
      if (v === end) break;
      for (const { v: nei, w } of this.adjacency[v] ?? []) {
        const nd = d + w;
        if (nd < dist[nei]) {
          dist[nei] = nd;
          prev[nei] = v;
          heap.push({ v: nei, d: nd });
        }
      }
    }

    if (!visited[end]) return [];
    const path: number[] = [];
    for (let v = end; v !== -1; v = prev[v]) path.push(v);
    path.reverse();
    return path;
  }

  private build(geometry: THREE.BufferGeometry) {
    const posAttr = geometry.getAttribute("position") as THREE.BufferAttribute | undefined;
    if (!posAttr) throw new Error("Geometry missing position attribute");
    const indexAttr = geometry.getIndex();

    // merge vertices
    const key = (x: number, y: number, z: number) =>
      `${Math.round(x / this.mergeEps)}_${Math.round(y / this.mergeEps)}_${Math.round(z / this.mergeEps)}`;
    const map = new Map<string, number>();
    this.origToMerged = new Array(posAttr.count);

    for (let i = 0; i < posAttr.count; i++) {
      const v = new THREE.Vector3().fromBufferAttribute(posAttr, i);
      const k = key(v.x, v.y, v.z);
      if (map.has(k)) {
        this.origToMerged[i] = map.get(k)!;
      } else {
        const idx = this.positions.length;
        map.set(k, idx);
        this.origToMerged[i] = idx;
        this.positions.push(v);
      }
    }

    this.adjacency = Array.from({ length: this.positions.length }, () => []);

    const addEdge = (a: number, b: number) => {
      if (a === b) return;
      const w = this.positions[a].distanceTo(this.positions[b]);
      this.adjacency[a].push({ v: b, w });
      this.adjacency[b].push({ v: a, w });
    };

    const addTriangle = (ia: number, ib: number, ic: number) => {
      addEdge(ia, ib);
      addEdge(ib, ic);
      addEdge(ic, ia);
    };

    if (indexAttr) {
      for (let i = 0; i < indexAttr.count; i += 3) {
        const a = this.origToMerged[indexAttr.getX(i)];
        const b = this.origToMerged[indexAttr.getX(i + 1)];
        const c = this.origToMerged[indexAttr.getX(i + 2)];
        addTriangle(a, b, c);
      }
    } else {
      for (let i = 0; i < posAttr.count; i += 3) {
        const a = this.origToMerged[i];
        const b = this.origToMerged[i + 1];
        const c = this.origToMerged[i + 2];
        addTriangle(a, b, c);
      }
    }
  }
}
