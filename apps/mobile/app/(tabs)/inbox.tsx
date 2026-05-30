import { SafeAreaView } from "react-native-safe-area-context";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Image,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { useRouter } from "expo-router";
import { getConversations } from "@/context/ChatContext";

const DEFAULT_AVATAR =
  "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=100&q=80";

type InboxChat = {
  id: string;
  type: string;
  name: string;
  avatar: string;
  lastMessage: string;
  timeElapsed: string;
  day: string;
  time: string;
  unread: boolean;
};

function formatChatTimestamps(iso: string | null | undefined) {
  if (!iso) return { day: "", time: "", timeElapsed: "" };
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  let timeElapsed = "Just now";
  if (diffMins >= 1 && diffMins < 60) timeElapsed = `${diffMins}m ago`;
  else if (diffHours >= 1 && diffHours < 24) timeElapsed = `${diffHours}h ago`;
  else if (diffDays >= 1) timeElapsed = `${diffDays}d ago`;

  return {
    day: date.toLocaleDateString(undefined, { weekday: "short" }),
    time: date.toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    }),
    timeElapsed,
  };
}

function toInboxChat(row: {
  id: string;
  type: string;
  name: string | null;
  photo: string | null;
  last_message: string | null;
  last_message_at: string | null;
  conversation_members?: { last_read_at: string | null }[];
}): InboxChat {
  const { day, time, timeElapsed } = formatChatTimestamps(row.last_message_at);
  const lastReadAt = row.conversation_members?.[0]?.last_read_at;
  const unread =
    !!row.last_message_at &&
    (!lastReadAt ||
      new Date(row.last_message_at) > new Date(lastReadAt));

  return {
    id: row.id,
    type: row.type,
    name: row.name ?? "Chat",
    avatar: row.photo || DEFAULT_AVATAR,
    lastMessage: row.last_message ?? "",
    day,
    time,
    timeElapsed,
    unread,
  };
}

export default function Inbox() {
  const [selectedFilter, setSelectedFilter] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [chats, setChats] = useState<InboxChat[]>([]);
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const rows = await getConversations();
      if (!cancelled) {
        setChats((rows ?? []).map(toInboxChat));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>Chat</Text>
      </View>

      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color="#555555" />
        <TextInput
          placeholder="Look Up People"
          placeholderTextColor="#555555"
          style={[styles.searchInput, { fontWeight: 'bold' }]} // Add bold weight
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      <View style={styles.filterContainer}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.filterScrollView}
          contentContainerStyle={styles.filterRow}
        >
          {["All", "Group", "1-1"].map((filter) => {
            const active = selectedFilter === filter;
            return (
              <TouchableOpacity
                key={filter}
                onPress={() => setSelectedFilter(filter)}
                style={[styles.filterPill, active && styles.filterPillActive]}
              >
                <Text
                  style={[styles.filterText, active && styles.filterTextActive]}
                >
                  {filter}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.chatList}
        style={styles.ticketsScrollView}
        key={selectedFilter}
      >
        {selectedFilter === "Group"
          ? chats
              .filter((chat) => chat.type === "group")
              .filter(
                (chat) =>
                  searchQuery === "" ||
                  chat.name.toLowerCase().includes(searchQuery.toLowerCase())
              )
              .map((chat) => (
                <ChatItem key={chat.id} chat={chat} router={router} />
              ))
          : selectedFilter === "1-1"
            ? chats
                .filter((chat) => chat.type === "private")
                .filter(
                  (chat) =>
                    searchQuery === "" ||
                    chat.name.toLowerCase().includes(searchQuery.toLowerCase())
                )
                .map((chat) => (
                  <ChatItem key={chat.id} chat={chat} router={router} />
                ))
            : chats
                .filter(
                  (chat) =>
                    searchQuery === "" ||
                    chat.name.toLowerCase().includes(searchQuery.toLowerCase())
                )
                .map((chat) => (
                  <ChatItem key={chat.id} chat={chat} router={router} />
                ))}
      </ScrollView>
    </SafeAreaView>
  );
}

function ChatItem({
  chat,
  router,
}: {
  chat: InboxChat;
  router: ReturnType<typeof useRouter>;
}) {
  const isUnread = chat.unread;
  const isGroupChat = chat.type === "group";
  
  return (
    <TouchableOpacity 
      style={styles.chatItem}
      onPress={() => isGroupChat ? router.push({ pathname: "/(tabs)/groupchat", params: { id: chat.id} }) : router.push({ pathname: "/(tabs)/chat", params: { id: chat.id }})}
    >
      <Image source={{ uri: chat.avatar }} style={styles.avatar} />
      <View style={styles.chatContent}>
        <Text style={styles.chatName}>{chat.name}</Text>
        <Text style={[styles.chatMessage, isUnread && styles.unreadMessage]}>
          {chat.lastMessage} • {chat.timeElapsed}
        </Text>
      </View>
      <View style={styles.timeContainer}>
        <View style={styles.timePill}>
          <Text style={styles.timePillText}>
            {chat.day} • {chat.time}
          </Text>
        </View>
        {isUnread && <View style={styles.blueDot} />}
      </View>
    </TouchableOpacity>
  );
}


const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  header: {
    alignItems: "center",
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  title: {
    fontFamily: 'Lexend',
    fontSize: 27,
    fontWeight: "bold",
    color: "#000000",
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#EFEFEF",
    borderRadius: 28,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginHorizontal: 16,
    marginBottom: 16,
  },
  searchInput: {
    flex: 1,
    marginLeft: 8,
    fontSize: 16,
    color: "#1F2937",
  },
  filterContainer: {
    height: 50,
    marginBottom: 0,
  },
  filterScrollView: {
    height: 50,
  },
  filterRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    alignItems: "center",
    gap: 8,
    height: 50,
  },
  filterPill: {
    backgroundColor: "#005124",
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    alignItems: "center",
  },
  filterPillActive: {
    backgroundColor: "#19E675",
  },
  filterText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  filterTextActive: {
    color: "#002000",
  },
  ticketsScrollView: {
    flex: 1,
  },
  chatList: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 20,
  },
  chatItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E5E7EB",
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    marginRight: 12,
  },
  chatContent: {
    flex: 1,
  },
  chatName: {
    fontSize: 16,
    fontWeight: "700",
    color: "#000000",
    marginBottom: 4,
  },
  chatMessage: {
    fontSize: 14,
    color: "#6B7280",
  },
  unreadMessage: {
    color: "#0088FF",
    fontWeight: "600",
  },
  timeContainer: {
    alignItems: "center",
    marginLeft: 8,
  },
  timePill: {
    backgroundColor: "#E8FCF1",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  blueDot: {
    width: 14,
    height: 14,
    borderRadius: 9999,
    backgroundColor: "#0088FF",
    marginTop: 10,
    justifyContent: 'flex-end',
    marginRight: -39
  },
  timePillText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#005124",
  },
  requestItem: {
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E5E7EB",
  },
  requestHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  requestContent: {
    flex: 1,
    marginLeft: 12,
  },
  requestName: {
    fontSize: 16,
    fontWeight: "700",
    color: "#000000",
    marginBottom: 4,
  },
  requestDetails: {
    fontSize: 14,
    color: "#6B7280",
  },
  requestActions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 8,
  },
  declineButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#EF4444",
    borderRadius: 12,
    paddingVertical: 10,
    gap: 6,
  },
  declineButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#EF4444",
  },
  approveButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#19E675",
    borderRadius: 12,
    paddingVertical: 10,
    gap: 6,
  },
  approveButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#19E675",
  },
});