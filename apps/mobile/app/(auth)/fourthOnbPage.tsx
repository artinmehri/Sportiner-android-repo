import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { SignupInterface } from '../../context/SignupInterface.type';
import { saveLatestLocationPosition } from '@/lib/latestLocation';
import {
  logOnboardingError,
  onboardingErrorCopy,
  providerFromMethod,
  toOnboardingError,
} from '@/lib/onboardingErrors';

export default function FourthOnbPage({ onNext, onBack, changeData, data }: SignupInterface) {
  const [isRequestingLocation, setIsRequestingLocation] = useState(false);

  const handleUseLocation = async () => {
    if (isRequestingLocation) return;

    setIsRequestingLocation(true);

    try {
      const { status } = await Location.requestForegroundPermissionsAsync();

      if (status !== 'granted') {
        changeData((current: any) => ({
          ...current,
          location: null,
          location_permission: 'denied',
        }));
        Alert.alert(
          'Location not enabled',
          'No problem. You can still browse games and create games manually.'
        );
        await onNext();
        return;
      }

      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      changeData((current: any) => ({
        ...current,
        location: {
          lat: Number(position.coords.latitude),
          lng: Number(position.coords.longitude),
        },
        location_permission: 'granted',
      }));

      await onNext();

      // Email signup creates the authenticated user and public profile in
      // onNext. Persist only after that preparation so the location RPC can
      // resolve auth.uid() to an existing public.users row.
      void saveLatestLocationPosition(position, 'onboarding');
    } catch (error) {
      const locationError = toOnboardingError(
        {
          failure: 'location',
          provider: providerFromMethod(data?.method),
          source: 'location.get_current_position',
        },
        error
      );
      const copy = onboardingErrorCopy(locationError);
      logOnboardingError(locationError);
      Alert.alert(copy.title, copy.message, [
        {
          text: 'Continue Without Location',
          onPress: () => {
            changeData((current: any) => ({
              ...current,
              location: null,
              location_permission: 'skipped',
            }));
            void onNext();
          },
        },
        { text: 'Try Again', onPress: () => void handleUseLocation() },
      ]);
    } finally {
      setIsRequestingLocation(false);
    }
  };

  const handleSkipLocation = async () => {
    if (isRequestingLocation) return;

    setIsRequestingLocation(true);
    changeData((current: any) => ({
      ...current,
      location: null,
      location_permission: 'skipped',
    }));

    try {
      await onNext();
    } finally {
      setIsRequestingLocation(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color="#000" />
        </TouchableOpacity>
        <View style={styles.progressDots}>
          <View style={[styles.dot, styles.activeDot]} />
          <View style={[styles.dot, styles.activeDot]} />
          <View style={[styles.dot, styles.activeDot]} />
          <View style={[styles.dot, styles.activeDot]} />
        </View>
        <View style={styles.placeholder} />
      </View>

      <View style={styles.content}>
        <View style={styles.iconShell}>
          <View style={styles.iconCircle}>
            <Ionicons name="location-outline" size={42} color="#19E675" />
          </View>
        </View>

        <View style={styles.titleSection}>
          <Text style={styles.title}>Find games near you</Text>
          <Text style={styles.subtitle}>
            Sportiner can use your location to sort tennis games and courts by distance. You can still browse games without sharing your location.
          </Text>
        </View>

        <View style={styles.infoCard}>
          <View style={styles.infoRow}>
            <Ionicons name="tennisball-outline" size={20} color="#19E675" />
            <Text style={styles.infoText}>See nearby tennis games first</Text>
          </View>
          <View style={styles.infoRow}>
            <Ionicons name="map-outline" size={20} color="#19E675" />
            <Text style={styles.infoText}>Sort court suggestions by distance</Text>
          </View>
          <View style={styles.infoRow}>
            <Ionicons name="shield-checkmark-outline" size={20} color="#19E675" />
            <Text style={styles.infoText}>Skip now and browse manually anytime</Text>
          </View>
        </View>
      </View>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.primaryButton, isRequestingLocation && styles.buttonDisabled]}
          onPress={handleUseLocation}
          disabled={isRequestingLocation}
        >
          {isRequestingLocation ? (
            <ActivityIndicator color="#002000" />
          ) : (
            <Text style={styles.primaryButtonText}>Use My Location</Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={handleSkipLocation}
          disabled={isRequestingLocation}
        >
          <Text style={styles.secondaryButtonText}>Not Now</Text>
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 20,
  },
  backButton: {
    padding: 5,
  },
  progressDots: {
    flexDirection: 'row',
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#E5E5E5',
  },
  activeDot: {
    backgroundColor: '#19E675',
  },
  placeholder: {
    width: 34,
  },
  content: {
    flex: 1,
    paddingHorizontal: 28,
    justifyContent: 'center',
  },
  iconShell: {
    alignItems: 'center',
    marginBottom: 28,
  },
  iconCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: 'rgba(25, 230, 117, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(25, 230, 117, 0.28)',
  },
  titleSection: {
    alignItems: 'center',
    marginBottom: 34,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#333',
    textAlign: 'center',
    marginBottom: 14,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    lineHeight: 23,
  },
  infoCard: {
    backgroundColor: '#F8F8F8',
    borderRadius: 18,
    paddingVertical: 18,
    paddingHorizontal: 18,
    gap: 14,
    borderWidth: 1,
    borderColor: '#E5E5E5',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    color: '#333',
    fontWeight: '600',
  },
  footer: {
    paddingHorizontal: 20,
    paddingBottom: 30,
    paddingTop: 10,
    backgroundColor: '#fff',
    gap: 12,
  },
  primaryButton: {
    backgroundColor: '#19E675',
    borderRadius: 16,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: {
    opacity: 0.75,
  },
  primaryButtonText: {
    color: '#002000',
    fontSize: 16,
    fontWeight: '700',
  },
  secondaryButton: {
    borderRadius: 16,
    height: 52,
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
});
