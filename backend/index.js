const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const os = require('os');

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

            // Get the relative path for the file
            const filePath = `/uploads/${req.file.filename}`;

            // Create full URL with protocol and hostname
            const protocol = req.headers['x-forwarded-proto'] || 'http';
            const host = req.headers.host || req.headers['x-forwarded-host'] || `localhost:${PORT}`;
            const fileUrl = `${protocol}://${host}${filePath}`;

            console.log(`File uploaded for request ${requestId}: ${req.file.filename}, size: ${req.file.size} bytes`);
            console.log(`Full URL: ${fileUrl}`);

            // Track the file for auto-deletion after 4 minutes
            uploadedFiles.set(req.file.filename, Date.now());
            console.log(`[Cleanup] Tracking new file ${req.file.filename} for deletion after 4 minutes`);

            // Calculate processing time
            const processingTime = Date.now() - requestStartTime;
            console.log(`Upload request ${requestId} completed in ${processingTime}ms`);

            return res.json({
                success: true,
                fileUrl: fileUrl,        // Full URL with host and protocol
                filePath: filePath,      // Just the path for legacy support
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

// Set up Socket.io connection handling
io.on('connection', (socket) => {
    console.log(`[SOCKET] User connected: ${socket.id}`);

    // Track user's channels
    const userChannels = new Set();

    socket.on('joinChannel', (channelId) => {
        // Input validation
        if (!channelId || typeof channelId !== 'string') {
            console.error(`[ERROR] Invalid channel ID from ${socket.id}: ${channelId}`);
            socket.emit('joinConfirmation', {
                channelId: String(channelId) || 'unknown',
                success: false,
                error: 'Invalid channel ID'
            });
            return;
        }

        // Check if user is already in this channel
        if (userChannels.has(channelId)) {
            console.log(`[CHANNEL] User ${socket.id} already in channel ${channelId}, sending confirmation`);

            // Even if already joined, send these messages to ensure UI is updated correctly
            const room = io.sockets.adapter.rooms.get(channelId);
            const users = room ? Array.from(room) : [];

            socket.emit('joinConfirmation', {
                channelId,
                success: true
            });

            socket.emit('activeUsers', users);
            return;
        }

        console.log(`[CHANNEL] User ${socket.id} joining channel: ${channelId}`);

        try {
            // Join the channel
            socket.join(channelId);
            userChannels.add(channelId);

            // Get users in this channel
            const room = io.sockets.adapter.rooms.get(channelId);
            const users = room ? Array.from(room) : [];

            console.log(`[CHANNEL] Users in ${channelId}:`, users);

            // Send confirmation FIRST to ensure it's not delayed
            socket.emit('joinConfirmation', {
                channelId,
                success: true
            });

            // Small delay to ensure joinConfirmation is processed first
            setTimeout(() => {
                // Then send active users list (this can be delayed slightly)
                socket.emit('activeUsers', users);

                // Notify other users in the channel
                socket.to(channelId).emit('userJoined', socket.id);

                // Log active channels
                console.log(`[SERVER] Active channels:`, getActiveChannels());
            }, 100);
        } catch (error) {
            console.error(`[ERROR] Failed to join channel ${channelId}:`, error);
            socket.emit('joinConfirmation', {
                channelId,
                success: false,
                error: error.message
            });
        }
    });

    socket.on('leaveChannel', (channelId) => {
        console.log(`[CHANNEL] User ${socket.id} leaving channel: ${channelId}`);

        try {
            socket.leave(channelId);
            userChannels.delete(channelId);

            // Notify channel that user left
            io.to(channelId).emit('userLeft', socket.id);

            console.log(`[SERVER] Active channels:`, getActiveChannels());
        } catch (error) {
            console.error(`[ERROR] Failed to leave channel ${channelId}:`, error);
        }
    });

    // Handle ptt status updates
    socket.on('pttStatus', (data) => {
        if (!data || !data.channelId) {
            console.error('[ERROR] Invalid PTT status data:', data);
            return;
        }

        console.log(`[PTT] User ${socket.id} PTT status in ${data.channelId}: ${data.status}`);

        // Make sure socket is in the channel
        if (!userChannels.has(data.channelId)) {
            console.log(`[WARNING] User ${socket.id} not in channel ${data.channelId}, ignoring PTT status`);
            return;
        }

        // Broadcast to all clients in the channel (including sender for consistency)
        io.to(data.channelId).emit('pttStatus', {
            userId: socket.id,
            status: data.status
        });
    });

    // Handle audio data
    socket.on('audioData', (data) => {
        if (!data || !data.channelId) {
            console.error('[ERROR] Invalid audio data:', data);
            return;
        }

        console.log(`[AUDIO] Received audio from ${socket.id} for channel ${data.channelId}`);

        // Make sure socket is in the channel
        if (!userChannels.has(data.channelId)) {
            console.log(`[WARNING] User ${socket.id} not in channel ${data.channelId}, ignoring audio data`);
            return;
        }

        // Ensure we're sending a full URL, not just a path
        if (data.data && data.data.uri) {
            // If the URI is just a path and not a full URL, convert it to a full URL
            const uri = data.data.uri;
            if (uri.startsWith('/uploads/')) {
                // Get server hostname and port from the socket handshake
                const protocol = socket.handshake.headers['x-forwarded-proto'] || 'http';
                const host = socket.handshake.headers.host ||
                    socket.handshake.headers['x-forwarded-host'] ||
                    `localhost:${PORT}`;

                // Create the full URL
                data.data.uri = `${protocol}://${host}${uri}`;
                console.log(`[AUDIO] Converted path to full URL: ${data.data.uri}`);
            }
        }

        // Broadcast to other clients in the channel
        socket.to(data.channelId).emit('audioData', {
            userId: socket.id,
            data: data.data
        });
    });

    // Handle ping messages (keep-alive)
    socket.on('ping', () => {
        socket.emit('pong');
    });

    // Handle disconnection
    socket.on('disconnect', (reason) => {
        console.log(`[SOCKET] User disconnected: ${socket.id}, reason: ${reason}`);

        // Notify all channels this user was part of
        userChannels.forEach(channelId => {
            io.to(channelId).emit('userLeft', socket.id);
        });

        // Clear user channels
        userChannels.clear();

        console.log(`[SERVER] Active channels:`, getActiveChannels());
    });
});

// Helper function to get active channels
function getActiveChannels() {
    const channels = [];
    for (const [channelId, sockets] of io.sockets.adapter.rooms.entries()) {
        // Skip rooms that are actually socket IDs (socket.io creates a room for each socket)
        if (!channelId.includes('freq-')) continue;

        channels.push({
            channel: channelId,
            users: sockets.size
        });
    }
    return channels;
}

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

            // Setup the audio cleanup routine
            setupAudioCleanup();
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

// Function to check if uploads folder has any files
function hasAudioFiles() {
    try {
        const uploadPath = path.join(__dirname, 'public/uploads');
        const files = fs.readdirSync(uploadPath);
        return files.length > 0 && files.some(file => file.endsWith('.m4a'));
    } catch (error) {
        console.error('Error checking upload folder:', error);
        return false;
    }
}

// Function to clean up old audio files
function setupAudioCleanup() {
    // Only start the timer if there are files to clean up
    if (hasAudioFiles()) {
        console.log('[SERVER] Audio files found, starting cleanup timer (4 minutes)');
        // Clean up audio files every 4 minutes
        setInterval(() => {
            cleanupOldAudioFiles();
        }, 4 * 60 * 1000);
    } else {
        console.log('[SERVER] No audio files to clean up, skipping timer');
    }
}

// Cleanup old audio files
function cleanupOldAudioFiles() {
    const uploadPath = path.join(__dirname, 'public/uploads');

    try {
        // Check if directory exists
        if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
            return;
        }

        console.log('[SERVER] Cleaning up old audio files...');
        const files = fs.readdirSync(uploadPath);

        // Current time in ms
        const now = Date.now();
        // Keep files that are less than 10 minutes old (600000 ms)
        const maxAge = 10 * 60 * 1000;

        let deletedCount = 0;

        files.forEach(file => {
            if (file.endsWith('.m4a')) {
                const filePath = path.join(uploadPath, file);
                const stats = fs.statSync(filePath);
                const fileAge = now - stats.mtimeMs;

                if (fileAge > maxAge) {
                    // File is older than max age, delete it
                    fs.unlinkSync(filePath);
                    deletedCount++;
                }
            }
        });

        if (deletedCount > 0) {
            console.log(`[SERVER] Deleted ${deletedCount} old audio files`);
        }
    } catch (error) {
        console.error('[SERVER] Error cleaning up audio files:', error);
    }
} 