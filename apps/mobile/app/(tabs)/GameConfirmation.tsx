import React, { useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  Alert,
  Animated,
  Easing,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { shareGame } from '@/lib/gameShare';

function paramValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
}

function formatSchedule(dateIso: string): string {
  if (!dateIso) return 'Schedule TBD';
  const date = new Date(dateIso);
  if (Number.isNaN(date.getTime())) return 'Schedule TBD';

  const day = date.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
  const time = date.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
  return `${day} · ${time}`;
}

const PARTICLES = [
  { left: -54, delay: 0, drift: -18 },
  { left: -18, delay: 40, drift: -28 },
  { left: 18, delay: 80, drift: -22 },
  { left: 54, delay: 120, drift: -30 },
  { left: 0, delay: 60, drift: -36 },
];

export default function GameConfirmation() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    id?: string | string[];
    title?: string | string[];
    date?: string | string[];
    location_name?: string | string[];
    level?: string | string[];
    capacity?: string | string[];
    players_enrolled?: string | string[];
    publicId?: string | string[];
  }>();

  const gameId = paramValue(params.id);
  const publicId = paramValue(params.publicId);
  const title = paramValue(params.title) || 'Your game';
  const dateIso = paramValue(params.date);
  const locationName = paramValue(params.location_name) || 'Tennis court';
  const level = paramValue(params.level) || 'Intermediate';
  const capacity = Number(paramValue(params.capacity) || '4') || 4;
  const playersEnrolled = Number(paramValue(params.players_enrolled) || '1') || 1;

  const checkScale = useRef(new Animated.Value(0.85)).current;
  const checkOpacity = useRef(new Animated.Value(0)).current;
  const titleOpacity = useRef(new Animated.Value(0)).current;
  const titleTranslate = useRef(new Animated.Value(14)).current;
  const contentOpacity = useRef(new Animated.Value(0)).current;
  const particleProgress = useRef(PARTICLES.map(() => new Animated.Value(0))).current;

  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.timing(checkOpacity, {
          toValue: 1,
          duration: 180,
          useNativeDriver: true,
        }),
        Animated.sequence([
          Animated.timing(checkScale, {
            toValue: 1.05,
            duration: 220,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(checkScale, {
            toValue: 1,
            duration: 180,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
      ]),
      Animated.parallel([
        Animated.timing(titleOpacity, {
          toValue: 1,
          duration: 280,
          useNativeDriver: true,
        }),
        Animated.timing(titleTranslate, {
          toValue: 0,
          duration: 280,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(contentOpacity, {
          toValue: 1,
          duration: 320,
          delay: 60,
          useNativeDriver: true,
        }),
      ]),
    ]).start();

    particleProgress.forEach((value, index) => {
      Animated.timing(value, {
        toValue: 1,
        duration: 700,
        delay: PARTICLES[index].delay,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start();
    });
  }, [
    checkOpacity,
    checkScale,
    contentOpacity,
    particleProgress,
    titleOpacity,
    titleTranslate,
  ]);

  const scheduleLabel = useMemo(() => formatSchedule(dateIso), [dateIso]);

  const handleInvitePlayers = async () => {
    try {
      const shared = await shareGame({
        publicId,
        title,
        time: scheduleLabel,
        location: locationName,
        level,
      });
      if (!shared) {
        Alert.alert('Game link unavailable', 'This game is not ready to share yet. Please try again shortly.');
      }
    } catch (error) {
      console.error('Error sharing:', error);
    }
  };

  const openGame = () => {
    if (!gameId) {
      router.replace('/(tabs)/games');
      return;
    }
    router.replace({
      pathname: '/(tabs)/EventDetails',
      params: { id: gameId },
    });
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      <View style={styles.container}>
        <View style={styles.hero}>
          <View style={styles.checkWrap}>
            {PARTICLES.map((particle, index) => {
              const progress = particleProgress[index];
              return (
                <Animated.Text
                  key={`particle-${index}`}
                  style={[
                    styles.particle,
                    {
                      left: '50%',
                      marginLeft: particle.left,
                      opacity: progress.interpolate({
                        inputRange: [0, 0.2, 1],
                        outputRange: [0, 1, 0],
                      }),
                      transform: [
                        {
                          translateY: progress.interpolate({
                            inputRange: [0, 1],
                            outputRange: [0, particle.drift],
                          }),
                        },
                        {
                          scale: progress.interpolate({
                            inputRange: [0, 0.3, 1],
                            outputRange: [0.6, 1, 0.9],
                          }),
                        },
                      ],
                    },
                  ]}
                >
                  🎾
                </Animated.Text>
              );
            })}

            <Animated.View
              style={[
                styles.checkmarkCircle,
                {
                  opacity: checkOpacity,
                  transform: [{ scale: checkScale }],
                },
              ]}
            >
              <Ionicons name="checkmark" size={42} color="#002000" />
            </Animated.View>
          </View>

          <Animated.View
            style={{
              opacity: titleOpacity,
              transform: [{ translateY: titleTranslate }],
            }}
          >
            <Text style={styles.title}>Your game is live! 🎾</Text>
            <Text style={styles.subtitle}>
              Invite players now, or manage the details of your game.
            </Text>
          </Animated.View>
        </View>

        <Animated.View style={[styles.card, { opacity: contentOpacity }]}>
          <Text style={styles.cardTitle} numberOfLines={2}>
            {title}
          </Text>
          <View style={styles.metaRow}>
            <Ionicons name="calendar-outline" size={18} color="#19E675" />
            <Text style={styles.metaText}>{scheduleLabel}</Text>
          </View>
          <View style={styles.metaRow}>
            <Ionicons name="location-outline" size={18} color="#19E675" />
            <Text style={styles.metaText}>{locationName}</Text>
          </View>
          <View style={styles.metaRow}>
            <Ionicons name="people-outline" size={18} color="#19E675" />
            <Text style={styles.metaText}>
              {level} · {playersEnrolled} of {capacity} players
            </Text>
          </View>
        </Animated.View>

        <Animated.View style={[styles.footer, { opacity: contentOpacity }]}>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={handleInvitePlayers}
            activeOpacity={0.85}
          >
            <Ionicons name="people" size={18} color="#002000" style={styles.buttonIcon} />
            <Text style={styles.primaryButtonText}>Invite players</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={openGame}
            activeOpacity={0.85}
          >
            <Text style={styles.secondaryButtonText}>View game</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.homeLink}
            onPress={() => router.replace('/(tabs)')}
            activeOpacity={0.75}
          >
            <Text style={styles.homeLinkText}>Back to home</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  container: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 16,
    justifyContent: 'space-between',
  },
  hero: {
    alignItems: 'center',
    paddingTop: 24,
  },
  checkWrap: {
    width: 120,
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 22,
  },
  checkmarkCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: '#19E675',
    alignItems: 'center',
    justifyContent: 'center',
  },
  particle: {
    position: 'absolute',
    top: 28,
    fontSize: 16,
  },
  title: {
    fontSize: 30,
    fontWeight: '900',
    color: '#111827',
    textAlign: 'center',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 16,
    lineHeight: 23,
    color: '#6B7280',
    textAlign: 'center',
    paddingHorizontal: 12,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 18,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 2,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  metaText: {
    flex: 1,
    fontSize: 15,
    color: '#374151',
    fontWeight: '500',
  },
  footer: {
    gap: 12,
    paddingBottom: 8,
  },
  primaryButton: {
    backgroundColor: '#19E675',
    borderRadius: 17,
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  buttonIcon: {
    marginRight: 8,
  },
  primaryButtonText: {
    color: '#002000',
    fontSize: 16,
    fontWeight: '700',
  },
  secondaryButton: {
    minHeight: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E5E5',
  },
  secondaryButtonText: {
    color: '#333',
    fontSize: 15,
    fontWeight: '700',
  },
  homeLink: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 40,
  },
  homeLinkText: {
    color: '#6B7280',
    fontSize: 14,
    fontWeight: '600',
  },
});
