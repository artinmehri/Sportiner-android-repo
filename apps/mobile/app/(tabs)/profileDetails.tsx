import { View, Text, StyleSheet, Image, TouchableOpacity, StatusBar, ScrollView, Modal, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useState } from 'react';
import { router } from 'expo-router'

export default function ProfileDetailsScreen({ onClose }: { onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const [showFullScreenImage, setShowFullScreenImage] = useState(false);
  const [showMenu, setShowMenu] = useState(false);

  const handleReport = () => {
    Alert.alert(
      'Report User',
      'Are you sure you want to report this user?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Report', 
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'Report Sent',
              'Report was successfully sent, we will further review this account!',
              [{ text: 'OK' }]
            );
            setShowMenu(false);
          }
        }
      ]
    );
  };

  const handleBlock = () => {
    Alert.alert(
      'Block User',
      'Are you sure you want to block this user?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Block', 
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'User Blocked',
              'You have successfully blocked this user!',
              [{ text: 'OK' }]
            );
            setShowMenu(false);
          }
        }
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.headerButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color="black" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Profile</Text>
          <TouchableOpacity style={styles.headerButton} onPress={() => setShowMenu(true)}>
            <Ionicons name="ellipsis-vertical" size={24} color="black" />
          </TouchableOpacity>
        </View>

      {/* Profile Info */}
      <View style={styles.profileSection}>
        <TouchableOpacity onPress={() => setShowFullScreenImage(true)}>
          <Image 
            source={{ uri: 'https://picsum.photos/seed/nature-landscape/120/120' }} 
            style={styles.profileImage} 
          />
        </TouchableOpacity>
        <Text style={styles.profileName}>Behrad Barati</Text>
        <Text style={styles.profileLocation}>15-18 • Toronto</Text>
      </View>

      {/* NTP Rating */}
      <View style={styles.ratingSection}>
        <Text style={styles.ratingNumber}>3.5</Text>
        <Text style={styles.ratingLabel}>NTP Rating</Text>
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
            {['', '', '', '', '', '', ''].map((_, index) => (
              <View key={index} style={styles.availabilityCell}>
                <View style={styles.emptyCircle} />
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
            {['', 'filled', '', '', '', 'filled', ''].map((status, index) => (
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
            {['filled', '', '', '', '', '', 'filled'].map((status, index) => (
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
            source={{ uri: 'https://picsum.photos/seed/nature-landscape/400/400' }} 
            style={styles.fullScreenImage} 
            resizeMode="contain"
          />
        </View>
      </Modal>

      {/* Menu Modal */}
      <Modal
        transparent={true}
        visible={showMenu}
        animationType="fade"
        onRequestClose={() => setShowMenu(false)}
      >
        <TouchableOpacity 
          style={styles.menuOverlay} 
          activeOpacity={1} 
          onPress={() => setShowMenu(false)}
        >
          <TouchableOpacity 
            style={styles.menuContainer} 
            activeOpacity={1}
            onPress={(e) => e.stopPropagation()}
          >
            <TouchableOpacity style={styles.menuItem} onPress={handleReport}>
              <View style={styles.menuIconContainer}>
                <Ionicons name="alert-circle-outline" size={20} color="#FF0000" />
              </View>
              <Text style={styles.menuText}>Report User</Text>
            </TouchableOpacity>
            
            <TouchableOpacity style={styles.menuItem} onPress={handleBlock}>
              <View style={styles.menuIconContainer}>
                <Ionicons name="ban-outline" size={20} color="#FF0000" />
              </View>
              <Text style={styles.menuText}>Block User</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 3,
    backgroundColor: '#FFFFFF'
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
    fontSize: 18,
    fontWeight: '600',
    color: 'black',
  },
  scrollView: {
    flex: 1,
  },
  profileSection: {
    alignItems: 'center',
    marginBottom: 24,
  },
  profileImage: {
    width: 120,
    height: 120,
    borderRadius: 60,
    marginBottom: 16,
  },
  profileName: {
    fontSize: 24,
    fontWeight: '700',
    color: 'black',
    marginBottom: 4,
  },
  profileLocation: {
    fontSize: 16,
    color: '#666',
  },
  ratingSection: {
    alignItems: 'center',
    marginBottom: 32,
    marginHorizontal: 20,
  },
  ratingNumber: {
    fontSize: 64,
    fontWeight: '700',
    color: '#19E675',
    lineHeight: 70,
  },
  ratingLabel: {
    fontSize: 16,
    color: '#666',
    marginTop: 4,
  },
  statsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 32,
    marginHorizontal: 20,
  },
  statItem: {
    alignItems: 'center',
    flex: 1,
  },
  statIconContainer: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#19E675',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
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
    height: 40,
    backgroundColor: '#E0E0E0',
    marginHorizontal: 32,
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
    fontWeight: '600',
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
    width: 24,
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
    width: '100%',
    height: '100%',
  },
  menuOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  menuContainer: {
    backgroundColor: 'white',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 20,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  menuIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFF5F5',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  menuText: {
    fontSize: 16,
    color: '#FF0000',
    fontWeight: '500',
  },
});