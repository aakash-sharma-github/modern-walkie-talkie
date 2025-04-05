import { Socket, io } from 'socket.io-client';
import { Platform } from 'react-native';
import { PttStatusData, AudioData, SocketEventHandlers } from '../types';

// Socket server URL - Use the CORRECT IP
const SOCKET_URL = Platform.select({
  ios: 'http://192.168.100.104:8080',
  android: 'http://192.168.100.104:8080',
  default: 'http://localhost:8080',
});

/**
 * Socket.io service for handling real-time communication
 */
class SocketService {
  socket: Socket | null = null;

  /**
   * Get the Socket.io server URL
   */
  getSocketUrl(): string {
    return SOCKET_URL;
  }

  /**
   * Initialize socket connection with improved stability options
   */
  initialize(): Socket {
    if (this.socket) {
      if (this.socket.connected) {
        return this.socket;
      }
      this.socket.connect();
      return this.socket;
    }

    this.socket = io(SOCKET_URL, {
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      timeout: 8000,
      reconnection: true,
      reconnectionDelayMax: 5000,
      randomizationFactor: 0.5,
      transports: ['websocket', 'polling'],
      forceNew: true,
    });

    return this.socket;
  }

  /**
   * Disconnect socket
   */
  disconnect(): void {
    if (this.socket && this.socket.connected) {
      this.socket.disconnect();
    }
  }

  /**
   * Set up event listeners for socket events
   */
  setupEventListeners(handlers: Partial<SocketEventHandlers>): void {
    if (!this.socket) return;

    if (handlers.audioData) {
      this.socket.on('audioData', handlers.audioData);
    }

    if (handlers.pttStatus) {
      this.socket.on('pttStatus', handlers.pttStatus);
    }

    if (handlers.userJoined) {
      this.socket.on('userJoined', handlers.userJoined);
    }

    if (handlers.userLeft) {
      this.socket.on('userLeft', handlers.userLeft);
    }

    if (handlers.activeUsers) {
      this.socket.on('activeUsers', handlers.activeUsers);
    }

    if (handlers.joinConfirmation) {
      this.socket.on('joinConfirmation', handlers.joinConfirmation);
    }

    if (handlers.connect) {
      this.socket.on('connect', handlers.connect);
    }

    if (handlers.disconnect) {
      this.socket.on('disconnect', handlers.disconnect);
    }

    if (handlers.connect_error) {
      this.socket.on('connect_error', handlers.connect_error);
    }

    if (handlers.pong) {
      this.socket.on('pong', handlers.pong);
    }

    if (handlers.reconnect_attempt) {
      this.socket.on('reconnect_attempt', handlers.reconnect_attempt);
    }

    if (handlers.reconnect) {
      this.socket.on('reconnect', handlers.reconnect);
    }
  }

  /**
   * Join a frequency channel
   */
  joinChannel(channelId: string): void {
    if (this.socket && this.socket.connected) {
      this.socket.emit('joinChannel', channelId);
    }
  }

  /**
   * Leave a frequency channel
   */
  leaveChannel(channelId: string): void {
    if (this.socket && this.socket.connected) {
      this.socket.emit('leaveChannel', channelId);
    }
  }

  /**
   * Send PTT status update
   */
  sendPttStatus(data: PttStatusData): void {
    if (this.socket && this.socket.connected) {
      this.socket.emit('pttStatus', data);
    }
  }

  /**
   * Send audio data to channel
   */
  sendAudioData(channelId: string, data: AudioData): void {
    if (this.socket && this.socket.connected) {
      this.socket.emit('audioData', {
        channelId,
        data,
      });
    }
  }

  /**
   * Send ping to keep connection alive
   */
  sendPing(): void {
    if (this.socket && this.socket.connected) {
      this.socket.emit('ping');
    }
  }

  /**
   * Get the current socket ID
   */
  getSocketId(): string | null {
    if (this.socket) {
      return this.socket.id;
    }
    return null;
  }

  /**
   * Check if socket is connected
   */
  isConnected(): boolean {
    return this.socket?.connected || false;
  }
}

// Export as singleton
export const socketService = new SocketService();
export default socketService;
