import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import WalkieTalkie from "../components/walkie-talkie/WalkieTalkie";

/**
 * Main Walkie Talkie screen
 * Renders the walkie talkie component with a header
 */
export default function TalkScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <LinearGradient
        colors={["#1a1b1e", "#2d2e32"]}
        style={styles.background}
      />

      <Text style={styles.title}>Walkie Talkie</Text>

      <WalkieTalkie />
    </SafeAreaView>
  );
}

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
  title: {
    fontFamily: "Inter_700Bold",
    fontSize: 24,
    color: "#fff",
    marginVertical: 20,
    textAlign: "center"
  }
});
