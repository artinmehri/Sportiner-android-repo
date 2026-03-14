import { SafeAreaView } from "react-native-safe-area-context";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Image,
  BackHandler,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { useNavigation, useRouter } from "expo-router";


type Request = {
  id: string;
  name: string;
  level: string;
  reliability: string;
  day: string;
  time: string;
  avatar: string;
};


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

export default function Requests() {
  const router = useRouter();
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
    setRequests(requests.filter(r => r.id !== request.id));
  };
  
  const handleDeclineRequest = (request: Request) => {
    setRequests(requests.filter(r => r.id !== request.id));
  };

  const navigation = useNavigation()

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <View style={styles.header}>
      <TouchableOpacity 
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="chevron-back" size={28} color="#111" />
        </TouchableOpacity>
        <Text style={styles.title}>Rquests to Join</Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.chatList}
        style={styles.ticketsScrollView}
      >
        {(
          requests
            .map((request) => (
            <RequestItem 
              key={request.id} 
              request={request} 
              onApprove={() => handleApproveRequest(request)}
              onDecline={() => handleDeclineRequest(request)}
            />
          ))
        )
      }
      </ScrollView>
    </SafeAreaView>
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
    flexDirection: 'row'
  },
  title: {
    fontSize: 25,
    fontWeight: "900",
    color: "#000000",
    alignSelf: 'center',
    textAlign: 'center',
    marginLeft: 45
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
    backgroundColor: 'rgba(223, 230, 25, 0.3)',
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
  backButton: {
    paddingVertical: 8,
    paddingRight: 10,
  },
});