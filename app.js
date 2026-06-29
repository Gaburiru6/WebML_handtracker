const video = document.getElementById('webcam');
const overlay = document.getElementById('overlay');
const statusLabel = document.getElementById('status');
const overlayCtx = overlay.getContext('2d');

let currentDirection = null;
const socket = new WebSocket('ws://localhost:3000');

socket.onopen = () => console.log("✅ Conectado ao servidor Node.js (Motor Pacman).");
socket.onerror = () => console.log("⚠️ Sem conexão com o servidor local. Apenas rastreamento visual ativo.");

function setStatus(text) {
  statusLabel.textContent = text;
}

// ============================================================
// 1. DIMENSIONAMENTO DA TELA
// ============================================================
let model = null;
let videoWidth = 640;
let videoHeight = 480;

function resizeCanvases() {
  if (video.videoWidth) {
    overlay.width = video.videoWidth;
    overlay.height = video.videoHeight;
  }
}

function getVideoDimensions() {
  return {
    width: video.videoWidth || videoWidth || overlay.width,
    height: video.videoHeight || videoHeight || overlay.height,
  };
}

// ============================================================
// 2. RENDERIZAÇÃO DO HAND TRACKING
// ============================================================
function drawOverlay(landmarks, dims) {
  if (!landmarks) return;
  
  overlayCtx.lineWidth = 3;
  overlayCtx.strokeStyle = '#38bdf8';
  overlayCtx.fillStyle = '#38bdf8';
  
  const scaleX = overlay.width / dims.width;
  const scaleY = overlay.height / dims.height;

  const lines = [
    [0, 1, 2, 3, 4], [0, 5, 6, 7, 8], [0, 9, 10, 11, 12],
    [0, 13, 14, 15, 16], [0, 17, 18, 19, 20]
  ];
  
  lines.forEach((path) => {
    overlayCtx.beginPath();
    path.forEach((index, idx) => {
      const [x, y] = landmarks[index];
      
      const px = overlay.width - (x * scaleX); 
      const py = y * scaleY;
      
      if (idx === 0) overlayCtx.moveTo(px, py);
      else overlayCtx.lineTo(px, py);
    });
    overlayCtx.stroke();
  });
  
  landmarks.forEach((point) => {
    const [x, y] = point;
    const px = overlay.width - (x * scaleX);
    const py = y * scaleY;
    
    overlayCtx.beginPath();
    overlayCtx.arc(px, py, 5, 0, Math.PI * 2);
    overlayCtx.fill();
  });
}

// ============================================================
// 3. JOYSTICK VIRTUAL (PACMAN CONTROLLER)
// ============================================================
function controlPacman(landmarks, dims) {
  if (!landmarks) return;
  
  const [x, y] = landmarks[8]; // Ponto 8: Ponta do Dedo Indicador
  
  const normX = x / dims.width;
  const normY = y / dims.height;
  
  let newDirection = null;
  
  if (normY < 0.35) {
    newDirection = 'ArrowUp';
  } else if (normY > 0.65) {
    newDirection = 'ArrowDown';
  } else if (normX < 0.35) {
    newDirection = 'ArrowRight'; 
  } else if (normX > 0.65) {
    newDirection = 'ArrowLeft'; 
  }

  if (newDirection && newDirection !== currentDirection) {
    currentDirection = newDirection;
    setStatus(`Comando enviado: ${newDirection.replace('Arrow', '').toUpperCase()}`);
    
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(newDirection);
    }
  }
}

// ============================================================
// 4. PIPELINE DO MODELO NEURAL
// ============================================================
async function initWebcam() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return;
  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
  video.srcObject = stream;
  return new Promise((resolve) => {
    video.onloadedmetadata = () => {
      video.width = video.videoWidth;
      video.height = video.videoHeight;
      video.play();
      resizeCanvases();
      resolve();
    };
  });
}

async function initModel() {
  setStatus('Carregando arquitetura neural...', false);
  
  const modelType = handPoseDetection.SupportedModels.MediaPipeHands;
  const detectorConfig = {
    runtime: 'tfjs', 
    modelType: 'full',
    maxHands: 1 // Otimizado: Busca apenas 1 mão para o Pacman
  };
  
  model = await handPoseDetection.createDetector(modelType, detectorConfig);
  setStatus('Tracker Ativo. Pronto para jogar o Pacman!');
}

async function runDetection() {
  if (!model || video.readyState < 2) {
    requestAnimationFrame(runDetection);
    return;
  }
  
  try {
    const predictions = await model.estimateHands(video, { flipHorizontal: false });
    const dims = getVideoDimensions();
    
    overlayCtx.clearRect(0, 0, overlay.width, overlay.height);

    if (predictions.length > 0) {
      const dataHand1 = predictions[0].keypoints.map(kp => [kp.x, kp.y, kp.z || 0]);
      
      drawOverlay(dataHand1, dims);
      controlPacman(dataHand1, dims);
    }
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