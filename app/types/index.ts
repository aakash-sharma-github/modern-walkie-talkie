import { Audio } from 'expo-av';

// Extended Recording type with our custom properties
export interface ExtendedRecording extends Audio.Recording {
  _startTime?: number;
}

// Socket service related types
export interface AudioData {
  uri: string;
}

export interface PttStatusData {
  channelId: string;
  status: boolean;
  message?: string;
}

export interface JoinConfirmationData {
  channelId: string;
  success: boolean;
  error?: string;
}

export interface SocketEventHandlers {
  audioData: (data: { userId: string; data: AudioData }) => void;
  pttStatus: (data: { userId: string; status: boolean }) => void;
  userJoined: (userId: string) => void;
  userLeft: (userId: string) => void;
  activeUsers: (users: string[]) => void;
  joinConfirmation: (data: JoinConfirmationData) => void;
  pong: () => void;
  connect: () => void;
  disconnect: (reason: string) => void;
  connect_error: (error: Error) => void;
  reconnect_attempt: (attempt: number) => void;
  reconnect: (attempt: number) => void;
}
