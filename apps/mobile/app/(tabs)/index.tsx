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


type Event = {
 title: string;
 date: string;
 location: string;
 avatar: string;
};


type Section = {
 sport: string;
 events: Event[];
};


const sections: Section[] = [
 {
   sport: "Tennis",
   events: [
     {
       title: "John’s Tennis Game",
       date: "10/26 · 10:00 AM",
       location: "Central Park, NY",
       avatar:
         "https://images.unsplash.com/photo-1519681393784-d120267933ba?auto=format&fit=crop&w=200&q=60",
     },
   ],
 },
 {
   sport: "Hockey",
   events: [
     {
       title: "John’s Hockey Game",
       date: "10/26 · 10:00 AM",
       location: "Central Park, NY",
       avatar:
         "https://images.unsplash.com/photo-1519681393784-d120267933ba?auto=format&fit=crop&w=200&q=60",
     },
   ],
 },
 {
   sport: "Pickleball",
   events: [
     {
       title: "John’s Tennis Game",
       date: "10/26 · 10:00 AM",
       location: "Central Park, NY",
       avatar:
         "https://images.unsplash.com/photo-1519681393784-d120267933ba?auto=format&fit=crop&w=200&q=60",
     },
   ],
 },
];


export default function Index() {
 const [mode, setMode] = useState<"1-1" | "Group">("1-1");
 const [selectedFilter, setSelectedFilter] = useState("Today");


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


       {sections.map((section) => (
         <View key={section.sport} style={styles.section}>
           <Text style={styles.sectionTitle}>{section.sport}</Text>
           <ScrollView
             horizontal
             showsHorizontalScrollIndicator={false}
             contentContainerStyle={styles.cardRow}
           >
             {section.events.map((event) => (
               <EventCard key={event.title} event={event} />
             ))}
             <View style={styles.placeholderCard} />
           </ScrollView>
         </View>
       ))}
     </ScrollView>


     <TouchableOpacity style={styles.fab}>
       <Ionicons name="add" size={26} color="#005124" />
     </TouchableOpacity>
   </SafeAreaView>
 );
}


function EventCard({ event }: { event: Event }) {
 return (
   <View style={styles.card}>
     <View style={styles.cardHeader}>
       <Image source={{ uri: event.avatar }} style={styles.avatar} />
       <Text style={styles.cardTitle}>{event.title}</Text>
     </View>


     <View style={styles.infoRow}>
       <Ionicons name="calendar-outline" size={22} color="#0D4B2A" />
       <Text style={styles.infoText}>{event.date}</Text>
     </View>


     <View style={styles.infoRow}>
       <Ionicons name="location-outline" size={22} color="#0D4B2A" />
       <Text style={styles.infoText}>{event.location}</Text>
     </View>


     <TouchableOpacity style={styles.primaryButton}>
       <Text style={styles.primaryButtonText}>Join Game</Text>
     </TouchableOpacity>
   </View>
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
 section: {
   gap: 10,
 },
 sectionTitle: {
   fontSize: 30,
   fontWeight: "900",
   color: "#005124",
 },
 cardRow: {
   flexDirection: "row",
   gap: 12,
   paddingRight: 4,
 },
 placeholderCard: {
   width: 220,
   height: 150,
   borderRadius: 12,
   backgroundColor: "#FFFFFF",
   borderWidth: StyleSheet.hairlineWidth,
   borderColor: "#E5E7EB",
   shadowColor: "#000",
   shadowOffset: { width: 0, height: 4 },
   shadowOpacity: 0.05,
   shadowRadius: 6,
   elevation: 2,
 },
 card: {
   width: 230,
   backgroundColor: "#FFFFFF",
   borderRadius: 12,
   paddingVertical: 10,
   paddingHorizontal: 12,
   shadowColor: "#000",
   shadowOffset: { width: 0, height: 4 },
   shadowOpacity: 0.14,
   shadowRadius: 8,
   elevation: 4,
   borderWidth: StyleSheet.hairlineWidth,
   borderColor: "#E5E7EB",
   gap: 8,
 },
 cardHeader: {
   flexDirection: "row",
   alignItems: "center",
   gap: 8,
 },
 avatar: {
   width: 40,
   height: 40,
   borderRadius: 20,
 },
 cardTitle: {
   flex: 1,
   fontSize: 16,
   fontWeight: "800",
   color: "#005124",
 },
 infoRow: {
   flexDirection: "row",
   alignItems: "center",
   gap: 6,
 },
 infoText: {
   fontSize: 14,
   color: "#005124",
   fontWeight: "600",
 },
 primaryButton: {
   marginTop: 4,
   backgroundColor: "#0CCF67",
   borderRadius: 10,
   paddingVertical: 10,
   alignItems: "center",
 },
 primaryButtonText: {
   color: "#0D4B2A",
   fontSize: 16,
   fontWeight: "900",
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
