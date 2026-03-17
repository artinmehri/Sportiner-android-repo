import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  PanResponder,
  Dimensions,
  Animated,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { ComponentProps } from 'react';


const { width: screenWidth } = Dimensions.get('window');
const sliderWidth = screenWidth - 80;
const thumbSize = 24;

interface TennisLevel {
  level: string;
  profileName: string;
  description: string;
}

export default function SecondOnbPage() {
  const [selectedLevel, setSelectedLevel] = useState<string | null>(null);  
  const router = useRouter();

  type IconName = ComponentProps<typeof Ionicons>['name'];
  
  const levels: { id: string; label: string; icon: IconName }[] = [    
    { id: 'beginner', label: "I don't know how to play", icon: 'tennisball-outline' },
    { id: 'intermediate', label: "I know the rules and basics", icon: 'trending-up-outline' },
    { id: 'advanced', label: "I know strategies and tactics", icon: 'flame-outline' },
    { id: 'pro', label: "I'm a tournament player", icon: 'trophy-outline' },
  ];

  const handleBack = () => {
    router.push('/firstOnbPage');
  };

  const handleContinue = () => {
    router.push('/thirdOnbPage');
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBack} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color="#000" />
        </TouchableOpacity>
        <View style={styles.progressDots}>
          <View style={[styles.dot, styles.activeDot]} />
          <View style={[styles.dot, styles.activeDot]} />
          <View style={styles.dot} />
        </View>
        <View style={styles.placeholder} />
      </View>

      <View style={styles.content}>
        <View style={styles.titleSection}>
          <Text style={styles.title}>How's your game?</Text>
        </View>

        {levels.map((level) => {
  const isSelected = selectedLevel === level.id;
  return (
    <Pressable 
      key={level.id}
      onPress={() => setSelectedLevel(level.id)}
      style={({ pressed }) => [
        styles.levelCard,
        { backgroundColor: isSelected ? '#19E675' : (pressed ? '#E5E5E5' : '#fff') }
      ]}
    >
      <Ionicons name={level.icon} size={28} color={isSelected ? '#002000' : '#666'} />
      <Text style={[styles.levelDescription, { color: isSelected ? '#002000' : '#666' }]}>
        {level.label}
      </Text>
    </Pressable>
  );
})}
      </View>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.continueButton} onPress={handleContinue}>
          <Text style={styles.continueButtonText}>Continue</Text>
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
  dotActive: {
    backgroundColor: '#19E675',
  },
  placeholder: {
    width: 34,
  },
  content: {
    flex: 1,
    paddingHorizontal: 40,
    justifyContent: 'center',
  },
  titleSection: {
    alignItems: 'center',
    marginTop: -50,
    marginBottom: 70,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#333',
    textAlign: 'center',
  },
  levelCard: {
    borderRadius: 16,
    padding: 23,
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#E5E5E5',
    flexDirection: 'row'
  },
  levelNumber: {
    fontSize: 48,
    fontWeight: '700',
    color: '#19E675',
    marginBottom: 16,
  },
  levelDescription: {
    fontWeight: '600',
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    lineHeight: 20,
    marginLeft: 17
  },
  sliderContainer: {
    height: 60,
    marginBottom: 40,
    position: 'relative',
    alignSelf: 'center',
    width: sliderWidth,
  },
  sliderTrack: {
    position: 'absolute',
    top: 26,
    left: 0,
    width: sliderWidth,
    height: 4,
    backgroundColor: '#E5E5E5',
    borderRadius: 2,
  },
  sliderProgress: {
    position: 'absolute',
    top: 0,
    left: 0,
    height: 4,
    backgroundColor: '#19E675',
    borderRadius: 2,
  },
  dotsContainer: {
    position: 'absolute',
    top: 20,
    left: 0,
    flexDirection: 'row',
    width: sliderWidth,
    justifyContent: 'space-between',
  },
  intervalSection: {
    position: 'absolute',
    top: 0,
    height: 40,
    backgroundColor: 'transparent',
  },
  sliderThumb: {
    position: 'absolute',
    top: 18,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 0,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 5,
  },
  footer: {
    paddingHorizontal: 20,
    paddingBottom: 30,
    paddingTop: 10,
    backgroundColor: '#fff',
  },
  continueButton: {
    height: 56,
    backgroundColor: '#19E675',
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  continueButtonText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
});
