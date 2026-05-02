import { SafeAreaView } from "react-native-safe-area-context";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useState } from "react";
import { useNavigation } from "expo-router";
import { useAuth } from "@/context/AuthContext";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";

type Request = {
  id: string;
  name: string;
  level: string;
  reliability: string;
  day: string;
  time: string;
  avatar: string;
  gameTitle?: string;
};

const DEFAULT_AVATAR =
  "https://images.unsplash.com/photo-1534158914592-062992fbe900?auto=format&fit=crop&w=200&q=60";

function formatRequestPill(
  dateIso: string | null,
  timeStr: string | null
): { day: string; time: string } {
  if (!dateIso) {
    return { day: "—", time: timeStr || "—" };
  }
  const d = new Date(dateIso);
  const day = d.toLocaleDateString("en-US", { weekday: "short" });
  if (!timeStr) {
    return { day, time: "—" };
  }
  const [h, m = "00"] = timeStr.split(":");
  const hour = parseInt(h, 10);
  const ampm = hour >= 12 ? "PM" : "AM";
  const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
  return { day, time: `${displayHour}:${m.padStart(2, "0")} ${ampm}` };
}

export default function Requests() {
  const { user } = useAuth();
  const [requests, setRequests] = useState<Request[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!isSupabaseConfigured || !user) {
      setRequests([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data: hosted } = await supabase.from("games").select("id").eq("host_id", user.id);
    const gameIds = (hosted ?? []).map((g: { id: string }) => g.id);
    if (gameIds.length === 0) {
      setRequests([]);
      setLoading(false);
      return;
    }
    const { data: rows, error } = await supabase
      .from("game_requests")
      .select("id, user_id, game_id")
      .in("game_id", gameIds)
      .eq("status", "pending");

    if (error || !rows?.length) {
      setRequests([]);
      setLoading(false);
      return;
    }

    const requesterIds = [...new Set(rows.map((r) => r.user_id as string))];
    const gIds = [...new Set(rows.map((r) => r.game_id as string))];

    const { data: profiles } = await supabase
      .from("users")
      .select("id, name, level")
      .in("id", requesterIds);

    const { data: games } = await supabase
      .from("games")
      .select("id, title, time")
      .in("id", gIds);

    const profMap = Object.fromEntries((profiles ?? []).map((p) => [p.id, p]));
    const gameMap = Object.fromEntries((games ?? []).map((g) => [g.id, g]));

    const ui: Request[] = rows.map((r) => {
      const p = profMap[r.user_id as string] as
        | { name: string | null; level: string | null }
        | undefined;
      const g = gameMap[r.game_id as string] as { title: string | null; time: string | null } | undefined;
      const iso = g?.time ?? null;
      const d = iso ? new Date(iso) : null;
      const timePart = d
        ? `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
        : null;
      const pill = formatRequestPill(iso, timePart);
      return {
        id: r.id as string,
        name: p?.name ?? "Player",
        level: p?.level ? String(p.level) : "—",
        reliability: "New to Sportiner",
        day: pill.day,
        time: pill.time,
        avatar: DEFAULT_AVATAR,
        gameTitle: g?.title ?? undefined,
      };
    });
    setRequests(ui);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  const handleApproveRequest = async (request: Request) => {
    if (isSupabaseConfigured) {
      await supabase.from("game_requests").update({ status: "accepted" }).eq("id", request.id);
    }
    setRequests((prev) => prev.filter((r) => r.id !== request.id));
  };

  const handleDeclineRequest = async (request: Request) => {
    if (isSupabaseConfigured) {
      await supabase.from("game_requests").update({ status: "rejected" }).eq("id", request.id);
    }
    setRequests((prev) => prev.filter((r) => r.id !== request.id));
  };

  const navigation = useNavigation();

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <View style={styles.header}>
      <TouchableOpacity 
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="chevron-back" size={28} color="#111" />
        </TouchableOpacity>
        <Text style={styles.title}>Requests to Join</Text>
      </View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color="#19E675" />
        </View>
      ) : (
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.chatList}
        style={styles.ticketsScrollView}
      >
        {requests.map((request) => (
            <RequestItem 
              key={request.id} 
              request={request} 
              onApprove={() => handleApproveRequest(request)}
              onDecline={() => handleDeclineRequest(request)}
            />
          ))}
      </ScrollView>
      )}
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
          {request.gameTitle ? (
            <Text style={styles.requestGameTitle} numberOfLines={1}>
              {request.gameTitle}
            </Text>
          ) : null}
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
  loadingWrap: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingTop: 48,
  },
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
  requestGameTitle: {
    fontSize: 13,
    color: "#374151",
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