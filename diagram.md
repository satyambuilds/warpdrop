+-------------+                      +-------------+
|  User A     |                      |   User B    |
| (Sender)    |                      | (Receiver) |
| Browser/App |                      | Browser/App|
+------+------+                      +------+------+
       |                                     |
       | 1. Create Room / Link               |
       |------------------------------------>|
       |                                     |
       |        (via Signaling Server)       |
       |                                     |
       v                                     v
+--------------------------------------------------+
|            Signaling Server (Next/Node)          |
|--------------------------------------------------|
| - WebSocket connection                            |
| - Room management                                 |
| - SDP exchange                                    |
| - ICE candidate exchange                          |
| ❌ NO FILE STORAGE                                |
+--------------------------------------------------+
       ^                                     ^
       |                                     |
       | 2. Connection info exchanged        |
       |                                     |
       +-------------------------------------+

       3. Direct P2P Connection (WebRTC)
       ==================================

+--------------------------------------------------+
|        WebRTC DataChannel (Encrypted)            |
|--------------------------------------------------|
| File chunks stream directly                      |
| Flow control + retry                             |
| Parallel chunks                                  |
+--------------------------------------------------+

       |                                     |
       | 4. File chunks                      |
       |====================================>|
       |                                     |



Network fallback (important)

User A ---- STUN ----> discover public IP
User B ---- STUN ----> discover public IP

IF direct connection fails:
User A ---- TURN RELAY ---- User B



🎯 Core Goal

Transfer very large files (2GB–100GB)
No cloud upload
Direct device-to-device
End-to-end encrypted
Works worldwide


🔄 User Flow (Real)
Sender (A)

Open site

Select file

Click “Create link”

Share link / QR code

Keep tab open

Receiver (B)

Open link

Click “Accept”

Download starts instantly

No account required.


🔧 Technical Flow (Step-by-Step)
Step 1: Room creation

POST /create-room
→ returns roomId + short link


Step 2: Signaling (WebSocket)

A connects → ws://signal-server/roomId
B connects → ws://signal-server/roomId

Exchange:
- SDP offer/answer
- ICE candidates


Step 3: WebRTC handshake

RTCPeerConnection
↓
STUN server
↓
Direct connection established


Step 4: File transfer
File
↓
Split into chunks (256KB–1MB)
↓
Send via RTCDataChannel
↓
Receiver reassembles
↓
Save to disk


📦 File Handling Strategy

Chunking
file.slice(start, end)


Benefits:
    Resume support
    Error recovery
    Memory safe

Flow control
    Send next chunk only after ACK
    Prevent browser crash
    Adaptive speed

🔐 Security Model
WebRTC → DTLS encryption

Optional:
    Room password
    One-time links
    Auto-expire rooms

No server sees file data


🛠 Areas for Optimization
1. Memory Management (The "Silent Killer")
Even with chunking, browsers can be finicky.

The Sender: Use a FileReader with a specific buffer size. Don't read the whole file; read a chunk, send it, and wait for the bufferedAmountLow event on the DataChannel before reading the next one.

The Receiver: For 100GB files, you cannot store chunks in an array/Blob in memory. You will crash the tab.

Solution: Use the FileSystem Writable File Stream API. This allows you to stream the incoming chunks directly to the user's hard drive as they arrive.

2. Backpressure & Flow Control
WebRTC DataChannels have a buffer limit (usually 16MB). If you push 100GB into the channel at once, it will overflow and drop the connection.

POV: Monitor pc.sctp.transport.bufferedAmount. If it exceeds a threshold (e.g., 1MB), pause your FileReader until it drains.

3. Connection Reliability
The "Tab Sleep" Issue: Mobile browsers and even Chrome on Desktop often "hibernate" background tabs to save power. If the Sender’s tab sleeps, the transfer dies.

Tip: You might need to use the Web Wake Lock API to prevent the screen from turning off or the CPU from throttling during a long 50GB transfer.