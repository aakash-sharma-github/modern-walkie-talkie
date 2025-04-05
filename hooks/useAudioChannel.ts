import { useEffect, useRef, useState } from 'react';
import { Audio } from 'expo-av';
// Comment out Firebase imports since we're not using them
// import { ref, onValue, push, set } from 'firebase/database';
// import { database } from '../config/firebase';
import { Platform } from 'react-native';

// Define the Socket server URL the same way as in index.tsx
const SOCKET_SERVER_URL = Platform.select({
  ios: 'http://localhost:3000',
  android: 'http://10.0.2.2:3000', // Android emulator localhost
  default: 'http://localhost:3000',
});

export function useAudioChannel(frequency: number) {
  const [isRecording, setIsRecording] = useState(false);
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const frequencyRef = useRef<number>(frequency);
  const socketRef = useRef<any>(null);

  useEffect(() => {
    frequencyRef.current = frequency;

    // Comment out Firebase code
    /*
    // Listen for audio messages on the current frequency
    const messagesRef = ref(database, `frequencies/${frequency.toFixed(2)}/messages`);
    const unsubscribe = onValue(messagesRef, async (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const lastMessage = Object.values(data).pop() as { audioUrl: string };
        if (lastMessage?.audioUrl) {
          try {
            const { sound: newSound } = await Audio.Sound.createAsync(
              { uri: lastMessage.audioUrl },
              { shouldPlay: true }
            );
            setSound(newSound);
            setIsPlaying(true);
            
            newSound.setOnPlaybackStatusUpdate((status) => {
              if (status.isLoaded && !status.isPlaying) {
                setIsPlaying(false);
                newSound.unloadAsync();
              }
            });
          } catch (error) {
            console.error('Error playing audio:', error);
          }
        }
      }
    });
    */

    return () => {
      // unsubscribe(); // Comment out Firebase cleanup
      if (sound) {
        sound.unloadAsync();
      }
    };
  }, [frequency]);

  const startRecording = async () => {
    try {
      if (recordingRef.current) {
        await recordingRef.current.stopAndUnloadAsync();
        recordingRef.current = null;
      }

      await Audio.requestPermissionsAsync();
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
      });

      const { recording: newRecording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );

      recordingRef.current = newRecording;
      setIsRecording(true);
    } catch (err) {
      console.error('Failed to start recording:', err);
      setIsRecording(false);
      recordingRef.current = null;
    }
  };

  const stopRecording = async () => {
    try {
      if (!recordingRef.current || !isRecording) return;

      setIsRecording(false);
      const recording = recordingRef.current;
      recordingRef.current = null;

      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();

      if (uri) {
        // Comment out Firebase code
        /*
        // Upload the audio file to your server and get a public URL
        const response = await fetch(`${SOCKET_SERVER_URL}/upload`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            audioData: uri,
            frequency: frequencyRef.current.toFixed(2),
          }),
        });

        const { audioUrl } = await response.json();

        // Store the audio URL in Firebase
        const messagesRef = ref(database, `frequencies/${frequencyRef.current.toFixed(2)}/messages`);
        const newMessageRef = push(messagesRef);
        await set(newMessageRef, {
          timestamp: Date.now(),
          audioUrl,
        });
        */

        const { sound: newSound } = await Audio.Sound.createAsync({ uri });
        setSound(newSound);
      }
    } catch (err) {
      console.error('Failed to stop recording:', err);
    }
  };

  return {
    isRecording,
    isPlaying,
    sound,
    startRecording,
    stopRecording,
  };
}
