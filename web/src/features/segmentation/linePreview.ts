import * as THREE from "three";
import { SegmentLine } from "./types";

interface LineRenderData {
  mesh: THREE.Mesh;
  lineId: string;
}

export class LinePreview {
  private linesGroup = new THREE.Group();
  private pointsGroup = new THREE.Group();
  private renderedLines: Map<string, LineRenderData> = new Map();
  
  private sphereGeo = new THREE.SphereGeometry(1, 16, 12);
  private sphereMat = new THREE.MeshStandardMaterial({ color: 0xff5c5c, emissive: 0x111111 });
  
  // 当前选中线的材质（红色高亮）
  private activeMat = new THREE.MeshStandardMaterial({ 
    color: 0xff5c5c, 
    emissive: 0x551111,
    emissiveIntensity: 0.5,
    roughness: 0.3,
    metalness: 0.1,
    side: THREE.DoubleSide,
  });
  
  // 非选中线的材质（蓝色/灰色）
  private inactiveMat = new THREE.MeshStandardMaterial({ 
    color: 0x4c95ff, 
    emissive: 0x112244,
    emissiveIntensity: 0.2,
    roughness: 0.5,
    metalness: 0.1,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.8,
  });
  
  private tubeRadiusFactor = 0.003;
  private pointSizeFactor = 0.006;
  private showPoints = false;
  private currentLineId: string | null = null;

  constructor(private scene: THREE.Scene, private sizeRef: () => number) {
    this.scene.add(this.linesGroup);
    this.scene.add(this.pointsGroup);
  }

  setStyles(opts: { tubeRadiusFactor?: number; pointSizeFactor?: number; showPoints?: boolean }) {
    if (opts.tubeRadiusFactor !== undefined) this.tubeRadiusFactor = opts.tubeRadiusFactor;
    if (opts.pointSizeFactor !== undefined) this.pointSizeFactor = opts.pointSizeFactor;
    if (opts.showPoints !== undefined) this.showPoints = opts.showPoints;
  }

  /**
   * 更新当前线的预览（用于实时绘制）
   */
  update(points: THREE.Vector3[]) {
    // 清除当前线的点显示
    this.clearVisuals();

    if (this.showPoints && this.currentLineId) {
      const scale = this.sizeRef() * this.pointSizeFactor;
      for (const p of points) {
        const m = new THREE.Mesh(this.sphereGeo, this.sphereMat);
        m.position.copy(p);
        m.scale.setScalar(scale || 0.01);
        this.pointsGroup.add(m);
      }
    }

    // 更新当前线的几何体
    if (this.currentLineId && points.length >= 2) {
      this.updateLineGeometry(this.currentLineId, points, true);
    }
  }

  /**
   * 渲染所有线条
   */
  renderAllLines(lines: SegmentLine[], currentLineId?: string) {
    this.currentLineId = currentLineId || null;
    
    // 收集需要保留的线ID
    const activeLineIds = new Set(lines.map(l => l.id));
    
    // 删除不再存在的线
    for (const [lineId, data] of this.renderedLines) {
      if (!activeLineIds.has(lineId)) {
        this.linesGroup.remove(data.mesh);
        data.mesh.geometry.dispose();
        this.renderedLines.delete(lineId);
      }
    }
    
    // 更新或创建每条线
    for (const line of lines) {
      if (!line.pathPositions || line.pathPositions.length < 6) {
        // 没有足够的路径数据，跳过
        continue;
      }
      
      const points = this.positionsToPoints(line.pathPositions);
      const isActive = line.id === currentLineId;
      this.updateLineGeometry(line.id, points, isActive);
    }
  }

  /**
   * 设置当前选中的线
   */
  setCurrentLine(lineId: string | null) {
    const prevLineId = this.currentLineId;
    this.currentLineId = lineId;
    
    // 更新前一条线的材质
    if (prevLineId && this.renderedLines.has(prevLineId)) {
      const prevData = this.renderedLines.get(prevLineId)!;
      prevData.mesh.material = this.inactiveMat;
    }
    
    // 更新当前线的材质
    if (lineId && this.renderedLines.has(lineId)) {
      const currentData = this.renderedLines.get(lineId)!;
      currentData.mesh.material = this.activeMat;
    }
  }

  private updateLineGeometry(lineId: string, points: THREE.Vector3[], isActive: boolean) {
    if (points.length < 2) return;
    
    const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal', 0.5);
    const tubularSegments = Math.min(Math.max(points.length * 2, 16), 128);
    const radius = Math.max(this.sizeRef() * this.tubeRadiusFactor, 0.0005);
    const radialSegments = 6;
    
    const geometry = new THREE.TubeGeometry(curve, tubularSegments, radius, radialSegments, false);
    const material = isActive ? this.activeMat : this.inactiveMat;
    
    // 检查是否已存在
    if (this.renderedLines.has(lineId)) {
      const data = this.renderedLines.get(lineId)!;
      // 更新几何体
      data.mesh.geometry.dispose();
      data.mesh.geometry = geometry;
      data.mesh.material = material;
    } else {
      // 创建新的
      const mesh = new THREE.Mesh(geometry, material);
      mesh.renderOrder = 1;
      mesh.name = `line_${lineId}`;
      this.linesGroup.add(mesh);
      this.renderedLines.set(lineId, { mesh, lineId });
    }
  }

  private positionsToPoints(positions: Float32Array): THREE.Vector3[] {
    const points: THREE.Vector3[] = [];
    for (let i = 0; i < positions.length; i += 3) {
      points.push(new THREE.Vector3(positions[i], positions[i + 1], positions[i + 2]));
    }
    return points;
  }

  clear() {
    this.clearVisuals();
    this.clearAllLines();
  }

  private clearAllLines() {
    for (const [, data] of this.renderedLines) {
      this.linesGroup.remove(data.mesh);
      data.mesh.geometry.dispose();
    }
    this.renderedLines.clear();
    this.currentLineId = null;
  }

  private clearVisuals() {
    while (this.pointsGroup.children.length) {
      this.pointsGroup.remove(this.pointsGroup.children[0]);
    }
  }
}
