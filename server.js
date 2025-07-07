// YeetFile Signaling Server
// Handles WebRTC signaling for peer-to-peer connections

const WebSocket = require('ws');
const http = require('http');
const url = require('url');

class SignalingServer {
    constructor(port = 8080) {
        this.port = port;
        this.rooms = new Map(); // roomCode -> { peers: Set, offers: Map, answers: Map }
        this.server = null;
        this.wss = null;
        
        this.initialize();
    }

    initialize() {
        // Create HTTP server
        this.server = http.createServer((req, res) => {
            res.writeHead(200, { 'Content-Type': 'text/plain' });
            res.end('YeetFile Signaling Server');
        });

        // Create WebSocket server
        this.wss = new WebSocket.Server({ server: this.server });
        
        this.setupWebSocketHandlers();
        this.start();
    }

    setupWebSocketHandlers() {
        this.wss.on('connection', (ws, req) => {
            console.log('New client connected');
            
            ws.on('message', (message) => {
                try {
                    const data = JSON.parse(message);
                    this.handleMessage(ws, data);
                } catch (error) {
                    console.error('Error parsing message:', error);
                    this.sendError(ws, 'Invalid message format');
                }
            });
            
            ws.on('close', () => {
                this.handleClientDisconnect(ws);
            });
            
            ws.on('error', (error) => {
                console.error('WebSocket error:', error);
            });
        });
    }

    handleMessage(ws, data) {
        const { type, roomCode } = data;
        
        switch (type) {
            case 'create-room':
                this.handleCreateRoom(ws, roomCode);
                break;
                
            case 'join-room':
                this.handleJoinRoom(ws, roomCode);
                break;
                
            case 'offer':
                this.handleOffer(ws, data);
                break;
                
            case 'answer':
                this.handleAnswer(ws, data);
                break;
                
            case 'ice-candidate':
                this.handleIceCandidate(ws, data);
                break;
                
            default:
                this.sendError(ws, 'Unknown message type');
        }
    }

    handleCreateRoom(ws, roomCode) {
        if (this.rooms.has(roomCode)) {
            this.sendError(ws, 'Room already exists');
            return;
        }
        
        // Create new room
        this.rooms.set(roomCode, {
            peers: new Set(),
            offers: new Map(),
            answers: new Map()
        });
        
        // Add peer to room
        const room = this.rooms.get(roomCode);
        room.peers.add(ws);
        ws.roomCode = roomCode;
        ws.isCreator = true;
        
        console.log(`Room created: ${roomCode}`);
        
        this.sendMessage(ws, {
            type: 'room-created',
            roomCode: roomCode
        });
    }

    handleJoinRoom(ws, roomCode) {
        const room = this.rooms.get(roomCode);
        
        if (!room) {
            this.sendError(ws, 'Room not found');
            return;
        }
        
        // Add peer to room
        room.peers.add(ws);
        ws.roomCode = roomCode;
        ws.isCreator = false;
        
        console.log(`Peer joined room: ${roomCode}`);
        
        this.sendMessage(ws, {
            type: 'room-joined',
            roomCode: roomCode
        });
        
        // Notify other peers in the room
        this.broadcastToRoom(roomCode, {
            type: 'peer-joined'
        }, ws);
    }

    handleOffer(ws, data) {
        const { roomCode, offer } = data;
        const room = this.rooms.get(roomCode);
        
        if (!room) {
            this.sendError(ws, 'Room not found');
            return;
        }
        
        // Store offer for the other peer
        room.offers.set(ws, offer);
        
        // Forward offer to other peer in the room
        this.broadcastToRoom(roomCode, {
            type: 'offer',
            offer: offer
        }, ws);
    }

    handleAnswer(ws, data) {
        const { roomCode, answer } = data;
        const room = this.rooms.get(roomCode);
        
        if (!room) {
            this.sendError(ws, 'Room not found');
            return;
        }
        
        // Store answer for the other peer
        room.answers.set(ws, answer);
        
        // Forward answer to other peer in the room
        this.broadcastToRoom(roomCode, {
            type: 'answer',
            answer: answer
        }, ws);
    }

    handleIceCandidate(ws, data) {
        const { roomCode, candidate } = data;
        const room = this.rooms.get(roomCode);
        
        if (!room) {
            this.sendError(ws, 'Room not found');
            return;
        }
        
        // Forward ICE candidate to other peer in the room
        this.broadcastToRoom(roomCode, {
            type: 'ice-candidate',
            candidate: candidate
        }, ws);
    }

    handleClientDisconnect(ws) {
        if (ws.roomCode) {
            const room = this.rooms.get(ws.roomCode);
            if (room) {
                room.peers.delete(ws);
                
                // Clean up stored offers/answers
                room.offers.delete(ws);
                room.answers.delete(ws);
                
                // If room is empty, remove it
                if (room.peers.size === 0) {
                    this.rooms.delete(ws.roomCode);
                    console.log(`Room deleted: ${ws.roomCode}`);
                } else {
                    // Notify remaining peers
                    this.broadcastToRoom(ws.roomCode, {
                        type: 'peer-disconnected'
                    });
                }
            }
        }
        
        console.log('Client disconnected');
    }

    broadcastToRoom(roomCode, message, excludeWs = null) {
        const room = this.rooms.get(roomCode);
        if (!room) return;
        
        room.peers.forEach(peer => {
            if (peer !== excludeWs && peer.readyState === WebSocket.OPEN) {
                this.sendMessage(peer, message);
            }
        });
    }

    sendMessage(ws, message) {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(message));
        }
    }

    sendError(ws, error) {
        this.sendMessage(ws, {
            type: 'error',
            message: error
        });
    }

    start() {
        const port = process.env.PORT || 8080;
        this.server.listen(port, () => {
            console.log(`YeetFile Signaling Server running on port ${port}`);
            console.log(`WebSocket endpoint: ws://localhost:${port}`);
        });
    }

    stop() {
        if (this.wss) {
            this.wss.close();
        }
        if (this.server) {
            this.server.close();
        }
    }
}

// Start the server
const server = new SignalingServer(8080);

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('Shutting down server...');
    server.stop();
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('Shutting down server...');
    server.stop();
    process.exit(0);
}); 