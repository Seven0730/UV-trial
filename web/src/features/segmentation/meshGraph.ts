import * as THREE from "three";

interface Neighbor {
  v: number;
  w: number;
}

/**
 * 最小堆实现，用于 A* 算法
 */
class MinHeap {
  private heap: Array<{ v: number; f: number }> = [];
  private indexMap: Map<number, number> = new Map();

  get length(): number {
    return this.heap.length;
  }

  push(v: number, f: number): void {
    if (this.indexMap.has(v)) {
      this.decreaseKey(v, f);
      return;
    }
    this.heap.push({ v, f });
    const idx = this.heap.length - 1;
    this.indexMap.set(v, idx);
    this.bubbleUp(idx);
  }

  pop(): { v: number; f: number } | undefined {
    if (this.heap.length === 0) return undefined;
    const min = this.heap[0];
    const last = this.heap.pop()!;
    this.indexMap.delete(min.v);
    if (this.heap.length > 0) {
      this.heap[0] = last;
      this.indexMap.set(last.v, 0);
      this.bubbleDown(0);
    }
    return min;
  }

  private decreaseKey(v: number, f: number): void {
    const idx = this.indexMap.get(v);
    if (idx === undefined) return;
    if (f < this.heap[idx].f) {
      this.heap[idx].f = f;
      this.bubbleUp(idx);
    }
  }

  private bubbleUp(idx: number): void {
    while (idx > 0) {
      const parent = Math.floor((idx - 1) / 2);
      if (this.heap[parent].f <= this.heap[idx].f) break;
      this.swap(parent, idx);
      idx = parent;
    }
  }

  private bubbleDown(idx: number): void {
    const n = this.heap.length;
    while (true) {
      const left = 2 * idx + 1;
      const right = 2 * idx + 2;
      let smallest = idx;
      if (left < n && this.heap[left].f < this.heap[smallest].f) smallest = left;
      if (right < n && this.heap[right].f < this.heap[smallest].f) smallest = right;
      if (smallest === idx) break;
      this.swap(smallest, idx);
      idx = smallest;
    }
  }

  private swap(i: number, j: number): void {
    const a = this.heap[i];
    const b = this.heap[j];
    this.heap[i] = b;
    this.heap[j] = a;
    this.indexMap.set(a.v, j);
    this.indexMap.set(b.v, i);
  }
}

export class MeshGraphBuilder {
  private positions: THREE.Vector3[] = [];
  private adjacency: Neighbor[][] = [];
  private origToMerged: number[] = [];
  private avgEdgeLength = 0;

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

  getAverageEdgeLength(): number {
    return this.avgEdgeLength;
  }

  /**
   * A* 最短路径搜索 - 比 Dijkstra 更快
   */
  shortestPath(start: number, end: number): number[] {
    const n = this.positions.length;
    if (start < 0 || start >= n || end < 0 || end >= n) return [];
    if (start === end) return [start];

    const endPos = this.positions[end];
    
    // 启发式函数：欧几里得距离
    const heuristic = (v: number): number => {
      return this.positions[v].distanceTo(endPos);
    };

    const gScore = new Float64Array(n).fill(Infinity);
    const fScore = new Float64Array(n).fill(Infinity);
    const prev = new Int32Array(n).fill(-1);
    const closed = new Uint8Array(n);

    gScore[start] = 0;
    fScore[start] = heuristic(start);

    const openSet = new MinHeap();
    openSet.push(start, fScore[start]);

    while (openSet.length > 0) {
      const current = openSet.pop()!;
      const u = current.v;

      if (u === end) break;
      if (closed[u]) continue;
      closed[u] = 1;

      for (const { v: neighbor, w } of this.adjacency[u] ?? []) {
        if (closed[neighbor]) continue;

        const tentativeG = gScore[u] + w;
        if (tentativeG < gScore[neighbor]) {
          prev[neighbor] = u;
          gScore[neighbor] = tentativeG;
          fScore[neighbor] = tentativeG + heuristic(neighbor);
          openSet.push(neighbor, fScore[neighbor]);
        }
      }
    }

    if (prev[end] === -1 && start !== end) return [];

    // 重建路径
    const path: number[] = [];
    for (let v = end; v !== -1; v = prev[v]) {
      path.push(v);
    }
    path.reverse();
    return path;
  }

  /**
   * Douglas-Peucker 路径简化算法
   * 保留关键拐点，移除冗余点
   */
  simplifyPath(vertexIndices: number[], epsilon?: number): number[] {
    if (vertexIndices.length <= 2) return vertexIndices;

    // 默认 epsilon 为平均边长的 10%
    const eps = epsilon ?? this.avgEdgeLength * 0.1;

    const points = vertexIndices.map(i => this.positions[i]);
    const keep = new Array(points.length).fill(false);
    keep[0] = true;
    keep[points.length - 1] = true;

    this.douglasPeuckerRecursive(points, 0, points.length - 1, eps, keep);

    return vertexIndices.filter((_, i) => keep[i]);
  }

