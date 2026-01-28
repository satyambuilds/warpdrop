# WarpDrop - Server Test Guide

Your server is running correctly! The error you saw is **expected behavior**.

## Understanding the Error

When you ran:
```cmd
curl http://localhost:3001/api/create-room
```

You got:
```html
Cannot GET /api/create-room
```

**This is CORRECT!** The endpoint only accepts POST requests, not GET requests.

---

## ✅ How to Verify Everything Works

### Option 1: Use the Web Interface (Easiest)

1. **Keep the servers running** (you already have this working!)
2. **Open your browser:** `http://localhost:3000`
3. **You should see:** The WarpDrop home page with "Drop your file here"
4. **Select a file** and click "Create Transfer Link"

If this works, **everything is working perfectly!** ✅

---

### Option 2: Test API with PowerShell

Open PowerShell and run:

```powershell
$body = @{
    metadata = @{
        fileName = "test.txt"
        fileSize = 1024
    }
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:3001/api/create-room" -Method Post -Body $body -ContentType "application/json"
```

**Expected Output:**
```json
{
  "roomId": "x3k2m9p4q1",
  "url": "http://localhost:3001/transfer/x3k2m9p4q1"
}
```

---

### Option 3: Test API with curl (Proper Syntax)

```cmd
curl -X POST http://localhost:3001/api/create-room ^
  -H "Content-Type: application/json" ^
  -d "{\"metadata\":{\"fileName\":\"test.txt\",\"fileSize\":1024}}"
```

**Expected Output:**
```json
{"roomId":"x3k2m9p4q1","url":"http://localhost:3001/transfer/x3k2m9p4q1"}
```

---

## 🎯 Current Status

Based on your output, **everything is working correctly:**

✅ Server running on port 3001  
✅ Client running on port 3000  
✅ WebSocket endpoint active  
✅ No errors in the logs  

---

## 🧪 Complete Test Flow

### Test 1: Open the App

1. Go to: `http://localhost:3000/`
2. You should see the WarpDrop home page

**Expected:** Beautiful dark interface with "Drop your file here"

---

### Test 2: Send a File

1. Select any small file (image, document, etc.)
2. Click "Create Transfer Link"
3. You should see:
   - A QR code
   - A shareable link
   - File information

**Expected:** Page shows "Waiting for receiver..."

---

### Test 3: Receive the File

1. Copy the transfer link from step 2
2. Open it in a **new browser tab** or **incognito window**
3. Click "Accept & Download"
4. Watch the progress bar

**Expected:** File downloads successfully!

---

## 🐛 If You See Issues

### Issue: "No routes matched location"

**Problem:** You're going to wrong URL

**Solution:** Go to `http://localhost:3000/` (root path, no /dashboard)

---

### Issue: Can't select file

**Problem:** Browser permissions

**Solution:** 
- Make sure you're on `http://localhost:3000/` not `https://`
- Allow file access when prompted

---

### Issue: Transfer link doesn't work

**Problem:** Server not running or wrong URL

**Solution:**
1. Check both terminals show servers running
2. Make sure link starts with `http://localhost:3000/transfer/`

---

## ✨ Everything Working?

If you can:
1. ✅ Open `http://localhost:3000/`
2. ✅ Select a file
3. ✅ Create a transfer link
4. ✅ Open link in new tab
5. ✅ Download completes

**Then WarpDrop is working perfectly!** 🎉

---

## 📊 Monitoring Your Transfer

While transferring, you'll see:

**Sender Side:**
- Connection status
- Progress percentage
- Chunks sent
- QR code for sharing

**Receiver Side:**
- Connection status
- Download progress
- Chunks received
- File info

---

## 🎮 Try These Tests

### Test 1: Small File (< 10MB)
- Should transfer in seconds
- Good for initial testing

### Test 2: Medium File (100MB - 1GB)
- Tests sustained transfer
- Verifies no memory issues

### Test 3: Large File (> 1GB)
- Real stress test
- Keep both tabs open!
- Should maintain constant memory (~50MB)

---

## 🔍 Debug Mode

If you want to see what's happening:

1. Open browser DevTools (F12)
2. Go to Console tab
3. You'll see WebRTC logs:
   ```
   WebSocket connected
   Connection state: connected
   Sending chunk 1/1000
   ```

---

## 📞 Need Help?

Your setup is working! If you encounter issues during file transfer:

1. Check `TROUBLESHOOTING.md`
2. Make sure both tabs stay open
3. Check browser console for errors
4. Verify firewall isn't blocking WebRTC

---

## 🚀 Next Steps

Since your setup works:

1. **Try transferring a large file** (test the memory management)
2. **Test on different networks** (home, mobile hotspot)
3. **Try between different devices** (phone to computer)
4. **Read `TECHNICAL.md`** to understand how it works
5. **Check `DEPLOYMENT.md`** when ready for production

---

**Your WarpDrop installation is running correctly!** The curl error was expected. Just use the web interface to transfer files. Enjoy! 🎊
