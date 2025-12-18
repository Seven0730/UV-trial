import * as THREE from "three";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";

export interface ObjLoadOptions {
  onProgress?: (progress01: number) => void;
}

/**
 * 解析带有顶点颜色的 OBJ 文件
 * 支持格式: v x y z r g b (RGB 范围 0-1)
 */
function parseOBJWithVertexColors(text: string): THREE.Group {
  const lines = text.split('\n');
  
  const positions: number[] = [];
  const colors: number[] = [];
  const normals: number[] = [];
  const faces: number[][] = [];
  const lineSegments: number[][] = []; // 线段数据 - 每个元素是一条连续线的所有顶点索引
  let currentLineSegment: number[] = []; // 当前正在构建的线段
  
  let hasVertexColors = false;
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    
    const parts = trimmed.split(/\s+/);
    const type = parts[0];
    
    if (type === 'v') {
      // 顶点: v x y z [r g b]
      const x = parseFloat(parts[1]) || 0;
      const y = parseFloat(parts[2]) || 0;
      const z = parseFloat(parts[3]) || 0;
      positions.push(x, y, z);
      
      // 检查是否有颜色数据
      if (parts.length >= 7) {
        const r = parseFloat(parts[4]) || 0;
        const g = parseFloat(parts[5]) || 0;
        const b = parseFloat(parts[6]) || 0;
        colors.push(r, g, b);
        hasVertexColors = true;
      } else {
        colors.push(0.8, 0.8, 0.8); // 默认灰色
      }
    } else if (type === 'vn') {
      // 法向量
      const nx = parseFloat(parts[1]) || 0;
      const ny = parseFloat(parts[2]) || 0;
      const nz = parseFloat(parts[3]) || 0;
      normals.push(nx, ny, nz);
    } else if (type === 'f') {
      // 面: f v1 v2 v3 ... 或 f v1//vn1 v2//vn2 ...
      // 如果遇到面，先保存当前的线段
      if (currentLineSegment.length > 0) {
        lineSegments.push(currentLineSegment);
        currentLineSegment = [];
      }
      
      const faceIndices: number[] = [];
      for (let i = 1; i < parts.length; i++) {
        const vertexData = parts[i].split('/');
        const vIdx = parseInt(vertexData[0], 10);
        faceIndices.push(vIdx > 0 ? vIdx - 1 : positions.length / 3 + vIdx);
      }
      // 三角形化多边形
      for (let i = 1; i < faceIndices.length - 1; i++) {
        faces.push([faceIndices[0], faceIndices[i], faceIndices[i + 1]]);
      }
    } else if (type === 'g' || type === 'o') {
      // 遇到组或对象定义，保存当前的线段
      if (currentLineSegment.length > 0) {
        lineSegments.push(currentLineSegment);
        currentLineSegment = [];
      }
    } else if (type === 'l') {
      // 线段: l v1 v2 ... (可能是单条线段或多个点)
      const newIndices: number[] = [];
      for (let i = 1; i < parts.length; i++) {
        const vIdx = parseInt(parts[i], 10);
        newIndices.push(vIdx > 0 ? vIdx - 1 : positions.length / 3 + vIdx);
      }
      
      // 尝试合并连续的线段
      if (currentLineSegment.length > 0 && newIndices.length > 0) {
        const lastIdx = currentLineSegment[currentLineSegment.length - 1];
        if (lastIdx === newIndices[0]) {
          // 可以连接，跳过第一个点（避免重复）
          currentLineSegment.push(...newIndices.slice(1));
        } else {
          // 不能连接，保存当前线段，开始新的
          lineSegments.push(currentLineSegment);
          currentLineSegment = newIndices;
        }
      } else {
        currentLineSegment.push(...newIndices);
      }
    }
  }
  
  // 保存最后一条线段
  if (currentLineSegment.length > 0) {
    lineSegments.push(currentLineSegment);
  }
  
  const group = new THREE.Group();
  
  // 创建网格几何体
  if (faces.length > 0) {
    const geometry = new THREE.BufferGeometry();
    
    // 使用索引来复用顶点
    const positionArray = new Float32Array(positions);
    geometry.setAttribute('position', new THREE.BufferAttribute(positionArray, 3));
    
    if (hasVertexColors) {
      const colorArray = new Float32Array(colors);
      geometry.setAttribute('color', new THREE.BufferAttribute(colorArray, 3));
    }
    
    // 设置索引
    const indices: number[] = [];
    for (const face of faces) {
      indices.push(face[0], face[1], face[2]);
    }
    geometry.setIndex(indices);
    
    geometry.computeVertexNormals();
    
    // 创建材质（支持顶点颜色）
    const material = new THREE.MeshStandardMaterial({
      color: hasVertexColors ? 0xffffff : 0xd3d7dd,
      vertexColors: hasVertexColors,
      metalness: 0.05,
      roughness: 0.9,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    });
    
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = 'mesh';
    group.add(mesh);
  }
  
  // 创建线段几何体 - 使用管状几何体来确保可见性
  if (lineSegments.length > 0) {
    // 计算模型的边界大小来确定线宽
    let boundingSize = 1;
    if (faces.length > 0) {
      let minX = Infinity, maxX = -Infinity;
      let minY = Infinity, maxY = -Infinity;
      let minZ = Infinity, maxZ = -Infinity;
      for (let i = 0; i < positions.length; i += 3) {
        minX = Math.min(minX, positions[i]);
        maxX = Math.max(maxX, positions[i]);
        minY = Math.min(minY, positions[i + 1]);
        maxY = Math.max(maxY, positions[i + 1]);
        minZ = Math.min(minZ, positions[i + 2]);
        maxZ = Math.max(maxZ, positions[i + 2]);
      }
      boundingSize = Math.sqrt((maxX - minX) ** 2 + (maxY - minY) ** 2 + (maxZ - minZ) ** 2);
    }
    
    const tubeRadius = boundingSize * 0.003; // 管状半径
    
    for (const segment of lineSegments) {
      if (segment.length < 2) continue;
      
      // 收集这条线段的所有点和颜色
      const segmentPoints: THREE.Vector3[] = [];
      let segmentColor = new THREE.Color(1, 0, 0); // 默认红色
      
      for (const idx of segment) {
        segmentPoints.push(new THREE.Vector3(
          positions[idx * 3],
          positions[idx * 3 + 1],
          positions[idx * 3 + 2]
        ));
        // 使用第一个点的颜色作为整条线的颜色
        if (segmentPoints.length === 1) {
          segmentColor = new THREE.Color(
            colors[idx * 3],
            colors[idx * 3 + 1],
            colors[idx * 3 + 2]
          );
        }
      }
      
      if (segmentPoints.length >= 2) {
        // 创建管状几何体
        const curve = new THREE.CatmullRomCurve3(segmentPoints, false, 'centripetal');
        const tubeSegments = Math.max(segmentPoints.length * 4, 16);
        const tubeGeometry = new THREE.TubeGeometry(curve, tubeSegments, tubeRadius, 8, false);
        
        const tubeMaterial = new THREE.MeshStandardMaterial({
          color: segmentColor,
          emissive: segmentColor,
          emissiveIntensity: 0.3,
          metalness: 0.1,
          roughness: 0.5,
          side: THREE.DoubleSide,
        });
        
        const tubeMesh = new THREE.Mesh(tubeGeometry, tubeMaterial);
        tubeMesh.name = 'segmentation_line_tube';
        group.add(tubeMesh);
      }
    }
  }
  
  return group;
}

