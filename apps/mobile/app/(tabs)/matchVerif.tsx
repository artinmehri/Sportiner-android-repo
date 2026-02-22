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

    router.replace('/games?feedbackSubmitted=true');
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
          <View style={styles.matchVsButton}>
            <Ionicons name="star" size={20} color="#6B7280" />
            <Text style={styles.matchVsText}>Match VS. Artin M</Text>
          </View>
        </View>

        {/* Question Cards */}
        <View style={styles.questionsContainer}>
          {/* Question 1 */}
          <View style={styles.questionCard}>
            <Text style={styles.questionText}>Was Artin on Time?</Text>
            <View style={styles.buttonRow}>
              <TouchableOpacity 
                style={[styles.optionButton, wasOnTime === 'no' && styles.selectedNo]}
                onPress={() => setWasOnTime(wasOnTime === 'no' ? null : 'no')}
              >
                <Text style={[styles.optionText, wasOnTime === 'no' && styles.selectedNoText]}>No X</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.optionButton, wasOnTime === 'yes' && styles.selectedYes]}
                onPress={() => setWasOnTime(wasOnTime === 'yes' ? null : 'yes')}
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
                onPress={() => setWouldPlayAgain(wouldPlayAgain === 'no' ? null : 'no')}
              >
                <Text style={[styles.optionText, wouldPlayAgain === 'no' && styles.selectedNoText]}>No X</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.optionButton, wouldPlayAgain === 'yes' && styles.selectedYes]}
                onPress={() => setWouldPlayAgain(wouldPlayAgain === 'yes' ? null : 'yes')}
              >
                <Text style={[styles.optionText, wouldPlayAgain === 'yes' && styles.selectedYesText]}>Yes ✓</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Question 3 */}
          <View style={styles.questionCard}>
            <Text style={styles.questionText}>How accurate was Artin's <Text style={styles.highlightText}>Intermediate(750)</Text> level?</Text>
            <View style={styles.ratingButtons}>

              <TouchableOpacity style={[styles.ratingButton, accuracyRating === 'stronger' && styles.selectedRating]} onPress={() => setAccuracyRating(accuracyRating === 'stronger' ? null : 'stronger')}>
              <Text style={[styles.ratingText, accuracyRating === 'stronger' && styles.selectedRatingText]}>Stronger</Text>
                <Ionicons name="trending-up" size={16} style={[styles.logo, accuracyRating === 'stronger' && styles.selectedLogo]} />
              </TouchableOpacity>


              <TouchableOpacity style={[styles.ratingButton, accuracyRating === 'spot-on' && styles.selectedRating]} onPress={() => setAccuracyRating(accuracyRating === 'spot-on' ? null : 'spot-on')}>
                <Text style={[styles.ratingText, accuracyRating === 'spot-on' && styles.selectedRatingText]}>Spot</Text>
                <Ionicons name="star" size={16} style={[styles.logo, accuracyRating === 'spot-on' && styles.selectedLogo]} />
              </TouchableOpacity>


              <TouchableOpacity style={[styles.ratingButton, accuracyRating === 'weaker' && styles.selectedRating]}onPress={() => setAccuracyRating(accuracyRating === 'weaker' ? null : 'weaker')}>
              <Text style={[styles.ratingText, accuracyRating === 'weaker' && styles.selectedRatingText]}>Weaker</Text>
                <Ionicons name="trending-down" size={16} style={[styles.logo, accuracyRating === 'weaker' && styles.selectedLogo]} />
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
              onPress={() => setWinner(winner === 'you' ? null : 'you')}
            >
              <Image 
                source={{ uri: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=900&auto=format&fit=crop&q=60&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxzZWFyY2h8Mnx8bW91bnRhaW5zfGVufDB8fDB8fHww' }} 
                style={styles.winnerImage} 
              />
              <Text style={styles.winnerName}>You</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.winnerCard, winner === 'artin' && styles.selectedWinner]}
              onPress={() => setWinner(winner === 'artin' ? null : 'artin')}
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
          <Text style={styles.disclaimerText}>This feedback impacts their Community Trust Score. Please be accurate.</Text>
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
    marginBottom: 30,
    marginTop: 15
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
    marginBottom: 17
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
    borderColor: '#C2C2C2',
    borderWidth: 0.7,
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  questionText: {
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 20,
    
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 15,
  },
  optionButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 9999,
    borderWidth: 2,
    borderColor: '#E5E7EB',
    alignItems: 'center',
  },
  selectedNo: {
    backgroundColor: 'transparent',
    borderColor: '#EF4444',
  },
  selectedYes: {
    backgroundColor: 'transparent',
    borderColor: '#19E675',
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
    color: '#19E675',
  },
  highlightText: {
    color: '#19E675',
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
    borderRadius: 9999,
    gap: 8,
  },
  selectedRating: {
    backgroundColor: 'transparent',
    borderColor: '#19E675',
  },
  selectedRatingText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#19E675',
  },
  ratingText: {
    fontSize: 14,
    marginLeft: 5,
    fontWeight: '700',
    color: '#6B7280',
  },
  selectedLogo: {
    color: '#19E675',
    marginLeft: 'auto',
    marginRight: 5
  },
  logo: {
    color: '#6B7280',
    marginLeft: 'auto',
    marginRight: 5
  },
  winnerSection: {
    marginBottom: 30,
    marginTop: 20
  },
  winnerTitle: {
    fontSize: 18,
    fontWeight: '700',
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
    borderColor: '#19E675',
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
    paddingVertical: 12,
    paddingHorizontal: 70,
    borderRadius: 25,
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 10,
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#002000',
  },
  disclaimerText: {
    marginTop: 5,
    fontSize: 12,
    color: '#ACA9A9',
    textAlign: 'center',
  },
});

export default MatchVerif;