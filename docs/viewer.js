import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const REPO_RAW_BASE = 'https://raw.githubusercontent.com/takase-hiroyuki/web-polyhedron-viewer/main/data';

const container = document.getElementById('canvas-container');
const statusOverlay = document.getElementById('status-overlay');
const modelSelect = document.getElementById('model-select');
const copyUrlBtn = document.getElementById('copy-url-btn');
const playPauseBtn = document.getElementById('play-pause-btn');
const frameSlider = document.getElementById('frame-slider');
const frameLabel = document.getElementById('frame-label');

// シーン・カメラ・レンダラー初期化
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x12151c);

// Blender(Z-up) -> Three.js(Y-up) 変換用ルートグループ
const zUpRoot = new THREE.Group();
zUpRoot.rotation.x = -Math.PI / 2;
scene.add(zUpRoot);

const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 1000);
camera.position.set(0, 4.5, 9.5);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(container.clientWidth, container.clientHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
container.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;

// ライティング（4色塗り分けが鮮明に見えるバランス）
const ambientLight = new THREE.AmbientLight(0xffffff, 0.72);
scene.add(ambientLight);

const dirLight1 = new THREE.DirectionalLight(0xffffff, 0.85);
dirLight1.position.set(6, 10, 8);
scene.add(dirLight1);

const dirLight2 = new THREE.DirectionalLight(0xdbeafe, 0.4);
dirLight2.position.set(-6, -4, -6);
scene.add(dirLight2);

window.addEventListener('resize', () => {
  camera.aspect = container.clientWidth / container.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(container.clientWidth, container.clientHeight);
});

// アニメーション状態管理
let currentModelData = null;
let animatedEntries = [];
let frameStart = 1;
let frameEnd = 1;
let fps = 24;
let currentFrame = 1;
let isPlaying = true;
let lastTimestamp = 0;

function createTextPlane(text, size, rgba) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 512, 512);

  const r = Math.round((rgba[0] ?? 0.02) * 255);
  const g = Math.round((rgba[1] ?? 0.02) * 255);
  const b = Math.round((rgba[2] ?? 0.02) * 255);
  const a = rgba[3] ?? 1.0;

  ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${a})`;
  ctx.font = 'bold 340px "Noto Sans JP", "Hiragino Kaku Gothic ProN", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 256, 276);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  const mat = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide
  });
  const geom = new THREE.PlaneGeometry(size, size);
  return new THREE.Mesh(geom, mat);
}

function clearCurrentModel() {
  while (zUpRoot.children.length > 0) {
    zUpRoot.remove(zUpRoot.children[0]);
  }
  animatedEntries = [];
}

function buildSceneFromJson(data) {
  clearCurrentModel();
  currentModelData = data;

  const meta = data.meta || {};
  frameStart = meta.frame_start ?? 1;
  frameEnd = meta.frame_end ?? 1;
  fps = meta.fps ?? 24;
  currentFrame = frameStart;

  frameSlider.min = frameStart;
  frameSlider.max = frameEnd;
  frameSlider.value = frameStart;
  updateFrameLabel();

  const materials = (data.materials || []).map((m) => {
    const [r, g, b, a] = m.rgba || [0.8, 0.8, 0.8, 1.0];
    return new THREE.MeshStandardMaterial({
      color: new THREE.Color(r, g, b),
      roughness: 0.45,
      metalness: 0.05,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1
    });
  });

  const nodeMap = new Map();

  for (const obj of data.objects || []) {
    let node;

    if (obj.type === 'MESH') {
      const group = new THREE.Group();
      const verts = obj.vertices || [];
      const faces = obj.faces || [];
      const edges = obj.edges || [];

      if (faces.length > 0) {
        const positions = [];
        for (const poly of faces) {
          // 多角形を扇形に三角形分割
          for (let i = 1; i < poly.length - 1; i++) {
            const v0 = verts[poly[0]];
            const v1 = verts[poly[i]];
            const v2 = verts[poly[i + 1]];
            if (v0 && v1 && v2) {
              positions.push(...v0, ...v1, ...v2);
            }
          }
        }
        const geom = new THREE.BufferGeometry();
        geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geom.computeVertexNormals();

        const mat = (obj.material_index !== null && materials[obj.material_index])
          ? materials[obj.material_index]
          : new THREE.MeshStandardMaterial({ color: 0xcccccc, side: THREE.DoubleSide });

        const mesh = new THREE.Mesh(geom, mat);
        group.add(mesh);
      }

      if (edges.length > 0) {
        const linePositions = [];
        for (const [i0, i1] of edges) {
          const v0 = verts[i0];
          const v1 = verts[i1];
          if (v0 && v1) {
            linePositions.push(...v0, ...v1);
          }
        }
        const lineGeom = new THREE.BufferGeometry();
        lineGeom.setAttribute('position', new THREE.Float32BufferAttribute(linePositions, 3));
        const lineMat = new THREE.LineBasicMaterial({
          color: faces.length > 0 ? 0x1a202c : 0x63b3ed
        });
        const lines = new THREE.LineSegments(lineGeom, lineMat);
        group.add(lines);
      }

      node = group;
    } else if (obj.type === 'FONT') {
      node = createTextPlane(obj.text || '', obj.size || 1.0, obj.rgba || [0.02, 0.02, 0.02, 1.0]);
    } else {
      node = new THREE.Group();
    }

    node.name = obj.name;
    nodeMap.set(obj.name, { node, data: obj });
    animatedEntries.push({ node, keyframes: obj.keyframes || [] });
  }

  // 親子階層を構築
  for (const [name, item] of nodeMap.entries()) {
    const parentName = item.data.parent;
    if (parentName && nodeMap.has(parentName)) {
      nodeMap.get(parentName).node.add(item.node);
    } else {
      zUpRoot.add(item.node);
    }
  }

  applyFrame(currentFrame);
}

const tmpVecA = new THREE.Vector3();
const tmpVecB = new THREE.Vector3();
const tmpQuatA = new THREE.Quaternion();
const tmpQuatB = new THREE.Quaternion();

function applyFrame(frame) {
  for (const entry of animatedEntries) {
    const kfs = entry.keyframes;
    if (!kfs || kfs.length === 0) continue;

    if (kfs.length === 1 || frame <= kfs[0].frame) {
      entry.node.position.set(...kfs[0].loc);
      entry.node.quaternion.set(...kfs[0].rot);
      continue;
    }
    const last = kfs[kfs.length - 1];
    if (frame >= last.frame) {
      entry.node.position.set(...last.loc);
      entry.node.quaternion.set(...last.rot);
      continue;
    }

    // 二分探索で該当区間を特定
    let lo = 0;
    let hi = kfs.length - 1;
    while (lo + 1 < hi) {
      const mid = (lo + hi) >> 1;
      if (kfs[mid].frame <= frame) lo = mid;
      else hi = mid;
    }

    const k0 = kfs[lo];
    const k1 = kfs[hi];
    const span = k1.frame - k0.frame;
    const t = span > 0 ? (frame - k0.frame) / span : 0;

    tmpVecA.set(...k0.loc);
    tmpVecB.set(...k1.loc);
    entry.node.position.lerpVectors(tmpVecA, tmpVecB, t);

    tmpQuatA.set(...k0.rot);
    tmpQuatB.set(...k1.rot);
    entry.node.quaternion.slerpQuaternions(tmpQuatA, tmpQuatB, t);
  }
}

function updateFrameLabel() {
  const disp = Math.round(currentFrame);
  frameLabel.textContent = `Frame: ${disp} / ${frameEnd}`;
  frameSlider.value = disp;
}

async function loadModel(modelId) {
  statusOverlay.textContent = `読み込み中: ${modelId}...`;
  statusOverlay.classList.remove('hidden');
  try {
    // ローカル開発時（../data/）と GitHub Pages 公開時（REPO_RAW_BASE）の両方に対応
    let res = await fetch(`../data/${modelId}.json`).catch(() => null);
    if (!res || !res.ok) {
      res = await fetch(`${REPO_RAW_BASE}/${modelId}.json`);
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    buildSceneFromJson(data);
    document.title = `${data.meta?.title || modelId} - 3D多面体ビューア`;
    statusOverlay.classList.add('hidden');
  } catch (err) {
    statusOverlay.textContent = `データの読み込みに失敗しました (${modelId}): ${err.message}`;
  }
}

async function init() {
  const params = new URLSearchParams(window.location.search);
  let targetId = params.get('model');

  let res = await fetch('../data/index.json').catch(() => null);
  if (!res || !res.ok) {
    res = await fetch(`${REPO_RAW_BASE}/index.json`);
  }
  if (res && res.ok) {
    const catalog = await res.json();
    const models = catalog.models || [];
    modelSelect.innerHTML = '';
    for (const m of models) {
      const opt = document.createElement('option');
      opt.value = m.id;
      opt.textContent = m.title || m.id;
      modelSelect.appendChild(opt);
    }
    if (!targetId && models.length > 0) {
      targetId = models[0].id;
    }
    if (targetId) {
      modelSelect.value = targetId;
    }
  }

  if (targetId) {
    await loadModel(targetId);
  } else {
    statusOverlay.textContent = '表示するモデルが指定されていません。';
  }
}

modelSelect.addEventListener('change', () => {
  const nextId = modelSelect.value;
  const url = new URL(window.location.href);
  url.searchParams.set('model', nextId);
  window.history.replaceState({}, '', url);
  loadModel(nextId);
});

copyUrlBtn.addEventListener('click', async () => {
  const url = new URL(window.location.href);
  url.searchParams.set('model', modelSelect.value);
  await navigator.clipboard.writeText(url.toString());
  const orig = copyUrlBtn.textContent;
  copyUrlBtn.textContent = 'URLをコピーしました！';
  setTimeout(() => { copyUrlBtn.textContent = orig; }, 1800);
});

playPauseBtn.addEventListener('click', () => {
  isPlaying = !isPlaying;
  playPauseBtn.textContent = isPlaying ? '一時停止' : '再生';
});

frameSlider.addEventListener('input', () => {
  isPlaying = false;
  playPauseBtn.textContent = '再生';
  currentFrame = Number(frameSlider.value);
  applyFrame(currentFrame);
  updateFrameLabel();
});

function animate(timestamp) {
  requestAnimationFrame(animate);
  if (lastTimestamp === 0) lastTimestamp = timestamp;
  const dt = (timestamp - lastTimestamp) / 1000;
  lastTimestamp = timestamp;

  if (isPlaying && frameEnd > frameStart) {
    currentFrame += dt * fps;
    if (currentFrame > frameEnd) {
      currentFrame = frameStart + ((currentFrame - frameStart) % (frameEnd - frameStart + 1));
    }
    applyFrame(currentFrame);
    updateFrameLabel();
  }

  controls.update();
  renderer.render(scene, camera);
}

init();
requestAnimationFrame(animate);
