# Technical Deep Dive - WarpDrop

This document explains the technical implementation details of WarpDrop's P2P file transfer system.

## Table of Contents
1. [WebRTC Architecture](#webrtc-architecture)
2. [Memory Management](#memory-management)
3. [Flow Control](#flow-control)
4. [Connection Lifecycle](#connection-lifecycle)
5. [Chunking Strategy](#chunking-strategy)
6. [Resume Capability](#resume-capability)
7. [Security Model](#security-model)
8. [Performance Optimizations](#performance-optimizations)

---

## WebRTC Architecture

### Why WebRTC?

WebRTC (Web Real-Time Communication) enables direct peer-to-peer connections in browsers without plugins. Key benefits:

- **Direct connection**: No server bandwidth costs
- **Low latency**: Data goes straight from A to B
- **Built-in encryption**: DTLS/SRTP by default
- **NAT traversal**: STUN/TURN handle network complexity
- **Browser native**: No installation required

### Components

```
┌─────────────────────────────────────────┐
│         RTCPeerConnection               │
├─────────────────────────────────────────┤
│  • Connection management                │
│  • ICE candidate gathering              │
│  • DTLS encryption                      │
│  • Network path selection               │
└─────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────┐
│         RTCDataChannel                  │
├─────────────────────────────────────────┤
│  • Reliable or unreliable delivery      │
│  • Ordered or unordered messages        │
│  • Binary or text data                  │
│  • Flow control (bufferedAmount)        │
└─────────────────────────────────────────┘
```

### Signaling Flow

```javascript
// 1. Sender creates offer
const offer = await pc.createOffer();
await pc.setLocalDescription(offer);
sendToServer({ type: 'offer', offer });

// 2. Receiver receives offer and creates answer
await pc.setRemoteDescription(offer);
const answer = await pc.createAnswer();
await pc.setLocalDescription(answer);
sendToServer({ type: 'answer', answer });

// 3. Sender receives answer
await pc.setRemoteDescription(answer);

// 4. Both exchange ICE candidates
pc.onicecandidate = (event) => {
  if (event.candidate) {
    sendToServer({ type: 'ice-candidate', candidate: event.candidate });
  }
};
```

### ICE (Interactive Connectivity Establishment)

ICE finds the best network path:

```
Priority Order:
1. Host candidate (same local network)
2. Server reflexive (via STUN - through NAT)
3. Relay candidate (via TURN - server relay)
```

**STUN Discovery:**
```javascript
// Browser sends packet to STUN server
Client → STUN Server: "What's my public IP?"
STUN Server → Client: "Your public IP is X.X.X.X:PORT"
```

**TURN Relay (fallback):**
```
When direct connection fails:
Client A → TURN Server → Client B
```

---

## Memory Management

### The Problem

Browsers have memory limits (~2GB on 32-bit, ~4GB on 64-bit Chrome). Loading a 50GB file crashes the tab.

### Solution: Streaming Architecture

**Sender Side:**
```javascript
// DON'T: Load entire file
const arrayBuffer = await file.arrayBuffer(); // 💥 Crashes

// DO: Read in chunks
const CHUNK_SIZE = 256 * 1024; // 256KB
const start = chunkIndex * CHUNK_SIZE;
const end = Math.min(start + CHUNK_SIZE, file.size);
const chunk = file.slice(start, end);

const reader = new FileReader();
reader.onload = (e) => {
  dataChannel.send(e.target.result);
};
reader.readAsArrayBuffer(chunk);
```

**Receiver Side:**
```javascript
// DON'T: Store all chunks in memory
const chunks = [];
dataChannel.onmessage = (event) => {
  chunks.push(event.data); // 💥 Runs out of memory
};

// DO: Stream directly to disk (FileSystem API)
const handle = await window.showSaveFilePicker({
  suggestedName: fileName
});
const writable = await handle.createWritable();

dataChannel.onmessage = async (event) => {
  await writable.write(event.data);
};

// When complete
await writable.close();
```

### FileSystem Writable File Stream API

Browser support: Chrome/Edge 86+, Safari 15.2+

```javascript
// Request file save location from user
const handle = await window.showSaveFilePicker({
  suggestedName: 'large-file.mp4',
  types: [{
    description: 'Video files',
    accept: { 'video/mp4': ['.mp4'] }
  }]
});

// Create writable stream
const writable = await handle.createWritable();

// Write chunks as they arrive
await writable.write(chunk1);
await writable.write(chunk2);
await writable.write(chunk3);

// Close when done
await writable.close();
```

**Benefits:**
- Memory usage stays constant (~50MB regardless of file size)
- No need to store entire file in memory
- Browser handles disk I/O efficiently
- Progressive download (file grows on disk)

---

## Flow Control

### The Problem

DataChannel has a limited send buffer (~16MB). Pushing data faster than the network can send causes buffer overflow and connection drop.

### Solution: Backpressure Handling

**Monitor Buffer:**
```javascript
// Check buffer before sending
if (dataChannel.bufferedAmount > MAX_BUFFER_SIZE) {
  // Buffer is full, pause sending
  console.log('Buffer full, waiting...');
  return;
}

// Safe to send
dataChannel.send(chunk);
```

**Resume on Buffer Low:**
```javascript
// Set low threshold (default 0, we set 256KB)
dataChannel.bufferedAmountLowThreshold = 256 * 1024;

dataChannel.onbufferedamountlow = () => {
  // Buffer has drained, resume sending
  console.log('Buffer drained, resuming...');
  sendNextChunk();
};
```

### ACK-Based Flow Control

Additional safety layer:

```javascript
// Sender: Wait for ACK before sending next chunk
dataChannel.send(chunkData);
// Pause until ACK received

// Receiver: Send ACK after processing
dataChannel.onmessage = async (event) => {
  await processChunk(event.data);
  dataChannel.send(JSON.stringify({ type: 'chunk-ack' }));
};

// Sender: Resume on ACK
if (message.type === 'chunk-ack') {
  sendNextChunk();
}
```

**Benefits:**
- Prevents buffer overflow
- Adapts to network speed
- Receiver controls pace
- More reliable for slow connections

---

## Connection Lifecycle

### State Machine

```
┌──────────────────────────────────────────────────────────┐
│                   CONNECTION STATES                       │
├──────────────────────────────────────────────────────────┤
│                                                           │
│  idle → signaling-connected → connecting → connected     │
│                                      ↓                     │
│                                  failed/error              │
│                                      ↓                     │
│                                 disconnected               │
│                                                           │
└──────────────────────────────────────────────────────────┘
```

### Detailed Flow

**1. Idle State**
- No connections
- User selects file
- Creates transfer link

**2. Signaling Connected**
- WebSocket established
- Both peers in room
- Waiting for WebRTC handshake

**3. Connecting**
- SDP exchange complete
- ICE gathering in progress
- Attempting connection

**4. Connected**
- P2P connection established
- DataChannel open
- Ready to transfer

**5. Error States**
- **Connection failed**: ICE failed, no path found
- **Disconnected**: Peer closed tab
- **Network error**: Internet connection lost

### Monitoring Connection Quality

```javascript
pc.onconnectionstatechange = () => {
  console.log('Connection state:', pc.connectionState);
  
  switch (pc.connectionState) {
    case 'connected':
      console.log('✓ Peers connected!');
      break;
    case 'disconnected':
      console.warn('⚠ Connection lost, attempting reconnect...');
      break;
    case 'failed':
      console.error('✗ Connection failed');
      // Attempt ICE restart
      pc.restartIce();
      break;
  }
};

// Monitor ICE connection separately
pc.oniceconnectionstatechange = () => {
  console.log('ICE state:', pc.iceConnectionState);
};
```

---

## Chunking Strategy

### Why Chunk?

Large files must be split for:
- Memory efficiency (avoid loading entire file)
- Error recovery (resend single chunk, not entire file)
- Progress tracking (know % complete)
- Resume capability (know where to restart)

### Chunk Size Selection

```javascript
const CHUNK_SIZE = 256 * 1024; // 256KB

// Why 256KB?
// - Small enough: Won't overwhelm memory
// - Large enough: Reduces overhead (fewer chunks)
// - Network optimal: Good balance for most connections
// - Resume friendly: Granular restart points
```

**Trade-offs:**

| Size    | Pros                      | Cons                        |
|---------|---------------------------|-----------------------------|
| 64KB    | Very memory safe          | High overhead, more chunks  |
| 256KB   | ✓ Balanced                | ✓ Good for most cases       |
| 1MB     | Fewer chunks, less overhead | Higher memory, slow recovery |
| 4MB+    | Lowest overhead           | Memory issues, long waits   |

### Chunk Format

```javascript
// Control messages (JSON strings)
{
  type: 'metadata',
  name: 'large-file.mp4',
  size: 10737418240, // 10GB
  totalChunks: 41943,
  chunkSize: 256000
}

// Data chunks (ArrayBuffer)
Binary data (256KB)

// ACK messages (JSON strings)
{
  type: 'chunk-ack',
  chunkIndex: 1234
}
```

### Chunk Transmission

```javascript
class ChunkSender {
  constructor(file, dataChannel) {
    this.file = file;
    this.dataChannel = dataChannel;
    this.currentChunk = 0;
    this.totalChunks = Math.ceil(file.size / CHUNK_SIZE);
  }

  async sendNextChunk() {
    if (this.currentChunk >= this.totalChunks) {
      this.sendComplete();
      return;
    }

    // Calculate chunk boundaries
    const start = this.currentChunk * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, this.file.size);
    
    // Read chunk
    const chunk = this.file.slice(start, end);
    const arrayBuffer = await this.readChunk(chunk);
    
    // Send with flow control
    this.sendWithBackpressure(arrayBuffer);
    
    this.currentChunk++;
  }

  readChunk(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = reject;
      reader.readAsArrayBuffer(blob);
    });
  }

  sendWithBackpressure(data) {
    if (this.dataChannel.bufferedAmount > MAX_BUFFER_SIZE) {
      // Wait for buffer to drain
      return;
    }
    
    this.dataChannel.send(data);
  }
}
```

---

## Resume Capability

### Architecture

```javascript
// Chunk manifest (sent first)
{
  type: 'metadata',
  chunks: [
    { index: 0, size: 256000, hash: 'abc123...' },
    { index: 1, size: 256000, hash: 'def456...' },
    // ...
  ]
}

// Track received chunks
const receivedChunks = new Set([0, 1, 2, 5, 6, 7]);
// Missing: 3, 4

// Request resume
{
  type: 'resume-request',
  missingChunks: [3, 4]
}

// Sender resends only missing chunks
```

### Implementation (Future Enhancement)

```javascript
class ResumableTransfer {
  constructor() {
    this.chunkHashes = new Map(); // chunkIndex → SHA-256 hash
    this.receivedChunks = new Set();
  }

  async validateChunk(index, data) {
    const hash = await this.sha256(data);
    const expectedHash = this.chunkHashes.get(index);
    return hash === expectedHash;
  }

  async sha256(data) {
    const buffer = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(buffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  getMissingChunks() {
    const missing = [];
    const totalChunks = this.chunkHashes.size;
    
    for (let i = 0; i < totalChunks; i++) {
      if (!this.receivedChunks.has(i)) {
        missing.push(i);
      }
    }
    
    return missing;
  }

  resume() {
    const missing = this.getMissingChunks();
    this.send({ type: 'resume-request', chunks: missing });
  }
}
```

---

## Security Model

### Built-in Security (WebRTC)

**DTLS Encryption:**
- All DataChannel traffic encrypted by default
- Uses TLS 1.2+ (same as HTTPS)
- Perfect forward secrecy
- Authenticated encryption (AEAD)

**Connection Authentication:**
```javascript
// Fingerprint verification
const fingerprint = pc.getConfiguration()
  .iceCandidates[0]
  .certificate.getFingerprints()[0];

// Both peers verify fingerprints match
```

### Application-Level Security

**Room Isolation:**
```javascript
// Each transfer gets unique room ID (10 chars, nanoid)
const roomId = nanoid(10); // "x3k2m9p4q1"
// Collision probability: ~1 in 10^17
```

**Time-based Expiration:**
```javascript
{
  roomId: "abc123",
  createdAt: 1640000000000,
  expiresAt: 1640086400000, // +24 hours
}

// Server auto-deletes expired rooms
```

**Optional Enhancements:**

**1. Room Passwords:**
```javascript
// Generate password on create
const password = generateSecurePassword();
shareLink = `https://app.com/transfer/${roomId}?pwd=${password}`;

// Validate on join
if (providedPassword !== roomPassword) {
  reject('Invalid password');
}
```

**2. One-Time Links:**
```javascript
// Delete room after first use
onTransferComplete: () => {
  rooms.delete(roomId);
}
```

**3. E2E Encryption Layer:**
```javascript
// Additional encryption on top of DTLS
const key = await crypto.subtle.generateKey(
  { name: 'AES-GCM', length: 256 },
  true,
  ['encrypt', 'decrypt']
);

// Encrypt chunk before sending
const encrypted = await crypto.subtle.encrypt(
  { name: 'AES-GCM', iv },
  key,
  chunkData
);
```

---

## Performance Optimizations

### 1. Parallel Chunk Processing

**Current: Sequential**
```javascript
sendChunk(0) → wait → sendChunk(1) → wait → ...
```

**Optimized: Pipeline**
```javascript
// Keep N chunks "in flight"
const PIPELINE_SIZE = 5;
let inFlight = 0;

function sendWithPipeline() {
  while (inFlight < PIPELINE_SIZE && hasMoreChunks()) {
    sendChunk(currentChunk++);
    inFlight++;
  }
}

onChunkAck = () => {
  inFlight--;
  sendWithPipeline();
};
```

### 2. Adaptive Chunk Sizing

```javascript
// Measure connection speed
let bytesTransferred = 0;
let transferStartTime = Date.now();

function calculateSpeed() {
  const elapsed = (Date.now() - transferStartTime) / 1000;
  return bytesTransferred / elapsed; // bytes/sec
}

// Adjust chunk size based on speed
function getOptimalChunkSize() {
  const speed = calculateSpeed();
  
  if (speed > 10 * 1024 * 1024) { // >10 MB/s
    return 1 * 1024 * 1024; // Use 1MB chunks
  } else if (speed > 1 * 1024 * 1024) { // >1 MB/s
    return 256 * 1024; // Use 256KB chunks
  } else { // Slow connection
    return 64 * 1024; // Use 64KB chunks
  }
}
```

### 3. Wake Lock (Prevent Tab Sleep)

```javascript
let wakeLock = null;

async function acquireWakeLock() {
  try {
    if ('wakeLock' in navigator) {
      wakeLock = await navigator.wakeLock.request('screen');
      console.log('Wake lock acquired');
      
      wakeLock.addEventListener('release', () => {
        console.log('Wake lock released');
      });
    }
  } catch (err) {
    console.error('Wake lock failed:', err);
  }
}

// Release when transfer completes
function releaseWakeLock() {
  if (wakeLock) {
    wakeLock.release();
    wakeLock = null;
  }
}
```

### 4. Connection Quality Monitoring

```javascript
// Get real-time stats
setInterval(async () => {
  const stats = await pc.getStats();
  
  stats.forEach(report => {
    if (report.type === 'candidate-pair' && report.state === 'succeeded') {
      console.log('RTT:', report.currentRoundTripTime * 1000, 'ms');
      console.log('Bitrate:', report.availableOutgoingBitrate / 1024, 'kbps');
    }
  });
}, 1000);
```

### 5. Memory Profiling

```javascript
// Monitor memory usage
if (performance.memory) {
  setInterval(() => {
    const used = performance.memory.usedJSHeapSize / 1024 / 1024;
    const limit = performance.memory.jsHeapSizeLimit / 1024 / 1024;
    console.log(`Memory: ${used.toFixed(2)} MB / ${limit.toFixed(2)} MB`);
  }, 5000);
}
```

---

## Browser Compatibility

| Feature | Chrome | Edge | Firefox | Safari |
|---------|--------|------|---------|--------|
| WebRTC DataChannel | ✓ 31+ | ✓ 79+ | ✓ 22+ | ✓ 11+ |
| FileSystem API | ✓ 86+ | ✓ 86+ | ✗ | ✓ 15.2+ |
| Wake Lock API | ✓ 84+ | ✓ 84+ | ✗ | ✗ |
| WebSocket | ✓ All | ✓ All | ✓ All | ✓ All |

**Fallback Strategy:**
- FileSystem API unavailable → Use Blob + download
- Wake Lock unavailable → Show warning to user
- WebRTC unavailable → Show error (no fallback possible)

---

## Further Reading

- [WebRTC Spec](https://www.w3.org/TR/webrtc/)
- [MDN WebRTC Guide](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API)
- [File System Access API](https://web.dev/file-system-access/)
- [ICE RFC 8445](https://tools.ietf.org/html/rfc8445)
- [DTLS RFC 6347](https://tools.ietf.org/html/rfc6347)

---

Questions? Open an issue on GitHub or reach out to the team.
