# Walkie Talkie App

A real-time audio communication application that works like an actual walkie-talkie, with frequency tuning and push-to-talk functionality.

## Features

- Real-time audio streaming using WebSockets
- Push-to-Talk (PTT) functionality
- Frequency tuning (446.00 MHz - 447.00 MHz)
- Channel-based communication
- Modern UI with haptic feedback
- Background audio support

## Project Structure

The project consists of two main parts:

1. **Frontend** - React Native app with Expo

   - Located in the `app/` directory
   - Uses Socket.io for real-time communication
   - Expo Audio API for recording and playback

2. **Backend** - Node.js server
   - Located in the `backend/` directory
   - Handles audio streaming between clients
   - Manages channels and user connections

## Setup Instructions

### Backend Setup

1. Navigate to the backend directory:

   ```bash
   cd backend
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Start the server:
   ```bash
   npm run dev
   ```

### Frontend Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Start the Expo development server:
   ```bash
   npm run dev
   ```

## Usage

1. Open the app on your device
2. Navigate to the "Channels" tab to select a pre-defined channel or use the frequency tuner on the main screen
3. Press and hold the PTT button to talk
4. Release to stop transmitting

## Technical Details

- Socket.io is used for real-time communication
- Audio is encoded and transmitted as binary data
- Each frequency creates a separate channel for communication
- The server handles audio routing between clients on the same frequency

## Optional Firebase Integration

The project includes code for Firebase Realtime Database integration that is currently not in use. If you want to add persistent storage for messages or user settings in the future, you can:

1. Set up a Firebase project in the Firebase console
2. Add your Firebase configuration to your .env file
3. Uncomment the Firebase imports in the app
4. Use the existing hooks (useAudioChannel) for persistent audio storage

### Firebase Setup (Optional)

1. Create a Firebase project at [firebase.google.com](https://firebase.google.com)
2. Enable Realtime Database
3. Update your .env file with your Firebase credentials
4. No user authentication is currently required

Note: The current implementation uses Socket.IO for real-time communication without requiring a database.
