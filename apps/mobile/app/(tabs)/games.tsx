import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Dimensions,
  Alert,
  Modal,
  TouchableWithoutFeedback,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useGames, Game, getDistanceKm, gameVerified, deleteGame as deleteGameFromDb, withdrawRequest } from '@/context/GameContext';
import { supabase, useAuth } from '@/context/AuthContext';
import { addUserToChat, chatNavigator, getChatId, getplayers, submitModerationReport, userInChat } from '@/context/ChatContext';
import ReportModal from '@/components/ReportModal';
import { formatCourtShare } from '@/lib/gamesDb';
import * as Location from 'expo-location';
import { saveLatestLocationPosition } from '@/lib/latestLocation';
import { type GeoCoords } from '@/lib/courtSuggestions';
import * as Calendar from 'expo-calendar';
import moment from 'moment';
import { shareGame } from '@/lib/gameShare';

interface GameRequest {
  game_id: string;
  game_title: string;
  requester_user_id: string;
  status: string;
}

const { width, height } = Dimensions.get('window');
const CARD_WIDTH = width - 32; 

type GameStatus = {
  type: 'spots' | 'booked' | 'requested' | 'full' | 'verify' | 'verified';
  label: string;
  color: string;
  backgroundcolor: string;
  icon: string;
};

type GameCard = {
  id: string;
  publicId?: string | null;
  hostId: string;
  title: string;
  level?: string;
  type?: string;
  distance?: string;
  address?: string;
  cost?: string;
  time?: string;
  avatar?: string | null;
  statuses?: GameStatus[];
  date?: string;
  image?: string | null;
  verified?: boolean,
  status?: GameStatus;
  players?: {
    avatar: string | null;
    name?: string;
    skillLevel?: string;
  }[];
  extraPlayers?: number;
  section?: 'pastHosted' | 'pastPlayed' | 'hosting' | 'playing';
  location?: string;
};


