import * as THREE from "three";

export class LinePreview {
  private line: THREE.Mesh | null = null;
  private pointsGroup = new THREE.Group();
  private sphereGeo = new THREE.SphereGeometry(1, 16, 12);
  private sphereMat = new THREE.MeshStandardMaterial({ color: 0xff5c5c, emissive: 0x111111 });
  private tubeMat = new THREE.MeshStandardMaterial({ 
    color: 0xff5c5c, 
    emissive: 0x331111,
    emissiveIntensity: 0.3,
    roughness: 0.4,
    metalness: 0.1,
    side: THREE.DoubleSide,
  });
  private tubeRadiusFactor = 0.003;
  private pointSizeFactor = 0.006;
  private showPoints = false;

  constructor(private scene: THREE.Scene, private sizeRef: () => number) {
    this.scene.add(this.pointsGroup);
  }

  setStyles(opts: { tubeRadiusFactor?: number; pointSizeFactor?: number; showPoints?: boolean }) {
    if (opts.tubeRadiusFactor !== undefined) this.tubeRadiusFactor = opts.tubeRadiusFactor;
    if (opts.pointSizeFactor !== undefined) this.pointSizeFactor = opts.pointSizeFactor;
    if (opts.showPoints !== undefined) this.showPoints = opts.showPoints;
  }

  update(points: THREE.Vector3[]) {
    this.disposeLine();
    this.clearVisuals();

    if (this.showPoints) {
      const scale = this.sizeRef() * this.pointSizeFactor;
      for (const p of points) {
        const m = new THREE.Mesh(this.sphereGeo, this.sphereMat);
        m.position.copy(p);
        m.scale.setScalar(scale || 0.01);
        this.pointsGroup.add(m);
      }
    }

    if (points.length < 2) return;

    // 路径已经平滑，直接使用 CatmullRomCurve3 连接
    // 使用 centripetal 参数化避免尖角
    const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal', 0.5);
    
    // 根据点数动态调整细分数，但设置上限以提高性能
    const tubularSegments = Math.min(Math.max(points.length * 2, 16), 128);
    const radius = Math.max(this.sizeRef() * this.tubeRadiusFactor, 0.0005);
    const radialSegments = 6; // 减少径向分段提高性能
    
    const geometry = new THREE.TubeGeometry(curve, tubularSegments, radius, radialSegments, false);
    this.line = new THREE.Mesh(geometry, this.tubeMat);
    this.line.renderOrder = 1; // 确保渲染在表面之上
    this.scene.add(this.line);
  }

  clear() {
    this.clearVisuals();
    this.disposeLine();
  }

  private disposeLine() {
    if (!this.line) return;
    this.scene.remove(this.line);
    this.line.geometry.dispose();
    this.line = null;
  }

  private clearVisuals() {
    while (this.pointsGroup.children.length) {
      this.pointsGroup.remove(this.pointsGroup.children[0]);
    }
  }
}
