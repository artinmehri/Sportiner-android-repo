import { SafeAreaView } from "react-native-safe-area-context";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Image,
  Modal,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useCallback, useMemo, useState } from "react";
import { useFocusEffect, useRouter } from "expo-router";
import { useGameTickets } from "@/context/GameTicketsContext";
import { useGames, type Game } from "@/context/GameContext";
import { useAuth } from "@/context/AuthContext";
import { isSupabaseConfigured } from "@/lib/supabase";


type Event = {
  title: string;
  level: "Beginner(400-800)" | "Intermediate(800-1200)" | "Advanced(1200-1600)" | "Pro(1600+)";
  distance: string;
  address: string;
  status: string;
  time: string;
  venue: string;
  cost: string;
  avatar: string;
  primaryCta: string;
  secondaryCta: string;
  spotsFilled?: number;
  spotsTotal?: number;
  hasGreenBackground?: boolean;
  gameId?: string;
};

function skillToEventLevel(skill: Game["skillLevel"]): Event["level"] {
  switch (skill) {
    case "Beginner":
      return "Beginner(400-800)";
    case "Intermediate":
      return "Intermediate(800-1200)";
    case "Advanced":
      return "Advanced(1200-1600)";
    default:
      return "Intermediate(800-1200)";
  }
}

function formatDiscoverTime(dateIso: string, timeStr: string): string {
  if (!dateIso) {
    return timeStr || "TBD";
  }
  const date = new Date(dateIso);
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  let dayPart: string;
  if (date.toDateString() === today.toDateString()) {
    dayPart = "Today";
  } else if (date.toDateString() === tomorrow.toDateString()) {
    dayPart = "Tomorrow";
  } else {
    dayPart = date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }
  const [hours, minutes = "00"] = (timeStr || "12:00").split(":");
  const hour = parseInt(hours, 10);
  const ampm = hour >= 12 ? "PM" : "AM";
  const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
  return `${dayPart} • ${displayHour}:${minutes.padStart(2, "0")} ${ampm}`;
}

function gameToEvent(g: Game): Event {
  const needsApproval = g.joinSetting.includes("Approval");
  return {
    title: g.title,
    level: skillToEventLevel(g.skillLevel),
    distance: "Nearby",
    address: g.location,
    status: "open",
    time: formatDiscoverTime(g.date, g.time),
    venue: g.courtType,
    cost: g.isPaid && g.paymentAmount ? `$${g.paymentAmount} Entry` : "Free",
    avatar: g.host.avatar,
    primaryCta: "Message Host",
    secondaryCta: needsApproval ? "Request Spot" : "Join Game",
    spotsFilled: 1,
    spotsTotal: g.numberOfPlayers,
    hasGreenBackground: false,
    gameId: g.id,
  };
}


const events1v1: Event[] = [
 {
   title: "John's Tennis Game",
   level: "Intermediate(800-1200)",
   distance: "500m",
   address: "100 Steels Avenue",
   status: "open",
   time: "Today • 7:30",
   venue: "Public court",
   cost: "Free",
   avatar:
     "https://images.unsplash.com/photo-1519681393784-d120267933ba?auto=format&fit=crop&w=200&q=60",
   primaryCta: "Message Host",
   secondaryCta: "Join Game",
 },
 {
   title: "Alex's Tennis Game",
   level: "Advanced(1200-1600)",
   distance: "1.2km",
   address: "1200 Steels Avenue",
   status: "full",
   time: "Today • 7:30",
   venue: "Private court",
   cost: "Free",
   avatar:
     "https://images.unsplash.com/photo-1505761671935-60b3a7427bad?auto=format&fit=crop&w=200&q=60",
   primaryCta: "Message Host",
   secondaryCta: "Request Spot",
 },
];

const eventsGroup: Event[] = [
 {
   title: "Sportiner Event",
   level: "Beginner(400-800)",
   distance: "500m",
   address: "300 Steels Avenue",
   status: "open",
   time: "Today • 7:30",
   venue: "",
   cost: "Free",
   avatar:
     "https://images.unsplash.com/photo-1519681393784-d120267933ba?auto=format&fit=crop&w=200&q=60",
   primaryCta: "Message Host",
   secondaryCta: "Join Game",
   spotsFilled: 4,
   spotsTotal: 6,
   hasGreenBackground: true,
 },
 {
   title: "Alex's Tennis Doubles",
   level: "Advanced(1200-1600)",
   distance: "500m",
   address: "300 Steels Avenue",
   status: "open",
   time: "Today • 10:30",
   venue: "",
   cost: "$10 Entry",
   avatar:
     "https://images.unsplash.com/photo-1505761671935-60b3a7427bad?auto=format&fit=crop&w=200&q=60",
   primaryCta: "Message Host",
   secondaryCta: "Request Spot",
   spotsFilled: 2,
   spotsTotal: 3,
   hasGreenBackground: false,
 },
];


