import { View, Text, StyleSheet, Image, TouchableOpacity, StatusBar, ScrollView, Modal, Share } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useState } from 'react';
import ProfileSettingsScreen from './profileSettings';

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const [showFullScreenImage, setShowFullScreenImage] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [profileData, setProfileData] = useState({
    displayName: 'Artin M.',
    location: '15-18 • Toronto',
    profileImage: 'https://picsum.photos/seed/tennis-court/120/120',
    availability: {
      morning: ['', '', '', '', '', '', ''],
      afternoon: ['', 'filled', '', '', '', 'filled', ''],
      night: ['filled', '', '', '', '', '', 'filled']
    }
  });

  const handleShare = async () => {
    try {
      await Share.share({
        message: `🎾 Looking for tennis players in Toronto\n\nJoin me on Sportiner:`,
        url: 'https://sportiner.app', 
      });
    } catch (error) {
      console.log('Error sharing:', error);
    }
  };

  const handleSaveSettings = (newData: { displayName?: string; availability?: any; profileImage?: string | null }) => {
    setProfileData(prev => ({
      ...prev,
      displayName: newData.displayName || prev.displayName,
      profileImage: newData.profileImage || prev.profileImage,
      availability: newData.availability || prev.availability
    }));
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.headerButton} onPress={() => setShowSettings(true)}>
            <Ionicons name="settings-outline" size={24} color="black" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Your profile</Text>
          <TouchableOpacity style={styles.headerButton} onPress={handleShare}>
            <Ionicons name="share-social-outline" size={24} color="black" />
          </TouchableOpacity>
        </View>

      {/* Profile Info */}
      <View style={styles.profileSection}>
        <TouchableOpacity onPress={() => setShowFullScreenImage(true)}>
          <Image 
            source={{ uri: profileData.profileImage }} 
            style={styles.profileImage} 
          />
        </TouchableOpacity>
        <Text style={styles.profileName}>{profileData.displayName}</Text>
        <Text style={styles.profileLocation}>{profileData.location}</Text>
      </View>

      {/* NTP Rating */}
      <View style={styles.ratingSection}>
        <Text style={styles.ratingNumber}>750</Text>
        <Text style={styles.ratingLabel}>Tennis Rating (ELO)</Text>
      </View>

      {/* Stats */}
      <View style={styles.statsContainer}>
        <View style={styles.statItem}>
          <View style={styles.statIconContainer}>
            <Ionicons name="checkmark" size={16} color="white" />
          </View>
          <Text style={styles.statValue}>98%</Text>
          <Text style={styles.statLabel}>Reliability</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <View style={styles.statIconContainer}>
            <Ionicons name="tennisball-outline" size={16} color="white" />
          </View>
          <Text style={styles.statValue}>12</Text>
          <Text style={styles.statLabel}>Games Played</Text>
        </View>
      </View>

      {/* Availability Preview */}
      <View style={styles.availabilitySection}>
        <View style={styles.availabilityHeader}>
          <Ionicons name="calendar-outline" size={20} color="#666" />
          <Text style={styles.availabilityTitle}>Availability preview</Text>
        </View>
        
        <View style={styles.calendarGrid}>
          {/* Days of week */}
          <View style={styles.dayHeaders}>
            {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, index) => (
              <Text key={index} style={styles.dayHeader}>{day}</Text>
            ))}
          </View>
          
          {/* Morning row */}
          <View style={styles.timeRow}>
            <View style={styles.timeIconContainer}>
              <Ionicons name="sunny-outline" size={16} color="#666" />
            </View>
            {profileData.availability.morning.map((status, index) => (
              <View key={index} style={styles.availabilityCell}>
                <View style={status === 'filled' ? styles.filledCircle : styles.emptyCircle} />
              </View>
            ))}
          </View>
          
          {/* Afternoon row */}
          <View style={styles.timeRow}>
            <View style={styles.timeIconContainer}>
              <View style={styles.customSunsetIcon}>
                <View style={styles.sun} />
                <View style={styles.horizonLine} />
              </View>
            </View>
            {profileData.availability.afternoon.map((status, index) => (
              <View key={index} style={styles.availabilityCell}>
                <View style={status === 'filled' ? styles.filledCircle : styles.emptyCircle} />
              </View>
            ))}
          </View>
          
          {/* Night row */}
          <View style={styles.timeRow}>
            <View style={styles.timeIconContainer}>
              <Ionicons name="moon-outline" size={16} color="#666" />
            </View>
            {profileData.availability.night.map((status, index) => (
              <View key={index} style={styles.availabilityCell}>
                <View style={status === 'filled' ? styles.filledCircle : styles.emptyCircle} />
              </View>
            ))}
          </View>
        </View>
      </View>
      </ScrollView>

      {/* Full Screen Image Modal */}
      <Modal
        visible={showFullScreenImage}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowFullScreenImage(false)}
      >
        <View style={styles.modalContainer}>
          <TouchableOpacity 
            style={styles.closeButton} 
            onPress={() => setShowFullScreenImage(false)}
          >
            <Ionicons name="close" size={28} color="white" />
          </TouchableOpacity>
          <Image 
            source={{ uri: profileData.profileImage }} 
            style={styles.fullScreenImage} 
            resizeMode="contain"
          />
        </View>
      </Modal>

      {/* Settings Modal */}
      <Modal
        visible={showSettings}
        animationType="slide"
        onRequestClose={() => setShowSettings(false)}
      >
        <ProfileSettingsScreen
          onClose={() => setShowSettings(false)}
          onSave={handleSaveSettings}
        />
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'white',
  },
  scrollView: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 8,
  },
  headerButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: 'black',
  },
  profileSection: {
    alignItems: 'center',
    marginBottom: 20,
  },
  profileImage: {
    width: 120,
    height: 120,
    borderRadius: 60,
    marginBottom: 12,
  },
  profileName: {
    fontSize: 24,
    fontWeight: '600',
    color: 'black',
    marginBottom: 4,
  },
  profileLocation: {
    fontSize: 16,
    color: '#666',
  },
  ratingSection: {
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 38,
    marginTop: 15,
    borderRadius: 20,

  },
  ratingNumber: {
    fontSize: 64,
    fontWeight: '800',
    color: '#19E675',
    lineHeight: 70,
  },
  ratingLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#19E675',
    marginTop: -2,
  },
  statsContainer: {
    flexDirection: 'row',
    backgroundColor: '#F5F5F5',
    borderRadius: 16,
    marginHorizontal: 20,
    marginBottom: 28,
    paddingVertical: 20,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statIconContainer: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#19E675',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    marginRight: 3,
  },
  statValue: {
    fontSize: 20,
    fontWeight: '600',
    color: 'black',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 14,
    color: '#666',
  },
  statDivider: {
    width: 1,
    backgroundColor: '#E0E0E0',
    marginHorizontal: 16,
  },
  availabilitySection: {
    marginHorizontal: 20,
    marginBottom: 40,
  },
  availabilityHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  availabilityTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: 'black',
    marginLeft: 8,
  },
  calendarGrid: {
    backgroundColor: '#F5F5F5',
    borderRadius: 16,
    padding: 16,
  },
  dayHeaders: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 12,
    paddingLeft: 32,
  },
  dayHeader: {
    fontSize: 14,
    fontWeight: '500',
    color: '#666',
    flex: 1,
    textAlign: 'center',
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  timeIconContainer: {
    width: 32,
    alignItems: 'center',
  },
  availabilityCell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
  },
  emptyCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#E0E0E0',
    backgroundColor: 'white',
  },
  filledCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#19E675',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: 'black',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButton: {
    position: 'absolute',
    top: 60,
    right: 20,
    zIndex: 1,
  },
  fullScreenImage: {
    width: '90%',
    height: '90%',
  },
  sunsetIcon: {
    width: 16,
    height: 8,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    backgroundColor: '#666',
    borderBottomWidth: 2,
    borderBottomColor: '#666',
  },
  customSunsetIcon: {
    width: 16,
    height: 12,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sun: {
    width: 10,
    height: 5,
    backgroundColor: '#666',
    borderTopLeftRadius: 5,
    borderTopRightRadius: 5,
    position: 'absolute',
    top: 3,
  },
  horizonLine: {
    position: 'absolute',
    bottom: 2,
    left: 0,
    width: '100%',
    height: 1,
    backgroundColor: '#666',
  },
});