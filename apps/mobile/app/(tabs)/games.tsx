import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Image,
  Dimensions,
  Alert,
  Linking,
  Share,
  Modal,
  TouchableWithoutFeedback,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useGames, Game } from '@/context/GameContext';
import { useAuth } from '@/context/AuthContext';
import { isSupabaseConfigured } from '@/lib/supabase';
import { openGameChat } from '@/lib/openGameChat';

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
  title: string;
  level?: string;
  distance?: string;
  address?: string;
  cost?: string;
  time?: string;
  avatar?: string;
  statuses?: GameStatus[];
  date?: string;
  image?: string;
  verified?: boolean,
  status?: GameStatus;
  players?: {
    avatar: string;
    name?: string;
    skillLevel?: string;
  }[];
  extraPlayers?: number;
  section?: 'hosted' | 'played';
};

const pastHostedGamesData: GameCard[] = [
  {
    id: '4',
    title: "Alex's Tennis Doubles",
    date: 'Played Oct 12',
    level: 'Advanced',
    distance: '500m',
    verified: false,
    image: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?auto=format&fit=crop&w=400&q=80',
    status: {
      type: 'verify',
      label: 'Verify Game & Levels',
      color: '#002000',
      backgroundcolor: '#19E675',
      icon: 'checkmark',
    },
    players: [
      { avatar: 'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?auto=format&fit=crop&w=100&q=80', name: 'Michael Chen', skillLevel: 'Advanced' },
      { avatar: 'https://images.unsplash.com/photo-1447752875215-b2761acb3c5d?auto=format&fit=crop&w=100&q=80', name: 'Emma Wilson', skillLevel: 'Intermediate' },
      { avatar: 'https://images.unsplash.com/photo-1469474968028-56623f02e42e?auto=format&fit=crop&w=100&q=80', name: 'James Rodriguez', skillLevel: 'Beginner' },
    ],
    extraPlayers: 1,
    section: 'hosted',
  },
  {
    id: '7',
    title: "Alex's Tennis Singles",
    date: 'Played Oct 10',
    level: 'Advanced',
    distance: '500m',
    verified: true,
    image: 'https://images.unsplash.com/photo-1595435934249-5df7ed86e1c0?auto=format&fit=crop&w=400&q=80',
    status: {
      type: 'verified',
      label: 'Game & Levels Verified',
      color: '#005124',
      backgroundcolor: 'rgba(25, 230, 117, 0.2)',
      icon: 'checkmark-circle',
    },
    players: [
      { avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=100&q=80', name: 'David Kim', skillLevel: 'Advanced' },
      { avatar: 'https://images.unsplash.com/photo-1494790108755-2616b612b786?auto=format&fit=crop&w=100&q=80', name: 'Sophie Turner', skillLevel: 'Advanced' },
    ],
    section: 'hosted',
  },
  {
    id: '8',
    title: "Alex's Mixed Doubles",
    date: 'Played Oct 8',
    level: 'Advanced',
    distance: '500m',
    verified: true,
    image: 'https://images.unsplash.com/photo-1554068394-1e8e0a0b5d8d?auto=format&fit=crop&w=400&q=80',
    status: {
      type: 'verified',
      label: 'Game & Levels Verified',
      color: '#005124',
      backgroundcolor: 'rgba(25, 230, 117, 0.2)',
      icon: 'checkmark-circle',
    },
    players: [
      { avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&w=100&q=80', name: 'Robert Johnson', skillLevel: 'Intermediate' },
      { avatar: 'https://images.unsplash.com/photo-1489424731084-a5d8b219a5bb?auto=format&fit=crop&w=100&q=80', name: 'Lisa Anderson', skillLevel: 'Intermediate' },
      { avatar: 'https://images.unsplash.com/photo-1507591064344-4c6ce005b128?auto=format&fit=crop&w=100&q=80', name: 'Tom Martinez', skillLevel: 'Beginner' },
      { avatar: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?auto=format&fit=crop&w=100&q=80', name: 'Nina Patel', skillLevel: 'Advanced' },
    ],
    section: 'hosted',
  },
];

const pastPlayedGamesData: GameCard[] = [
  {
    id: '5',
    title: "Alex's Tennis Single",
    level: 'Advanced',
    distance: '500m',
    verified: true,
    date: 'Played Oct 12',
    image: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?auto=format&fit=crop&w=400&q=80',
    status: {
      type: 'verified',
      label: 'Game & Levels Verified',
      color: '#005124',
      backgroundcolor: 'rgba(25, 230, 117, 0.2)',
      icon: 'checkmark-circle',
    },
    players: [
      { avatar: 'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?auto=format&fit=crop&w=100&q=80', name: 'Chris Taylor', skillLevel: 'Advanced' },
    ],
    section: 'played',
  },
  {
    id: '6',
    title: "Alex's Tennis Single",
    level: 'Intermediate',
    distance: '1.2km',
    date: 'Played Oct 12',
    verified: false,
    image: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?auto=format&fit=crop&w=400&q=80',
    status: {
      type: 'verified',
      label: 'Verify Game & Levels',
      color: '#002000',
      backgroundcolor: '#19E675',
      icon: 'checkmark',
    },
    players: [
      { avatar: 'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?auto=format&fit=crop&w=100&q=80', name: 'Jordan Lee', skillLevel: 'Intermediate' },
    ],
    section: 'played',
  },
  {
    id: '9',
    title: "Alex's Tennis Doubles",
    level: 'Beginner',
    distance: '800m',
    date: 'Played Oct 9',
    verified: true,
    image: 'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?auto=format&fit=crop&w=400&q=80',
    status: {
      type: 'verified',
      label: 'Game & Levels Verified',
      color: '#005124',
      backgroundcolor: 'rgba(25, 230, 117, 0.2)',
      icon: 'checkmark-circle',
    },
    players: [
      { avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=100&q=80', name: 'Ryan Garcia', skillLevel: 'Beginner' },
      { avatar: 'https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?auto=format&fit=crop&w=100&q=80', name: 'Amanda White', skillLevel: 'Advanced' },
    ],
    section: 'played',
  },
];

function gameToPastCard(game: Game, section: 'hosted' | 'played'): GameCard {
  const playedLabel = game.date
    ? `Played ${new Date(game.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
    : 'Played';
  return {
    id: game.id,
    title: game.title,
    level: game.skillLevel,
    distance: 'Nearby',
    verified: false,
    date: playedLabel,
    image:
      'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?auto=format&fit=crop&w=400&q=80',
    status: {
      type: 'verify',
      label: 'Verify Game & Levels',
      color: '#002000',
      backgroundcolor: '#19E675',
      icon: 'checkmark',
    },
    players: [],
    section,
  };
}

export default function Games() {
  const router = useRouter();
  const {
    games,
    refreshGames,
    requestToJoin,
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
  const [incomingRequests, setIncomingRequests] = useState<GameRequest[]>([]);
  const [loading, setLoading] = useState(false);
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
  const [selectedGame, setSelectedGame] = useState<GameCard | Game | null>(null);
  const [showPlayers, setShowPlayers] = useState(false);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [pastHostedGames, setPastHostedGames] = useState<GameCard[]>(() =>
    isSupabaseConfigured ? [] : pastHostedGamesData
  );
  const [pastPlayedGames, setPastPlayedGames] = useState<GameCard[]>(() =>
    isSupabaseConfigured ? [] : pastPlayedGamesData
  );
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
  }, [feedbackSubmitted]);

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
            setPastHostedGames(pastGames.hosted.map((g) => gameToPastCard(g, 'hosted')));
            setPastPlayedGames(pastGames.played.map((g) => gameToPastCard(g, 'played')));
            setIncomingRequests(requests);
          }
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Failed to load data');
        } finally {
          setLoading(false);
        }
      };

      loadData();
    }, [refreshGames, user?.id, getMyGames, getMyPlayingGames, getPastGames, getIncomingRequests])
  );

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

  const gameToCard = (game: Game): GameCard => {
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
      const [hours, minutes] = timeString.split(':');
      const hour = parseInt(hours, 10);
      const ampm = hour >= 12 ? 'PM' : 'AM';
      const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
      return `${displayHour} ${ampm}`;
    };

    return {
      id: game.id,
      title: game.title,
      level: game.skillLevel,
      distance: 'Nearby',
      address: game.location,
      cost: game.isPaid ? `$${game.paymentAmount} Entry` : 'Free',
      time: `${formatDate(game.date)} • ${formatTime(game.time)}`,
      avatar: game.host.avatar,
      statuses: game.statuses || [],
      players: game.players || [],
    };
  };

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
    [games, user?.id, joinedGameIds, pendingGameIds]
  );

  const hostingGamesList: GameCard[] = useMemo(
    () =>
      myGames.map(gameToCard),
    [myGames]
  );

  const playingGamesList: GameCard[] = useMemo(
    () => myPlayingGames.map(gameToCard),
    [myPlayingGames]
  );

  const pendingRequestCount = useMemo(
    () => incomingRequests.filter((r) => r.status === 'pending').length,
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
    if (newIndex >= 0 && newIndex < pastHostedGames.length) {
      pastHostingScrollRef.current?.scrollTo({ x: newIndex * CARD_WIDTH, animated: true });
      setPastHostingScrollIndex(newIndex);
    }
  };

  const scrollPastPlaying = (direction: 'left' | 'right') => {
    const newIndex = direction === 'right' ? pastPlayingScrollIndex + 1 : pastPlayingScrollIndex - 1;
    if (newIndex >= 0 && newIndex < pastPlayedGames.length) {
      pastPlayingScrollRef.current?.scrollTo({ x: newIndex * CARD_WIDTH, animated: true });
      setPastPlayingScrollIndex(newIndex);
    }
  };

  const handleMenuPress = (game: GameCard) => {
    setSelectedGame(game);
    setShowMenu(true);
  };

  const handleLeaveGame = () => {
    Alert.alert('Leave Game', 'Game removal functionality coming soon');
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

  const handleAddToCalendar = async (game: GameCard | Game) => {
    try {
      const title = game.title;
      const location = 'address' in game ? game.address : ('location' in game ? game.location : 'Tennis Court');
      const notes = `Game Type: ${game.level || 'N/A'}\nCost: ${game.cost || 'Free'}\nJoin us for this tennis game!`;
      
      let eventDate: Date;
      if ('date' in game && game.time) {
        const dateString = game.date;
        const timeString = game.time.split(' • ')[1] || game.time;
        
        if (dateString === 'Today') {
          eventDate = new Date();
        } else if (dateString === 'Tomorrow') {
          eventDate = new Date();
          eventDate.setDate(eventDate.getDate() + 1);
        } else {
          eventDate = new Date(dateString + ', 2026');
        }
        
        if (timeString) {
          const timeMatch = timeString.match(/(\d+)\s*(AM|PM)/i);
          if (timeMatch) {
            const [, hourStr, period] = timeMatch;
            let hour = parseInt(hourStr);
            if (period === 'PM' && hour !== 12) hour += 12;
            if (period === 'AM' && hour === 12) hour = 0;
            eventDate.setHours(hour, 0, 0, 0);
          }
        }
      } else {
        eventDate = new Date();
        eventDate.setHours(eventDate.getHours() + 2); // Default to 2 hours from now
      }
      
      const startDate = eventDate.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
      const endDate = new Date(eventDate.getTime() + 2 * 60 * 60 * 1000).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
      
      const calendarUrl = `webcal://?dates=${startDate}/${endDate}&title=${encodeURIComponent(title)}&location=${encodeURIComponent(location || 'Tennis Court')}&notes=${encodeURIComponent(notes)}`;
      await Linking.openURL(calendarUrl);
      
    } catch (error) {
      console.error('Error adding to calendar:', error);
      Alert.alert('Error', 'Could not add event to calendar');
    }
  };

  const handleLeavePlayingGame = () => {
    if (selectedGame) {
      Alert.alert(
        'Leave Game',
        'Are you sure you want to leave this game?',
        [
          { text: 'No', style: 'cancel' },
          {
            text: 'Yes',
            onPress: () => {
              Alert.alert('Left Game', 'You have successfully left the game');
            },
          },
        ],
      );
    }
    setShowMenu(false);
    setSelectedGame(null);
  };

  const handleDeleteGame = () => {
    if (selectedGame) {
      Alert.alert(
        'Delete Game',
        'Are you sure you want to delete this game?',
        [
          { text: 'No', style: 'cancel' },
          {
            text: 'Yes',
            onPress: () => {
              setPastHostedGames(pastHostedGames.filter(game => game.id !== selectedGame.id));
              setPastPlayedGames(pastPlayedGames.filter(game => game.id !== selectedGame.id));
            },
          },
        ],
      );
    }
    setShowMenu(false);
    setSelectedGame(null);
  };

  const handleWithdrawRequest = () => {
    if (selectedGame) {
      Alert.alert(
        'Withdraw Request',
        'Are you sure you want to withdraw your request?',
        [
          { text: 'No', style: 'cancel' },
          {
            text: 'Yes',
            onPress: () => {
              Alert.alert('Request Withdrawn', 'Your game request has been withdrawn');
            },
          },
        ],
      );
    }
    setShowMenu(false);
    setSelectedGame(null);
  };

  const handleJoinGame = async (gameId: string) => {
    try {
      const response = await requestToJoin(gameId);
      if (response === 'joined') {
        const playingList = await getMyPlayingGames();
        setMyPlayingGames(playingList);
        Alert.alert('Success', 'You joined this game.');
      } else if (response === 'created') {
        Alert.alert('Success', 'Request sent to join game.');
      } else if (response === 'already_requested') {
        Alert.alert('Info', 'You have already requested to join this game.');
      } else if (response === 'already_member') {
        Alert.alert('Info', 'You are already in this game.');
      }
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to join game');
    }
  };

  const handleShareGame = async () => {
    try {
      const gameDetails = selectedGame 
        ? `Join ${selectedGame.title} on Sportiner! 🎾\n\n📅 ${selectedGame.time}\n📍 ${selectedGame.address}\n⚡ ${selectedGame.level}\n💰 ${selectedGame.cost}\n\nDownload Sportiner to join the game!`
        : 'Join my game on Sportiner! 🎾';
      
      const result = await Share.share({
        message: gameDetails,
        url: `https://sportiner.app/game/${selectedGame?.id || '123'}`,
        title: `${selectedGame?.title || 'Tennis Game'} - Sportiner`
      });
      
      if (result.action === Share.sharedAction) {
        console.log('Game shared successfully');
      } else if (result.action === Share.dismissedAction) {
        console.log('Share dismissed');
      }
    } catch (error) {
      console.error('Error sharing game:', error);
      Alert.alert('Error', 'Unable to share game at this time');
    }
    setShowMenu(false);
    setSelectedGame(null);
  };

  const openChatForGame = (game: GameCard, peerName?: string) => {
    closeAllPopups();
    openGameChat({
      gameId: game.id,
      gameTitle: game.title,
      peerName,
    });
  };

  const handleChatPress = (game: GameCard) => {
    openChatForGame(game);
  };

  const handleViewPlayers = (game: GameCard) => {
    setSelectedGame(game);
    setShowMenu(false);
    setShowPlayers(true);
  };

  const handleViewPlayersPress = (game: GameCard, peerName?: string) => {
    if (peerName) {
      openChatForGame(game, peerName);
      return;
    }
    setSelectedGame(game);
    setShowMenu(false);
    setShowPlayers(true);
  };

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
        <TouchableOpacity style={styles.notificationButton} onPress={ () => router.push('/(tabs)/requests')}>
          <Ionicons name="file-tray-outline" size={30} color="#000"/>
          {pendingRequestCount > 0 && (
            <View style={styles.notificationBadge}>
              <Text style={styles.notificationText}>{pendingRequestCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {activeTab === 'Past' ? (
          <>
            {/* Past Hosted Section */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Hosted</Text>
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
                  {pastHostedGames.map((game, index) => (
                    <View key={game.id} style={[styles.card, index === 0 && styles.firstCard, index === pastHostedGames.length - 1 && styles.lastCard]}>
                      <View style={styles.cardHeader}>
                        <TouchableOpacity onPress={() => openChatForGame(game)}>
                          <Image source={{ uri: game.image }} style={styles.avatar} />
                        </TouchableOpacity>
                        <View style={styles.cardInfo}>
                          <Text style={styles.cardTitle}>{game.title}</Text>
                          <View style={styles.cardMetaRow}>
                            <Text style={styles.cardLevel}>{game.level}</Text>
                            {game.level && game.distance && <Text style={styles.cardMetaDot}> • </Text>}
                            <Text style={styles.cardDistance}>{game.distance}</Text>
                          </View>
                        </View>
                      </View>
                      <Text style={styles.cardDate}>{game.date}</Text>
                      {game.status &&  game.verified == false && (
                        <TouchableOpacity onPress={() => router.push('/(tabs)/matchVerif')} style={[styles.verifyButton, { backgroundColor: game.status.backgroundcolor }]}>
                          <Ionicons name={game.status.icon as any} size={16} color={game.status.color} />
                          <Text style={styles.verifyButtonTextHosting}>{game.status.label}</Text>
                        </TouchableOpacity>
                      )}
                      {game.status && game.verified == true && (
                        <View style={[styles.verifiedStatus, { backgroundColor: game.status.backgroundcolor }]}>
                          <Ionicons name={game.status.icon as any} size={16} color={game.status.color} />
                          <Text style={styles.verifyButtonText}>{game.status.label}</Text>
                        </View>
                      )}
                      <Text style={styles.playersHead}>Players</Text>
                      <View style={styles.playersSection}>
                        <View style={styles.playersContainer}>
                          {game.players?.slice(0, 3).map((player, index) => (
                            <TouchableOpacity
                              key={index}
                              onPress={() => handleViewPlayersPress(game, player.name)}
                            >
                              <Image
                                source={{ uri: player.avatar }}
                                style={[styles.playerAvatar, { marginLeft: index > 0 ? -8 : 0 }]}
                              />
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
            </View>

            {/* Past Played Section */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Played</Text>
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
                  {pastPlayedGames.map((game, index) => (
                    <View
                      key={game.id}
                      style={[
                        styles.card,
                        index === 0 && styles.firstCard,
                        index === pastPlayedGames.length - 1 && styles.lastCard,
                      ]}
                    >
                      <View style={styles.cardHeader}>
                        <TouchableOpacity onPress={() => openChatForGame(game)}>
                          <Image source={{ uri: game.image }} style={styles.avatar} />
                        </TouchableOpacity>
                        <View style={styles.cardInfo}>
                          <Text style={styles.cardTitle}>{game.title}</Text>
                          <View style={styles.cardMetaRow}>
                            <Text style={styles.cardLevel}>{game.level}</Text>
                            {game.level && game.distance && <Text style={styles.cardMetaDot}> • </Text>}
                            <Text style={styles.cardDistance}>{game.distance}</Text>
                          </View>
                        </View>
                      </View>
                      <Text style={styles.cardDate}>{game.date}</Text>
                      {game.status &&  game.verified == false && (
                        <TouchableOpacity onPress={() => router.push('/(tabs)/matchVerif')} style={[styles.verifyButton, { backgroundColor: game.status.backgroundcolor }]}>
                          <Ionicons name={game.status.icon as any} size={16} color={game.status.color} />
                          <Text style={styles.verifyButtonTextHosting}>{game.status.label}</Text>
                        </TouchableOpacity>
                      )}
                      {game.status && game.verified == true && (
                        <View style={[styles.verifiedStatus, { backgroundColor: game.status.backgroundcolor }]}>
                          <Ionicons name={game.status.icon as any} size={16} color={game.status.color} />
                          <Text style={styles.verifyButtonText}>{game.status.label}</Text>
                        </View>
                      )}
                      <Text style={styles.playersHead}>Players</Text>
                      <View style={styles.playersSection}>
                        <View style={styles.playersContainer}>
                          {game.players?.slice(0, 3).map((player, index) => (
                            <TouchableOpacity
                              key={index}
                              onPress={() => handleViewPlayersPress(game, player.name)}
                            >
                              <Image
                                source={{ uri: player.avatar }}
                                style={[styles.playerAvatar, { marginLeft: index > 0 ? -8 : 0 }]}
                              />
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
            </View>
          </>
        ) : (
          <>
            {/* Available Games Section */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Available Games</Text>
              <View style={styles.horizontalScrollContainer}>
                {availableGamesList.length === 0 ? (
                  <View style={styles.emptyState}>
                    <Text style={styles.emptyStateText}>No available games</Text>
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
                      {availableGamesList.map((game, index) => (
                        <View key={game.id} style={[styles.card, index === 0 && styles.firstCard, index === availableGamesList.length - 1 && styles.lastCard]}>
                          <View style={styles.cardHeader}>
                            <TouchableOpacity onPress={() => openChatForGame(game)}>
                              <Image source={{ uri: game.avatar }} style={styles.avatar} />
                            </TouchableOpacity>
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
                                style={[styles.statusPill, { backgroundColor: status.backgroundcolor }]}
                              >
                                <Ionicons name={status.icon as any} size={14} color={status.color} />
                                <Text style={styles.statusText}>{status.label}</Text>
                              </View>
                            ))}
                          </View>
                          <TouchableOpacity 
                            style={styles.joinButton} 
                            onPress={() => handleJoinGame(game.id)}
                          >
                            <Text style={styles.joinButtonText}>Join Game</Text>
                          </TouchableOpacity>
                        </View>
                      ))}
                    </ScrollView>
                    {hostingScrollIndex < availableGamesList.length - 1 && (
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
                            <TouchableOpacity onPress={() => openChatForGame(game)}>
                              <Image source={{ uri: game.avatar }} style={styles.avatar} />
                            </TouchableOpacity>
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
              <Text style={styles.sectionTitle}>My Games</Text>
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
                            <TouchableOpacity onPress={() => openChatForGame(game)}>
                              <Image source={{ uri: game.avatar }} style={styles.avatar} />
                            </TouchableOpacity>
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
                                style={[styles.statusPill, { backgroundColor: status.backgroundcolor }]}
                              >
                                <Ionicons name={status.icon as any} size={14} color={status.color} />
                                <Text style={styles.statusText}>{status.label}</Text>
                              </View>
                            ))}
                          </View>
                          <View style={styles.actionBar}>
                            <TouchableOpacity style={styles.actionButton} onPress={() => handleChatPress(game)}>
                              <Ionicons name="chatbubble-outline" size={20} color="#000" />
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.actionButton} onPress={() => handleOpenMaps(('address' in game ? game.address : ('location' in game ? game.location : 'Tennis Court')) as string)}>
                              <Ionicons name="location-outline" size={20} color="#000" />
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.actionButton} onPress={() => handleAddToCalendar(game)}>
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

            {/* Incoming Requests Section */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Incoming Requests</Text>
              <View style={styles.requestsContainer}>
                {incomingRequests.length === 0 ? (
                  <View style={styles.emptyState}>
                    <Text style={styles.emptyStateText}>No incoming requests</Text>
                  </View>
                ) : (
                  incomingRequests.map((request) => (
                    <TouchableOpacity
                      key={`${request.game_id}-${request.requester_user_id}`}
                      style={styles.requestItem}
                      onPress={() =>
                        openGameChat({
                          gameId: request.game_id,
                          gameTitle: request.game_title,
                        })
                      }
                    >
                      <View style={styles.requestContent}>
                        <Text style={styles.requestGameTitle}>{request.game_title}</Text>
                        <Text style={styles.requestStatus}>Status: {request.status}</Text>
                      </View>
                    </TouchableOpacity>
                  ))
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
                {selectedGame?.id.startsWith('1') || selectedGame?.id.startsWith('2') ? (
                  <>
                    <TouchableOpacity style={styles.menuItem} onPress={handleShareGame}>
                      <Ionicons name="share-outline" size={20} color="#000" />
                      <Text style={styles.menuText}>Share Game</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.menuItem} onPress={() => handleViewPlayersPress(selectedGame)}>
                      <Ionicons name="people-outline" size={20} color="#000" />
                      <Text style={styles.menuText}>View Players</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.menuItem} onPress={handleLeaveGame}>
                      <Ionicons name="close-outline" size={20} color="#FF0000" />
                      <Text style={[styles.menuText, { color: '#FF0000' }]}>Cancel Game</Text>
                    </TouchableOpacity>
                  </>
                ) : selectedGame?.id.startsWith('3') ? (
                  <>
                    <TouchableOpacity style={styles.menuItem} onPress={handleShareGame}>
                      <Ionicons name="share-outline" size={20} color="#000" />
                      <Text style={styles.menuText}>Share Game</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.menuItem} onPress={handleWithdrawRequest}>
                      <Ionicons name="close-outline" size={20} color="#FFD700" />
                      <Text style={[styles.menuText, { color: '#FFD700' }]}>Withdraw Request</Text>
                    </TouchableOpacity>
                  </>
                ) : selectedGame?.id.startsWith('4') || selectedGame?.id.startsWith('7') || selectedGame?.id.startsWith('8') ? (
                  <>
                    <TouchableOpacity style={styles.menuItem} onPress={handleShareGame}>
                      <Ionicons name="share-outline" size={20} color="#000" />
                      <Text style={styles.menuText}>Share Game</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.menuItem} onPress={() => handleViewPlayersPress(selectedGame)}>
                      <Ionicons name="people-outline" size={20} color="#000" />
                      <Text style={styles.menuText}>View Players</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.menuItem} onPress={handleDeleteGame}>
                      <Ionicons name="trash-outline" size={20} color="#FF0000" />
                      <Text style={[styles.menuText, { color: '#FF0000' }]}>Delete Game</Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <>
                    <TouchableOpacity style={styles.menuItem} onPress={handleShareGame}>
                      <Ionicons name="share-outline" size={20} color="#000" />
                      <Text style={styles.menuText}>Share Game</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.menuItem} onPress={handleDeleteGame}>
                      <Ionicons name="trash-outline" size={20} color="#FF0000" />
                      <Text style={[styles.menuText, { color: '#FF0000' }]}>Delete Game</Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

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
                          openChatForGame(selectedGame, player.name);
                        }
                      }}
                    >
                      <View style={styles.playerItem}>
                        <Image source={{ uri: player.avatar }} style={styles.playerAvatarLarge} />
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
                  {selectedGame?.players?.map((player, index) => (
                    <TouchableOpacity
                      key={index}
                      onPress={() => {
                        if (selectedGame) {
                          openChatForGame(selectedGame, player.name);
                        }
                      }}
                    >
                      <View style={styles.playerItem}>
                        <Image source={{ uri: player.avatar }} style={styles.playerAvatarLarge} />
                        <View style={styles.playerInfo}>
                          <Text style={styles.playerName}>{player.name || 'Unknown Player'}</Text>
                          <Text style={styles.playerSkill}>{player.skillLevel || 'Unknown Level'}</Text>
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
    marginBottom: 7
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
