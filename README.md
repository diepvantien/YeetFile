# YeetFile

YeetFile is a P2P file transfer web app with end-to-end encryption, optimized for LAN and modern browsers. Built for fast, secure, and seamless file sharing.

## Features
- Peer-to-peer file transfer (WebRTC)
- End-to-end encryption (E2EE)
- LAN/local network optimized
- Modern, responsive UI
- No file size limits (browser/RAM dependent)

## Usage

- Truy cập web app tại: https://yeetfile-1.onrender.com
- Ứng dụng sẽ tự động kết nối đến signaling server: wss://yeetfile.onrender.com
- Có thể sử dụng trên mọi thiết bị trong mạng LAN hoặc Internet (nếu signaling server public)

### Creating a Room
1. Click "Create New Room"
2. Share the generated room code with your peer
3. Wait for your peer to join

### Joining a Room
1. Enter the room code provided by your peer
2. Click the join button or press Enter
3. Wait for the connection to establish

### Sending Files
1. Drag and drop files onto the drop zone or click to select
2. Files will be added to the sending queue
3. Click "Send All" or send individual files
4. Monitor progress in real-time

### Receiving Files
1. When a peer sends files, they appear in the receiving queue
2. Choose where to save each file when prompted
3. Files are automatically verified for integrity

## Configuration

### Signaling Server

Set the signaling server URL in app.js:

```
this.signalingServer = 'wss://yeetfile.onrender.com';
```

Use this URL for all clients connecting via the web app.

### WebRTC Configuration
Edit the RTC configuration in `app.js`:

```javascript
this.rtcConfig = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        // Add your TURN servers here
    ]
};
```

### File Transfer Settings
Adjust chunk size and channel count in `app.js`:

```javascript
// Number of parallel data channels
const channelCount = 4;

// Chunk size for file processing (in file-worker.js)
this.chunkSize = 64 * 1024; // 64KB
```

## Architecture

### System Components
```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Client A      │    │  Signaling      │    │   Client B      │
│                 │◄──►│   Server        │◄──►│                 │
│ ┌─────────────┐ │    │                 │    │ ┌─────────────┐ │
│ │   Main      │ │    │                 │    │ │   Main      │ │
│ │  Thread     │ │    │                 │    │ │  Thread     │ │
│ └─────────────┘ │    │                 │    │ └─────────────┘ │
│ ┌─────────────┐ │    │                 │    │ ┌─────────────┐ │
│ │   Worker    │ │    │                 │    │ │   Worker    │ │
│ │  Thread     │ │    │                 │    │ │  Thread     │ │
│ └─────────────┘ │    │                 │    │ └─────────────┘ │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
                    WebRTC Data Channels
```

### Data Flow
1. **Signaling**: Clients exchange connection info via signaling server
2. **Key Exchange**: Encryption keys are exchanged over secure channel
3. **File Processing**: Files are encrypted and chunked in Web Workers
4. **Multi-channel Transfer**: Chunks are sent across multiple data channels
5. **Verification**: Files are verified using SHA-256 checksums

## Security

### Encryption Details
- **Algorithm**: AES-GCM (Galois/Counter Mode)
- **Key Size**: 256 bits
- **IV**: Random 12-byte IV for each chunk
- **Key Exchange**: Over established WebRTC data channel

### Privacy Features
- No files stored on server
- No metadata logged
- End-to-end encryption
- Perfect forward secrecy

## Performance Optimizations

### Multi-channel Transfer
- Uses multiple WebRTC data channels
- Parallel chunk processing
- Optimized for high-bandwidth connections

### Memory Management
- Streaming file processing
- Chunk-based operations
- Web Workers prevent UI blocking

### Network Optimization
- Adaptive chunk sizing
- Connection quality monitoring
- Automatic retry mechanisms

## Troubleshooting

### Common Issues

**Connection Fails**
- Check firewall settings
- Ensure STUN/TURN servers are accessible
- Try different browsers

**File Transfer Slow**
- Check network bandwidth
- Reduce chunk size in settings
- Verify STUN/TURN server configuration

**Files Not Saving**
- Ensure browser supports File System Access API
- Check browser permissions
- Try Chrome/Chromium for best compatibility

### Debug Mode
Enable debug logging by opening browser console and setting:
```javascript
localStorage.setItem('yeetfile-debug', 'true');
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- WebRTC community for the excellent documentation
- Tailwind CSS for the beautiful UI framework
- Font Awesome for the icons
- Modern web APIs that make this possible

## Support

For issues and questions:
- Create an issue on GitHub
- Check the troubleshooting section
- Review browser compatibility requirements

---

**YeetFile** - Transfer files at the speed of thought! 🚀 