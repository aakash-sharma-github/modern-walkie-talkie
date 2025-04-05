import { Audio } from 'expo-av';
import io, { Socket } from 'socket.io-client';
import { Platform } from 'react-native';
import EventEmitter from 'eventemitter3';
import WalkieTalkie from '../components/WalkieTalkie';
import * as FileSystem from 'expo-file-system';
import { ExtendedRecording } from '../types';
import { Alert } from 'react-native';
import socketService from './socketService';

const BACKEND_URL = Platform.select({
  ios: 'http://localhost:3000',
  android: 'http://10.0.2.2:3000', // Android emulator localhost
  default: 'http://localhost:3000',
});

// Event types for type safety
export interface AudioEvents {
  'connection:status': (status: boolean) => void;
  'user:joined': (userId: string) => void;
  'user:left': (userId: string) => void;
  'ptt:status': (data: { userId: string; status: boolean }) => void;
  'audio:playing': (userId: string) => void;
  'audio:stopped': (userId: string) => void;
  error: (error: Error) => void;
}

// Minimum recording duration in ms to ensure valid audio
const MIN_RECORDING_DURATION = 800;
// Minimum interval between uploads to prevent server overload
const MIN_UPLOAD_INTERVAL = 2000;

/**
 * Service to handle audio recording and playback functionality
 */
class AudioService {
  private socket: Socket | null = null;
  private recording: ExtendedRecording | null = null;
  private sound: Audio.Sound | null = null;
  private currentChannel: string | null = null;
  private isPTTActive = false;
  private eventEmitter: EventEmitter<AudioEvents>;
  private lastRecording: string | null = null;
  private lastUploadTime = 0;

  constructor() {
    this.eventEmitter = new EventEmitter();
    this.initializeSocket();
  }

  // Event handling methods
  on<E extends keyof AudioEvents>(event: E, callback: AudioEvents[E]) {
    this.eventEmitter.on(event, callback as any);
  }

  off<E extends keyof AudioEvents>(event: E, callback: AudioEvents[E]) {
    this.eventEmitter.off(event, callback as any);
  }

  private initializeSocket() {
    try {
      this.socket = io(BACKEND_URL);

      this.socket.on('connect', () => {
        console.log('Connected to server');
        this.eventEmitter.emit('connection:status', true);
      });

      this.socket.on('disconnect', () => {
        this.eventEmitter.emit('connection:status', false);
      });

      this.socket.on('userJoined', (userId: string) => {
        this.eventEmitter.emit('user:joined', userId);
      });

      this.socket.on('userLeft', (userId: string) => {
        this.eventEmitter.emit('user:left', userId);
      });

      this.socket.on('audioData', async ({ userId, data }) => {
        this.eventEmitter.emit('audio:playing', userId);
        await this.playAudio(data);
        this.eventEmitter.emit('audio:stopped', userId);
      });

      this.socket.on('pttStatus', ({ userId, status }) => {
        this.eventEmitter.emit('ptt:status', { userId, status });
      });
    } catch (error) {
      console.error('Socket initialization error:', error);
      this.eventEmitter.emit('error', new Error('Failed to connect to server'));
    }
  }

  async joinChannel(channelId: string) {
    if (!this.socket) {
      throw new Error('Not connected to server');
    }

    try {
      this.currentChannel = channelId;
      this.socket.emit('joinChannel', channelId);
    } catch (error) {
      console.error('Join channel error:', error);
      throw error;
    }
  }

  async leaveChannel() {
    if (!this.socket || !this.currentChannel) return;

    try {
      this.socket.emit('leaveChannel', this.currentChannel);
      this.currentChannel = null;
    } catch (error) {
      console.error('Leave channel error:', error);
      throw error;
    }
  }

  async startPTT() {
    if (!this.currentChannel || this.isPTTActive) return;

    try {
      await Audio.requestPermissionsAsync();
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: true, // Keep audio session active in background
      });

      this.recording = new Audio.Recording();
      await this.recording.prepareToRecordAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      await this.recording.startAsync();
      this.isPTTActive = true;

      this.socket?.emit('pttStatus', {
        channelId: this.currentChannel,
        status: true,
      });

