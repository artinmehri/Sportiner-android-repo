import React, { useCallback, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  StatusBar,
  SafeAreaView,
  ScrollView,
  Vibration,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { SignupInterface } from '@/context/SignupInterface.type';
import { getClosestOpenGames, rowToGame, getDistanceKm, type Game } from '@/context/GameContext';
import { fetchHostProfiles, fetchPlayerCounts } from '@/lib/gamesDb';
import { type GeoCoords } from '@/lib/courtSuggestions';
import {
  logOnboardingError,
  onboardingErrorCopy,
  providerFromMethod,
  toOnboardingError,
} from '@/lib/onboardingErrors';


export default function SeventhOnbPage({ onNext, changeData, data }: SignupInterface): React.JSX.Element {
  const [games, setGames] = useState<Game[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [nearbyOrigin, setNearbyOrigin] = useState<GeoCoords | null>(null);
  const [submittingGameId, setSubmittingGameId] = useState<string | null>(null);
  const [gamesLoadError, setGamesLoadError] = useState<string | null>(null);

  const buzzPhone = () => {
    Vibration.vibrate()
  }

  useEffect(() => {
    if (data?.location) {
      setSafeOrigin(data.location);
    }
  }, [data?.location]);

  const setSafeOrigin = (coords: GeoCoords) => {
    if (
      !coords ||
      !isFinite(coords.lat) ||
      !isFinite(coords.lng) ||
      Math.abs(coords.lat) > 90 ||
      Math.abs(coords.lng) > 180
    ) {
      console.log('Invalid onboarding origin rejected:', coords);
      return;
    }

    if (coords.lat === 0 && coords.lng === 0) {
      console.log('Invalid zero onboarding origin rejected:', coords);
      return;
    }

    setNearbyOrigin(coords);
  };

  const loadGames = useCallback(async () => {
    try {
      setIsLoading(true);
      setGamesLoadError(null);
      const gameRows = await getClosestOpenGames();

      const hostIds = [...new Set(gameRows.map((r) => r.host_id).filter(Boolean))] as string[];
      const gameIds = gameRows.map((r) => r.id);
      const [profileMap, counts] = await Promise.all([
        fetchHostProfiles(hostIds),
        fetchPlayerCounts(gameIds),
      ]);

  const mappedGames = gameRows.map((r) =>
        rowToGame(r, r.host_id ? profileMap[r.host_id] : undefined, counts)
      );

      const favoritePark =
        typeof data?.favorite_park === 'string' ? data.favorite_park.trim() : '';
      const prioritized = favoritePark
        ? [
            ...mappedGames.filter((game) => game.location_name === favoritePark),
            ...mappedGames.filter((game) => game.location_name !== favoritePark),
          ]
        : mappedGames;

      // Recommend two games max; user chooses one.
      setGames(prioritized.slice(0, 2));
    } catch (error) {
      const gamesError = toOnboardingError(
        {
          failure: 'nearby_games',
          provider: providerFromMethod(data?.method),
          source: 'games.nearby.load',
        },
        error
      );
      const copy = onboardingErrorCopy(gamesError);
      logOnboardingError(gamesError);
      setGamesLoadError(copy.message);
    } finally {
      setIsLoading(false);
    }
  }, [data?.favorite_park, data?.method]);

  useEffect(() => {
    void loadGames();
  }, [loadGames]);

  const handleJoinGame = async (game: Game) => {
    if (submittingGameId) {
      return;
    }

    setSubmittingGameId(game.id);
    buzzPhone();

    try {
      changeData((current: any) => ({
        ...current,
        onboarding_join_candidate: {
          gameId: game.id,
          title: game.title,
          date: game.date,
          location_name: game.location_name,
          players_enrolled: game.players_enrolled,
          capacity: game.capacity,
          image: game.image || null,
        },
      }));
      await onNext(game.id);
    } catch (error) {
      const joinError = toOnboardingError(
        {
          failure: 'game_join',
          provider: providerFromMethod(data?.method),
          source: 'games.join.ui',
        },
        error
      );
      const copy = onboardingErrorCopy(joinError);
      if (joinError.source === 'games.join.ui') {
        logOnboardingError(joinError, { gameId: game.id });
      }
      Alert.alert(copy.title, copy.message, [{ text: 'Try Again' }]);
    } finally {
      setSubmittingGameId(null);
    }
  };

  const handleBrowseAllGames = async () => {
    if (submittingGameId) return;

    setSubmittingGameId('browse');
    try {
      await onNext();
    } catch (error) {
      const finishError = toOnboardingError(
        {
          failure: 'session',
          provider: providerFromMethod(data?.method),
          source: 'onboarding.finish_without_game',
        },
        error
      );
      const copy = onboardingErrorCopy(finishError);
      logOnboardingError(finishError);
      Alert.alert(copy.title, copy.message, [{ text: 'Try Again' }]);
    } finally {
      setSubmittingGameId(null);
    }
  };

  const formatGameTime = (dateIso: string) => {
    if (!dateIso) return '';
    const date = new Date(dateIso);
    const now = new Date();
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const isToday = date.toDateString() === today.toDateString();
    const isTomorrow = date.toDateString() === tomorrow.toDateString();

    let day;
    if (isToday) {
      day = 'today';
    } else if (isTomorrow) {
      day = 'tomorrow';
    } else {
      day = date.toLocaleDateString(undefined, { weekday: 'short' });
    }

    const time = date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    return `${day} @ ${time}`;
  };

  const formatDistance = (game: Game) => {
    if (!nearbyOrigin || !game.locationCoords) {
      return null;
    }

    const distance = getDistanceKm(
      { lat: nearbyOrigin.lat, lng: nearbyOrigin.lng },
      { lat: game.locationCoords.lat, lng: game.locationCoords.lng }
    );

    return `${distance.toFixed(1)} km away`;
  };
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Title Section */}
        <View style={styles.titleSection}>
          <Text style={styles.mainTitle}>Recommended for you</Text>
          <Text style={styles.subTitle}>Pick one to join</Text>
        </View>

        {/* Game Cards */}
        <View style={styles.cardsContainer}>
          {isLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#19E675" />
            </View>
          ) : gamesLoadError ? (
            <View style={styles.loadingContainer}>
              <Text style={styles.noGamesText}>{gamesLoadError}</Text>
              <TouchableOpacity style={styles.retryButton} onPress={loadGames}>
                <Text style={styles.retryButtonText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : games.length === 0 ? (
            <View style={styles.loadingContainer}>
              <Text style={styles.noGamesText}>No games available nearby</Text>
            </View>
          ) : (
            games.map((game) => (
              <View key={game.id} style={styles.gameCard}>
                <Image
                  source={{ uri: game.image || 'https://images.unsplash.com/photo-1719360568896-55788b9ddea5?w=900&auto=format&fit=crop&q=60&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxzZWFyY2h8OHx8dGVubmlzJTIwY291cnRzfGVufDB8fDB8fHww' }}
                  style={styles.gameImage}
                  resizeMode="cover"
                />
                <View style={styles.gameInfo}>
                  <Text style={styles.gameTitle}>{game.title}</Text>
                  <View style={styles.gameMetaRow}>
                    <Text style={styles.gameLevel}>Level: {game.skillLevel}</Text>
                    {formatDistance(game) ? (
                      <>
                        <Text style={styles.gameMetaDot}> · </Text>
                        <Text style={styles.gameDistance}>{formatDistance(game)}</Text>
                      </>
                    ) : null}
                  </View>
                  <View style={styles.gameDetails}>
                    <View style={styles.detailRow}>
                      <View style={styles.icon}>
                        <MaterialCommunityIcons name="calendar" size={16} color="#19E675" />
                        <Text style={styles.detailText}>{formatGameTime(game.date)}</Text>
                      </View>
                      <View style={styles.spacer} />
                      <View style={styles.icon}>
                        <MaterialCommunityIcons name="map-marker" size={16} color="#19E675" />
                        <Text style={styles.detailText}>{game.location_name}</Text>
                      </View>
                    </View>
                  </View>

                  <TouchableOpacity
                    style={submittingGameId === game.id ? styles.joinedButton : styles.joinButton}
                    onPress={() => handleJoinGame(game)}
                    disabled={Boolean(submittingGameId)}
                  >
                    <Text style={submittingGameId === game.id ? styles.joinedButtonText : styles.joinButtonText}>
                      {submittingGameId === game.id ? "Joining..." : game.joinSetting.includes("Request Approval") ? "Request Spot" : "Join Game"}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
        </View>

        {/* Footer */}
        <TouchableOpacity
          onPress={handleBrowseAllGames}
          style={styles.footer}
          disabled={Boolean(submittingGameId)}
        >
          <View style={{ padding: 10 }}>
            <Text style={styles.footerText}>
              Not these? <Text style={styles.browseText}>Browse all games {'>'}</Text>
            </Text>
          </View>
        </TouchableOpacity>
      </ScrollView>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 5,
  },
  time: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000000',
  },
  statusIcons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  signalBars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 1,
    width: 20,
    height: 12,
  },
  bar: {
    width: 3,
    backgroundColor: '#000000',
    borderRadius: 1,
  },
  wifiIcon: {
    width: 16,
    height: 12,
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  wifiArc1: {
    position: 'absolute',
    width: 12,
    height: 6,
    borderBottomWidth: 2,
    borderBottomColor: '#000000',
    borderBottomLeftRadius: 6,
    borderBottomRightRadius: 6,
    bottom: 6,
  },
  wifiArc2: {
    position: 'absolute',
    width: 8,
    height: 4,
    borderBottomWidth: 2,
    borderBottomColor: '#000000',
    borderBottomLeftRadius: 4,
    borderBottomRightRadius: 4,
    bottom: 4,
  },
  wifiArc3: {
    position: 'absolute',
    width: 4,
    height: 2,
    backgroundColor: '#000000',
    borderRadius: 1,
    bottom: 2,
  },
  battery: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  batteryBody: {
    width: 22,
    height: 11,
    borderWidth: 1,
    borderColor: '#000000',
    borderRadius: 2,
  },
  batteryTip: {
    width: 2,
    height: 4,
    backgroundColor: '#000000',
    borderRadius: 1,
    marginLeft: -1,
  },
  batteryLevel: {
    position: 'absolute',
    left: 2,
    top: 2,
    width: 18,
    height: 7,
    backgroundColor: '#000000',
    borderRadius: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  titleSection: {
    marginTop: 20,
    marginBottom: 30,
    alignItems: 'center',
  },
  mainTitle: {
    fontSize: 28,
    fontWeight: '900',
    color: '#1F2937',
    marginBottom: 5,
  },
  subTitle: {
    fontSize: 28,
    fontWeight: '900',
    color: '#19E675',
  },
  cardsContainer: {
    gap: 20,
    marginBottom: 30,
  },
  gameCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
    overflow: 'hidden',
  },
  gameImage: {
    width: '100%',
    height: 180,
  },
  gameInfo: {
    padding: 16,
  },
  gameTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 4,
  },
  gameMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginBottom: 15,
    marginTop: 5,
  },
  gameLevel: {
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '500',
  },
  gameMetaDot: {
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '500',
  },
  gameDistance: {
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '500',
  },
  gameDetails: {
    marginBottom: 16,
  },
  spacer: {
    flex: 1,
  },
  detailRow: {
    flexDirection: 'column',
    alignContent: 'flex-start',
    gap: 8,
  },
  icon: {
    flexDirection: 'row',
  },
  detailText: {
    fontSize: 14,
    color: '#1F2937',
    fontWeight: '500',
    marginLeft: 7
  },
  joinButton: {
    backgroundColor: '#19E675',
    paddingVertical: 17,
    paddingHorizontal: 24,
    borderRadius: 17,
    alignItems: 'center',
    alignSelf: 'stretch',
    width: '100%',
  },
  joinButtonText: {
    color: '#002000',
    fontSize: 16,
    fontWeight: '600',
  },
  joinedButton: {
    backgroundColor: 'rgba(25, 230, 117, 0.2)',
    paddingVertical: 17,
    paddingHorizontal: 24,
    borderRadius: 17,
    alignItems: 'center',
    alignSelf: 'stretch',
    width: '100%',
  },
  joinedButtonText: {
    color: '#4A6B54',
    fontSize: 16,
    fontWeight: '600',
  },
  footer: {
    alignItems: 'center',
    paddingVertical: 20,
    paddingBottom: 30,
  },
  footerText: {
    fontSize: 16,
    color: '#6B7280',
  },
  browseText: {
    color: '#19E675',
    textDecorationLine: 'underline',
    fontWeight: '500',
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
  loadingContainer: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  noGamesText: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 14,
    minHeight: 44,
    paddingHorizontal: 24,
    borderRadius: 22,
    backgroundColor: '#19E675',
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryButtonText: {
    color: '#002000',
    fontSize: 14,
    fontWeight: '800',
  },
});