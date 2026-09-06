FROM node:20-alpine

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY . .

# Volume a monter en prod pour persister data/seen.json entre les redeploiements
VOLUME ["/app/data"]

CMD ["node", "src/index.js"]