export default function Index() {
 const [mode, setMode] = useState<"1-1" | "Group">("1-1");
 const [selectedFilter, setSelectedFilter] = useState("Today");
 const [searchQuery, setSearchQuery] = useState("");
 const [showJoinedGameModal, setShowJoinedGameModal] = useState(false);
 const router = useRouter();
 const { requestJoinGame } = useGameTickets();
 const { games, refreshGames } = useGames();
 const { user } = useAuth();

 useFocusEffect(
   useCallback(() => {
     refreshGames();
   }, [refreshGames])
 );

 const dbEvents = useMemo(() => {
   return games
     .filter((g) => (mode === "1-1" ? g.gameType === "1v1" : g.gameType === "Group"))
     .filter((g) => (user?.id ? g.hostId !== user.id : true))
     .map(gameToEvent);
 }, [games, mode, user?.id]);

 return (
   <SafeAreaView style={styles.safeArea} edges={["top"]}>
     <ScrollView
       showsVerticalScrollIndicator={false}
       contentContainerStyle={styles.container}
     >
       <View style={styles.searchContainer}>
         <Ionicons name="search" size={24} color="#5A545E" />
         <TextInput
           placeholder="Search Events Around You"
           placeholderTextColor="#5A545E"
           style={styles.searchInput}
           value={searchQuery}
           onChangeText={setSearchQuery}
         />
       </View>
       <View style={styles.segmentRow}>
         <TouchableOpacity
           style={[
             styles.segmentItem,
             mode === "1-1" ? styles.segmentActive : undefined,
           ]}
           onPress={() => setMode("1-1")}
         >
           <Ionicons
             name="person-outline"
             size={34}
             color={mode === "1-1" ? "#19E675" : "rgba(27, 27, 27, 0.3)"}
           />
           <Text
             style={[
               styles.segmentText,
               mode === "1-1" ? styles.segmentTextActive : undefined,
             ]}
           >
             1-1
           </Text>
           {mode === "1-1" && <View style={styles.segmentUnderline} />}
         </TouchableOpacity>
         <TouchableOpacity
           style={[
             styles.segmentItem,
             mode === "Group" ? styles.segmentActive : undefined,
           ]}
           onPress={() => setMode("Group")}
         >
           <Ionicons
             name="people-outline"
             size={34}
             color={mode === "Group" ? "#19E675" : "rgba(27, 27, 27, 0.3)"}
           />
           <Text
             style={[
               styles.segmentText,
               mode === "Group" ? styles.segmentTextActive : undefined,
             ]}
           >
             Group
           </Text>
           {mode === "Group" && <View style={styles.segmentUnderline} />}
         </TouchableOpacity>
       </View>


       <ScrollView
         horizontal
         showsHorizontalScrollIndicator={false}
         contentContainerStyle={styles.filterRow}
       >
         {["Today", "Tomorrow", "This Weekend"].map((label) => {
           const active = selectedFilter === label;
           return (
             <TouchableOpacity
               key={label}
               onPress={() => setSelectedFilter(label)}
               style={[styles.filterPill, active && styles.filterPillActive]}
             >
               <Text
                 style={[styles.filterText, active && styles.filterTextActive]}
               >
                 {label}
               </Text>
             </TouchableOpacity>
           );
         })}
       </ScrollView>


       {(
         (isSupabaseConfigured
           ? dbEvents
           : [...dbEvents, ...(mode === "1-1" ? events1v1 : eventsGroup)]
         ).filter(
           (event) =>
             searchQuery === "" ||
             event.title.toLowerCase().includes(searchQuery.toLowerCase())
         )
       ).map((event, idx) => (
         <EventCard
           key={event.gameId ?? `seed-${event.title}-${idx}`}
           event={event}
           mode={mode}
           router={router}
           requestJoinGame={requestJoinGame}
           setShowJoinedGameModal={setShowJoinedGameModal}
         />
       ))}
     </ScrollView>


    <TouchableOpacity 
      style={styles.fab}
      onPress={() => router.push('/(tabs)/CreateGame')}
    >
      <Ionicons name="add" size={26} color="#005124" />
    </TouchableOpacity>

    {/* Joined Game Modal */}
    <Modal
      visible={showJoinedGameModal}
      animationType="fade"
      transparent={true}
      onRequestClose={() => setShowJoinedGameModal(false)}
    >
      <TouchableOpacity 
        style={styles.modalOverlay}
        activeOpacity={1}
        onPress={() => setShowJoinedGameModal(false)}
      >
        <View style={styles.feedbackModal}>
            <View style={styles.feedbackContent}>
              <View style={styles.feedbackIconContainer}>
                <Ionicons name="checkmark-circle-outline" size={23} color="#19E675" />
              </View>
              <Text style={styles.feedbackTitle}>Joined Game</Text>
            </View>
          </View>
      </TouchableOpacity>
    </Modal>
   </SafeAreaView>
 );
}