export default function Games() {
  const router = useRouter();
  const {
    games,
    refreshGames,
    getMyGames,
    getMyPlayingGames,
    getPastGames,
    getIncomingRequests,
    joinedGameIds,
    pendingGameIds,
  } = useGames();
  const { user } = useAuth();
  const [myGames, setMyGames] = useState<Game[]>([]);
  const [myPlayingGames, setMyPlayingGames] = useState<Game[]>([]);
  const [myHostedGames, setMyHostedGames] = useState<Game[]>([]);
  const [myPlayedGames, setMyPlayedGames] = useState<Game[]>([]);
  const [incomingRequests, setIncomingRequests] = useState<GameRequest[]>([]);
  const [verifiedGames, setVerifiedGames] = useState<Set<string>>(new Set());
  const [playersMap, setPlayersMap] = useState<Record<string, any[]>>({});
  const [loading, setLoading] = useState(false);
  const [nearbyOrigin, setNearbyOrigin] = useState<GeoCoords | null>(null);


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

        if (
          isFinite(coords.lat) &&
          isFinite(coords.lng) &&
          Math.abs(coords.lat) <= 90 &&
          Math.abs(coords.lng) <= 180 &&
          !(coords.lat === 0 && coords.lng === 0)
        ) {
          setNearbyOrigin(coords);
          void saveLatestLocationPosition(position, 'nearby_games');
        }
      } catch (e) {
        console.log('Location error', e);
      }
    })();

    return () => {
      active = false;
    };
  }, []);


  const [error, setError] = useState<string | null>(null);
  const { feedbackSubmitted } = useLocalSearchParams<{ feedbackSubmitted?: string }>();
  const [activeTab, setActiveTab] = useState<'Past' | 'Upcoming'>('Upcoming');
  const hostingScrollRef = useRef<ScrollView>(null);
  const playingScrollRef = useRef<ScrollView>(null);
  const pastHostingScrollRef = useRef<ScrollView>(null);
  const pastPlayingScrollRef = useRef<ScrollView>(null);
  const [hostingScrollIndex, setHostingScrollIndex] = useState(0);
  const [playingScrollIndex, setPlayingScrollIndex] = useState(0);
  const [pastHostingScrollIndex, setPastHostingScrollIndex] = useState(0);
  const [pastPlayingScrollIndex, setPastPlayingScrollIndex] = useState(0);
  const [selectedGame, setSelectedGame] = useState<GameCard | null>(null);
  const [reportTarget, setReportTarget] = useState<GameCard | null>(null);
  const [submittingReport, setSubmittingReport] = useState(false);
  const [showPlayers, setShowPlayers] = useState(false);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const isSupabaseConfigured = Boolean(supabase);

  const feedbackShownRef = useRef(false);

  useEffect(() => {
    
    if (feedbackSubmitted === 'true' && !feedbackShownRef.current) {
      feedbackShownRef.current = true;
      
     
      router.replace('/games');
      

      setShowFeedbackModal(true);
      
      setTimeout(() => {
        setShowFeedbackModal(false);
      }, 2500);
    }
  }, [feedbackSubmitted, router]);

  useFocusEffect(
    useCallback(() => {
      const loadData = async () => {
        
        setLoading(true);
        setError(null);
        try {
          await refreshGames();

          if (user?.id && isSupabaseConfigured) {
            const [myGamesList, playingList, pastGames, requests] = await Promise.all([
              getMyGames(),
              getMyPlayingGames(),
              getPastGames(),
              getIncomingRequests(),
            ]);
            setMyGames(myGamesList);
            setMyPlayingGames(playingList);
            setMyHostedGames(pastGames.hosted);
            setMyPlayedGames(pastGames.played);
            setIncomingRequests(requests);

            // Check verification status for past games
            const verifiedSet = new Set<string>();
            const allPastGames = [...pastGames.hosted, ...pastGames.played];
            for (const game of allPastGames) {
              const isVerified = await gameVerified(game.id, user.id);
              if (isVerified) {
                verifiedSet.add(game.id);
              }
            }
            setVerifiedGames(verifiedSet);
          }
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Failed to load data');
        } finally {
          setLoading(false);
        }
      };

      loadData();
    }, [refreshGames, user?.id, getMyGames, getMyPlayingGames, getPastGames, getIncomingRequests, isSupabaseConfigured])
  );

  useEffect(() => {
    const loadPlayers = async () => {
      try {
        const allGames = [...myHostedGames, ...myPlayedGames];

        const entries = await Promise.all(
          allGames.map(async (game) => {
            const data = await getplayers(game.id);
            return [game.id, data ?? []];
          })
        );

        setPlayersMap(Object.fromEntries(entries));
      } catch (e) {
        console.log('failed loading players map', e);
      }
    };

    if (myHostedGames.length || myPlayedGames.length) {
      loadPlayers();
    }
  }, [myHostedGames, myPlayedGames]);

  const formatGameDate = (dateString: string | undefined) => {
    if (!dateString) return 'Date TBD';
    const date = new Date(dateString);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    if (date.toDateString() === today.toDateString()) {
      return 'Today';
    } else if (date.toDateString() === tomorrow.toDateString()) {
      return 'Tomorrow';
    } else {
      return date.toLocaleDateString('en-US', { 
        month: 'long', 
        day: 'numeric' 
      });
    }
  };

  const getPlayers = async (gameId: string) => {
    if (!gameId) {
      return;
    }

    try {
      const data = await getplayers(gameId);

      if (!data || !Array.isArray(data)) {
        return;
      }

      return data

    } catch (error) {
      console.log('failed loading players', error);
    }
  };


  const gameToCard = useCallback((game: Game): GameCard => {
    const formatDate = (dateString: string) => {
      const date = new Date(dateString);
      const today = new Date();
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      if (date.toDateString() === today.toDateString()) {
        return 'Today';
      }
      if (date.toDateString() === tomorrow.toDateString()) {
        return 'Tomorrow';
      }
      return date.toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
      });
    };

    const formatTime = (timeString: string) => {
      const [hours] = timeString.split(':');
      const hour = parseInt(hours, 10);
      const ampm = hour >= 12 ? 'PM' : 'AM';
      const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
      return `${displayHour} ${ampm}`;
    };

    return {
      id: game.id,
      publicId: game.publicId,
      hostId: game.hostId,
      title: game.title,
      level: game.skillLevel,
      type: game.gameType,
      distance:
        nearbyOrigin && game.locationCoords
          ? `${getDistanceKm(
              {
                lat: nearbyOrigin.lat,
                lng: nearbyOrigin.lng,
              },
              {
                lat: game.locationCoords.lat,
                lng: game.locationCoords.lng,
              }
            ).toFixed(1)} km`
          : '',
      address: game.location_name,
      cost: formatCourtShare(game.isPaid, game.payment_amount),
      time: `${formatDate(game.date)} • ${formatTime(game.time)}`,
      avatar: game.host.avatar,
      statuses: game.statuses || [],
      players: game.players || [],
    };
  }, [nearbyOrigin]);

  const availableGamesList: GameCard[] = useMemo(
    () =>
      games
        .filter((g) => 
          user?.id && 
          g.hostId !== user.id && 
          !joinedGameIds.includes(g.id) &&
          !pendingGameIds.includes(g.id)
        )
        .map(gameToCard),
    [games, user?.id, joinedGameIds, pendingGameIds, gameToCard]
  );

  const hostedGamesList: GameCard[] = useMemo(
    () => myHostedGames.map(game => {
      const card = gameToCard(game);
      const isVerified = verifiedGames.has(game.id);
      return {
        ...card,
        section: 'pastHosted',
        verified: isVerified,
        status: isVerified ? {
          type: 'verified',
          label: 'Games & Levels verified',
          color: '#002000',
          backgroundcolor: '#19E675',
          icon: 'checkmark',
        } : {
          type: 'verify',
          label: 'Verify Game & Levels',
          color: '#002000',
          backgroundcolor: '#19E675',
          icon: 'checkmark',
        },
      };
    }),
    [myHostedGames, verifiedGames, gameToCard]
  );

  const playedGamesList: GameCard[] = useMemo(
    () => myPlayedGames.map(game => {
      const card = gameToCard(game);
      const isVerified = verifiedGames.has(game.id);
      return {
        ...card,
        section: 'pastPlayed',
        verified: isVerified,
        status: isVerified ? {
          type: 'verified',
          label: 'Games & Levels verified',
          color: '#002000',
          backgroundcolor: '#19E675',
          icon: 'checkmark',
        } : {
          type: 'verify',
          label: 'Verify Game & Levels',
          color: '#002000',
          backgroundcolor: '#19E675',
          icon: 'checkmark',
        },
      };
    }),
    [myPlayedGames, verifiedGames, gameToCard]
  );
  
  const hostingGamesList: GameCard[] = useMemo(
    () =>
      myGames.map((game) => ({
        ...gameToCard(game),
        section: 'hosting',
      })),
    [myGames, gameToCard]
  );

  const playingGamesList: GameCard[] = useMemo(
    () =>
      myPlayingGames.map((game) => ({
        ...gameToCard(game),
        section: 'playing',
      })),
    [myPlayingGames, gameToCard]
  );

  const pendingRequestCount = useMemo(
    () => incomingRequests.length,
    [incomingRequests]
  );

  const getLevelColor = (level: string) => {
    switch (level.toLowerCase()) {
      case 'advanced':
        return '#19E675'; 
      case 'intermediate':
        return '#FFD700'; 
      case 'beginner':
        return '#FF0000'; 
      default:
        return '#000000'; 
    }
  };

  const scrollHosting = (direction: 'left' | 'right') => {
    const newIndex = direction === 'right' ? hostingScrollIndex + 1 : hostingScrollIndex - 1;
    if (newIndex >= 0 && newIndex < hostingGamesList.length) {
      hostingScrollRef.current?.scrollTo({ x: newIndex * CARD_WIDTH, animated: true });
      setHostingScrollIndex(newIndex);
    }
  };

  const scrollPlaying = (direction: 'left' | 'right') => {
    const newIndex = direction === 'right' ? playingScrollIndex + 1 : playingScrollIndex - 1;
    if (newIndex >= 0 && newIndex < playingGamesList.length) {
      playingScrollRef.current?.scrollTo({ x: newIndex * CARD_WIDTH, animated: true });
      setPlayingScrollIndex(newIndex);
    }
  };

  const scrollPastHosting = (direction: 'left' | 'right') => {
    const newIndex = direction === 'right' ? pastHostingScrollIndex + 1 : pastHostingScrollIndex - 1;
    if (newIndex >= 0 && newIndex < hostedGamesList.length) {
      pastHostingScrollRef.current?.scrollTo({ x: newIndex * CARD_WIDTH, animated: true });
      setPastHostingScrollIndex(newIndex);
    }
  };

  const scrollPastPlaying = (direction: 'left' | 'right') => {
    const newIndex = direction === 'right' ? pastPlayingScrollIndex + 1 : pastPlayingScrollIndex - 1;
    if (newIndex >= 0 && newIndex < playedGamesList.length) {
      pastPlayingScrollRef.current?.scrollTo({ x: newIndex * CARD_WIDTH, animated: true });
      setPastPlayingScrollIndex(newIndex);
    }
  };

  const handleMenuPress = (game: GameCard) => {
    setSelectedGame(game);
    setShowMenu(true);
  };

  const openReportGame = () => {
    if (!selectedGame || !selectedGame.hostId || selectedGame.hostId === user?.id) {
      setShowMenu(false);
      return;
    }

    setReportTarget(selectedGame);
    setShowMenu(false);
  };

  const handleSubmitGameReport = async (reason: string, details: string) => {
    if (!reportTarget) return;

    setSubmittingReport(true);
    const success = await submitModerationReport({
      reportedUserId: reportTarget.hostId,
      reportedPostId: reportTarget.id,
      reason,
    });
    setSubmittingReport(false);

    if (!success) {
      Alert.alert('Error', 'Failed to submit report');
      return;
    }

    setReportTarget(null);
    Alert.alert(
      'Report submitted',
      'Our moderation team will review this game and take action if it violates our Community Guidelines.'
    );
  };

  const handleLeaveGame = () => {
    if (!selectedGame || selectedGame.section !== 'hosting') {
      setShowMenu(false);
      setSelectedGame(null);
      return;
    }

    const gameId = selectedGame.id;

    Alert.alert(
      'Cancel Game',
      'Are you sure you want to cancel this hosted game? This will remove the game for all players.',
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Yes',
          style: 'destructive',
          onPress: async () => {
            try {
              const success = await deleteGameFromDb(gameId);

              if (!success) {
                Alert.alert('Error', 'Could not cancel this game. Please try again.');
                return;
              }

              setMyGames((current) => current.filter((game) => game.id !== gameId));
              setMyHostedGames((current) => current.filter((game) => game.id !== gameId));
              await refreshGames();
              Alert.alert('Game Cancelled', 'Your hosted game has been cancelled.');
            } catch (error) {
              console.log('Failed cancelling hosted game:', error);
              Alert.alert('Error', 'Could not cancel this game. Please try again.');
            }
          },
        },
      ],
    );

    setShowMenu(false);
    setSelectedGame(null);
  };

  const handleOpenMaps = async (location: string) => {
    try {
      const encodedLocation = encodeURIComponent(location);
      const appleMapsUrl = `maps://?q=${encodedLocation}`;
      
      const canOpenAppleMaps = await Linking.canOpenURL(appleMapsUrl);
      
      if (canOpenAppleMaps) {
        await Linking.openURL(appleMapsUrl);
      } else {
        const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodedLocation}`;
        await Linking.openURL(googleMapsUrl);
      }
    } catch (error) {
      console.error('Error opening maps:', error);
      Alert.alert('Error', 'Could not open maps application');
    }
  };

  const handleAddToCalendar = async (game: Game) => {
    try {
      if (!game.date) {
        Alert.alert('Error', 'Missing game date');
        return;
      }
  
      const startDate = moment(game.date);
  
      if (!startDate.isValid()) {
        Alert.alert('Error', 'Invalid game date');
        return;
      }
  
      const endDate = moment(startDate).add(2, 'hours');
  
      // 2. Request permissions from Calendar object
      const authStatus = await Calendar.requestCalendarPermissionsAsync();
  
      if (authStatus.status !== 'granted') {
        Alert.alert(
          'Permission Required',
          'Enable calendar access in Settings to add events.'
        );
        return;
      }
  
      // 3. Dynamically fetch the system calendars to grab an ID
      const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
      const primaryCalendar = calendars.find((cal) => cal.isPrimary) || calendars[0];
  
      if (!primaryCalendar) {
        Alert.alert('Error', 'No available calendars found on this device.');
        return;
      }
  
      // 4. Pass the extracted calendar ID as the first argument
      const eventId = await Calendar.createEventAsync(primaryCalendar.id, {
        title: game.title,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        location: game.location_name,
        notes: `${game.title}`,
        alarms: [{ relativeOffset: -10 }], // 5. Fixed alarm key
      });
  
      console.log('Calendar event created:', eventId);
      Alert.alert('Success', 'Event added to your calendar');
    } catch (error) {
      console.log('Calendar error:', error);
      Alert.alert('Error', 'Could not add event to calendar');
    }
  };

  const handleLeavePlayingGame = () => {
    if (!selectedGame || selectedGame.section !== 'playing') {
      setShowMenu(false);
      setSelectedGame(null);
      return;
    }

    const gameId = selectedGame.id;

    Alert.alert(
      'Leave Game',
      'Are you sure you want to leave this game?',
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Yes',
          style: 'destructive',
          onPress: async () => {
            const success = await withdrawRequest(gameId);

            if (!success) {
              Alert.alert('Error', 'Could not leave this game. Please try again.');
              return;
            }

            setMyPlayingGames((current) => current.filter((game) => game.id !== gameId));
            await refreshGames();
            Alert.alert('Left Game', 'You have successfully left the game.');
          },
        },
      ],
    );

    setShowMenu(false);
    setSelectedGame(null);
  };

  const handleDeleteGame = handleLeaveGame;

  const handleWithdrawRequest = handleLeavePlayingGame;

  const handleShareGame = async () => {
    try {
      if (!selectedGame) {
        return;
      }

      const shared = await shareGame(selectedGame);
      if (!shared) {
        Alert.alert('Game link unavailable', 'This game is not ready to share yet. Please try again shortly.');
      }
    } catch (error) {
      console.error('Error sharing game:', error);
      Alert.alert('Error', 'Unable to share game at this time');
    }
    setShowMenu(false);
    setSelectedGame(null);
  };

  const openChatForGame = async (game: GameCard) => {
    closeAllPopups();
    await handleOnMessage(game.id, game.type);
  };

  async function handleOnMessage(
    gameId: string | undefined,
    gameType?: string | null
  ) {
    if (!gameId) {
      Alert.alert('Error', 'Missing game ID');
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

      if (!chatId) {
        Alert.alert('Error', 'Unable to open this game chat. Please try again.');
        return;
      }

      await chatNavigator(chatId, gameType);
    } catch (error) {
      console.log('Failed opening game chat:', error);
      Alert.alert('Error', 'Unable to open this game chat. Please try again.');
    }
  }

  const handleViewPlayers = async (game: GameCard) => {
    setSelectedGame(game);
    setShowMenu(false);
    
    // Load players for the selected game if not already in the map
    if (game.id && !playersMap[game.id]) {
      try {
        const data = await getplayers(game.id);
        setPlayersMap(prev => ({
          ...prev,
          [game.id]: data ?? []
        }));
      } catch (error) {
        console.log('failed loading players for view', error);
      }
    }
    
    setShowPlayers(true);
  };

  function viewProfile(playerId: string) {
    if (playerId) {
      router.push({pathname: '/profileDetails', params: {id: playerId}})
    }
  }


  const closeAllPopups = () => {
    setShowMenu(false);
    setShowPlayers(false);
    setSelectedGame(null);
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      {/* Header with Tabs */}
      <View style={styles.header}>
        <View style={styles.headerCenter}>
          {/* Toggle Switch */}
          <View style={styles.toggleContainer}>
            <TouchableOpacity
              style={[styles.toggleOption, activeTab === 'Past' && styles.toggleOptionActive]}
              onPress={() => setActiveTab('Past')}
            >
              {activeTab === 'Past' && (
                <Ionicons name="checkmark" size={11} color="#000000" style={styles.toggleCheck} />
              )}
              <Text style={[styles.toggleText, activeTab === 'Past' && styles.toggleTextActive]}>Past</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.toggleOption, activeTab === 'Upcoming' && styles.toggleOptionActive]}
              onPress={() => setActiveTab('Upcoming')}
            >
              {activeTab === 'Upcoming' && (
                <Ionicons name="checkmark" size={11} color="#000000" style={styles.toggleCheck} />
              )}
              <Text style={[styles.toggleText, activeTab === 'Upcoming' && styles.toggleTextActive]}>Upcoming</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {activeTab === 'Past' ? (
          <>
            {/* Past Played Section */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Games You Played</Text>
              
              {playedGamesList.length === 0 ? (
                  <View style={styles.emptyState}>
                    <Text style={styles.emptyStateText}>No games played</Text>
                  </View>
                ) : (

              <View style={styles.horizontalScrollContainer}>
                {pastPlayingScrollIndex > 0 && (
                  <TouchableOpacity
                    style={styles.scrollArrowLeft}
                    onPress={() => scrollPastPlaying('left')}
                  >
                    <Ionicons name="chevron-back" size={24} color="#000" />
                  </TouchableOpacity>
                )}
                {(pastPlayingScrollIndex == 0 || pastPlayingScrollIndex == 1) && (
                  <TouchableOpacity
                    style={styles.scrollArrowRight}
                    onPress={() => scrollPastPlaying('right')}
                  >
                    <Ionicons name="chevron-forward" size={24} color="#000" />
                  </TouchableOpacity>
                )}
                <ScrollView
                style={{}}
                  ref={pastPlayingScrollRef}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  pagingEnabled
                  onScroll={(e) => {
                    const index = Math.round(e.nativeEvent.contentOffset.x / CARD_WIDTH);
                    setPastPlayingScrollIndex(index);
                  }}
                  scrollEventThrottle={16}
                >
                  {playedGamesList.map((game, index) => (
                    <View
                      key={game.id}
                      style={[
                        styles.card,
                        index === 0 && styles.firstCard,
                        index === playedGamesList.length - 1 && styles.lastCard,
                      ]}
                    >
                      <View style={styles.cardHeader}>
                        {game.avatar ? <Image source={{ uri: game.avatar }} style={styles.avatar} /> : <View style={styles.avatar} />}
                        <View style={styles.cardInfo}>
                          <Text style={styles.cardTitle}>{game.title}</Text>
                          <View style={styles.cardMetaRow}>
                            <Text style={styles.cardLevel}>{game.level}</Text>
                            {game.level && game.distance && <Text style={styles.cardMetaDot}> • </Text>}
                            <Text style={styles.cardDistance}>{game.distance}</Text>
                          </View>
                        </View>
                      </View>
                      {(game.time !== undefined) && (
                      <Text style={styles.cardDate}>Played {game.time.split('•')[0].trim()}</Text>
                      )}
                      {game.status && (
                        <View style={[styles.verifiedStatus, { backgroundColor: game.status.backgroundcolor }]}>
                          <Ionicons name={game.status.icon as any} size={16} color={game.status.color} />
                          <Text style={styles.verifyButtonText}>Game Completed</Text>
                        </View>
                      )}
                      <Text style={styles.playersHead}>Players</Text>
                      <View style={styles.playersSection}>
                        <View style={styles.playersContainer}>
                          {(playersMap[game.id] ?? []).slice(0, 3).map((player, index) => (
                            <TouchableOpacity
                              key={index}
                              onPress={() => viewProfile(player.user?.id)}
                            >
                              {player.user?.profile_picture ? <Image
                                source={{ uri: player.user?.profile_picture }}
                                style={[styles.playerAvatar, { marginLeft: index > 0 ? -8 : 0 }]}
                              /> : <View style={[styles.playerAvatar, { marginLeft: index > 0 ? -8 : 0 }]} />}
                            </TouchableOpacity>
                          ))}
                          {game.extraPlayers && (
                            <View style={[styles.extraPlayersBadge, { marginLeft: -8 }]}>
                              <Text style={styles.extraPlayersText}>+{game.extraPlayers}</Text>
                            </View>
                          )}
                        </View>
                        <TouchableOpacity style={styles.moreButton} onPress={() => handleMenuPress(game)}>
                          <Ionicons name="ellipsis-vertical" size={20} color="#000" />
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))}
                </ScrollView>
              </View>
            )}
            </View>

                {/* Past Hosted Section */}
                <View style={styles.section}>
              <Text style={styles.sectionTitle}>Games You Hosted</Text>

              {hostedGamesList.length === 0 ? (
                  <View style={styles.emptyState}>
                    <Text style={styles.emptyStateText}>No games played</Text>
                  </View>
                ) : (

              <View style={styles.horizontalScrollContainer}>
                {pastHostingScrollIndex > 0 && (
                  <TouchableOpacity
                    style={styles.scrollArrowLeft}
                    onPress={() => scrollPastHosting('left')}
                  >
                    <Ionicons name="chevron-back" size={24} color="#000" />
                  </TouchableOpacity>
                )}
                {(pastHostingScrollIndex == 0 || pastHostingScrollIndex == 1) && (
                  <TouchableOpacity
                    style={styles.scrollArrowRight}
                    onPress={() => scrollPastHosting('right')}
                  >
                    <Ionicons name="chevron-forward" size={24} color="#000" />
                  </TouchableOpacity>
                )}
                <ScrollView
                  ref={pastHostingScrollRef}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  pagingEnabled
                  onScroll={(e) => {
                    const index = Math.round(e.nativeEvent.contentOffset.x / CARD_WIDTH);
                    setPastHostingScrollIndex(index);
                  }}
                
                  scrollEventThrottle={16}
                >
                  {hostedGamesList.map((game, index) => (
                    <View key={game.id} style={[styles.card, index === 0 && styles.firstCard, index === hostedGamesList.length - 1 && styles.lastCard]}>
                      <View style={styles.cardHeader}>
                        {game.avatar ? <Image source={{ uri: game.avatar }} style={styles.avatar} /> : <View style={styles.avatar} />}
                        <View style={styles.cardInfo}>
                          <Text style={styles.cardTitle}>{game.title}</Text>
                          <View style={styles.cardMetaRow}>
                            <Text style={styles.cardLevel}>{game.level}</Text>
                            {game.level && game.distance && <Text style={styles.cardMetaDot}> • </Text>}
                            <Text style={styles.cardDistance}>{game.distance}</Text>
                          </View>
                        </View>
                      </View>
                      {(game.time !== undefined) && (
                      <Text style={styles.cardDate}>Hosted {game.time.split('•')[0].trim()}</Text>
                      )}
                      {game.status && (
                        <View style={[styles.verifiedStatus, { backgroundColor: game.status.backgroundcolor }]}>
                          <Ionicons name={game.status.icon as any} size={16} color={game.status.color} />
                          <Text style={styles.verifyButtonText}>Game Completed</Text>
                        </View>
                      )}
                      <Text style={styles.playersHead}>Players</Text>
                      <View style={styles.playersSection}>
                        <View style={styles.playersContainer}>
                          {(playersMap[game.id] ?? []).slice(0, 3).map((player, index) => (
                            <TouchableOpacity
                              key={index}
                              onPress={() => viewProfile(player.user?.id)}
                            >
                              {player.user?.profile_picture ? <Image
                                source={{ uri: player.user?.profile_picture }}
                                style={[styles.playerAvatar, { marginLeft: index > 0 ? -8 : 0 }]}
                              /> : <View style={[styles.playerAvatar, { marginLeft: index > 0 ? -8 : 0 }]} />}
                            </TouchableOpacity>
                          ))}
                          {game.extraPlayers && (
                            <View style={[styles.extraPlayersBadge, { marginLeft: -8 }]}>
                              <Text style={styles.extraPlayersText}>+{game.extraPlayers}</Text>
                            </View>
                          )}
                        </View>
                        <TouchableOpacity style={styles.moreButton} onPress={() => handleMenuPress(game)}>
                          <Ionicons name="ellipsis-vertical" size={20} color="#000" />
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))}
                </ScrollView>
              </View>
              )}
            </View>
          </>
        ) : (
          <>
            {/* Games You're In */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Games You&apos;re In</Text>
              <View style={styles.horizontalScrollContainer}>
                {playingGamesList.length === 0 ? (
                  <View style={styles.emptyState}>
                    <Text style={styles.emptyStateText}>No joined games yet</Text>
                  </View>
                ) : (
                  <>
                    {playingScrollIndex > 0 && (
                      <TouchableOpacity
                        style={styles.scrollArrowLeft}
                        onPress={() => scrollPlaying('left')}
                      >
                        <Ionicons name="chevron-back" size={24} color="#000" />
                      </TouchableOpacity>
                    )}
                    <ScrollView
                      ref={playingScrollRef}
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      pagingEnabled
                      onScroll={(e) => {
                        const index = Math.round(e.nativeEvent.contentOffset.x / CARD_WIDTH);
                        setPlayingScrollIndex(index);
                      }}
                      scrollEventThrottle={16}
                    >
                      {playingGamesList.map((game, index) => (
                        <View key={game.id} style={[styles.card, index === 0 && styles.firstCard, index === playingGamesList.length - 1 && styles.lastCard]}>
                          <View style={styles.cardHeader}>
                            {game.avatar ? <Image source={{ uri: game.avatar }} style={styles.avatar} /> : <View style={styles.avatar} />}
                            <View style={styles.cardInfo}>
                              <Text style={styles.cardTitle}>{game.title}</Text>
                              <View style={styles.cardMetaRow}>
                                <Text style={styles.cardLevel}>{game.level}</Text>
                                {game.level && game.distance && <Text style={styles.cardMetaDot}> • </Text>}
                                <Text style={styles.cardDistance}>{game.distance}</Text>
                              </View>
                            </View>
                          </View>
                          <View style={styles.cardDetails}>
                            <Text style={styles.detailText}>
                              {game.address} • {game.cost}
                            </Text>
                            <Text style={styles.detailText}>{game.time}</Text>
                          </View>
                          <View style={styles.statusContainer}>
                            {game.statuses?.map((status: any, index: any) => (
                              <View
                                key={index}
                                style={[
                                  styles.statusPill,
                                  {
                                    backgroundColor: status.backgroundcolor,
                                  },
                                ]}
                              >
                                <Ionicons
                                  name={status.icon as any}
                                  size={14}
                                  color={status.type === 'requested' ? status.color : '#F59E0B'}
                                />
                                <Text
                                  style={[
                                    styles.statusText,
                                    {
                                      color: status.type === 'requested' ? status.color : '#92400E',
                                    },
                                  ]}
                                >
                                  {status.label}
                                </Text>
                              </View>
                            ))}
                          </View>
                          <View style={styles.actionBar}>
                            <TouchableOpacity
                              style={styles.actionButton}
                              onPress={() => handleOnMessage(game.id, game.type)}
                            >
                              <Ionicons name="chatbubble-outline" size={20} color="#000" />
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.actionButton} onPress={() => handleOpenMaps(('address' in game ? game.address : ('location' in game ? game.location : 'Tennis Court')) as string)}>
                              <Ionicons name="location-outline" size={20} color="#000" />
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.actionButton} onPress={() => {
  const realGame = myPlayingGames.find(g => g.id === game.id);
  if (!realGame) {
    Alert.alert('Error', 'Game not found');
    return;
  }
  handleAddToCalendar(realGame);
}}>
                              <Ionicons name="calendar-outline" size={20} color="#000" />
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.actionButton} onPress={() => handleMenuPress(game)}>
                              <Ionicons name="ellipsis-vertical" size={20} color="#000" />
                            </TouchableOpacity>
                          </View>
                        </View>
                      ))}
                    </ScrollView>
                    {playingScrollIndex < playingGamesList.length - 1 && (
                      <TouchableOpacity
                        style={styles.scrollArrowRight}
                        onPress={() => scrollPlaying('right')}
                      >
                        <Ionicons name="chevron-forward" size={24} color="#000" />
                      </TouchableOpacity>
                    )}
                  </>
                )}
              </View>
            </View>


            {/* My Games Section */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Games You&apos;re Hosting</Text>
              <View style={styles.horizontalScrollContainer}>
                {hostingGamesList.length === 0 ? (
                  <View style={styles.emptyState}>
                    <Text style={styles.emptyStateText}>No games hosted</Text>
                  </View>
                ) : (
                  <>
                    {hostingScrollIndex > 0 && (
                      <TouchableOpacity
                        style={styles.scrollArrowLeft}
                        onPress={() => scrollHosting('left')}                      
                        >
                        <Ionicons name="chevron-back" size={24} color="#000" />
                      </TouchableOpacity>
                    )}
                    <ScrollView
                      ref={hostingScrollRef}
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      pagingEnabled
                      onScroll={(e) => {
                        const index = Math.round(e.nativeEvent.contentOffset.x / CARD_WIDTH);
                        setHostingScrollIndex(index);
                      }}
                      scrollEventThrottle={16}
                    >
                      {hostingGamesList.map((game, index) => (
                        <View key={game.id} style={[styles.card, index === 0 && styles.firstCard, index === hostingGamesList.length - 1 && styles.lastCard]}>
                          <View style={styles.cardHeader}>
                            {game.avatar ? <Image source={{ uri: game.avatar }} style={styles.avatar} /> : <View style={styles.avatar} />}
                            <View style={styles.cardInfo}>
                              <Text style={styles.cardTitle}>{game.title}</Text>
                              <View style={styles.cardMetaRow}>
                                <Text style={styles.cardLevel}>{game.level}</Text>
                                {game.level && game.distance && <Text style={styles.cardMetaDot}> • </Text>}
                                <Text style={styles.cardDistance}>{game.distance}</Text>
                              </View>
                            </View>
                          </View>
                          <View style={styles.cardDetails}>
                            <Text style={styles.detailText}>
                              {game.address} • {game.cost}
                            </Text>
                            <Text style={styles.detailText}>{game.time}</Text>
                          </View>
                          <View style={styles.statusContainer}>
                            {game.statuses?.map((status: any, index: any) => {
                              const isCourtBooked = status.label === 'Court Booked' || status.label === 'Booked';

                              return (
                                <View
                                  key={index}
                                  style={[
                                    styles.statusPill,
                                    {
                                      backgroundColor: isCourtBooked ? 'rgba(25, 230, 117, 0.2)' : status.backgroundcolor,
                                    },
                                  ]}
                                >
                                  <Ionicons
                                    name={status.icon as any}
                                    size={14}
                                    color={isCourtBooked ? '#005124' : '#F59E0B'}
                                  />
                                  <Text
                                    style={[
                                      styles.statusText,
                                      {
                                        color: isCourtBooked ? '#005124' : '#92400E',
                                      },
                                    ]}
                                  >
                                    {isCourtBooked ? 'Court Booked' : status.label}
                                  </Text>
                                </View>
                              );
                            })}
                          </View>
                          <View style={styles.actionBar}>
                            <TouchableOpacity
                              style={styles.actionButton}
                              onPress={() => handleOnMessage(game.id, game.type)}
                            >
                              <Ionicons name="chatbubble-outline" size={20} color="#000" />
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.actionButton} onPress={() => handleOpenMaps(('address' in game ? game.address : ('location' in game ? game.location : 'Tennis Court')) as string)}>
                              <Ionicons name="location-outline" size={20} color="#000" />
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.actionButton} onPress={() => {
  const realGame = myGames.find(g => g.id === game.id);
  if (!realGame) {
    Alert.alert('Error', 'Game not found');
    return;
  }
  handleAddToCalendar(realGame);
}}>
                              <Ionicons name="calendar-outline" size={20} color="#000" />
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.actionButton} onPress={() => handleMenuPress(game)}>
                              <Ionicons name="ellipsis-vertical" size={20} color="#000" />
                            </TouchableOpacity>
                          </View>
                        </View>
                      ))}
                    </ScrollView>
                    {hostingScrollIndex < hostingGamesList.length - 1 && (
                      <TouchableOpacity
                        style={styles.scrollArrowRight}
                        onPress={() => scrollHosting('right')}
                      >
                        <Ionicons name="chevron-forward" size={24} color="#000" />
                      </TouchableOpacity>
                    )}
                  </>
                )}
              </View>
            </View>
          </>
        )}
      </ScrollView>
      
      {/* Menu Modal */}
      <Modal
        transparent={true}
        visible={showMenu}
        animationType="fade"
        onRequestClose={closeAllPopups}
      >
        <TouchableWithoutFeedback onPress={closeAllPopups}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.menuContainer}>
                <TouchableOpacity style={styles.menuItem} onPress={handleShareGame}>
                  <Ionicons name="share-outline" size={20} color="#000" />
                  <Text style={styles.menuText}>Share Game</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.menuItem} onPress={() => selectedGame && handleViewPlayers(selectedGame)}>
                  <Ionicons name="people-outline" size={20} color="#000" />
                  <Text style={styles.menuText}>View Players</Text>
                </TouchableOpacity>
                {selectedGame?.hostId && selectedGame.hostId !== user?.id && (
                  <TouchableOpacity style={styles.menuItem} onPress={openReportGame}>
                    <Ionicons name="flag-outline" size={20} color="#FF0000" />
                    <Text style={[styles.menuText, { color: '#FF0000' }]}>Report Game</Text>
                  </TouchableOpacity>
                )}
                {selectedGame?.section === 'playing' && (
                  <TouchableOpacity style={styles.menuItem} onPress={handleLeavePlayingGame}>
                    <Ionicons name="log-out-outline" size={20} color="#FF0000" />
                    <Text style={[styles.menuText, { color: '#FF0000' }]}>Leave Game</Text>
                  </TouchableOpacity>
                )}
                {selectedGame?.section === 'hosting' && (
                  <TouchableOpacity style={styles.menuItem} onPress={handleDeleteGame}>
                    <Ionicons name="trash-outline" size={20} color="#FF0000" />
                    <Text style={[styles.menuText, { color: '#FF0000' }]}>Cancel Game</Text>
                  </TouchableOpacity>
                )}
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      <ReportModal
        visible={!!reportTarget}
        title="Report Game"
        submitting={submittingReport}
        onClose={() => setReportTarget(null)}
        onSubmit={handleSubmitGameReport}
      />

      {/* Players Modal */}
      <Modal
        transparent={true}
        visible={showPlayers}
        animationType="fade"
        onRequestClose={closeAllPopups}
      >
        <TouchableWithoutFeedback onPress={closeAllPopups}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.playersModalContainer}>
                <View style={styles.requestsHeader}>
                <Ionicons name="file-tray" size={30}></Ionicons>
                <Text style={styles.playersTitle}>Requests</Text>
                </View>
                <View style={styles.requestsContent}>
                  {selectedGame?.players?.map((player, index) => (
                    <TouchableOpacity
                      key={index}
                      onPress={() => {
                        if (selectedGame) {
                          openChatForGame(selectedGame);
                        }
                      }}
                    >
                      <View style={styles.playerItem}>
                        {player.avatar ? <Image source={{ uri: player.avatar }} style={styles.playerAvatarLarge} /> : <View style={styles.playerAvatarLarge} />}
                        <View style={styles.playerInfo}>
                          <Text style={styles.playerName}>{player.name || 'Unknown Player'}</Text>
                          <Text style={styles.playerSkill}>{player.skillLevel || 'Unknown Level'}</Text>
                        </View>

                        <View style={styles.requestActions}>
                          <TouchableOpacity style={styles.declineButton}>
                            <Ionicons name="close" size={18} color="#EF4444" />
                          </TouchableOpacity>
                          <TouchableOpacity style={styles.approveButton}>
                            <Ionicons name="checkmark" size={18} color="#19E675" />
                          </TouchableOpacity>
                        </View>
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>


                <View style={styles.playersHeader}>
                <Ionicons name="people" size={30}></Ionicons>
                <Text style={styles.playersTitle}>Players</Text>
                </View>
                <View style={styles.playersContent}>
                  {(playersMap[selectedGame?.id || ''] ?? []).map((player, index) => (
                    <TouchableOpacity
                      key={index}
                      onPress={() => {
                        if (player.user?.id) {
                          viewProfile(player.user.id);
                        }
                      }}
                    >
                      <View style={styles.playerItem}>
                        {player.user?.profile_picture ? <Image source={{ uri: player.user.profile_picture }} style={styles.playerAvatarLarge} /> : <View style={styles.playerAvatarLarge} />}
                        <View style={styles.playerInfo}>
                          <Text style={styles.playerName}>{player.user?.name || 'Unknown Player'}</Text>
                          <Text style={styles.playerSkill}>{player.user?.level || 'Unknown Level'}</Text>
                        </View>
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
            </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Feedback Modal */}
      <Modal
        visible={showFeedbackModal}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setShowFeedbackModal(false)}
      >
        <TouchableOpacity 
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowFeedbackModal(false)}
        >
          <View style={styles.feedbackModal}>
            <View style={styles.feedbackContent}>
              <View style={styles.feedbackIconContainer}>
                <View style={styles.checkmarkCircle}>
                  <Ionicons name="checkmark" size={30} color="#ffffff" />
                </View>
              </View>
              <Text style={styles.feedbackTitle}>Feedback Submitted</Text>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  toggleContainer: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 3,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginLeft: 20
  },
  toggleOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 15,
    gap: 3,
  },
  toggleOptionActive: {
    backgroundColor: '#19E675',
  },
  toggleText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000000',
  },
  toggleTextActive: {
    color: '#000000',
    fontWeight: '700',
  },
  toggleCheck: {
    marginRight: -1,
  },
  notificationButton: {
    position: 'relative',
    padding: 4,
  },
  notificationBadge: {
    position: 'absolute',
    top: 0,
    right: 0,
    backgroundColor: '#FF0000',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  notificationText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  scrollView: {
    flex: 1,
  },
  section: {
    marginTop: 15,
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#000',
    marginBottom: 16,
    paddingHorizontal: 16,
  },
  horizontalScrollContainer: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
  },
  scrollArrowLeft: {
    position: 'absolute',
    left: 8,
    zIndex: 10,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  scrollArrowRight: {
    position: 'absolute',
    right: 8,
    zIndex: 10,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  card: {
    width: CARD_WIDTH,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginRight: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#000000',
    
  },
  firstCard: {
    marginLeft: 16,
  },
  lastCard: {
    marginRight: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 12,
  },
  avatar: {
    width: 54,
    height: 54,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: '#121212'
  },
  cardTitle: {
    flex: 1,
    fontSize: 20,
    fontWeight: '800',
    color: '#000',
  },
  cardMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 3
  },
  cardMetaDot: {
    fontSize: 14,
    color: '#666',
    marginBottom: 3
  },
  cardDetails: {
    marginBottom: 12,
    gap: 4,
  },
  detailText: {
    fontSize: 16,
    color: '#71717A',
    fontWeight: '400',
  },
  statusContainer: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
    flexWrap: 'wrap',
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    gap: 6,
  },
  statusText: {
    color: '#92400E',
    fontSize: 14,
    fontWeight: '600',
  },
  actionBar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E5E7EB',
  },
  actionButton: {
    padding: 8,
  },
  cardInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  playersHead: {
    fontSize: 16,
    color: '#666',
    fontWeight: '500',
    marginBottom: 7
  },
  cardDate: {
    fontSize: 14,
    color: '#666',
    fontWeight: '400',
    marginBottom: 10
  },
  cardLevel: {
    fontSize: 14,
    color: '#19E675',
    fontWeight: '600',
    marginBottom: 3,
    textTransform: 'uppercase',
  },
  cardDistance: {
    fontSize: 14,
    color: '#71717A',
    fontWeight: '400',
    marginBottom: 3,
    textTransform: 'uppercase',
  },
  verifyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 30,
    marginBottom: 16,
    gap: 6,
    alignSelf: 'flex-start',
  },
  verifiedStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 20,
    marginBottom: 16,
    gap: 6,
    alignSelf: 'flex-start',
  },
  verifyButtonTextHosting: {
    color: '#002000',
    fontSize: 14,
    fontWeight: '600',
  },
  verifyButtonText: {
    color: '#005124',
    fontSize: 14,
    fontWeight: '600',
  },
  playersSection: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  playersContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  playerAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  extraPlayersBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F3F4F6',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  extraPlayersText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
  },
  moreButton: {
    padding: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  menuContainer: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 8,
    width: width,
    position: 'absolute',
    bottom: 0,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 12,
  },
  menuText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#000',
  },
  playersModalContainer: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    width: width,
    maxHeight: height * 0.7,
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
  },
  requestsHeader: {
    padding: 15,
    flexDirection: 'row',
    marginTop: 3,
    marginBottom: -10
  },
  playersHeader: {
    padding: 15,
    flexDirection: 'row',
    marginTop: 3,
    marginBottom: -10
  },
  playersContent: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    marginTop: -10
  },
  requestsContent: {
    paddingHorizontal: 20,
  },
  playersTitle: {
    fontSize: 24,
    marginTop: 1,
    marginLeft: 10,
    fontWeight: '800',
    color: '#000',
    textAlign: 'center',
  },
  playersList: {
    paddingHorizontal: 20,
  },
  playerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
  },
  playerAvatarLarge: {
    width: 50,
    height: 50,
    borderRadius: 50,
    marginRight: 16,
  },
  playerInfo: {
    flex: 1,
  },
  playerName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
    marginBottom: 4,
  },
  playerSkill: {
    fontSize: 16,
    fontWeight: '500',
    color: '#666',
  },
  requestActions: {
    flexDirection: "row",
    gap: 12,
  },
  declineButton: {
    maxWidth: 43,
    height: 43,
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#EF4444",
    borderRadius: 43,
  },
  approveButton: {
    maxWidth: 43,
    height: 43,
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderRadius: 43,
    borderColor: "#19E675",

  },
  feedbackModal: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    paddingBottom: 50,
  },
  feedbackContent: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 30,
    alignItems: 'center',
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
    marginBottom: 15,
  },
  feedbackTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#19E675',
    textAlign: 'center',
  },
  checkmarkCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#19E675',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 15,
  },
  joinButton: {
    backgroundColor: '#19E675',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  joinButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 16,
  },
  emptyStateText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
  requestsContainer: {
    paddingHorizontal: 16,
  },
  requestItem: {
    backgroundColor: '#F9FAFB',
    padding: 16,
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  requestContent: {
    flex: 1,
  },
  requestGameTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
    marginBottom: 4,
  },
  requestStatus: {
    fontSize: 14,
    color: '#666',
  },
});
