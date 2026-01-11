import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  SafeAreaView,
  StatusBar,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

interface RNCSound {
  play: () => void;
  release: () => void;
}

const MatchVerif = () => {
  const router = useRouter();
  const [wasOnTime, setWasOnTime] = useState<string | null>(null);
  const [wouldPlayAgain, setWouldPlayAgain] = useState<string | null>(null);
  const [accuracyRating, setAccuracyRating] = useState<string | null>(null);
  const [winner, setWinner] = useState<string | null>(null);

  const handleBack = () => {
    router.back();
  };

  const handleSubmit = async () => {
    console.log('Match verification submitted:', {
      wasOnTime,
      wouldPlayAgain,
      accuracyRating,
      winner
    });
    

    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    router.push('/games?feedbackSubmitted=true');
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />
      
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBack} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color="#1F2937" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Match Verification</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Main Heading */}
        <View style={styles.mainContent}>
          <Text style={styles.mainHeading}>Help us improve game quality</Text>
          
          {/* Match VS Button */}
          <TouchableOpacity style={styles.matchVsButton}>
            <Ionicons name="star" size={20} color="#6B7280" />
            <Text style={styles.matchVsText}>Match VS. Artin M</Text>
          </TouchableOpacity>
        </View>

        {/* Question Cards */}
        <View style={styles.questionsContainer}>
          {/* Question 1 */}
          <View style={styles.questionCard}>
            <Text style={styles.questionText}>Was Artin on Time?</Text>
            <View style={styles.buttonRow}>
              <TouchableOpacity 
                style={[styles.optionButton, wasOnTime === 'no' && styles.selectedNo]}
                onPress={() => setWasOnTime('no')}
              >
                <Text style={[styles.optionText, wasOnTime === 'no' && styles.selectedNoText]}>No X</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.optionButton, wasOnTime === 'yes' && styles.selectedYes]}
                onPress={() => setWasOnTime('yes')}
              >
                <Text style={[styles.optionText, wasOnTime === 'yes' && styles.selectedYesText]}>Yes ✓</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Question 2 */}
          <View style={styles.questionCard}>
            <Text style={styles.questionText}>Would you play Artin again?</Text>
            <View style={styles.buttonRow}>
              <TouchableOpacity 
                style={[styles.optionButton, wouldPlayAgain === 'no' && styles.selectedNo]}
                onPress={() => setWouldPlayAgain('no')}
              >
                <Text style={[styles.optionText, wouldPlayAgain === 'no' && styles.selectedNoText]}>No X</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.optionButton, wouldPlayAgain === 'yes' && styles.selectedYes]}
                onPress={() => setWouldPlayAgain('yes')}
              >
                <Text style={[styles.optionText, wouldPlayAgain === 'yes' && styles.selectedYesText]}>Yes ✓</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Question 3 */}
          <View style={styles.questionCard}>
            <Text style={styles.questionText}>How accurate was Artin's <Text style={styles.highlightText}>3.5</Text> level?</Text>
            <View style={styles.ratingButtons}>
              <TouchableOpacity 
                style={[styles.ratingButton, accuracyRating === 'stronger' && styles.selectedRating]}
                onPress={() => setAccuracyRating('stronger')}
              >
                <Ionicons name="trending-up" size={16} color="#6B7280" />
                <Text style={styles.ratingText}>Stronger</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.ratingButton, accuracyRating === 'spot-on' && styles.selectedRating]}
                onPress={() => setAccuracyRating('spot-on')}
              >
                <Ionicons name="star" size={16} color="#6B7280" />
                <Text style={styles.ratingText}>Spot on</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.ratingButton, accuracyRating === 'weaker' && styles.selectedRating]}
                onPress={() => setAccuracyRating('weaker')}
              >
                <Ionicons name="trending-down" size={16} color="#6B7280" />
                <Text style={styles.ratingText}>Weaker</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Winner Selection */}
        <View style={styles.winnerSection}>
          <Text style={styles.winnerTitle}>Who won match?</Text>
          <View style={styles.winnerCards}>
            <TouchableOpacity 
              style={[styles.winnerCard, winner === 'you' && styles.selectedWinner]}
              onPress={() => setWinner('you')}
            >
              <Image 
                source={{ uri: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=900&auto=format&fit=crop&q=60&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxzZWFyY2h8Mnx8bW91bnRhaW5zfGVufDB8fDB8fHww' }} 
                style={styles.winnerImage} 
              />
              <Text style={styles.winnerName}>You</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.winnerCard, winner === 'artin' && styles.selectedWinner]}
              onPress={() => setWinner('artin')}
            >
              <Image 
                source={{ uri: 'https://plus.unsplash.com/premium_photo-1661883496453-0c211b05a121?w=900&auto=format&fit=crop&q=60&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxzZWFyY2h8OXx8dGhlJTIwc3RhcnN8ZW58MHx8MHx8fDA%3D' }} 
                style={styles.winnerImage} 
              />
              <Text style={styles.winnerName}>Artin</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Submit Button */}
        <View style={styles.submitSection}>
          <TouchableOpacity style={styles.submitButton} onPress={handleSubmit}>
            <Text style={styles.submitButtonText}>Submit feedback</Text>
          </TouchableOpacity>
          <Text style={styles.disclaimerText}>Your feedback is only used to improve system</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 0,
    paddingBottom: 5,
  },
  backButton: {
    padding: 12,
  },
  placeholder: {
    width: 24,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  mainContent: {
    alignItems: 'center',
    marginBottom: 10,
  },
  mainHeading: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1F2937',
    textAlign: 'center',
    marginBottom: 15,
  },
  matchVsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 2,
    borderColor: '#9CA3AF',
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 25,
    gap: 8,
  },
  matchVsText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
  },
  questionsContainer: {
    gap: 15,
    marginBottom: 20,
  },
  questionCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  questionText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 15,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 15,
  },
  optionButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#E5E7EB',
    alignItems: 'center',
  },
  selectedNo: {
    backgroundColor: '#FEE2E2',
    borderColor: '#EF4444',
  },
  selectedYes: {
    backgroundColor: '#19E675',
    borderColor: '#10B981',
  },
  optionText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6B7280',
  },
  selectedNoText: {
    color: '#EF4444',
  },
  selectedYesText: {
    color: '#10B981',
  },
  highlightText: {
    color: '#10B981',
    fontWeight: '700',
  },
  ratingButtons: {
    gap: 10,
  },
  ratingButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#9CA3AF',
    paddingVertical: 10,
    paddingHorizontal: 15,
    borderRadius: 8,
    gap: 8,
  },
  selectedRating: {
    backgroundColor: '#F3F4F6',
    borderColor: '#D1D5DB',
  },
  ratingText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6B7280',
  },
  winnerSection: {
    marginBottom: 30,
  },
  winnerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 15,
    textAlign: 'center',
  },
  winnerCards: {
    flexDirection: 'row',
    gap: 20,
    justifyContent: 'center',
  },
  winnerCard: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 15,
    borderWidth: 3,
    borderColor: 'transparent',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  selectedWinner: {
    borderColor: '#10B981',
  },
  winnerImage: {
    width: 80,
    height: 80,
    borderRadius: 40,
    marginBottom: 10,
  },
  winnerName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
  },
  submitSection: {
    alignItems: 'center',
    marginBottom: 40,
  },
  submitButton: {
    backgroundColor: '#19E675',
    paddingVertical: 15,
    paddingHorizontal: 40,
    borderRadius: 25,
    alignItems: 'center',
    marginBottom: 10,
  },
  submitButtonText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#ffffff',
  },
  disclaimerText: {
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'center',
  },
});

export default MatchVerif;