import { useState, useCallback, useEffect } from 'react';
import { Audio } from 'expo-av';
import audioService from '../services/AudioService';
import socketService from '../services/socketService';

/**
 * Custom hook for managing audio recording and playback
 */
export const useAudio = (
  frequency: number,
  setSpeakingUser: (userId: string | null) => void
) => {
  // Audio state
  const [isRecording, setIsRecording] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [lastRecording, setLastRecording] = useState<string | null>(null);

  /**
   * Ensures that the speaking user state is cleared after audio transmission
   */
  const forceClearSpeakingState = useCallback(
    (delay = 2000) => {
      // Clear speaking state after a delay
      setTimeout(() => {
        if (socketService.getSocketId()) {
          console.log(
            `[FIX] Force-clearing speaking state for self after ${delay}ms`
          );
          setSpeakingUser(null);
          setIsListening(false);

          // Also broadcast another PTT OFF status for reliability
          socketService.sendPttStatus({
            channelId: `freq-${frequency.toFixed(2)}`,
            status: false,
          });
        }
      }, delay);
    },
    [frequency, setSpeakingUser]
  );

  /**
   * Start recording audio when PTT button is pressed
   */
  const startRecording = useCallback(async () => {
    try {
      // Start the recording
      const recording = await audioService.startRecording();

      if (recording) {
        // Update UI state
        setIsRecording(true);
        setSpeakingUser(socketService.getSocketId());

        // Broadcast PTT ON status to others
        socketService.sendPttStatus({
          channelId: `freq-${frequency.toFixed(2)}`,
          status: true,
        });
      }
    } catch (err) {
      console.error('Failed to start recording:', err);
      setIsRecording(false);
      setSpeakingUser(null);
    }
  }, [frequency, setSpeakingUser]);

  /**
   * Stop recording and send audio to other users
   */
  const stopRecording = useCallback(async () => {
    try {
      // Update UI state first
      setIsRecording(false);
      setSpeakingUser(null);

      // Stop the recording and get URI
      const uri = await audioService.stopRecording(
        `freq-${frequency.toFixed(2)}`
      );

      if (uri) {
        // Store the last recording URI for replay
        setLastRecording(uri);

        // Upload the audio to server
        const uploadedUrl = await audioService.uploadAudio(
          uri,
          `freq-${frequency.toFixed(2)}`
        );

        if (uploadedUrl) {
          console.log(
            'Successfully uploaded audio, sending to channel:',
            uploadedUrl
          );
          // Send the audio data to the channel
          socketService.sendAudioData(`freq-${frequency.toFixed(2)}`, {
            uri: uploadedUrl,
          });
        } else {
          console.error('Failed to upload audio');
        }
      }

      // Send PTT OFF status regardless of recording success
      socketService.sendPttStatus({
        channelId: `freq-${frequency.toFixed(2)}`,
        status: false,
      });

      // Force clear speaking state to fix "stuck speaking" on Android
      forceClearSpeakingState();
    } catch (err) {
      console.error('Failed to stop recording:', err);

      // Reset UI state
      setIsRecording(false);
      setSpeakingUser(null);

      // Still send PTT OFF status
      socketService.sendPttStatus({
        channelId: `freq-${frequency.toFixed(2)}`,
        status: false,
      });

      // Force clear speaking state in error cases
      forceClearSpeakingState(500);
    }
  }, [frequency, forceClearSpeakingState, setSpeakingUser]);

  /**
   * Play back the last recorded message
   */
  const playLastRecording = useCallback(async () => {
    try {
      const success = await audioService.playLastRecording();
      if (success) {
        setIsPlaying(true);

        // Reset playing state when sound finishes
        const sound = audioService.getSound();
        if (sound) {
          sound.setOnPlaybackStatusUpdate((status: any) => {
            if ('isLoaded' in status && status.isLoaded && !status.isPlaying) {
              setIsPlaying(false);
            }
          });
        }
      }
    } catch (err) {
      console.error('Failed to play recording:', err);
      setIsPlaying(false);
    }
  }, []);

  /**
   * Handle received audio data
   */
  const handleAudioData = useCallback(
    async ({ userId, data }: { userId: string; data: any }) => {
      console.log('Received audio from:', userId);

      try {
        // Check if we have valid audio data
        if (!data || !data.uri) {
          console.error('Invalid audio data received');
          return;
        }

        // Normalize the audio URL to ensure it works on all devices
        let audioUrl = socketService.normalizeUrl(data.uri);
        console.log('Normalized audio URL:', audioUrl);

        // Clear any existing speaking user state to reset UI
        setSpeakingUser(null);
        setIsListening(true);

        // Play the audio
        const sound = await audioService.playAudio(audioUrl);

        if (sound) {
          setIsPlaying(true);

          // Add a backup timeout to clear listening state if status updates fail
          setTimeout(() => {
            setIsListening(false);
          }, 10000); // Max message length of 10 seconds
        } else {
          setIsListening(false);
        }
      } catch (error) {
        console.error('Error handling received audio:', error);
        setIsListening(false);
      }
    },
    [setSpeakingUser]
  );

  /**
   * Handle PTT status updates
   */
  const handlePTTStatus = useCallback(
    ({ userId, status }: { userId: string; status: boolean }) => {
      console.log(`User ${userId} PTT status:`, status);

      // Update UI regardless of the sender (including ourselves)
      if (status) {
        // Someone started talking
        setSpeakingUser(userId);
        setIsListening(true);
      } else {
        // Someone stopped talking - only clear if it's the same user
        if (userId === socketService.getSocketId()) {
          console.log(`Clearing speaking status for self ${userId}`);
          setSpeakingUser(null);
          setIsListening(false);
        }
      }

      // Force UI update if user stops talking
      if (!status && userId !== socketService.getSocketId()) {
        // Mark inactive for this user - helps Android devices sync
        setTimeout(() => {
          console.log(`Forcing clear of speaking status for ${userId}`);
          setSpeakingUser(null);
          setIsListening(false);
        }, 300);
      }
    },
    [setSpeakingUser]
  );

  // Cleanup audio resources on unmount
  useEffect(() => {
    return () => {
      audioService.cleanup();
    };
  }, []);

  return {
    isRecording,
    isPlaying,
    isListening,
    lastRecording,
    startRecording,
    stopRecording,
    playLastRecording,
    handleAudioData,
    handlePTTStatus,
    setIsPlaying,
    setIsListening,
  };
};

export default useAudio;
