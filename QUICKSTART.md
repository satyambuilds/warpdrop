# Quick Start Guide - WarpDrop

Get WarpDrop running in 5 minutes!

## Prerequisites

- Node.js 18+ installed ([Download](https://nodejs.org/))
- A code editor (VS Code recommended)
- Terminal/Command Prompt

## Installation Steps

### 1. Navigate to Project Directory

```bash
cd p2p-transfer
```

### 2. Install Dependencies

```bash
npm install
```

This will install dependencies for both client and server using npm workspaces.

### 3. Start Development Servers

```bash
npm run dev
```

This single command starts:
- **Server** on `http://localhost:3001` (signaling + WebSocket)
- **Client** on `http://localhost:3000` (React app)

### 4. Open in Browser

Navigate to:
```
http://localhost:3000
```

## Test the Transfer

### Send a File (Tab 1)

1. Select any file from your computer
2. Click "Create Transfer Link"
3. Copy the link or scan the QR code

### Receive the File (Tab 2)

1. Open the link in a new tab/window or different browser
2. Click "Accept & Download"
3. Watch the progress bar!

**Note:** For testing, open in the same browser (different tabs) or use an incognito window.

## What's Running?

### Server (Port 3001)
- WebSocket signaling server
- REST API for room creation
- Room management and cleanup

### Client (Port 3000)
- React frontend with Vite
- WebRTC connection manager
- File upload/download UI

## Project Structure

```
p2p-transfer/
├── client/                 # React frontend
│   ├── src/
│   │   ├── components/    # React components
│   │   ├── webrtc.js      # WebRTC manager
│   │   ├── App.jsx        # Main app
│   │   └── main.jsx       # Entry point
│   ├── package.json
│   └── vite.config.js
│
├── server/                # Node.js backend
│   ├── server.js          # Express + WebSocket
│   └── package.json
│
├── README.md              # Full documentation
├── TECHNICAL.md           # Technical deep dive
├── DEPLOYMENT.md          # Production deployment
└── package.json           # Root workspace config
```

## Common Commands

```bash
# Start both client and server
npm run dev

# Start only server
npm run dev:server

# Start only client
npm run dev:client

# Build client for production
npm run build

# Start production server
npm run start:server
```

## Testing Large Files

To test with large files:

1. Generate a test file:
```bash
# Linux/Mac - Create 1GB test file
dd if=/dev/zero of=test-1gb.bin bs=1M count=1024

# Or use existing large video files
```

2. Transfer the file using WarpDrop
3. Verify the transfer completes without memory issues

## Troubleshooting

### Port Already in Use

If ports 3000 or 3001 are taken:

**Change Server Port:**
```bash
# In server/server.js, line 1
const PORT = process.env.PORT || 3002;
```

**Change Client Port:**
```bash
# In client/vite.config.js
server: {
  port: 3001  // Change to any free port
}
```

### WebSocket Connection Failed

Make sure:
1. Server is running on port 3001
2. No firewall blocking connections
3. Check browser console for errors

### File Not Downloading

For large files in Chrome:
1. Allow popup if prompted
2. Check "Downloads" settings in browser
3. Ensure sufficient disk space

## Next Steps

- Read [README.md](README.md) for full features
- Check [TECHNICAL.md](TECHNICAL.md) for implementation details
- See [DEPLOYMENT.md](DEPLOYMENT.md) for production setup

## Configuration

### Add TURN Server (Optional)

For users behind restrictive networks, add a TURN server:

Edit `client/src/webrtc.js`:
```javascript
const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { 
    urls: 'turn:your-turn-server.com:3478',
    username: 'username',
    credential: 'password'
  }
];
```

### Environment Variables

Create `client/.env`:
```env
VITE_API_URL=http://localhost:3001
VITE_WS_URL=ws://localhost:3001
```

## Support

- **Issues:** GitHub Issues
- **Questions:** GitHub Discussions
- **Email:** support@yourdomain.com

## License

MIT - See LICENSE file

---

**You're all set! Start transferring files!** 🚀
