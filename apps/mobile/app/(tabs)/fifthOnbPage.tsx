import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  StatusBar,
  SafeAreaView,
  ScrollView,
  Modal,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

const FifthOnbPage = () => {
  const router = useRouter();
  const [showJoinedGameModal, setShowJoinedGameModal] = useState(false);
  
  const handleJoinGame = () => {
    setShowJoinedGameModal(true);
  };
  
  const handleBrowseGames = () => {
    router.push('/');
  };
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Title Section */}
        <View style={styles.titleSection}>
          <Text style={styles.mainTitle}>We found 2 games</Text>
          <Text style={styles.subTitle}>Want in?</Text>
        </View>

        {/* Game Cards */}
        <View style={styles.cardsContainer}>
          {/* First Game Card */}
          <View style={styles.gameCard}>
            <Image
              source={{ uri: 'https://images.unsplash.com/photo-1719360568896-55788b9ddea5?w=900&auto=format&fit=crop&q=60&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxzZWFyY2h8OHx8dGVubmlzJTIwY291cnRzfGVufDB8fDB8fHww' }}
              style={styles.gameImage}
              resizeMode="cover"
            />
            <View style={styles.gameInfo}>
              <Text style={styles.gameTitle}>Double Match</Text>
              <Text style={styles.gameLevel}>Level: Intermediate</Text>
              
              <View style={styles.gameDetails}>
                <View style={styles.detailRow}>
                  <MaterialCommunityIcons name="calendar" size={16} color="#19E675" />
                  <Text style={styles.detailText}>Tue @ 6 PM</Text>
                  <View style={styles.spacer} />
                  <MaterialCommunityIcons name="map-marker" size={16} color="#19E675" />
                  <Text style={styles.detailText}>300 Steels Avenue</Text>
                </View>
              </View>
              
              <TouchableOpacity style={styles.joinButton} onPress={handleJoinGame}>
                <Text style={styles.joinButtonText}>Join Game</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Second Game Card */}
          <View style={styles.gameCard}>
            <Image
              source={{ uri: 'https://images.unsplash.com/photo-1766675122854-28fc70f50132?w=900&auto=format&fit=crop&q=60&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxzZWFyY2h8MTR8fHRlbm5pcyUyMGNvdXJ0c3xlbnwwfHwwfHx8MA%3D%3D' }}
              style={styles.gameImage}
              resizeMode="cover"
            />
            <View style={styles.gameInfo}>
              <Text style={styles.gameTitle}>Alex's game</Text>
              <Text style={styles.gameLevel}>Level: Beginner</Text>
              
              <View style={styles.gameDetails}>
                <View style={styles.detailRow}>
                  <MaterialCommunityIcons name="calendar" size={16} color="#19E675" />
                  <Text style={styles.detailText}>Sat @ 7 PM</Text>
                  <View style={styles.spacer} />
                  <MaterialCommunityIcons name="map-marker" size={16} color="#19E675" />
                  <Text style={styles.detailText}>120 Yonge Street</Text>
                </View>
              </View>
              
              <TouchableOpacity style={styles.joinButton} onPress={handleJoinGame}>
                <Text style={styles.joinButtonText}>Join Game</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Footer */}
        <TouchableOpacity onPress={handleBrowseGames} style={styles.footer}>
          <Text style={styles.footerText}>
            Not these? <Text style={styles.browseText}>Browse all games {'>'}</Text>
          </Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Joined Game Modal */}
      <Modal
        visible={showJoinedGameModal}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setShowJoinedGameModal(false)}
      >
        <TouchableOpacity 
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowJoinedGameModal(false)}
        >
          <View style={styles.feedbackModal}>
            <View style={styles.feedbackContent}>
              <View style={styles.feedbackIconContainer}>
                <View style={styles.checkmarkCircle}>
                  <Ionicons name="checkmark" size={30} color="#ffffff" />
                </View>
              </View>
              <Text style={styles.feedbackTitle}>Joined Game</Text>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>
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
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 5,
  },
  time: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000000',
  },
  statusIcons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  signalBars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 1,
    width: 20,
    height: 12,
  },
  bar: {
    width: 3,
    backgroundColor: '#000000',
    borderRadius: 1,
  },
  wifiIcon: {
    width: 16,
    height: 12,
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  wifiArc1: {
    position: 'absolute',
    width: 12,
    height: 6,
    borderBottomWidth: 2,
    borderBottomColor: '#000000',
    borderBottomLeftRadius: 6,
    borderBottomRightRadius: 6,
    bottom: 6,
  },
  wifiArc2: {
    position: 'absolute',
    width: 8,
    height: 4,
    borderBottomWidth: 2,
    borderBottomColor: '#000000',
    borderBottomLeftRadius: 4,
    borderBottomRightRadius: 4,
    bottom: 4,
  },
  wifiArc3: {
    position: 'absolute',
    width: 4,
    height: 2,
    backgroundColor: '#000000',
    borderRadius: 1,
    bottom: 2,
  },
  battery: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  batteryBody: {
    width: 22,
    height: 11,
    borderWidth: 1,
    borderColor: '#000000',
    borderRadius: 2,
  },
  batteryTip: {
    width: 2,
    height: 4,
    backgroundColor: '#000000',
    borderRadius: 1,
    marginLeft: -1,
  },
  batteryLevel: {
    position: 'absolute',
    left: 2,
    top: 2,
    width: 18,
    height: 7,
    backgroundColor: '#000000',
    borderRadius: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  titleSection: {
    marginTop: 20,
    marginBottom: 30,
    alignItems: 'center',
  },
  mainTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 5,
  },
  subTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#19E675',
  },
  cardsContainer: {
    gap: 20,
    marginBottom: 30,
  },
  gameCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
    overflow: 'hidden',
  },
  gameImage: {
    width: '100%',
    height: 180,
  },
  gameInfo: {
    padding: 16,
  },
  gameTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 4,
  },
  gameLevel: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 12,
  },
  gameDetails: {
    marginBottom: 16,
  },
  spacer: {
    flex: 1,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  detailText: {
    fontSize: 14,
    color: '#1F2937',
    fontWeight: '500',
  },
  joinButton: {
    backgroundColor: '#19E675',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 25,
    alignItems: 'center',
    alignSelf: 'stretch',
    width: '100%',
  },
  joinButtonText: {
    color: '#000000',
    fontSize: 16,
    fontWeight: '600',
  },
  footer: {
    alignItems: 'center',
    paddingVertical: 20,
    paddingBottom: 40,
  },
  footerText: {
    fontSize: 16,
    color: '#6B7280',
  },
  browseText: {
    color: '#19E675',
    textDecorationLine: 'underline',
    fontWeight: '500',
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
});

export default FifthOnbPage;