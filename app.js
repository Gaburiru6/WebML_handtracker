const video = document.getElementById('webcam');
const overlay = document.getElementById('overlay');
const statusLabel = document.getElementById('status');
const robotStatus = document.getElementById('robotStatus');
const overlayCtx = overlay.getContext('2d');
const robotCanvas = document.getElementById('robot');

// ============================================================
// 1. SETUP DA CENA 3D (Three.js)
// ============================================================
const scene = new THREE.Scene();
scene.background = null;

const camera = new THREE.PerspectiveCamera(50, robotCanvas.clientWidth / robotCanvas.clientHeight, 0.1, 1000);
camera.position.set(0, 0, 35);

const renderer = new THREE.WebGLRenderer({ canvas: robotCanvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(robotCanvas.clientWidth, robotCanvas.clientHeight, false);
renderer.shadowMap.enabled = true;

const ambientLight = new THREE.AmbientLight(0xffffff, 0.65);
scene.add(ambientLight);

const keyLight = new THREE.DirectionalLight(0xffffff, 1.0);
keyLight.position.set(10, 20, 15);
scene.add(keyLight);

const rimLight = new THREE.DirectionalLight(0x38bdf8, 0.4);
rimLight.position.set(-10, -10, -10);
scene.add(rimLight);

const whitePlasticMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5, metalness: 0.05 });
const jointCoreMaterial = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.3, metalness: 0.6 });

// ============================================================
// 2. ESTRUTURA DO CHASSI UNIBODY (Classe Multi-Mão)
// ============================================================
const R = [
  1.35, 0.90, 0.75, 0.65, 0.50, // Polegar
  0.85, 0.70, 0.60, 0.45,       // Indicador
  0.90, 0.75, 0.65, 0.45,       // Médio
  0.85, 0.70, 0.60, 0.45,       // Anelar
  0.75, 0.65, 0.55, 0.40        // Mínimo
];

const boneConnections = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [0, 9], [9, 10], [10, 11], [11, 12],
  [0, 13], [13, 14], [14, 15], [15, 16],
  [0, 17], [17, 18], [18, 19], [19, 20],
  [5, 9], [9, 13], [13, 17], [1, 5]
];

const PIN_JOINTS = [2, 3, 6, 7, 10, 11, 14, 15, 18, 19];

class RobotHand3D {
  constructor() {
    this.joints = [];
    this.bones = [];
    this.pins = [];
    this._hiddenPos = new THREE.Vector3(0, -999, 0);
    this.smoothLandmarks = null;
    this.framesLost = 0;
    this.MAX_FRAMES_LOST = 6;
    
    this.buildGeometry();
  }

  buildGeometry() {
    for (let i = 0; i < 21; i++) {
      const geo = new THREE.SphereGeometry(R[i], 32, 32);
      const mesh = new THREE.Mesh(geo, whitePlasticMaterial);
      mesh.position.copy(this._hiddenPos);
      scene.add(mesh);
      this.joints.push(mesh);
    }

    boneConnections.forEach(([start, end]) => {
      const geo = new THREE.CylinderGeometry(R[end], R[start], 1, 32);
      const mesh = new THREE.Mesh(geo, whitePlasticMaterial);
      mesh.position.copy(this._hiddenPos);
      scene.add(mesh);
      this.bones.push({ mesh, start, end });
    });

    PIN_JOINTS.forEach((idx) => {
      const geo = new THREE.CylinderGeometry(R[idx] * 1.1, R[idx] * 1.1, R[idx] * 2.2, 16);
      geo.rotateZ(Math.PI / 2);
      const mesh = new THREE.Mesh(geo, jointCoreMaterial);
      mesh.position.copy(this._hiddenPos);
      scene.add(mesh);
      this.pins.push({ mesh, idx });
    });
  }

  updateBone(bone) {
    const vStart = this.joints[bone.start].position;
    const vEnd = this.joints[bone.end].position;
    const distance = vStart.distanceTo(vEnd);
    if (distance < 0.01) return;

    bone.mesh.position.copy(vStart).lerp(vEnd, 0.5);
    bone.mesh.scale.set(1, distance, 1);
    const direction = new THREE.Vector3().subVectors(vEnd, vStart).normalize();
    bone.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
  }

