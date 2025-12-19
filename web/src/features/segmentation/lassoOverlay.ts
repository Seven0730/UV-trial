import * as THREE from "three";

/**
 * 2D 套圈绘制覆盖层
 * 用于在屏幕上绘制自由曲线，完成后返回采样点
 */
export class LassoOverlay {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private points: THREE.Vector2[] = [];
  private isDrawing = false;
  private minDistance = 5; // 最小采样距离（像素）

  constructor(private container: HTMLElement) {
    // 创建覆盖Canvas
    this.canvas = document.createElement("canvas");
    this.canvas.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 100;
    `;
    this.ctx = this.canvas.getContext("2d")!;
    container.appendChild(this.canvas);
    this.resize();

    // 监听窗口大小变化
    window.addEventListener("resize", this.resize.bind(this));
  }

  private resize() {
    const rect = this.container.getBoundingClientRect();
    this.canvas.width = rect.width * window.devicePixelRatio;
    this.canvas.height = rect.height * window.devicePixelRatio;
    this.ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
  }

  /**
   * 开始绘制
   */
  startDrawing(x: number, y: number) {
    this.isDrawing = true;
    this.points = [new THREE.Vector2(x, y)];
    // 不要设置 pointerEvents = "auto"，让事件继续传递给下层
    this.render();
  }

  /**
   * 添加点（拖动时调用）
   */
  addPoint(x: number, y: number) {
    if (!this.isDrawing) return;

    const lastPoint = this.points[this.points.length - 1];
    const dist = Math.sqrt((x - lastPoint.x) ** 2 + (y - lastPoint.y) ** 2);

    // 只有距离够远才添加新点
    if (dist >= this.minDistance) {
      this.points.push(new THREE.Vector2(x, y));
      this.render();
    }
  }

  /**
   * 结束绘制，返回采样点（归一化屏幕坐标 -1 到 1）
   */
  finishDrawing(): THREE.Vector2[] {
    const pointsCopy = [...this.points]; // 保存副本
    this.isDrawing = false;

    if (pointsCopy.length < 3) {
      this.clear();
      return [];
    }

    // 自动闭合
    const first = pointsCopy[0];
    const last = pointsCopy[pointsCopy.length - 1];
    if (first.distanceTo(last) > this.minDistance * 2) {
      pointsCopy.push(first.clone());
    }

    // 转换为归一化设备坐标（NDC）
    const rect = this.container.getBoundingClientRect();
    const ndcPoints = pointsCopy.map((p) => {
      return new THREE.Vector2(
        (p.x / rect.width) * 2 - 1,
        -(p.y / rect.height) * 2 + 1
      );
    });

    // 简化路径（Douglas-Peucker），使用更小的 epsilon
    // NDC 范围是 -1 到 1，所以 epsilon 应该很小
    const simplified = this.simplifyPath(ndcPoints, 0.002);

    this.clear();
    return simplified;
  }

  /**
   * 渲染当前绘制的曲线
   */
  private render() {
    const rect = this.container.getBoundingClientRect();
    this.ctx.clearRect(0, 0, rect.width, rect.height);

    if (this.points.length < 2) return;

    this.ctx.beginPath();
    this.ctx.moveTo(this.points[0].x, this.points[0].y);

    for (let i = 1; i < this.points.length; i++) {
      this.ctx.lineTo(this.points[i].x, this.points[i].y);
    }

    // 绘制闭合线到起点（虚线）
    if (this.points.length > 2) {
      this.ctx.setLineDash([5, 5]);
      this.ctx.lineTo(this.points[0].x, this.points[0].y);
    }

    this.ctx.strokeStyle = "#FF9800";
    this.ctx.lineWidth = 2;
    this.ctx.stroke();
    this.ctx.setLineDash([]);

    // 绘制起点标记
    this.ctx.beginPath();
    this.ctx.arc(this.points[0].x, this.points[0].y, 6, 0, Math.PI * 2);
    this.ctx.fillStyle = "#FF9800";
    this.ctx.fill();
  }

  /**
   * 清除绘制
   */
  clear() {
    const rect = this.container.getBoundingClientRect();
    this.ctx.clearRect(0, 0, rect.width, rect.height);
    this.points = [];
    this.isDrawing = false;
  }

  /**
   * Douglas-Peucker 路径简化
   */
  private simplifyPath(points: THREE.Vector2[], epsilon: number): THREE.Vector2[] {
    if (points.length <= 4) return points; // 保留至少4个点

    const keep = new Array(points.length).fill(false);
    keep[0] = true;
    keep[points.length - 1] = true;

    this.douglasPeuckerRecursive(points, 0, points.length - 1, epsilon, keep);

    const result = points.filter((_, i) => keep[i]);
    
    // 确保至少保留一定数量的点
    if (result.length < 4 && points.length >= 4) {
      // 如果简化过度，均匀采样
      const step = Math.max(1, Math.floor(points.length / 8));
      const sampled: THREE.Vector2[] = [];
      for (let i = 0; i < points.length; i += step) {
        sampled.push(points[i]);
      }
      // 确保最后一个点被包含
      if (sampled[sampled.length - 1] !== points[points.length - 1]) {
        sampled.push(points[points.length - 1]);
      }
      return sampled;
    }
    
    return result;
  }

  private douglasPeuckerRecursive(
    points: THREE.Vector2[],
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
    const lineDir = new THREE.Vector2().subVectors(lineEnd, lineStart);
    const lineLength = lineDir.length();

    if (lineLength > 1e-10) {
      lineDir.normalize();

      for (let i = start + 1; i < end; i++) {
        const point = points[i];
        const toPoint = new THREE.Vector2().subVectors(point, lineStart);
        const projection = toPoint.dot(lineDir);

        let dist: number;
        if (projection <= 0) {
          dist = point.distanceTo(lineStart);
        } else if (projection >= lineLength) {
          dist = point.distanceTo(lineEnd);
        } else {
          const closestPoint = new THREE.Vector2()
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
   * 获取当前是否正在绘制
   */
  getIsDrawing(): boolean {
    return this.isDrawing;
  }

  /**
   * 销毁组件
   */
  dispose() {
    window.removeEventListener("resize", this.resize.bind(this));
    this.container.removeChild(this.canvas);
  }
}
