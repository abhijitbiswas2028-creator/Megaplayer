# Production Deployment Guide — MEGA STREAM X

## 1. Prerequisites

- A Linux VPS (Ubuntu 22.04 LTS or Debian 12 recommended) with at least 1GB RAM.
- Docker & Docker Compose installed.
- Domain name pointed to the VPS IP (e.g., `stream.yourdomain.com`).

## 2. Docker Compose Deployment

1. Clone or copy your MEGA STREAM X repository onto the VPS:
   ```bash
   git clone <repo-url> /opt/mega-stream-x
   cd /opt/mega-stream-x
   ```

2. Configure environment:
   ```bash
   cp .env.example .env
   # Generate a unique 32-byte encryption key:
   openssl rand -hex 32
   # Paste into MEGA_ENCRYPTION_KEY in .env
   ```

3. Launch via Docker Compose:
   ```bash
   docker compose up -d --build
   ```

4. Verify health status:
   ```bash
   curl http://localhost:3000/api/health
   ```

## 3. Reverse Proxy & SSL (Nginx / Caddy)

For video streaming, ensure your reverse proxy enables buffering bypass and range streaming:

```nginx
server {
    server_name stream.yourdomain.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Streaming optimizations
        proxy_buffering off;
        proxy_read_timeout 600s;
        proxy_send_timeout 600s;
    }
}
```
