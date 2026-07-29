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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { router, useFocusEffect } from "expo-router";
import { useGameTickets } from "@/context/GameTicketsContext";
import { useGames, type Game, isGameInTimeFilter, getDistanceKm } from "@/context/GameContext";
import { getCurrentUser, getCurrentUserId } from "@/context/AuthContext";
import { addUserToChat, chatNavigator, getChatId, userInChat } from "@/context/ChatContext";
import { formatCourtShare } from '@/lib/gamesDb';
import {
  type GeoCoords,
} from '@/lib/courtSuggestions';
import { favoriteParkShortName } from '@/lib/favoriteParks';
import {
  getNotificationPermissionState,
} from '@/lib/pushNotifications';
import * as Location from 'expo-location';
import * as Haptics from 'expo-haptics'
import { supabase } from '@/lib/supabase';
import { saveLatestLocationPosition } from '@/lib/latestLocation';

type SkillLevelPrefill = 'Beginner' | 'Intermediate' | 'Advanced';

function mapUserLevelToSkill(level: unknown): SkillLevelPrefill | null {
  if (typeof level !== 'string') return null;
  switch (level.trim().toLowerCase()) {
    case 'beginner':
      return 'Beginner';
    case 'intermediate':
      return 'Intermediate';
    case 'advanced':
    case 'pro':
      return 'Advanced';
    default:
      return null;
  }
}

