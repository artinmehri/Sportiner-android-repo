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

type Chat = {
  id: string;
  name: string;
  lastMessage: string;
  timeElapsed: string;
  day: string;
  time: string;
  avatar: string;
};

type Request = {
  id: string;
  name: string;
  level: string;
  reliability: string;
  day: string;
  time: string;
  avatar: string;
};

const chats: Chat[] = [
  {
    id: "1",
    name: "Boys Tennis Game",
    lastMessage: "Artin: I'm almost there",
    timeElapsed: "1h",
    day: "Tue",
    time: "7PM",
    avatar:
      "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?auto=format&fit=crop&w=200&q=60",
  },
  {
    id: "2",
    name: "Alex Joe",
    lastMessage: "Almost there!",
    timeElapsed: "5h",
    day: "Wed",
    time: "3PM",
    avatar:
      "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?auto=format&fit=crop&w=200&q=60",
  },
  {
    id: "3",
    name: "Seb Mira",
    lastMessage: "Do u have a racket?",
    timeElapsed: "10h",
    day: "Mon",
    time: "1PM",
    avatar:
      "https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?auto=format&fit=crop&w=200&q=60",
  },
  {
    id: "4",
    name: "Sara Dion",
    lastMessage: "Are you here?",
    timeElapsed: "3d",
    day: "Fri",
    time: "11Am",
    avatar:
      "https://images.unsplash.com/photo-1519681393784-d120267933ba?auto=format&fit=crop&w=200&q=60",
  },
  {
    id: "5",
    name: "Dawson Frak",
    lastMessage: "Can't find the court",
    timeElapsed: "7d",
    day: "Sat",
    time: "7PM",
    avatar:
      "https://images.unsplash.com/photo-1501594907352-04cda38ebc29?auto=format&fit=crop&w=200&q=60",
  },
  {
    id: "6",
    name: "Safwan Mukhtar",
    lastMessage: "Let me know",
    timeElapsed: "1w",
    day: "Sun",
    time: "2PM",
    avatar:
      "https://images.unsplash.com/photo-1469474968028-56623f02e42e?auto=format&fit=crop&w=200&q=60",
  },
  {
    id: "7",
    name: "John Smith",
    lastMessage: "Sure",
    timeElapsed: "2w",
    day: "Thu",
    time: "10AM",
    avatar:
      "https://images.unsplash.com/photo-1505142468610-359e7d316be0?auto=format&fit=crop&w=200&q=60",
  },
];

const requests: Request[] = [
  {
    id: "1",
    name: "Artin Mehri",
    level: "Intermediate",
    reliability: "98% Reliable",
    day: "Tue",
    time: "7PM",
    avatar:
      "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?auto=format&fit=crop&w=200&q=60",
  },
  {
    id: "2",
    name: "Sara Dion",
    level: "Intermediate",
    reliability: "98% Reliable",
    day: "Tue",
    time: "7PM",
    avatar:
      "https://images.unsplash.com/photo-1519681393784-d120267933ba?auto=format&fit=crop&w=200&q=60",
  },
  {
    id: "3",
    name: "Dawson Frak",
    level: "Intermediate",
    reliability: "98% Reliable",
    day: "Thu",
    time: "10AM",
    avatar:
      "https://images.unsplash.com/photo-1501594907352-04cda38ebc29?auto=format&fit=crop&w=200&q=60",
  },
  {
    id: "4",
    name: "Artin Mehri",
    level: "Intermediate",
    reliability: "98% Reliable",
    day: "Thu",
    time: "10AM",
    avatar:
      "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?auto=format&fit=crop&w=200&q=60",
  },
];

