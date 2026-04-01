FROM node:20-slim

# Instalar ffmpeg y yt-dlp
RUN apt-get update && \
    apt-get install -y ffmpeg python3 python3-pip ca-certificates --no-install-recommends && \
    pip3 install --break-system-packages yt-dlp && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .

EXPOSE 3000
CMD ["node", "server.js"]
