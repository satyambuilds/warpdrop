#!/bin/bash

echo "================================"
echo "WarpDrop - Setup Script"
echo "================================"
echo ""

echo "[1/3] Installing dependencies..."
npm install
if [ $? -ne 0 ]; then
    echo "ERROR: npm install failed"
    exit 1
fi

echo ""
echo "[2/3] Setup complete!"
echo ""
echo "[3/3] Starting servers..."
echo ""
echo "Server will run on: http://localhost:3001"
echo "Client will run on: http://localhost:3000"
echo ""
echo "Press Ctrl+C to stop servers"
echo ""

npm run dev
