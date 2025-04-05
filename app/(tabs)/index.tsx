import { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, TextInput, Alert, Platform } from 'react-native';
import { Audio } from 'expo-av';
import { LinearGradient } from 'expo-linear-gradient';
import { Mic, ChevronUp, ChevronDown, Volume2, Radio } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { 
  useAnimatedStyle, 
  withSpring,
  withSequence,
  withTiming,
  useSharedValue
} from 'react-native-reanimated';
import { useLocalSearchParams } from 'expo-router';
import io from 'socket.io-client';
import * as FileSystem from 'expo-file-system';

// Socket server URL - Use the CORRECT IP
const SOCKET_URL = Platform.select({
  ios: 'http://192.168.100.104:8080',
  android: 'http://192.168.100.104:8080',
  default: 'http://localhost:8080',
});

// Frequency settings
const MIN_FREQUENCY = 446.00;
const MAX_FREQUENCY = 447.00;
const STEP = 0.05;

// Extended Recording type with our custom properties
interface ExtendedRecording extends Audio.Recording {
  _startTime?: number;
}

/**
 * Main Walkie Talkie screen component
 * Handles frequency tuning, audio recording/playback, and PTT functions
 */
export default function TalkScreen() {
  // State initialization
  const params = useLocalSearchParams();
  const [isRecording, setIsRecording] = useState(false);
  const [frequency, setFrequency] = useState(
    params.frequency ? parseFloat(params.frequency as string) : 446.00
  );
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [speakingUser, setSpeakingUser] = useState<string | null>(null);
  const [lastRecording, setLastRecording] = useState<string | null>(null);
  const [activeUsers, setActiveUsers] = useState<string[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isJoined, setIsJoined] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  
  // Refs
  const socketRef = useRef<any>(null);
  const recordingRef = useRef<ExtendedRecording | null>(null);
  const mySocketId = useRef<string | null>(null);
  const buttonScale = useSharedValue(1);
  const lastUploadTime = useRef<number>(0);

  // Update frequency when navigating from channels screen
  useEffect(() => {
    if (params.frequency) {
      setFrequency(parseFloat(params.frequency as string));
    }
  }, [params.frequency]);

  /**
   * Socket connection and channel management
   * Handles joining/leaving frequencies and all socket events
   */
  useEffect(() => {
    console.log('[CONNECTION] Setting up socket connection to:', SOCKET_URL);
    setConnectionError(null);
    
    // Reset state when frequency changes
    setActiveUsers([]);
    setSpeakingUser(null);
    setLastRecording(null);
    setIsJoined(false);
    
    // Initialize socket connection with timeout handling
    try {
      // Add connection timeout handling
      const connectionTimeout = setTimeout(() => {
        if (socketRef.current && !socketRef.current.connected) {
          console.log('[CONNECTION] Connection timeout - unable to connect to server');
          setConnectionError('Connection timeout. Check IP address and server.');
        }
      }, 8000);  // Increased from 5000ms to 8000ms
      
      // Create socket connection with improved stability options
      socketRef.current = io(SOCKET_URL, {
        reconnectionAttempts: 5,        // Increased from 3 to 5
        reconnectionDelay: 1000,
        timeout: 8000,                  // Increased from 5000ms to 8000ms
        reconnection: true,             // Explicitly enable reconnection
        reconnectionDelayMax: 5000,     // Max reconnection delay of 5 seconds
        randomizationFactor: 0.5,       // Add randomization to reconnection attempts
        transports: ['websocket', 'polling'],
        forceNew: true
      });
      
      // Debug events for better troubleshooting
      socketRef.current.on('reconnect_attempt', (attempt: number) => {
        console.log(`[CONNECTION] Reconnection attempt #${attempt}`);
      });
      
      socketRef.current.on('reconnect', (attempt: number) => {
        console.log(`[CONNECTION] Reconnected after ${attempt} attempts`);
        setConnectionError(null);
        setIsConnected(true);
        // Don't immediately try to join - will happen via the 'connect' handler
      });

      // On connect, store our socket ID
      socketRef.current.on('connect', () => {
        console.log('[CONNECTION] Connected to server, socket ID:', socketRef.current.id);
        clearTimeout(connectionTimeout);
        mySocketId.current = socketRef.current.id;
        setIsConnected(true);
        setConnectionError(null);
        
        // Wait a moment before joining the channel to ensure the connection is stable
        setTimeout(() => {
          // Join channel for current frequency
          joinFrequencyChannel(frequency);
        }, 1000);  // Increased from 500ms to 1000ms
      });

      // Listen for pong responses to confirm connection is alive
      socketRef.current.on('pong', () => {
        console.log('[CONNECTION] Received pong from server');
        // Connection is still good
        setIsConnected(true);
      });

      // On connection error
      socketRef.current.on('connect_error', (error: Error) => {
        console.error('[CONNECTION] Connection error:', error.message);
        setConnectionError(`Connection error: ${error.message}`);
        setIsConnected(false);
      });
      
      // On disconnect event
      socketRef.current.on('disconnect', (reason: string) => {
        console.log('[CONNECTION] Disconnected from server. Reason:', reason);
        setIsConnected(false);
        
        // Don't reset joined state immediately if it's just a temporary issue
        if (reason !== 'io client disconnect' && reason !== 'transport close') {
          // User initiated disconnects or transport close shouldn't affect the joined state immediately
          // This helps prevent UI flickering during brief network blips
          setTimeout(() => {
            // Only reset joined state if we're still disconnected after the timeout
            if (socketRef.current && !socketRef.current.connected) {
              setIsJoined(false);
              setActiveUsers([]);
            }
          }, 3000);
        } else {
          // For explicit disconnects, reset joined state immediately
          setIsJoined(false);
          setActiveUsers([]);
        }
      });

      // When someone else joins
      socketRef.current.on('userJoined', (userId: string) => {
        console.log('[USERS] User joined:', userId);
        setActiveUsers(prev => {
          if (!prev.includes(userId)) {
            return [...prev, userId];
          }
          return prev;
        });
      });

      // When someone leaves
      socketRef.current.on('userLeft', (userId: string) => {
        console.log('[USERS] User left:', userId);
        setActiveUsers(prev => prev.filter(id => id !== userId));
        
        // If the speaking user left, clear speaking status
        if (speakingUser === userId) {
          setSpeakingUser(null);
          setIsListening(false);
        }
      });

      // Listen for activeUsers list from server (sent when joining a channel)
      socketRef.current.on('activeUsers', (users: string[]) => {
        console.log('[USERS] Received active users list:', users);
        setActiveUsers(users);
        setIsJoined(true);
      });

      // Listen for incoming audio
      socketRef.current.on('audioData', async ({ userId, data }: { userId: string; data: any }) => {
        console.log('Received audio from:', userId);
        
        try {
          // Don't skip our own audio for debugging purposes
          // if (userId === mySocketId.current) {
          //   console.log('Skipping our own audio');
          //   return;
          // }
          
          // Check if we have valid audio data
          if (!data || !data.uri) {
            console.error('Invalid audio data received');
            return;
          }
          
          console.log('Playing audio from URI:', data.uri);
          
          // Clear any existing speaking user state to reset UI
          setSpeakingUser(null);
          setIsListening(true);
          
          // Force cleanup of any previous sound
          if (sound) {
            try {
              await sound.unloadAsync();
              console.log('Unloaded previous sound');
            } catch (err) {
              console.error('Error unloading previous sound:', err);
            }
          }
          
          try {
            // Create and play sound
            const { sound: newSound } = await Audio.Sound.createAsync(
              { uri: data.uri },
              { shouldPlay: true },
              (status) => {
                // This is a status update callback
                if ('isLoaded' in status && status.isLoaded) {
                  if (status.didJustFinish) {
                    console.log('Audio playback finished');
                    setIsPlaying(false);
                    setIsListening(false);
                  } else if (status.isPlaying) {
                    setIsPlaying(true);
                  }
                }
              }
            );
            
            setSound(newSound);
            setIsPlaying(true);
            
            // Add a backup timeout to clear listening state if status updates fail
            setTimeout(() => {
              setIsListening(false);
            }, 10000); // Max message length of 10 seconds
            
          } catch (playError) {
            console.error('Error creating or playing sound:', playError);
            
            // Attempt to play again with a different approach for Android
            try {
              console.log('Trying alternative playback method...');
              const soundObject = new Audio.Sound();
              await soundObject.loadAsync({ uri: data.uri });
              await soundObject.playAsync();
              
              soundObject.setOnPlaybackStatusUpdate((status) => {
                if ('isLoaded' in status && status.isLoaded && !status.isPlaying) {
                  console.log('Alternative audio playback finished');
                  setIsPlaying(false);
                  setIsListening(false);
                  soundObject.unloadAsync().catch(err => 
                    console.error('Error unloading alternative sound:', err)
                  );
                }
              });
              
              setSound(soundObject);
              setIsPlaying(true);
            } catch (altError) {
              console.error('Alternative playback failed:', altError);
              setIsListening(false);
              Alert.alert('Audio Error', 'Failed to play received audio');
            }
          }
        } catch (error) {
          console.error('Error handling received audio:', error);
          setIsListening(false);
        }
      });

      // Listen for PTT (Push To Talk) status updates
      socketRef.current.on('pttStatus', ({ userId, status }: { userId: string; status: boolean }) => {
        console.log(`User ${userId} PTT status:`, status);
        
        // Update UI regardless of the sender (including ourselves)
        // This creates consistency between devices
        if (status) {
          // Someone started talking
          setSpeakingUser(userId);
          setIsListening(true);
        } else {
          // Someone stopped talking - only clear if it's the same user
          if (speakingUser === userId) {
            console.log(`Clearing speaking status for user ${userId}`);
            setSpeakingUser(null);
            setIsListening(false);
          }
        }
        
        // Force UI update if user stops talking
        if (!status && userId !== mySocketId.current) {
          // Mark inactive for this user - helps Android devices sync
          setTimeout(() => {
            if (speakingUser === userId) {
              console.log(`Forcing clear of speaking status for ${userId}`);
              setSpeakingUser(null);
              setIsListening(false);
            }
          }, 300);
        }
      });

      // Listen for join confirmation events
      socketRef.current.on('joinConfirmation', (data: { channelId: string; success: boolean; error?: string }) => {
        console.log(`[CHANNEL] Received join confirmation for ${data.channelId}, success: ${data.success}`);
        
        if (data.success) {
          setIsJoined(true);
          setConnectionError(null);
        } else {
          setIsJoined(false);
          setConnectionError(`Failed to join channel: ${data.error || 'Unknown error'}`);
        }
      });

      // Set up a ping interval to keep the connection alive - more frequent pings
      const pingInterval = setInterval(() => {
        if (socketRef.current && socketRef.current.connected) {
          console.log('[CONNECTION] Sending ping to server');
          socketRef.current.emit('ping');
        }
      }, 8000);  // Reduced from 15000ms to 8000ms for more frequent connection checks

      // Cleanup on unmount or frequency change
      return () => {
        clearTimeout(connectionTimeout);
        clearInterval(pingInterval);
        
        // Stop any active recording
        if (recordingRef.current) {
          // Catch any errors here to prevent crashes during cleanup
          try {
            recordingRef.current.stopAndUnloadAsync()
              .catch(err => console.error('Error stopping recording during cleanup:', err));
          } catch (err) {
            console.error('Error stopping recording during cleanup:', err);
          }
          recordingRef.current = null;
        }
        
        // Unload any playing sound
        if (sound) {
          sound.unloadAsync()
            .catch(err => console.error('Error unloading sound during cleanup:', err));
        }
        
        // Leave current frequency channel
        if (socketRef.current) {
          const channelId = `freq-${frequency.toFixed(2)}`;
          console.log(`[CONNECTION] Leaving channel ${channelId} and disconnecting`);
          
          try {
            if (socketRef.current.connected) {
              socketRef.current.emit('leaveChannel', channelId);
              socketRef.current.disconnect();
            }
          } catch (err) {
            console.error('Error during socket cleanup:', err);
          }
        }
      };
    } catch (error: any) {
      console.error('[CONNECTION] Error setting up socket:', error);
      setConnectionError(`Error: ${error.message}`);
      return () => {};
    }
  }, [frequency]);

  /**
   * Join a specific frequency channel
   */
  const joinFrequencyChannel = (freq: number) => {
    const channelId = `freq-${freq.toFixed(2)}`;
    console.log('[CHANNEL] Attempting to join channel:', channelId);
    
    if (!socketRef.current || !socketRef.current.connected) {
      console.error('[CHANNEL] Cannot join channel - socket not connected');
      setConnectionError('Socket not connected. Try reconnecting.');
      return;
    }
    
    setIsJoined(false); // Reset joined state until we get confirmation
    setConnectionError(null); // Clear any previous errors
    
    try {
      // Create a join timeout ID that we can clear if successful
      const joinTimeoutId = setTimeout(() => {
        if (!isJoined) {
          console.warn('[CHANNEL] No join confirmation received within timeout');
          setConnectionError('Join request timed out. Try again.');
          
          // Try to re-send the join request as a recovery mechanism
          try {
            console.log('[CHANNEL] Re-sending join request after timeout');
            socketRef.current?.emit('joinChannel', channelId);
          } catch (e) {
            console.error('[CHANNEL] Failed to re-send join request:', e);
          }
        }
      }, 5000); // Increased timeout from 3000ms to 5000ms
      
      // Store the timeout ID so we can clear it on success
      socketRef.current.once('joinConfirmation', () => {
        clearTimeout(joinTimeoutId);
      });
      
      // Leave any current channel first
      const currentChannelId = `freq-${frequency.toFixed(2)}`;
      if (currentChannelId !== channelId) {
        console.log('[CHANNEL] Leaving current channel:', currentChannelId);
        socketRef.current.emit('leaveChannel', currentChannelId);
      }
      
      // Join the new channel
      console.log('[CHANNEL] Sending join request for channel:', channelId);
      socketRef.current.emit('joinChannel', channelId);
      
    } catch (error: any) {
      console.error('[CHANNEL] Error joining channel:', error);
      setConnectionError(`Join error: ${error.message}`);
    }
  };

  /**
   * Manually reconnect to the server
   */
  const reconnectServer = () => {
    console.log('[CONNECTION] Manual reconnection requested');
    
    if (socketRef.current) {
      // First disconnect if there's an existing connection
      if (socketRef.current.connected) {
        socketRef.current.disconnect();
      }
      
      // Attempt to reconnect
      console.log('[CONNECTION] Attempting to reconnect...');
      socketRef.current.connect();
    }
  };

  /**
   * Increment the current frequency
   */
  const incrementFrequency = () => {
    if (frequency + STEP <= MAX_FREQUENCY) {
      setFrequency(prev => {
        const newFreq = +(prev + STEP).toFixed(2);
        return newFreq;
      });
    }
  };

  /**
   * Decrement the current frequency
   */
  const decrementFrequency = () => {
    if (frequency - STEP >= MIN_FREQUENCY) {
      setFrequency(prev => {
        const newFreq = +(prev - STEP).toFixed(2);
        return newFreq;
      });
    }
  };

  /**
   * Handle manual frequency input
   */
  const handleFrequencyChange = (text: string) => {
    const value = parseFloat(text);
    if (!isNaN(value) && value >= MIN_FREQUENCY && value <= MAX_FREQUENCY) {
      setFrequency(value);
    }
  };

  /**
   * Start recording audio when PTT button is pressed
   * Also broadcasts PTT status to other users
   */
  async function startRecording() {
    try {
      console.log('Starting recording...');
      
      // Track recording start time to enforce minimum duration
      const recordingStartTime = Date.now();
      
      // Clean up any existing recording
      if (recordingRef.current) {
        await recordingRef.current.stopAndUnloadAsync();
        recordingRef.current = null;
      }

      // Request audio permissions
      const { granted } = await Audio.requestPermissionsAsync();
      if (!granted) {
        Alert.alert('Permission Required', 'Audio recording permission is needed');
        return;
      }

      // Configure audio session
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
      });

      // Prepare recording
      console.log('Setting up recording...');
      
      // Use HIGH_QUALITY preset but with compressed format
      const recordingOptions = {
        ...Audio.RecordingOptionsPresets.HIGH_QUALITY,
        android: {
          ...Audio.RecordingOptionsPresets.HIGH_QUALITY.android,
          extension: '.m4a',
          outputFormat: Audio.AndroidOutputFormat.MPEG_4,
          audioEncoder: Audio.AndroidAudioEncoder.AAC,
        },
        ios: {
          ...Audio.RecordingOptionsPresets.HIGH_QUALITY.ios,
          extension: '.m4a',
          outputFormat: Audio.IOSOutputFormat.MPEG4AAC,
          audioQuality: Audio.IOSAudioQuality.MEDIUM,
        },
      };
      
      // Create and start recording
      const { recording } = await Audio.Recording.createAsync(recordingOptions);
      
      // Store recording object and start time in ref for later use
      recordingRef.current = recording;
      recordingRef.current._startTime = recordingStartTime;
      
      // Update UI state
      setIsRecording(true);
      setSpeakingUser(mySocketId.current);
      buttonScale.value = withSequence(
        withSpring(0.95),
        withSpring(1)
      );

      // Broadcast PTT ON status to others
      socketRef.current?.emit('pttStatus', {
        channelId: `freq-${frequency.toFixed(2)}`,
        status: true
      });
      
      console.log('Recording started successfully');
    } catch (err) {
      console.error('Failed to start recording:', err);
      Alert.alert('Recording Error', 'Could not start recording');
      setIsRecording(false);
      setSpeakingUser(null);
    }
  }

  /**
   * Stop recording and send audio to other users
   */
  async function stopRecording() {
    try {
      console.log('Stopping recording...');
      
      // Check if we have an active recording object
      if (!recordingRef.current) {
        console.log('No active recording reference to stop');
        
        // Still update UI state and broadcast PTT OFF
        setIsRecording(false);
        setSpeakingUser(null);
        buttonScale.value = withTiming(1);
        
        // Broadcast PTT OFF status
        socketRef.current?.emit('pttStatus', {
          channelId: `freq-${frequency.toFixed(2)}`,
          status: false
        });
        
        // Force clear speaking state to fix "stuck speaking" on Android
        forceClearSpeakingState();
        
        return;
      }
      
      // Get reference to the recording before clearing it
      const recording = recordingRef.current;
      const recordingStartTime = recordingRef.current._startTime || 0;
      
      // Check if the recording duration is less than our minimum threshold (500ms)
      const currentTime = Date.now();
      const recordingDuration = currentTime - recordingStartTime;
      const MIN_RECORDING_DURATION = 800; // minimum ms to capture valid audio
      
      if (recordingDuration < MIN_RECORDING_DURATION) {
        console.log(`Recording too short (${recordingDuration}ms), waiting before stopping...`);
        
        // Wait until we reach minimum duration
        const timeToWait = MIN_RECORDING_DURATION - recordingDuration;
        
        // Update UI state now
        setIsRecording(false);
        setSpeakingUser(null);
        buttonScale.value = withTiming(1);
        
        // Wait the minimum time before trying to stop recording
        await new Promise(resolve => setTimeout(resolve, timeToWait));
        console.log(`Waited ${timeToWait}ms, now stopping recording...`);
      } else {
        // Update UI state first
        setIsRecording(false);
        setSpeakingUser(null);
        buttonScale.value = withTiming(1);
      }
      
      // Clear reference immediately to prevent double-stop attempts
      recordingRef.current = null;
      
      try {
        // Check if the recording exists and has proper methods
        if (recording && typeof recording.stopAndUnloadAsync === 'function') {
          try {
            await recording.stopAndUnloadAsync();
            console.log('Recording stopped successfully');
          } catch (stopError: any) {
            console.error('Error stopping recording:', stopError);
            
            // Handle "no valid audio data" error
            if (stopError.message && stopError.message.includes('no valid audio data')) {
              console.log('No valid audio data received, skipping audio upload');
              
              // Send PTT OFF status and return
              socketRef.current?.emit('pttStatus', {
                channelId: `freq-${frequency.toFixed(2)}`,
                status: false
              });
              
              // Force clear speaking state to fix "stuck speaking" on Android
              forceClearSpeakingState();
              
              return;
            }
            
            // Re-throw other errors
            throw stopError;
          }
          
          // Get the recorded audio URI
          const uri = recording.getURI();
          console.log('Recording completed, URI:', uri);
          
          if (!uri) {
            console.error('No URI from recording');
            // We'll continue to clean up even if no URI
          } else {
            // Store the last recording URI for replay
            setLastRecording(uri);
            
            // Load the sound for local playback
            const { sound: newSound } = await Audio.Sound.createAsync({ uri });
            setSound(newSound);
            
            // Read the file into memory and upload it
            const fileInfo = await FileSystem.getInfoAsync(uri);
            console.log('File info:', fileInfo);
            
            if (fileInfo.exists && fileInfo.size > 0) {
              // Use the new uploadAudioWithRetry function
              uploadAudioWithRetry(uri, `freq-${frequency.toFixed(2)}`, 3)
                .then(success => {
                  if (!success) {
                    console.warn('Upload failed after all retries');
                  }
                })
                .catch(error => {
                  console.error('Error in upload retry handler:', error);
                });
            } else {
              console.error('Audio file missing or empty');
            }
          }
        } else {
          console.error('Invalid recording object or missing stopAndUnloadAsync method');
        }
      } catch (stopError) {
        console.error('Error stopping recording:', stopError);
      } finally {
        // Send PTT OFF status regardless of recording success
        socketRef.current?.emit('pttStatus', {
          channelId: `freq-${frequency.toFixed(2)}`,
          status: false
        });
        
        // Force clear speaking state to fix "stuck speaking" on Android
        forceClearSpeakingState();
        
        // Also force clear speaking state in error cases
        forceClearSpeakingState(500);  // Use shorter delay for error cases
      }
    } catch (err) {
      console.error('Failed to stop recording:', err);
      
      // Make sure we clean up if there's an error
      recordingRef.current = null;
      
      // Reset UI state
      setIsRecording(false);
      setSpeakingUser(null);
      
      // Still send PTT OFF status
      socketRef.current?.emit('pttStatus', {
        channelId: `freq-${frequency.toFixed(2)}`,
        status: false
      });
    }
  }

  /**
   * Play back the last recorded message
   */
  async function playRecording(soundToPlay: Audio.Sound) {
    try {
      setIsPlaying(true);
      await soundToPlay.playAsync();
      soundToPlay.setOnPlaybackStatusUpdate((status) => {
        if ('isLoaded' in status && status.isLoaded && !status.isPlaying) {
          setIsPlaying(false);
        }
      });
    } catch (err) {
      console.error('Failed to play recording:', err);
      setIsPlaying(false);
    }
  }

  // Animated style for PTT button
  const animatedButtonStyle = useAnimatedStyle(() => ({
    transform: [{ scale: buttonScale.value }],
  }));

  /**
   * Ensures that the speaking user state is cleared after audio transmission
   * This helps fix the "stuck in speaking" state on Android devices
   */
  function forceClearSpeakingState(delay = 2000) {
    // Clear speaking state after a delay
    setTimeout(() => {
      if (speakingUser === mySocketId.current) {
        console.log(`[FIX] Force-clearing speaking state for self after ${delay}ms`);
        setSpeakingUser(null);
        setIsListening(false);
        
        // Also broadcast another PTT OFF status for reliability
        socketRef.current?.emit('pttStatus', {
          channelId: `freq-${frequency.toFixed(2)}`,
          status: false
        });
      }
    }, delay);
  }

  /**
   * Uploads audio with retry capability
   * Handles network errors gracefully
   */
  async function uploadAudioWithRetry(uri: string, channelId: string, maxRetries = 3) {
    let retryCount = 0;
    let lastError = null;

    // Check if an upload was just performed
    const now = Date.now();
    const timeSinceLastUpload = now - lastUploadTime.current;
    const MIN_UPLOAD_INTERVAL = 2000; // minimum 2 seconds between uploads
    
    if (timeSinceLastUpload < MIN_UPLOAD_INTERVAL && lastUploadTime.current > 0) {
      console.log(`Last upload was ${timeSinceLastUpload}ms ago, waiting before starting new upload...`);
      
      // Wait until the minimum interval has passed
      const timeToWait = MIN_UPLOAD_INTERVAL - timeSinceLastUpload;
      await new Promise(resolve => setTimeout(resolve, timeToWait));
      console.log(`Waited ${timeToWait}ms, now starting upload`);
    }
    
    // Update the last upload time
    lastUploadTime.current = Date.now();

    while (retryCount < maxRetries) {
      try {
        console.log(`Upload attempt ${retryCount + 1} for ${uri}`);
        
        // Use FormData to upload the file
        const formData = new FormData();
        formData.append('audio', {
          uri: uri,
          type: 'audio/m4a',
          name: `recording-${Date.now()}.m4a`
        } as any);
        
        const uploadUrl = `${SOCKET_URL}/upload`;
        console.log('Upload URL:', uploadUrl);
        
        // Set timeout to 15 seconds
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);
        
        const response = await fetch(uploadUrl, {
          method: 'POST',
          body: formData,
          headers: {
            'Accept': 'application/json',
          },
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
          throw new Error(`Server responded with ${response.status}: ${response.statusText}`);
        }
        
        const result = await response.json();
        console.log('Upload result:', result);
        
        if (result.success) {
          // Send the server URL to other clients
          const fullAudioUrl = `${SOCKET_URL}${result.fileUrl}`;
          console.log('Full audio URL:', fullAudioUrl);
          
          socketRef.current?.emit('audioData', {
            channelId: channelId,
            data: { uri: fullAudioUrl }
          });
          console.log('Audio data sent to channel');
          
          // Return success
          return true;
        } else {
          throw new Error(result.error || 'Upload failed');
        }
      } catch (error: any) {
        lastError = error;
        retryCount++;
        
        // Log the error
        console.error(`Upload attempt ${retryCount} failed:`, error.message || error);
        
        if (retryCount < maxRetries) {
          // Wait before retrying (exponential backoff)
          const delay = 1000 * Math.pow(2, retryCount - 1);
          console.log(`Retrying upload in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    // If we get here, all retries failed
    console.error(`Upload failed after ${maxRetries} attempts:`, lastError);
    
    // Send PTT OFF status in case it wasn't sent
    socketRef.current?.emit('pttStatus', {
      channelId: channelId,
      status: false,
      message: 'Failed to upload audio'
    });
    
    // Return failure
    return false;
  }

  return (
    <SafeAreaView style={styles.container}>
      <LinearGradient
        colors={['#1a1b1e', '#2d2e32']}
        style={styles.background}
      />
      
      {/* Header with title and frequency control */}
      <View style={styles.header}>
        <Text style={styles.title}>Walkie Talkie</Text>
        <View style={[
          styles.frequencyContainer,
          isJoined && styles.frequencyContainerActive
        ]}>
          <Pressable onPress={decrementFrequency} style={styles.frequencyButton}>
            <ChevronDown size={24} color={isJoined ? "#22c55e" : "#6366f1"} />
          </Pressable>
          
          <Pressable 
            onPress={() => setIsEditing(true)} 
            style={styles.frequencyDisplay}
          >
            {isEditing ? (
              <TextInput
                style={[
                  styles.frequencyInput,
                  isJoined && styles.frequencyInputActive
                ]}
                value={frequency.toFixed(2)}
                onChangeText={handleFrequencyChange}
                onBlur={() => setIsEditing(false)}
                keyboardType="decimal-pad"
                autoFocus
                selectTextOnFocus
              />
            ) : (
              <Text style={[
                styles.frequency,
                isJoined && styles.frequencyActive
              ]}>
                {frequency.toFixed(2)} MHz
              </Text>
            )}
          </Pressable>

          <Pressable onPress={incrementFrequency} style={styles.frequencyButton}>
            <ChevronUp size={24} color={isJoined ? "#22c55e" : "#6366f1"} />
          </Pressable>
        </View>
        
        {/* Display connection status */}
        <Text style={styles.connectionStatus}>
          {isConnected 
            ? isJoined 
              ? `Connected to ${SOCKET_URL}` 
              : 'Connected, not joined to channel'
            : 'Disconnected from server'
          }
        </Text>
      </View>

      <View style={styles.content}>
        {/* Status display */}
        <View style={styles.statusContainer}>
          <View style={[
            styles.statusDot, 
            (isRecording || isPlaying || isListening) && styles.statusDotActive,
            isJoined && !isRecording && !isPlaying && !isListening && styles.statusDotJoined
          ]} />
          <Text style={styles.statusText}>
            {isRecording 
              ? 'Broadcasting...' 
              : speakingUser 
                ? 'Someone is talking...' 
                : isPlaying || isListening 
                  ? 'Receiving...' 
                  : isJoined 
                    ? 'Connected - Ready' 
                    : isConnected 
                      ? 'Not Joined - Select a Channel' 
                      : 'Disconnected - Check Network'
            }
          </Text>
        </View>
        
        {/* Error message if any */}
        {connectionError && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{connectionError}</Text>
          </View>
        )}

        {/* Connection status or Active users based on connection state */}
        {!isConnected ? (
          <Pressable 
            style={styles.connectButton} 
            onPress={reconnectServer}
          >
            <Text style={styles.connectButtonText}>Reconnect to Server</Text>
          </Pressable>
        ) : !isJoined ? (
          <Pressable 
            style={styles.joinButton}
            onPress={() => joinFrequencyChannel(frequency)}
          >
            <Text style={styles.joinButtonText}>Join Frequency {frequency.toFixed(2)}</Text>
          </Pressable>
        ) : (
          <View style={styles.usersContainer}>
            <Text style={styles.usersTitle}>
              Users on frequency: {activeUsers.length}
            </Text>
            <View style={styles.usersList}>
              {activeUsers.map(userId => (
                <View 
                  key={userId} 
                  style={[
                    styles.userBadge,
                    userId === mySocketId.current && styles.currentUserBadge,
                    userId === speakingUser && styles.speakingUserBadge
                  ]}
                >
                  <Text style={styles.userBadgeText}>
                    {userId === mySocketId.current ? 'You' : `User-${userId.substring(0, 4)}`}
                    {userId === speakingUser && ' (Speaking)'}
                  </Text>
                </View>
              ))}
            </View>
            {activeUsers.length === 0 && (
              <Text style={styles.noUsersText}>No users found on this frequency</Text>
            )}
            {speakingUser && (
              <View style={styles.speakingStatusContainer}>
                <Radio size={16} color="#22c55e" />
                <Text style={styles.speakingStatusText}>
                  {speakingUser === mySocketId.current ? "You are transmitting" : "Someone is transmitting"}
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Last message playback button */}
        {sound && lastRecording && (
          <Pressable 
            style={styles.playbackContainer}
            onPress={() => sound && playRecording(sound)}
            disabled={isPlaying || isListening || Boolean(speakingUser)}
          >
            <Volume2 
              size={24} 
              color={(isPlaying || isListening || Boolean(speakingUser)) ? "#71717a" : "#6366f1"} 
            />
            <Text style={[
              styles.playbackText, 
              (isPlaying || isListening || Boolean(speakingUser)) && {opacity: 0.5}
            ]}>
              {isPlaying ? "Playing..." : "Last Message Available"}
            </Text>
          </Pressable>
        )}

        {/* Main PTT button */}
        <Animated.View style={[styles.talkButtonContainer, animatedButtonStyle]}>
          <Pressable
            onPressIn={startRecording}
            onPressOut={stopRecording}
            disabled={!isJoined || (Boolean(speakingUser) && speakingUser !== mySocketId.current)}
            style={({ pressed }) => [
              styles.talkButton,
              pressed && styles.talkButtonPressed,
              isRecording && styles.talkButtonActive,
              (!isJoined || (Boolean(speakingUser) && speakingUser !== mySocketId.current)) && styles.talkButtonDisabled,
            ]}>
            <Mic size={32} color="#fff" />
            <Text style={styles.talkButtonText}>
              {!isJoined 
                ? "Join a frequency first"
                : isRecording 
                  ? "Release to Send" 
                  : Boolean(speakingUser) && speakingUser !== mySocketId.current
                    ? "Someone is talking..." 
                    : "Hold to Talk"
              }
            </Text>
          </Pressable>
        </Animated.View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  background: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
  },
  header: {
    padding: 20,
    alignItems: 'center',
  },
  title: {
    fontFamily: 'Inter_700Bold',
    fontSize: 24,
    color: '#fff',
    marginBottom: 20,
  },
  frequencyContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 20,
    padding: 8,
  },
  frequencyButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  frequencyDisplay: {
    paddingHorizontal: 20,
    minWidth: 120,
    alignItems: 'center',
  },
  frequency: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 18,
    color: '#6366f1',
  },
  frequencyInput: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 18,
    color: '#6366f1',
    textAlign: 'center',
    minWidth: 100,
    padding: 0,
  },
  content: {
    flex: 1,
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 40,
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    padding: 12,
    borderRadius: 20,
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#71717a',
    marginRight: 8,
  },
  statusDotActive: {
    backgroundColor: '#22c55e',
  },
  statusText: {
    fontFamily: 'Inter_400Regular',
    color: '#fff',
    fontSize: 16,
  },
  connectButton: {
    backgroundColor: '#6366f1',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
    marginTop: 12,
  },
  connectButtonText: {
    fontFamily: 'Inter_600SemiBold',
    color: '#fff',
    fontSize: 16,
  },
  joinButton: {
    backgroundColor: '#6366f1',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
    marginTop: 12,
  },
  joinButtonText: {
    fontFamily: 'Inter_600SemiBold',
    color: '#fff',
    fontSize: 16,
  },
  usersContainer: {
    marginTop: 12,
    alignItems: 'center',
  },
  usersTitle: {
    fontFamily: 'Inter_600SemiBold',
    color: '#fff',
    fontSize: 14,
    opacity: 0.8,
  },
  speakingStatusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(34, 197, 94, 0.2)',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginTop: 8,
  },
  speakingStatusText: {
    fontFamily: 'Inter_500Medium',
    color: '#fff',
    fontSize: 13,
    marginLeft: 6,
  },
  playbackContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    padding: 12,
    borderRadius: 20,
    marginTop: 12,
  },
  playbackText: {
    fontFamily: 'Inter_400Regular',
    color: '#fff',
    fontSize: 16,
    marginLeft: 8,
  },
  talkButtonContainer: {
    marginBottom: 40,
  },
  talkButton: {
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: '#6366f1',
    justifyContent: 'center',
    alignItems: 'center',
  },
  talkButtonPressed: {
    backgroundColor: '#4f46e5',
  },
  talkButtonActive: {
    backgroundColor: '#4f46e5',
  },
  talkButtonDisabled: {
    backgroundColor: '#71717a',
    opacity: 0.7,
  },
  talkButtonText: {
    fontFamily: 'Inter_600SemiBold',
    color: '#fff',
    marginTop: 12,
    fontSize: 16,
  },
  frequencyContainerActive: {
    borderColor: '#22c55e',
    borderWidth: 1,
  },
  frequencyActive: {
    color: '#22c55e',
  },
  frequencyInputActive: {
    color: '#22c55e',
  },
  statusDotJoined: {
    backgroundColor: '#6366f1',
  },
  usersList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginTop: 8,
    maxWidth: '90%',
  },
  userBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    margin: 4,
  },
  currentUserBadge: {
    backgroundColor: 'rgba(99, 102, 241, 0.2)',
  },
  speakingUserBadge: {
    backgroundColor: 'rgba(34, 197, 94, 0.2)',
  },
  userBadgeText: {
    fontFamily: 'Inter_500Medium',
    color: '#fff',
    fontSize: 12,
  },
  connectionStatus: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.6)',
    marginTop: 8,
  },
  errorContainer: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    padding: 10,
    borderRadius: 10,
    marginTop: 8,
    maxWidth: '90%',
  },
  errorText: {
    fontFamily: 'Inter_500Medium',
    color: '#ef4444',
    fontSize: 14,
    textAlign: 'center',
  },
  noUsersText: {
    fontFamily: 'Inter_400Regular',
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 14,
    marginTop: 8,
    fontStyle: 'italic',
  },
});