export default function Inbox() {
  const [selectedFilter, setSelectedFilter] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const router = useRouter();
  const [chats, setChats] = useState<Chat[]>([
    {
      id: "1",
      name: "Boys Tennis Game",
      lastMessage: "Artin: I'm almost there",
      timeElapsed: "1h",
      day: "Tue",
      time: "7PM",
      avatar:
        "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?auto=format&fit=crop&w=200&q=60",
    },
    {
      id: "2",
      name: "Alex Joe",
      lastMessage: "Almost there!",
      timeElapsed: "5h",
      day: "Wed",
      time: "3PM",
      avatar:
        "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?auto=format&fit=crop&w=200&q=60",
    },
    {
      id: "3",
      name: "Seb Mira",
      lastMessage: "Do u have a racket?",
      timeElapsed: "10h",
      day: "Mon",
      time: "1PM",
      avatar:
        "https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?auto=format&fit=crop&w=200&q=60",
    },
    {
      id: "4",
      name: "Sara Dion",
      lastMessage: "Are you here?",
      timeElapsed: "3d",
      day: "Fri",
      time: "11Am",
      avatar:
        "https://images.unsplash.com/photo-1519681393784-d120267933ba?auto=format&fit=crop&w=200&q=60",
    },
    {
      id: "5",
      name: "Dawson Frak",
      lastMessage: "Can't find the court",
      timeElapsed: "7d",
      day: "Sat",
      time: "7PM",
      avatar:
        "https://images.unsplash.com/photo-1501594907352-04cda38ebc29?auto=format&fit=crop&w=200&q=60",
    },
    {
      id: "6",
      name: "Safwan Mukhtar",
      lastMessage: "Let me know",
      timeElapsed: "1w",
      day: "Sun",
      time: "2PM",
      avatar:
        "https://images.unsplash.com/photo-1469474968028-56623f02e42e?auto=format&fit=crop&w=200&q=60",
    },
    {
      id: "7",
      name: "John Smith",
      lastMessage: "Sure",
      timeElapsed: "2w",
      day: "Thu",
      time: "10AM",
      avatar:
        "https://images.unsplash.com/photo-1505142468610-359e7d316be0?auto=format&fit=crop&w=200&q=60",
    },
  ]);
  const [requests, setRequests] = useState<Request[]>([
    {
      id: "1",
      name: "Artin Mehri",
      level: "Intermediate",
      reliability: "98% Reliable",
      day: "Tue",
      time: "7PM",
      avatar:
        "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?auto=format&fit=crop&w=200&q=60",
    },
    {
      id: "2",
      name: "Sara Dion",
      level: "Intermediate",
      reliability: "98% Reliable",
      day: "Tue",
      time: "7PM",
      avatar:
        "https://images.unsplash.com/photo-1519681393784-d120267933ba?auto=format&fit=crop&w=200&q=60",
    },
    {
      id: "3",
      name: "Dawson Frak",
      level: "Intermediate",
      reliability: "98% Reliable",
      day: "Thu",
      time: "10AM",
      avatar:
        "https://images.unsplash.com/photo-1501594907352-04cda38ebc29?auto=format&fit=crop&w=200&q=60",
    },
    {
      id: "4",
      name: "Artin Mehri",
      level: "Intermediate",
      reliability: "98% Reliable",
      day: "Thu",
      time: "10AM",
      avatar:
        "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?auto=format&fit=crop&w=200&q=60",
    },
  ]);

  const handleApproveRequest = (request: Request) => {
    const isGroup = request.name.toLowerCase().includes('group') || 
                   request.name.toLowerCase().includes('team') ||
                   request.name.toLowerCase().includes('boys') ||
                   request.name.toLowerCase().includes('girls');
    
    const newChat: Chat = {
      id: Date.now().toString(),
      name: request.name,
      lastMessage: "Request approved",
      timeElapsed: "now",
      day: request.day,
      time: request.time,
      avatar: request.avatar,
    };
    
    setChats([...chats, newChat]);
    setRequests(requests.filter(r => r.id !== request.id));
    setSelectedFilter("All");
  };
  
  const handleDeclineRequest = (request: Request) => {
    setRequests(requests.filter(r => r.id !== request.id));
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>Chat</Text>
      </View>

      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color="#9CA3AF" />
        <TextInput
          placeholder="Look Up People"
          placeholderTextColor="#9CA3AF"
          style={styles.searchInput}
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
          {["All", "Group", "1-1", "Requests"].map((filter) => {
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
        {selectedFilter === "Requests" ? (
          requests
            .filter(request => 
              searchQuery === "" || 
              request.name.toLowerCase().includes(searchQuery.toLowerCase())
            )
            .map((request) => (
            <RequestItem 
              key={request.id} 
              request={request} 
              onApprove={() => handleApproveRequest(request)}
              onDecline={() => handleDeclineRequest(request)}
            />
          ))
        ) : selectedFilter === "Group" ? (
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

function ChatItem({ chat, router }: { chat: Chat; router: any }) {
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

function RequestItem({ request, onApprove, onDecline }: { request: Request; onApprove: () => void; onDecline: () => void }) {
  return (
    <View style={styles.requestItem}>
      <View style={styles.requestHeader}>
        <Image source={{ uri: request.avatar }} style={styles.avatar} />
        <View style={styles.requestContent}>
          <Text style={styles.requestName}>{request.name}</Text>
          <Text style={styles.requestDetails}>
            {request.level} • {request.reliability}
          </Text>
        </View>
        <View style={styles.requestTimePill}>
          <Text style={styles.requestTimePillText}>
            {request.day} • {request.time}
          </Text>
        </View>
      </View>
      <View style={styles.requestActions}>
        <TouchableOpacity style={styles.declineButton} onPress={onDecline}>
          <Ionicons name="close" size={18} color="#EF4444" />
          <Text style={styles.declineButtonText}>Decline</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.approveButton} onPress={onApprove}>
          <Ionicons name="checkmark" size={18} color="#19E675" />
          <Text style={styles.approveButtonText}>Approve</Text>
        </TouchableOpacity>
      </View>
    </View>
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
    fontSize: 32,
    fontWeight: "900",
    color: "#000000",
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F3F4F6",
    borderRadius: 12,
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
    color: "#FFFFFF",
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
    color: "#38BDF8",
    fontWeight: "600",
  },
  timeContainer: {
    alignItems: "center",
    marginLeft: 8,
  },
  timePill: {
    backgroundColor: "#19E675",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  blueDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#38BDF8",
    marginTop: 5,
  },
  timePillText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#FFFFFF",
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
  requestTimePill: {
    backgroundColor: "#FCD34D",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginLeft: 8,
  },
  requestTimePillText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#000000",
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