function EventCard({ event, mode, router, requestJoinGame, setShowJoinedGameModal }: { 
  event: Event; 
  mode: "1-1" | "Group"; 
  router: any; 
  requestJoinGame: (gameData: {
    gameId: string;
    gameTitle: string;
    gameStatus?: string;
    gameDetails?: {
      date: string;
      time: string;
      location: string;
      host: string;
    };
  }) => Promise<{ error: string | null }>;
  setShowJoinedGameModal: (show: boolean) => void;
}) {
 const isGroupMode = mode === "Group";
 const hasGreenBg = isGroupMode && event.hasGreenBackground;

 const cardStyle = hasGreenBg ? styles.cardGreen : styles.card;

 const handleJoinGame = async () => {
    const hostName = event.title.split("'s")[0];
    const gameId =
      event.gameId ??
      event.title.replace(/\s+/g, "-").toLowerCase();

    const { error } = await requestJoinGame({
      gameId,
      gameTitle: event.title,
      gameStatus: event.status,
      gameDetails: {
        date: event.time.split(" • ")[0],
        time: event.time.split(" • ")[1] || event.time,
        location: event.address,
        host: hostName,
      },
    });

    if (error) {
      Alert.alert("Join request", error);
      return;
    }

    setShowJoinedGameModal(true);

    setTimeout(() => {
      setShowJoinedGameModal(false);
    }, 2500);
  };

 return (
   <TouchableOpacity 
     style={cardStyle}
     onPress={
      event.status === "full"
        ? undefined
        : () =>
            router.push({
              pathname: "/(tabs)/EventDetails",
              params: event.gameId ? { id: event.gameId } : {},
            })
    }
   >
    <View style={styles.cardHeader}>
      <Image source={{ uri: event.avatar }} style={event.status === 'full' ? styles.avatarFull :styles.avatar} />
      <View style={styles.cardInfo}>
        <View style={{flexDirection: 'row'}}>
        <Text style={event.status === 'full' ? styles.cardTitleFull : styles.cardTitle}>{event.title}</Text>
        {event.status === 'full' && 
          <View style={{backgroundColor: "#E5E7EB", borderColor: "#D1D5DB", borderRadius: 20, paddingHorizontal: 15, paddingVertical: 3 }}>
            <Text style={{color: "#6B7280", fontWeight: "600"}}>Full</Text>
          </View>}
        </View>
          <View style={styles.cardMetaRow}>
            <Text style={event.title ==='Sportiner Event' ? styles.cardLevelSportiner : event.status === 'full' ? styles.cardLevelFull : styles.cardLevel}>{event.level}</Text>
            {event.level && event.distance && <Text style={styles.cardMetaDot}> • </Text>}
            <Text style={event.title ==='Sportiner Event' ? styles.cardDistanceSportiner : event.status === 'full' ? styles.cardDistanceFull : styles.cardDistance}>{event.distance}</Text>
          </View>
      </View>
    </View>
    <>
       <View style={styles.infoView}>
       <Ionicons name="location-outline" color={event.title ==='Sportiner Event' ? "#002000" : event.status === 'full' ? "#9CA3AF" : "#4B5563"} size={16}></Ionicons>
         <Text style={event.title ==='Sportiner Event' ? styles.locationTextSportiner : event.status === 'full' ? styles.locationTextFull : styles.locationText}>
           {event.address}
         </Text>
       </View>

       <View style={styles.infoView}>
       <Ionicons name="time-outline" color={event.title ==='Sportiner Event' ? "#002000" : event.status === 'full' ? "#9CA3AF" : "#4B5563"} size={16}></Ionicons>
        <Text style={event.title ==='Sportiner Event' ? styles.timeTextSportiner : event.status === 'full' ? styles.timeTextFull : styles.timeText}>
           {event.time}
         </Text>
       </View>
       </>
     {isGroupMode ? (
       <>
         {event.spotsFilled !== undefined && event.spotsTotal !== undefined && (
           <>
             <Text style={[event.title === 'Sportiner Event' ? styles.infoTextSportiner : styles.infoText]}>
               {event.spotsFilled}/{event.spotsTotal} Spots Filled
             </Text>
             <View style={styles.progressBarContainer}>
               <View
                 style={[
                   styles.progressBarFill,
                   {
                     width: `${(event.spotsFilled / event.spotsTotal) * 100}%`,
                     backgroundColor: hasGreenBg ? "#FFFFFF" : "#19E675",
                   },
                 ]}
               />
               {event.spotsFilled < event.spotsTotal && (
                 <View
                   style={[
                     styles.progressBarEmpty,
                     {
                       flex: 1,
                       backgroundColor: hasGreenBg ? "rgba(255,255,255,0.3)" : "#E5E7EB",
                     },
                   ]}
                 />
               )}
             </View>
           </>
         )}
       </>
     ) : null}

     <View style={styles.buttonRow}>
      {event.title === "Sportiner Event" ? null : 
      <TouchableOpacity
         style={[
          event.status === 'full' ? styles.secondaryButtonFull : styles.secondaryButton,
         ]}
         onPress={ event.status === 'full' ? undefined : () => router.push('/(tabs)/chat')}
       >
         <Text
           style={[
            event.status === 'full' ? styles.secondaryButtonTextFull : styles.secondaryButtonText,
           ]}
         >
           {event.primaryCta}
         </Text>
       </TouchableOpacity>}
  
       <TouchableOpacity
         style={[
          event.title === 'Sportiner Event' ? styles.primaryButtonSportiner :
          event.status === 'full' ? styles.primaryButtonFull : styles.primaryButton
         ]}
         onPress={event.status === 'full' ? undefined : handleJoinGame}
       >
         <Text
           style={[
            event.title === 'Sportiner Event' ? styles.primaryButtonTextSportiner :
            event.status === 'full' ? styles.primaryButtonTextFull : styles.primaryButtonText,
           ]}
         >
           {event.secondaryCta}
         </Text>
       </TouchableOpacity>
     </View>
   </TouchableOpacity>
 );
}


