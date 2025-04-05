const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const fs = require('fs');

// Create Express app, HTTP server, and Socket.io instance
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept']
    }
});

// Configure CORS for regular HTTP requests
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept']
}));

// Set up static file serving from public directory
app.use(express.static(path.join(__dirname, 'public')));

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// Track uploaded files with their creation timestamps
const uploadedFiles = new Map();

// File cleanup configuration
const FILE_MAX_AGE_MS = 4 * 60 * 1000; // 4 minutes in milliseconds
const CLEANUP_INTERVAL_MS = 60 * 1000; // Check every minute

/**
 * Delete files older than the maximum age
 */
function cleanupOldFiles() {
    console.log('[Cleanup] Checking for old audio files...');
    const now = Date.now();
    let deletedCount = 0;

    // First, clean up tracked files
    for (const [filename, timestamp] of uploadedFiles.entries()) {
        const age = now - timestamp;
        if (age > FILE_MAX_AGE_MS) {
            const filePath = path.join(uploadsDir, filename);

            try {
                // Check if file exists before attempting to delete
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                    console.log(`[Cleanup] Deleted ${filename} (age: ${Math.round(age / 1000)}s)`);
                    deletedCount++;
                }
            } catch (err) {
                console.error(`[Cleanup] Error deleting ${filename}:`, err);
            }

            // Remove from tracking regardless of deletion success
            uploadedFiles.delete(filename);
        }
    }

    // Also scan directory for any untracked files
    try {
        const files = fs.readdirSync(uploadsDir);
        for (const file of files) {
            // Skip if this file is already being tracked
            if (uploadedFiles.has(file)) continue;

            const filePath = path.join(uploadsDir, file);
            const stats = fs.statSync(filePath);
            const fileAge = now - stats.mtimeMs;

            // Delete if older than max age
            if (fileAge > FILE_MAX_AGE_MS) {
                fs.unlinkSync(filePath);
                console.log(`[Cleanup] Deleted untracked file ${file} (age: ${Math.round(fileAge / 1000)}s)`);
                deletedCount++;
            } else {
                // Add to tracking if not yet expired
                uploadedFiles.set(file, stats.mtimeMs);
            }
        }
    } catch (err) {
        console.error('[Cleanup] Error scanning uploads directory:', err);
    }

    if (deletedCount > 0) {
        console.log(`[Cleanup] Removed ${deletedCount} expired audio files`);
    } else {
        console.log('[Cleanup] No expired files found');
    }
}

// Start periodic cleanup
const cleanupInterval = setInterval(cleanupOldFiles, CLEANUP_INTERVAL_MS);

// Perform initial cleanup on startup to remove any old files
cleanupOldFiles();

// Make sure to clean up the interval when the process exits
process.on('exit', () => {
    clearInterval(cleanupInterval);
});

// Also handle SIGINT (Ctrl+C) and SIGTERM
process.on('SIGINT', () => {
    console.log('Shutting down server, cleaning up...');
    clearInterval(cleanupInterval);
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('Shutting down server, cleaning up...');
    clearInterval(cleanupInterval);
    process.exit(0);
});

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadsDir);
    },
    filename: function (req, file, cb) {
        // Generate a unique filename with timestamp and random string
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname || '.m4a'));
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Track active channels and users
const activeChannels = {};

// Add a simple test route to verify connectivity
app.get('/ping', (req, res) => {
    res.json({ message: 'Server is running' });
});

// Handle file upload endpoint with better error handling
app.post('/upload', (req, res, next) => {
    console.log('Upload request received');
    console.log('Headers:', req.headers);

    // Track when the request started
    const requestStartTime = Date.now();

    // Add request ID for tracking concurrent uploads
    const requestId = Date.now() + '-' + Math.round(Math.random() * 1E9);
    console.log(`Starting upload processing for request ${requestId}`);

    // Use multer middleware with error handling
    upload.single('audio')(req, res, (err) => {
        if (err) {
            console.error(`Multer error in request ${requestId}:`, err);
            return res.status(400).json({ success: false, error: err.message });
        }

        try {
            if (!req.file) {
                console.error(`No file in request ${requestId}`);
                return res.status(400).json({ success: false, error: 'No file uploaded' });
            }

            // Return the public URL for the uploaded file
            const fileUrl = `/uploads/${req.file.filename}`;
            console.log(`File uploaded for request ${requestId}: ${req.file.filename}, size: ${req.file.size} bytes`);

            // Track the file for auto-deletion after 4 minutes
            uploadedFiles.set(req.file.filename, Date.now());
            console.log(`[Cleanup] Tracking new file ${req.file.filename} for deletion after 4 minutes`);

            // Calculate processing time
            const processingTime = Date.now() - requestStartTime;
            console.log(`Upload request ${requestId} completed in ${processingTime}ms`);

            return res.json({
                success: true,
                fileUrl: fileUrl,
                fileName: req.file.filename,
                fileSize: req.file.size,
                processingTime: processingTime,
                requestId: requestId
            });
        } catch (error) {
            console.error(`Error in upload handler for request ${requestId}:`, error);
            return res.status(500).json({ success: false, error: 'Server error' });
        }
    });
});

