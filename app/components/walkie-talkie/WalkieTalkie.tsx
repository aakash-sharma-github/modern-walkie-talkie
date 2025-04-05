import React, { useState, useEffect } from "react";
import { View, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams } from "expo-router";

// Components
import FrequencyControl from "./FrequencyControl";
import StatusDisplay from "./StatusDisplay";
import ConnectionControl from "./ConnectionControl";
import UsersList from "./UsersList";
import AudioPlayback from "./AudioPlayback";
import PTTButton from "./PTTButton";

// Hooks and services
import useSocket from "../../hooks/useSocket";
import useAudio from "../../hooks/useAudio";
import socketService from "../../services/socketService";

/**
 * Main Walkie Talkie Component
 * Combines all sub-components and manages application state
 */
const WalkieTalkie: React.FC = () => {
  // Get frequency from URL params or use default
  const params = useLocalSearchParams();
  const [frequency, setFrequency] = useState(
    params.frequency ? parseFloat(params.frequency as string) : 446.0
  );

  // Socket hook for managing connection and users
  const {
    isConnected,
    isJoined,
    connectionError,
    activeUsers,
    speakingUser,
    mySocketId,
    reconnectServer,
    joinFrequencyChannel,
    setSpeakingUser
  } = useSocket(frequency);

  // Audio hook for managing recording and playback
  const {
    isRecording,
    isPlaying,
    isListening,
    lastRecording,
    startRecording,
    stopRecording,
    playLastRecording,
    handleAudioData,
    handlePTTStatus
  } = useAudio(frequency, setSpeakingUser);

  // Setup audio and PTT event handlers
  useEffect(
    () => {
      if (isConnected) {
        const socket = socketService.initialize();

        // Set up audio data handler
        socket.on("audioData", handleAudioData);

        // Set up PTT status handler
        socket.on("pttStatus", handlePTTStatus);

        // Clean up on unmount
        return () => {
          socket.off("audioData", handleAudioData);
          socket.off("pttStatus", handlePTTStatus);
        };
      }
    },
    [isConnected, handleAudioData, handlePTTStatus]
  );

  // Handle frequency changes from URL
  useEffect(
    () => {
      if (params.frequency) {
        setFrequency(parseFloat(params.frequency as string));
      }
    },
    [params.frequency]
  );

  return (
    <SafeAreaView style={styles.container}>
      <LinearGradient
        colors={["#1a1b1e", "#2d2e32"]}
        style={styles.background}
      />

      <View style={styles.header}>
        <FrequencyControl
          frequency={frequency}
          onFrequencyChange={setFrequency}
          isJoined={isJoined}
        />

        <ConnectionControl
          isConnected={isConnected}
          isJoined={isJoined}
          connectionError={connectionError}
          onReconnect={reconnectServer}
          onJoinChannel={() => joinFrequencyChannel(frequency)}
          socketUrl={socketService.getSocketUrl()}
          frequency={frequency}
        />
      </View>

      <View style={styles.content}>
        <StatusDisplay
          isRecording={isRecording}
          isPlaying={isPlaying}
          isListening={isListening}
          isJoined={isJoined}
          isConnected={isConnected}
          speakingUser={speakingUser}
        />

        {isJoined &&
          <UsersList
            activeUsers={activeUsers}
            currentUserId={mySocketId}
            speakingUser={speakingUser}
          />}

        <AudioPlayback
          lastRecording={lastRecording}
          isPlaying={isPlaying}
          isListening={isListening}
          speakingUser={speakingUser}
          onPlayback={playLastRecording}
        />

        <PTTButton
          onPressIn={startRecording}
          onPressOut={stopRecording}
          isDisabled={!isJoined}
          isRecording={isRecording}
          isJoined={isJoined}
          speakingUser={speakingUser}
          currentUserId={mySocketId}
        />
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1
  },
  background: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0
  },
  header: {
    padding: 20,
    alignItems: "center"
  },
  content: {
    flex: 1,
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 40
  }
});

export default WalkieTalkie;
