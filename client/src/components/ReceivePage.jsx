import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { WebRTCManager } from '../webrtc';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:3001';

function ReceivePage() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const webrtcRef = useRef(null);
  const hasConnected = useRef(false);

  const [roomExists, setRoomExists] = useState(null);
  const [fileMetadata, setFileMetadata] = useState(null);
  const [connectionState, setConnectionState] = useState('idle');
  const [progress, setProgress] = useState(0);
  const [receiving, setReceiving] = useState(false);
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState(null);
  const [webrtc, setWebrtc] = useState(null);
  const [stats, setStats] = useState({
    currentChunk: 0,
    totalChunks: 0,
    speed: 0
  });
  const [debugLogs, setDebugLogs] = useState([]);

  const addDebugLog = (message) => {
    const timestamp = new Date().toLocaleTimeString();
    setDebugLogs(prev => [...prev.slice(-5), `[${timestamp}] ${message}`]);
    console.log(message);
  };

  useEffect(() => {
    checkRoom();
  }, [roomId]);

  const checkRoom = async () => {
    try {
      const response = await fetch(`${API_URL}/api/room/${roomId}`);
      
      if (response.ok) {
        const data = await response.json();
        setRoomExists(true);
        setFileMetadata(data.metadata);
      } else {
        setRoomExists(false);
        setError('Transfer link not found or expired');
      }
    } catch (err) {
      console.error('Error checking room:', err);
      setError('Failed to connect to server');
    }
  };

  const startReceiving = async () => {
    // Prevent duplicate connections
    if (hasConnected.current) {
      console.log('Already connected, ignoring duplicate call');
      return;
    }
    hasConnected.current = true;

    setConnectionState('connecting');

    const rtc = new WebRTCManager('receiver', WS_URL, roomId);
    webrtcRef.current = rtc;

    rtc.onConnectionStateChange = (state) => {
      console.log('Connection state:', state);
      setConnectionState(state);
    };

    rtc.onMetadata = (metadata) => {
      console.log('Received file metadata:', metadata);
      setFileMetadata(metadata);
      setReceiving(true);
    };

    rtc.onProgress = (progressPercent, currentChunk, totalChunks) => {
      setProgress(progressPercent);
      setStats(prev => ({
        ...prev,
        currentChunk,
        totalChunks
      }));
    };

    rtc.onComplete = () => {
      setComplete(true);
      setReceiving(false);
    };

    rtc.onError = (err) => {
      setError(err.message);
      setConnectionState('error');
    };

    try {
      await rtc.connect();
      setWebrtc(rtc);
    } catch (err) {
      console.error('Failed to connect:', err);
      setError('Failed to connect to sender');
    }
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  const getStatusDisplay = () => {
    if (complete) {
      return (
        <div className="status status-connected">
          <div className="status-indicator"></div>
          <span>Download Complete! ✓</span>
        </div>
      );
    }

    if (error) {
      return (
        <div className="status status-error">
          <div className="status-indicator"></div>
          <span>Error</span>
        </div>
      );
    }

    switch (connectionState) {
      case 'idle':
        return (
          <div className="status status-connecting">
            <div className="status-indicator"></div>
            <span>Ready to receive</span>
          </div>
        );
      case 'connecting':
      case 'signaling-connected':
        return (
          <div className="status status-connecting">
            <div className="status-indicator"></div>
            <span>Connecting to sender...</span>
          </div>
        );
      case 'connected':
        return receiving ? (
          <div className="status status-connected">
            <div className="status-indicator"></div>
            <span>Receiving...</span>
          </div>
        ) : (
          <div className="status status-connected">
            <div className="status-indicator"></div>
            <span>Connected</span>
          </div>
        );
      default:
        return (
          <div className="status status-connecting">
            <div className="status-indicator"></div>
            <span>{connectionState}</span>
          </div>
        );
    }
  };

  if (roomExists === false) {
    return (
      <div className="page">
        <motion.div
          className="container"
          style={{ maxWidth: '600px', textAlign: 'center' }}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>🔍</div>
          <h2 style={{ marginBottom: '1rem' }}>Transfer Not Found</h2>
          <p className="text-dim mb-4">
            This transfer link is invalid or has expired.
          </p>
          <button
            className="btn btn-primary"
            onClick={() => navigate('/')}
          >
            Send a File
          </button>
        </motion.div>
      </div>
    );
  }

  if (roomExists === null) {
    return (
      <div className="page">
        <div className="container" style={{ textAlign: 'center' }}>
          <div className="status status-connecting">
            <div className="status-indicator"></div>
            <span>Checking transfer...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <motion.div
        className="container"
        style={{ maxWidth: '700px' }}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <h1 className="logo" style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>
            WarpDrop
          </h1>
          {getStatusDisplay()}
        </div>

        <motion.div
          className="card"
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.1 }}
        >
          {!receiving && !complete && !error && (
            <>
              <h2 style={{ marginBottom: '1.5rem', fontSize: '1.5rem' }}>
                Ready to receive file
              </h2>

              {fileMetadata && (
                <div className="file-info">
                  <div className="file-icon">📄</div>
                  <div className="file-details" style={{ flex: 1 }}>
                    <h4>{fileMetadata.fileName}</h4>
                    <p>{formatFileSize(fileMetadata.fileSize)}</p>
                  </div>
                </div>
              )}

              <div className="alert alert-info mt-3">
                <span>💡</span>
                <span>
                  File will download directly from the sender's device. No data is stored on any server.
                </span>
              </div>

              <div style={{ marginTop: '2rem', textAlign: 'center' }}>
                <button
                  className="btn btn-primary"
                  onClick={startReceiving}
                  disabled={connectionState !== 'idle'}
                >
                  {connectionState === 'idle' ? '📥 Accept & Download' : 'Connecting...'}
                </button>
              </div>

              <div className="alert alert-warning mt-3">
                <span>⚠️</span>
                <span>Keep this tab open until the download is complete.</span>
              </div>
            </>
          )}

          {(receiving || complete) && fileMetadata && (
            <>
              <div className="file-info">
                <div className="file-icon">📄</div>
                <div className="file-details" style={{ flex: 1 }}>
                  <h4>{fileMetadata.name || fileMetadata.fileName}</h4>
                  <p>{formatFileSize(fileMetadata.size || fileMetadata.fileSize)}</p>
                </div>
              </div>

              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                style={{ marginTop: '2rem' }}
              >
                <div className="stats-grid">
                  <div className="stat-card">
                    <div className="stat-value">{Math.round(progress)}%</div>
                    <div className="stat-label">Progress</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-value">
                      {stats.currentChunk}/{stats.totalChunks}
                    </div>
                    <div className="stat-label">Chunks</div>
                  </div>
                </div>

                <div className="progress-container mt-3">
                  <motion.div
                    className="progress-bar"
                    initial={{ width: 0 }}
                    animate={{ width: `${progress}%` }}
                    transition={{ duration: 0.3 }}
                  />
                </div>
              </motion.div>
            </>
          )}

          {complete && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="mt-4"
              style={{ textAlign: 'center' }}
            >
              <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>✅</div>
              <h3 style={{ color: 'var(--success)', marginBottom: '1rem' }}>
                Download Complete!
              </h3>
              <p className="text-dim mb-3">
                Your file has been saved to your downloads folder.
              </p>
              <button
                className="btn btn-primary"
                onClick={() => navigate('/')}
              >
                Send a File
              </button>
            </motion.div>
          )}

          {error && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="mt-4"
              style={{ textAlign: 'center' }}
            >
              <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>❌</div>
              <h3 style={{ color: 'var(--error)', marginBottom: '1rem' }}>
                Download Failed
              </h3>
              <p className="text-dim mb-3">{error}</p>
              <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
                <button
                  className="btn btn-secondary"
                  onClick={() => window.location.reload()}
                >
                  Try Again
                </button>
                <button
                  className="btn btn-ghost"
                  onClick={() => navigate('/')}
                >
                  Go Home
                </button>
              </div>
            </motion.div>
          )}
        </motion.div>
      </motion.div>
    </div>
  );
}

export default ReceivePage;