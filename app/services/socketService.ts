import io, { Socket } from 'socket.io-client';
import { Platform } from 'react-native';
import { PttStatusData, AudioData, SocketEventHandlers } from '../types';

// Socket server URL - Use the CORRECT IP
export const SOCKET_URL = Platform.select({
  ios: 'http://192.168.100.104:8080',
  android: 'http://192.168.100.104:8080',
  default: 'http://localhost:8080',
});

/**
 * Socket.io service for handling real-time communication
 */
class SocketService {
  socket: Socket | null = null;

  // Track current channel
  private currentChannel: string | null = null;

  /**
   * Get the Socket.io server URL
   */
  getSocketUrl(): string {
    return SOCKET_URL;
  }

  /**
   * Get the base server URL without the socket.io path
   * This is useful for constructing URLs for API calls and audio file paths
   */
  getServerBaseUrl(): string {
    // Remove any socket.io path that might be present
    return this.getSocketUrl().replace(/\/socket\.io\/?$/, '');
  }

  /**
   * Normalize URL to ensure it uses the correct server address
   * This fixes issues with localhost URLs on Android
   */
  normalizeUrl(url: string): string {
    if (!url) return url;

    // If it's already an absolute URL not using localhost, return it
    if (
      url.startsWith('http') &&
      !url.includes('localhost:') &&
      !url.includes('127.0.0.1:')
    ) {
      return url;
    }

    try {
      let serverUrl = this.getServerBaseUrl();

      // If it's a relative path starting with slash
      if (url.startsWith('/')) {
        return `${serverUrl}${url}`;
      }

      // If it's a localhost URL, extract path and use server URL
      if (url.includes('localhost:') || url.includes('127.0.0.1:')) {
        const urlObj = new URL(url);
        return `${serverUrl}${urlObj.pathname}${urlObj.search}`;
      }

      // Otherwise just return the original URL
      return url;
    } catch (error) {
      console.error('Error normalizing URL:', error);
      return url;
    }
  }

  /**
   * Initialize socket connection with improved stability options
   */
  initialize(): Socket {
    // If we already have a socket instance and it's connected, return it
    if (this.socket && this.socket.connected) {
      console.log('[SOCKET] Reusing existing connected socket');
      return this.socket;
    }

    // If we have a socket instance but it's disconnected,
    // disconnect it completely before creating a new one
    if (this.socket) {
      console.log('[SOCKET] Cleaning up existing socket before reconnecting');
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }

    console.log('[SOCKET] Creating new socket connection to', SOCKET_URL);
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
    if (this.socket) {
      console.log('[SOCKET] Disconnecting and cleaning up socket');
      this.socket.removeAllListeners();

      if (this.socket.connected) {
        this.socket.disconnect();
      }

      this.socket = null;
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
   * Register a direct event listener on the socket
   */
  on(event: string, callback: (...args: any[]) => void): void {
    if (this.socket) {
      this.socket.on(event, callback);
    } else {
      console.warn(
        `[SOCKET] Cannot attach listener for ${event}: socket not initialized`
      );
    }
  }

  /**
   * Remove a direct event listener from the socket
   */
  off(event: string, callback: (...args: any[]) => void): void {
    if (this.socket) {
      this.socket.off(event, callback);
    }
  }

  /**
   * Join a frequency channel
   */
  joinChannel(channelId: string): void {
    // Don't rejoin the same channel if we're already in it
    if (this.currentChannel === channelId) {
      console.log(`[SOCKET] Already joined channel: ${channelId}, skipping`);
      return;
    }

    if (this.socket && this.socket.connected) {
      // Leave the previous channel if there was one
      if (this.currentChannel) {
        console.log(
          `[SOCKET] Leaving previous channel: ${this.currentChannel}`
        );
        this.socket.emit('leaveChannel', this.currentChannel);
      }

      console.log(`[SOCKET] Joining channel: ${channelId}`);
      this.socket.emit('joinChannel', channelId);
      this.currentChannel = channelId;
    } else {
      console.log('[SOCKET] Cannot join channel - socket not connected');
    }
  }

  /**
   * Leave a frequency channel
   */
  leaveChannel(channelId: string): void {
    if (this.socket && this.socket.connected) {
      console.log(`[SOCKET] Leaving channel: ${channelId}`);
      this.socket.emit('leaveChannel', channelId);

      // Clear current channel if we're leaving the channel we're currently in
      if (this.currentChannel === channelId) {
        this.currentChannel = null;
      }
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
      return this.socket.id || null;
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
