FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY server ./server
COPY dashboard ./dashboard

EXPOSE 3000

CMD ["node", "server/src/server.js"]
