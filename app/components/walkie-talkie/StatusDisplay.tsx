import React from "react";
import { View, Text, StyleSheet } from "react-native";

interface StatusDisplayProps {
  isRecording: boolean;
  isPlaying: boolean;
  isListening: boolean;
  speakingUser: string | null;
  isJoined: boolean;
  isConnected: boolean;
}

/**
 * Status Display component
 * Shows current status of the walkie talkie (recording, listening, idle)
 */
const StatusDisplay: React.FC<StatusDisplayProps> = ({
  isRecording,
  isPlaying,
  isListening,
  speakingUser,
  isJoined,
  isConnected
}) => {
  // Determine the current status text based on app state
  const getStatusText = () => {
    if (isRecording) {
      return "Broadcasting...";
    } else if (speakingUser) {
      return "Someone is talking...";
    } else if (isPlaying || isListening) {
      return "Receiving...";
    } else if (isJoined) {
      return "Connected - Ready";
    } else if (isConnected) {
      return "Not Joined - Select a Channel";
    } else {
      return "Disconnected - Check Network";
    }
  };

  return (
    <View style={styles.statusContainer}>
      <View
        style={[
          styles.statusDot,
          (isRecording || isPlaying || isListening) && styles.statusDotActive,
          isJoined &&
            !isRecording &&
            !isPlaying &&
            !isListening &&
            styles.statusDotJoined
        ]}
      />
      <Text style={styles.statusText}>
        {getStatusText()}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  statusContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    padding: 12,
    borderRadius: 20,
    alignSelf: "center"
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#71717a",
    marginRight: 8
  },
  statusDotActive: {
    backgroundColor: "#22c55e"
  },
  statusDotJoined: {
    backgroundColor: "#6366f1"
  },
  statusText: {
    fontFamily: "Inter_400Regular",
    color: "#fff",
    fontSize: 16
  }
});

export default StatusDisplay;
