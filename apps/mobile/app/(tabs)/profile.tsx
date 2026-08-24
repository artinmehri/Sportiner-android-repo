import { View, Text, StyleSheet, Image, TouchableOpacity, StatusBar, ScrollView, Modal, Platform, Share, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useEffect, useState, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import ProfileSettingsScreen from './profileSettings';
import { supabase } from '@/context/AuthContext';
import { buildSingleLinkShareContent } from '@/lib/nativeShareContent';

type UserRow = {
  name: string | null;
  points: number | null;
  level: string | null;
  availability: Record<string, unknown> | null;
};

export default function ProfileScreen() {
  const [showFullScreenImage, setShowFullScreenImage] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [level, setLevel] = useState('');
  const [elo, setElo] = useState('');
  const [gamesPlayed, setGamesPlayed] = useState();
  const [reliability_score, setReliabilityScore] = useState();
  const [availability, setAvailability] = useState<{
    morning: string[];
    afternoon: string[];
    evening: string[];
}>({
    morning: [],
    afternoon: [],
    evening: [],
});
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [imageTimestamp, setImageTimestamp] = useState(Date.now());


  useFocusEffect(
    useCallback(() => {
      getUser();
    }, [])
  );

  async function getUser() {
    const { data: authData, error: authError } = await supabase.auth.getUser();
    const user = authData?.user;

    if (authError || !user) {
      Alert.alert("You've ran into an error")
      return;
    }

    // Step 2 — fetch their row from your users table
    const { data, error: dbError } = await supabase
      .from('users')
      .select('name, city, level, elo, gamesPlayed, reliability_score, profile_picture, availability')
      .eq('id', user.id)
      .single();

    if (dbError) {
      Alert.alert('Error', dbError.message);
      return;
    }
    // Step 3 — populate state with the data
    setName(data.name);
    setCity(data.city);
    setLevel(data.level);
    setElo(data.elo);
    setGamesPlayed(data.gamesPlayed);
    setReliabilityScore(data.reliability_score);
    setProfileImage(data.profile_picture);
    setImageTimestamp(Date.now());
    console.log("profile image: ")
    console.log(data.profile_picture)
    // ProfileScreen — convert object to 7-item arrays for display
    if (data.availability) {
      const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

      setAvailability({
          morning: days.map(day => data.availability[day]?.morning ? 'filled' : ''),
          afternoon: days.map(day => data.availability[day]?.afternoon ? 'filled' : ''),
          evening: days.map(day => data.availability[day]?.evening ? 'filled' : ''),
      });
    }

  }

  const handleShare = async () => {
    try {
      const url = 'https://sportiner.com/app';
      await Share.share(buildSingleLinkShareContent({
        title: 'Sportiner',
        message: [
          `Looking for tennis partners near you? 🎾`,
          `Sportiner helps you find, create, and join local games.`,
        ].join('\n\n'),
        url,
        platform: Platform.OS,
        androidLinkText: `Download the app:\n${url}`,
      }));
    } catch (error) {
      console.log('Error sharing:', error);
    }
  };


  const handleSaveSettings = (newData: { displayName?: string; availability?: any; profileImage?: string | null }) => {
    setShowSettings(false);
    getUser();
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
          source={{ uri: profileImage ? `${profileImage}?t=${imageTimestamp}` : undefined }}
          style={styles.profileImage}
        />
        </TouchableOpacity>
        <Text style={styles.profileName}>{name}</Text>
        <Text style={styles.profileLocation}>{city}</Text>
        <Text style={styles.skillLevel}>{level}</Text>
      </View>

      <View style={styles.ratingSection}>
        <Text style={styles.ratingNumber}>{elo}</Text>
        <Text style={styles.ratingLabel}>Tennis Rating (ELO)</Text>
      </View>

      {/* Stats */}
      <View style={styles.statsContainer}>
        <View style={styles.statItem}>
          <View style={styles.statIconContainer}>
            <Ionicons name="checkmark" size={16} color="white" />
          </View>
          <Text style={styles.statValue}>{reliability_score}%</Text>
          <Text style={styles.statLabel}>Reliability</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <View style={styles.statIconContainer}>
            <Ionicons name="tennisball-outline" size={16} color="white" />
          </View>
          <Text style={styles.statValue}>{gamesPlayed}</Text>
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
            {availability?.morning?.map((status: string, index: number) => (
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

            {availability?.afternoon?.map((status: string, index: number) => (
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
            {availability?.evening?.map((status: string, index: number) => (
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
            source={{ uri: profileImage ? `${profileImage}?t=${imageTimestamp}` : undefined }}
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
  skillLevel: {
    marginTop: 30,
    marginBottom: 5,
    fontSize: 23,
    fontWeight: '700',
    textTransform: 'uppercase',
    color: '#19E675',
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
