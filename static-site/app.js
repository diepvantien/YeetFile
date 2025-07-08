// YeetFile - Advanced P2P File Transfer Application
// Features: WebRTC, E2EE, Web Workers, Streaming, Multi-channel transfer

class YeetFileApp {
    constructor() {
        this.signalingServer = 'wss://yeetfile.onrender.com'; // Local signaling server
        this.socket = null;
        this.peerConnection = null;
        this.dataChannel = null;
        this.encryptionKey = null;
        this.roomCode = null;
        this.isRoomCreator = false;
        this.fileQueue = [];
        this.receivingFiles = new Map();
        this.history = [];
        this.workers = new Map();
        this.transferStats = {
            totalSpeed: 0,
            activeTransfers: 0
        };
        this.pendingCandidates = [];
        this.connectionEstablished = false;
        // Receiving state
        this.incomingFileInfo = null;
        this.incomingFileData = [];
        this.incomingBytesReceived = 0;
        this.incomingDownloadInProgress = false;
        
        this.initializeApp();
    }

    async initializeApp() {
        this.setupEventListeners();
        this.setupDragAndDrop();
        this.loadHistory();
        this.updateUI();
        
        // Initialize WebRTC configuration
        this.rtcConfig = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                // Add your TURN servers here for production
            ]
        };
    }

    setupEventListeners() {
        // Room controls
        document.getElementById('create-room-btn').addEventListener('click', () => this.createRoom());
        document.getElementById('join-room-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.joinRoom();
        });

        // File controls
        document.getElementById('file-input').addEventListener('change', (e) => this.handleFileSelection(e.target.files));
        document.getElementById('send-all-btn').addEventListener('click', () => this.sendAllFiles());

        // Clear buttons
        document.getElementById('clear-sending-btn').addEventListener('click', () => this.clearSendingQueue());
        document.getElementById('clear-receiving-btn').addEventListener('click', () => this.clearReceivingQueue());

        // Download buttons
        document.getElementById('download-all-receiving-btn').addEventListener('click', () => this.downloadAllReceiving());
        document.getElementById('download-all-btn').addEventListener('click', () => this.downloadAllHistory());

        // History controls
        document.getElementById('clear-history-btn').addEventListener('click', () => this.clearHistory());

        // Room sharing
        document.getElementById('copy-room-code-btn').addEventListener('click', () => this.copyRoomCode());
        document.getElementById('share-link-btn').addEventListener('click', () => this.shareRoomLink());
        document.getElementById('show-qr-btn').addEventListener('click', () => this.showQRCode());

        // QR Modal
        document.getElementById('close-qr-modal-btn').addEventListener('click', () => this.hideQRCode());
        document.getElementById('qr-code-modal').addEventListener('click', (e) => {
            if (e.target.id === 'qr-code-modal') this.hideQRCode();
        });
    }

    setupDragAndDrop() {
        const dropZone = document.getElementById('drop-zone');
        const fileInput = document.getElementById('file-input');

        dropZone.addEventListener('click', () => fileInput.click());

        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.classList.add('drag-over');
        });

        dropZone.addEventListener('dragleave', () => {
            dropZone.classList.remove('drag-over');
        });

        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('drag-over');
            this.handleFileSelection(e.dataTransfer.files);
        });
    }

    async createRoom() {
        try {
            this.roomCode = this.generateRoomCode();
            this.isRoomCreator = true;
            
            // Connect to signaling server
            await this.connectToSignalingServer();
            
            // Show room info
            this.showRoomInfo();
            
            // Generate encryption key
            await this.generateEncryptionKey();
            
            this.updateConnectionStatus('Room created - Waiting for peer...');
        } catch (error) {
            console.error('Error creating room:', error);
            this.showError('Failed to create room');
        }
    }

    async joinRoom() {
        const roomCode = document.getElementById('room-code-input').value.trim();
        if (!roomCode) {
            this.showError('Please enter a room code');
            return;
        }

        try {
            this.roomCode = roomCode;
            this.isRoomCreator = false;
            
            // Connect to signaling server
            await this.connectToSignalingServer();
            
            // Show room info
            this.showRoomInfo();
            
            this.updateConnectionStatus('Joining room...');
        } catch (error) {
            console.error('Error joining room:', error);
            this.showError('Failed to join room');
        }
    }

    async connectToSignalingServer() {
        return new Promise((resolve, reject) => {
            this.socket = new WebSocket(this.signalingServer);
            
            this.socket.onopen = () => {
                console.log('Connected to signaling server');
                this.socket.send(JSON.stringify({
                    type: this.isRoomCreator ? 'create-room' : 'join-room',
                    roomCode: this.roomCode
                }));
                resolve();
            };
            
            this.socket.onmessage = (event) => {
                const message = JSON.parse(event.data);
                this.handleSignalingMessage(message);
            };
            
            this.socket.onerror = (error) => {
                console.error('Signaling server error:', error);
                reject(error);
            };
            
            this.socket.onclose = () => {
                console.log('Disconnected from signaling server');
                this.updateConnectionStatus('Disconnected');
            };
        });
    }

    handleSignalingMessage(message) {
        console.log('Received signaling message:', message.type);
        
        switch (message.type) {
            case 'room-created':
                this.updateConnectionStatus('Room created - Share code with peer');
                break;
                
            case 'room-joined':
                this.updateConnectionStatus('Connected');
                break;
                
            case 'peer-joined':
                this.updateConnectionStatus('Peer joined - Establishing connection...');
                this.setupWebRTCConnection();
                break;
                
            case 'offer':
                console.log('Handling offer, isRoomCreator:', this.isRoomCreator);
                this.handleOffer(message.offer);
                break;
                
            case 'answer':
                console.log('Handling answer, isRoomCreator:', this.isRoomCreator);
                this.handleAnswer(message.answer);
                break;
                
            case 'ice-candidate':
                this.handleIceCandidate(message.candidate);
                break;
                
            case 'error':
                this.showError(message.message);
                break;
        }
    }

    async setupWebRTCConnection() {
        try {
            this.peerConnection = new RTCPeerConnection(this.rtcConfig);
            
            if (this.isRoomCreator) {
                this.dataChannel = this.peerConnection.createDataChannel('file-channel', { ordered: true });
                this.setupDataChannel();
            } else {
                this.peerConnection.ondatachannel = (event) => {
                    this.dataChannel = event.channel;
                    this.setupDataChannel();
                };
            }
            
            // Handle ICE candidates
            this.peerConnection.onicecandidate = (event) => {
                if (event.candidate) {
                    this.socket.send(JSON.stringify({
                        type: 'ice-candidate',
                        candidate: event.candidate,
                        roomCode: this.roomCode
                    }));
                }
            };
            
            // Only the room creator creates the offer
            if (this.isRoomCreator) {
                const offer = await this.peerConnection.createOffer();
                await this.peerConnection.setLocalDescription(offer);
                
                this.socket.send(JSON.stringify({
                    type: 'offer',
                    offer: offer,
                    roomCode: this.roomCode
                }));
                
                // Add any pending ICE candidates
                if (this.pendingCandidates) {
                    for (const candidate of this.pendingCandidates) {
                        await this.peerConnection.addIceCandidate(candidate);
                    }
                    this.pendingCandidates = [];
                }
            }
            
        } catch (error) {
            console.error('Error setting up WebRTC:', error);
            this.showError('Failed to establish connection');
        }
    }

    setupDataChannel() {
        this.dataChannel.binaryType = 'arraybuffer';
        this.dataChannel.onopen = () => {
            console.log('Data channel opened');
            if (this.isRoomCreator) {
                // Main channel - handle encryption key exchange
                this.exchangeEncryptionKey();
            }
        };
        
        this.dataChannel.onmessage = (event) => {
            this.handleDataChannelMessage(event.data);
        };
        
        this.dataChannel.onerror = (error) => {
            console.error('Data channel error:', error);
            // Try to recreate the channel if it's the main channel
            if (this.isRoomCreator) {
                console.log('Attempting to recreate main data channel...');
                setTimeout(() => {
                    this.recreateMainDataChannel();
                }, 1000);
            }
        };
        
        this.dataChannel.onclose = () => {
            console.log('Data channel closed');
        };
        
        // Track connection state
        this.peerConnection.onconnectionstatechange = () => {
            console.log('Connection state:', this.peerConnection.connectionState);
            if (this.peerConnection.connectionState === 'connected') {
                this.connectionEstablished = true;
                this.updateConnectionStatus('Connected - Ready');
            } else if (this.peerConnection.connectionState === 'failed') {
                this.connectionEstablished = false;
                this.updateConnectionStatus('Connection failed');
                this.showError('WebRTC connection failed');
            } else if (this.peerConnection.connectionState === 'disconnected') {
                this.connectionEstablished = false;
                this.updateConnectionStatus('Disconnected');
            }
        };
    }

    async generateEncryptionKey() {
        try {
            this.encryptionKey = await crypto.subtle.generateKey(
                {
                    name: 'AES-GCM',
                    length: 256
                },
                true,
                ['encrypt', 'decrypt']
            );
        } catch (error) {
            console.error('Error generating encryption key:', error);
            throw error;
        }
    }

    async exchangeEncryptionKey() {
        if (!this.isRoomCreator) return; // Only creator sends the key
        
        try {
            const exportedKey = await crypto.subtle.exportKey('raw', this.encryptionKey);
            const keyArray = new Uint8Array(exportedKey);
            
            this.dataChannel.send(JSON.stringify({
                type: 'encryption-key',
                key: Array.from(keyArray)
            }));
        } catch (error) {
            console.error('Error exchanging encryption key:', error);
        }
    }

    handleDataChannelMessage(data) {
        if (typeof data === 'string') {
            // Nhận metadata
            let info;
            try {
                info = JSON.parse(data);
            } catch (e) {
                console.warn('Invalid metadata JSON:', data);
                return;
            }
            // Kiểm tra metadata hợp lệ
            if (!info.fileId || !info.fileName || !info.fileSize || isNaN(info.fileSize)) {
                console.warn('Invalid file metadata, skipping:', info);
                return;
            }
            // Kiểm tra trùng fileId trong Receiving Queue
            if (document.querySelector(`[data-file-id="${info.fileId}"]`)) {
                console.log('File already exists in receiving queue, skipping...');
                return;
            }
            // Nếu là message cancel-file
            if (info.type === 'cancel-file' && info.fileId) {
                // Xóa khỏi receivingFiles và UI
                this.receivingFiles.delete(info.fileId);
                const fileElement = document.querySelector(`[data-file-id="${info.fileId}"]`);
                if (fileElement) fileElement.remove();
                // Nếu đang nhận file này thì reset state
                if (this.incomingFileInfo && this.incomingFileInfo.fileId === info.fileId) {
                    this.incomingFileInfo = null;
                    this.incomingFileData = [];
                    this.incomingBytesReceived = 0;
                    this.incomingDownloadInProgress = false;
                }
                return;
            }
            this.incomingFileInfo = info;
            this.incomingFileData = [];
            this.incomingBytesReceived = 0;
            this.incomingDownloadInProgress = true;
            this.addFileItemToUI({
                id: info.fileId,
                name: info.fileName,
                size: info.fileSize,
                type: info.fileType,
                status: 'receiving',
                progress: 0,
                speed: 0,
                startTime: Date.now(),
                blob: null
            }, 'receiving');
        } else if (data instanceof ArrayBuffer) {
            // Nhận chunk
            if (!this.incomingFileInfo) {
                console.warn('Received chunk but no file metadata, skipping chunk.');
                return;
            }
            this.incomingFileData.push(data);
            this.incomingBytesReceived += data.byteLength;
            const progress = Math.min(100, (this.incomingBytesReceived / this.incomingFileInfo.fileSize) * 100);
            this.updateFileProgress(this.incomingFileInfo.fileId, progress, 'Receiving...');
            
            // Kiểm tra chính xác hơn - chỉ hiển thị nút download khi nhận đủ
            if (this.incomingBytesReceived >= this.incomingFileInfo.fileSize && this.incomingDownloadInProgress) {
                console.log('File transfer completed, showing download button...');
                
                // Lưu fileId trước khi reset state
                const fileId = this.incomingFileInfo.fileId;
                
                // Tạo blob và lưu vào receivingFiles
                const blob = new Blob(this.incomingFileData);
                this.receivingFiles.set(fileId, {
                    name: this.incomingFileInfo.fileName,
                    size: this.incomingFileInfo.fileSize,
                    type: this.incomingFileInfo.fileType,
                    blob: blob
                });
                
                // Hiển thị nút download và ẩn nút cancel
                const fileElement = document.querySelector(`[data-file-id="${fileId}"]`);
                if (fileElement) {
                    const downloadBtn = fileElement.querySelector('.action-btn-download');
                    const cancelBtn = fileElement.querySelector('.action-btn-cancel');
                    if (downloadBtn) {
                        downloadBtn.classList.remove('hidden');
                        // Xóa event listener cũ nếu có
                        downloadBtn.replaceWith(downloadBtn.cloneNode(true));
                        const newDownloadBtn = fileElement.querySelector('.action-btn-download');
                        newDownloadBtn.addEventListener('click', () => {
                            console.log('Download button clicked for fileId:', fileId);
                            this.downloadReceivingFile(fileId);
                        });
                    }
                    if (cancelBtn) {
                        cancelBtn.classList.add('hidden');
                    }
                    // Cập nhật status
                    const statusText = fileElement.querySelector('.status-text');
                    if (statusText) {
                        statusText.textContent = 'Ready to download';
                    }
                }
                
                // Reset state
                this.incomingDownloadInProgress = false;
                this.incomingFileInfo = null;
                this.incomingFileData = [];
                this.incomingBytesReceived = 0;
            }
        }
    }

    handleFileSelection(files) {
        Array.from(files).forEach(file => {
            this.addFileToQueue(file);
        });
        this.updateUI();
    }

    addFileToQueue(file) {
        const fileItem = {
            id: this.generateFileId(),
            file: file,
            name: file.name,
            size: file.size,
            type: file.type,
            status: 'queued',
            progress: 0,
            speed: 0,
            startTime: null,
            worker: null
        };
        
        this.fileQueue.push(fileItem);
        this.addFileItemToUI(fileItem, 'sending');
    }

    addFileItemToUI(fileItem, type) {
        const template = document.getElementById('file-item-template');
        const clone = template.content.cloneNode(true);
        
        const container = type === 'sending' ? 
            document.getElementById('file-list') : 
            document.getElementById('receiving-file-list');
        
        const fileElement = clone.querySelector('.file-item');
        fileElement.dataset.fileId = fileItem.id;
        
        // Set file info
        fileElement.querySelector('.file-name').textContent = fileItem.name;
        fileElement.querySelector('.file-size').textContent = this.formatFileSize(fileItem.size);
        
        // Set file icon based on type
        const icon = fileElement.querySelector('.file-icon');
        icon.className = `file-icon ${this.getFileIcon(fileItem.type)} text-xl text-gray-500 w-8 text-center`;
        
        // Setup action buttons
        this.setupFileActionButtons(fileElement, fileItem, type);
        
        container.appendChild(clone);
    }

    setupFileActionButtons(fileElement, fileItem, type) {
        const sendBtn = fileElement.querySelector('.action-btn-send');
        const pauseBtn = fileElement.querySelector('.action-btn-pause-resume');
        const cancelBtn = fileElement.querySelector('.action-btn-cancel');
        
        if (type === 'sending') {
            if (sendBtn) sendBtn.addEventListener('click', () => this.sendFile(fileItem.id));
            if (pauseBtn) pauseBtn.addEventListener('click', () => this.pauseResumeFile(fileItem.id));
            if (cancelBtn) cancelBtn.addEventListener('click', () => this.cancelFile(fileItem.id));
        } else {
            if (cancelBtn) cancelBtn.addEventListener('click', () => this.cancelReceivingFile(fileItem.id));
        }
    }

    async sendFile(fileId) {
        const fileItem = this.fileQueue.find(item => item.id === fileId);
        if (!fileItem || !this.dataChannel || this.dataChannel.readyState !== 'open') {
            this.showError('No connection available for file transfer');
            return;
        }
        if (!this.connectionEstablished) {
            this.showError('Connection not established yet. Please wait...');
            return;
        }
        if (!this.dataChannel || this.dataChannel.readyState !== 'open') {
            this.showError('Connection is not ready. Please wait for connection to stabilize.');
            return;
        }
        try {
            fileItem.status = 'sending';
            fileItem.startTime = Date.now();
            this.updateFileProgress(fileId, 0, 'Preparing...');
            const MAX_BUFFERED_AMOUNT = 8 * 1024 * 1024; // 8MB
            let offset = 0;
            const fileReader = new FileReader();
            const sendChunkWithBufferCheck = (chunk) => {
                if (this.dataChannel.bufferedAmount > MAX_BUFFERED_AMOUNT) {
                    setTimeout(() => sendChunkWithBufferCheck(chunk), 10); // Đợi 10ms rồi thử lại
                    return;
                }
                this.dataChannel.send(chunk);
            };
            const readSlice = () => {
                const slice = fileItem.file.slice(offset, offset + chunkSize);
                fileReader.readAsArrayBuffer(slice);
            };
            fileReader.onload = (e) => {
                if (e.target.error) {
                    this.updateFileStatus(fileId, 'Error reading file');
                    return;
                }
                sendChunkWithBufferCheck(e.target.result);
                offset += chunkSize;
                const progress = Math.min(100, (offset / fileItem.size) * 100);
                this.updateFileProgress(fileId, progress, 'Sending...');
                if (offset < fileItem.size) {
                    setTimeout(readSlice, 2);
                } else {
                    this.updateFileStatus(fileId, 'Transfer complete');
                    setTimeout(() => {
                        this.addToHistory(fileId, 'sent');
                        const fileElement = document.querySelector(`[data-file-id="${fileId}"]`);
                        if (fileElement) fileElement.remove();
                        this.fileQueue = this.fileQueue.filter(item => item.id !== fileId);
                    }, 2000);
                }
            };
            readSlice();
        } catch (error) {
            console.error('Error sending file:', error);
            this.updateFileStatus(fileId, 'Error: ' + error.message);
        }
    }

    updateFileProgress(fileId, progress, status) {
        const fileElement = document.querySelector(`[data-file-id="${fileId}"]`);
        if (!fileElement) return;
        
        const progressBar = fileElement.querySelector('.progress-bar-fill');
        const statusText = fileElement.querySelector('.status-text');
        const speedText = fileElement.querySelector('.transfer-speed');
        
        progressBar.style.width = `${progress}%`;
        statusText.textContent = status;
        
        // Calculate and display speed
        const fileItem = this.fileQueue.find(item => item.id === fileId) || 
                        this.receivingFiles.get(fileId);
        if (fileItem && fileItem.startTime) {
            const elapsed = (Date.now() - fileItem.startTime) / 1000;
            const transferred = (progress / 100) * fileItem.size;
            const speed = transferred / elapsed;
            speedText.textContent = this.formatSpeed(speed);
        }
    }

    updateFileStatus(fileId, status) {
        const fileElement = document.querySelector(`[data-file-id="${fileId}"]`);
        if (!fileElement) return;
        
        const statusText = fileElement.querySelector('.status-text');
        statusText.textContent = status;
    }

    addToHistory(fileId, type, extra) {
        let fileItem = this.fileQueue.find(item => item.id === fileId);
        if (!fileItem && extra) {
            fileItem = {
                id: fileId,
                name: extra.name,
                size: extra.size,
                type: extra.type,
                blob: extra.blob
            };
        }
        if (!fileItem) return;
        const historyItem = {
            id: fileId,
            name: fileItem.name,
            size: fileItem.size,
            type: fileItem.type,
            blob: fileItem.blob || null,
            status: type === 'sent' ? 'Sent successfully' : 'Received successfully',
            timestamp: Date.now()
        };
        this.history.push(historyItem);
        // Sắp xếp history theo thời gian mới nhất
        this.history.sort((a, b) => b.timestamp - a.timestamp);
        this.saveHistory();
        this.addHistoryItemToUI(historyItem);
    }

    addHistoryItemToUI(historyItem) {
        const template = document.getElementById('history-item-template');
        const clone = template.content.cloneNode(true);
        const historyElement = clone.querySelector('.history-item');
        historyElement.dataset.historyId = historyItem.id;
        historyElement.querySelector('.history-name').textContent = historyItem.name;
        historyElement.querySelector('.history-size').textContent = this.formatFileSize(historyItem.size);
        historyElement.querySelector('.history-status').textContent = historyItem.status;
        
        // Thêm thời gian
        const timeAgo = this.formatTimeAgo(historyItem.timestamp);
        const timeElement = historyElement.querySelector('.history-time');
        if (timeElement) {
            timeElement.textContent = timeAgo;
        }
        
        const icon = historyElement.querySelector('.history-icon');
        icon.className = `history-icon ${this.getFileIcon(historyItem.type)} text-xl text-green-500 w-8 text-center`;
        const downloadBtn = historyElement.querySelector('.action-btn-download');
        downloadBtn.addEventListener('click', () => this.downloadHistoryFile(historyItem.id));
        
        // Thêm vào đầu danh sách để hiển thị mới nhất trước
        const historyList = document.getElementById('history-list');
        historyList.insertBefore(clone, historyList.firstChild);
    }

    // Utility methods
    generateRoomCode() {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let result = '';
        for (let i = 0; i < 8; i++) {
            if (i === 3) result += '-';
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }

    generateFileId() {
        return 'file_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    formatSpeed(bytesPerSecond) {
        return this.formatFileSize(bytesPerSecond) + '/s';
    }

    getFileIcon(mimeType) {
        if (!mimeType) return 'fas fa-file';
        if (mimeType.startsWith('image/')) return 'fas fa-image';
        if (mimeType.startsWith('video/')) return 'fas fa-video';
        if (mimeType.startsWith('audio/')) return 'fas fa-music';
        if (mimeType.includes('pdf')) return 'fas fa-file-pdf';
        if (mimeType.includes('zip') || mimeType.includes('rar')) return 'fas fa-file-archive';
        if (mimeType.includes('text/')) return 'fas fa-file-alt';
        return 'fas fa-file';
    }

    showRoomInfo() {
        document.getElementById('room-info-display').classList.remove('hidden');
        document.getElementById('room-code-display').textContent = this.roomCode;
        document.getElementById('qr-modal-room-code').textContent = this.roomCode;
    }

    updateConnectionStatus(status) {
        const statusElement = document.getElementById('connection-status');
        const indicatorElement = document.getElementById('connection-indicator');
        
        statusElement.textContent = status;
        
        // Cập nhật màu chấm dựa trên trạng thái
        if (status.includes('Connected') || status.includes('Ready')) {
            indicatorElement.className = 'w-2 h-2 rounded-full bg-green-500';
        } else if (status.includes('Connecting') || status.includes('Establishing')) {
            indicatorElement.className = 'w-2 h-2 rounded-full bg-yellow-500';
        } else if (status.includes('Failed') || status.includes('Disconnected')) {
            indicatorElement.className = 'w-2 h-2 rounded-full bg-red-500';
        } else {
            indicatorElement.className = 'w-2 h-2 rounded-full bg-gray-400';
        }
    }

    showError(message) {
        // Simple error display - you can enhance this with a proper modal
        alert('Error: ' + message);
    }

    copyRoomCode() {
        navigator.clipboard.writeText(this.roomCode).then(() => {
            // Show success feedback
            const btn = document.getElementById('copy-room-code-btn');
            const originalIcon = btn.innerHTML;
            btn.innerHTML = '<i class="fas fa-check"></i>';
            setTimeout(() => {
                btn.innerHTML = originalIcon;
            }, 2000);
        });
    }

    shareRoomLink() {
        const url = `${window.location.origin}${window.location.pathname}?room=${this.roomCode}`;
        if (navigator.share) {
            navigator.share({
                title: 'Join my YeetFile room',
                text: `Join my file transfer room: ${this.roomCode}`,
                url: url
            }).then(() => {
                // Share successful
                console.log('Share successful');
            }).catch((error) => {
                // Handle share errors gracefully
                if (error.name === 'AbortError') {
                    console.log('Share was cancelled by user');
                    // Don't show error for user cancellation
                } else {
                    console.error('Share failed:', error);
                    // Fallback to clipboard
                    this.copyRoomLinkToClipboard(url);
                }
            });
        } else {
            // Fallback for browsers without share API
            this.copyRoomLinkToClipboard(url);
        }
    }

    copyRoomLinkToClipboard(url) {
        navigator.clipboard.writeText(url).then(() => {
            // Show success feedback
            const btn = document.getElementById('share-link-btn');
            const originalIcon = btn.innerHTML;
            btn.innerHTML = '<i class="fas fa-check"></i>';
            btn.title = 'Link copied!';
            setTimeout(() => {
                btn.innerHTML = originalIcon;
                btn.title = 'Share Link';
            }, 2000);
        }).catch((error) => {
            console.error('Failed to copy to clipboard:', error);
            this.showError('Failed to copy link to clipboard');
        });
    }

    showQRCode() {
        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(window.location.origin + window.location.pathname + '?room=' + this.roomCode)}`;
        document.querySelector('#qr-code-container img').src = qrUrl;
        document.getElementById('qr-code-modal').classList.remove('hidden');
    }

    hideQRCode() {
        document.getElementById('qr-code-modal').classList.add('hidden');
    }

    sendAllFiles() {
        this.fileQueue.forEach(fileItem => {
            if (fileItem.status === 'queued') {
                this.sendFile(fileItem.id);
            }
        });
    }

    pauseResumeFile(fileId) {
        const fileItem = this.fileQueue.find(item => item.id === fileId);
        if (!fileItem) return;
        
        if (fileItem.status === 'sending') {
            fileItem.status = 'paused';
            this.updateFileStatus(fileId, 'Paused');
        } else if (fileItem.status === 'paused') {
            fileItem.status = 'sending';
            this.sendFile(fileId);
        }
    }

    cancelFile(fileId) {
        const index = this.fileQueue.findIndex(item => item.id === fileId);
        if (index > -1) {
            this.fileQueue.splice(index, 1);
        }
        const worker = this.workers.get(fileId);
        if (worker) {
            worker.terminate();
            this.workers.delete(fileId);
        }
        const fileElement = document.querySelector(`[data-file-id="${fileId}"]`);
        if (fileElement) {
            fileElement.remove();
        }
        // Gửi message cancel qua data channel nếu có
        if (this.dataChannel && this.dataChannel.readyState === 'open') {
            this.dataChannel.send(JSON.stringify({ type: 'cancel-file', fileId }));
        }
    }

    cancelReceivingFile(fileId) {
        this.receivingFiles.delete(fileId);
        
        const worker = this.workers.get(fileId);
        if (worker) {
            worker.terminate();
            this.workers.delete(fileId);
        }
        
        const fileElement = document.querySelector(`[data-file-id="${fileId}"]`);
        if (fileElement) {
            fileElement.remove();
        }
    }

    downloadAllHistory() {
        this.history.forEach(item => {
            if (item.blob) this.downloadHistoryFile(item.id);
        });
    }

    clearHistory() {
        this.history = [];
        this.saveHistory();
        document.getElementById('history-list').innerHTML = '';
    }

    downloadHistoryFile(historyId) {
        const item = this.history.find(h => h.id === historyId);
        if (!item || !item.blob) return;
        const a = document.createElement('a');
        a.href = URL.createObjectURL(item.blob);
        a.download = item.name;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(a.href);
        }, 1000);
    }

    loadHistory() {
        const saved = localStorage.getItem('yeetfile-history');
        if (saved) {
            this.history = JSON.parse(saved);
            // Sắp xếp theo thời gian mới nhất
            this.history.sort((a, b) => b.timestamp - a.timestamp);
            this.history.forEach(item => this.addHistoryItemToUI(item));
        }
    }

    saveHistory() {
        localStorage.setItem('yeetfile-history', JSON.stringify(this.history));
    }

    updateUI() {
        // UI updates can be added here if needed
    }

    // WebRTC connection handling methods
    async handleOffer(offer) {
        try {
            // Only handle offer if we're not the room creator
            if (this.isRoomCreator) {
                console.log('Ignoring offer as we are the room creator');
                return;
            }
            
            this.peerConnection = new RTCPeerConnection(this.rtcConfig);
            
            // Handle incoming data channels
            this.peerConnection.ondatachannel = (event) => {
                const dataChannel = event.channel;
                this.dataChannel = dataChannel;
                this.setupDataChannel();
            };
            
            // Handle ICE candidates
            this.peerConnection.onicecandidate = (event) => {
                if (event.candidate) {
                    this.socket.send(JSON.stringify({
                        type: 'ice-candidate',
                        candidate: event.candidate,
                        roomCode: this.roomCode
                    }));
                }
            };
            
            await this.peerConnection.setRemoteDescription(offer);
            
            // Add any pending ICE candidates
            if (this.pendingCandidates) {
                for (const candidate of this.pendingCandidates) {
                    await this.peerConnection.addIceCandidate(candidate);
                }
                this.pendingCandidates = [];
            }
            
            const answer = await this.peerConnection.createAnswer();
            await this.peerConnection.setLocalDescription(answer);
            
            this.socket.send(JSON.stringify({
                type: 'answer',
                answer: answer,
                roomCode: this.roomCode
            }));
            
        } catch (error) {
            console.error('Error handling offer:', error);
            this.showError('Failed to establish connection');
        }
    }

    async handleAnswer(answer) {
        try {
            // Only handle answer if we are the room creator
            if (!this.isRoomCreator) {
                console.log('Ignoring answer as we are not the room creator');
                return;
            }
            
            await this.peerConnection.setRemoteDescription(answer);
            
            // Add any pending ICE candidates
            if (this.pendingCandidates) {
                for (const candidate of this.pendingCandidates) {
                    await this.peerConnection.addIceCandidate(candidate);
                }
                this.pendingCandidates = [];
            }
        } catch (error) {
            console.error('Error handling answer:', error);
        }
    }

    async handleIceCandidate(candidate) {
        try {
            if (this.peerConnection && this.peerConnection.remoteDescription) {
                await this.peerConnection.addIceCandidate(candidate);
            } else {
                // Store candidate for later if remote description not set yet
                if (!this.pendingCandidates) {
                    this.pendingCandidates = [];
                }
                this.pendingCandidates.push(candidate);
            }
        } catch (error) {
            console.error('Error handling ICE candidate:', error);
        }
    }

    handleCapabilityCheck(message) {
        // Check if browser supports File System Access API
        const supportsFileSystem = 'showSaveFilePicker' in window;
        const hasStorage = navigator.storage && navigator.storage.estimate;
        
        this.dataChannel.send(JSON.stringify({
            type: 'capability-response',
            supportsFileSystem: supportsFileSystem,
            hasStorage: hasStorage,
            fileSize: message.fileSize
        }));
    }

    handleCapabilityResponse(message) {
        console.log('Capability response:', message);
        if (!message.supportsFileSystem) {
            this.showError('Browser does not support File System Access API. Please use Chrome/Chromium.');
            return;
        }
        
        // Continue with file transfer
        console.log('Capability check passed, continuing with transfer');
    }

    handleTransferComplete(message, channelIndex) {
        console.log('Transfer complete message:', message);
        const fileId = message.fileId;
        const checksum = message.checksum;
        
        // Find the receiving file
        const receivingFile = this.receivingFiles.get(fileId);
        if (receivingFile && receivingFile.worker) {
            receivingFile.worker.postMessage({
                type: 'finalize-receiving',
                expectedChecksum: checksum
            });
        }
    }

    recreateMainDataChannel() {
        if (this.peerConnection && this.peerConnection.connectionState === 'connected') {
            try {
                const newChannel = this.peerConnection.createDataChannel('file-channel-0-recreated', {
                    ordered: false,
                    maxRetransmits: 3
                });
                this.setupDataChannel();
                this.dataChannel = newChannel;
                console.log('Main data channel recreated successfully');
            } catch (error) {
                console.error('Failed to recreate main data channel:', error);
            }
        }
    }

    formatTimeAgo(timestamp) {
        const now = Date.now();
        const diff = now - timestamp;
        const seconds = Math.floor(diff / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);
        const weeks = Math.floor(days / 7);
        const months = Math.floor(days / 30);
        const years = Math.floor(days / 365);

        if (years > 0) {
            return years + ' year' + (years > 1 ? 's' : '') + ' ago';
        } else if (months > 0) {
            return months + ' month' + (months > 1 ? 's' : '') + ' ago';
        } else if (weeks > 0) {
            return weeks + ' week' + (weeks > 1 ? 's' : '') + ' ago';
        } else if (days > 0) {
            return days + ' day' + (days > 1 ? 's' : '') + ' ago';
        } else if (hours > 0) {
            return hours + ' hour' + (hours > 1 ? 's' : '') + ' ago';
        } else if (minutes > 0) {
            return minutes + ' minute' + (minutes > 1 ? 's' : '') + ' ago';
        } else {
            return seconds + ' second' + (seconds > 1 ? 's' : '') + ' ago';
        }
    }

    clearSendingQueue() {
        this.fileQueue = [];
        document.getElementById('file-list').innerHTML = '';
    }

    clearReceivingQueue() {
        this.receivingFiles.clear();
        this.incomingDownloadInProgress = false;
        this.incomingFileInfo = null;
        this.incomingFileData = [];
        this.incomingBytesReceived = 0;
        document.getElementById('receiving-file-list').innerHTML = '';
    }

    downloadAllReceiving() {
        // Download all files in receiving queue that have completed transfer
        const receivingElements = document.querySelectorAll('#receiving-file-list .file-item');
        receivingElements.forEach(element => {
            const fileId = element.dataset.fileId;
            const downloadBtn = element.querySelector('.action-btn-download');
            if (downloadBtn && !downloadBtn.classList.contains('hidden')) {
                downloadBtn.click();
            }
        });
    }

    downloadReceivingFile(fileId) {
        console.log('downloadReceivingFile called with fileId:', fileId);
        const receivingFile = this.receivingFiles.get(fileId);
        console.log('receivingFile found:', receivingFile);
        if (!receivingFile || !receivingFile.blob) {
            console.error('No receiving file or blob found for fileId:', fileId);
            return;
        }
        console.log('Starting download for file:', receivingFile.name);
        const a = document.createElement('a');
        a.href = URL.createObjectURL(receivingFile.blob);
        a.download = receivingFile.name;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(a.href);
            // Sau khi tải xong, chuyển file xuống History và xóa khỏi Receiving Queue
            this.addToHistory(fileId, 'received', {
                name: receivingFile.name,
                size: receivingFile.size,
                type: receivingFile.type,
                blob: receivingFile.blob
            });
            this.receivingFiles.delete(fileId);
            const fileElement = document.querySelector(`[data-file-id="${fileId}"]`);
            if (fileElement) fileElement.remove();
        }, 1000);
    }
}

// Initialize the application when the page loads
document.addEventListener('DOMContentLoaded', () => {
    window.yeetFileApp = new YeetFileApp();
}); 
