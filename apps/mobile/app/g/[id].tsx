import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { parseGameLinkChannel } from '@/lib/gameLinkChannel';
import {
  normalizePublicGameId,
  resolvePublicGameLink,
  type PublicGameState,
} from '@/lib/gameResolver';
import { emitGameLinkOpenedEvent } from '@/lib/productEvent';

type LinkScreenState =
  | { status: 'loading' }
  | { status: 'error'; title: string; message: string };

function paramValue(value: string | string[] | undefined): string | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function unavailableCopy(state: PublicGameState): { title: string; message: string } {
  if (state === 'invalid') {
    return {
      title: 'Invalid game link',
      message: 'This Sportiner game link is not valid.',
    };
  }

  if (state === 'cancelled') {
    return {
      title: 'Game cancelled',
      message: 'This tennis game was cancelled by its host.',
    };
  }

  if (state === 'completed' || state === 'started') {
    return {
      title: 'Game has ended',
      message: 'This tennis game is no longer available to join.',
    };
  }

  return {
    title: 'Game unavailable',
    message: 'This game may have ended, been removed, or be unavailable to your account.',
  };
}

export default function GameDeepLink() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    id?: string | string[];
    s?: string | string[];
    ch?: string | string[];
  }>();
  const publicId = useMemo(() => paramValue(params.id), [params.id]);
  const shareCode = useMemo(() => paramValue(params.s), [params.s]);
  const channel = useMemo(() => parseGameLinkChannel(paramValue(params.ch)), [params.ch]);
  const [attempt, setAttempt] = useState(0);
  const [screenState, setScreenState] = useState<LinkScreenState>({ status: 'loading' });

  useEffect(() => {
    let isActive = true;

    const openGame = async () => {
      setScreenState({ status: 'loading' });

      try {
        const resolution = await resolvePublicGameLink(publicId, shareCode);
        if (!isActive) return;

        void emitGameLinkOpenedEvent({
          gamePublicId: resolution.publicId ?? normalizePublicGameId(publicId),
          channel,
          shareCodePresent: Boolean(shareCode?.trim()),
          resolutionState: resolution.state,
        });

        if (resolution.status === 'resolved') {
          router.replace({
            pathname: '/(tabs)/EventDetails',
            params: { id: resolution.gameId },
          });
          return;
        }

        setScreenState({
          status: 'error',
          ...unavailableCopy(resolution.state),
        });
      } catch (error) {
        console.warn('[gameDeepLink] Unable to resolve game link', error);
        if (!isActive) return;
        void emitGameLinkOpenedEvent({
          gamePublicId: normalizePublicGameId(publicId),
          channel,
          shareCodePresent: Boolean(shareCode?.trim()),
          resolutionState: 'error',
        });
        setScreenState({
          status: 'error',
          title: "Couldn't open game",
          message: 'Check your connection and try again.',
        });
      }
    };

    void openGame();

    return () => {
      isActive = false;
    };
  }, [attempt, channel, publicId, router, shareCode]);

  return (
    <View style={styles.container}>
      <View style={styles.iconContainer}>
        <Ionicons
          name={screenState.status === 'loading' ? 'tennisball-outline' : 'link-outline'}
          size={34}
          color="#005124"
        />
      </View>

      {screenState.status === 'loading' ? (
        <>
          <ActivityIndicator size="large" color="#19E675" style={styles.spinner} />
          <Text style={styles.title}>Opening game...</Text>
          <Text style={styles.message}>Loading the latest tennis game details.</Text>
        </>
      ) : (
        <>
          <Text style={styles.title}>{screenState.title}</Text>
          <Text style={styles.message}>{screenState.message}</Text>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => setAttempt((current) => current + 1)}
            accessibilityRole="button"
          >
            <Text style={styles.primaryButtonText}>Try Again</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => router.replace('/(tabs)')}
            accessibilityRole="button"
          >
            <Text style={styles.secondaryButtonText}>Browse Games</Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 32,
  },
  iconContainer: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(25, 230, 117, 0.14)',
  },
  spinner: {
    marginTop: 24,
  },
  title: {
    marginTop: 20,
    fontSize: 24,
    fontWeight: '700',
    color: '#121212',
    textAlign: 'center',
  },
  message: {
    marginTop: 10,
    maxWidth: 320,
    fontSize: 15,
    lineHeight: 22,
    color: '#5F6368',
    textAlign: 'center',
  },
  primaryButton: {
    width: '100%',
    maxWidth: 320,
    minHeight: 50,
    marginTop: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 25,
    backgroundColor: '#19E675',
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#002E16',
  },
  secondaryButton: {
    minHeight: 48,
    marginTop: 8,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#005124',
  },
});
