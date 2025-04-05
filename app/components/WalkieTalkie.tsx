import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Pressable,
  Alert,
  Vibration
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import * as Haptics from "expo-haptics";
import AudioService from "../services/AudioService";

interface WalkieTalkieProps {
  channelId: string;
  username: string;
}

export default function WalkieTalkie({
  channelId,
  username
}: WalkieTalkieProps) {
  const [isConnected, setIsConnected] = useState(false);
  const [activeUsers, setActiveUsers] = useState<string[]>([]);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [whoIsSpeaking, setWhoIsSpeaking] = useState<string | null>(null);

  useEffect(
    () => {
      // Set up event listeners
      AudioService.on("connection:status", handleConnectionStatus);
      AudioService.on("user:joined", handleUserJoined);
      AudioService.on("user:left", handleUserLeft);
      AudioService.on("ptt:status", handlePTTStatus);
      AudioService.on("error", handleError);

      // Initialize channel connection
      initializeChannel();

      // Cleanup
      return () => {
        AudioService.off("connection:status", handleConnectionStatus);
        AudioService.off("user:joined", handleUserJoined);
        AudioService.off("user:left", handleUserLeft);
        AudioService.off("ptt:status", handlePTTStatus);
        AudioService.off("error", handleError);
        AudioService.leaveChannel();
      };
    },
    [channelId]
  );

  const initializeChannel = async () => {
    try {
      await AudioService.joinChannel(channelId);
    } catch (error) {
      Alert.alert("Error", "Failed to join channel");
    }
  };

  // Event handlers
  const handleConnectionStatus = (status: boolean) => {
    setIsConnected(status);
  };

  const handleUserJoined = (userId: string) => {
    setActiveUsers(prev => [...prev, userId]);
  };

  const handleUserLeft = (userId: string) => {
    setActiveUsers(prev => prev.filter(id => id !== userId));
  };

  const handlePTTStatus = ({
    userId,
    status
  }: {
    userId: string;
    status: boolean;
  }) => {
    if (status) {
      setWhoIsSpeaking(userId);
    } else if (whoIsSpeaking === userId) {
      setWhoIsSpeaking(null);
    }
  };

  const handleError = (error: Error) => {
    Alert.alert("Error", error.message);
  };

  // PTT handlers
  const handlePTTStart = async () => {
    try {
      await AudioService.startPTT();
      setIsSpeaking(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      Vibration.vibrate(100);
    } catch (error) {
      Alert.alert("Error", "Failed to start PTT");
    }
  };

  const handlePTTEnd = async () => {
    try {
      await AudioService.endPTT();
      setIsSpeaking(false);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (error) {
      Alert.alert("Error", "Failed to end PTT");
    }
  };

  return (
    <View style={styles.container}>
      <BlurView intensity={20} style={styles.blurContainer}>
        <LinearGradient
          colors={["rgba(255,255,255,0.2)", "rgba(255,255,255,0.1)"]}
          style={styles.gradientContainer}
        >
          {/* Channel Info */}
          <View style={styles.channelInfo}>
            <Text style={styles.channelTitle}>
              Channel: {channelId}
            </Text>
            <Text style={styles.statusText}>
              {isConnected ? "🟢 Connected" : "🔴 Disconnected"}
            </Text>
          </View>

          {/* Active Users */}
          <View style={styles.usersContainer}>
            <Text style={styles.usersTitle}>Active Users:</Text>
            {activeUsers.map(user =>
              <Text
                key={user}
                style={[
                  styles.userItem,
                  user === whoIsSpeaking && styles.speakingUser
                ]}
              >
                {user === whoIsSpeaking ? "🎤 " : "👤 "}
                {user === username ? `${user} (You)` : user}
              </Text>
            )}
          </View>

          {/* PTT Button */}
          <Pressable
            onPressIn={handlePTTStart}
            onPressOut={handlePTTEnd}
            style={({ pressed }) => [
              styles.pttButton,
              pressed && styles.pttButtonPressed,
              isSpeaking && styles.pttButtonActive
            ]}
          >
            <View style={styles.pttButtonInner}>
              <Text style={styles.pttButtonText}>
                {isSpeaking ? "SPEAKING" : "HOLD TO TALK"}
              </Text>
            </View>
          </Pressable>
        </LinearGradient>
      </BlurView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000"
  },
  blurContainer: {
    flex: 1,
    overflow: "hidden"
  },
  gradientContainer: {
    flex: 1,
    padding: 20,
    justifyContent: "space-between"
  },
  channelInfo: {
    marginBottom: 20
  },
  channelTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#fff",
    marginBottom: 8
  },
  statusText: {
    fontSize: 16,
    color: "#fff",
    opacity: 0.8
  },
  usersContainer: {
    flex: 1,
    marginVertical: 20
  },
  usersTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#fff",
    marginBottom: 12
  },
  userItem: {
    fontSize: 16,
    color: "#fff",
    opacity: 0.9,
    marginVertical: 4,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8
  },
  speakingUser: {
    backgroundColor: "rgba(0, 255, 0, 0.2)",
    opacity: 1
  },
  pttButton: {
    width: 200,
    height: 200,
    borderRadius: 100,
    alignSelf: "center",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderWidth: 2,
    borderColor: "rgba(255, 255, 255, 0.2)"
  },
  pttButtonPressed: {
    transform: [{ scale: 0.95 }],
    backgroundColor: "rgba(0, 255, 0, 0.2)"
  },
  pttButtonActive: {
    backgroundColor: "rgba(0, 255, 0, 0.3)",
    borderColor: "rgba(0, 255, 0, 0.5)"
  },
  pttButtonInner: {
    width: 180,
    height: 180,
    borderRadius: 90,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)"
  },
  pttButtonText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "600"
  }
});
