# WebSocket Connection Fix

## The Issue You're Seeing

```
Error: Failed to connect to signaling server
sender disconnected from room
```

The WebSocket connects but immediately disconnects. This is usually caused by one of these issues:

## Quick Fixes (Try in Order)

### Fix 1: Restart Both Servers

**Stop the current servers** (Ctrl+C in the terminal)

Then restart:
```cmd
npm run dev
```

Sometimes the WebSocket connection gets into a bad state.

---

### Fix 2: Check Browser Console

1. Open the page: `http://localhost:3000`
2. Press **F12** to open Developer Tools
3. Go to **Console** tab
4. Try selecting a file and creating a link
5. Look for any errors

**Common errors to look for:**
- `Mixed Content` - Make sure you're using `http://` not `https://`
- `WebSocket connection failed` - Check if port 3001 is accessible
- `CORS error` - Server CORS settings

---

### Fix 3: Test WebSocket Directly

Open your browser console (F12) and paste this:

```javascript
const ws = new WebSocket('ws://localhost:3001?roomId=test123&role=sender');
ws.onopen = () => console.log('✅ WebSocket connected!');
ws.onerror = (e) => console.error('❌ WebSocket error:', e);
ws.onclose = (e) => console.log('WebSocket closed. Code:', e.code, 'Reason:', e.reason);
ws.onmessage = (e) => console.log('Message:', e.data);
```

**Expected:** You should see "✅ WebSocket connected!" and receive a message.

**If it fails immediately:**
- Check if server is running on port 3001
- Check Windows Firewall isn't blocking WebSockets
- Try in a different browser (Chrome/Edge)

---

### Fix 4: Disable Browser Extensions

Some browser extensions block WebSockets:
1. Try in **Incognito/Private mode**
2. Or disable extensions temporarily

---

### Fix 5: Check Firewall

**Windows Firewall:**
```cmd
# Run as Administrator
netsh advfirewall firewall add rule name="Node.js WebSocket" dir=in action=allow protocol=TCP localport=3001
```

**Or manually:**
1. Windows Security → Firewall & network protection
2. Advanced settings
3. Inbound Rules → New Rule
4. Port → TCP → 3001 → Allow

---

### Fix 6: Use Alternative Port

If 3001 has issues, change to 3002:

**Edit `server/server.js` (bottom):**
```javascript
const PORT = process.env.PORT || 3002;  // Changed from 3001
```

**Edit `client/.env`:**
```env
VITE_API_URL=http://localhost:3002
VITE_WS_URL=ws://localhost:3002
```

**Restart:**
```cmd
npm run dev
```

---

### Fix 7: Clear Browser Cache

Sometimes cached connections cause issues:

**Chrome/Edge:**
1. Ctrl+Shift+Delete
2. Check "Cached images and files"
3. Click "Clear data"
4. Restart browser

---

## Testing Your Fix

After trying a fix:

1. Go to `http://localhost:3000`
2. Open browser console (F12)
3. Select a file
4. Click "Create Transfer Link"
5. Check console for logs:
   ```
   Connecting to WebSocket: ws://localhost:3001?roomId=xxx&role=sender
   WebSocket connected successfully
   Received message: ready
   ```

**If you see these logs, it's working!** ✅

---

## Alternative: Use the Fixed Version

I've created an updated version with:
- Better error messages
- Connection retry logic
- Timeout handling
- Detailed logging

The WebSocket connection should now tell you exactly what's wrong.

---

## Manual Testing Script

Create a file `test-websocket.html`:

```html
<!DOCTYPE html>
<html>
<head><title>WebSocket Test</title></head>
<body>
<h1>WebSocket Test</h1>
<div id="status">Connecting...</div>
<div id="log"></div>

<script>
const log = (msg) => {
  document.getElementById('log').innerHTML += msg + '<br>';
  console.log(msg);
};

const ws = new WebSocket('ws://localhost:3001?roomId=test&role=sender');

ws.onopen = () => {
  document.getElementById('status').textContent = '✅ Connected!';
  document.getElementById('status').style.color = 'green';
  log('WebSocket opened');
};

ws.onerror = (e) => {
  document.getElementById('status').textContent = '❌ Error';
  document.getElementById('status').style.color = 'red';
  log('Error: ' + e);
};

ws.onclose = (e) => {
  document.getElementById('status').textContent = '⚠️ Closed';
  log('Closed. Code: ' + e.code + ', Reason: ' + e.reason);
};

ws.onmessage = (e) => {
  log('Message: ' + e.data);
};
</script>
</body>
</html>
```

Open this file in your browser. If it connects, your WebSocket is working.

---

## Still Not Working?

If none of these work, there might be a system-level issue:

1. **Antivirus software** blocking WebSockets
2. **Corporate proxy** interfering
3. **VPN** blocking local connections
4. **WSL/Docker** network issues (if using those)

Try:
- Temporarily disable antivirus
- Disconnect from VPN
- Test on a different computer
- Use a different network

---

## Get Help

If still stuck, provide:
1. Browser console errors (F12 → Console)
2. Server terminal output
3. Browser version
4. Operating system
5. Any antivirus/firewall software running

---

**Most common cause:** Browser extension or firewall blocking WebSocket connections. Try incognito mode first! 🔍
