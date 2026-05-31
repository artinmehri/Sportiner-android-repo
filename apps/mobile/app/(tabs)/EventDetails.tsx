import { Image } from 'expo-image';
import { View, StyleSheet, Text, TouchableOpacity, Alert, ScrollView } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useCallback, useMemo, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { useGames } from '@/context/GameContext';
import { useAuth } from '@/context/AuthContext';
import { addUserToChat, getChatId, userInChat } from '@/context/ChatContext';
import { openGameChat } from '@/lib/openGameChat';

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

  useFocusEffect(
    useCallback(() => {
      refreshGames();
    }, [refreshGames])
  );

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

  const title = game?.title ?? "Event";
  const courtLabel = (game?.courtType ?? 'Public').toUpperCase();
  const levelLabel = (game?.skillLevel ?? 'Open').toUpperCase();
  const dateLine = game?.date
    ? new Date(game.date).toLocaleDateString('en-US', { weekday: 'short' })
    : '—';
  const timeLine = game?.time ?? '—';
  const locationLine = game?.location ?? '—';
  const entryLine =
    game?.isPaid && game.paymentAmount ? `$${game.paymentAmount}` : 'Free';
  const aboutText =
    game?.gameDescription?.trim() ||
    'Details for this match will appear here when loaded from the server.';

  const spotsLeft = Math.max(0, (game?.numberOfPlayers ?? 0) - (game?.playerCount ?? 0));
  const isFull = spotsLeft === 0;
  const needsApproval = game?.joinSetting === '✋ Request Approval';

  const joinLabel = useMemo(() => {
    if (membership === 'host') {
      return 'You are hosting';
    }
    if (membership === 'joined') {
      return 'You are in this game';
    }
    if (membership === 'pending') {
      return 'Request pending';
    }
    if (isFull) {
      return 'Game is full';
    }
    return needsApproval ? 'Request Spot' : 'Join Game';
  }, [membership, isFull, needsApproval]);

  const joinDisabled =
    submitting ||
    membership === 'host' ||
    membership === 'joined' ||
    membership === 'pending' ||
    isFull;

  const handleMessageHost = async () => {
    if (!game) {
      return;
    }
    const inChat = await userInChat(game.id);
    if (!inChat) {
      await addUserToChat(game.id);
    }
    const chatId = await getChatId(game.id);
    if (chatId) {
      router.push({ pathname: '/(tabs)/chat', params: { id: `${chatId}` } });
      return;
    }
    openGameChat({
      gameId: game.id,
      gameTitle: game.title,
      peerName: game.host?.name ?? 'Host',
    });
  };

  const handleOpenHostChat = () => {
    if (!game) {
      return;
    }
    openGameChat({
      gameId: game.id,
      gameTitle: game.title,
      peerName: game.host?.name ?? 'Host',
    });
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
        Alert.alert('Success', 'You joined this game.');
        return;
      }
      if (result === 'requested') {
        Alert.alert('Success', 'Your join request was sent to the host.');
        return;
      }
      if (result === 'already_member') {
        Alert.alert('Info', 'You are already in this game.');
        return;
      }
      if (result === 'already_requested') {
        Alert.alert('Info', 'You already requested this game.');
        return;
      }
      if (result === 'full') {
        Alert.alert('Game full', 'No spots left in this game.');
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

  return (
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <View style={styles.heroContainer}>
          <Image source={require('@/assets/images/tennis-court.png')} style={styles.eventImage} />
          <TouchableOpacity 
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <Ionicons name="chevron-back" size={24} color="#000" />
          </TouchableOpacity>
        </View>

        <View style={styles.contentCard}>
          <Text style={styles.eventTitle}>{title}</Text>

          <View style={styles.detailsContainer}>
          
            <View style={styles.pillContainere}>
              <View style={styles.courtPill}>
                <Text style={{fontWeight: '600', color: 'rgba(25, 230, 117, 0.8)'}}>{courtLabel}</Text>
              </View>

              <View style={styles.weatherPill}>
              <Text style={{fontWeight: '600', color: '#EA580C'}}>{spotsLeft} spots</Text>
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
              <Text style={styles.detailText}>{locationLine}</Text>
            </View>

            <View style={styles.detailItem}>
              <View style={styles.iconContainer}>
                <Ionicons name="cash-outline" size={20} color="#19E675" />
              </View>
              <Text style={styles.lableText}>ENTRY</Text>
              <Text style={styles.detailText}>{entryLine}</Text>
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
            <Text style={styles.playingTitle}>Who's Playing</Text>

            <TouchableOpacity onPress={handleOpenHostChat} style={styles.playerCard}>
              <Image source={{ uri: game?.host.avatar ?? 'https://picsum.photos/seed/sarah/100/100.jpg' }} style={styles.playerImage} />
              <View style={styles.playerInfo}>
                <Text style={styles.playerName}>{game?.host.name ?? 'Host'}</Text>
                <Text style={styles.playerRole}>Host</Text>
              </View>
            </TouchableOpacity>

            {membership === 'joined' && (
              <TouchableOpacity
                onPress={() => {
                  if (!game) return;
                  openGameChat({ gameId: game.id, gameTitle: game.title, peerName: 'You' });
                }}
                style={styles.playerCard}
              >
                <Image source={{ uri: 'https://picsum.photos/seed/you/100/100.jpg' }} style={styles.playerImage} />
                <View style={styles.playerInfo}>
                  <Text style={styles.playerName}>You</Text>
                  <Text style={styles.playerRole}>Player</Text>
                </View>
              </TouchableOpacity>
            )}

            {spotsLeft > 0 && membership !== 'joined' && (
            <View style={styles.emptySlotCard}>
              <Image source={{ uri: 'https://www.movetopuntagorda.com/wp-content/uploads/2020/09/55-Icon.png' }} style={styles.playerImage} />
              <View style={styles.playerInfo}>
                <Text style={styles.emptySlotName}>Empty Slot</Text>
                <Text style={styles.emptySlotStatus}>Waiting...</Text>
              </View>
            </View>
            )}
          </View>

          <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={[styles.requestSpotButton, joinDisabled && styles.requestSpotButtonDisabled]}
            onPress={handleJoinEvent}
            disabled={joinDisabled}
          >
            <Text style={styles.requestSpotText}>{joinLabel}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.messageHostButton} onPress={handleMessageHost}>
            <Text style={styles.messageHostText}>Message Host</Text>
          </TouchableOpacity>
        </View>
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
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: 'rgba(25, 230, 117, 0.1)',
  },
  weatherPill: {
    maxWidth: 95,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: '#FFEDD5',
  },
  levelPill: {
    maxWidth: 105,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: '#E4E4E7',
  },
  detailItemContainer: {
    flexDirection: 'row',
    gap: 39,
    justifyContent: 'center'
  },
  detailItem: {
    flexDirection: 'column',
    alignItems: 'center',
    marginBottom: 12,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 9999,
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
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
    marginRight: 10,
    marginTop: 10
  },
  detailText: {
    fontSize: 15,
    color: '#121212',
    fontWeight: '500',
    marginRight: 10
  },
  section: {
    marginBottom: 32,
    marginTop: 40
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
  requestSpotButtonDisabled: {
    backgroundColor: '#E5E7EB',
    borderColor: '#D1D5DB',
    shadowOpacity: 0,
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
  messageHostText: {
    color: '#1A1A1A',
    fontSize: 16,
    fontWeight: '600',
  },
});
