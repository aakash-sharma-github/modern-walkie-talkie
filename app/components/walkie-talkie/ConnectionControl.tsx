import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";

interface ConnectionControlProps {
  isConnected: boolean;
  isJoined: boolean;
  connectionError: string | null;
  onReconnect: () => void;
  onJoinChannel: () => void;
  socketUrl: string;
  frequency: number;
}

/**
 * Connection Control component
 * Manages server connection and channel joins
 */
const ConnectionControl: React.FC<ConnectionControlProps> = ({
  isConnected,
  isJoined,
  connectionError,
  onReconnect,
  onJoinChannel,
  socketUrl,
  frequency
}) => {
  return (
    <View style={styles.container}>
      {/* Connection status */}
      <Text style={styles.connectionStatus}>
        {isConnected
          ? isJoined
            ? `Connected to ${socketUrl}`
            : "Connected, not joined to channel"
          : "Disconnected from server"}
      </Text>

      {/* Error message if any */}
      {connectionError &&
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>
            {connectionError}
          </Text>
        </View>}

      {/* Connection buttons based on state */}
      {!isConnected
        ? <Pressable style={styles.connectButton} onPress={onReconnect}>
            <Text style={styles.connectButtonText}>Reconnect to Server</Text>
          </Pressable>
        : !isJoined
          ? <Pressable style={styles.joinButton} onPress={onJoinChannel}>
              <Text style={styles.joinButtonText}>
                Join Frequency {frequency.toFixed(2)}
              </Text>
            </Pressable>
          : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    width: "100%"
  },
  connectionStatus: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: "rgba(255, 255, 255, 0.6)",
    marginBottom: 8
  },
  errorContainer: {
    backgroundColor: "rgba(239, 68, 68, 0.2)",
    padding: 10,
    borderRadius: 10,
    marginBottom: 8,
    maxWidth: "90%"
  },
  errorText: {
    fontFamily: "Inter_500Medium",
    color: "#ef4444",
    fontSize: 14,
    textAlign: "center"
  },
  connectButton: {
    backgroundColor: "#6366f1",
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
    marginBottom: 12
  },
  connectButtonText: {
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
    fontSize: 16
  },
  joinButton: {
    backgroundColor: "#6366f1",
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
    marginBottom: 12
  },
  joinButtonText: {
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
    fontSize: 16
  }
});

export default ConnectionControl;
