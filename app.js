//app.js - Arquivo Completo
const video = document.getElementById('webcam');
const overlay = document.getElementById('overlay');
const statusLabel = document.getElementById('status');
const robotStatus = document.getElementById('robotStatus');
const overlayCtx = overlay.getContext('2d');
const robotCanvas = document.getElementById('robot');

// ============================================================
// PARÂMETROS ESTRUTURAIS (Design Unibody PLA)
// ============================================================
const R = [
    1.35, // 0: Pulso
    0.90, 0.75, 0.65, 0.50, // Polegar
    0.85, 0.70, 0.60, 0.45, // Indicador
    0.90, 0.75, 0.65, 0.45, // Médio
    0.85, 0.70, 0.60, 0.45, // Anelar
    0.75, 0.65, 0.55, 0.40  // Mínimo
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

// ============================================================
// 1. SETUP DA CENA 3D (Three.js - Exclusivo para o Painel Direito)
// ============================================================
const scene = new THREE.Scene();
scene.background = null;

const camera = new THREE.PerspectiveCamera(50, robotCanvas.clientWidth / robotCanvas.clientHeight, 0.1, 1000);
camera.position.set(0, 0, 35);

const renderer = new THREE.WebGLRenderer({ canvas: robotCanvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(robotCanvas.clientWidth, robotCanvas.clientHeight, false);
renderer.shadowMap.enabled = true;

// Iluminação de Estúdio
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
// 2. CONSTRUÇÃO DA PRÓTESE (Design Unibody - Exclusivo p/ Painel Direito)
// ============================================================
const joints = [];
const bones = [];
const pins = [];
const _hiddenPos = new THREE.Vector3(0, -999, 0);

for (let i = 0; i < 21; i++) {
    const geo = new THREE.SphereGeometry(R[i], 32, 32);
    const mesh = new THREE.Mesh(geo, whitePlasticMaterial);
    mesh.position.copy(_hiddenPos);
    scene.add(mesh);
    joints.push(mesh);
}

boneConnections.forEach(([start, end]) => {
    const geo = new THREE.CylinderGeometry(R[end], R[start], 1, 32);
    const mesh = new THREE.Mesh(geo, whitePlasticMaterial);
    mesh.position.copy(_hiddenPos);
    scene.add(mesh);
    bones.push({ mesh, start, end });
});

PIN_JOINTS.forEach((idx) => {
    const geo = new THREE.CylinderGeometry(R[idx] * 1.1, R[idx] * 1.1, R[idx] * 2.2, 16);
    geo.rotateZ(Math.PI / 2);
    const mesh = new THREE.Mesh(geo, jointCoreMaterial);
    mesh.position.copy(_hiddenPos);
    scene.add(mesh);
    pins.push({ mesh, idx });
});

function updateBone(bone) {
    const vStart = joints[bone.start].position;
    const vEnd = joints[bone.end].position;
    const distance = vStart.distanceTo(vEnd);
    if (distance < 0.01) return;

    bone.mesh.position.copy(vStart).lerp(vEnd, 0.5);
    bone.mesh.scale.set(1, distance, 1);
    const direction = new THREE.Vector3().subVectors(vEnd, vStart).normalize();
    bone.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
}

function hideRobotHand() {
    joints.forEach(j => j.position.copy(_hiddenPos));
    bones.forEach(b => b.mesh.position.copy(_hiddenPos));
    pins.forEach(p => p.mesh.position.copy(_hiddenPos));
}

// ============================================================
// 3. ESTABILIZAÇÃO ESPACIAL E RENDERIZAÇÃO
// ============================================================
let smoothLandmarks = null;
let framesLost = 0;
const MAX_FRAMES_LOST = 6;

// Função exclusiva para mover a mão robô no painel direito
function renderStabilizedHand(landmarks, dims) {
    const scaleX = 40 / dims.width;
    const scaleY = 30 / dims.height;
    const scaleZ = 0.07;

    landmarks.forEach((lm, idx) => {
        const targetX = -(lm[0] * scaleX - 20);
        const targetY = -(lm[1] * scaleY - 15);
        const targetZ = -(lm[2] * scaleZ);

        joints[idx].position.x += (targetX - joints[idx].position.x) * 0.45;
        joints[idx].position.y += (targetY - joints[idx].position.y) * 0.45;
        joints[idx].position.z += (targetZ - joints[idx].position.z) * 0.45;
    });

    bones.forEach(updateBone);

    pins.forEach(pin => {
        pin.mesh.position.copy(joints[pin.idx].position);
        const matchingBone = bones.find(b => b.start === pin.idx);
        if (matchingBone) pin.mesh.quaternion.copy(matchingBone.mesh.quaternion);
    });

    // Renderiza APENAS no canvas "robot" (coluna direita)
    renderer.render(scene, camera);
}

// ============================================================
// 4. FUNÇÕES BASE, LAYOUT E RASTREAMENTO 2D (Coluna Esquerda)
// ============================================================
let model = null;
let videoWidth = 640;
let videoHeight = 480;

function setStatus(text, hidden = false) {
    statusLabel.textContent = text;
    statusLabel.classList.toggle('hidden', hidden);
}

function setRobotStatus(text, hidden = false) {
    robotStatus.textContent = text;
    robotStatus.classList.toggle('hidden', hidden);
}

// Responsividade exclusiva dos painéis separados
function resizeCanvases() {
    const rect = video.getBoundingClientRect();
    overlay.width = rect.width;
    overlay.height = rect.height;
    
    // O Three.js também precisa ser redimensionado para preencher o seu contêiner na direita
    robotCanvas.width = rect.width; 
    robotCanvas.height = rect.height;
    
    syncRendererSize(); // Sincroniza a câmera 3D com o novo tamanho do painel direito
}

function syncRendererSize() {
    // Sincroniza a câmera 3D APENAS com o canvas "robot" (coluna direita)
    const width = robotCanvas.clientWidth || 1;
    const height = robotCanvas.clientHeight || 1;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
}

function getVideoDimensions() {
    return {
        width: video.videoWidth || videoWidth || overlay.width,
        height: video.videoHeight || videoHeight || overlay.height,
    };
}

// CORREÇÃO ORTOGONAL: Função de rastreamento 2D (Exclusivo para o Painel Esquerdo)
function drawOverlay(landmarks, dims) {
    overlayCtx.clearRect(0, 0, overlay.width, overlay.height);
    if (!landmarks) return;

    overlayCtx.lineWidth = 2;
    overlayCtx.strokeStyle = '#38bdf8'; // Azul neon
    overlayCtx.fillStyle = '#38bdf8';
    
    // Escala para mapear landmarks de pixel do vídeo para pixels do canvas
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
            // CORREÇÃO ORTOGONAL DEFINITIVA: 
            // 1. Remove o transform: scaleX(-1) do CSS do wrapper.
            // 2. Aplica o espelhamento diretamente nas coordenadas 2D.
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
        overlayCtx.arc(px, py, 4, 0, Math.PI * 2); // Pontos azuis
        overlayCtx.fill();
    });
}

// ============================================================
// 5. INICIALIZAÇÃO DA IA (Fluxo Original Estável)
// ============================================================
async function initWebcam() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return;
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
    video.srcObject = stream;
    return new Promise((resolve) => {
        video.onloadedmetadata = () => {
            video.play();
            // CORREÇÃO LAYOUT: Removemos o espelhamento geral do CSS e aplicamos ortogonalmente
            video.style.transform = 'scaleX(-1)';
            resizeCanvases();
            resolve();
        };
    });
}

