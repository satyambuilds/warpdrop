// WebRTC P2P Connection Manager with Advanced Features
// Handles: memory management, flow control, chunking, resume capability

const CHUNK_SIZE = 256 * 1024; // 256KB chunks
const MAX_BUFFER_SIZE = 1 * 1024 * 1024; // 1MB buffer threshold
const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  // Add TURN servers in production for corporate networks
  // { urls: 'turn:your-turn-server.com', username: 'user', credential: 'pass' }
];

export class WebRTCManager {
  constructor(role, signalingUrl, roomId) {
    this.role = role; // 'sender' or 'receiver'
    this.signalingUrl = signalingUrl;
    this.roomId = roomId;
    this.ws = null;
    this.pc = null;
    this.dataChannel = null;
    this.file = null;
    this.receivedChunks = new Map(); // chunkIndex -> ArrayBuffer
    this.totalChunks = 0;
    this.receivedChunkCount = 0;
    this.fileMetadata = null;
    this.wakeLock = null;
    this.isTransferActive = false;
    this.isPaused = false;
    this.currentChunkIndex = 0;
    this.fileWriter = null; // For FileSystem API

    // Speed tracking
    this.transferStartTime = null;
    this.lastSpeedUpdate = null;
    this.bytesTransferred = 0;
    this.lastBytesTransferred = 0;
    this.currentSpeed = 0; // bytes per second
    this.speedSamples = []; // for smoothing

    // Resume/retry
    this.shouldAutoReconnect = true;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 3;
    this.reconnectTimeout = null;

    // Connection quality
    this.statsInterval = null;
    this.connectionQuality = {
      rtt: 0,
      packetLoss: 0,
      jitter: 0
    };

    // Callbacks
    this.onConnectionStateChange = null;
    this.onProgress = null;
    this.onComplete = null;
    this.onError = null;
    this.onMetadata = null;
    this.onReconnecting = null;
    this.onConnectionQuality = null;
  }

