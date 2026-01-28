import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

function HomePage() {
  const [selectedFile, setSelectedFile] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const fileInputRef = useRef(null);
  const navigate = useNavigate();

  const handleFileSelect = (file) => {
    if (file) {
      setSelectedFile(file);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    
    const file = e.dataTransfer.files[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  const createTransferLink = async () => {
    if (!selectedFile) return;

    setIsCreating(true);
    
    try {
      const response = await fetch(`${API_URL}/api/create-room`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          metadata: {
            fileName: selectedFile.name,
            fileSize: selectedFile.size,
            mimeType: selectedFile.type
          }
        })
      });

      const data = await response.json();
      
      // Navigate to send page with the file
      navigate(`/send/${data.roomId}`, { 
        state: { file: selectedFile }
      });
    } catch (error) {
      console.error('Error creating room:', error);
      alert('Failed to create transfer link. Please try again.');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="page">
      <motion.div 
        className="container"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div style={{ textAlign: 'center', maxWidth: '800px', margin: '0 auto' }}>
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.1 }}
          >
            <h1 className="logo" style={{ fontSize: '3.5rem', marginBottom: '1rem' }}>
              WarpDrop
            </h1>
            <p style={{ fontSize: '1.25rem', color: 'var(--text-dim)', marginBottom: '3rem' }}>
              Direct peer-to-peer file transfer. No cloud. No limits. End-to-end encrypted.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            {!selectedFile ? (
              <div
                className={`upload-zone ${isDragging ? 'drag-over' : ''}`}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onClick={() => fileInputRef.current?.click()}
              >
                <div className="upload-icon">📁</div>
                <h3 style={{ marginBottom: '0.5rem' }}>Drop your file here</h3>
                <p className="text-dim">or click to browse</p>
                <p className="text-dim" style={{ fontSize: '0.875rem', marginTop: '1rem' }}>
                  Any file size • Any file type • Directly to recipient
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  onChange={(e) => handleFileSelect(e.target.files[0])}
                  style={{ display: 'none' }}
                />
              </div>
            ) : (
              <div className="card fade-in">
                <div className="file-info">
                  <div className="file-icon">📄</div>
                  <div className="file-details" style={{ flex: 1, textAlign: 'left' }}>
                    <h4>{selectedFile.name}</h4>
                    <p>{formatFileSize(selectedFile.size)}</p>
                  </div>
                  <button
                    className="btn-ghost"
                    onClick={() => setSelectedFile(null)}
                    style={{ padding: '0.5rem 1rem' }}
                  >
                    ✕
                  </button>
                </div>

                <div style={{ marginTop: '2rem', display: 'flex', gap: '1rem', justifyContent: 'center' }}>
                  <button
                    className="btn btn-primary"
                    onClick={createTransferLink}
                    disabled={isCreating}
                  >
                    {isCreating ? 'Creating link...' : '🚀 Create Transfer Link'}
                  </button>
                </div>
              </div>
            )}
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            style={{ marginTop: '4rem' }}
          >
            <div className="stats-grid" style={{ maxWidth: '600px', margin: '0 auto' }}>
              <div className="stat-card">
                <div className="stat-value">∞</div>
                <div className="stat-label">File Size</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">P2P</div>
                <div className="stat-label">Direct Transfer</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">🔒</div>
                <div className="stat-label">Encrypted</div>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="alert alert-info mt-4"
            style={{ maxWidth: '600px', margin: '2rem auto 0' }}
          >
            <span>💡</span>
            <span>
              Files transfer directly between devices. Keep this tab open during transfer.
            </span>
          </motion.div>
        </div>
      </motion.div>
    </div>
  );
}

export default HomePage;
