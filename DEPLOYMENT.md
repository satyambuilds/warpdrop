# WarpDrop Deployment Guide

This guide covers deploying WarpDrop to production environments.

## Table of Contents
1. [Quick Deploy Options](#quick-deploy-options)
2. [Manual Deployment](#manual-deployment)
3. [Docker Deployment](#docker-deployment)
4. [Environment Configuration](#environment-configuration)
5. [TURN Server Setup](#turn-server-setup)
6. [Scaling Considerations](#scaling-considerations)

---

## Quick Deploy Options

### Option 1: Vercel (Client) + Railway (Server)

**Client (Vercel):**
```bash
cd client
vercel --prod
```

**Server (Railway):**
1. Connect GitHub repo to Railway
2. Set root directory to `/server`
3. Add environment variables
4. Deploy

### Option 2: Single Server (VPS)

**Requirements:**
- Ubuntu 20.04+ / Debian 11+
- Node.js 18+
- Nginx
- SSL Certificate (Let's Encrypt)

---

## Manual Deployment

### 1. Server Setup (VPS/Cloud)

**Install Dependencies:**
```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 18
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Install Nginx
sudo apt install -y nginx

# Install Certbot for SSL
sudo apt install -y certbot python3-certbot-nginx
```

**Clone and Build:**
```bash
# Clone repository
git clone <your-repo-url> /var/www/warpdrop
cd /var/www/warpdrop

# Install dependencies
npm install

# Build client
cd client
npm run build
cd ..
```

**Create systemd service:**
```bash
sudo nano /etc/systemd/system/warpdrop.service
```

```ini
[Unit]
Description=WarpDrop Signaling Server
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/var/www/warpdrop/server
Environment="NODE_ENV=production"
Environment="PORT=3001"
ExecStart=/usr/bin/node server.js
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
```

**Start service:**
```bash
sudo systemctl daemon-reload
sudo systemctl enable warpdrop
sudo systemctl start warpdrop
sudo systemctl status warpdrop
```

### 2. Nginx Configuration

**Create config file:**
```bash
sudo nano /etc/nginx/sites-available/warpdrop
```

```nginx
# HTTP to HTTPS redirect
server {
    listen 80;
    server_name yourdomain.com;
    return 301 https://$server_name$request_uri;
}

# HTTPS server
server {
    listen 443 ssl http2;
    server_name yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # Client (React app)
    location / {
        root /var/www/warpdrop/client/dist;
        try_files $uri $uri/ /index.html;
        
        # Cache static assets
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
        }
    }

    # API endpoints
    location /api {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # WebSocket upgrade
    location ~ ^/(\?roomId=) {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        
        # WebSocket timeout settings
        proxy_connect_timeout 7d;
        proxy_send_timeout 7d;
        proxy_read_timeout 7d;
    }
}
```

**Enable site:**
```bash
sudo ln -s /etc/nginx/sites-available/warpdrop /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

**Get SSL Certificate:**
```bash
sudo certbot --nginx -d yourdomain.com
```

### 3. Update Client Configuration

Create production `.env` in client:
```bash
VITE_API_URL=https://yourdomain.com
VITE_WS_URL=wss://yourdomain.com
```

Rebuild client:
```bash
cd client
npm run build
```

---

## Docker Deployment

### Single Container (All-in-One)

**Dockerfile:**
```dockerfile
FROM node:18-alpine AS builder

# Build client
WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

# Production image
FROM node:18-alpine

WORKDIR /app

# Install server dependencies
COPY server/package*.json ./
RUN npm ci --production

# Copy server code
COPY server/ ./

# Copy built client
COPY --from=builder /app/client/dist ./public

# Serve static files from server
RUN echo "import express from 'express';" > serve-static.js && \
    echo "app.use(express.static('public'));" >> serve-static.js

EXPOSE 3001

CMD ["node", "server.js"]
```

**Build and Run:**
```bash
docker build -t warpdrop .
docker run -d -p 3001:3001 --name warpdrop-app warpdrop
```

### Docker Compose (Separate Services)

**docker-compose.yml:**
```yaml
version: '3.8'

services:
  server:
    build:
      context: ./server
    ports:
      - "3001:3001"
    environment:
      - NODE_ENV=production
      - PORT=3001
    restart: unless-stopped
    networks:
      - warpdrop-network

  client:
    build:
      context: ./client
    ports:
      - "80:80"
    depends_on:
      - server
    restart: unless-stopped
    networks:
      - warpdrop-network

networks:
  warpdrop-network:
    driver: bridge
```

**Deploy:**
```bash
docker-compose up -d
```

---

## Environment Configuration

### Production Environment Variables

**Server (.env):**
```bash
NODE_ENV=production
PORT=3001

# Optional: Custom TURN server
TURN_SERVER_URL=turn:your-turn-server.com:3478
TURN_USERNAME=username
TURN_CREDENTIAL=password
```

**Client (.env.production):**
```bash
VITE_API_URL=https://api.yourdomain.com
VITE_WS_URL=wss://api.yourdomain.com
```

---

## TURN Server Setup

For users behind restrictive NATs, you need a TURN server.

### Option 1: Coturn (Self-Hosted)

**Install:**
```bash
sudo apt install coturn
```

**Configure (/etc/turnserver.conf):**
```conf
listening-port=3478
tls-listening-port=5349
listening-ip=YOUR_SERVER_IP
external-ip=YOUR_SERVER_IP

realm=yourdomain.com
server-name=yourdomain.com

# Authentication
lt-cred-mech
user=username:password

# SSL certificates (optional)
cert=/etc/letsencrypt/live/yourdomain.com/cert.pem
pkey=/etc/letsencrypt/live/yourdomain.com/privkey.pem

# Relay configuration
min-port=49152
max-port=65535

# Logging
verbose
log-file=/var/log/turnserver.log
```

**Start service:**
```bash
sudo systemctl enable coturn
sudo systemctl start coturn
```

**Firewall rules:**
```bash
sudo ufw allow 3478/tcp
sudo ufw allow 3478/udp
sudo ufw allow 5349/tcp
sudo ufw allow 49152:65535/tcp
sudo ufw allow 49152:65535/udp
```

**Update WebRTC config in client/src/webrtc.js:**
```javascript
const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { 
    urls: 'turn:yourdomain.com:3478',
    username: 'username',
    credential: 'password'
  }
];
```

### Option 2: Managed TURN Services

**Twilio:**
```javascript
// Get credentials from Twilio API
const response = await fetch('https://api.twilio.com/2010-04-01/Accounts/YOUR_ACCOUNT_SID/Tokens.json', {
  method: 'POST',
  headers: {
    'Authorization': 'Basic ' + btoa('YOUR_ACCOUNT_SID:YOUR_AUTH_TOKEN')
  }
});
const data = await response.json();
// Use data.ice_servers
```

**Xirsys:**
```javascript
// Use Xirsys API to get TURN credentials
// Update in webrtc.js
```

---

## Scaling Considerations

### Load Balancing

**Nginx upstream:**
```nginx
upstream warpdrop_servers {
    least_conn;
    server 10.0.0.1:3001;
    server 10.0.0.2:3001;
    server 10.0.0.3:3001;
}

server {
    location /api {
        proxy_pass http://warpdrop_servers;
    }
}
```

### WebSocket Sticky Sessions

For load balancing with WebSockets, use IP hash:
```nginx
upstream warpdrop_servers {
    ip_hash;
    server 10.0.0.1:3001;
    server 10.0.0.2:3001;
}
```

### Redis for Room State (Optional)

For multi-server deployments, use Redis to share room state:

**Install Redis:**
```bash
sudo apt install redis-server
```

**Update server.js:**
```javascript
import Redis from 'redis';
const redis = Redis.createClient();

// Store room in Redis instead of Map
redis.set(`room:${roomId}`, JSON.stringify(roomData));
```

---

## Monitoring

### Basic Monitoring with PM2

**Install PM2:**
```bash
npm install -g pm2
```

**Start with PM2:**
```bash
cd server
pm2 start server.js --name warpdrop
pm2 save
pm2 startup
```

**Monitor:**
```bash
pm2 monit
pm2 logs warpdrop
```

### Advanced: Prometheus + Grafana

Add metrics endpoint to server.js:
```javascript
import prometheus from 'prom-client';

const register = new prometheus.Registry();
prometheus.collectDefaultMetrics({ register });

const activeConnections = new prometheus.Gauge({
  name: 'warpdrop_active_connections',
  help: 'Number of active WebSocket connections',
  registers: [register]
});

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});
```

---

## Security Checklist

- [ ] SSL/TLS enabled (HTTPS/WSS)
- [ ] CORS properly configured
- [ ] Rate limiting on API endpoints
- [ ] Room expiration implemented
- [ ] No sensitive data in logs
- [ ] Firewall rules configured
- [ ] TURN server secured
- [ ] Regular security updates
- [ ] DDoS protection (Cloudflare)

---

## Backup and Recovery

**Backup room data (if persisting):**
```bash
# If using file-based storage
tar -czf backup-$(date +%Y%m%d).tar.gz /var/www/warpdrop/data

# If using Redis
redis-cli SAVE
cp /var/lib/redis/dump.rdb backup-$(date +%Y%m%d).rdb
```

---

## Troubleshooting

**WebSocket connection fails:**
- Check firewall rules
- Verify Nginx WebSocket proxy config
- Check SSL certificate validity

**TURN server not working:**
- Verify ports are open
- Test with: `https://webrtc.github.io/samples/src/content/peerconnection/trickle-ice/`
- Check credentials

**High memory usage:**
- Monitor active rooms
- Implement room cleanup
- Check for memory leaks

---

## Cost Estimate (AWS)

**Small deployment (< 1000 users/month):**
- EC2 t3.small: $15/month
- Data transfer: $10/month
- **Total: ~$25/month**

**Medium deployment (10,000 users/month):**
- EC2 t3.medium: $30/month
- Load balancer: $20/month
- Data transfer: $50/month
- TURN server: $15/month
- **Total: ~$115/month**

Note: Most costs are from TURN relay. P2P connections are free!

---

## Support

For deployment issues:
- GitHub Issues
- Discord: [link]
- Email: devops@yourdomain.com
