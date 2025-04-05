import React from "react";
import { Pressable, Text, StyleSheet } from "react-native";
import { Mic } from "lucide-react-native";
import Animated, {
  useAnimatedStyle,
  withSequence,
  withSpring,
  withTiming,
  useSharedValue
} from "react-native-reanimated";

interface PTTButtonProps {
  onPressIn: () => void;
  onPressOut: () => void;
  isDisabled: boolean;
  isRecording: boolean;
  isJoined: boolean;
  speakingUser: string | null;
  currentUserId: string | null;
}

/**
 * PTT (Push-to-Talk) Button component
 * Main control for the walkie talkie
 */
const PTTButton: React.FC<PTTButtonProps> = ({
  onPressIn,
  onPressOut,
  isDisabled,
  isRecording,
  isJoined,
  speakingUser,
  currentUserId
}) => {
  // Animation scale value for button press effect
  const buttonScale = useSharedValue(1);

  // Handle button press animation
  const handlePressIn = () => {
    buttonScale.value = withSequence(withSpring(0.95), withSpring(1));
    onPressIn();
  };

  // Handle button release animation
  const handlePressOut = () => {
    buttonScale.value = withTiming(1);
    onPressOut();
  };

  // Animated style for the button
  const animatedButtonStyle = useAnimatedStyle(() => ({
    transform: [{ scale: buttonScale.value }]
  }));

  // Determine button text based on current state
  const getButtonText = () => {
    if (!isJoined) {
      return "Join a frequency first";
    } else if (isRecording) {
      return "Release to Send";
    } else if (speakingUser && speakingUser !== currentUserId) {
      return "Someone is talking...";
    } else {
      return "Hold to Talk";
    }
  };

  return (
    <Animated.View style={[styles.talkButtonContainer, animatedButtonStyle]}>
      <Pressable
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={isDisabled}
        style={({ pressed }) => [
          styles.talkButton,
          pressed && styles.talkButtonPressed,
          isRecording && styles.talkButtonActive,
          isDisabled && styles.talkButtonDisabled
        ]}
      >
        <Mic size={32} color="#fff" />
        <Text style={styles.talkButtonText}>
          {getButtonText()}
        </Text>
      </Pressable>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  talkButtonContainer: {
    marginBottom: 40,
    alignSelf: "center"
  },
  talkButton: {
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: "#6366f1",
    justifyContent: "center",
    alignItems: "center"
  },
  talkButtonPressed: {
    backgroundColor: "#4f46e5"
  },
  talkButtonActive: {
    backgroundColor: "#4f46e5"
  },
  talkButtonDisabled: {
    backgroundColor: "#71717a",
    opacity: 0.7
  },
  talkButtonText: {
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
    marginTop: 12,
    fontSize: 16,
    textAlign: "center"
  }
});

export default PTTButton;
