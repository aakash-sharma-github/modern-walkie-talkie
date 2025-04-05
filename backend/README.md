# Walkie Talkie App Backend

This is the backend server for the Walkie Talkie app, handling real-time audio communication between users.

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create a `.env` file in the root directory with the following content:

```
PORT=3000
NODE_ENV=development
```

3. Start the development server:

```bash
npm run dev
```

## Features

- Real-time audio streaming using WebSocket
- Support for multiple channels
- Push-to-Talk (PTT) functionality
- User presence management
- Cross-platform compatibility

## API Documentation

### WebSocket Events

#### Client -> Server

- `joinChannel`: Join a specific channel
- `leaveChannel`: Leave the current channel
- `audioData`: Send audio data to channel
- `pttStatus`: Update Push-to-Talk status

#### Server -> Client

- `userJoined`: New user joined the channel
- `userLeft`: User left the channel
- `audioData`: Receive audio data from other users
- `pttStatus`: Receive PTT status updates

## Development

The server uses:

- Express.js for HTTP server
- Socket.IO for real-time communication
- CORS for cross-origin resource sharing