  hide() {
    this.joints.forEach(j => j.position.copy(this._hiddenPos));
    this.bones.forEach(b => b.mesh.position.copy(this._hiddenPos));
    this.pins.forEach(p => p.mesh.position.copy(this._hiddenPos));
  }

  // Teletransporte Inicial: Previne que a mão voe a partir de -999 atrasando a renderização
  snapTo(landmarks, dims) {
    const scaleX = 40 / dims.width;
    const scaleY = 30 / dims.height;
    const scaleZ = 0.07;
    landmarks.forEach((lm, idx) => {
      const targetX = -(lm[0] * scaleX - 20);
      const targetY = -(lm[1] * scaleY - 15);
      const targetZ = -(lm[2] * scaleZ);
      this.joints[idx].position.set(targetX, targetY, targetZ);
    });
  }

  render(landmarks, dims) {
    if (!landmarks) {
      this.framesLost++;
      if (this.framesLost < this.MAX_FRAMES_LOST && this.smoothLandmarks) {
        this.applyPositions(dims);
      } else {
        this.hide();
        this.smoothLandmarks = null;
      }
      return;
    }

    this.framesLost = 0;
    
    if (!this.smoothLandmarks) {
      this.smoothLandmarks = landmarks.map(lm => [...lm]);
      this.snapTo(landmarks, dims); 
    } else {
      const alpha = 0.35;
      landmarks.forEach((lm, idx) => {
        this.smoothLandmarks[idx][0] = (alpha * lm[0]) + ((1 - alpha) * this.smoothLandmarks[idx][0]);
        this.smoothLandmarks[idx][1] = (alpha * lm[1]) + ((1 - alpha) * this.smoothLandmarks[idx][1]);
        this.smoothLandmarks[idx][2] = (alpha * lm[2]) + ((1 - alpha) * this.smoothLandmarks[idx][2]);
      });
    }

    this.applyPositions(dims);
  }

  applyPositions(dims) {
    const scaleX = 40 / dims.width;
    const scaleY = 30 / dims.height;
    const scaleZ = 0.07;

    this.smoothLandmarks.forEach((lm, idx) => {
      const targetX = -(lm[0] * scaleX - 20);
      const targetY = -(lm[1] * scaleY - 15);
      const targetZ = -(lm[2] * scaleZ);

      this.joints[idx].position.x += (targetX - this.joints[idx].position.x) * 0.45;
      this.joints[idx].position.y += (targetY - this.joints[idx].position.y) * 0.45;
      this.joints[idx].position.z += (targetZ - this.joints[idx].position.z) * 0.45;
    });

    this.bones.forEach(b => this.updateBone(b));

    this.pins.forEach(pin => {
      pin.mesh.position.copy(this.joints[pin.idx].position);
      const matchingBone = this.bones.find(b => b.start === pin.idx);
      if (matchingBone) pin.mesh.quaternion.copy(matchingBone.mesh.quaternion);
    });
  }
}

// Instancia independentemente os dois construtos físicos
const hand1 = new RobotHand3D();
const hand2 = new RobotHand3D();

// ============================================================
// 3. DIMENSIONAMENTO ISOLADO E RASTREAMENTO 2D
// ============================================================
let model = null;
let videoWidth = 640;
let videoHeight = 480;

