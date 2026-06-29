const video = document.getElementById('webcam');
const overlay = document.getElementById('overlay');
const statusLabel = document.getElementById('status');
const robotStatus = document.getElementById('robotStatus');

const overlayCtx = overlay.getContext('2d');
const robotCanvas = document.getElementById('robot'); 

// 1. Criar a Cena, Câmera e Renderizador WebGL
const scene = new THREE.Scene();
scene.background = new THREE.Color('#0b1220');

const camera = new THREE.PerspectiveCamera(60, robotCanvas.clientWidth / robotCanvas.clientHeight, 0.1, 1000);
camera.position.set(0, 0, 30); 

const renderer = new THREE.WebGLRenderer({ canvas: robotCanvas, antialias: true });
renderer.setSize(robotCanvas.clientWidth, robotCanvas.clientHeight);

// 2. Adicionar Iluminação Avançada
const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0x38bdf8, 1.5);
directionalLight.position.set(10, 20, 15);
scene.add(directionalLight);

const pointLight = new THREE.PointLight(0xffffff, 0.5, 50);
pointLight.position.set(0, 0, 20);
scene.add(pointLight);

// 3. Criar as Articulações (Esferas)
const joints = [];
const jointGeometry = new THREE.SphereGeometry(0.5, 32, 32);
const jointMaterial = new THREE.MeshStandardMaterial({
    color: '#38bdf8',
    roughness: 0.1,
    metalness: 0.9,
    emissive: '#0369a1' 
});

for (let i = 0; i < 21; i++) {
    const sphere = new THREE.Mesh(jointGeometry, jointMaterial);
    scene.add(sphere);
    joints.push(sphere);
}

// 4. Criar a Estrutura Óssea/Pistões (Cilindros)
// Definição das conexões padrões do Handpose do dedão ao mindinho
const bonePairs = [
  [0, 1], [1, 2], [2, 3], [3, 4],       // Polegar
  [0, 5], [5, 6], [6, 7], [7, 8],       // Indicador
  [5, 9], [9, 10], [10, 11], [11, 12],  // Médio
  [9, 13], [13, 14], [14, 15], [15, 16], // Anelar
  [13, 17], [0, 17], [17, 18], [18, 19], [19, 20] // Mínimo e base da palma
];

const bones = [];
// Criamos um cilindro padrão apontado para cima. Nós vamos escalacioná-lo e rotacioná-lo em tempo real.
const boneGeometry = new THREE.CylinderGeometry(0.2, 0.3, 1, 16); 
const boneMaterial = new THREE.MeshStandardMaterial({
    color: '#475569', // Metal fosco industrial
    roughness: 0.4,
    metalness: 0.7
});

bonePairs.forEach(() => {
    const cylinder = new THREE.Mesh(boneGeometry, boneMaterial);
    scene.add(cylinder);
    bones.push(cylinder);
});

// Função matemática para posicionar e rotacionar o cilindro entre dois pontos 3D
function updateBone(cylinder, vStart, vEnd) {
    const distance = vStart.distanceTo(vEnd);
    cylinder.position.copy(vStart).add(vEnd).multiplyScalar(0.5); // Posiciona no ponto médio
    
    // Alinha o cilindro vertical com a direção do osso
    cylinder.scale.set(1, distance, 1);
    cylinder.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), vEnd.clone().sub(vStart).normalize());
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
    // Esconde tudo se a mão sumir
    joints.forEach(j => j.position.set(0, -999, 0));
    bones.forEach(b => b.position.set(0, -999, 0));
    renderer.render(scene, camera);
    return;
  }

  const videoDims = getVideoDimensions();
  const scaleX = 40 / videoDims.width;
  const scaleY = 30 / videoDims.height;
  const scaleZ = 0.06; // Leve aumento na percepção de profundidade

  // 1. Atualizar posição dos nós das articulações
  landmarks.forEach((lm, idx) => {
    const targetX = -(lm[0] * scaleX - 20);
    const targetY = -(lm[1] * scaleY - 15);
    const targetZ = -lm[2] * scaleZ;        

    // Amortecimento suave para os nós
    joints[idx].position.x += (targetX - joints[idx].position.x) * 0.45;
    joints[idx].position.y += (targetY - joints[idx].position.y) * 0.45;
    joints[idx].position.z += (targetZ - joints[idx].position.z) * 0.45;
  });

  // 2. Atualizar os segmentos cilíndricos conectando as articulações
  bonePairs.forEach((pair, idx) => {
      const startJoint = joints[pair[0]].position;
      const endJoint = joints[pair[1]].position;
      updateBone(bones[idx], startJoint, endJoint);
  });

  renderer.render(scene, camera);
}

async function initWebcam() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    setStatus('Câmera não disponível no navegador.', false);
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
  model = await handpose.load();
  setStatus('Modelo carregado.', true);
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
      drawRobotHand(null);
      setRobotStatus('Aguardando mão...', false);
    }
  } catch (error) {
    console.error('Erro de detecção:', error);
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
  setStatus('Erro ao iniciar a aplicação.', false);
});