  private douglasPeuckerRecursive(
    points: THREE.Vector3[],
    start: number,
    end: number,
    epsilon: number,
    keep: boolean[]
  ): void {
    if (end - start < 2) return;

    let maxDist = 0;
    let maxIndex = start;

    const lineStart = points[start];
    const lineEnd = points[end];
    const lineDir = new THREE.Vector3().subVectors(lineEnd, lineStart);
    const lineLength = lineDir.length();

    if (lineLength > 1e-10) {
      lineDir.normalize();

      for (let i = start + 1; i < end; i++) {
        const point = points[i];
        const toPoint = new THREE.Vector3().subVectors(point, lineStart);
        const projection = toPoint.dot(lineDir);
        
        let dist: number;
        if (projection <= 0) {
          dist = point.distanceTo(lineStart);
        } else if (projection >= lineLength) {
          dist = point.distanceTo(lineEnd);
        } else {
          const closestPoint = new THREE.Vector3()
            .copy(lineStart)
            .addScaledVector(lineDir, projection);
          dist = point.distanceTo(closestPoint);
        }

        if (dist > maxDist) {
          maxDist = dist;
          maxIndex = i;
        }
      }
    }

    if (maxDist > epsilon) {
      keep[maxIndex] = true;
      this.douglasPeuckerRecursive(points, start, maxIndex, epsilon, keep);
      this.douglasPeuckerRecursive(points, maxIndex, end, epsilon, keep);
    }
  }

  /**
   * 获取平滑路径
   * 结合 A* + 简化 + Catmull-Rom 插值 + 等距重采样
   */
  getSmoothPath(start: number, end: number, samplesPerSegment = 4): THREE.Vector3[] {
    // 1. A* 搜索
    const rawPath = this.shortestPath(start, end);
    if (rawPath.length < 2) {
      return rawPath.map(i => this.positions[i].clone());
    }

    // 2. 路径简化
    const simplified = this.simplifyPath(rawPath);
    if (simplified.length < 2) {
      return rawPath.map(i => this.positions[i].clone());
    }

    // 3. Catmull-Rom 样条插值
    const controlPoints = simplified.map(i => this.positions[i]);
    const smoothed = this.catmullRomInterpolate(controlPoints, samplesPerSegment);
    
    // 4. 等距重采样，使点分布均匀
    return this.resampleByArcLength(smoothed);
  }

  /**
   * 等距重采样 - 使路径点均匀分布
   */
  resampleByArcLength(points: THREE.Vector3[], spacing?: number): THREE.Vector3[] {
    if (points.length < 2) return points.map(p => p.clone());

    // 计算总弧长
    let totalLength = 0;
    const segmentLengths: number[] = [];
    for (let i = 1; i < points.length; i++) {
      const len = points[i].distanceTo(points[i - 1]);
      segmentLengths.push(len);
      totalLength += len;
    }

    if (totalLength < 1e-6) return [points[0].clone()];

    // 目标采样间距：使用传入值或平均边长的2倍
    const targetSpacing = spacing ?? this.avgEdgeLength * 2;
    const numSamples = Math.max(2, Math.ceil(totalLength / targetSpacing) + 1);
    const sampleSpacing = totalLength / (numSamples - 1);

    const result: THREE.Vector3[] = [points[0].clone()];
    
    let accumulatedLength = 0;
    let targetLength = sampleSpacing;
    let segmentIndex = 0;
    let segmentStart = 0;

    while (result.length < numSamples && segmentIndex < segmentLengths.length) {
      const segmentEnd = segmentStart + segmentLengths[segmentIndex];

      while (targetLength <= segmentEnd && result.length < numSamples) {
        // 在当前段内插值
        const t = (targetLength - segmentStart) / segmentLengths[segmentIndex];
        const interpolated = new THREE.Vector3().lerpVectors(
          points[segmentIndex],
          points[segmentIndex + 1],
          t
        );
        result.push(interpolated);
        targetLength += sampleSpacing;
      }

      segmentStart = segmentEnd;
      segmentIndex++;
    }

    // 确保最后一个点是终点
    if (result.length > 0) {
      const lastPoint = result[result.length - 1];
      const endPoint = points[points.length - 1];
      if (lastPoint.distanceTo(endPoint) > sampleSpacing * 0.1) {
        result.push(endPoint.clone());
      } else {
        result[result.length - 1] = endPoint.clone();
      }
    }

    return result;
  }

