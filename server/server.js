import express from 'express';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import cors from 'cors';
import { nanoid } from 'nanoid';

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

app.use(cors());
app.use(express.json());

// Room storage: roomId -> { sender: ws, receiver: ws, createdAt, expiresAt }
const rooms = new Map();

// Cleanup expired rooms every minute
setInterval(() => {
  const now = Date.now();
  for (const [roomId, room] of rooms.entries()) {
    if (room.expiresAt < now) {
      console.log(`Cleaning up expired room: ${roomId}`);
      room.sender?.close();
      room.receiver?.close();
      rooms.delete(roomId);
    }
  }
}, 60000);

// Create a new room
app.post('/api/create-room', (req, res) => {
  const roomId = nanoid(10);
  const now = Date.now();
  
  rooms.set(roomId, {
    sender: null,
    receiver: null,
    createdAt: now,
    expiresAt: now + (24 * 60 * 60 * 1000), // 24 hours
    metadata: req.body.metadata || {}
  });
  
  console.log(`Room created: ${roomId}`);
  
  res.json({
    roomId,
    url: `${req.protocol}://${req.get('host')}/transfer/${roomId}`
  });
});

// Get room info
app.get('/api/room/:roomId', (req, res) => {
  const room = rooms.get(req.params.roomId);
  
  if (!room) {
    return res.status(404).json({ error: 'Room not found or expired' });
  }
  
  res.json({
    exists: true,
    metadata: room.metadata,
    senderConnected: !!room.sender,
    receiverConnected: !!room.receiver
  });
});

// WebSocket connection handling
wss.on('connection', (ws, req) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const roomId = url.searchParams.get('roomId');
  const role = url.searchParams.get('role'); // 'sender' or 'receiver'
  
  console.log(`WebSocket connection: room=${roomId}, role=${role}`);
  
  if (!roomId || !role) {
    ws.close(1008, 'Missing roomId or role');
    return;
  }
  
  const room = rooms.get(roomId);
  
  if (!room) {
    ws.close(1008, 'Room not found');
    return;
  }
  
  // Store connection
  room[role] = ws;
  ws.roomId = roomId;
  ws.role = role;
  
  // Notify the other peer that someone connected
  const otherRole = role === 'sender' ? 'receiver' : 'sender';
  if (room[otherRole]) {
    room[otherRole].send(JSON.stringify({
      type: 'peer-connected',
      role: role
    }));
  }
  
  // Handle messages
  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());
      console.log(`📨 Message from ${role}: ${message.type}`);
      
      // Forward signaling messages to the other peer
      const otherPeer = room[otherRole];
      
      if (otherPeer && otherPeer.readyState === 1) {
        console.log(`📤 Forwarding ${message.type} to ${otherRole}`);
        otherPeer.send(JSON.stringify(message));
      } else {
        console.log(`⚠️ Cannot forward ${message.type}: ${otherRole} not connected (readyState: ${otherPeer?.readyState})`);
      }
    } catch (error) {
      console.error('Error handling message:', error);
    }
  });
  
  // Handle disconnection
  ws.on('close', () => {
    console.log(`${role} disconnected from room ${roomId}`);
    
    if (room[role] === ws) {
      room[role] = null;
    }
    
    // Notify other peer
    if (room[otherRole]) {
      room[otherRole].send(JSON.stringify({
        type: 'peer-disconnected',
        role: role
      }));
    }
    
    // Clean up room if both disconnected (with 30 second delay to allow reconnection)
    if (!room.sender && !room.receiver) {
      console.log(`Both peers disconnected from room ${roomId}, scheduling cleanup in 30s`);
      setTimeout(() => {
        const currentRoom = rooms.get(roomId);
        if (currentRoom && !currentRoom.sender && !currentRoom.receiver) {
          console.log(`Cleaning up inactive room ${roomId}`);
          rooms.delete(roomId);
        }
      }, 30000); // 30 second grace period
    }
  });
  
  ws.on('error', (error) => {
    console.error(`WebSocket error for ${role}:`, error);
  });
  
  // Send ready message
  ws.send(JSON.stringify({
    type: 'ready',
    role: role
  }));
});

const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
  console.log(`Signaling server running on port ${PORT}`);
  console.log(`WebSocket endpoint: ws://localhost:${PORT}`);
});
