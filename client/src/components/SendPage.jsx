import { useState, useEffect, useRef } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { motion } from 'framer-motion';
import { WebRTCManager } from '../webrtc';

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:3001';

function SendPage() {
  const { roomId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const file = location.state?.file;
  const webrtcRef = useRef(null);
  const hasConnected = useRef(false);

  const [connectionState, setConnectionState] = useState('connecting');
  const [progress, setProgress] = useState(0);
  const [transferring, setTransferring] = useState(false);
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState(null);
  const [webrtc, setWebrtc] = useState(null);
  const [stats, setStats] = useState({
    currentChunk: 0,
    totalChunks: 0,
    speed: 0
  });

  const transferUrl = `${window.location.origin}/transfer/${roomId}`;

  useEffect(() => {
    if (!file) {
      navigate('/');
      return;
    }

    // Prevent duplicate connections in React StrictMode
    if (hasConnected.current) {
      console.log('Already connected, skipping duplicate mount');
      return;
    }
    hasConnected.current = true;

    const rtc = new WebRTCManager('sender', WS_URL, roomId);
    webrtcRef.current = rtc;
    
    rtc.onConnectionStateChange = (state) => {
      console.log('Connection state:', state);
      setConnectionState(state);
      
      if (state === 'connected') {
        // Start transfer automatically when connected
        startTransfer(rtc);
      }
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
      setTransferring(false);
    };

    rtc.onError = (err) => {
      setError(err.message);
      setConnectionState('error');
    };

    rtc.connect().catch(err => {
      console.error('Failed to connect:', err);
      setError('Failed to connect to signaling server');
    });

    setWebrtc(rtc);

    return () => {
      // Only disconnect on actual unmount (when component is being destroyed)
      // Not on StrictMode double-mount
      if (!complete && !error) {
        console.log('Component unmounting, keeping connection alive...');
        // Don't disconnect during development with StrictMode
      } else {
        console.log('Transfer complete or error, disconnecting...');
        rtc.disconnect();
      }
    };
  }, [file, roomId, navigate, complete, error]);

  const startTransfer = async (rtc) => {
    try {
      setTransferring(true);
      await rtc.sendFile(file);
    } catch (err) {
      console.error('Transfer error:', err);
      setError(err.message);
    }
  };

  const copyLink = () => {
    navigator.clipboard.writeText(transferUrl);
    // Could add a toast notification here
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
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
          <span>Transfer Complete! ✓</span>
        </div>
      );
    }
    
    if (error) {
      return (
        <div className="status status-error">
          <div className="status-indicator"></div>
          <span>Error: {error}</span>
        </div>
      );
    }

    switch (connectionState) {
      case 'connecting':
      case 'signaling-connected':
        return (
          <div className="status status-connecting">
            <div className="status-indicator"></div>
            <span>Waiting for receiver...</span>
          </div>
        );
      case 'connected':
        return transferring ? (
          <div className="status status-connected">
            <div className="status-indicator"></div>
            <span>Transferring...</span>
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
          {!complete && !error && (
            <>
              <h2 style={{ marginBottom: '1.5rem', fontSize: '1.5rem' }}>
                Share this link with the receiver
              </h2>

              <div className="qr-container" style={{ margin: '0 auto 2rem', width: 'fit-content' }}>
                <QRCodeSVG value={transferUrl} size={200} level="M" />
              </div>

              <div className="link-display">
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {transferUrl}
                </span>
                <button
                  className="btn btn-secondary"
                  onClick={copyLink}
                  style={{ padding: '0.5rem 1rem', whiteSpace: 'nowrap' }}
                >
                  📋 Copy
                </button>
              </div>

              <div className="alert alert-warning mt-3">
                <span>⚠️</span>
                <span>Keep this tab open until the transfer is complete.</span>
              </div>
            </>
          )}

          <div className="file-info mt-3">
            <div className="file-icon">📄</div>
            <div className="file-details" style={{ flex: 1 }}>
              <h4>{file?.name}</h4>
              <p>{formatFileSize(file?.size || 0)}</p>
            </div>
          </div>

          {(transferring || complete) && (
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
          )}

          {complete && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="mt-4"
              style={{ textAlign: 'center' }}
            >
              <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🎉</div>
              <h3 style={{ color: 'var(--success)', marginBottom: '1rem' }}>
                Transfer Complete!
              </h3>
              <button
                className="btn btn-primary"
                onClick={() => navigate('/')}
              >
                Send Another File
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
                Transfer Failed
              </h3>
              <p className="text-dim mb-3">{error}</p>
              <button
                className="btn btn-secondary"
                onClick={() => navigate('/')}
              >
                Try Again
              </button>
            </motion.div>
          )}
        </motion.div>
      </motion.div>
    </div>
  );
}

export default SendPage;