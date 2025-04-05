const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const bodyParser = require('body-parser');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(express.static('public'));

// Set up file storage
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = path.join(__dirname, '../public/uploads');
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        cb(null, `${Date.now()}-${file.originalname}`);
    }
});

const upload = multer({ storage });

const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Store active channels and users
const channels = new Map();
const users = new Map();

// Basic status API endpoint
app.get('/status', (req, res) => {
    res.json({
        status: 'online',
        channels: Array.from(channels.keys()),
        activeUsers: users.size
    });
});

// Audio file upload endpoint
app.post('/upload', upload.single('audio'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const fileUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
        console.log(`File uploaded: ${fileUrl}`);

        return res.json({
            success: true,
            fileUrl
        });
    } catch (error) {
        console.error('Upload error:', error);
        return res.status(500).json({ error: 'Upload failed' });
    }
});

// Direct audio data endpoint
app.post('/audio-data', async (req, res) => {
    try {
        const { audioData, channelId } = req.body;

        if (!audioData || !channelId) {
            return res.status(400).json({ error: 'Missing data' });
        }

        // Create a unique filename
        const filename = `${Date.now()}.wav`;
        const filePath = path.join(__dirname, '../public/uploads', filename);
        const dir = path.join(__dirname, '../public/uploads');

        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        // Convert base64 to file
        const audioBinary = Buffer.from(audioData.split(',')[1], 'base64');
        fs.writeFileSync(filePath, audioBinary);

        const fileUrl = `${req.protocol}://${req.get('host')}/uploads/${filename}`;
        console.log(`Audio saved: ${fileUrl}`);

        // Broadcast to the channel
        io.to(channelId).emit('audioData', {
            userId: 'server',
            data: { uri: fileUrl }
        });

        return res.json({
            success: true,
            fileUrl
        });
    } catch (error) {
        console.error('Audio processing error:', error);
        return res.status(500).json({ error: 'Failed to process audio' });
    }
});

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);
    users.set(socket.id, { channels: new Set() });

    // Handle joining a channel
    socket.on('joinChannel', (channelId) => {
        // Leave previous channels
        if (users.has(socket.id)) {
            const userChannels = users.get(socket.id).channels;
            userChannels.forEach(channel => {
                socket.leave(channel);
                if (channels.has(channel)) {
                    channels.get(channel).delete(socket.id);
                    if (channels.get(channel).size === 0) {
                        channels.delete(channel);
                    }
                }
            });
            userChannels.clear();
        }

        // Join new channel
        socket.join(channelId);
        if (!channels.has(channelId)) {
            channels.set(channelId, new Set());
        }
        channels.get(channelId).add(socket.id);
        if (users.has(socket.id)) {
            users.get(socket.id).channels.add(channelId);
        }

        console.log(`User ${socket.id} joined channel ${channelId}`);

        // Notify others in the channel
        socket.to(channelId).emit('userJoined', socket.id);
    });

    // Handle audio stream
    socket.on('audioData', ({ channelId, data }) => {
        if (!channelId) {
            console.error('No channelId provided for audioData');
            return;
        }

        console.log(`Received audio data from ${socket.id} on channel ${channelId}`);
        console.log('Audio data type:', typeof data);

        // Validate audio data
        if (!data) {
            console.error('Invalid audio data received');
            return;
        }

        try {
            // Use io.to() to send to ALL clients in the channel, including the sender
            io.to(channelId).emit('audioData', {
                userId: socket.id,
                data: { uri: data }
            });

            console.log(`Audio broadcasted to ALL clients in channel ${channelId}`);
        } catch (error) {
            console.error('Error broadcasting audio:', error);
        }
    });

    // Handle PTT (Push-to-Talk) status
    socket.on('pttStatus', ({ channelId, status, timestamp }) => {
        if (!channelId) {
            console.error('No channelId provided for pttStatus');
            return;
        }

        console.log(`PTT status from ${socket.id} on channel ${channelId}: ${status}, timestamp: ${timestamp || 'none'}`);

        try {
            // Send to ALL clients in the channel, including the sender
            io.to(channelId).emit('pttStatus', {
                userId: socket.id,
                status,
                timestamp: timestamp || Date.now()
            });

            console.log(`PTT status broadcasted to ALL clients in channel ${channelId}`);
        } catch (error) {
            console.error('Error broadcasting PTT status:', error);
        }
    });

    // Handle leaving a channel
    socket.on('leaveChannel', (channelId) => {
        socket.leave(channelId);
        if (channels.has(channelId)) {
            channels.get(channelId).delete(socket.id);
            if (channels.get(channelId).size === 0) {
                channels.delete(channelId);
            }
        }

        if (users.has(socket.id)) {
            users.get(socket.id).channels.delete(channelId);
        }

        socket.to(channelId).emit('userLeft', socket.id);
    });

    // Handle disconnection
    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);

        // Remove user from all their channels
        if (users.has(socket.id)) {
            const userChannels = users.get(socket.id).channels;
            userChannels.forEach(channelId => {
                if (channels.has(channelId)) {
                    channels.get(channelId).delete(socket.id);
                    socket.to(channelId).emit('userLeft', socket.id);

                    if (channels.get(channelId).size === 0) {
                        channels.delete(channelId);
                    }
                }
            });

            users.delete(socket.id);
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
}); 