const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const robot = require('robotjs');

const root = path.join(__dirname);
const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
};

// 1. SERVIDOR ESTÁTICO ORIGINAL (Mantém sua página no ar)
const server = http.createServer((req, res) => {
  const safeUrl = req.url.replace(/\?.*$/, '').replace(/\#.*$/, '');
  const requestedPath = safeUrl === '/' ? 'index.html' : safeUrl.replace(/^\//, '');
  let filePath = path.join(root, requestedPath);
  
  if (!filePath.startsWith(root)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Acesso negado');
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Arquivo não encontrado');
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = mimeTypes[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(filePath).pipe(res);
  });
});

// 2. A PONTE DE HARDWARE (Escuta o app.js e aperta as teclas)
const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  console.log("✅ Navegador conectado! Recebendo sinais de rastreamento...");

  ws.on('message', (message) => {
    const directionKey = message.toString();
    
    const keyMap = {
      'ArrowUp': 'up',
      'ArrowDown': 'down',
      'ArrowLeft': 'left',
      'ArrowRight': 'right'
    };

    const physicalKey = keyMap[directionKey];

    if (physicalKey) {
      console.log(`🎮 Apertando tecla: ${physicalKey.toUpperCase()}`);
      
      // Simula o pressionamento contínuo por uma fração de segundo para o jogo reconhecer
      robot.keyToggle(physicalKey, 'down');
      setTimeout(() => {
        robot.keyToggle(physicalKey, 'up');
      }, 50);
    }
  });
});

// 3. INICIALIZAÇÃO ÚNICA DA PORTA 3000
const port = process.env.PORT || 3000;
server.listen(port, () => {
  console.log(`🚀 Servidor rodando em http://localhost:${port}`);
  console.log(`🤖 Motor de teclado (RobotJS) ativo na mesma porta.`);
});