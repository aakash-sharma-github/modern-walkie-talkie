# Modern Walkie Talkie App

A real-time audio communication application that simulates walkie-talkie functionality with frequency tuning and push-to-talk features, built with React Native and Expo.

## Features

- Real-time audio communication over Socket.IO
- Push-to-Talk (PTT) functionality with visual feedback
- Frequency tuning (446.00 MHz - 447.00 MHz)
- User presence awareness (see who's on your frequency)
- Status indicators for transmission and reception
- Modern UI with animations and status feedback
- Component-based architecture for maintainability

## Project Structure

The application is organized using a modern component-based architecture:

- **Components** - Reusable UI components in `app/components/walkie-talkie/`

  - `WalkieTalkie` - Main container component
  - `FrequencyControl` - For tuning to different frequencies
  - `PTTButton` - Push-to-talk button with animations
  - `StatusDisplay` - Shows current app status
  - `ConnectionControl` - Manages server connection and channel joins
  - `UsersList` - Displays users on the current frequency
  - `AudioPlayback` - For playing back the last recorded message

- **Hooks** - Custom React hooks in `app/hooks/`

  - `useSocket` - Manages socket connections and real-time events
  - `useAudio` - Handles audio recording and playback
  - `useFrameworkReady` - For framework initialization

- **Services** - Utility services in `app/services/`
  - `socketService` - Socket.IO connection management
  - `audioService` - Audio recording, playback, and upload

## Setup Instructions

1. Clone the repository:

   ```bash
   git clone https://github.com/yourusername/modernWalkiTalki.git
   cd modernWalkiTalki
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Start the development server:

   ```bash
   npm run start
   ```

4. Launch on your device or emulator:
   - Press `a` for Android
   - Press `i` for iOS
   - Or scan the QR code with the Expo Go app

## Usage

1. Open the app on your device
2. Set your desired frequency (between 446.00 MHz and 447.00 MHz)
3. Connect to the server and join the frequency channel
4. Press and hold the PTT button to record your message
5. Release to send the message to other users on the same frequency
6. Listen for incoming messages from other users

## Configuration

To connect to a different server, update the `SOCKET_URL` in the `app/services/socketService.ts` file:

```typescript
export const SOCKET_URL = Platform.select({
  ios: 'http://your-server-ip:8080',
  android: 'http://your-server-ip:8080',
  default: 'http://localhost:8080',
});
```

## Optional Firebase Integration

While not currently in use, the project includes optional Firebase integration for future enhancements:

1. Create a Firebase project at [firebase.google.com](https://firebase.google.com)
2. Enable Realtime Database
3. Update your `.env` file with your Firebase credentials
4. Uncomment the Firebase imports in the appropriate files

Note: The current implementation uses Socket.IO for real-time communication without requiring a database.

## License

[MIT License](LICENSE)
