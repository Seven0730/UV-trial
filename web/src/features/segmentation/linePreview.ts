import * as THREE from "three";

export class LinePreview {
  private line: THREE.Line | null = null;
  private pointsGroup = new THREE.Group();
  private sphereGeo = new THREE.SphereGeometry(1, 16, 12);
  private sphereMat = new THREE.MeshStandardMaterial({ color: 0xff5c5c, emissive: 0x111111 });
  private tubeMat = new THREE.MeshStandardMaterial({ color: 0xff5c5c, emissive: 0x111111 });

  constructor(private scene: THREE.Scene, private sizeRef: () => number) {
    this.scene.add(this.pointsGroup);
  }

  update(points: THREE.Vector3[]) {
    this.disposeLine();
    this.clearVisuals();

    const scale = this.sizeRef() * 0.006;
    for (const p of points) {
      const m = new THREE.Mesh(this.sphereGeo, this.sphereMat);
      m.position.copy(p);
      m.scale.setScalar(scale || 0.01);
      this.pointsGroup.add(m);
    }

    if (points.length < 2) return;

    const curve = new THREE.CatmullRomCurve3(points);
    const tubularSegments = Math.max(points.length * 4, 16);
    const radius = Math.max(this.sizeRef() * 0.003, 0.001);
    const geometry = new THREE.TubeGeometry(curve, tubularSegments, radius, 8, false);
    this.line = new THREE.Mesh(geometry, this.tubeMat);
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
