const video = document.getElementById('webcam');
const overlay = document.getElementById('overlay');
const statusLabel = document.getElementById('status');
const robotStatus = document.getElementById('robotStatus');

const overlayCtx = overlay.getContext('2d');
const robotCanvas = document.getElementById('robot'); // Pega o canvas corretamente

// REMOVIDO: const robotCtx = robotCanvas.getContext('2d'); -> Conflitava com o WebGL

// 1. Criar a Cena, Câmera e Renderizador WebGL
const scene = new THREE.Scene();
scene.background = new THREE.Color('#0b1220');

// CORRIGIDO: robot.clientWidth -> robotCanvas.clientWidth
const camera = new THREE.PerspectiveCamera(60, robotCanvas.clientWidth / robotCanvas.clientHeight, 0.1, 1000);
camera.position.set(0, 0, 30); 

const renderer = new THREE.WebGLRenderer({ canvas: robotCanvas, antialias: true });
// CORRIGIDO: robot.clientWidth -> robotCanvas.clientWidth
renderer.setSize(robotCanvas.clientWidth, robotCanvas.clientHeight);

// 2. Adicionar Iluminação
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0x38bdf8, 1.2);
directionalLight.position.set(10, 20, 15);
scene.add(directionalLight);

// 3. Criar os Nós Mecânicos (21 Esferas para os Landmarks)
const joints = [];
const jointGeometry = new THREE.SphereGeometry(0.6, 32, 32);
const jointMaterial = new THREE.MeshStandardMaterial({
    color: '#38bdf8',
    roughness: 0.2,
    metalness: 0.8,
    emissive: '#155e75'
});

for (let i = 0; i < 21; i++) {
    const sphere = new THREE.Mesh(jointGeometry, jointMaterial);
    scene.add(sphere);
    joints.push(sphere);
}

// Redimensionar a cena caso o layout mude
window.addEventListener('resize', () => {
    const width = robotCanvas.clientWidth;
    const height = robotCanvas.clientHeight;
    renderer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
});

let model = null;
let videoWidth = 640;
let videoHeight = 480;
let handVisible = false;

const fingerKeypoints = {
  thumb: [1, 2, 3, 4],
  index: [5, 6, 7, 8],
  middle: [9, 10, 11, 12],
  ring: [13, 14, 15, 16],
  pinky: [17, 18, 19, 20],
};

function setStatus(text, hidden = false) {
  statusLabel.textContent = text;
  statusLabel.classList.toggle('hidden', hidden);
}

function setRobotStatus(text, hidden = false) {
  robotStatus.textContent = text;
  robotStatus.classList.toggle('hidden', hidden);
}

function resizeCanvases() {
  const rect = video.getBoundingClientRect();
  overlay.width = rect.width;
  overlay.height = rect.height;
  robotCanvas.width = rect.width;
  robotCanvas.height = rect.height;
  videoWidth = rect.width;
  videoHeight = rect.height;
}

