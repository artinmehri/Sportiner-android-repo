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
import { useState } from "react";
import { useRouter } from "expo-router";
import { getConversations } from "@/context/ChatContext";



export default async function Inbox() {
  const [selectedFilter, setSelectedFilter] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const router = useRouter();
  const chats = (await getConversations()) ?? [];

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
        { selectedFilter === "Group" ? (
          chats
            .filter((chat) => chat.id === "1")
            .filter(chat => 
              searchQuery === "" || 
              chat.name.toLowerCase().includes(searchQuery.toLowerCase())
            )
            .map((chat) => <ChatItem key={chat.id} chat={chat} router={router} />)
        ) : selectedFilter === "1-1" ? (
          chats
            .filter((chat) => chat.id !== "1")
            .filter(chat => 
              searchQuery === "" || 
              chat.name.toLowerCase().includes(searchQuery.toLowerCase())
            )
            .map((chat) => <ChatItem key={chat.id} chat={chat} router={router} />)
        ) : (
          chats
            .filter(chat => 
              searchQuery === "" || 
              chat.name.toLowerCase().includes(searchQuery.toLowerCase())
            )
            .map((chat) => <ChatItem key={chat.id} chat={chat} router={router} />)
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function ChatItem({ chat, router }: { chat: any; router: any }) {
  const isUnread = chat.id === "1" || chat.id === "4";
  const isGroupChat = chat.id === "1" || chat.name.toLowerCase().includes('group') || 
                     chat.name.toLowerCase().includes('team') ||
                     chat.name.toLowerCase().includes('boys') ||
                     chat.name.toLowerCase().includes('girls');
  
  return (
    <TouchableOpacity 
      style={styles.chatItem}
      onPress={() => isGroupChat ? router.push('/(tabs)/groupchat') : router.push('/(tabs)/chat')}
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