      this.startStreamingAudio();
    } catch (error) {
      console.error('Start PTT error:', error);
      this.eventEmitter.emit('error', new Error('Failed to start PTT'));
      throw error;
    }
  }

  async endPTT() {
    if (!this.recording || !this.isPTTActive) return;

    try {
      await this.recording.stopAndUnloadAsync();
      this.isPTTActive = false;

      this.socket?.emit('pttStatus', {
        channelId: this.currentChannel,
        status: false,
      });
    } catch (error) {
      console.error('End PTT error:', error);
      throw error;
    }
  }

  private async startStreamingAudio() {
    while (this.isPTTActive && this.recording) {
      try {
        const status = await this.recording.getStatusAsync();
        if (status.isDoneRecording) break;

        const uri = this.recording.getURI();
        if (!uri) continue;

        const audioData = await this.recording.createNewLoadedSoundAsync();
        this.socket?.emit('audioData', {
          channelId: this.currentChannel,
          data: audioData,
        });

        await new Promise((resolve) => setTimeout(resolve, 100));
      } catch (error) {
        console.error('Streaming error:', error);
        this.eventEmitter.emit('error', new Error('Failed to stream audio'));
        break;
      }
    }
  }

  private async playAudio(audioData: any) {
    try {
      if (this.sound) {
        await this.sound.unloadAsync();
      }

      const { sound } = await Audio.Sound.createAsync(
        { uri: audioData.uri },
        { shouldPlay: true }
      );
      this.sound = sound;

      await this.sound.playAsync();
      this.sound.setOnPlaybackStatusUpdate(async (status) => {
        if ('isLoaded' in status && status.isLoaded && status.didJustFinish) {
          await this.sound?.unloadAsync();
        }
      });
    } catch (error) {
      console.error('Playback error:', error);
      this.eventEmitter.emit('error', new Error('Failed to play audio'));
    }
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  /**
   * Initialize audio system
   */
  async initialize(): Promise<boolean> {
    try {
      const { granted } = await Audio.requestPermissionsAsync();
      if (!granted) {
        Alert.alert('Permission Required', 'Audio recording permission is needed');
        return false;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
      });

      return true;
    } catch (error) {
      console.error('Failed to initialize audio:', error);
      return false;
    }
  }

  /**
   * Start recording audio
   */
  async startRecording(): Promise<ExtendedRecording | null> {
    try {
      console.log('Starting recording...');
      
      // Track recording start time to enforce minimum duration
      const recordingStartTime = Date.now();
      
      // Clean up any existing recording
      if (this.recording) {
        await this.recording.stopAndUnloadAsync().catch(err => {
          console.error('Error stopping previous recording:', err);
        });
        this.recording = null;
      }

      // Request audio permissions
      const initialized = await this.initialize();
      if (!initialized) return null;

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
      this.recording = recording as ExtendedRecording;
      this.recording._startTime = recordingStartTime;
      
      console.log('Recording started successfully');
      return this.recording;
    } catch (err) {
      console.error('Failed to start recording:', err);
      Alert.alert('Recording Error', 'Could not start recording');
      return null;
    }
  }

  /**
   * Stop recording and handle the recorded audio
   */
  async stopRecording(channelId: string): Promise<string | null> {
    try {
      console.log('Stopping recording...');
      
      // Check if we have an active recording object
      if (!this.recording) {
        console.log('No active recording reference to stop');
        return null;
      }
      
      // Get reference to the recording before clearing it
      const recording = this.recording;
      const recordingStartTime = this.recording._startTime || 0;
      
      // Check if the recording duration is less than our minimum threshold
      const currentTime = Date.now();
      const recordingDuration = currentTime - recordingStartTime;
      
      if (recordingDuration < MIN_RECORDING_DURATION) {
        console.log(`Recording too short (${recordingDuration}ms), waiting before stopping...`);
        
        // Wait until we reach minimum duration
        const timeToWait = MIN_RECORDING_DURATION - recordingDuration;
        
        // Wait the minimum time before trying to stop recording
        await new Promise(resolve => setTimeout(resolve, timeToWait));
        console.log(`Waited ${timeToWait}ms, now stopping recording...`);
      }
      
      // Clear reference immediately to prevent double-stop attempts
      this.recording = null;
      
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
              return null;
            }
            
            // Re-throw other errors
            throw stopError;
          }
          
          // Get the recorded audio URI
          const uri = recording.getURI();
          console.log('Recording completed, URI:', uri);
          
          if (!uri) {
            console.error('No URI from recording');
            return null;
          }
          
          // Store the last recording URI for replay
          this.lastRecording = uri;
          
          // Load the sound for local playback
          const { sound: newSound } = await Audio.Sound.createAsync({ uri });
          this.sound = newSound;
          
          // Read the file into memory and upload it
          const fileInfo = await FileSystem.getInfoAsync(uri);
          console.log('File info:', fileInfo);
          
          if (fileInfo.exists && fileInfo.size > 0) {
            // Upload the audio file
            this.uploadAudioWithRetry(uri, channelId);
            return uri;
          } else {
            console.error('Audio file missing or empty');
            return null;
          }
        } else {
          console.error('Invalid recording object or missing stopAndUnloadAsync method');
          return null;
        }
      } catch (stopError) {
        console.error('Error stopping recording:', stopError);
        return null;
      }
    } catch (err) {
      console.error('Failed to stop recording:', err);
      return null;
    }
  }

  /**
   * Play the last recorded audio
   */
  async playLastRecording(): Promise<boolean> {
    if (!this.sound || !this.lastRecording) {
      return false;
    }
    
    try {
      await this.sound.playAsync();
      this.sound.setOnPlaybackStatusUpdate((status) => {
        if ('isLoaded' in status && status.isLoaded && !status.isPlaying) {
          console.log('Playback finished');
        }
      });
      return true;
    } catch (err) {
      console.error('Failed to play recording:', err);
      return false;
    }
  }

  /**
   * Play audio from a URI
   */
  async playAudio(uri: string): Promise<Audio.Sound | null> {
    try {
      // Force cleanup of previous sound
      if (this.sound) {
        try {
          await this.sound.unloadAsync();
          console.log('Unloaded previous sound');
        } catch (err) {
          console.error('Error unloading previous sound:', err);
        }
      }
      
      try {
        // Create and play sound
        const { sound: newSound } = await Audio.Sound.createAsync(
          { uri },
          { shouldPlay: true },
          (status) => {
            // This is a status update callback
            if ('isLoaded' in status && status.isLoaded) {
              if (status.didJustFinish) {
                console.log('Audio playback finished');
                this.sound?.unloadAsync().catch(err => 
                  console.error('Error unloading sound after playback:', err)
                );
                this.sound = null;
              }
            }
          }
        );
        
        this.sound = newSound;
        return newSound;
        
      } catch (playError) {
        console.error('Error creating or playing sound:', playError);
        
        // Attempt to play again with a different approach for Android
        try {
          console.log('Trying alternative playback method...');
          const soundObject = new Audio.Sound();
          await soundObject.loadAsync({ uri });
          await soundObject.playAsync();
          
          soundObject.setOnPlaybackStatusUpdate((status) => {
            if ('isLoaded' in status && status.isLoaded && !status.isPlaying) {
              console.log('Alternative audio playback finished');
              soundObject.unloadAsync().catch(err => 
                console.error('Error unloading alternative sound:', err)
              );
            }
          });
          
          this.sound = soundObject;
          return soundObject;
        } catch (altError) {
          console.error('Alternative playback failed:', altError);
          Alert.alert('Audio Error', 'Failed to play received audio');
          return null;
        }
      }
    } catch (error) {
      console.error('Error handling received audio:', error);
      return null;
    }
  }

  /**
   * Upload audio with retry capability and error handling
   */
  async uploadAudioWithRetry(uri: string, channelId: string, maxRetries = 3): Promise<boolean> {
    let retryCount = 0;
    let lastError = null;

    // Check if an upload was just performed
    const now = Date.now();
    const timeSinceLastUpload = now - this.lastUploadTime;
    
    if (timeSinceLastUpload < MIN_UPLOAD_INTERVAL && this.lastUploadTime > 0) {
      console.log(`Last upload was ${timeSinceLastUpload}ms ago, waiting before starting new upload...`);
      
      // Wait until the minimum interval has passed
      const timeToWait = MIN_UPLOAD_INTERVAL - timeSinceLastUpload;
      await new Promise(resolve => setTimeout(resolve, timeToWait));
      console.log(`Waited ${timeToWait}ms, now starting upload`);
    }
    
    // Update the last upload time
    this.lastUploadTime = Date.now();

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
        
        const uploadUrl = `${socketService.getSocketUrl()}/upload`;
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
          const fullAudioUrl = `${socketService.getSocketUrl()}${result.fileUrl}`;
          console.log('Full audio URL:', fullAudioUrl);
          
          socketService.sendAudioData(channelId, { uri: fullAudioUrl });
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
    socketService.sendPttStatus({
      channelId: channelId,
      status: false,
      message: 'Failed to upload audio'
    });
    
    // Return failure
    return false;
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    try {
      if (this.recording) {
        await this.recording.stopAndUnloadAsync()
          .catch(err => console.error('Error stopping recording during cleanup:', err));
        this.recording = null;
      }
      
      if (this.sound) {
        await this.sound.unloadAsync()
          .catch(err => console.error('Error unloading sound during cleanup:', err));
        this.sound = null;
      }
    } catch (err) {
      console.error('Error during audio cleanup:', err);
    }
  }

  /**
   * Get the last recording URI
   */
  getLastRecordingUri(): string | null {
    return this.lastRecording;
  }

  /**
   * Check if currently recording
   */
  isRecording(): boolean {
    return !!this.recording;
  }

  /**
   * Get the current sound object
   */
  getSound(): Audio.Sound | null {
    return this.sound;
  }
}

// Export as singleton
export const audioService = new AudioService();
export default audioService;
