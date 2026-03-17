FROM node:20-slim

WORKDIR /app

ENV TZ=Asia/Bangkok
RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

RUN mkdir -p /data

CMD ["node", "src/index.js"]
