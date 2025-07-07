// YeetFile - File Worker for P2P File Transfer
// This worker runs in a separate thread to prevent UI blocking

class FileWorker {
    constructor() {
        this.encryptionKey = null;
        this.currentFile = null;
        this.fileHandle = null;
        this.fileWriter = null;
        this.fileReader = null;
        this.checksum = null;
        this.chunkSize = 8 * 1024; // 8KB chunks for better reliability
        this.processedBytes = 0;
        this.startTime = null;
        
        this.setupMessageHandler();
    }

    setupMessageHandler() {
        self.onmessage = (event) => {
            const { type, ...data } = event.data;
            
            switch (type) {
                case 'process-file':
                    this.processFile(data);
                    break;
                    
                case 'setup-receiving':
                    this.setupReceiving(data);
                    break;
                    
                case 'receive-chunk':
                    this.receiveChunk(data);
                    break;
                    
                case 'finalize-receiving':
                    this.finalizeReceiving(data);
                    break;
            }
        };
    }

    async processFile(data) {
        try {
            this.currentFile = data.file;
            this.encryptionKey = data.encryptionKey;
            this.fileId = data.fileId;
            this.startTime = Date.now();
            
            // Initialize checksum calculation
            this.checksum = await this.initializeChecksum();
            
            // Send file metadata
            const metadata = {
                fileName: this.currentFile.name,
                fileSize: this.currentFile.size,
                fileType: this.currentFile.type,
                checksumType: 'sha-256'
            };
            
            self.postMessage({
                type: 'file-metadata',
                metadata: metadata
            });
            
            // Start streaming and processing
            await this.streamAndProcessFile();
            
        } catch (error) {
            self.postMessage({
                type: 'error',
                error: error.message
            });
        }
    }

    async initializeChecksum() {
        // Initialize SHA-256 hash using Web Crypto API
        this.hashBuffer = new Uint8Array(0);
        return true;
    }

    async streamAndProcessFile() {
        const stream = this.currentFile.stream();
        const reader = stream.getReader();
        let chunkIndex = 0;
        
        while (true) {
            const { done, value } = await reader.read();
            
            if (done) break;
            
            // Update checksum
            await this.updateChecksum(value);
            
            // Encrypt chunk
            const encryptedChunk = await this.encryptChunk(value);
            
            // Send encrypted chunk
            self.postMessage({
                type: 'file-chunk',
                chunk: encryptedChunk,
                chunkIndex: chunkIndex
            });
            
            // Update progress
            this.processedBytes += value.length;
            const progress = (this.processedBytes / this.currentFile.size) * 100;
            
            self.postMessage({
                type: 'progress',
                progress: progress,
                status: `Processing... ${this.formatFileSize(this.processedBytes)} / ${this.formatFileSize(this.currentFile.size)}`
            });
            
            // Add small delay to prevent overwhelming the data channel
            await new Promise(resolve => setTimeout(resolve, 50));
            
            chunkIndex++;
        }
        
        // Finalize checksum and send completion
        const finalChecksum = await this.finalizeChecksum();
        
        self.postMessage({
            type: 'file-complete',
            checksum: finalChecksum
        });
    }

    async updateChecksum(data) {
        // Update the hash with new data
        const newData = new Uint8Array(data);
        const combined = new Uint8Array(this.hashBuffer.length + newData.length);
        combined.set(this.hashBuffer);
        combined.set(newData, this.hashBuffer.length);
        this.hashBuffer = combined;
    }

    async finalizeChecksum() {
        // Get the final hash value using Web Crypto API
        const hashBuffer = await crypto.subtle.digest('SHA-256', this.hashBuffer);
        return Array.from(new Uint8Array(hashBuffer))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
    }

    async encryptChunk(data) {
        try {
            // Generate a random IV for each chunk
            const iv = crypto.getRandomValues(new Uint8Array(12));
            
            // Encrypt the data
            const encryptedData = await crypto.subtle.encrypt(
                {
                    name: 'AES-GCM',
                    iv: iv
                },
                this.encryptionKey,
                data
            );
            
            // Combine IV and encrypted data
            const combined = new Uint8Array(iv.length + encryptedData.byteLength);
            combined.set(iv);
            combined.set(new Uint8Array(encryptedData), iv.length);
            
            return combined;
            
        } catch (error) {
            throw new Error('Encryption failed: ' + error.message);
        }
    }

    async setupReceiving(data) {
        try {
            this.encryptionKey = data.encryptionKey;
            this.fileId = data.fileId;
            this.fileHandle = data.fileHandle;
            this.startTime = Date.now();
            
            // Get a writable stream
            this.fileWriter = await this.fileHandle.createWritable();
            
            // Initialize checksum for verification
            this.checksum = await this.initializeChecksum();
            
            self.postMessage({
                type: 'receiving-ready'
            });
            
        } catch (error) {
            self.postMessage({
                type: 'error',
                error: error.message
            });
        }
    }

    async receiveChunk(data) {
        try {
            const { chunk, chunkIndex, segmentIndex = 0 } = data;
            
            // Decrypt chunk
            const decryptedChunk = await this.decryptChunk(chunk);
            
            // Update checksum
            await this.updateChecksum(decryptedChunk);
            
            // Write to file at the correct position
            await this.writeChunkToFile(decryptedChunk, chunkIndex, segmentIndex);
            
            // Update progress
            this.processedBytes += decryptedChunk.length;
            const progress = (this.processedBytes / this.fileSize) * 100;
            
            self.postMessage({
                type: 'chunk-received',
                progress: progress,
                status: `Receiving... ${this.formatFileSize(this.processedBytes)} / ${this.formatFileSize(this.fileSize)}`
            });
            
        } catch (error) {
            self.postMessage({
                type: 'error',
                error: 'Failed to process chunk: ' + error.message
            });
        }
    }

    async decryptChunk(encryptedData) {
        try {
            // Extract IV and encrypted data
            const iv = encryptedData.slice(0, 12);
            const data = encryptedData.slice(12);
            
            // Decrypt the data
            const decryptedData = await crypto.subtle.decrypt(
                {
                    name: 'AES-GCM',
                    iv: iv
                },
                this.encryptionKey,
                data
            );
            
            return new Uint8Array(decryptedData);
            
        } catch (error) {
            throw new Error('Decryption failed: ' + error.message);
        }
    }

    async writeChunkToFile(data, chunkIndex, segmentIndex) {
        try {
            // Calculate position in file
            const position = (segmentIndex * this.segmentSize) + (chunkIndex * this.chunkSize);
            
            // Seek to position and write
            await this.fileWriter.seek(position);
            await this.fileWriter.write(data);
            
        } catch (error) {
            throw new Error('Failed to write chunk: ' + error.message);
        }
    }

    async finalizeReceiving(data) {
        try {
            // Close the file writer
            await this.fileWriter.close();
            
            // Calculate final checksum
            const finalChecksum = await this.finalizeChecksum();
            
            self.postMessage({
                type: 'receiving-complete',
                checksum: finalChecksum,
                expectedChecksum: data.expectedChecksum
            });
            
        } catch (error) {
            self.postMessage({
                type: 'error',
                error: 'Failed to finalize receiving: ' + error.message
            });
        }
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
}

// Initialize the worker
new FileWorker(); 