import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Radio } from "lucide-react-native";

interface UsersListProps {
  activeUsers: string[];
  currentUserId: string | null;
  speakingUser: string | null;
}

/**
 * Users List component
 * Displays users on the current frequency
 */
const UsersList: React.FC<UsersListProps> = ({
  activeUsers,
  currentUserId,
  speakingUser
}) => {
  return (
    <View style={styles.usersContainer}>
      <Text style={styles.usersTitle}>
        Users on frequency: {activeUsers.length}
      </Text>

      <View style={styles.usersList}>
        {activeUsers.map(userId =>
          <View
            key={userId}
            style={[
              styles.userBadge,
              userId === currentUserId && styles.currentUserBadge,
              userId === speakingUser && styles.speakingUserBadge
            ]}
          >
            <Text style={styles.userBadgeText}>
              {userId === currentUserId
                ? "You"
                : `User-${userId.substring(0, 4)}`}
              {userId === speakingUser && " (Speaking)"}
            </Text>
          </View>
        )}
      </View>

      {activeUsers.length === 0 &&
        <Text style={styles.noUsersText}>
          No users found on this frequency
        </Text>}

      {speakingUser &&
        <View style={styles.speakingStatusContainer}>
          <Radio size={16} color="#22c55e" />
          <Text style={styles.speakingStatusText}>
            {speakingUser === currentUserId
              ? "You are transmitting"
              : "Someone is transmitting"}
          </Text>
        </View>}
    </View>
  );
};

const styles = StyleSheet.create({
  usersContainer: {
    alignItems: "center",
    width: "100%"
  },
  usersTitle: {
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
    fontSize: 14,
    opacity: 0.8
  },
  usersList: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    marginTop: 8,
    maxWidth: "90%"
  },
  userBadge: {
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    margin: 4
  },
  currentUserBadge: {
    backgroundColor: "rgba(99, 102, 241, 0.2)"
  },
  speakingUserBadge: {
    backgroundColor: "rgba(34, 197, 94, 0.2)"
  },
  userBadgeText: {
    fontFamily: "Inter_500Medium",
    color: "#fff",
    fontSize: 12
  },
  noUsersText: {
    fontFamily: "Inter_400Regular",
    color: "rgba(255, 255, 255, 0.6)",
    fontSize: 14,
    marginTop: 8,
    fontStyle: "italic"
  },
  speakingStatusContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(34, 197, 94, 0.2)",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginTop: 8
  },
  speakingStatusText: {
    fontFamily: "Inter_500Medium",
    color: "#fff",
    fontSize: 13,
    marginLeft: 6
  }
});

export default UsersList;