const styles = StyleSheet.create({
 safeArea: {
   flex: 1,
   backgroundColor: "#FFFFFF",
 },
 container: {
   padding: 16,
   paddingBottom: 120,
   gap: 14,
 },
 searchContainer: {
   flexDirection: "row",
   alignItems: "center",
   backgroundColor: "#FFFFFF",
   borderRadius: 22,
   paddingHorizontal: 16,
   paddingVertical: 12,
   shadowColor: "#000",
   shadowOffset: { width: 0, height: 5 },
   shadowOpacity: 0.1,
   shadowRadius: 7,
   elevation: 4,
 },
 searchInput: {
   flex: 1,
   marginLeft: 12,
   fontSize: 17,
   color: "#2D2A32",
   fontWeight: "600",
 },
 segmentRow: {
   flexDirection: "row",
   justifyContent: "space-evenly",
   alignItems: "center",
   paddingTop: 4,
   paddingBottom: 6,
   borderBottomWidth: StyleSheet.hairlineWidth,
   borderBottomColor: "#E5E7EB",
 },
 segmentItem: {
   alignItems: "center",
   paddingHorizontal: 10,
 },
 segmentText: {
   fontSize: 16,
   fontWeight: "700",
   color: "rgba(27, 27, 27, 0.3)",
   marginTop: 0,
 },
 segmentTextActive: {
   color: "#19E675",
 },
 segmentActive: {
   position: "relative",
 },
 segmentUnderline: {
   marginTop: 4,
   height: 3,
   width: 48,
   borderRadius: 2,
   backgroundColor: "#19E675",
 },
 filterRow: {
   flexDirection: "row",
   alignItems: "center",
   gap: 6,
   paddingRight: 4,
 },
 filterPill: {
   backgroundColor: "#005124",
   borderRadius: 50,
   paddingVertical: 7,
   paddingHorizontal: 12,
   alignItems: "center",
   minWidth: 98,
 },
 filterPillActive: {
   backgroundColor: "#19E675",
 },
 filterText: {
   fontSize: 16,
   fontWeight: "800",
   color: "#FFFFFF",
 },
 filterTextActive: {
   color: "#005124",
 },
 card: {
   backgroundColor: "#FFFFFF",
   borderRadius: 12,
   padding: 16,
   marginBottom: 12,
   shadowColor: "#000",
   shadowOffset: { width: 0, height: 4 },
   shadowOpacity: 0.12,
   shadowRadius: 8,
   elevation: 4,
   gap: 8,
   borderWidth: StyleSheet.hairlineWidth,
   borderColor: '#000000',
 },
 cardGreen: {
   backgroundColor: "#19E675",
   borderRadius: 12,
   padding: 16,
   marginBottom: 12,
   shadowColor: "#000",
   shadowOffset: { width: 0, height: 4 },
   shadowOpacity: 0.12,
   shadowRadius: 8,
   elevation: 4,
   gap: 8,
 },
 cardHeader: {
   flexDirection: "row",
   alignItems: "center",
   gap: 12,
   marginBottom: 7,
 },
 avatarFull: {
  width: 54,
  height: 54,
  borderRadius: 7,
  borderWidth: 2,
  borderColor: '#9CA3AF'
 },
 avatar: {
  width: 54,
  height: 54,
  borderRadius: 7,
  borderWidth: 2,
  borderColor: '#121212'
 },
 cardTitleFull: {
  flex: 1,
  fontSize: 20,
  fontWeight: "800",
  color: "#6B7280",
 },
 cardTitle: {
   flex: 1,
   fontSize: 20,
   fontWeight: "800",
   color: "#121212",
 },
  cardInfo: {
    flex: 1,
    justifyContent: 'center',
  },
 cardMetaRow: {
  flexDirection: 'row',
  alignItems: 'center',
  marginTop: 4
},
cardLevel: {
  fontSize: 14,
  color: '#19E675',
  fontWeight: '600',
  marginBottom: 3,
  textTransform: 'uppercase',
},
cardLevelFull: {
  fontSize: 14,
  color: '#D1D5DB',
  fontWeight: '600',
  marginBottom: 3,
  textTransform: 'uppercase',
},
cardLevelSportiner: {
  fontSize: 14,
  color: '#002000',
  fontWeight: '600',
  marginBottom: 3,
  textTransform: 'uppercase',
},
cardMetaDot: {
  fontSize: 14,
  color: '#666',
  marginBottom: 3
},
cardDistance: {
  fontSize: 14,
  color: '#71717A',
  fontWeight: '400',
  marginBottom: 3,
  textTransform: 'uppercase',
},
cardDistanceSportiner: {
  fontSize: 14,
  color: '#002000',
  fontWeight: '400',
  marginBottom: 3,
  textTransform: 'uppercase',
},
cardDistanceFull: {
  fontSize: 14,
  color: '#9CA3AF',
  fontWeight: '400',
  marginBottom: 3,
  textTransform: 'uppercase',
},
 infoRow: {
   flexDirection: "row",
   alignItems: "center",
   gap: 6,
 },
 infoView: {
  flexDirection: 'row',
  marginBottom: 2
 },
 locationTextFull: {
  fontSize: 16,
  color: "#9CA3AF",
  marginLeft: 5,
  marginTop: -1
 },
 locationTextSportiner: {
  fontSize: 16,
  color: "#002000",
  marginLeft: 5,
  marginTop: -1
 },
 locationText: {
  fontSize: 16,
  color: "#4B5563",
  marginLeft: 5,
  marginTop: -1
 },
 timeTextFull: {
  fontSize: 16,
  color: "#9CA3AF",
  marginLeft: 5,
  marginTop: -2
 },
 timeTextSportiner: {
  fontSize: 16,
  color: "#002000",
  marginLeft: 5,
  marginTop: -1
 },
 timeText: {
  fontSize: 16,
  color: "#4B5563",
  marginLeft: 5,
  marginTop: -2
 },
 infoText: {
   fontSize: 16,
   color: "#4B5563",
 },
 infoTextSportiner: {
  fontSize: 16,
  color: "#002000",
 },
 level: {
   fontSize: 16,
   fontWeight: "700",
 },
 dot: {
   fontSize: 16,
   color: "#4B5563",
 },
 buttonRow: {
   flexDirection: "row",
   gap: 12,
   marginTop: 8,
 },
 secondaryButtonFull: {
  flex: 1,
  backgroundColor: "#F9FAFB",
  borderRadius: 30,
  paddingVertical: 12,
  alignItems: "center",
  borderWidth: 2,
  borderColor: '#E5E7EB'
 },
 secondaryButton: {
   flex: 1,
   backgroundColor: "#ffffff",
   borderRadius: 30,
   paddingVertical: 12,
   alignItems: "center",
   borderWidth: 2,
   borderColor: '#1A1A1A'
 },
 secondaryButtonTextFull: {
  color: "#9CA3AF",
  fontSize: 16,
  fontWeight: "700",
 },
 secondaryButtonText: {
   color: "#1A1A1A",
   fontSize: 16,
   fontWeight: "700",
 },
 primaryButtonFull: {
  flex: 1,
  backgroundColor: "#E5E7EB",
  borderRadius: 30,
  paddingVertical: 12,
  alignItems: "center",
  borderWidth: 2,
  borderColor: '#D1D5DB'
 },
 primaryButtonSportiner: {
  flex: 1,
  backgroundColor: "#005124",
  borderRadius: 30,
  paddingVertical: 12,
  alignItems: "center",
  borderWidth: 2,
  borderColor: '#002000'
 },
 primaryButton: {
   flex: 1,
   backgroundColor: "#19E675",
   borderRadius: 30,
   paddingVertical: 12,
   alignItems: "center",
   borderColor: '#1A1A1A',
   borderWidth: 2
 },
 primaryButtonGreen: {
   backgroundColor: "#FFFFFF",
 },
 primaryButtonTextFull: {
  color: "#6B7280",
  fontSize: 16,
  fontWeight: "700",
 },
 primaryButtonTextSportiner: {
  color: "#19E675",
  fontSize: 16,
  fontWeight: "700",
 },
 primaryButtonText: {
   color: "#002000",
   fontSize: 16,
   fontWeight: "700",
 },
 primaryButtonTextGreen: {
   color: "#005124",
 },
 secondaryButtonGreen: {
   backgroundColor: "#005124",
 },
 secondaryButtonTextGreen: {
   color: "#FFFFFF",
 },
 progressBarContainer: {
   height: 8,
   borderRadius: 4,
   overflow: "hidden",
   marginTop: 4,
   flexDirection: "row",
   width: "100%",
 },
 progressBarFill: {
   height: "100%",
   borderRadius: 4,
 },
 progressBarEmpty: {
   height: "100%",
   borderRadius: 4,
 },
 fab: {
   position: "absolute",
   bottom: 22,
   right: 18,
   width: 56,
   height: 56,
   borderRadius: 28,
   backgroundColor: "#19E675",
   alignItems: "center",
   justifyContent: "center",
   shadowColor: "#000",
   shadowOffset: { width: 0, height: 6 },
   shadowOpacity: 0.14,
   shadowRadius: 8,
   elevation: 5,
 },
 modalOverlay: {
   flex: 1,
   backgroundColor: 'rgba(0, 0, 0, 0.5)',
   justifyContent: 'flex-end',
   alignItems: 'center',
   paddingBottom: 50,
 },
 feedbackModal: {
  justifyContent: 'flex-end',
  alignItems: 'center',
},
feedbackContent: {
  backgroundColor: '#002000',
  borderRadius: 20,
  paddingHorizontal: 30,
  paddingVertical: 7,
  alignItems: 'center',
  flexDirection: 'row',
  shadowColor: '#000',
  shadowOffset: {
    width: 0,
    height: 4,
  },
  shadowOpacity: 0.25,
  shadowRadius: 10,
  elevation: 10,
},
feedbackIconContainer: {
  marginBottom: 1,
  marginRight: 7
},
feedbackTitle: {
  fontSize: 20,
  fontWeight: '700',
  color: '#19E675',
  textAlign: 'center',
  marginBottom: 3
},
});