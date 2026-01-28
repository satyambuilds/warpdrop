# WarpDrop - Complete Setup Guide

## Quick Setup (Recommended)

### Windows
```cmd
cd p2p-transfer
setup.bat
```

### Mac/Linux
```bash
cd p2p-transfer
chmod +x setup.sh
./setup.sh
```

This will:
1. Install all dependencies
2. Start both servers automatically
3. Open the app at `http://localhost:3000`

---

## Manual Setup

### Step 1: Install Dependencies

```bash
cd p2p-transfer
npm install
```

This installs dependencies for both client and server using npm workspaces.

### Step 2: Start the Servers

**Option A: Start Both Together (Recommended)**
```bash
npm run dev
```

**Option B: Start Separately (for debugging)**

Terminal 1 - Server:
```bash
cd server
npm run dev
```

Terminal 2 - Client:
```bash
cd client
npm run dev
```

### Step 3: Access the Application

Open your browser and go to:
```
http://localhost:3000
```

**Important:** Go to the root `/` not `/dashboard`

---

## Port Configuration

By default:
- **Server (Backend):** Port `3001`
- **Client (Frontend):** Port `3000`

### If Ports Are in Use

#### Change Server Port

Edit `server/server.js` (line ~135):
```javascript
const PORT = process.env.PORT || 3002;  // Change 3001 to 3002
```

Then update `client/.env`:
```env
VITE_API_URL=http://localhost:3002
VITE_WS_URL=ws://localhost:3002
```

#### Change Client Port

Edit `client/vite.config.js`:
```javascript
server: {
  port: 3002,  // Change from 3000
  // ...
}
```

---

## Common Errors and Fixes

### Error: "Port 3000 is in use"

**Solution 1: Kill the process**

Windows:
```cmd
netstat -ano | findstr :3000
taskkill /PID [PID_NUMBER] /F
```

Mac/Linux:
```bash
lsof -ti:3000 | xargs kill -9
```

**Solution 2: Use different port**
See "Change Client Port" above.

---

### Error: "Port 3001 is in use"

**Solution 1: Kill the process**

Windows:
```cmd
netstat -ano | findstr :3001
taskkill /PID [PID_NUMBER] /F
```

Mac/Linux:
```bash
lsof -ti:3001 | xargs kill -9
```

**Solution 2: Use different port**
See "Change Server Port" above.

---

### Error: "No routes matched location '/dashboard'"

**Problem:** You're trying to access a route that doesn't exist.

**Solution:** WarpDrop has these routes:
- `/` - Home page (START HERE)
- `/send/:roomId` - Sender page (auto-navigated)
- `/transfer/:roomId` - Receiver page (from link)

**Correct URL:** `http://localhost:3000/` (just the root, no /dashboard)

---

### Error: "http proxy error: /api/create-room ENOBUFS"

**Problem:** Client is trying to connect to server on wrong port or server isn't running.

**Solution:**

1. **Make sure server is running first:**
```bash
# In one terminal
cd server
npm run dev

# Wait for: "Signaling server running on port 3001"
```

2. **Then start client in another terminal:**
```bash
# In another terminal
cd client
npm run dev
```

3. **Or use the combined command:**
```bash
npm run dev
```

---

### Error: "Module not found" or "Cannot find module"

**Problem:** Dependencies not installed correctly.

**Solution:**

```bash
# Clean install
rm -rf node_modules package-lock.json
npm cache clean --force
npm install

# Or install each workspace manually
cd client
npm install
cd ../server
npm install
```

---

### Error: WebSocket connection failed

**Problem:** Server not running or firewall blocking.

**Solution:**

1. **Verify server is running:**
```bash
curl http://localhost:3001/api/create-room
# Should return JSON, not error
```

2. **Check firewall:**
   - Windows: Allow Node.js in Windows Defender
   - Mac: System Preferences → Security → Firewall
   - Linux: `sudo ufw allow 3001`

---

## Verify Installation

After starting, you should see:

**Server Terminal:**
```
Signaling server running on port 3001
WebSocket endpoint: ws://localhost:3001
```

**Client Terminal:**
```
VITE v5.x.x ready in XXXms

➜  Local:   http://localhost:3000/
➜  Network: use --host to expose
```

**Browser:**
- Opens to WarpDrop home page
- Shows "Drop your file here" upload zone
- No console errors

---

## Testing Your Setup

1. **Open** `http://localhost:3000/`
2. **Select a test file** (any small file, like an image)
3. **Click** "Create Transfer Link"
4. **Copy the link** from the next page
5. **Open the link** in a new tab or incognito window
6. **Click** "Accept & Download"
7. **Watch** the progress bar complete
8. **Check** your Downloads folder for the file

If all these steps work, your setup is perfect! 🎉

---

## Directory Structure

After setup, you should have:

```
p2p-transfer/
├── node_modules/          # Dependencies (auto-created)
├── client/
│   ├── node_modules/      # Client dependencies
│   ├── src/
│   │   ├── components/    # React components
│   │   │   ├── HomePage.jsx
│   │   │   ├── SendPage.jsx
│   │   │   └── ReceivePage.jsx
│   │   ├── App.jsx
│   │   ├── App.css
│   │   ├── main.jsx
│   │   └── webrtc.js
│   ├── .env               # Client config
│   ├── index.html
│   ├── package.json
│   └── vite.config.js
├── server/
│   ├── node_modules/      # Server dependencies
│   ├── server.js
│   └── package.json
├── package.json           # Workspace config
├── setup.bat             # Windows setup script
├── setup.sh              # Mac/Linux setup script
├── README.md
├── QUICKSTART.md
├── TECHNICAL.md
└── DEPLOYMENT.md
```

---

## Still Having Issues?

1. **Check Node.js version:**
```bash
node --version
# Should be v18.0.0 or higher
```

2. **Update npm:**
```bash
npm install -g npm@latest
```

3. **Try the manual setup steps** in separate terminals

4. **Check the logs** carefully for specific error messages

5. **Clear browser cache** and try again

6. **Try in incognito mode** to rule out extension issues

---

## Need Help?

- Check `TROUBLESHOOTING.md` for more solutions
- Read `TECHNICAL.md` for architecture details
- Open an issue on GitHub
- Email: support@yourdomain.com

---

## Next Steps

Once everything works:
- Transfer a large file (>1GB) to test
- Try on different networks
- Read `DEPLOYMENT.md` for production setup
- Add your own TURN server for corporate network support

Happy transferring! 🚀
