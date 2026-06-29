# Usa uma imagem oficial e leve do Node.js
FROM node:18-alpine

# Define o diretório de trabalho dentro do contêiner
WORKDIR /usr/src/app

# Copia os arquivos de configuração de pacotes (package.json e package-lock.json)
COPY package*.json ./

# Instala as dependências
RUN npm install

# Copia todos os outros arquivos do projeto para o contêiner
COPY . .

# Expõe a porta 3000 (a mesma que configurada no server.js)
EXPOSE 3000

# Comando para iniciar o servidor
CMD ["npm", "start"]
