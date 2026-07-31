import React, { useRef, useState } from 'react';
import {
  Alert,
  Image,
  Linking,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  addGameToCalendar,
  getAddToCalendarErrorMessage,
} from '@/lib/gameCalendar';

const FALLBACK_GAME_IMAGE =
  'https://images.unsplash.com/photo-1719360568896-55788b9ddea5?w=900&auto=format&fit=crop&q=60&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxzZWFyY2h8OHx8dGVubmlzJTIwY291cnRzfGVufDB8fDB8fHww';

export type OnboardingJoinConfirmation = {
  gameId: string;
  title: string;
  date: string;
  location_name: string;
  players_enrolled: number;
  capacity: number;
  outcome: 'joined' | 'requested';
  image?: string | null;
};

type Props = {
  confirmation: OnboardingJoinConfirmation;
  onViewGame: () => void;
  onExploreMore?: () => void;
};

function formatGameTime(dateIso: string) {
  if (!dateIso) return '';
  const date = new Date(dateIso);
  return date.toLocaleString(undefined, {
    weekday: 'long',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function OnboardingGameConfirm({
  confirmation,
  onViewGame,
  onExploreMore,
}: Props) {
  const [addingToCalendar, setAddingToCalendar] = useState(false);
  const [addedToCalendar, setAddedToCalendar] = useState(false);
  const calendarRequestInFlight = useRef(false);
  const isRequested = confirmation.outcome === 'requested';
  const displayedEnrolled =
    confirmation.outcome === 'joined'
      ? Math.min(confirmation.players_enrolled + 1, confirmation.capacity)
      : confirmation.players_enrolled;

  const handleAddToCalendar = async () => {
    if (calendarRequestInFlight.current || addingToCalendar || addedToCalendar) {
      return;
    }

    calendarRequestInFlight.current = true;
    setAddingToCalendar(true);

    try {
      const result = await addGameToCalendar({
        gameId: confirmation.gameId,
        title: confirmation.title,
        startDate: confirmation.date,
        location: confirmation.location_name,
        notes: confirmation.title,
      });

      if (!result.ok) {
        const alert = getAddToCalendarErrorMessage(result.reason);

        if (result.reason === 'permission_denied') {
          Alert.alert(alert.title, alert.message, [
            { text: 'Not now', style: 'cancel' },
            {
              text: 'Open Settings',
              onPress: () => void Linking.openSettings(),
            },
          ]);
        } else {
          Alert.alert(alert.title, alert.message);
        }

        return;
      }

      setAddedToCalendar(true);
      Alert.alert('Success', 'Event added to your calendar');
    } finally {
      calendarRequestInFlight.current = false;
      setAddingToCalendar(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />

      <View style={styles.content}>
        <Text style={styles.title}>
          {isRequested ? 'Request sent' : "You're in!"}
        </Text>
        <Text style={styles.subtitle}>
          {isRequested
            ? 'The host will notify you when your request is approved.'
            : 'Your spot is confirmed. See you on court.'}
        </Text>

        <View style={styles.card}>
          <View style={styles.imageWrap}>
            <Image
              source={{ uri: confirmation.image || FALLBACK_GAME_IMAGE }}
              style={styles.gameImage}
              resizeMode="cover"
            />
            <View style={styles.statusBadge}>
              <MaterialCommunityIcons
                name={isRequested ? 'clock-outline' : 'check-circle'}
                size={18}
                color="#002000"
              />
              <Text style={styles.statusBadgeText}>
                {isRequested ? 'Pending' : 'Joined'}
              </Text>
            </View>
          </View>

          <View style={styles.cardBody}>
            <Text style={styles.gameTitle}>{confirmation.title}</Text>
            <View style={styles.metaRow}>
              <MaterialCommunityIcons name="calendar" size={18} color="#19E675" />
              <Text style={styles.metaText}>{formatGameTime(confirmation.date)}</Text>
            </View>
            <View style={styles.metaRow}>
              <MaterialCommunityIcons name="map-marker" size={18} color="#19E675" />
              <Text style={styles.metaText}>{confirmation.location_name}</Text>
            </View>
            {confirmation.outcome === 'joined' ? (
              <View style={styles.metaRow}>
                <MaterialCommunityIcons name="account-group" size={18} color="#19E675" />
                <Text style={styles.metaText}>
                  {displayedEnrolled} of {confirmation.capacity} players
                </Text>
              </View>
            ) : null}
          </View>
        </View>
      </View>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.primaryButton} onPress={onViewGame}>
          <Text style={styles.primaryButtonText}>View game</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.secondaryButton,
            (addingToCalendar || addedToCalendar) && styles.secondaryButtonDisabled,
          ]}
          onPress={handleAddToCalendar}
          disabled={addingToCalendar || addedToCalendar}
          activeOpacity={0.85}
        >
          <MaterialCommunityIcons
            name={addedToCalendar ? 'check' : 'calendar-plus'}
            size={18}
            color="#333"
          />
          <Text style={styles.secondaryButtonText}>
            {addedToCalendar
              ? 'Added to calendar'
              : addingToCalendar
                ? 'Adding…'
                : 'Add to calendar'}
          </Text>
        </TouchableOpacity>

        {isRequested && onExploreMore ? (
          <TouchableOpacity style={styles.tertiaryButton} onPress={onExploreMore}>
            <Text style={styles.tertiaryButtonText}>Explore another game</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  content: {
    flex: 1,
    paddingHorizontal: 28,
    justifyContent: 'center',
  },
  title: {
    fontSize: 30,
    fontWeight: '900',
    color: '#1F2937',
    textAlign: 'center',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 16,
    lineHeight: 23,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 28,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
    overflow: 'hidden',
  },
  imageWrap: {
    position: 'relative',
  },
  gameImage: {
    width: '100%',
    height: 180,
    backgroundColor: '#E5E7EB',
  },
  statusBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#19E675',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  statusBadgeText: {
    color: '#002000',
    fontSize: 13,
    fontWeight: '700',
  },
  cardBody: {
    padding: 18,
    gap: 12,
  },
  gameTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 4,
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
    paddingHorizontal: 28,
    paddingBottom: 30,
    gap: 12,
  },
  primaryButton: {
    backgroundColor: '#19E675',
    borderRadius: 17,
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
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
    flexDirection: 'row',
    gap: 8,
  },
  secondaryButtonDisabled: {
    opacity: 0.7,
  },
  secondaryButtonText: {
    color: '#333',
    fontSize: 15,
    fontWeight: '700',
  },
  tertiaryButton: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tertiaryButtonText: {
    color: '#6B7280',
    fontSize: 15,
    fontWeight: '600',
  },
});
