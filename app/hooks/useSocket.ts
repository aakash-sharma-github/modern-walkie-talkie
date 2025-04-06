import { useState, useEffect, useRef, useCallback } from 'react';
import socketService from '../services/socketService';
import audioService from '../services/AudioService';
import { SocketEventHandlers } from '../types';

/**
 * Custom hook for socket connection and channel management
 */
export const useSocket = (
  frequency: number,
  initialHandlers: Partial<SocketEventHandlers> = {}
) => {
  // Connection state
  const [isConnected, setIsConnected] = useState(false);
  const [isJoined, setIsJoined] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  // User tracking
  const [activeUsers, setActiveUsers] = useState<string[]>([]);
  const [speakingUser, setSpeakingUser] = useState<string | null>(null);

  // References
  const isMounted = useRef(false);
  const channelId = `freq-${frequency.toFixed(2)}`;
  const joinTimeoutIdRef = useRef<NodeJS.Timeout | null>(null);

  // Define joinChannel function with useRef to avoid dependency issues
  const joinChannelRef = useRef<() => void>();

  // Join frequency channel implementation
  joinChannelRef.current = () => {
    console.log(`[CHANNEL] Attempting to join channel: ${channelId}`);

    if (!socketService.isConnected()) {
      console.error('[CHANNEL] Cannot join channel - socket not connected');
      setConnectionError('Socket not connected. Try reconnecting.');
      return;
    }

    setConnectionError(null);

    // Set joining state to show the user something is happening
    setIsJoined(false);

    // Send the join request
    socketService.joinChannel(channelId);

    // Clear any existing timeout
    if (joinTimeoutIdRef.current) {
      clearTimeout(joinTimeoutIdRef.current);
    }

    // Create a join timeout that we'll clear if successful
    joinTimeoutIdRef.current = setTimeout(() => {
      if (isMounted.current && !isJoined) {
        console.warn('[CHANNEL] No join confirmation received within timeout');
        setConnectionError('Join request timed out. Try again.');

        // Attempt to join again as a recovery mechanism
        console.log('[CHANNEL] Retrying join after timeout');
        socketService.joinChannel(channelId);
      }
    }, 7000); // Increase timeout to 7 seconds
  };

  // Create a stable joinChannel function for external consumption
  const joinChannel = useCallback(() => {
    joinChannelRef.current?.();
  }, []);

  // Socket event handlers
  const handleConnect = useCallback(() => {
    if (!isMounted.current) return;

    console.log('[SOCKET] Connected to server');
    setIsConnected(true);
    setConnectionError(null);

    // Wait a moment before trying to join channel
    setTimeout(() => {
      if (isMounted.current) {
        joinChannelRef.current?.();
      }
    }, 1000);
  }, []);

  const handleDisconnect = useCallback((reason: string) => {
    if (!isMounted.current) return;

    console.log('[SOCKET] Disconnected:', reason);
    setIsConnected(false);

    // Don't reset joined state immediately for temporary disconnects
    if (reason !== 'io client disconnect' && reason !== 'transport close') {
      setTimeout(() => {
        if (isMounted.current && !socketService.isConnected()) {
          setIsJoined(false);
          setActiveUsers([]);
        }
      }, 3000);
    } else {
      setIsJoined(false);
      setActiveUsers([]);
    }
  }, []);

  const handleConnectError = useCallback((error: Error) => {
    if (!isMounted.current) return;

    console.error('[SOCKET] Connection error:', error.message);
    setConnectionError(`Connection error: ${error.message}`);
    setIsConnected(false);
  }, []);

  const handleUserJoined = useCallback((userId: string) => {
    if (!isMounted.current) return;

    console.log('[USERS] User joined:', userId);
    setActiveUsers((prev) => {
      if (!prev.includes(userId)) {
        return [...prev, userId];
      }
      return prev;
    });
  }, []);

  const handleUserLeft = useCallback((userId: string) => {
    if (!isMounted.current) return;

    console.log('[USERS] User left:', userId);
    setActiveUsers((prev) => prev.filter((id) => id !== userId));

    // If the speaking user left, clear speaking status
    setSpeakingUser((prev) => (prev === userId ? null : prev));
  }, []);

  const handleActiveUsers = useCallback((users: string[]) => {
    if (!isMounted.current) return;

    console.log('[USERS] Received active users list:', users);
    setActiveUsers(users);
    setIsJoined(true);
  }, []);

  const handleJoinConfirmation = useCallback(
    (data: { channelId: string; success: boolean; error?: string }) => {
      if (!isMounted.current) return;

      console.log(
        `[CHANNEL] Received join confirmation for ${data.channelId}, success: ${data.success}`
      );

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
    []
  );

  // Explicitly handle the join confirmation event
  useEffect(() => {
    const onJoinConfirmation = (data: {
      channelId: string;
      success: boolean;
      error?: string;
    }) => {
      if (!isMounted.current) return;

      console.log(
        `[CHANNEL] Received join confirmation for ${data.channelId}, success: ${data.success}`
      );

      // Clear join timeout
      if (joinTimeoutIdRef.current) {
        clearTimeout(joinTimeoutIdRef.current);
        joinTimeoutIdRef.current = null;
      }

      if (data.channelId !== channelId) {
        console.log(
          `[CHANNEL] Ignoring join confirmation for different channel ${data.channelId}`
        );
        return;
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
    };

    socketService.on('joinConfirmation', onJoinConfirmation);

    return () => {
      socketService.off('joinConfirmation', onJoinConfirmation);
    };
  }, [channelId]);

  // Setup socket connection and event listeners
  useEffect(() => {
    console.log(
      '[SOCKET] Setting up socket connection for frequency:',
      frequency
    );
    isMounted.current = true;

    // Clear state when frequency changes
    setActiveUsers([]);
    setSpeakingUser(null);

    // Initialize the connection with better error handling
    try {
      const socket = socketService.initialize();

      // Set the socket in audioService to avoid duplicate connections
      audioService.setSocket(socket);

      // Set up event handlers using the setupEventListeners method
      socketService.setupEventListeners({
        connect: handleConnect,
        disconnect: handleDisconnect,
        connect_error: handleConnectError,
        userJoined: handleUserJoined,
        userLeft: handleUserLeft,
        activeUsers: handleActiveUsers,
      });

      // Set initial connection state
      setIsConnected(socketService.isConnected());

      // If already connected, try to join channel after a short delay
      if (socketService.isConnected()) {
        console.log(
          '[SOCKET] Already connected, will join channel after delay'
        );
        setTimeout(() => {
          if (isMounted.current) {
            joinChannelRef.current?.();
          }
        }, 1000);
      } else {
        console.log('[SOCKET] Not connected yet, waiting for connect event');
      }

      // Set up a ping interval to keep the connection alive
      const pingInterval = setInterval(() => {
        if (socketService.isConnected()) {
          socketService.sendPing();
        }
      }, 8000);

      // Cleanup on unmount or frequency change
      return () => {
        console.log('[SOCKET] Cleaning up socket for frequency:', frequency);
        isMounted.current = false;
        clearInterval(pingInterval);

        // Clear any existing timeout
        if (joinTimeoutIdRef.current) {
          clearTimeout(joinTimeoutIdRef.current);
          joinTimeoutIdRef.current = null;
        }

        // Leave the channel but don't disconnect completely
        socketService.leaveChannel(channelId);
      };
    } catch (error) {
      console.error('[SOCKET] Error setting up socket:', error);
      setConnectionError(
        `Error: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      return () => {
        isMounted.current = false;
      };
    }
  }, [
    frequency,
    handleConnect,
    handleDisconnect,
    handleConnectError,
    handleUserJoined,
    handleUserLeft,
    handleActiveUsers,
    channelId,
  ]);

  // Reconnect to the server
  const reconnect = useCallback(() => {
    console.log('[CONNECTION] Manual reconnection requested');
    setConnectionError(null);
    socketService.initialize();
  }, []);

  return {
    isConnected,
    isJoined,
    connectionError,
    activeUsers,
    speakingUser,
    setSpeakingUser,
    reconnect,
    joinChannel,
  };
};

export default useSocket;
