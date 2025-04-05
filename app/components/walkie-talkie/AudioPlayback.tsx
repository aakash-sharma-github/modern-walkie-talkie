import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Volume2 } from "lucide-react-native";

interface AudioPlaybackProps {
  lastRecording: string | null;
  isPlaying: boolean;
  isListening: boolean;
  speakingUser: string | null;
  onPlayback: () => void;
}

/**
 * Audio Playback component
 * Allows replaying the last received message
 */
const AudioPlayback: React.FC<AudioPlaybackProps> = ({
  lastRecording,
  isPlaying,
  isListening,
  speakingUser,
  onPlayback
}) => {
  // Do not render if there is no recording available
  if (!lastRecording) {
    return null;
  }

  // Check if playback should be disabled
  const isDisabled = isPlaying || isListening || Boolean(speakingUser);

  return (
    <Pressable
      style={styles.playbackContainer}
      onPress={onPlayback}
      disabled={isDisabled}
    >
      <Volume2 size={24} color={isDisabled ? "#71717a" : "#6366f1"} />
      <Text style={[styles.playbackText, isDisabled && { opacity: 0.5 }]}>
        {isPlaying ? "Playing..." : "Last Message Available"}
      </Text>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  playbackContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    padding: 12,
    borderRadius: 20,
    marginVertical: 12
  },
  playbackText: {
    fontFamily: "Inter_400Regular",
    color: "#fff",
    fontSize: 16,
    marginLeft: 8
  }
});

export default AudioPlayback;
