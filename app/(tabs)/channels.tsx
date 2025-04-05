import { View, Text, StyleSheet, FlatList, Pressable } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import { Radio, ArrowRight } from "lucide-react-native";
import { useRouter } from "expo-router";
import { useState } from "react";

const channels = [
  { id: "1", name: "General", frequency: 446.0 },
  { id: "2", name: "Emergency", frequency: 446.1 },
  { id: "3", name: "Team Alpha", frequency: 446.2 },
  { id: "4", name: "Team Beta", frequency: 446.3 },
  { id: "5", name: "Operations", frequency: 446.4 }
];

export default function ChannelsScreen() {
  const router = useRouter();
  const [selectedChannel, setSelectedChannel] = useState<string | null>(null);

  const handleChannelSelect = (channel: typeof channels[0]) => {
    setSelectedChannel(channel.id);
  };

  const handleJoinChannel = (channel: typeof channels[0]) => {
    router.push({
      pathname: "/",
      params: { frequency: channel.frequency.toFixed(2) }
    });
  };

  return (
    <SafeAreaView style={styles.container}>
      <LinearGradient
        colors={["#1a1b1e", "#2d2e32"]}
        style={styles.background}
      />

      <View style={styles.header}>
        <Text style={styles.title}>Channels</Text>
        <Text style={styles.subtitle}>
          Select a channel and tap Join to start communicating
        </Text>
      </View>

      <FlatList
        data={channels}
        keyExtractor={item => item.id}
        renderItem={({ item }) =>
          <Pressable
            style={[
              styles.channelItem,
              selectedChannel === item.id && styles.channelItemSelected
            ]}
            onPress={() => handleChannelSelect(item)}
          >
            <Radio
              size={24}
              color={selectedChannel === item.id ? "#6366f1" : "#71717a"}
            />
            <View style={styles.channelInfo}>
              <Text
                style={[
                  styles.channelName,
                  selectedChannel === item.id && styles.channelNameSelected
                ]}
              >
                {item.name}
              </Text>
              <Text
                style={[
                  styles.channelFreq,
                  selectedChannel === item.id && styles.channelFreqSelected
                ]}
              >
                {item.frequency.toFixed(2)} MHz
              </Text>
            </View>
            <Pressable
              style={[
                styles.joinButton,
                selectedChannel === item.id && styles.joinButtonHighlighted
              ]}
              onPress={() => handleJoinChannel(item)}
            >
              <Text style={styles.joinButtonText}>Join</Text>
              <ArrowRight size={16} color="white" />
            </Pressable>
          </Pressable>}
        contentContainerStyle={styles.listContent}
      />
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
  header: {
    padding: 20
  },
  title: {
    fontFamily: "Inter_700Bold",
    fontSize: 24,
    color: "#fff",
    marginBottom: 8
  },
  subtitle: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: "#9ca3af",
    marginBottom: 8
  },
  listContent: {
    padding: 20
  },
  channelItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    padding: 16,
    borderRadius: 12,
    marginBottom: 12
  },
  channelItemSelected: {
    backgroundColor: "rgba(99, 102, 241, 0.2)"
  },
  channelInfo: {
    marginLeft: 16,
    flex: 1
  },
  channelName: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 16,
    color: "#fff",
    marginBottom: 4
  },
  channelNameSelected: {
    color: "#fff"
  },
  channelFreq: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: "#71717a"
  },
  channelFreqSelected: {
    color: "#6366f1"
  },
  joinButton: {
    backgroundColor: "#6366f1",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center"
  },
  joinButtonHighlighted: {
    backgroundColor: "#4f46e5"
  },
  joinButtonText: {
    color: "white",
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    marginRight: 6
  }
});
