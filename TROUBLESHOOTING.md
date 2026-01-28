# WarpDrop Troubleshooting Guide

## Common Issues and Solutions

### Issue 1: "No routes matched location '/dashboard'"

**Problem:** You're trying to access a route that doesn't exist.

**Solution:** WarpDrop has only 3 routes:
- `http://localhost:3000/` - Home page (file selection)
- `http://localhost:3000/send/[roomId]` - Sender view (auto-navigated)
- `http://localhost:3000/transfer/[roomId]` - Receiver view (from shared link)

**How to use:**
1. Open `http://localhost:3000/` (not /dashboard)
2. Select a file
3. Click "Create Transfer Link"
4. The app will automatically navigate to the send page

---

### Issue 2: Missing Files After Extraction

**Problem:** After extracting the tar.gz, some files seem missing.

**Solution:** Make sure you extract the archive properly:

**Windows:**
```cmd
# Using 7-Zip or WinRAR
Right-click → Extract Here

# Or using tar (if available)
tar -xzf p2p-transfer.tar.gz
```

**Mac/Linux:**
```bash
tar -xzf p2p-transfer.tar.gz
cd p2p-transfer
```

**Verify files exist:**
```bash
ls -R client/src/
```

You should see:
```
client/src/:
App.css  App.jsx  components/  main.jsx  webrtc.js

client/src/components/:
HomePage.jsx  ReceivePage.jsx  SendPage.jsx
```

---

### Issue 3: npm install fails

**Problem:** Dependencies won't install.

**Solution:**

1. **Check Node version:**
```bash
node --version
# Should be v18.0.0 or higher
```

2. **Clear cache and reinstall:**
```bash
npm cache clean --force
rm -rf node_modules package-lock.json
npm install
```

3. **Install workspaces manually if needed:**
```bash
cd client
npm install
cd ../server
npm install
```

---

### Issue 4: Port Already in Use

**Problem:** Error: `EADDRINUSE: address already in use :::3000` or `:::3001`

**Solution:**

**Option A: Kill the process using the port**

Windows:
```cmd
netstat -ano | findstr :3000
taskkill /PID [PID_NUMBER] /F
```

Mac/Linux:
```bash
lsof -ti:3000 | xargs kill -9
lsof -ti:3001 | xargs kill -9
```

**Option B: Change the ports**

Edit `client/vite.config.js`:
```javascript
server: {
  port: 3002,  // Change to any free port
}
```

Edit `server/server.js`:
```javascript
const PORT = process.env.PORT || 3002;
```

---

### Issue 5: WebSocket Connection Failed

**Problem:** "WebSocket connection to 'ws://localhost:3001' failed"

**Solution:**

1. **Make sure server is running:**
```bash
# In one terminal
cd server
npm run dev
```

2. **Check server logs:**
Look for:
```
Signaling server running on port 3001
WebSocket endpoint: ws://localhost:3001
```

3. **Check firewall:**
```bash
# Windows: Allow Node.js through firewall
# Mac: System Preferences → Security → Firewall → Options → Allow Node

# Linux:
sudo ufw allow 3001
```

---

### Issue 6: File Not Downloading on Receiver Side

**Problem:** Transfer completes but file doesn't download.

**Solution:**

1. **Check browser permissions:**
   - Chrome: Settings → Privacy → Site Settings → Automatic downloads → Allow

2. **For large files, browser may prompt:**
   - Allow the download when prompted
   - Check Downloads folder

3. **FileSystem API not supported (Safari < 15.2):**
   - File will download normally via Blob
   - May use more memory for very large files

---

### Issue 7: Transfer Stops Mid-Way

**Problem:** Transfer starts but stops at a certain percentage.

**Solution:**

1. **Keep both tabs open:**
   - Don't close sender or receiver tabs
   - Don't switch to other tabs on