function syncRendererSize() {
  const width = robotCanvas.clientWidth || 1;
  const height = robotCanvas.clientHeight || 1;
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

function setStatus(text, hidden = false) {
  statusLabel.textContent = text;
  statusLabel.classList.toggle('hidden', hidden);
}

function setRobotStatus(text, hidden = false) {
  robotStatus.textContent = text;
  robotStatus.classList.toggle('hidden', hidden);
}

function resizeCanvases() {
  // Ajusta o vídeo e o overlay baseados no painel esquerdo
  const vRect = video.getBoundingClientRect();
  overlay.width = vRect.width;
  overlay.height = vRect.height;
  videoWidth = vRect.width || 640;
  videoHeight = vRect.height || 480;
  
  // Ajusta o WebGL 3D estritamente com base no seu pai (painel direito) para evitar colapsos
  const rRect = robotCanvas.parentElement.getBoundingClientRect();
  robotCanvas.width = rRect.width || vRect.width;
  robotCanvas.height = rRect.height || vRect.height;
  
  syncRendererSize();
}

function getVideoDimensions() {
  return { width: videoWidth, height: videoHeight };
}

function drawOverlay(landmarks, dims) {
  if (!landmarks) return;
  overlayCtx.lineWidth = 2;
  overlayCtx.strokeStyle = '#38bdf8';
  overlayCtx.fillStyle = '#38bdf8';
  
  const scaleX = overlay.width / dims.width;
  const scaleY = overlay.height / dims.height;

  const lines = [
    [0, 1, 2, 3, 4], [0, 5, 6, 7, 8], [0, 9, 10, 11, 12],
    [0, 13, 14, 15, 16], [0, 17, 18, 19, 20],
  ];
  
  lines.forEach((path) => {
    overlayCtx.beginPath();
    path.forEach((index, idx) => {
      const [x, y] = landmarks[index];
      const px = x * scaleX; 
      const py = y * scaleY;
      if (idx === 0) overlayCtx.moveTo(px, py);
      else overlayCtx.lineTo(px, py);
    });
    overlayCtx.stroke();
  });
  
  landmarks.forEach((point) => {
    const [x, y] = point;
    const px = x * scaleX;
    const py = y * scaleY;
    overlayCtx.beginPath();
    overlayCtx.arc(px, py, 4, 0, Math.PI * 2);
    overlayCtx.fill();
  });
}

// ============================================================
// 4. PIPELINE DO MODELO NEURAL DUAL
// ============================================================
async function initWebcam() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return;
  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
  video.srcObject = stream;
  return new Promise((resolve) => {
    video.onloadedmetadata = () => {
      // Injeta dimensões intrínsecas para ancorar o TensorFlow
      video.width = video.videoWidth;
      video.height = video.videoHeight;
      video.play();
      resizeCanvases();
      resolve();
    };
  });
}

async function initModel() {
  setStatus('Carregando arquitetura neural dupla...', false);
  
  const modelType = handPoseDetection.SupportedModels.MediaPipeHands;
  const detectorConfig = {
    runtime: 'tfjs', 
    modelType: 'full',
    maxHands: 2
  };
  
  model = await handPoseDetection.createDetector(modelType, detectorConfig);
  setStatus('Tracker Ativo.', true);
}

async function runDetection() {
  if (!model || video.readyState < 2) {
    requestAnimationFrame(runDetection);
    return;
  }
  
  try {
    const predictions = await model.estimateHands(video, { flipHorizontal: false });
    const dims = getVideoDimensions();
    
    // Limpeza central do buffer 2D
    overlayCtx.clearRect(0, 0, overlay.width, overlay.height);

    let dataHand1 = null;
    let dataHand2 = null;

    if (predictions.length > 0) {
      // Distribuição blindada (bypassa a string frágil de "handedness")
      if (predictions[0]) {
        dataHand1 = predictions[0].keypoints.map(kp => [kp.x, kp.y, kp.z || 0]);
        drawOverlay(dataHand1, dims);
      }
      if (predictions[1]) {
        dataHand2 = predictions[1].keypoints.map(kp => [kp.x, kp.y, kp.z || 0]);
        drawOverlay(dataHand2, dims);
      }
      
      setRobotStatus(`Gêmeo Ativo: ${predictions.length} mão(s) rastreada(s).`, true);
    } else {
      setRobotStatus('Aguardando usuário...', false);
    }

    // Processamento tridimensional isolado por mão detectada
    hand1.render(dataHand1, dims);
    hand2.render(dataHand2, dims);
    
    renderer.render(scene, camera);

  } catch (error) {
    console.error('Erro de detecção:', error);
  }
  
  requestAnimationFrame(runDetection);
}

async function startApp() {
  try {
    await tf.setBackend('webgl');
    await tf.ready();
    await initWebcam();
    await initModel();
    requestAnimationFrame(runDetection);
  } catch (err) {
    console.error('Erro na inicialização WebGL:', err);
    setStatus('Erro ao iniciar a aplicação.', false);
  }
}

window.addEventListener('resize', resizeCanvases);
startApp();