  /**
   * Catmull-Rom 样条插值
   */
  private catmullRomInterpolate(
    points: THREE.Vector3[],
    samplesPerSegment: number
  ): THREE.Vector3[] {
    if (points.length < 2) return points.map(p => p.clone());
    if (points.length === 2) {
      // 两点之间线性插值
      const result: THREE.Vector3[] = [];
      for (let i = 0; i <= samplesPerSegment; i++) {
        const t = i / samplesPerSegment;
        result.push(new THREE.Vector3().lerpVectors(points[0], points[1], t));
      }
      return result;
    }

    const result: THREE.Vector3[] = [];
    
    // 使用 Three.js 内置的 CatmullRomCurve3
    const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal', 0.5);
    const totalSamples = (points.length - 1) * samplesPerSegment + 1;
    
    for (let i = 0; i < totalSamples; i++) {
      const t = i / (totalSamples - 1);
      result.push(curve.getPoint(t));
    }

    return result;
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

    let totalEdgeLength = 0;
    let edgeCount = 0;
    const edgeSet = new Set<string>();

    const addEdge = (a: number, b: number) => {
      if (a === b) return;
      // 避免重复边
      const edgeKey = a < b ? `${a}_${b}` : `${b}_${a}`;
      if (edgeSet.has(edgeKey)) return;
      edgeSet.add(edgeKey);

      const w = this.positions[a].distanceTo(this.positions[b]);
      this.adjacency[a].push({ v: b, w });
      this.adjacency[b].push({ v: a, w });
      totalEdgeLength += w;
      edgeCount++;
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

    this.avgEdgeLength = edgeCount > 0 ? totalEdgeLength / edgeCount : 0.01;
  }

  /**
   * 生成闭合环路
   * 将一系列表面顶点连接成闭合路径
   * @param surfaceVertices 表面顶点索引数组
   * @returns 闭合路径数据
   */
  generateClosedLoop(surfaceVertices: number[]): {
    pathVertices: number[];
    pathPositions: Float32Array;
  } | null {
    if (surfaceVertices.length < 3) return null;

    // 过滤无效顶点
    const validVertices = surfaceVertices.filter(v => 
      v >= 0 && v < this.positions.length
    );
    
    if (validVertices.length < 3) return null;

    // 去重相邻顶点
    const deduped: number[] = [validVertices[0]];
    for (let i = 1; i < validVertices.length; i++) {
      if (validVertices[i] !== deduped[deduped.length - 1]) {
        deduped.push(validVertices[i]);
      }
    }
    // 检查首尾是否重复
    if (deduped.length > 1 && deduped[0] === deduped[deduped.length - 1]) {
      deduped.pop();
    }

    if (deduped.length < 3) return null;

    // 连接相邻顶点形成闭合路径
    const allPathVertices: number[] = [];
    const allPathPositions: THREE.Vector3[] = [];

    for (let i = 0; i < deduped.length; i++) {
      const start = deduped[i];
      const end = deduped[(i + 1) % deduped.length]; // 闭环

      // 获取两点之间的最短路径
      const segment = this.shortestPath(start, end);

      if (segment.length === 0) {
        // 无法找到路径，直接连接
        if (allPathVertices.length === 0 || allPathVertices[allPathVertices.length - 1] !== start) {
          allPathVertices.push(start);
          allPathPositions.push(this.positions[start].clone());
        }
        continue;
      }

      // 添加路径段（跳过第一个点如果已经在路径中）
      for (let j = 0; j < segment.length; j++) {
        const v = segment[j];
        if (j === 0 && allPathVertices.length > 0 && allPathVertices[allPathVertices.length - 1] === v) {
          continue; // 跳过重复点
        }
        allPathVertices.push(v);
        allPathPositions.push(this.positions[v].clone());
      }
    }

    // 移除最后一个点如果它与第一个点重复（因为是闭环）
    if (allPathVertices.length > 1 && 
        allPathVertices[0] === allPathVertices[allPathVertices.length - 1]) {
      allPathVertices.pop();
      allPathPositions.pop();
    }

    if (allPathVertices.length < 3) return null;

    // 简化路径
    const simplified = this.simplifyPath(allPathVertices);
    
    // 使用简化后的顶点获取位置
    const simplifiedPositions = simplified.map(v => this.positions[v]);

    // Catmull-Rom 平滑（闭环模式）
    const smoothed = this.catmullRomInterpolateClosed(simplifiedPositions, 4);

    // 等距重采样
    const resampled = this.resampleByArcLength(smoothed);

    // 转换为 Float32Array
    const posArray = new Float32Array(resampled.length * 3);
    for (let i = 0; i < resampled.length; i++) {
      posArray[i * 3] = resampled[i].x;
      posArray[i * 3 + 1] = resampled[i].y;
      posArray[i * 3 + 2] = resampled[i].z;
    }

    return {
      pathVertices: simplified,
      pathPositions: posArray,
    };
  }

  /**
   * 闭合 Catmull-Rom 样条插值
   */
  private catmullRomInterpolateClosed(
    points: THREE.Vector3[],
    samplesPerSegment: number
  ): THREE.Vector3[] {
    if (points.length < 3) return points.map(p => p.clone());

    const result: THREE.Vector3[] = [];
    
    // 使用 Three.js 内置的 CatmullRomCurve3，closed = true
    const curve = new THREE.CatmullRomCurve3(points, true, 'centripetal', 0.5);
    const totalSamples = points.length * samplesPerSegment;
    
    for (let i = 0; i < totalSamples; i++) {
      const t = i / totalSamples;
      result.push(curve.getPoint(t));
    }

    return result;
  }
}
