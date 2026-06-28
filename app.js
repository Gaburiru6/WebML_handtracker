const video = document.getElementById('webcam');
const overlay = document.getElementById('overlay');
const statusLabel = document.getElementById('status');
const robotCanvas = document.getElementById('robot');
const robotStatus = document.getElementById('robotStatus');

const overlayCtx = overlay.getContext('2d');
const robotCtx = robotCanvas.getContext('2d');

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
  robotCtx.clearRect(0, 0, robotCanvas.width, robotCanvas.height);
  robotCtx.fillStyle = '#0b1220';
  robotCtx.fillRect(0, 0, robotCanvas.width, robotCanvas.height);

  const videoDims = getVideoDimensions();
  const palm = getPalmCenter(landmarks);
  const targetX = robotCanvas.width * (1 - palm[0] / videoDims.width);
  const targetY = robotCanvas.height * (palm[1] / videoDims.height);

  const baseX = targetX;
  const baseY = targetY;
  const palmRadius = Math.min(robotCanvas.width, robotCanvas.height) * 0.18;

  robotCtx.save();
  robotCtx.translate(baseX, baseY);

  robotCtx.fillStyle = '#1e293b';
  robotCtx.strokeStyle = '#38bdf8';
  robotCtx.lineWidth = 4;
  robotCtx.beginPath();
  robotCtx.ellipse(0, 0, palmRadius, palmRadius * 0.9, 0, 0, Math.PI * 2);
  robotCtx.fill();
  robotCtx.stroke();

  const fingerAnimation = {
    thumb: 0.55,
    index: 0.35,
    middle: 0.15,
    ring: -0.05,
    pinky: -0.25,
  };

  const curlValues = {
    thumb: Math.max(0, Math.min(1, fingerCurl(landmarks, 'thumb') * 1.4)),
    index: fingerCurl(landmarks, 'index'),
    middle: fingerCurl(landmarks, 'middle'),
    ring: fingerCurl(landmarks, 'ring'),
    pinky: fingerCurl(landmarks, 'pinky'),
  };

  const fingerLengths = [palmRadius * 0.9, palmRadius * 0.8, palmRadius * 0.75];
  Object.keys(fingerAnimation).forEach((fingerName, index) => {
    const baseAngle = fingerAnimation[fingerName] * Math.PI;
    const flex = curlValues[fingerName];
    const finalAngle = baseAngle - flex * 0.9;
    drawFinger(robotCtx, 0, 0, finalAngle, fingerLengths, 20 + index * 3);
  });

  robotCtx.restore();
}

function drawFinger(ctx, startX, startY, angle, lengths, width) {
  let x = startX;
  let y = startY;
  let currentAngle = angle;

  lengths.forEach((length, idx) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(currentAngle);
    ctx.fillStyle = '#111827';
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 3;
    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') {
      ctx.roundRect(0, -width / 2, length, width, width * 0.4);
    } else {
      const radius = Math.min(width * 0.4, width / 2);
      ctx.moveTo(0 + radius, -width / 2);
      ctx.lineTo(length - radius, -width / 2);
      ctx.quadraticCurveTo(length, -width / 2, length, -width / 2 + radius);
      ctx.lineTo(length, width / 2 - radius);
      ctx.quadraticCurveTo(length, width / 2, length - radius, width / 2);
      ctx.lineTo(radius, width / 2);
      ctx.quadraticCurveTo(0, width / 2, 0, width / 2 - radius);
      ctx.lineTo(0, -width / 2 + radius);
      ctx.quadraticCurveTo(0, -width / 2, radius, -width / 2);
    }
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    x += Math.cos(currentAngle) * length;
    y += Math.sin(currentAngle) * length;
    currentAngle += 0.18;
  });
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
      robotCtx.clearRect(0, 0, robotCanvas.width, robotCanvas.height);
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