function distance(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

function fingerCurl(landmarks, finger) {
  const indexes = fingerKeypoints[finger];
  const a = landmarks[indexes[1]];
  const b = landmarks[indexes[2]];
  const c = landmarks[indexes[3]];
  const ab = [b[0] - a[0], b[1] - a[1]];
  const bc = [c[0] - b[0], c[1] - b[1]];
  const abNorm = Math.hypot(ab[0], ab[1]);
  const bcNorm = Math.hypot(bc[0], bc[1]);
  if (!abNorm || !bcNorm) return 0;
  const cos = (ab[0] * bc[0] + ab[1] * bc[1]) / (abNorm * bcNorm);
  return Math.max(0, Math.min(1, (1 - cos) / 2));
}

function getPalmCenter(landmarks) {
  const base = [0, 0];
  const points = [0, 5, 9, 13, 17].map(index => landmarks[index]);
  points.forEach(point => {
    base[0] += point[0];
    base[1] += point[1];
  });
  return [base[0] / points.length, base[1] / points.length];
}

function getVideoDimensions() {
  return {
    width: video.videoWidth || videoWidth || overlay.width,
    height: video.videoHeight || videoHeight || overlay.height,
  };
}

function drawOverlay(landmarks) {
  overlayCtx.clearRect(0, 0, overlay.width, overlay.height);
  if (!landmarks) return;
  
  overlayCtx.lineWidth = 2;
  overlayCtx.strokeStyle = '#38bdf8';
  overlayCtx.fillStyle = '#38bdf8';

  const videoDims = getVideoDimensions();
  const scaleX = overlay.width / videoDims.width;
  const scaleY = overlay.height / videoDims.height;

  const lines = [
    [0, 1, 2, 3, 4],
    [0, 5, 6, 7, 8],
    [0, 9, 10, 11, 12],
    [0, 13, 14, 15, 16],
    [0, 17, 18, 19, 20],
  ];

  lines.forEach(path => {
    overlayCtx.beginPath();
    path.forEach((index, idx) => {
      const [x, y] = landmarks[index];
      const px = overlay.width - x * scaleX;
      const py = y * scaleY;
      if (idx === 0) overlayCtx.moveTo(px, py);
      else overlayCtx.lineTo(px, py);
    });
    overlayCtx.stroke();
  });

  landmarks.forEach(point => {
    const px = overlay.width - point[0] * scaleX;
    const py = point[1] * scaleY;
    overlayCtx.beginPath();
    overlayCtx.arc(px, py, 4, 0, Math.PI * 2);
    overlayCtx.fill();
  });
}

function drawRobotHand(landmarks) {
  if (!landmarks) {
    // Se não houver mão, esconde as juntas
    joints.forEach(j => j.position.set(0, -999, 0));
    renderer.render(scene, camera);
    return;
  }

  const videoDims = getVideoDimensions();
  const scaleX = 40 / videoDims.width;
  const scaleY = 30 / videoDims.height;
  const scaleZ = 0.05;

  landmarks.forEach((lm, idx) => {
    const targetX = -(lm[0] * scaleX - 20);
    const targetY = -(lm[1] * scaleY - 15);
    const targetZ = -lm[2] * scaleZ;        

    joints[idx].position.x += (targetX - joints[idx].position.x) * 0.4;
    joints[idx].position.y += (targetY - joints[idx].position.y) * 0.4;
    joints[idx].position.z += (targetZ - joints[idx].position.z) * 0.4;
  });

  renderer.render(scene, camera);
}

async function initWebcam() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    setStatus('Câmera não disponível no navegador. Use um navegador moderno.', false);
    return;
  }

  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
  video.srcObject = stream;
  return new Promise(resolve => {
    video.onloadedmetadata = () => {
      video.play();
      resizeCanvases();
      resolve();
    };
  });
}

async function initModel() {
  setStatus('Carregando modelo de mão...', false);
  if (typeof handpose === 'undefined' || !handpose.load) {
    throw new Error('handpose não está carregado. Verifique os scripts em index.html.');
  }

  model = await handpose.load();
  setStatus('Modelo carregado. Permita a câmera e mova a mão na frente.', true);
  setRobotStatus('Aguardando mão...', false);
}

async function runDetection() {
  if (!model || video.readyState < 2) {
    requestAnimationFrame(runDetection);
    return;
  }

  try {
    const predictions = await model.estimateHands(video);
    if (predictions.length > 0) {
      handVisible = true;
      const landmarks = predictions[0].landmarks;
      drawOverlay(landmarks);
      drawRobotHand(landmarks);
      setRobotStatus('Mão detectada! A mão robótica está imitando seus gestos.', true);
    } else {
      handVisible = false;
      overlayCtx.clearRect(0, 0, overlay.width, overlay.height);
      
      // CORRIGIDO: Substitui o robotCtx.clearRect por atualizar a cena 3D com "null"
      drawRobotHand(null);
      
      setRobotStatus('Aguardando mão...', false);
    }
  } catch (error) {
    console.error('Erro de detecção:', error);
    setStatus('Erro de detecção. Veja o console do navegador.', false);
  }

  requestAnimationFrame(runDetection);
}

async function startApp() {
  await tf.ready();
  await initWebcam();
  await initModel();
  requestAnimationFrame(runDetection);
}

window.addEventListener('resize', resizeCanvases);
startApp().catch(error => {
  console.error(error);
  setStatus('Erro ao iniciar a aplicação. Veja o console para detalhes.', false);
});