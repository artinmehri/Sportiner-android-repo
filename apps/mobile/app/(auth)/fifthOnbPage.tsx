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
  Pressable,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SignupInterface } from '@/context/SignupInterface.type';
import { FAVORITE_PARK_OPTIONS, type FavoriteParkOption } from '@/lib/favoriteParks';

export { FAVORITE_PARK_OPTIONS, type FavoriteParkOption };

export default function FifthOnbPage({
  onNext,
  onBack,
  changeData,
  data,
}: SignupInterface) {
  const [selectedPark, setSelectedPark] = useState<string | null>(
    data?.favorite_park ?? null,
  );
  const [isSaving, setIsSaving] = useState(false);

  const handleContinue = async () => {
    if (!selectedPark) {
      Alert.alert('Pick a park', 'Choose your favorite tennis park to continue.');
      return;
    }

    if (isSaving) return;
    setIsSaving(true);

    changeData((current: Record<string, unknown>) => ({
      ...current,
      favorite_park: selectedPark,
    }));

    try {
      await onNext(selectedPark);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSkip = async () => {
    if (isSaving) return;
    setIsSaving(true);

    changeData((current: Record<string, unknown>) => ({
      ...current,
      favorite_park: null,
    }));

    try {
      await onNext();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backButton} disabled={isSaving}>
          <Ionicons name="chevron-back" size={24} color="#000" />
        </TouchableOpacity>
        <View style={styles.progressDots}>
          {Array.from({ length: 7 }).map((_, index) => (
            <View key={index} style={[styles.dot, styles.activeDot]} />
          ))}
        </View>
        <View style={styles.placeholder} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.titleSection}>
          <Text style={styles.title}>What{"'"}s your favorite park?</Text>
          <Text style={styles.subtitle}>
            We{"'"}ll show games here, and anyone can create one at the parks you care about.
          </Text>
        </View>

        {FAVORITE_PARK_OPTIONS.map((park) => {
          const isSelected = selectedPark === park;
          return (
            <Pressable
              key={park}
              onPress={() => {
                setSelectedPark(park);
                changeData((current: Record<string, unknown>) => ({
                  ...current,
                  favorite_park: park,
                }));
              }}
              style={({ pressed }) => [
                styles.parkCard,
                {
                  backgroundColor: isSelected
                    ? '#19E675'
                    : pressed
                      ? '#E5E5E5'
                      : '#fff',
                },
              ]}
            >
              <View style={styles.parkIconContainer}>
                <Ionicons
                  name="map-outline"
                  size={24}
                  color={isSelected ? '#002000' : '#666'}
                />
              </View>
              <Text
                style={[
                  styles.parkLabel,
                  { color: isSelected ? '#002000' : '#333' },
                ]}
              >
                {park}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.continueButton, isSaving && styles.buttonDisabled]}
          onPress={() => void handleContinue()}
          disabled={isSaving}
        >
          {isSaving ? (
            <ActivityIndicator color="#002000" />
          ) : (
            <Text style={styles.continueButtonText}>Continue</Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={() => void handleSkip()}
          disabled={isSaving}
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
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 28,
    paddingBottom: 20,
  },
  titleSection: {
    alignItems: 'center',
    marginBottom: 28,
    marginTop: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#333',
    textAlign: 'center',
  },
  subtitle: {
    marginTop: 10,
    fontSize: 14,
    fontWeight: '500',
    color: '#666',
    textAlign: 'center',
    lineHeight: 20,
  },
  parkCard: {
    borderRadius: 16,
    paddingVertical: 18,
    paddingHorizontal: 16,
    alignItems: 'center',
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#E5E5E5',
    flexDirection: 'row',
    minHeight: 72,
  },
  parkIconContainer: {
    width: 34,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  parkLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 21,
  },
  footer: {
    paddingHorizontal: 20,
    paddingBottom: 30,
    paddingTop: 10,
    gap: 12,
  },
  continueButton: {
    backgroundColor: '#19E675',
    borderRadius: 16,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: {
    opacity: 0.75,
  },
  continueButtonText: {
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
