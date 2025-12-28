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


type Event = {
  title: string;
  level: "Beginner" | "Intermediate" | "Advanced";
  distance: string;
  address: string;
  time: string;
  venue: string;
  cost: string;
  avatar: string;
  primaryCta: string;
  secondaryCta: string;
  spotsFilled?: number;
  spotsTotal?: number;
  hasGreenBackground?: boolean;
};

const events1v1: Event[] = [
 {
   title: "John's Tennis Game",
   level: "Intermediate",
   distance: "500m",
   address: "100 Steels Avenue",
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
   level: "Advanced",
   distance: "1.2km",
   address: "1200 Steels Avenue",
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
   level: "Beginner",
   distance: "500m",
   address: "300 Steels Avenue",
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
   level: "Advanced",
   distance: "500m",
   address: "300 Steels Avenue",
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
 const router = useRouter();


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
             color={mode === "1-1" ? "#19E675" : "#005124"}
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
             color={mode === "Group" ? "#19E675" : "#005124"}
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


       {((mode === "1-1" ? events1v1 : eventsGroup)
         .filter(event => 
           searchQuery === "" || 
           event.title.toLowerCase().includes(searchQuery.toLowerCase())
         )
       ).map((event) => (
         <EventCard key={event.title} event={event} mode={mode} router={router} />
       ))}
     </ScrollView>


     <TouchableOpacity style={styles.fab}>
       <Ionicons name="add" size={26} color="#005124" />
     </TouchableOpacity>
   </SafeAreaView>
 );
}


function EventCard({ event, mode, router }: { event: Event; mode: "1-1" | "Group"; router: any }) {
 const isGroupMode = mode === "Group";
 const hasGreenBg = isGroupMode && event.hasGreenBackground;
 const levelColor = hasGreenBg && event.level === "Beginner"
   ? "#FFFFFF"
   : event.level === "Advanced" 
   ? "#19E675" 
   : event.level === "Beginner" 
   ? "#19E675" 
   : "#1FC365";

 const cardStyle = hasGreenBg ? styles.cardGreen : styles.card;
 const textColor = hasGreenBg ? "#FFFFFF" : "#4B5563";
 const titleColor = hasGreenBg ? "#FFFFFF" : "#303030";
 const dotColor = hasGreenBg ? "#FFFFFF" : "#4B5563";
 const spotsTextColor = isGroupMode ? "#005124" : "#4B5563";

 return (
   <TouchableOpacity 
     style={cardStyle}
     onPress={() => router.push('/(tabs)/EventDetails')}
   >
     <View style={styles.cardHeader}>
       <Image source={{ uri: event.avatar }} style={styles.avatar} />
       <Text style={[styles.cardTitle, { color: titleColor }]}>
         {event.title}
       </Text>
     </View>

     <View style={styles.infoRow}>
       <Text style={[styles.level, { color: levelColor }]}>
         {event.level}
       </Text>
       <Text style={[styles.dot, { color: dotColor }]}>•</Text>
       <Text style={[styles.infoText, { color: textColor }]}>
         {event.distance}
       </Text>
     </View>

     {isGroupMode ? (
       <>
         <Text style={[styles.infoText, { color: textColor }]}>
           {event.address}
         </Text>
         <Text style={[styles.infoText, { color: textColor }]}>
           {event.cost}
         </Text>
         <Text style={[styles.infoText, { color: textColor }]}>
           {event.time}
         </Text>
         {event.spotsFilled !== undefined && event.spotsTotal !== undefined && (
           <>
             <Text style={[styles.infoText, { color: spotsTextColor, marginTop: 4 }]}>
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
     ) : (
       <>
         <Text style={[styles.infoText, { color: textColor }]}>
           {event.address}
         </Text>
         <Text style={[styles.infoText, { color: textColor }]}>
           {event.time}
         </Text>
         <View style={styles.infoRow}>
           <Text style={[styles.infoText, { color: textColor }]}>
             {event.venue}
           </Text>
           <Text style={[styles.dot, { color: dotColor }]}>•</Text>
           <Text style={[styles.infoText, { color: textColor }]}>
             {event.cost}
           </Text>
         </View>
       </>
     )}

     <View style={styles.buttonRow}>
       <TouchableOpacity
         style={[
           styles.secondaryButton,
           hasGreenBg && styles.secondaryButtonGreen,
         ]}
         onPress={() => router.push('/(tabs)/chat')}
       >
         <Text
           style={[
             styles.secondaryButtonText,
             hasGreenBg && styles.secondaryButtonTextGreen,
           ]}
         >
           {event.primaryCta}
         </Text>
       </TouchableOpacity>
       <TouchableOpacity
         style={[
           styles.primaryButton,
           hasGreenBg && styles.primaryButtonGreen,
         ]}
       >
         <Text
           style={[
             styles.primaryButtonText,
             hasGreenBg && styles.primaryButtonTextGreen,
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
   color: "#005124",
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
   borderRadius: 12,
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
   borderWidth: StyleSheet.hairlineWidth,
   borderColor: "#E5E7EB",
   gap: 8,
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
   marginBottom: 4,
 },
 avatar: {
   width: 54,
   height: 54,
   borderRadius: 27,
 },
 cardTitle: {
   flex: 1,
   fontSize: 20,
   fontWeight: "800",
   color: "#303030",
 },
 infoRow: {
   flexDirection: "row",
   alignItems: "center",
   gap: 6,
 },
 infoText: {
   fontSize: 16,
   color: "#4B5563",
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
 secondaryButton: {
   flex: 1,
   backgroundColor: "#0D4B2A",
   borderRadius: 12,
   paddingVertical: 12,
   alignItems: "center",
 },
 secondaryButtonText: {
   color: "#21C567",
   fontSize: 16,
   fontWeight: "800",
 },
 primaryButton: {
   flex: 1,
   backgroundColor: "#0CCF67",
   borderRadius: 12,
   paddingVertical: 12,
   alignItems: "center",
 },
 primaryButtonGreen: {
   backgroundColor: "#FFFFFF",
 },
 primaryButtonText: {
   color: "#FFFFFF",
   fontSize: 16,
   fontWeight: "800",
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
});
