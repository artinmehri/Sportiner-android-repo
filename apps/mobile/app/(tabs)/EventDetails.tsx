import { supabase } from '@/lib/supabase';
import { Image } from 'expo-image';
import { View, StyleSheet, Text, TouchableOpacity, Alert, ScrollView, Modal } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { useGames, userInGame } from '@/context/GameContext';
import { useAuth } from '@/context/AuthContext';
import { addUserToChat, blockUser, getChatId, userInChat, getplayers, chatNavigator } from '@/context/ChatContext';
import { formatCourtShare } from '@/lib/gamesDb';
import * as Haptics from 'expo-haptics'

const WEATHER_API_KEY = "Z3CQUVZMBCCHJVSHVHU2J9KGY";

export default function EventDetails() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { user } = useAuth();
  const {
    getGameById,
    joinGame,
    refreshGames,
    joinedGameIds,
    pendingGameIds,
  } = useGames();
  const [submitting, setSubmitting] = useState(false);
  const game = id ? getGameById(String(id)) : undefined;
  const [weather, setWeather] = useState(null);
  const [showJoinedGameModal, setShowJoinedGameModal] = useState(false);
  const [players, setPlayers] = useState<any[]>([]);
  const [showMenu, setShowMenu] = useState(false);

  const membership = useMemo(() => {
    if (!game || !user?.id) {
      return 'none' as const;
    }
    if (game.hostId === user.id) {
      return 'host' as const;
    }
    if (joinedGameIds.includes(game.id)) {
      return 'joined' as const;
    }
    if (pendingGameIds.includes(game.id)) {
      return 'pending' as const;
    }
    return 'none' as const;
  }, [game, user?.id, joinedGameIds, pendingGameIds]);
  const isHost = membership === 'host';

  useFocusEffect(
    useCallback(() => {
      refreshGames();
    }, [refreshGames])
  );

  useEffect(() => {
    const loadPlayers = async () => {
      if (!game?.id) {
        setPlayers([]);
        return;
      }

      try {
        const data = await getplayers(game.id);

        if (!data || !Array.isArray(data)) {
          setPlayers([]);
          return;
        }

        setPlayers(data);
      } catch (error) {
        console.log('failed loading players', error);
        setPlayers([]);
      }
    };

    loadPlayers();
  }, [game?.id, membership]);

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

  const handleWeather = useCallback(async () => {
    if (!game?.date || !game?.location_name) {
      return;
    }

    const timestamp = game?.date;
    const apiDateFormat = timestamp?.split('T')[0];
    
    const rawLocation = `${game?.location_name}, Toronto`;
    const encodedLocation = encodeURIComponent(rawLocation);
    
    // FIX: Added the absolute path route required by Visual Crossing
    const url = `https://weather.visualcrossing.com/VisualCrossingWebServices/rest/services/timeline/${encodedLocation}/${apiDateFormat}?key=${WEATHER_API_KEY}&unitGroup=metric`;

    try {
      const response = await fetch(url);
      
      if (!response.ok) {
        console.error("API Error Response Status:", response.status);
        return;
      }
    
      const data = await response.json();
      const avgTemp = data?.days?.[0]?.temp;
      
      if (avgTemp !== undefined) {
        setWeather(avgTemp);
      } else {
        console.log("No temperature array data found for this date.");
      }
    } catch (error) {
      console.error("Network or parse error:", error);
    }
  }, [game?.date, game?.location_name]);

  useEffect(() => {
    handleWeather();
  }, [handleWeather]);


  const title = game?.title ?? "Event";
  const capacity = game?.capacity
  const courtLabel = (game?.courtType ?? 'Public').toUpperCase();
  const levelLabel = (game?.skillLevel ?? 'Open').toUpperCase();
  const dateLine = game?.date
    ? new Date(game.date).toLocaleDateString('en-US', { weekday: 'short' })
    : '—';
  const timeLine = game?.time ?? '—';
  const locationLine = game?.location_name ?? '—';
  const courtShareLine = formatCourtShare(
    game?.isPaid ?? false,
    game?.payment_amount
  );
  const aboutText =
    game?.gameDescription?.trim() ||
    'Details for this match will appear here when loaded from the server.';

  const playerCapacity = Number(capacity ?? 0);
  const currentPlayerCount = game?.players_enrolled ?? 0;
  const spotsLeft = Math.max(0, playerCapacity - (currentPlayerCount));
  const isFull = spotsLeft === 0;
  const needsApproval = game?.joinSetting === '✋ Request Approval';

  const joinLabel = useMemo(() => {
    if (membership === 'host') {
      return 'Hosting';
    }
    if (membership === 'joined') {
      return 'Joined';
    }
    if (membership === 'pending') {
      return 'Requested';
    }
    if (isFull) {
      return 'Game Full';
    }
    return needsApproval ? 'Request Spot' : 'Join Game';
  }, [membership, isFull, needsApproval]);

  const joinDisabled =
    submitting ||
    membership === 'host' ||
    membership === 'joined' ||
    membership === 'pending' ||
    isFull;

  const handleMessage = async () => {

    if (!game) {
      Alert.alert('Error', 'Game data not loaded');
      return;
    }

    const inGame = await userInGame(game.id);

    if (!inGame) {
      Alert.alert('Join game', 'You need to join the game to message players.');
      return;
    }

    const inChat = await userInChat(game.id);
    let joinedChatId: string | null = null;

    if (!inChat) {
      joinedChatId = await addUserToChat(game.id, game.gameType);
      if (!joinedChatId) {
        Alert.alert('Error', 'Unable to open this game chat. Please try again.');
        return;
      }
    }
    
    const chatId = joinedChatId ?? await getChatId(game.id);
    if (!chatId) {
      Alert.alert('Error', 'Unable to open this game chat. Please try again.');
      return;
    }
    
    await chatNavigator(chatId, game.gameType);
  };

  const handleOpenPlayerProfile = async (playerId: string) => {
    router.push({ pathname: '/(tabs)/profileDetails', params: { id: playerId } });
  };

  const handleJoinEvent = async () => {
    if (!game) {
      Alert.alert('Event', 'No game data loaded.');
      return;
    }
    setSubmitting(true);
    try {
      const result = await joinGame(game.id);
      if (result === 'joined') {
        setShowJoinedGameModal(true);
        setTimeout(() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }, 90);
        return;
      }
      if (result === 'requested') {
        setShowJoinedGameModal(true);
        setTimeout(() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }, 90);
        return;
      }
      if (result === 'full') {
        Alert.alert('Game full', 'No spots left in this game.');
        return;
      }
      if (result === 'not_found') {
        Alert.alert('Game unavailable', 'This game is no longer available.');
        return;
      }
      if (result === 'not_authenticated') {
        Alert.alert('Sign in', 'Sign in to join games.');
        return;
      }
      Alert.alert('Join request', 'Configure Supabase to sync join requests.');
    } catch (err) {
      Alert.alert('Join request', err instanceof Error ? err.message : 'Could not join game.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReportHost = async () => {
    if (!game || !user) {
      Alert.alert('Error', 'You must be logged in to report');
      return;
    }

    Alert.alert(
      'Report Host',
      'Are you sure you want to report this host?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Report',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('reports')
                .insert({
                  reporter_id: user.id,
                  reported_user_id: game.hostId,
                  reported_post_id: game.id,
                  reason: 'Inappropriate behavior'
                });

              if (error) {
                console.log('Report error:', error);
                Alert.alert('Error', 'Failed to submit report');
                return;
              }

              Alert.alert('Report Sent', 'Thank you for your report. We will review it.');
              setShowMenu(false);
            } catch (error) {
              console.log('Report error:', error);
              Alert.alert('Error', 'Failed to submit report');
            }
          }
        }
      ]
    );
  };

  const handleBlockHost = async () => {
    if (!game || !user) {
      Alert.alert('Error', 'You must be logged in to block');
      return;
    }

    Alert.alert(
      'Block Host',
      'Are you sure you want to block this host?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Block',
          style: 'destructive',
          onPress: async () => {
            try {
              const blocked = await blockUser(game.hostId);

              if (!blocked) {
                Alert.alert('Error', 'Failed to block host');
                return;
              }

              const { error: moderationError } = await supabase
                .from('moderation_events')
                .insert({
                  type: 'block',
                  actor_id: user.id,
                  target_id: game.hostId
                });

              if (moderationError) {
                console.log('Moderation logging error:', moderationError);
              }

              Alert.alert('Host Blocked', 'You have successfully blocked this host.');
              setShowMenu(false);
              router.back();
            } catch (error) {
              console.log('Block error:', error);
              Alert.alert('Error', 'Failed to block host');
            }
          }
        }
      ]
    );
  };


  return (
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <View style={styles.heroContainer}>
          <Image source={game?.image} style={styles.eventImage} />
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <Ionicons name="chevron-back" size={24} color="#000" />
          </TouchableOpacity>
          {!isHost && (
            <TouchableOpacity
              style={styles.menuButton}
              onPress={() => setShowMenu(true)}
            >
              <Ionicons name="ellipsis-vertical" size={24} color="#000" />
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.contentCard}>
          <Text style={styles.eventTitle}>{title}</Text>

          <View style={styles.detailsContainer}>
          
            <View style={styles.pillContainere}>
              <View style={styles.courtPill}>
                <Text style={{fontWeight: '600', color: 'rgba(25, 230, 117, 0.8)'}}>{courtLabel} COURT</Text>
              </View>

              <View style={styles.weatherPill}>
              <Text style={{fontWeight: '600', color: '#EA580C'}}>{weather}°C</Text>
              </View>

              <View style={styles.levelPill}>
              <Text style={{fontWeight: '600', color: '#52525B'}}>{levelLabel}</Text>
              </View>
            </View>

          <View style={styles.detailItemContainer}>

            <View style={styles.detailItem}>
              <View style={styles.iconContainer}>
                <Ionicons name="calendar-outline" size={20} color="#19E675" />
              </View>
              <Text style={styles.lableText}>DATE</Text>
              <Text style={styles.detailText}>{dateLine}</Text>
              <Text style={styles.detailText}>{timeLine}</Text>
            </View>

            <View style={styles.detailItem}>
              <View style={styles.iconContainer}>
                <Ionicons name="location" size={20} color="#19E675" />
              </View>
              <Text style={styles.lableText}>LOCATION</Text>
              <Text numberOfLines={3} style={[styles.detailText, { maxWidth: 70 }]}>{locationLine}</Text>
            </View>

            <View style={styles.detailItem}>
              <View style={styles.iconContainer}>
                <Ionicons name="cash-outline" size={20} color="#19E675" />
              </View>
              <Text style={styles.lableText}>COURT SHARE</Text>
              <Text style={styles.detailText}>{courtShareLine}</Text>
            </View>

          </View>
        </View>
        </View>

        <View style={{height: 1, backgroundColor: '#CED0CE', width: '100%' }} />

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>About this match</Text>
            <Text style={styles.sectionDescription}>
              {aboutText}
            </Text>
          </View>

          <View style={{height: 1, backgroundColor: '#CED0CE', width: '100%' }} />


          <View style={styles.section}>
            <Text style={styles.playingTitle}>Who is Playing</Text>

            <TouchableOpacity onPress={() => handleOpenPlayerProfile(game?.hostId ?? '')} style={styles.playerCard}>
              <Image source={{ uri: game?.host.avatar ?? 'https://picsum.photos/seed/sarah/100/100.jpg' }} style={styles.playerImage} />
              <View style={styles.playerInfo}>
                <Text style={styles.playerName}>{game?.host.name ?? 'Host'}</Text>
                <Text style={styles.playerRole}>Host</Text>
              </View>
            </TouchableOpacity>

            {players.filter((player) => {const playerRole = player?.role; return playerRole !== 'host'}).map((player, index) => {
              players.find((player) => player.id !== game?.hostId)
              const playerId = player?.user_id ?? player?.id ?? `${index}`;
              const playerName = player?.name ?? player?.user?.name ?? 'Player';
              const playerImage = player?.profile_picture ?? player?.user?.profile_picture ?? `https://picsum.photos/seed/player-${index}/100/100.jpg`;

              return (
                <TouchableOpacity
                  key={playerId}
                  onPress={() => handleOpenPlayerProfile(playerId)}
                  style={styles.playerCard}
                >
                  <Image source={{ uri: playerImage }} style={styles.playerImage} />
                  <View style={styles.playerInfo}>
                    <Text style={styles.playerName}>{playerName}</Text>
                    <Text style={styles.playerRole}>Player</Text>
                  </View>
                </TouchableOpacity>
              );
            })}

            {Array.from({ length: spotsLeft }).map((_, index) => (
              <View key={`empty-${index}`} style={styles.emptySlotCard}>
                <Image source={{ uri: 'https://www.movetopuntagorda.com/wp-content/uploads/2020/09/55-Icon.png' }} style={styles.playerImage} />
                <View style={styles.playerInfo}>
                  <Text style={styles.emptySlotName}>Empty Slot</Text>
                  <Text style={styles.emptySlotStatus}>Waiting...</Text>
                </View>
              </View>
            ))}
          </View>
          
        {!isHost && (
        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={[membership === 'joined' ||  membership === 'pending' ? styles.requestedSpotButton : isFull ? styles.mathFullButton : membership === 'none' ? styles.requestSpotButton : null ]}
            onPress={handleJoinEvent}
            disabled={joinDisabled}
          >
            <Text style={[membership === 'joined' ||  membership === 'pending' ? styles.requestedSpotText : isFull ? styles.mathFullText : membership === 'none' ? styles.requestSpotText : null ]}>{joinLabel}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.messageHostButton} onPress={handleMessage}>
            <Text style={styles.messageHostText}>Message</Text>
          </TouchableOpacity>
        </View>
          )}
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
              <Text style={styles.feedbackTitle}>{ membership === 'joined' ? "Joined Game" : membership === 'pending' ? "Request sent!" : null}</Text>
            </View>
          </View>
      </TouchableOpacity>
    </Modal>

    {/* Menu Modal */}
    <Modal
      transparent={true}
      visible={showMenu}
      animationType="fade"
      onRequestClose={() => setShowMenu(false)}
    >
      <TouchableOpacity
        style={styles.menuOverlay}
        activeOpacity={1}
        onPress={() => setShowMenu(false)}
      >
        <TouchableOpacity
          style={styles.menuContainer}
          activeOpacity={1}
          onPress={(e) => e.stopPropagation()}
        >
          <TouchableOpacity style={styles.menuItem} onPress={handleReportHost}>
            <View style={styles.menuIconContainer}>
              <Ionicons name="alert-circle-outline" size={20} color="#FF0000" />
            </View>
            <Text style={styles.menuText}>Report Host</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem} onPress={handleBlockHost}>
            <View style={styles.menuIconContainer}>
              <Ionicons name="ban-outline" size={20} color="#FF0000" />
            </View>
            <Text style={styles.menuText}>Block Host</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
      </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
    backgroundColor: '#fff'
  },
  heroContainer: {
    position: 'relative',
    backgroundColor: '#000', 
  },
  eventImage: {
    width: '100%',
    height: 280,
  },
  backButton: {
    position: 'absolute',
    top: 50,
    left: 24,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 5,
  },
  menuButton: {
    position: 'absolute',
    top: 50,
    right: 24,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 5,
  },
  contentCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 33,
    padding: 24,
    marginTop: -30,
    shadowColor: '#000',
    shadowOffset: {
      width: 10,
      height: 8,
    },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 10,
  },
  eventTitle: {
    flex: 1,
    fontSize: 25,
    fontWeight: "800",
    marginBottom: 20,
    color: '#1a1a1a',
    lineHeight: 38,
    justifyContent: 'center'
  },
  detailsContainer: {
    marginBottom: 32,
  },
  pillContainere: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 40
  },
  courtPill: {
    maxWidth: 130,
    maxHeight: 40,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: 'rgba(25, 230, 117, 0.1)',
  },
  weatherPill: {
    maxWidth: 95,
    maxHeight: 40,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: '#FFEDD5',
  },
  levelPill: {
    maxWidth: 170,
    maxHeight: 40,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: '#E4E4E7',
  },
  detailItemContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  detailItem: {
    flexDirection: 'column',
    alignItems: 'center',
    marginBottom: 12,
    width: 80,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 9999,
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 6,
  },
  lableText: {
    fontSize: 12,
    color: '#A1A1AA',
    fontWeight: '500',
    marginTop: 10
  },
  detailText: {
    fontSize: 15,
    color: '#121212',
    fontWeight: '500',
  },
  section: {
    marginBottom: 32,
    marginTop: 40,
    marginLeft: 20
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
    color: '#1a1a1a',
  },
  playingTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
    color: '#474747',
  },
  sectionDescription: {
    fontSize: 14,
    lineHeight: 20,
    color: '#6b7280',
  },
  emptySlotCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#C7C1C1',
    padding: 12,
    marginVertical: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 8,
    maxWidth: 365
  },
  playerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#121212',
    padding: 12,
    marginVertical: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 8,
    maxWidth: 365
  },
  playerImage: {
    width: 40,
    height: 40,
    borderRadius: 15,
    marginRight: 16,
  },
  playerInfo: {
    flex: 0.3,
  },
  emptySlotName: {
    fontSize: 14.3,
    fontWeight: '600',
    color: '#AFAFAF',
  },
  emptySlotStatus: {
    fontSize: 12.7,
    color: '#C8C8C8',
    marginTop: 2,
  },
  playerName: {
    fontSize: 14.3,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  playerRole: {
    fontSize: 12.7,
    color: '#6b7280',
    marginTop: 2,
  },
  buttonContainer: {
    paddingHorizontal: 16,
    paddingBottom: 60,
    marginTop: 20,
  },
  requestSpotButton: {
    borderColor: '#1A1A1A',
    borderWidth: 2,
    backgroundColor: '#19E675',
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 28,
    alignItems: 'center',
    marginBottom: 17,
    shadowColor: '#19E675',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  requestedSpotButton: {
    borderColor: '#4A6B54',
    borderWidth: 2,
    backgroundColor: 'rgba(25, 230, 117, 0.2)',
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 28,
    alignItems: 'center',
    marginBottom: 17,
    shadowColor: '#19E675',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  mathFullButton: {
    borderColor: '#D1D5DB',
    borderWidth: 2,
    backgroundColor: '#E5E7EB',
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 28,
    alignItems: 'center',
    marginBottom: 17,
    shadowColor: '#19E675',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  messageHostButton: {
    backgroundColor: 'white',
    borderColor: '#1A1A1A',
    borderWidth: 2,
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 28,
    alignItems: 'center',
  },
  requestSpotText: {
    color: '#002000',
    fontSize: 16,
    fontWeight: '600',
  },
  requestedSpotText: {
    color: '#4A6B54',
    fontSize: 16,
    fontWeight: '600',
  },
  mathFullText: {
    color: '#6B7280',
    fontSize: 16,
    fontWeight: '600',
  },
  messageHostText: {
    color: '#1A1A1A',
    fontSize: 16,
    fontWeight: '600',
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
  menuOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  menuContainer: {
    backgroundColor: 'white',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 20,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  menuIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFF5F5',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  menuText: {
    fontSize: 16,
    color: '#FF0000',
    fontWeight: '500',
  },
});
