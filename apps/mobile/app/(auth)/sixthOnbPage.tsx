import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  Vibration,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

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
  const headline = parkShortName
    ? `Never miss a game at ${parkShortName}`
    : 'Never miss a game';

  const benefits = [
    {
      icon: 'map-marker-outline' as const,
      title: parkShortName
        ? `Games at ${parkShortName}`
        : 'Games at your park',
      description: parkShortName
        ? `Get notified when someone creates a game at ${parkShortName}.`
        : 'Get notified when someone creates a game at your favorite park.',
    },
    {
      icon: 'account-plus-outline' as const,
      title: 'Player joins',
      description: 'See when someone joins or requests your game.',
    },
    {
      icon: 'message-text-outline' as const,
      title: 'Chat updates',
      description: 'Know when someone sends you a message.',
    },
  ];

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
        'Notifications are off',
        'You can enable notifications later in your phone settings.',
        [{ text: 'Continue', onPress: () => void continueOnboarding() }],
      );
      return;
    }

    Alert.alert(
      'Notifications unavailable',
      'We could not register this device right now. Check your connection and try again.',
      [
        { text: 'Continue', onPress: () => void continueOnboarding() },
        { text: 'Try Again', onPress: () => void handleEnableNotifications() },
      ],
    );
  };

  const handleSkip = async () => {
    if (isBusy) return;

    changeData((current: Record<string, unknown>) => ({
      ...current,
      notifications_permission: 'skipped',
    }));

    await continueOnboarding();
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.titleSection}>
          <Text style={styles.mainTitle}>{headline}</Text>
          <Text style={styles.subTitle}>Enable notifications</Text>
        </View>

        <Text style={styles.supportingText}>
          Get notified when someone creates a game at your favorite park, joins
          your game, or sends you a message.
        </Text>

        <View style={styles.cardsContainer}>
          {benefits.map((benefit) => (
            <View key={benefit.title} style={styles.benefitCard}>
              <View style={styles.iconShell}>
                <MaterialCommunityIcons
                  name={benefit.icon}
                  size={24}
                  color="#19E675"
                />
              </View>
              <View style={styles.benefitCopy}>
                <Text style={styles.benefitTitle}>{benefit.title}</Text>
                <Text style={styles.benefitDescription}>{benefit.description}</Text>
              </View>
            </View>
          ))}
        </View>

        <TouchableOpacity
          style={[styles.enableButton, isBusy && styles.buttonDisabled]}
          onPress={() => void handleEnableNotifications()}
          disabled={isBusy}
        >
          {isBusy ? (
            <ActivityIndicator color="#002000" />
          ) : (
            <Text style={styles.enableButtonText}>Enable Notifications</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => void handleSkip()}
          style={styles.footer}
          disabled={isBusy}
        >
          <View style={{ padding: 10 }}>
            <Text style={styles.footerText}>
              Not now? <Text style={styles.skipText}>Continue {'>'}</Text>
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
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  contentContainer: {
    paddingBottom: 30,
  },
  titleSection: {
    marginTop: 20,
    marginBottom: 16,
    alignItems: 'center',
  },
  mainTitle: {
    fontSize: 28,
    fontWeight: '900',
    color: '#1F2937',
    marginBottom: 5,
    textAlign: 'center',
  },
  subTitle: {
    fontSize: 28,
    fontWeight: '900',
    color: '#19E675',
    textAlign: 'center',
  },
  supportingText: {
    fontSize: 16,
    lineHeight: 23,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 28,
    paddingHorizontal: 8,
  },
  cardsContainer: {
    gap: 16,
    marginBottom: 30,
  },
  benefitCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  iconShell: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: 'rgba(25, 230, 117, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  benefitCopy: {
    flex: 1,
  },
  benefitTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 4,
  },
  benefitDescription: {
    fontSize: 14,
    lineHeight: 20,
    color: '#6B7280',
    fontWeight: '500',
  },
  enableButton: {
    backgroundColor: '#19E675',
    paddingVertical: 17,
    paddingHorizontal: 24,
    borderRadius: 17,
    alignItems: 'center',
    alignSelf: 'stretch',
    width: '100%',
    minHeight: 56,
    justifyContent: 'center',
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  enableButtonText: {
    color: '#002000',
    fontSize: 16,
    fontWeight: '600',
  },
  footer: {
    alignItems: 'center',
    paddingVertical: 20,
    paddingBottom: 10,
  },
  footerText: {
    fontSize: 16,
    color: '#6B7280',
  },
  skipText: {
    color: '#19E675',
    textDecorationLine: 'underline',
    fontWeight: '500',
  },
});