async function initModel() {
    setStatus('Carregando modelo (Painel Esquerdo)...', false);
    model = await handpose.load();
    setStatus('Tracker Ativo.', true);
}

async function runDetection() {
    if (!model || video.readyState < 2) {
        requestAnimationFrame(runDetection);
        return;
    }
    
    try {
        // Coleta os landmarks puros do TensorFlow
        const predictions = await model.estimateHands(video);
        const dims = getVideoDimensions();

        if (predictions.length > 0) {
            const landmarks = predictions[0].landmarks;
            
            // Ação 1 (Esquerda): Desenha marcações 2D no canvas do tracker
            drawOverlay(landmarks, dims);
            
            // Ação 2 (Direita): Transforma e move a malha 3D Unibody no painel direito
            // (Função drawRobotHand agora encapsula o renderStabilizedHand e o framesLost logic)
            handleRobotHandLogic(landmarks, dims);
            
            setRobotStatus('Mão detectada! Gêmeo Ativo (Painel Direito).', true);
        } else {
            // Nenhuma mão na tela
            overlayCtx.clearRect(0, 0, overlay.width, overlay.height);
            handleRobotHandLogic(null, dims); // Esconde a mão robô
            setRobotStatus('Aguardando mão...', false);
        }
    } catch (error) {
        console.error('Erro de Processamento no Loop:', error);
    }
    
    requestAnimationFrame(runDetection);
}

// Função de apoio para lidar com framesLost e estabilização de forma isolada
function handleRobotHandLogic(landmarks, dims) {
    if (!landmarks) {
        framesLost++;
        if (framesLost < MAX_FRAMES_LOST && smoothLandmarks) {
            renderStabilizedHand(smoothLandmarks, dims);
        } else {
            hideRobotHand();
            // Renderiza o Three.js vazio no canvas correspondente
            renderer.render(scene, camera);
            smoothLandmarks = null;
        }
        return;
    }

    framesLost = 0;
    if (!smoothLandmarks) {
        smoothLandmarks = landmarks.map(lm => [...lm]);
    } else {
        const alpha = 0.35; 
        landmarks.forEach((lm, idx) => {
            smoothLandmarks[idx][0] = (alpha * lm[0]) + ((1 - alpha) * smoothLandmarks[idx][0]);
            smoothLandmarks[idx][1] = (alpha * lm[1]) + ((1 - alpha) * smoothLandmarks[idx][1]);
            smoothLandmarks[idx][2] = (alpha * lm[2]) + ((1 - alpha) * smoothLandmarks[idx][2]);
        });
    }

    renderStabilizedHand(smoothLandmarks, dims);
}

async function startApp() {
    try {
        await tf.ready();
        await initWebcam();
        await initModel();
        requestAnimationFrame(runDetection);
    } catch (err) {
        console.error('Erro de Boot:', err);
        setStatus('Falha de inicialização.', false);
    }
}

window.addEventListener('resize', resizeCanvases);
startApp();