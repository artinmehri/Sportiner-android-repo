import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  Image,
  Share,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

export default function GameConfirmation() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const handleInviteFriends = async () => {
    try {
      const result = await Share.share({
        message: 'Find, create, and join local tennis games on Sportiner. 🎾',
        url: 'https://sportiner.com/app',
      });
      
      if (result.action === Share.sharedAction) {
        console.log('Game shared successfully');
      } else if (result.action === Share.dismissedAction) {
        console.log('Share dismissed');
      }
    } catch (error) {
      console.error('Error sharing:', error);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      
      <View style={styles.container}>
        {/* Title with emoji */}
        <Text style={styles.title}>Congrats 🎉</Text>
        
        {/* Green checkmark circle */}
        <View style={styles.checkmarkContainer}>
          <Image 
            source={require('../../assets/images/checkmark.png')} 
            style={styles.checkmarkImage}
            resizeMode="contain"
          />
        </View>
        
        {/* Confirmation text */}
        <Text style={styles.confirmationText}>GAME CREATED!</Text>
        
        {/* Invite friends button */}
        <TouchableOpacity 
          style={styles.inviteButton} 
          onPress={handleInviteFriends}
        >
          <Ionicons name="people" size={20} color="#FFFFFF" style={styles.buttonIcon} />
          <Text style={styles.buttonText}>Invite friends to fill spots faster</Text>
        </TouchableOpacity>
        
        {/* View Games button */}
        <TouchableOpacity 
          style={styles.viewGamesButton} 
          onPress={() => router.push('/(tabs)/games')}
        >
          <Text style={styles.viewGamesButtonText}>View My Games</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: '#000000',
    marginBottom: 40,
    textAlign: 'center',
  },
  checkmarkContainer: {
    marginBottom: 32,
  },
  checkmarkCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 4,
    borderColor: '#19E675',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  checkmarkImage: {
    width: 120,
    height: 120,
  },
  confirmationText: {
    fontSize: 28,
    fontWeight: '800',
    color: '#19E675',
    marginBottom: 48,
    textAlign: 'center',
    letterSpacing: 1,
  },
  inviteButton: {
    backgroundColor: '#19E675',
    borderRadius: 25,
    paddingVertical: 18,
    paddingHorizontal: 32,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 280,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  buttonIcon: {
    marginRight: 12,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  viewGamesButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 25,
    paddingVertical: 18,
    paddingHorizontal: 32,
    borderWidth: 2,
    borderColor: '#19E675',
    marginTop: 16,
    minWidth: 280,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  viewGamesButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#19E675',
    textAlign: 'center',
  },
});