import * as THREE from "https://unpkg.com/three@0.161.0/build/three.module.js";
import { OrbitControls } from "https://unpkg.com/three@0.161.0/examples/jsm/controls/OrbitControls.js";
import { OBJLoader } from "https://unpkg.com/three@0.161.0/examples/jsm/loaders/OBJLoader.js";

const DEFAULT_MESH = "../obj/test_large.obj";
const DEFAULT_PATH = "../results/large_path.json";

const canvas = document.querySelector("#scene");
const statusBox = document.querySelector("#status");

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x111111);

const camera = new THREE.PerspectiveCamera(50, 1, 0.01, 1000);
camera.position.set(1.5, 1.5, 1.5);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

const hemiLight = new THREE.HemisphereLight(0xffffff, 0x222222, 1.0);
scene.add(hemiLight);
const dirLight = new THREE.DirectionalLight(0xffffff, 0.6);
dirLight.position.set(1, 1, 1);
scene.add(dirLight);

const loader = new OBJLoader();
const meshGroup = new THREE.Group();
scene.add(meshGroup);

let seamMesh = null;
let boundingSize = 1;

function setStatus(message) {
    statusBox.textContent = message;
}

function clearMesh() {
    while (meshGroup.children.length) {
        const child = meshGroup.children.pop();
        child.geometry?.dispose();
        child.material?.dispose();
    }
}

function fitCameraToObject(object) {
    const box = new THREE.Box3().setFromObject(object);
    const size = new THREE.Vector3();
    box.getSize(size);
    const center = new THREE.Vector3();
    box.getCenter(center);
    boundingSize = size.length() || 1;

    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = camera.fov * (Math.PI / 180);
    const dist = Math.abs(maxDim / (2 * Math.tan(fov / 2)));
    const offset = 1.5;
    camera.position.copy(center);
    camera.position.z += dist * offset;
    camera.position.y += dist * 0.3;
    camera.position.x += dist * 0.3;
    camera.near = dist / 100;
    camera.far = dist * 100;
    camera.updateProjectionMatrix();
    controls.target.copy(center);
    controls.update();
}

async function loadMeshFromURL(url) {
    setStatus(`加载网格: ${url}`);
    return new Promise((resolve, reject) => {
        loader.load(
            url,
            (obj) => {
                clearMesh();
                obj.traverse((child) => {
                    if (child.isMesh) {
                        child.material = new THREE.MeshStandardMaterial({
                            color: 0xcccccc,
                            metalness: 0.1,
                            roughness: 0.9,
                            side: THREE.DoubleSide,
                        });
                    }
                });
                meshGroup.add(obj);
                fitCameraToObject(obj);
                setStatus(`网格加载成功`);
                resolve();
            },
            undefined,
            (err) => reject(err)
        );
    });
}

async function loadMeshFromFile(file) {
    setStatus(`读取本地网格: ${file.name}`);
    const text = await file.text();
    clearMesh();
    const obj = loader.parse(text);
    obj.traverse((child) => {
        if (child.isMesh) {
            child.material = new THREE.MeshStandardMaterial({
                color: 0xcccccc,
                metalness: 0.1,
                roughness: 0.9,
                side: THREE.DoubleSide,
            });
        }
    });
    meshGroup.add(obj);
    fitCameraToObject(obj);
    setStatus(`本地网格加载成功`);
}

async function loadPathFromURL(url) {
    setStatus(`加载测地线: ${url}`);
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error("无法读取测地线 JSON");
    }
    const data = await response.json();
    buildSeam(data.path || data);
    setStatus(`测地线加载成功`);
}

async function loadPathFromFile(file) {
    setStatus(`读取本地测地线: ${file.name}`);
    const text = await file.text();
    const data = JSON.parse(text);
    buildSeam(data.path || data);
    setStatus(`本地测地线加载成功`);
}

function buildSeam(points) {
    if (!points || points.length < 2) {
        throw new Error("测地线点数量不足");
    }

    const vectors = points.map((p) => new THREE.Vector3(p.x, p.y, p.z));
    const curve = new THREE.CatmullRomCurve3(vectors);
    const radius = boundingSize * 0.002;
    const tubularSegments = Math.min(256, Math.max(32, points.length * 3));
    const tube = new THREE.TubeGeometry(curve, tubularSegments, radius, 8, false);

    if (seamMesh) {
        scene.remove(seamMesh);
        seamMesh.geometry.dispose();
        seamMesh.material.dispose();
    }

    const mat = new THREE.MeshBasicMaterial({
        color: 0xff5c5c,
        polygonOffset: true,
        polygonOffsetFactor: 1,
        polygonOffsetUnits: 1,
        depthTest: true,
        depthWrite: false,
    });

    seamMesh = new THREE.Mesh(tube, mat);
    scene.add(seamMesh);
}

function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}

function onResize() {
    const { clientWidth, clientHeight } = renderer.domElement;
    camera.aspect = clientWidth / clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(clientWidth, clientHeight, false);
}

window.addEventListener("resize", onResize);

document.querySelector("#loadDefaults").addEventListener("click", async () => {
    try {
        await loadMeshFromURL(DEFAULT_MESH);
        await loadPathFromURL(DEFAULT_PATH);
    } catch (err) {
        setStatus(`加载默认示例失败: ${err.message}`);
    }
});

document.querySelector("#meshFile").addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
        await loadMeshFromFile(file);
    } catch (err) {
        setStatus(`读取 OBJ 失败: ${err.message}`);
    } finally {
        event.target.value = "";
    }
});

document.querySelector("#pathFile").addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
        await loadPathFromFile(file);
    } catch (err) {
        setStatus(`读取测地线失败: ${err.message}`);
    } finally {
        event.target.value = "";
    }
});

async function bootstrap() {
    onResize();
    animate();
    try {
        await loadMeshFromURL(DEFAULT_MESH);
        await loadPathFromURL(DEFAULT_PATH);
    } catch (err) {
        setStatus(`默认示例加载失败: ${err.message}`);
    }
}

bootstrap();