  async connect(retryCount = 0) {
    const maxRetries = 3;
    
    return new Promise((resolve, reject) => {
      const wsUrl = `${this.signalingUrl}?roomId=${this.roomId}&role=${this.role}`;
      console.log(`Connecting to WebSocket (attempt ${retryCount + 1}/${maxRetries + 1}):`, wsUrl);
      
      try {
        this.ws = new WebSocket(wsUrl);
      } catch (error) {
        console.error('Failed to create WebSocket:', error);
        
        if (retryCount < maxRetries) {
          console.log(`Retrying in 2 seconds...`);
          setTimeout(() => {
            this.connect(retryCount + 1).then(resolve).catch(reject);
          }, 2000);
          return;
        }
        
        reject(new Error('Failed to create WebSocket connection after retries'));
        return;
      }

      let resolved = false;

      this.ws.onopen = () => {
        console.log('✅ WebSocket connected successfully');
        this._updateConnectionState('signaling-connected');
      };

      this.ws.onmessage = async (event) => {
        try {
          const message = JSON.parse(event.data);
          console.log('📨 Received message:', message.type);
          await this._handleSignalingMessage(message);
          
          if (message.type === 'ready' && !resolved) {
            resolved = true;
            console.log('✅ Ready to transfer');
            resolve();
          }
        } catch (error) {
          console.error('Error handling signaling message:', error);
          this._handleError(error);
        }
      };

      this.ws.onerror = (error) => {
        console.error('❌ WebSocket error:', error);
        if (!resolved) {
          resolved = true;
          
          // Retry on error
          if (retryCount < maxRetries) {
            console.log(`Connection failed, retrying in 2 seconds... (${retryCount + 1}/${maxRetries})`);
            setTimeout(() => {
              this.connect(retryCount + 1).then(resolve).catch(reject);
            }, 2000);
          } else {
            reject(new Error('WebSocket connection error after retries'));
          }
        }
      };

      this.ws.onclose = (event) => {
        console.log('WebSocket closed. Code:', event.code, 'Reason:', event.reason || 'No reason provided');
        this._updateConnectionState('signaling-disconnected');
        
        if (!resolved) {
          resolved = true;
          
          // Retry on unexpected close (but not if room not found)
          if (event.code !== 1008 && retryCount < maxRetries) {
            console.log(`Connection closed, retrying in 2 seconds... (${retryCount + 1}/${maxRetries})`);
            setTimeout(() => {
              this.connect(retryCount + 1).then(resolve).catch(reject);
            }, 2000);
          } else {
            const reason = event.code === 1008 ? 'Room not found or expired' : 'WebSocket closed unexpectedly';
            reject(new Error(reason));
          }
        }
      };

      // Timeout after 10 seconds per attempt
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          
          if (retryCount < maxRetries) {
            console.log(`Connection timeout, retrying... (${retryCount + 1}/${maxRetries})`);
            this.ws.close();
            setTimeout(() => {
              this.connect(retryCount + 1).then(resolve).catch(reject);
            }, 2000);
          } else {
            reject(new Error('WebSocket connection timeout after retries'));
          }
        }
      }, 10000);
    });
  }

  async _handleSignalingMessage(message) {
    switch (message.type) {
      case 'ready':
        console.log('Received ready signal, role:', this.role);
        // Don't create offer yet - wait for peer-connected
        break;

      case 'peer-connected':
        console.log('Peer connected:', message.role);
        // Sender creates offer when receiver connects
        if (this.role === 'sender' && message.role === 'receiver' && !this.pc) {
          console.log('Receiver connected! Creating offer...');
          await this._createOffer();
        }
        break;
        
      case 'offer':
        console.log('Received offer, creating answer...');
        await this._handleOffer(message.offer);
        break;
        
      case 'answer':
        console.log('Received answer, setting remote description...');
        await this._handleAnswer(message.answer);
        break;
        
      case 'ice-candidate':
        console.log('Received ICE candidate');
        await this._handleIceCandidate(message.candidate);
        break;
        
      case 'peer-disconnected':
        console.log('⚠️ Peer disconnected!');
        if (this.isTransferActive && this.shouldAutoReconnect) {
          this._attemptReconnect();
        } else {
          this._handleError(new Error('Peer disconnected'));
        }
        break;
    }
  }

  async _createOffer() {
    // Clean up existing connection if any
    if (this.pc) {
      console.log('⚠️ PeerConnection already exists, closing it first');
      this.pc.close();
      this.pc = null;
    }
    
    console.log('📤 Creating WebRTC offer...');
    this.pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    this._setupPeerConnection();
    
    // Create data channel (sender creates it)
    this.dataChannel = this.pc.createDataChannel('fileTransfer', {
      ordered: true,
      maxRetransmits: 3
    });
    this._setupDataChannel();
    
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    
    console.log('📤 Sending offer to receiver via WebSocket');
    this._sendSignaling({
      type: 'offer',
      offer: offer
    });
  }

  async _handleOffer(offer) {
    console.log('📥 Received offer, creating answer...');
    this.pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    this._setupPeerConnection();
    
    await this.pc.setRemoteDescription(new RTCSessionDescription(offer));
    console.log('📥 Remote description set');
    
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    
    console.log('📤 Sending answer to sender');
    this._sendSignaling({
      type: 'answer',
      answer: answer
    });
  }

  async _handleAnswer(answer) {
    console.log('📥 Received answer, setting remote description...');
    await this.pc.setRemoteDescription(new RTCSessionDescription(answer));
    console.log('✅ SDP exchange complete, waiting for ICE candidates...');
  }

  async _handleIceCandidate(candidate) {
    if (this.pc && candidate) {
      console.log('🧊 Adding ICE candidate');
      await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
    }
  }

  _setupPeerConnection() {
    this.pc.onicecandidate = (event) => {
      if (event.candidate) {
        this._sendSignaling({
          type: 'ice-candidate',
          candidate: event.candidate
        });
      }
    };

    this.pc.onconnectionstatechange = () => {
      console.log('🔗 WebRTC Connection state:', this.pc.connectionState);
      this._updateConnectionState(this.pc.connectionState);

      if (this.pc.connectionState === 'connected') {
        console.log('✅ WebRTC P2P connection established!');
        // Reset reconnect attempts on successful connection
        this.reconnectAttempts = 0;
      } else if (this.pc.connectionState === 'failed') {
        console.error('❌ WebRTC connection failed');
        if (this.isTransferActive && this.shouldAutoReconnect) {
          this._attemptReconnect();
        } else {
          this._handleError(new Error('Connection failed'));
        }
      } else if (this.pc.connectionState === 'disconnected') {
        console.warn('⚠️ WebRTC connection disconnected');
        if (this.isTransferActive && this.shouldAutoReconnect) {
          this._attemptReconnect();
        }
      }
    };

    this.pc.ondatachannel = (event) => {
      console.log('📡 Data channel received from peer');
      this.dataChannel = event.channel;
      this._setupDataChannel();
    };
  }

  _setupDataChannel() {
    this.dataChannel.binaryType = 'arraybuffer';

    this.dataChannel.onopen = async () => {
      console.log('✅ Data channel opened - Ready to transfer!');
      this._updateConnectionState('connected');

      // Acquire wake lock to prevent tab sleep
      await this._acquireWakeLock();

      // Start monitoring connection quality
      this._startStatsMonitoring();
    };

    this.dataChannel.onclose = () => {
      console.log('⚠️ Data channel closed');
      this._updateConnectionState('disconnected');
      this._releaseWakeLock();
    };

    this.dataChannel.onerror = (error) => {
      console.error('Data channel error:', error);
      this._handleError(error);
    };

    this.dataChannel.onmessage = async (event) => {
      await this._handleDataChannelMessage(event.data);
    };

    // Monitor buffer for flow control (sender side)
    if (this.role === 'sender') {
      this.dataChannel.onbufferedamountlow = () => {
        if (this.isTransferActive && !this.isPaused) {
          this._sendNextChunk();
        }
      };
    }
  }

  async _handleDataChannelMessage(data) {
    try {
      if (typeof data === 'string') {
        // Control message
        const message = JSON.parse(data);

        switch (message.type) {
          case 'metadata':
            this.fileMetadata = message;
            this.totalChunks = Math.ceil(message.size / CHUNK_SIZE);
            console.log(`📦 Receiving file: ${message.name} (${this.formatBytes(message.size)}, ${this.totalChunks} chunks)`);

            // Try to use FileSystem API for large files
            if (message.size > 50 * 1024 * 1024) { // > 50MB
              console.log('Large file detected, attempting to use FileSystem API...');
              await this._initFileWriter(message.name);
            } else {
              console.log('Small file, using in-memory buffering');
            }

            if (this.onMetadata) {
              this.onMetadata(message);
            }

            // Send ready signal
            this._sendControlMessage({ type: 'ready' });
            break;
            
          case 'chunk-ack':
            // Sender receives acknowledgment
            this._sendNextChunk();
            break;
            
          case 'complete':
            console.log('Received complete signal, finalizing file...');
            await this._finalizeFile();
            break;
            
          case 'resume-request':
            // Sender: resume from specific chunk
            this.currentChunkIndex = message.fromChunk;
            this._sendNextChunk();
            break;
        }
      } else {
        // Binary chunk data
        await this._handleChunkData(data);
      }
    } catch (error) {
      console.error('Error handling data channel message:', error);
      this._handleError(error);
    }
  }

  // SENDER: Start sending file
  async sendFile(file) {
    if (!this.dataChannel || this.dataChannel.readyState !== 'open') {
      throw new Error('Data channel not ready');
    }

    this.file = file;
    this.totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    this.currentChunkIndex = 0;
    this.isTransferActive = true;

    // Send metadata first
    const metadata = {
      type: 'metadata',
      name: file.name,
      size: file.size,
      mimeType: file.type,
      totalChunks: this.totalChunks,
      chunkSize: CHUNK_SIZE
    };

    this._sendControlMessage(metadata);
    
    // Wait for receiver ready signal before starting
    console.log('File metadata sent, waiting for receiver...');
  }

  async _sendNextChunk() {
    if (!this.isTransferActive || this.isPaused) return;
    if (this.currentChunkIndex >= this.totalChunks) return;

    // Check buffer size for flow control
    if (this.dataChannel.bufferedAmount > MAX_BUFFER_SIZE) {
      console.log('Buffer full, waiting...');
      return;
    }

    const start = this.currentChunkIndex * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, this.file.size);
    const chunk = this.file.slice(start, end);

    const reader = new FileReader();
    
    reader.onload = (e) => {
      if (this.dataChannel.readyState === 'open') {
        const chunkData = e.target.result;
        this.dataChannel.send(chunkData);
        this.currentChunkIndex++;

        // Calculate transfer speed
        const speed = this._calculateSpeed(chunkData.byteLength);

        const progress = (this.currentChunkIndex / this.totalChunks) * 100;
        if (this.onProgress) {
          this.onProgress(progress, this.currentChunkIndex, this.totalChunks, speed);
        }

        if (this.currentChunkIndex >= this.totalChunks) {
          this._sendControlMessage({ type: 'complete' });
          this._completeTransfer();
        } else {
          // Continue sending if buffer allows
          if (this.dataChannel.bufferedAmount < MAX_BUFFER_SIZE) {
            this._sendNextChunk();
          }
        }
      }
    };

    reader.onerror = (error) => {
      this._handleError(error);
    };

    reader.readAsArrayBuffer(chunk);
  }

  // RECEIVER: Handle incoming chunk
  async _handleChunkData(data) {
    try {
      if (!data || data.byteLength === 0) {
        console.warn('Received empty chunk, skipping...');
        return;
      }

      // Write to disk if using FileSystem API
      if (this.fileWriter) {
        try {
          await this.fileWriter.write(data);
          this.receivedChunkCount++;
        } catch (error) {
          console.error('Error writing to file, falling back to memory:', error);
          // Fallback to memory if write fails
          await this.fileWriter.close().catch(() => {});
          this.fileWriter = null;
          // Store this chunk and continue with memory mode
          this.receivedChunks.set(this.receivedChunkCount, data);
          this.receivedChunkCount++;
        }
      } else {
        // Store in memory if FileSystem API not available
        this.receivedChunks.set(this.receivedChunkCount, data);
        this.receivedChunkCount++;
      }

      // Calculate transfer speed
      const speed = this._calculateSpeed(data.byteLength);

      const progress = (this.receivedChunkCount / this.totalChunks) * 100;

      if (this.onProgress) {
        this.onProgress(progress, this.receivedChunkCount, this.totalChunks, speed);
      }

      // Send acknowledgment for flow control
      this._sendControlMessage({ type: 'chunk-ack', chunkIndex: this.receivedChunkCount - 1 });
    } catch (error) {
      console.error('Error handling chunk data:', error);
      this._handleError(error);
    }
  }

  async _initFileWriter(fileName) {
    try {
      if ('showSaveFilePicker' in window) {
        console.log('🗂️ Prompting user for file save location...');
        const handle = await window.showSaveFilePicker({
          suggestedName: fileName,
          types: [{
            description: 'All Files',
            accept: { '*/*': [] }
          }]
        });

        this.fileWriter = await handle.createWritable();
        console.log('✅ FileSystem API initialized - will stream directly to disk');
        console.log('💾 Memory usage optimized for large file transfer');
        return true;
      } else {
        console.log('⚠️ FileSystem API not supported in this browser');
        console.log('📝 Will use in-memory buffering (may cause issues with very large files)');
        return false;
      }
    } catch (error) {
      // User cancelled or error occurred
      if (error.name === 'AbortError') {
        console.log('❌ User cancelled save dialog - will use default download location');
      } else {
        console.warn('⚠️ FileSystem API error:', error);
      }
      this.fileWriter = null;
      return false;
    }
  }

  async _finalizeFile() {
    try {
      if (this.fileWriter) {
        // Close the file writer
        console.log('💾 Closing file writer...');
        await this.fileWriter.close();
        console.log('✅ File written to disk via FileSystem API');

        // Clear any chunks that might have been stored before FileSystem API initialized
        this.receivedChunks.clear();

        this._completeTransfer();
      } else {
        // Combine chunks from memory
        console.log(`📦 Combining ${this.receivedChunkCount} chunks from memory...`);
        const chunks = [];
        for (let i = 0; i < this.receivedChunkCount; i++) {
          const chunk = this.receivedChunks.get(i);
          if (chunk) {
            chunks.push(chunk);
          }
        }

        if (chunks.length === 0) {
          throw new Error('No chunks received');
        }

        const blob = new Blob(chunks, { type: this.fileMetadata.mimeType || 'application/octet-stream' });
        console.log(`✅ Created blob: ${this.formatBytes(blob.size)}`);

        const url = URL.createObjectURL(blob);

        // Trigger download
        console.log('📥 Starting download...');
        const a = document.createElement('a');
        a.href = url;
        a.download = this.fileMetadata.name || 'download';
        document.body.appendChild(a);
        a.click();

        // Clean up
        setTimeout(() => {
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          this.receivedChunks.clear();
        }, 100);

        console.log('✅ File download started!');
        this._completeTransfer();
      }
    } catch (error) {
      console.error('❌ Error finalizing file:', error);
      this._handleError(new Error(`Download failed: ${error.message}`));
    }
  }

  formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  }

  _calculateSpeed(chunkSize) {
    const now = Date.now();

    // Initialize on first chunk
    if (!this.transferStartTime) {
      this.transferStartTime = now;
      this.lastSpeedUpdate = now;
      return 0;
    }

    this.bytesTransferred += chunkSize;

    // Update speed every 500ms
    const timeSinceLastUpdate = now - this.lastSpeedUpdate;
    if (timeSinceLastUpdate >= 500) {
      const bytesSinceLastUpdate = this.bytesTransferred - this.lastBytesTransferred;
      const instantSpeed = (bytesSinceLastUpdate / timeSinceLastUpdate) * 1000; // bytes per second

      // Smooth speed using moving average (keep last 5 samples)
      this.speedSamples.push(instantSpeed);
      if (this.speedSamples.length > 5) {
        this.speedSamples.shift();
      }

      this.currentSpeed = this.speedSamples.reduce((a, b) => a + b, 0) / this.speedSamples.length;

      this.lastSpeedUpdate = now;
      this.lastBytesTransferred = this.bytesTransferred;
    }

    return this.currentSpeed;
  }

  formatSpeed(bytesPerSecond) {
    if (bytesPerSecond === 0) return '0 B/s';
    const k = 1024;
    const sizes = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
    const i = Math.floor(Math.log(bytesPerSecond) / Math.log(k));
    return Math.round(bytesPerSecond / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  }

  _startStatsMonitoring() {
    if (!this.pc) return;

    // Clear any existing interval
    if (this.statsInterval) {
      clearInterval(this.statsInterval);
    }

    // Poll stats every 1 second
    this.statsInterval = setInterval(async () => {
      await this._collectConnectionStats();
    }, 1000);

    console.log('📊 Started connection quality monitoring');
  }

  async _collectConnectionStats() {
    if (!this.pc) return;

    try {
      const stats = await this.pc.getStats();

      stats.forEach(report => {
        // RTT and packet loss are in candidate-pair reports
        if (report.type === 'candidate-pair' && report.state === 'succeeded') {
          if (report.currentRoundTripTime !== undefined) {
            this.connectionQuality.rtt = Math.round(report.currentRoundTripTime * 1000); // Convert to ms
          }
        }

        // Packet loss from inbound-rtp
        if (report.type === 'inbound-rtp' && report.kind === 'video') {
          if (report.packetsLost !== undefined && report.packetsReceived !== undefined) {
            const totalPackets = report.packetsLost + report.packetsReceived;
            this.connectionQuality.packetLoss = totalPackets > 0
              ? Math.round((report.packetsLost / totalPackets) * 100)
              : 0;
          }
          if (report.jitter !== undefined) {
            this.connectionQuality.jitter = Math.round(report.jitter * 1000); // Convert to ms
          }
        }

        // For data channels, check transport stats
        if (report.type === 'transport') {
          // Some browsers provide RTT here
          if (report.currentRoundTripTime !== undefined) {
            this.connectionQuality.rtt = Math.round(report.currentRoundTripTime * 1000);
          }
        }
      });

      // Notify callback
      if (this.onConnectionQuality) {
        this.onConnectionQuality(this.connectionQuality);
      }

    } catch (error) {
      console.warn('Failed to collect connection stats:', error);
    }
  }

  _stopStatsMonitoring() {
    if (this.statsInterval) {
      clearInterval(this.statsInterval);
      this.statsInterval = null;
      console.log('📊 Stopped connection quality monitoring');
    }
  }

  _completeTransfer() {
    this.isTransferActive = false;
    this._releaseWakeLock();
    this._stopStatsMonitoring();

    if (this.onComplete) {
      this.onComplete();
    }
  }

  async _acquireWakeLock() {
    try {
      if ('wakeLock' in navigator) {
        this.wakeLock = await navigator.wakeLock.request('screen');
        console.log('Wake lock acquired');
        
        this.wakeLock.addEventListener('release', () => {
          console.log('Wake lock released');
        });
      }
    } catch (error) {
      console.log('Wake lock not available:', error);
    }
  }

  _releaseWakeLock() {
    if (this.wakeLock) {
      this.wakeLock.release();
      this.wakeLock = null;
    }
  }

  _sendControlMessage(message) {
    if (this.dataChannel && this.dataChannel.readyState === 'open') {
      this.dataChannel.send(JSON.stringify(message));
    }
  }

  _sendSignaling(message) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  _updateConnectionState(state) {
    if (this.onConnectionStateChange) {
      this.onConnectionStateChange(state);
    }
  }

  _handleError(error) {
    console.error('WebRTC error:', error);
    this.isTransferActive = false;
    this._releaseWakeLock();
    this._stopStatsMonitoring();

    if (this.onError) {
      this.onError(error);
    }
  }

  async _attemptReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('❌ Max reconnection attempts reached');
      this._handleError(new Error('Connection lost - max reconnection attempts reached'));
      return;
    }

    this.reconnectAttempts++;
    const waitTime = Math.min(2000 * this.reconnectAttempts, 10000); // Exponential backoff, max 10s

    console.log(`🔄 Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts}) in ${waitTime}ms...`);

    if (this.onReconnecting) {
      this.onReconnecting(this.reconnectAttempts, this.maxReconnectAttempts);
    }

    // Close existing connections
    if (this.pc) {
      this.pc.close();
      this.pc = null;
    }
    if (this.dataChannel) {
      this.dataChannel.close();
      this.dataChannel = null;
    }

    // Wait before reconnecting
    await new Promise(resolve => setTimeout(resolve, waitTime));

    try {
      // Reconnect WebSocket if needed
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        await this.connect();
      }

      // The peer-connected message will trigger offer/answer exchange
      console.log('✅ Reconnected, waiting for peer...');

      // If we're the sender and have progress, we'll resume from last chunk
      if (this.role === 'sender' && this.currentChunkIndex > 0) {
        console.log(`📤 Will resume from chunk ${this.currentChunkIndex}/${this.totalChunks}`);
      }

      // If we're the receiver, send resume request
      if (this.role === 'receiver' && this.receivedChunkCount > 0) {
        console.log(`📥 Requesting resume from chunk ${this.receivedChunkCount}`);
        this._sendControlMessage({
          type: 'resume-request',
          fromChunk: this.receivedChunkCount
        });
      }

      // Reset reconnect counter on successful reconnect
      this.reconnectAttempts = 0;

    } catch (error) {
      console.error('Reconnection failed:', error);
      this._attemptReconnect(); // Try again
    }
  }

  disconnect() {
    this.shouldAutoReconnect = false; // Disable auto-reconnect on manual disconnect
    this.isTransferActive = false;
    this._releaseWakeLock();

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }

    if (this.dataChannel) {
      this.dataChannel.close();
    }

    if (this.pc) {
      this.pc.close();
    }

    if (this.ws) {
      this.ws.close();
    }
  }

  pause() {
    this.isPaused = true;
  }

  resume() {
    this.isPaused = false;
    if (this.role === 'sender') {
      this._sendNextChunk();
    }
  }
}
