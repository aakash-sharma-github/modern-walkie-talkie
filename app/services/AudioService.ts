import { Audio } from 'expo-av';
import io, { Socket } from 'socket.io-client';
import { Platform } from 'react-native';
import EventEmitter from 'eventemitter3';
import WalkieTalkie from '../components/WalkieTalkie';

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

class AudioService {
  private socket: Socket | null = null;
  private recording: Audio.Recording | null = null;
  private sound: Audio.Sound | null = null;
  private currentChannel: string | null = null;
  private isPTTActive = false;
  private eventEmitter: EventEmitter<AudioEvents>;

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
}

export default new AudioService();
