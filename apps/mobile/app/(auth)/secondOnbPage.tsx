import React, { useState, type ComponentProps } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  Dimensions,
  Pressable,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SignupInterface } from '../../context/SignupInterface.type';


const { width: screenWidth } = Dimensions.get('window');
const sliderWidth = screenWidth - 80;

export default function SecondOnbPage({onNext, changeData, onBack, data}: SignupInterface) {
  const [selectedLevel, setSelectedLevel] = useState<string | null>(data?.level ?? null);
  type IconName = ComponentProps<typeof Ionicons>['name'];
  
  const levels: { id: string; label: string; icon: IconName }[] = [
    { id: 'beginner', label: "I'm new to tennis", icon: 'tennisball-outline' },
    { id: 'intermediate', label: 'I know the tennis rules and basics', icon: 'trending-up-outline' },
    { id: 'advanced', label: 'I understand tennis strategy and tactics', icon: 'flame-outline' },
    { id: 'pro', label: "I'm a competitive tennis player", icon: 'trophy-outline' },
  ];


  const handleContinue = () => {

    if (!selectedLevel) {
      Alert.alert("Please pick a level!")
      return
    }

    changeData((prev: any) => ({
      ...prev,
      level: selectedLevel
    }))
    onNext()
    console.log('data sent to signup flow')
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
          <View style={styles.dot} />
          <View style={styles.dot} />
        </View>
        <View style={styles.placeholder} />
      </View>

      <View style={styles.content}>
        <View style={styles.titleSection}>
          <Text style={styles.title}>What{"'"}s your tennis level?</Text>
          <Text style={styles.subtitle}>
            Choose the option that best describes your tennis experience.
          </Text>
        </View>

        {levels.map((level) => {
  const isSelected = selectedLevel === level.id;
  return (
    <Pressable 
      key={level.id}
      onPress={() => {
        setSelectedLevel(level.id);
        changeData((current: any) => ({
          ...current,
          level: level.id,
        }));
      }}
      style={({ pressed }) => [
        styles.levelCard,
        { backgroundColor: isSelected ? '#19E675' : (pressed ? '#E5E5E5' : '#fff') }
      ]}
    >
      <View style={styles.levelIconContainer}>
        <Ionicons name={level.icon} size={26} color={isSelected ? '#002000' : '#666'} />
      </View>
      <Text
        numberOfLines={2}
        adjustsFontSizeToFit
        minimumFontScale={0.88}
        style={[styles.levelDescription, { color: isSelected ? '#002000' : '#666' }]}
      >
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
  subtitle: {
    marginTop: 10,
    fontSize: 14,
    fontWeight: '500',
    color: '#666',
    textAlign: 'center',
    lineHeight: 20,
  },
  levelCard: {
    borderRadius: 16,
    paddingVertical: 20,
    paddingHorizontal: 18,
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E5E5E5',
    flexDirection: 'row',
    minHeight: 76,
  },
  levelIconContainer: {
    width: 34,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  levelNumber: {
    fontSize: 48,
    fontWeight: '700',
    color: '#19E675',
    marginBottom: 16,
  },
  levelDescription: {
    flex: 1,
    flexShrink: 1,
    fontWeight: '600',
    fontSize: 15,
    color: '#666',
    textAlign: 'left',
    lineHeight: 20,
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
