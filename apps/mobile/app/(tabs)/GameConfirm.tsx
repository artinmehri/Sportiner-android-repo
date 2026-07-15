import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  Image,
  Share,
  Modal,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

export default function GameConfirmation() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [showGameCreatedModal, setShowGameCreatedModal] = useState(false);

  useEffect(() => {
    setShowGameCreatedModal(true);
    
 
    const timer = setTimeout(() => {
      setShowGameCreatedModal(false);
    }, 2500);
    
    return () => clearTimeout(timer);
  }, []);

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
      
      {/* Game Created Modal */}
      <Modal
        visible={showGameCreatedModal}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setShowGameCreatedModal(false)}
      >
        <TouchableOpacity 
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowGameCreatedModal(false)}
        >
          <View style={styles.feedbackModal}>
            <View style={styles.feedbackContent}>
              <View style={styles.feedbackIconContainer}>
                <View style={styles.checkmarkCircle}>
                  <Ionicons name="checkmark" size={30} color="#ffffff" />
                </View>
              </View>
              <Text style={styles.feedbackTitle}>Game Created</Text>
              
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
                onPress={() => {
                  setShowGameCreatedModal(false);
                  router.push('/(tabs)/games');
                }}
              >
                <Text style={styles.viewGamesButtonText}>View My Games</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingBottom: 50,
  },
  feedbackModal: {
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  feedbackContent: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 30,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 10,
  },
  feedbackIconContainer: {
    marginBottom: 15,
  },
  feedbackTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#19E675',
    textAlign: 'center',
    marginBottom: 20,
  },
  checkmarkCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#19E675',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 15,
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
    marginBottom: 16,
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
