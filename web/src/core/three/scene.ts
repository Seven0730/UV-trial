import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

export interface ThreeContext {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  controls: OrbitControls;
}

export function createThree(canvas: HTMLCanvasElement): ThreeContext {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setClearColor(0x0f1115, 1);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0f1115);

  const camera = new THREE.PerspectiveCamera(50, 1, 0.01, 5000);
  camera.position.set(2.5, 2.5, 2.5);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.target.set(0, 0, 0);
  controls.update();

  return { scene, camera, renderer, controls };
}

export function startRenderLoop(ctx: ThreeContext): () => void {
  let disposed = false;
  const render = () => {
    if (disposed) return;
    ctx.controls.update();
    ctx.renderer.render(ctx.scene, ctx.camera);
    requestAnimationFrame(render);
  };
  render();
  return () => {
    disposed = true;
  };
}

export function resizeRenderer(ctx: ThreeContext) {
  const canvas = ctx.renderer.domElement;
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (canvas.width !== width || canvas.height !== height) {
    ctx.renderer.setSize(width, height, false);
    ctx.camera.aspect = width / height || 1;
    ctx.camera.updateProjectionMatrix();
  }
}
