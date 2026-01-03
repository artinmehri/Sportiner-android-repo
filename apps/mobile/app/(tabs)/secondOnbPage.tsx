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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

const { width: screenWidth } = Dimensions.get('window');
const sliderWidth = screenWidth - 80;
const thumbSize = 24;

interface TennisLevel {
  level: string;
  profileName: string;
  description: string;
}

const tennisLevels: TennisLevel[] = [
  { level: '1.0 - 1.5', profileName: 'Newcomer', description: 'I am just starting to learn the rules and the basic strokes.' },
  { level: '2.0', profileName: 'Beginner', description: 'I can get the ball over the net, but rallies are still short.' },
  { level: '2.5', profileName: 'Novice', description: 'I can sustain a slow rally and have basic court coverage.' },
  { level: '3.0', profileName: 'Low-Int.', description: 'I hit with more consistency and have started playing for points.' },
  { level: '3.5', profileName: 'Intermediate', description: 'I can place my shots with intent and use basic strategy.' },
  { level: '4.0', profileName: 'High-Int.', description: 'I have dependable strokes and can control the depth of my shots.' },
  { level: '4.5', profileName: 'Advanced', description: 'I hit with power and spin. I can vary my game based on the opponent.' },
  { level: '5.0', profileName: 'Expert', description: 'I have high-level shot anticipation and play competitive tournaments.' },
  { level: '5.5', profileName: 'Elite', description: 'I have a specialized game plan and likely played at the college level.' },
  { level: '6.0+', profileName: 'Pro', description: 'I am a high-ranking competitive player or a teaching professional.' },
];

export default function SecondOnbPage() {
  const [selectedIndex, setSelectedIndex] = useState(0); 
  const thumbPosition = useRef(new Animated.Value((selectedIndex / (tennisLevels.length - 1)) * sliderWidth)).current;
  const router = useRouter();

  const handleBack = () => {
    router.push('/firstOnbPage');
  };

  const handleContinue = () => {
    console.log('Selected level:', tennisLevels[selectedIndex].level);
    router.push('/thirdOnbPage');
  };

  const updateIndexFromPosition = (position: number) => {
    const clampedPosition = Math.max(0, Math.min(sliderWidth, position));
    const index = Math.round((clampedPosition / sliderWidth) * (tennisLevels.length - 1));
    const snapPosition = (index / (tennisLevels.length - 1)) * sliderWidth;
    
    if (index !== selectedIndex) {
      setSelectedIndex(index);
    }
    
    Animated.spring(thumbPosition, {
      toValue: snapPosition,
      useNativeDriver: false,
      tension: 200,
      friction: 15,
    }).start();
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return Math.abs(gestureState.dx) > 10;
      },
      onPanResponderGrant: () => {
        thumbPosition.stopAnimation();
        thumbPosition.setOffset((thumbPosition as any)._value);
      },
      onPanResponderMove: (_, gestureState) => {
        const newPosition = (thumbPosition as any)._value + gestureState.dx;
        const clampedPosition = Math.max(0, Math.min(sliderWidth, newPosition));
        thumbPosition.setValue(clampedPosition);
      },
      onPanResponderRelease: () => {
        thumbPosition.flattenOffset();
        const currentPosition = (thumbPosition as any)._value;
        updateIndexFromPosition(currentPosition);
      },
    })
  ).current;

  const handleDotPress = (index: number) => {
    setSelectedIndex(index);
    const position = (index / (tennisLevels.length - 1)) * sliderWidth;
    Animated.spring(thumbPosition, {
      toValue: position,
      useNativeDriver: false,
      tension: 200,
      friction: 15,
    }).start();
  };

  const currentLevel = tennisLevels[selectedIndex];
  const progressWidth = (selectedIndex / (tennisLevels.length - 1)) * sliderWidth;

  const renderDots = () => {
    return tennisLevels.map((_, index) => {
      const isActive = index <= selectedIndex;
      return (
        <TouchableOpacity
          key={index}
          style={[
            styles.dot,
            isActive && styles.dotActive,
          ]}
          onPress={() => handleDotPress(index)}
        />
      );
    });
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
          <Text style={styles.title}>What is your Tennis Level?</Text>
        </View>

        <View style={styles.levelCard}>
          <Text style={styles.levelNumber}>{currentLevel.level}</Text>
          <Text style={styles.levelDescription}>{currentLevel.description}</Text>
        </View>

        <View style={styles.sliderContainer}>
          <View style={styles.sliderTrack}>
            <View style={[styles.sliderProgress, { width: progressWidth }]} />
          </View>
          <View style={styles.dotsContainer}>{renderDots()}</View>
          <Animated.View
            style={[styles.sliderThumb, { left: thumbPosition }]}
            {...panResponder.panHandlers}
          />
        </View>
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
    marginBottom: 40,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#333',
    textAlign: 'center',
  },
  levelCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    marginBottom: 60,
    borderWidth: 1,
    borderColor: '#E5E5E5',
  },
  levelNumber: {
    fontSize: 48,
    fontWeight: '700',
    color: '#19E675',
    marginBottom: 16,
  },
  levelDescription: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    lineHeight: 24,
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
