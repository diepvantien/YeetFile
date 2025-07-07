#!/bin/bash
# YeetFile - Start script
echo "🚀 Starting YeetFile..."

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js first."
    echo "Visit: https://nodejs.org/"
    exit 1
fi

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed. Please install npm first."
    exit 1
fi

# Install dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

# Start the signaling server
echo "🔌 Starting signaling server on port 8080..."
echo "📱 Open http://localhost:8000 in your browser to use the app"
echo "🛑 Press Ctrl+C to stop the server"
echo ""

# Start the server
npm start 