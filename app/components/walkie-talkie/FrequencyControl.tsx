import React, { useState } from "react";
import { View, Text, Pressable, TextInput, StyleSheet } from "react-native";
import { ChevronUp, ChevronDown } from "lucide-react-native";

// Frequency settings
const MIN_FREQUENCY = 446.0;
const MAX_FREQUENCY = 447.0;
const STEP = 0.05;

interface FrequencyControlProps {
  frequency: number;
  isJoined: boolean;
  onFrequencyChange: (newFrequency: number) => void;
}

/**
 * Frequency Control component
 * Allows users to tune the walkie talkie frequency
 */
const FrequencyControl: React.FC<FrequencyControlProps> = ({
  frequency,
  isJoined,
  onFrequencyChange
}) => {
  const [isEditing, setIsEditing] = useState(false);

  /**
   * Increment the current frequency
   */
  const incrementFrequency = () => {
    if (frequency + STEP <= MAX_FREQUENCY) {
      onFrequencyChange(+(frequency + STEP).toFixed(2));
    }
  };

  /**
   * Decrement the current frequency
   */
  const decrementFrequency = () => {
    if (frequency - STEP >= MIN_FREQUENCY) {
      onFrequencyChange(+(frequency - STEP).toFixed(2));
    }
  };

  /**
   * Handle manual frequency input
   */
  const handleFrequencyChange = (text: string) => {
    const value = parseFloat(text);
    if (!isNaN(value) && value >= MIN_FREQUENCY && value <= MAX_FREQUENCY) {
      onFrequencyChange(value);
    }
  };

  return (
    <View
      style={[
        styles.frequencyContainer,
        isJoined && styles.frequencyContainerActive
      ]}
    >
      <Pressable onPress={decrementFrequency} style={styles.frequencyButton}>
        <ChevronDown size={24} color={isJoined ? "#22c55e" : "#6366f1"} />
      </Pressable>

      <Pressable
        onPress={() => setIsEditing(true)}
        style={styles.frequencyDisplay}
      >
        {isEditing
          ? <TextInput
              style={[
                styles.frequencyInput,
                isJoined && styles.frequencyInputActive
              ]}
              value={frequency.toFixed(2)}
              onChangeText={handleFrequencyChange}
              onBlur={() => setIsEditing(false)}
              keyboardType="decimal-pad"
              autoFocus
              selectTextOnFocus
            />
          : <Text
              style={[styles.frequency, isJoined && styles.frequencyActive]}
            >
              {frequency.toFixed(2)} MHz
            </Text>}
      </Pressable>

      <Pressable onPress={incrementFrequency} style={styles.frequencyButton}>
        <ChevronUp size={24} color={isJoined ? "#22c55e" : "#6366f1"} />
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  frequencyContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 20,
    padding: 8
  },
  frequencyContainerActive: {
    borderColor: "#22c55e",
    borderWidth: 1
  },
  frequencyButton: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 20,
    backgroundColor: "rgba(255, 255, 255, 0.05)"
  },
  frequencyDisplay: {
    paddingHorizontal: 20,
    minWidth: 120,
    alignItems: "center"
  },
  frequency: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 18,
    color: "#6366f1"
  },
  frequencyActive: {
    color: "#22c55e"
  },
  frequencyInput: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 18,
    color: "#6366f1",
    textAlign: "center",
    minWidth: 100,
    padding: 0
  },
  frequencyInputActive: {
    color: "#22c55e"
  }
});

export default FrequencyControl;
