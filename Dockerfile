FROM node:22-bookworm-slim

# Install ffmpeg and ffprobe for video duration detection and thumbnail repairs
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    ca-certificates \
    wget \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy dependency definitions
COPY package*.json ./

# Install dependencies
RUN npm ci || npm install

# Copy project files
COPY . .

# Build Vite frontend for production
RUN npm run build

# Create necessary directories
RUN mkdir -p data public/thumbnails

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["npm", "start"]