/**
 * 检测 OBJ 文件是否包含顶点颜色
 */
function hasVertexColorsInOBJ(text: string): boolean {
  const lines = text.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    // 跳过空行和注释
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('mtllib') || trimmed.startsWith('usemtl') || trimmed.startsWith('g ') || trimmed.startsWith('o ')) {
      continue;
    }
    if (trimmed.startsWith('v ')) {
      const parts = trimmed.split(/\s+/);
      // 如果有超过 4 个部分 (v x y z r g b)，则有颜色
      // parts = ['v', 'x', 'y', 'z', 'r', 'g', 'b'] = 7 个元素
      return parts.length >= 7;
    }
  }
  return false;
}

function applyMaterialFallback(group: THREE.Group) {
  group.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      const mesh = child as THREE.Mesh;
      const geometry = mesh.geometry as THREE.BufferGeometry;
      geometry.computeVertexNormals();

      if (Array.isArray(mesh.material)) {
        mesh.material = mesh.material.map((mat) => ensureStandardMaterial(mat));
      } else {
        mesh.material = ensureStandardMaterial(mesh.material);
      }
    }
  });
}

function ensureStandardMaterial(mat: THREE.Material | undefined): THREE.Material {
  if (mat) {
    // Preserve existing material/color; only enforce double side for thin meshes.
    mat.side = THREE.DoubleSide;
    // Enable polygon offset to prevent z-fighting with lines drawn on surface
    (mat as THREE.MeshStandardMaterial).polygonOffset = true;
    (mat as THREE.MeshStandardMaterial).polygonOffsetFactor = 1;
    (mat as THREE.MeshStandardMaterial).polygonOffsetUnits = 1;
    return mat;
  }
  return new THREE.MeshStandardMaterial({
    color: 0xd3d7dd,
    metalness: 0.05,
    roughness: 0.9,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  });
}

export async function loadOBJFromFile(file: File, opts: ObjLoadOptions = {}): Promise<THREE.Group> {
  const text = await file.text();
  
  // 检查是否有顶点颜色，如果有则使用自定义解析器
  if (hasVertexColorsInOBJ(text)) {
    const group = parseOBJWithVertexColors(text);
    opts.onProgress?.(1);
    return group;
  }
  
  // 否则使用标准 OBJLoader
  const loader = new OBJLoader();
  const group = loader.parse(text);
  applyMaterialFallback(group);
  opts.onProgress?.(1);
  return group;
}

export async function loadOBJFromURL(url: string, opts: ObjLoadOptions = {}): Promise<THREE.Group> {
  // 先获取文件内容检查是否有顶点颜色
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const text = await response.text();
    
    // 检查是否有顶点颜色
    if (hasVertexColorsInOBJ(text)) {
      const group = parseOBJWithVertexColors(text);
      opts.onProgress?.(1);
      return group;
    }
    
    // 否则使用标准 OBJLoader
    const loader = new OBJLoader();
    const group = loader.parse(text);
    applyMaterialFallback(group);
    opts.onProgress?.(1);
    return group;
  } catch (error) {
    // 如果 fetch 失败，回退到标准加载方式
    const manager = new THREE.LoadingManager();
    const loader = new OBJLoader(manager);

    if (opts.onProgress) {
      manager.onProgress = (_item, loaded, total) => {
        opts.onProgress?.(total ? loaded / total : 0);
      };
    }

    return new Promise((resolve, reject) => {
      loader.load(
        url,
        (group) => {
          applyMaterialFallback(group);
          opts.onProgress?.(1);
          resolve(group);
        },
        (event) => {
          if (!opts.onProgress || !event.total) return;
          const ratio = Math.min(event.loaded / event.total, 1);
          opts.onProgress(ratio);
        },
        (err) => reject(err),
      );
    });
  }
}
