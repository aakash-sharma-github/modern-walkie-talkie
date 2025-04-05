import { useState, useEffect, useRef, useCallback } from 'react';
import socketService from '../services/socketService';
import { SocketEventHandlers } from '../types';

/**
 * Custom hook for managing socket connections and channels
 */
export const useSocket = (
  frequency: number,
  initialHandlers: Partial<SocketEventHandlers> = {}
) => {
  // Connection states
  const [isConnected, setIsConnected] = useState(false);
  const [isJoined, setIsJoined] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  // User tracking
  const [activeUsers, setActiveUsers] = useState<string[]>([]);
  const [speakingUser, setSpeakingUser] = useState<string | null>(null);

  // Refs
  const mySocketId = useRef<string | null>(null);
  const joinTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  /**
   * Join a frequency channel
   */
  const joinFrequencyChannel = useCallback(
    (freq: number) => {
      const channelId = `freq-${freq.toFixed(2)}`;
      console.log('[CHANNEL] Attempting to join channel:', channelId);

      if (!socketService.isConnected()) {
        console.error('[CHANNEL] Cannot join channel - socket not connected');
        setConnectionError('Socket not connected. Try reconnecting.');
        return;
      }

      setIsJoined(false); // Reset joined state until we get confirmation
      setConnectionError(null); // Clear any previous errors

      try {
        // Clear any existing timeout
        if (joinTimeoutRef.current) {
          clearTimeout(joinTimeoutRef.current);
        }

        // Create a join timeout ID that we can clear if successful
        joinTimeoutRef.current = setTimeout(() => {
          if (!isJoined) {
            console.warn(
              '[CHANNEL] No join confirmation received within timeout'
            );
            setConnectionError('Join request timed out. Try again.');

            // Try to re-send the join request as a recovery mechanism
            try {
              console.log('[CHANNEL] Re-sending join request after timeout');
              socketService.joinChannel(channelId);
            } catch (e) {
              console.error('[CHANNEL] Failed to re-send join request:', e);
            }
          }
        }, 5000); // 5 second timeout

        // Join the channel
        socketService.joinChannel(channelId);
      } catch (error: any) {
        console.error('[CHANNEL] Error joining channel:', error);
        setConnectionError(`Join error: ${error.message}`);
      }
    },
    [isJoined]
  );

  /**
   * Reconnect to the server manually
   */
  const reconnectServer = useCallback(() => {
    console.log('[CONNECTION] Manual reconnection requested');

    // Reset states
    setIsConnected(false);
    setIsJoined(false);
    setConnectionError(null);

    // Initialize a new socket connection
    const socket = socketService.initialize();

    // Setup event handlers again
    setupEventHandlers();
  }, []);

  /**
   * Set up socket event handlers
   */
  const setupEventHandlers = useCallback(() => {
    // Core connection handlers
    const handlers: Partial<SocketEventHandlers> = {
      connect: () => {
        console.log(
          '[CONNECTION] Connected to server, socket ID:',
          socketService.getSocketId()
        );
        mySocketId.current = socketService.getSocketId();
        setIsConnected(true);
        setConnectionError(null);

        // Wait a moment before joining the channel
        setTimeout(() => {
          joinFrequencyChannel(frequency);
        }, 1000);
      },

      disconnect: (reason) => {
        console.log('[CONNECTION] Disconnected from server. Reason:', reason);
        setIsConnected(false);

        // Don't reset joined state immediately if it's just a temporary issue
        if (reason !== 'io client disconnect' && reason !== 'transport close') {
          // User initiated disconnects or transport close shouldn't affect the joined state immediately
          setTimeout(() => {
            if (!socketService.isConnected()) {
              setIsJoined(false);
              setActiveUsers([]);
            }
          }, 3000);
        } else {
          // For explicit disconnects, reset joined state immediately
          setIsJoined(false);
          setActiveUsers([]);
        }
      },

      connect_error: (error) => {
        console.error('[CONNECTION] Connection error:', error.message);
        setConnectionError(`Connection error: ${error.message}`);
        setIsConnected(false);
      },

      pong: () => {
        console.log('[CONNECTION] Received pong from server');
        // Connection is still good
        setIsConnected(true);
      },

      reconnect_attempt: (attempt) => {
        console.log(`[CONNECTION] Reconnection attempt #${attempt}`);
      },

      reconnect: (attempt) => {
        console.log(`[CONNECTION] Reconnected after ${attempt} attempts`);
        setConnectionError(null);
        setIsConnected(true);
      },

      // Channel and user handlers
      joinConfirmation: (data) => {
        console.log(
          `[CHANNEL] Received join confirmation for ${data.channelId}, success: ${data.success}`
        );

        // Clear any join timeout
        if (joinTimeoutRef.current) {
          clearTimeout(joinTimeoutRef.current);
          joinTimeoutRef.current = null;
        }

        if (data.success) {
          setIsJoined(true);
          setConnectionError(null);
        } else {
          setIsJoined(false);
          setConnectionError(
            `Failed to join channel: ${data.error || 'Unknown error'}`
          );
        }
      },

      userJoined: (userId) => {
        console.log('[USERS] User joined:', userId);
        setActiveUsers((prev) => {
          if (!prev.includes(userId)) {
            return [...prev, userId];
          }
          return prev;
        });
      },

      userLeft: (userId) => {
        console.log('[USERS] User left:', userId);
        setActiveUsers((prev) => prev.filter((id) => id !== userId));

        // If the speaking user left, clear speaking status
        if (speakingUser === userId) {
          setSpeakingUser(null);
        }
      },

      activeUsers: (users) => {
        console.log('[USERS] Received active users list:', users);
        setActiveUsers(users);
        setIsJoined(true);
      },

      // Merge in any user-provided handlers for audio and PTT events
      ...initialHandlers,
    };

    socketService.setupEventListeners(handlers);
  }, [frequency, initialHandlers, joinFrequencyChannel, speakingUser]);

  // Setup ping interval for keeping connection alive
  useEffect(() => {
    const pingInterval = setInterval(() => {
      if (socketService.isConnected()) {
        console.log('[CONNECTION] Sending ping to server');
        socketService.sendPing();
      }
    }, 8000);

    return () => clearInterval(pingInterval);
  }, []);

  // Initialize socket connection on mount or frequency change
  useEffect(() => {
    console.log('[CONNECTION] Setting up socket connection');
    setConnectionError(null);

    // Reset state when frequency changes
    setActiveUsers([]);
    setSpeakingUser(null);
    setIsJoined(false);

    try {
      // Initialize the socket connection
      socketService.initialize();

      // Setup event handlers
      setupEventHandlers();

      // Cleanup on unmount or frequency change
      return () => {
        // Leave current frequency channel
        const channelId = `freq-${frequency.toFixed(2)}`;
        console.log(
          `[CONNECTION] Leaving channel ${channelId} and disconnecting`
        );

        try {
          if (socketService.isConnected()) {
            socketService.leaveChannel(channelId);
            socketService.disconnect();
          }
        } catch (err) {
          console.error('Error during socket cleanup:', err);
        }

        // Clear any active timeouts
        if (joinTimeoutRef.current) {
          clearTimeout(joinTimeoutRef.current);
          joinTimeoutRef.current = null;
        }
      };
    } catch (error: any) {
      console.error('[CONNECTION] Error setting up socket:', error);
      setConnectionError(`Error: ${error.message}`);
      return () => {};
    }
  }, [frequency, setupEventHandlers]);

  return {
    isConnected,
    isJoined,
    connectionError,
    activeUsers,
    speakingUser,
    mySocketId: mySocketId.current,
    reconnectServer,
    joinFrequencyChannel,
    setSpeakingUser,
  };
};

export default useSocket;
