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
import { useCallback, useMemo, useRef, useState } from "react";
import { useFocusEffect, useRouter } from "expo-router";
import { getConversations } from "@/context/ChatContext";
import { getCurrentUserId } from "@/context/AuthContext";

const DEFAULT_AVATAR =
  "https://images.unsplash.com/photo-1622668460389-f92e9ed21616?q=80&w=2070&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D";

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

function toInboxChat(
  row: {
    id: string;
    type: string;
    name: string | null;
    photo: string | null;
    last_message: string | null;
    last_message_at: string | null;
    last_message_id: string | null;
    last_message_sender_id: string | null;
    conversation_members?: { last_read_message_id: string | null }[];
  },
  currentUserId: string
): InboxChat {
  const { day, time, timeElapsed } = formatChatTimestamps(row.last_message_at);
  const lastReadMessageId = row.conversation_members?.[0]?.last_read_message_id;
  const unread =
  !!row.last_message_id &&
  row.last_message_id !== lastReadMessageId &&
  row.last_message_sender_id !== currentUserId;

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
  const [currentUserId, setCurrentUserId] = useState<any | null>('');
  const [selectedFilter, setSelectedFilter] = useState("All");
  const [isSearching, setIsSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [chats, setChats] = useState<InboxChat[]>([]);
  const searchInputRef = useRef<TextInput>(null);
  const router = useRouter();

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;

      (async () => {
        const rows = await getConversations();
        const currentUserId = await getCurrentUserId();
        if (cancelled) return;

        setCurrentUserId(currentUserId);
        if (currentUserId) {
          setChats((rows ?? []).map(row => toInboxChat(row, currentUserId.id)));
        } else {
          setChats([]);
        }
      })();

      return () => {
        cancelled = true;
      };
    }, [])
  );

  const filteredChats = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();

    return chats.filter((chat) => {
      const matchesFilter =
        selectedFilter === "All" ||
        (selectedFilter === "Group" && chat.type === "group") ||
        (selectedFilter === "1-1" && chat.type === "private");

      if (!matchesFilter) return false;
      if (!normalizedQuery) return true;

      const searchableText = [
        chat.name,
        chat.lastMessage,
        chat.type,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return searchableText.includes(normalizedQuery);
    });
  }, [chats, searchQuery, selectedFilter]);

  const openSearch = () => {
    setIsSearching(true);
    requestAnimationFrame(() => searchInputRef.current?.focus());
  };

  const clearSearch = () => {
    setSearchQuery("");

    if (isSearching) {
      searchInputRef.current?.focus();
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>Chat</Text>
      </View>

      <View style={styles.searchContainer}>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Search conversations"
          onPress={openSearch}
          style={styles.searchIconButton}
        >
          <Ionicons name="search" size={20} color="#555555" />
        </TouchableOpacity>
        {isSearching ? (
          <>
            <TextInput
              ref={searchInputRef}
              placeholder="Search conversations"
              placeholderTextColor="#555555"
              style={styles.searchInput}
              value={searchQuery}
              onChangeText={setSearchQuery}
              returnKeyType="search"
              autoCorrect={false}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Clear search"
                onPress={clearSearch}
                style={styles.searchIconButton}
              >
                <Ionicons name="close-circle" size={20} color="#555555" />
              </TouchableOpacity>
            )}
          </>
        ) : (
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Open conversation search"
            onPress={openSearch}
            style={styles.searchPlaceholderButton}
          >
            <Text style={styles.searchPlaceholder}>Search conversations</Text>
          </TouchableOpacity>
        )}
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
        {filteredChats.length > 0 ? (
          filteredChats.map((chat) => (
            <ChatItem key={chat.id} chat={chat} router={router} />
          ))
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateTitle}>No conversations found.</Text>
            <Text style={styles.emptyStateText}>
              Try searching by chat name, player name, game title, or message.
            </Text>
          </View>
        )}
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
      <Image source={{ uri: chat.avatar || DEFAULT_AVATAR }} style={styles.avatar} />
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
    paddingHorizontal: 10,
    paddingVertical: 10,
    marginHorizontal: 16,
    marginBottom: 16,
  },
  searchIconButton: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  searchPlaceholderButton: {
    flex: 1,
    justifyContent: "center",
    minHeight: 32,
  },
  searchPlaceholder: {
    marginLeft: 8,
    fontSize: 16,
    fontWeight: "700",
    color: "#555555",
  },
  searchInput: {
    flex: 1,
    marginLeft: 8,
    fontSize: 16,
    fontWeight: "700",
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
    flexGrow: 1,
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingVertical: 48,
  },
  emptyStateTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: "#000000",
    marginBottom: 8,
    textAlign: "center",
  },
  emptyStateText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#6B7280",
    textAlign: "center",
    lineHeight: 20,
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