// Socket.io connection handler
io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    // Keep track of last activity time for this socket 
    let lastActivity = Date.now();

    // Create function to update activity timestamp
    const updateActivity = () => {
        lastActivity = Date.now();
    };

    // Update activity timestamp on any message
    socket.onAny(updateActivity);

    // Add ping handling to keep connections alive
    socket.on('ping', () => {
        console.log(`Ping received from ${socket.id}`);
        updateActivity();
        // Respond with a pong
        socket.emit('pong');
    });

    // Handle test message to debug connection
    socket.on('test', (message) => {
        console.log(`Test message from ${socket.id}:`, message);
        // Echo back the message
        socket.emit('testResponse', {
            received: message,
            serverTime: new Date().toISOString()
        });
    });

    // Enhanced joinChannel event with better error handling
    socket.on('joinChannel', (channelId) => {
        try {
            console.log(`User ${socket.id} attempting to join channel ${channelId}`);

            // Always send a confirmation, even if there's an error
            const sendConfirmation = (success, errorMsg) => {
                console.log(`Sending join confirmation to ${socket.id}: ${success ? 'success' : 'failed - ' + errorMsg}`);
                socket.emit('joinConfirmation', {
                    channelId: channelId,
                    success: success,
                    error: errorMsg || null
                });
            };

            // Validate input
            if (!channelId || typeof channelId !== 'string') {
                console.error(`Invalid channel ID from ${socket.id}: ${channelId}`);
                return sendConfirmation(false, 'Invalid channel ID');
            }

            // Leave all other channels first
            Object.keys(socket.rooms).forEach((room) => {
                if (room !== socket.id) {
                    socket.leave(room);

                    // Notify other users in the channel that this user left
                    io.to(room).emit('userLeft', socket.id);

                    // Remove user from active users list for channel
                    if (activeChannels[room]) {
                        activeChannels[room] = activeChannels[room].filter(id => id !== socket.id);
                        console.log(`User ${socket.id} left channel ${room}`);
                    }
                }
            });

            // Join the new channel
            socket.join(channelId);
            console.log(`User ${socket.id} joined channel ${channelId}`);

            // Update active channels
            if (!activeChannels[channelId]) {
                activeChannels[channelId] = [];
            }

            // Add user to active users if not already present
            if (!activeChannels[channelId].includes(socket.id)) {
                activeChannels[channelId].push(socket.id);
            }

            // Notify everyone in the channel about the new user
            io.to(channelId).emit('userJoined', socket.id);

            // Send currently active users to the joining client
            socket.emit('activeUsers', activeChannels[channelId]);

            // Send join confirmation to the client
            sendConfirmation(true);

            // Debug: log all channels and their users
            console.log('Active channels:', Object.keys(activeChannels).map(channel => {
                return {
                    channel: channel,
                    users: activeChannels[channel].length
                };
            }));

        } catch (error) {
            console.error(`Error handling joinChannel for ${socket.id}:`, error);

            // Send error back to client
            socket.emit('joinConfirmation', {
                channelId: channelId,
                success: false,
                error: error.message
            });
        }
    });

    // Handle leaving a channel
    socket.on('leaveChannel', (channelId) => {
        socket.leave(channelId);
        console.log(`User ${socket.id} left channel ${channelId}`);

        // Notify other users in the channel
        io.to(channelId).emit('userLeft', socket.id);

        // Update active channels
        if (activeChannels[channelId]) {
            activeChannels[channelId] = activeChannels[channelId].filter(id => id !== socket.id);
        }
    });

    // Handle audio data sent from a client with improved reliability
    socket.on('audioData', ({ channelId, data }) => {
        console.log(`Received audio data from ${socket.id} for channel ${channelId}`);
        updateActivity();

        try {
            // Validate data
            if (!data || !data.uri) {
                console.error(`Invalid audio data from ${socket.id}`);
                socket.emit('audioAck', { success: false, error: 'Invalid audio data' });
                return;
            }

            console.log('Audio URI:', data.uri);

            // First, send an explicit PTT OFF status to ensure UI is updated
            io.to(channelId).emit('pttStatus', {
                userId: socket.id,
                status: false
            });

            // Add a small delay before sending audio to ensure PTT status is processed first
            setTimeout(() => {
                // Broadcast to everyone in the channel (including sender for debugging)
                console.log(`Broadcasting audio to channel ${channelId}`);
                io.to(channelId).emit('audioData', {
                    userId: socket.id,
                    data: data,
                    timestamp: Date.now()
                });

                // Send acknowledgement to the sender
                socket.emit('audioAck', {
                    success: true,
                    channelId,
                    timestamp: Date.now()
                });
            }, 200);
        } catch (error) {
            console.error(`Error broadcasting audio data for ${socket.id}:`, error);
            socket.emit('audioAck', { success: false, error: error.message });
        }
    });

    // Handle PTT (Push-to-Talk) status updates with improved reliability
    socket.on('pttStatus', ({ channelId, status, message }) => {
        console.log(`PTT status from ${socket.id} for channel ${channelId}: ${status}`);
        if (message) console.log('Message:', message);
        updateActivity();

        try {
            // For PTT OFF, we'll send twice to ensure it's received
            if (status === false) {
                // Send immediately
                io.to(channelId).emit('pttStatus', {
                    userId: socket.id,
                    status: status,
                    message: message
                });

                // Send again after a short delay to ensure reception
                setTimeout(() => {
                    io.to(channelId).emit('pttStatus', {
                        userId: socket.id,
                        status: status,
                        message: message,
                        timestamp: Date.now()
                    });
                }, 200);
            } else {
                // For PTT ON, just send once (no need for redundancy)
                io.to(channelId).emit('pttStatus', {
                    userId: socket.id,
                    status: status,
                    message: message
                });
            }

            // For PTT OFF status, also send an explicit acknowledgement to the sender
            if (status === false) {
                socket.emit('pttAck', {
                    channelId,
                    status: false,
                    received: true,
                    timestamp: Date.now()
                });
            }
        } catch (error) {
            console.error(`Error broadcasting PTT status for ${socket.id}:`, error);
            // Still try to send acknowledgement to the sender if possible
            socket.emit('pttAck', {
                channelId,
                status: status,
                received: false,
                error: error.message
            });
        }
    });

    // Set up a health check interval to detect zombies
    const healthCheckInterval = setInterval(() => {
        const inactiveTime = Date.now() - lastActivity;

        // If no activity for over 60 seconds, consider the connection dead
        if (inactiveTime > 60000) {
            console.log(`Zombie connection detected for ${socket.id}, inactive for ${inactiveTime}ms`);
            // Disconnect the socket to clean up resources
            socket.disconnect(true);
        }
    }, 30000); // Check every 30 seconds

    // Clean up on disconnect
    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.id}`);

        // Clear the health check interval
        clearInterval(healthCheckInterval);

        // Remove user from all channels they were in
        Object.keys(activeChannels).forEach(channelId => {
            if (activeChannels[channelId].includes(socket.id)) {
                // Remove from our tracking
                activeChannels[channelId] = activeChannels[channelId].filter(id => id !== socket.id);

                // Notify others
                io.to(channelId).emit('userLeft', socket.id);
            }
        });
    });
});

// Log server IP addresses for easier connection
const getIpAddresses = () => {
    const { networkInterfaces } = require('os');
    const nets = networkInterfaces();
    const results = {};

    for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
            // Skip over non-IPv4 and internal (i.e. 127.0.0.1) addresses
            if (net.family === 'IPv4' && !net.internal) {
                if (!results[name]) {
                    results[name] = [];
                }
                results[name].push(net.address);
            }
        }
    }

    return results;
};

// Start the server
const PORT = process.env.PORT || 8080;

// Try to start server with multiple port options if default is in use
const startServer = (port) => {
    try {
        server.listen(port, () => {
            console.log(`\n=== Walkie Talkie Server ===`);
            console.log(`Server running on port ${port}`);
            console.log('Available IP addresses:');
            const addresses = getIpAddresses();
            console.log(addresses);

            // Print connection URLs for easy testing
            Object.keys(addresses).forEach(iface => {
                addresses[iface].forEach(addr => {
                    console.log(`\nTest URL: http://${addr}:${port}/ping`);
                    console.log(`Mobile App URL: http://${addr}:${port}`);
                });
            });

            console.log('\nUse one of these IP addresses in your mobile app to connect to this server');
            console.log('=== Server Ready ===\n');
        });
    } catch (error) {
        if (error.code === 'EADDRINUSE') {
            console.log(`Port ${port} is in use, trying ${port + 1}...`);
            startServer(port + 1);
        } else {
            console.error('Error starting server:', error);
        }
    }
};

// Handle port in use error events
// server.on('error', (error) => {
//     if (error.code === 'EADDRINUSE') {
//         console.log(`Port ${PORT} is in use, trying ${PORT + 1}...`);
//         startServer(PORT + 1);
//     } else {
//         console.error('Server error:', error);
//     }
// });

// Start server with initial port
startServer(PORT); 