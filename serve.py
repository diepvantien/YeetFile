#!/usr/bin/env python3
# YeetFile - Simple HTTP server for static file serving
"""
Simple HTTP server for YeetFile
Serves the static files on port 8000
"""

import http.server
import socketserver
import os
import sys
from pathlib import Path

# Configuration
PORT = 8000
DIRECTORY = Path(__file__).parent

class YeetFileHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(DIRECTORY), **kwargs)
    
    def end_headers(self):
        # Add CORS headers for WebRTC
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        super().end_headers()
    
    def log_message(self, format, *args):
        # Custom logging
        print(f"[{self.log_date_time_string()}] {format % args}")

def main():
    print("🌐 YeetFile HTTP Server")
    print(f"📁 Serving files from: {DIRECTORY}")
    print(f"🌍 Server URL: http://localhost:{PORT}")
    print(f"📱 Open http://localhost:{PORT} in your browser")
    print("🛑 Press Ctrl+C to stop the server")
    print("-" * 50)
    
    try:
        with socketserver.TCPServer(("", PORT), YeetFileHTTPRequestHandler) as httpd:
            print(f"✅ Server started successfully on port {PORT}")
            print("📋 Available files:")
            for file in DIRECTORY.glob("*.html"):
                print(f"   - http://localhost:{PORT}/{file.name}")
            print("-" * 50)
            httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n🛑 Server stopped by user")
    except OSError as e:
        if e.errno == 48:  # Address already in use
            print(f"❌ Port {PORT} is already in use. Try a different port:")
            print(f"   python serve.py --port 8001")
        else:
            print(f"❌ Error starting server: {e}")
    except Exception as e:
        print(f"❌ Unexpected error: {e}")

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="YeetFile HTTP Server")
    parser.add_argument("--port", type=int, default=PORT, help=f"Port to serve on (default: {PORT})")
    args = parser.parse_args()
    
    PORT = args.port
    main() 