# WebML Tracker de Mão

Projeto de demonstração usando TensorFlow.js para capturar movimentos de mão pela webcam e exibir uma mão robótica que imita os gestos.

## Como usar

1. Instale o Node.js se ainda não tiver.
2. No terminal, navegue até a pasta `webml`.
3. Execute `npm install` (não há dependências extras, mas garante o `package-lock` se necessário).
4. Execute `npm start`.
5. Abra `http://localhost:3000` no navegador.
6. Permita o acesso à câmera.
7. Mova a mão em frente à webcam.

## Arquivos

- `index.html` - interface da página.
- `styles.css` - estilos visuais.
- `app.js` - código que usa TensorFlow.js e o modelo handpose.

## Requisitos

- Navegador com suporte a `MediaDevices.getUserMedia`.
- Conexão à Internet para carregar TensorFlow.js e o modelo.

## Nota

Este exemplo usa o modelo `@tensorflow-models/handpose` para detectar os pontos da mão e desenhar uma animação simplificada da mão robótica.
# WebML_handtracker
