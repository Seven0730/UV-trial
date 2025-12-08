import * as THREE from "three";

export class LinePreview {
  private line: THREE.Line | null = null;
  private pointsGroup = new THREE.Group();
  private sphereGeo = new THREE.SphereGeometry(1, 16, 12);
  private sphereMat = new THREE.MeshStandardMaterial({ color: 0xff5c5c, emissive: 0x111111 });
  private lineMat = new THREE.LineBasicMaterial({ color: 0xff5c5c });

  constructor(private scene: THREE.Scene, private sizeRef: () => number) {
    this.scene.add(this.pointsGroup);
  }

  update(points: THREE.Vector3[]) {
    this.disposeLine();
    this.clearVisuals();

    const scale = this.sizeRef() * 0.01;
    for (const p of points) {
      const m = new THREE.Mesh(this.sphereGeo, this.sphereMat);
      m.position.copy(p);
      m.scale.setScalar(scale || 0.01);
      this.pointsGroup.add(m);
    }

    if (points.length < 2) return;

    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    this.line = new THREE.Line(geometry, this.lineMat);
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
