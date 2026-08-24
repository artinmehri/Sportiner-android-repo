import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  Vibration,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import type { SignupInterface } from '@/context/SignupInterface.type';
import { useNotifications } from '@/context/NotificationContext';
import { favoriteParkShortName } from '@/lib/favoriteParks';

export default function SixthOnbPage({
  onNext,
  changeData,
  data,
}: SignupInterface): React.JSX.Element {
  const { isRegistering, requestPermissionAndRegister } = useNotifications();
  const [isContinuing, setIsContinuing] = useState(false);
  const isBusy = isRegistering || isContinuing;

  const parkShortName = favoriteParkShortName(data?.favorite_park);

  const continueOnboarding = async () => {
    setIsContinuing(true);
    try {
      await onNext();
    } finally {
      setIsContinuing(false);
    }
  };

  const handleEnableNotifications = async () => {
    if (isBusy) return;

    Vibration.vibrate();

    const result = await requestPermissionAndRegister();

    changeData((current: Record<string, unknown>) => ({
      ...current,
      notifications_permission: result.success ? 'granted' : result.reason,
    }));

    if (result.success) {
      await continueOnboarding();
      return;
    }

    if (result.reason === 'permission-denied') {
      Alert.alert(
        'Notifications not enabled',
        'No problem. You can still use Sportiner and turn on notifications later in iPhone Settings.',
        [{ text: 'Continue', onPress: () => void continueOnboarding() }],
      );
      return;
    }

    Alert.alert(
      'Notifications unavailable',
      'We could not register this device for notifications right now. Check your connection and try again, or continue and enable them later.',
      [
        { text: 'Continue', onPress: () => void continueOnboarding() },
        { text: 'Try Again', onPress: () => void handleEnableNotifications() },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />

      <View style={styles.content}>
        <View style={styles.iconShell}>
          <View style={styles.iconCircle}>
            <Ionicons name="notifications-outline" size={42} color="#19E675" />
          </View>
        </View>

        <View style={styles.titleSection}>
          <Text style={styles.title}>
            {parkShortName
              ? `Never miss a game at ${parkShortName}`
              : 'Never miss a game'}
          </Text>
          <Text style={styles.subtitle}>
            Sportiner sends you notifications about nearby tennis games
            {parkShortName ? ` at ${parkShortName}` : ''}, new chat messages,
            and when someone joins your game. You can change this anytime in
            Settings.
          </Text>
        </View>

        <View style={styles.infoCard}>
          <View style={styles.infoRow}>
            <Ionicons name="tennisball-outline" size={20} color="#19E675" />
            <Text style={styles.infoText}>
              {parkShortName
                ? `Anyone can create a game at ${parkShortName}. We’ll alert you about new ones.`
                : 'Anyone can create a game. We’ll alert you about new ones nearby.'}
            </Text>
          </View>
          <View style={styles.infoRow}>
            <Ionicons name="people-outline" size={20} color="#19E675" />
            <Text style={styles.infoText}>
              See when someone joins or requests your game
            </Text>
          </View>
          <View style={styles.infoRow}>
            <Ionicons name="chatbubble-outline" size={20} color="#19E675" />
            <Text style={styles.infoText}>
              Know when a player sends you a chat message
            </Text>
          </View>
          <View style={styles.infoRow}>
            <Ionicons name="shield-checkmark-outline" size={20} color="#19E675" />
            <Text style={styles.infoText}>
              Choose your preference in the iOS permission prompt
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.primaryButton, isBusy && styles.buttonDisabled]}
          onPress={() => void handleEnableNotifications()}
          disabled={isBusy}
        >
          {isBusy ? (
            <ActivityIndicator color="#002000" />
          ) : (
            <Text style={styles.primaryButtonText}>Continue</Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  content: {
    flex: 1,
    paddingHorizontal: 28,
    justifyContent: 'center',
  },
  iconShell: {
    alignItems: 'center',
    marginBottom: 24,
  },
  iconCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: 'rgba(25, 230, 117, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleSection: {
    marginBottom: 28,
  },
  title: {
    fontSize: 28,
    fontWeight: '900',
    color: '#1F2937',
    textAlign: 'center',
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 16,
    lineHeight: 23,
    color: '#6B7280',
    textAlign: 'center',
  },
  infoCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 18,
    gap: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  infoText: {
    flex: 1,
    fontSize: 15,
    lineHeight: 21,
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
  buttonDisabled: {
    opacity: 0.7,
  },
  primaryButtonText: {
    color: '#002000',
    fontSize: 16,
    fontWeight: '700',
  },
});