type Event = {
  title: string;
  level: "Beginner(400-800)" | "Intermediate(800-1200)" | "Advanced(1200-1600)";
  distance: number | null;
  gameType: string;
  location_name: string;
  status: string;
  time: string;
  date: string;
  venue: string;
  cost: string;
  avatar: string;
  secondaryCta: string;
  spotsFilled?: number;
  spotsTotal?: number;
  hasGreenBackground?: boolean;
  gameId?: string;
  image: string | undefined
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


async function handleOnMessage(
  gameId: string | undefined,
  gameType: string,
  membership: 'joined' | 'pending' | 'none'
) {
  console.log('handleOnMessage fired', { gameId, gameType, membership });

  if (membership !== 'joined') {
    Alert.alert(
      "Can't send message",
      "You need to join this game before you can message players."
    );
    return;
  }

  if (!gameId) {
    Alert.alert('Error', 'Missing gameId');
    return;
  }

  try {
    const inChat = await userInChat(gameId);
    let joinedChatId: string | null = null;

    if (!inChat) {
      joinedChatId = await addUserToChat(gameId, gameType);
      if (!joinedChatId) {
        Alert.alert('Error', 'Unable to open this game chat. Please try again.');
        return;
      }
    }

    const chatId = joinedChatId ?? await getChatId(gameId);

    console.log('chatId result:', chatId);

    if (!chatId) {
      Alert.alert('Error', 'Unable to open chat. Please try again.');
      return;
    }

    await chatNavigator(chatId, gameType);
  } catch (e) {
    console.log('handleOnMessage error', e);
    Alert.alert('Error', 'Failed to open chat');
  }
}
  
function parsePoint(location: any) {
  if (!location) return null;

  // Case 1: PostGIS GeoJSON style
  if (location.coordinates && Array.isArray(location.coordinates)) {
    return {
      lng: location.coordinates[0],
      lat: location.coordinates[1],
    };
  }

  // Case 2: already flat object
  if (typeof location.lng === "number" && typeof location.lat === "number") {
    return {
      lng: location.lng,
      lat: location.lat,
    };
  }

  return null;
}

export default function Index() {
  const [mode, setMode] = useState<"1-1" | "Group">("1-1");
  const [selectedFilter, setSelectedFilter] = useState<"Today" | "Tomorrow" | "This Weekend">("Today");
  const [searchQuery, setSearchQuery] = useState("");
  const [showJoinedGameModal, setShowJoinedGameModal] = useState(false);
  const [joinFeedbackMessage, setJoinFeedbackMessage] = useState("Joined Game");
  const [currentUserId, setCurrentUserId] = useState<string | undefined>(undefined);
  const { requestJoinGame } = useGameTickets();
  const [nearbyOrigin, setNearbyOrigin] = useState<GeoCoords | null>(null);
  const [originReady, setOriginReady] = useState(false);
  const [favoritePark, setFavoritePark] = useState<string | null>(null);
  const [userSkillLevel, setUserSkillLevel] = useState<SkillLevelPrefill | null>(null);
  const [userAvailability, setUserAvailability] = useState<unknown>(null);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);
  const alternativesOffsetRef = useRef(0);


  const {
    games,
    refreshGames,
    joinedGameIds,
    pendingGameIds,
  } = useGames();

  useFocusEffect(
    useCallback(() => {
      refreshGames();

      let active = true;
      (async () => {
        try {
          const [user, permission] = await Promise.all([
            getCurrentUser(),
            getNotificationPermissionState(),
          ]);
          if (!active) return;

          const park =
            typeof user?.favorite_park === 'string' && user.favorite_park.trim()
              ? user.favorite_park.trim()
              : null;
          setFavoritePark(park);
          setUserSkillLevel(mapUserLevelToSkill(user?.level));
          setUserAvailability(user?.availability ?? null);
          setNotificationsEnabled(
            permission === 'granted' ||
              permission === 'provisional' ||
              permission === 'ephemeral'
          );
        } catch (error) {
          console.log('Failed to load discover empty-state profile', error);
        }
      })();

      return () => {
        active = false;
      };
    }, [refreshGames])
  );

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        const { status } = await Location.getForegroundPermissionsAsync();

        if (status !== 'granted') {
          console.log('Location permission not granted; showing games without distance sorting');
          return;
        }

        const position = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Highest,
        });

        if (!active) return;

        const coords = {
          lat: Number(position.coords.latitude),
          lng: Number(position.coords.longitude),
        };

        console.log('LOCKED USER ORIGIN:', coords);

        setSafeOrigin(coords);
        void saveLatestLocationPosition(position, 'nearby_games');
      } catch (e) {
        console.log('Location error', e);
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  const setSafeOrigin = (coords: GeoCoords) => {
    if (
      !coords ||
      !isFinite(coords.lat) ||
      !isFinite(coords.lng) ||
      Math.abs(coords.lat) > 90 ||
      Math.abs(coords.lng) > 180
    ) {
      console.log('Invalid origin rejected:', coords);
      return;
    }
  
    if (coords.lat === 0 && coords.lng === 0) {
      console.log('Invalid zero origin rejected:', coords);
      return;
    }
  
    setNearbyOrigin(coords);
    setOriginReady(true);
  };


  useEffect(() => {
    let isMounted = true;

    const loadCurrentUserId = async () => {
      const user = await getCurrentUserId();
      if (isMounted) {
        setCurrentUserId(user?.id);
      }
    };

    loadCurrentUserId();

    return () => {
      isMounted = false;
    };
  }, []);

  

function gameToEvent(g: Game): Event {
  const needsApproval = g.joinSetting.includes("Approval");
  const isFull = g.players_enrolled >= g.capacity;
  return {
    title: g.title,
    level: skillToEventLevel(g.skillLevel),
    distance:
      nearbyOrigin && g.locationCoords
        ? getDistanceKm(
            { lat: nearbyOrigin.lat, lng: nearbyOrigin.lng },
            { lat: g.locationCoords.lat, lng: g.locationCoords.lng }
          )
        : null,
    gameType: g.gameType,
    location_name: g.location_name,
    status: isFull ? "full" : "open",
    time: formatDiscoverTime(g.date, g.time),
    date: '',
    venue: g.courtType,
    cost: formatCourtShare(g.isPaid, g.payment_amount, 'compact'),
    avatar: g.host.avatar,
    secondaryCta: needsApproval ? "Request Spot" : "Join Game",
    spotsFilled: g.players_enrolled,
    spotsTotal: g.capacity,
    hasGreenBackground: false,
    gameId: g.id,
    image: g.image ?? undefined
  };
}

  // Auto-dismiss joined game modal after 1.8s
  useEffect(() => {
    if (!showJoinedGameModal) {
      return;
    }

    const timeout = setTimeout(() => {
      setShowJoinedGameModal(false);
    }, 1800);

    return () => clearTimeout(timeout);
  }, [showJoinedGameModal]);

  const matchesSearch = (title: string) =>
    searchQuery === "" || title.toLowerCase().includes(searchQuery.toLowerCase());

  const modeGames = useMemo(
    () =>
      games
        .filter((g) => (mode === "1-1" ? g.gameType === "1v1" : g.gameType === "Group"))
        .filter((g) => (currentUserId ? g.hostId !== currentUserId : true))
        .filter((g) => matchesSearch(g.title)),
    [games, mode, currentUserId, searchQuery]
  );

  const primaryGames = useMemo(() => {
    return modeGames
      .filter((g) => isGameInTimeFilter(g.date, selectedFilter))
      .filter((g) => (favoritePark ? g.location_name === favoritePark : true));
  }, [modeGames, selectedFilter, favoritePark]);

  const primaryEvents = useMemo(
    () => primaryGames.map(gameToEvent),
    [primaryGames, nearbyOrigin]
  );

  const alternativeGames = useMemo(() => {
    const primaryIds = new Set(primaryGames.map((g) => g.id));
    const remaining = modeGames.filter(
      (g) => !primaryIds.has(g.id) && g.players_enrolled < g.capacity
    );

    const score = (g: Game) => {
      let value = 0;
      if (favoritePark && g.location_name === favoritePark) value += 4;
      if (isGameInTimeFilter(g.date, selectedFilter)) value += 2;
      if (favoritePark && g.location_name !== favoritePark) value += 1;
      return value;
    };

    return [...remaining]
      .sort((a, b) => score(b) - score(a) || a.date.localeCompare(b.date))
      .slice(0, 8);
  }, [modeGames, primaryGames, favoritePark, selectedFilter]);

  const alternativeEvents = useMemo(
    () => alternativeGames.map(gameToEvent),
    [alternativeGames, nearbyOrigin]
  );

  const parkShortName = favoriteParkShortName(favoritePark);
  const modeLabel = mode === "Group" ? "group" : "1-1";
  const dayLabel =
    selectedFilter === "Today"
      ? "today"
      : selectedFilter === "Tomorrow"
        ? "tomorrow"
        : "this weekend";

  const emptyTitle = parkShortName
    ? `No ${modeLabel} games at ${parkShortName} ${dayLabel}`
    : `No ${modeLabel} games ${dayLabel}`;

  const emptySubtitle = parkShortName
    ? "Be the first to create one, or explore games at nearby parks."
    : "Be the first to create one, or check another day.";

  const alternativesSectionTitle = useMemo(() => {
    if (alternativeGames.length === 0) return "Games you might like";
    const hasOtherDay = alternativeGames.some(
      (g) => !isGameInTimeFilter(g.date, selectedFilter)
    );
    const hasOtherPark = Boolean(
      favoritePark &&
        alternativeGames.some((g) => g.location_name !== favoritePark)
    );
    if (hasOtherDay && !hasOtherPark) return "Games on other days";
    if (hasOtherPark && !hasOtherDay) return "Games nearby";
    return "Games you might like";
  }, [alternativeGames, selectedFilter, favoritePark]);

  const openPrefillCreateGame = () => {
    router.push({
      pathname: '/(tabs)/CreateGame',
      params: {
        prefill: '1',
        park: favoritePark ?? '',
        level: userSkillLevel ?? '',
        type: mode === '1-1' ? '1v1' : 'Group',
        availability:
          userAvailability != null ? JSON.stringify(userAvailability) : '',
      },
    });
  };

  const browseNearbyGames = () => {
    if (searchQuery.trim().length > 0) {
      setSearchQuery('');
    }

    if (alternativeEvents.length > 0) {
      scrollViewRef.current?.scrollTo({
        y: Math.max(alternativesOffsetRef.current - 12, 0),
        animated: true,
      });
      return;
    }

    // No alternatives yet — advance the day filter so Discover still finds supply.
    if (selectedFilter === "Today") {
      setSelectedFilter("Tomorrow");
      return;
    }
    if (selectedFilter === "Tomorrow") {
      setSelectedFilter("This Weekend");
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <ScrollView
        ref={scrollViewRef}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
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
{(["Today", "Tomorrow", "This Weekend"] as const).map((label) => {            
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

        {primaryEvents.length === 0 ? (
          <View style={styles.emptyState}>
            <View style={styles.emptyIconShell}>
              <Ionicons name="tennisball-outline" size={22} color="#19E675" />
            </View>
            <Text style={styles.emptyTitle}>{emptyTitle}</Text>
            <Text style={styles.emptySubtitle}>{emptySubtitle}</Text>

            <View style={styles.emptyActions}>
              <TouchableOpacity
                onPress={openPrefillCreateGame}
                activeOpacity={0.75}
              >
                <Text style={styles.emptyCreateLink}>
                  {parkShortName
                    ? `Create one at ${parkShortName} →`
                    : 'Create a game →'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity onPress={browseNearbyGames} activeOpacity={0.75}>
                <Text style={styles.emptyBrowseLink}>Browse nearby games</Text>
              </TouchableOpacity>
            </View>

            {notificationsEnabled ? (
              <Text style={styles.emptyNotifyText}>
                We’ll notify you when a matching game is created.
              </Text>
            ) : null}
          </View>
        ) : (
          primaryEvents.map((event, idx) => (
            <EventCard
              key={event.gameId ?? `seed-${event.title}-${idx}`}
              event={event}
              mode={mode}
              router={router}
              requestJoinGame={requestJoinGame}
              refreshGames={refreshGames}
              joinedGameIds={joinedGameIds}
              pendingGameIds={pendingGameIds}
              setShowJoinedGameModal={setShowJoinedGameModal}
              setJoinFeedbackMessage={setJoinFeedbackMessage}
            />
          ))
        )}

        {primaryEvents.length === 0 && alternativeEvents.length > 0 ? (
          <View
            style={styles.alternativesSection}
            onLayout={(event) => {
              alternativesOffsetRef.current = event.nativeEvent.layout.y;
            }}
          >
            <Text style={styles.alternativesTitle}>{alternativesSectionTitle}</Text>
            {alternativeEvents.map((event, idx) => (
              <EventCard
                key={event.gameId ?? `alt-${event.title}-${idx}`}
                event={event}
                mode={mode}
                router={router}
                requestJoinGame={requestJoinGame}
                refreshGames={refreshGames}
                joinedGameIds={joinedGameIds}
                pendingGameIds={pendingGameIds}
                setShowJoinedGameModal={setShowJoinedGameModal}
                setJoinFeedbackMessage={setJoinFeedbackMessage}
              />
            ))}
          </View>
        ) : null}
      </ScrollView>

      <TouchableOpacity
        style={styles.fab}
        onPress={openPrefillCreateGame}
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
              <Text style={styles.feedbackTitle}>{joinFeedbackMessage}</Text>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

function EventCard({
  event,
  mode,
  router,
  requestJoinGame,
  refreshGames,
  joinedGameIds,
  pendingGameIds,
  setShowJoinedGameModal,
  setJoinFeedbackMessage,
}: {
  event: Event;
  mode: "1-1" | "Group";
  router: any;
  requestJoinGame: (gameData: {
    gameId: string;
    gameTitle: string;
    gameType: string;
    gameStatus?: string;
    gameDetails?: {
      date: string;
      time: string;
      location: string;
      host: string;
    };
  }) => Promise<{ error: string | null; result?: string }>;
  refreshGames: () => Promise<void>;
  joinedGameIds: string[];
  pendingGameIds: string[];
  setShowJoinedGameModal: (show: boolean) => void;
  setJoinFeedbackMessage: (message: string) => void;
}) {
  const isGroupMode = mode === "Group";
  const hasGreenBg = isGroupMode && event.hasGreenBackground;

  const cardStyle = hasGreenBg ? styles.cardGreen : styles.card;

  const membership = useMemo(() => {
    if (!event.gameId) {
      return 'none' as const;
    }

    if (joinedGameIds.includes(event.gameId)) {
      return 'joined' as const;
    }

    if (pendingGameIds.includes(event.gameId)) {
      return 'pending' as const;
    }

    return 'none' as const;
  }, [event.gameId, joinedGameIds, pendingGameIds]);

  const isFull = event.status === 'full';

  const joinLabel = useMemo(() => {
    if (membership === 'joined') {
      return 'Joined';
    }

    if (membership === 'pending') {
      return 'Requested';
    }

    if (isFull) {
      return 'Game Full';
    }

    return event.secondaryCta;
  }, [membership, isFull, event.secondaryCta]);

  const joinDisabled =
    membership === 'joined' ||
    membership === 'pending' ||
    isFull;

  const handleJoinGame = async () => {
    if (!event.gameId) {
      Alert.alert("Join request", "This game cannot be joined.");
      return;
    }

    const hostName = event.title.split("'s")[0];

    const { error, result } = await requestJoinGame({
      gameId: event.gameId,
      gameTitle: event.title,
      gameType: event.gameType,
      gameStatus: event.status,
      gameDetails: {
        date: event.time.split(" • ")[0],
        time: event.time.split(" • ")[1] || event.time,
        location: event.location_name,
        host: hostName,
      },
    });

    if (error) {
      Alert.alert("Join request", error);
      return;
    }

    setTimeout(() => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }, 90);

    await refreshGames();

    if (result === 'requested') {
      setJoinFeedbackMessage('Request Sent!');
    } else {
      setJoinFeedbackMessage('Joined Game');
    }

    setShowJoinedGameModal(true);
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
          <View style={styles.fullBadge}>
            <Text style={styles.fullBadgeText}>Full</Text>
          </View>}
        </View>
          <View style={styles.cardMetaRow}>
            <Text style={event.title ==='Sportiner Event' ? styles.cardLevelSportiner : event.status === 'full' ? styles.cardLevelFull : styles.cardLevel}>{event.level}</Text>
            {event.distance !== null && event.distance !== undefined && <Text style={styles.cardMetaDot}> • </Text>}
            <Text style={event.title ==='Sportiner Event' ? styles.cardDistanceSportiner : event.status === 'full' ? styles.cardDistanceFull : styles.cardDistance}>{event.distance != null ? `${event.distance.toFixed(1)} km` : ""}</Text>
          </View>
      </View>
    </View>
    <>
       <View style={styles.infoView}>
       <Ionicons name="location-outline" color={event.title ==='Sportiner Event' ? "#002000" : event.status === 'full' ? "#9CA3AF" : "#4B5563"} size={16}></Ionicons>
         <Text style={event.title ==='Sportiner Event' ? styles.locationTextSportiner : event.status === 'full' ? styles.locationTextFull : styles.locationText}>
           {event.location_name}
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
               {event.spotsFilled}/{event.spotsTotal} Players Joined
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
      {event.title === "Sportiner Event" ? null : (
        <TouchableOpacity
          style={[
            event.status === 'full' ? styles.secondaryButtonFull : styles.secondaryButton,
          ]}
          onPress={async () => {
            console.log('📩 MESSAGE BUTTON PRESSED', {
              gameId: event.gameId,
              gameType: event.gameType,
            });

            if (!event.gameId) {
              Alert.alert('Error', 'Missing gameId');
              return;
            }

            await handleOnMessage(event.gameId, event.gameType, membership);
          }}
        >
          <Text
            style={[
              event.status === 'full' ? styles.secondaryButtonTextFull : styles.secondaryButtonText,
            ]}
          >Message
          </Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity
        style={[
          membership === 'joined' || membership === 'pending'
            ? styles.requestedSpotButton
            : isFull
            ? styles.mathFullButton
            : event.title === 'Sportiner Event'
            ? styles.primaryButtonSportiner
            : styles.primaryButton,
        ]}
        disabled={joinDisabled}
        onPress={isFull ? undefined : handleJoinGame}
      >
        <Text
          style={[
            membership === 'joined' || membership === 'pending'
              ? styles.requestedSpotText
              : isFull
              ? styles.mathFullText
              : event.title === 'Sportiner Event'
              ? styles.primaryButtonTextSportiner
              : styles.primaryButtonText,
          ]}
        >
          {joinLabel}
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
 emptyState: {
   marginTop: 6,
   paddingHorizontal: 6,
   paddingVertical: 14,
   alignItems: "center",
   gap: 8,
 },
 emptyIconShell: {
   width: 44,
   height: 44,
   borderRadius: 22,
   backgroundColor: "rgba(25, 230, 117, 0.12)",
   alignItems: "center",
   justifyContent: "center",
   marginBottom: 2,
 },
 emptyTitle: {
   fontSize: 18,
   fontWeight: "800",
   color: "#1F2937",
   textAlign: "center",
   lineHeight: 24,
 },
 emptySubtitle: {
   fontSize: 14,
   lineHeight: 20,
   color: "#6B7280",
   textAlign: "center",
 },
 emptyActions: {
   alignItems: "center",
   gap: 10,
   marginTop: 6,
 },
 emptyCreateLink: {
   color: "#19E675",
   fontSize: 15,
   fontWeight: "700",
 },
 emptyBrowseLink: {
   color: "#6B7280",
   fontSize: 14,
   fontWeight: "600",
 },
 emptyNotifyText: {
   marginTop: 4,
   fontSize: 12,
   lineHeight: 16,
   color: "#9CA3AF",
   textAlign: "center",
 },
 alternativesSection: {
   marginTop: 8,
   gap: 14,
 },
 alternativesTitle: {
   fontSize: 16,
   fontWeight: "800",
   color: "#121212",
   marginTop: 4,
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
 fullBadge: {
  alignSelf: 'flex-start',
  backgroundColor: "#E5E7EB",
  borderColor: "#D1D5DB",
  borderRadius: 20,
  paddingHorizontal: 15,
  paddingVertical: 5,
 },
 fullBadgeText: {
  color: "#6B7280",
  fontWeight: "600",
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
 requestedSpotButton: {
  borderColor: '#4A6B54',
  borderWidth: 2,
  backgroundColor: 'rgba(25, 230, 117, 0.2)',
  borderRadius: 30,
  paddingVertical: 12,
  alignItems: 'center',
  flex: 1,
 },
 requestedSpotText: {
  color: '#4A6B54',
  fontSize: 16,
  fontWeight: '700',
 },
 mathFullButton: {
  borderColor: '#D1D5DB',
  borderWidth: 2,
  backgroundColor: '#E5E7EB',
  borderRadius: 30,
  paddingVertical: 12,
  alignItems: 'center',
  flex: 1,
 },
 mathFullText: {
  color: '#6B7280',
  fontSize: 16,
  fontWeight: '700',
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
