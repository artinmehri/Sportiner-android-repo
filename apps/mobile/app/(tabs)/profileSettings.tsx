import { View, Text, StyleSheet, TouchableOpacity, StatusBar, ScrollView, TextInput, Alert, Image, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useState } from 'react';
import * as ImagePicker from 'expo-image-picker';

export default function ProfileSettingsScreen({ 
  onClose, 
  onSave 
}: { 
  onClose: () => void; 
  onSave: (data: { displayName?: string; availability?: any; profileImage?: string | null }) => void; 
}) {
  const insets = useSafeAreaInsets();
  const [displayName, setDisplayName] = useState('Artin Mehri');
  const [availability, setAvailability] = useState({
    morning: ['', '', '', '', '', '', ''],
    afternoon: ['', 'filled', '', '', '', 'filled', ''],
    night: ['filled', '', '', '', '', '', 'filled']
  });
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [showWebModal, setShowWebModal] = useState(false);
  const [webContent, setWebContent] = useState('');
  const [webContentType, setWebContentType] = useState('');
  const [rating, setRating] = useState(5);

  const pickImage = async () => {
    const result = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (result.granted === false) {
      Alert.alert('Permission required', 'Sorry, we need camera roll permissions to make this work!');
      return;
    }

    const pickerResult = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 1,
    });

    if (!pickerResult.canceled) {
      setProfileImage(pickerResult.assets[0].uri);
    }
  };

  const toggleAvailability = (timeOfDay: 'morning' | 'afternoon' | 'night', dayIndex: number) => {
    const newAvailability = { ...availability };
    newAvailability[timeOfDay][dayIndex] = newAvailability[timeOfDay][dayIndex] === 'filled' ? '' : 'filled';
    setAvailability(newAvailability);
  };

  const handleSave = () => {
    onSave({
      displayName,
      availability,
      profileImage
    });
    onClose();
  };

  const openWebContent = (type: string) => {
    setWebContentType(type);
    setShowWebModal(true);
  };

  const submitFeedback = () => {
    Alert.alert('Thank you!', `You rated Sportiner ${rating} out of 5 stars. Your feedback helps us improve!`, [
      { text: 'OK', onPress: () => setShowWebModal(false) }
    ]);
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <TouchableOpacity style={styles.headerButton} onPress={onClose}>
          <Ionicons name="arrow-back" size={24} color="black" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
        <TouchableOpacity style={styles.headerButton} onPress={handleSave}>
          <Text style={styles.saveButton}>Save</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Profile Picture Section */}
        <View style={styles.section}>
          <TouchableOpacity style={styles.profileImageContainer} onPress={pickImage}>
            {profileImage ? (
              <Image source={{ uri: profileImage }} style={styles.profileImagePreview} />
            ) : (
              <View style={styles.profileImagePlaceholder}>
                <Ionicons name="camera" size={24} color="#666" />
                <Text style={styles.profileImageText}>Change Photo</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* Account & Privacy Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account & Privacy</Text>
          
          {/* Display Name */}
          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>Display Name</Text>
            <View style={styles.inputContainer}>
              <TextInput
                style={styles.textInput}
                value={displayName}
                onChangeText={setDisplayName}
                placeholder="Enter your name"
              />
              <Ionicons name="pencil" size={20} color="#666" />
            </View>
          </View>

          {/* Availability Preview */}
          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>Availability preview</Text>
            <View style={styles.availabilityGrid}>
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
                {availability.morning.map((status, index) => (
                  <TouchableOpacity 
                    key={index} 
                    style={styles.availabilityCell}
                    onPress={() => toggleAvailability('morning', index)}
                  >
                    <View style={status === 'filled' ? styles.filledCircle : styles.emptyCircle} />
                  </TouchableOpacity>
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
                {availability.afternoon.map((status, index) => (
                  <TouchableOpacity 
                    key={index} 
                    style={styles.availabilityCell}
                    onPress={() => toggleAvailability('afternoon', index)}
                  >
                    <View style={status === 'filled' ? styles.filledCircle : styles.emptyCircle} />
                  </TouchableOpacity>
                ))}
              </View>
              
              {/* Night row */}
              <View style={styles.timeRow}>
                <View style={styles.timeIconContainer}>
                  <Ionicons name="moon-outline" size={16} color="#666" />
                </View>
                {availability.night.map((status, index) => (
                  <TouchableOpacity 
                    key={index} 
                    style={styles.availabilityCell}
                    onPress={() => toggleAvailability('night', index)}
                  >
                    <View style={status === 'filled' ? styles.filledCircle : styles.emptyCircle} />
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>
        </View>

        {/* Support & Legal Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Support & Legal</Text>
          
          <TouchableOpacity style={styles.menuRow} onPress={() => openWebContent('help')}>
            <View style={styles.menuLeft}>
              <Ionicons name="help-circle-outline" size={24} color="#666" />
              <Text style={styles.menuText}>Help Centre / FAQ</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#666" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuRow} onPress={() => openWebContent('feedback')}>
            <View style={styles.menuLeft}>
              <Ionicons name="create-outline" size={24} color="#666" />
              <Text style={styles.menuText}>Send Feedback</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#666" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuRow} onPress={() => openWebContent('terms')}>
            <View style={styles.menuLeft}>
              <Ionicons name="document-text-outline" size={24} color="#666" />
              <Text style={styles.menuText}>Terms of Service / Privacy</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#666" />
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Web Content Modal */}
      <Modal
        visible={showWebModal}
        animationType="slide"
        onRequestClose={() => setShowWebModal(false)}
      >
        <SafeAreaView style={styles.container}>
          <StatusBar barStyle="dark-content" />
          
          {/* Modal Header */}
          <View style={[styles.header, { paddingTop: insets.top }]}>
            <TouchableOpacity style={styles.headerButton} onPress={() => setShowWebModal(false)}>
              <Ionicons name="arrow-back" size={24} color="black" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Information</Text>
            <View style={styles.headerButton} />
          </View>

          {/* Web Content */}
          <ScrollView style={styles.webContentContainer}>
            {webContentType === 'help' && (
              <View style={styles.helpContent}>
                <Text style={styles.contentTitle}>Help Centre</Text>
                
                <View style={styles.helpSection}>
                  <Ionicons name="person-outline" size={24} color="#19E675" />
                  <View style={styles.helpText}>
                    <Text style={styles.helpTitle}>Editing Your Profile</Text>
                    <Text style={styles.helpDescription}>Tap the settings icon to edit your display name, profile picture, and availability schedule. Your changes are saved automatically.</Text>
                  </View>
                </View>

                <View style={styles.helpSection}>
                  <Ionicons name="search-outline" size={24} color="#19E675" />
                  <View style={styles.helpText}>
                    <Text style={styles.helpTitle}>Finding Tennis Partners</Text>
                    <Text style={styles.helpDescription}>Use the availability grid to show when you're free to play. Other players can see your schedule and invite you to matches.</Text>
                  </View>
                </View>

                <View style={styles.helpSection}>
                  <Ionicons name="trophy-outline" size={24} color="#19E675" />
                  <View style={styles.helpText}>
                    <Text style={styles.helpTitle}>NTP Rating System</Text>
                    <Text style={styles.helpDescription}>The NTP rating helps match you with players of similar skill levels. Ratings range from 1.0 (beginner) to 7.0 (professional).</Text>
                  </View>
                </View>

                <View style={styles.helpSection}>
                  <Ionicons name="shield-checkmark-outline" size={24} color="#19E675" />
                  <View style={styles.helpText}>
                    <Text style={styles.helpTitle}>Account Safety</Text>
                    <Text style={styles.helpDescription}>Your profile is only visible to other tennis players. We never share your personal information with third parties.</Text>
                  </View>
                </View>
              </View>
            )}

            {webContentType === 'feedback' && (
              <View style={styles.feedbackContent}>
                <Text style={styles.contentTitle}>Rate Sportiner</Text>
                <Text style={styles.feedbackQuestion}>What would you rate Sportiner out of 5?</Text>
                
                <View style={styles.starContainer}>
                  {[1, 2, 3, 4, 5].map((star) => (
                    <TouchableOpacity
                      key={star}
                      onPress={() => setRating(star)}
                      style={styles.starButton}
                    >
                      <Ionicons
                        name={star <= rating ? "star" : "star-outline"}
                        size={40}
                        color={star <= rating ? "#19E675" : "#E0E0E0"}
                        style={styles.star}
                      />
                    </TouchableOpacity>
                  ))}
                </View>
                
                <TouchableOpacity style={styles.submitButton} onPress={submitFeedback}>
                  <Text style={styles.submitButtonText}>Submit</Text>
                </TouchableOpacity>
                
                <Text style={styles.feedbackNote}>Your feedback helps us improve the app for all tennis players!</Text>
              </View>
            )}

            {webContentType === 'terms' && (
              <View style={styles.termsContent}>
                <Text style={styles.contentTitle}>Privacy & Terms</Text>
                
                <View style={styles.termsSection}>
                  <Text style={styles.termsSubtitle}>🔒 Your Privacy Matters</Text>
                  <Text style={styles.termsText}>We only collect what's necessary to help you find tennis partners. Your profile, schedule, and match history are kept private and secure.</Text>
                </View>

                <View style={styles.termsSection}>
                  <Text style={styles.termsSubtitle}>🤝 Community Guidelines</Text>
                  <Text style={styles.termsText}>Be respectful, show up on time for matches, and play fairly. Good sportsmanship makes tennis better for everyone.</Text>
                </View>

                <View style={styles.termsSection}>
                  <Text style={styles.termsSubtitle}>📱 How We Use Your Data</Text>
                  <Text style={styles.termsText}>Your information helps us match you with compatible players and improve the app experience. We never sell your data to advertisers.</Text>
                </View>

                <View style={styles.termsSection}>
                  <Text style={styles.termsSubtitle}>⚖️ Fair Play Policy</Text>
                  <Text style={styles.termsText}>All players must follow tennis etiquette and rules. Reports of misconduct are taken seriously and may result in account suspension.</Text>
                </View>
                
                <Text style={styles.termsFooter}>Last updated: January 2026</Text>
              </View>
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'white',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
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
  saveButton: {
    fontSize: 16,
    fontWeight: '600',
    color: '#19E675',
  },
  scrollView: {
    flex: 1,
  },
  section: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: 'black',
    marginBottom: 16,
  },
  profileImageContainer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  profileImagePlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#F5F5F5',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#E0E0E0',
    borderStyle: 'dashed',
  },
  profileImagePreview: {
    width: 100,
    height: 100,
    borderRadius: 50,
  },
  profileImageText: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  settingRow: {
    marginBottom: 20,
  },
  settingLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: 'black',
    marginBottom: 8,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  textInput: {
    flex: 1,
    fontSize: 16,
    color: 'black',
  },
  availabilityGrid: {
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
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  menuLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  menuText: {
    fontSize: 16,
    color: 'black',
    marginLeft: 12,
  },
  webContentContainer: {
    flex: 1,
    padding: 20,
  },
  webContent: {
    fontSize: 14,
    lineHeight: 20,
    color: '#333',
  },
  contentTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#19E675',
    marginBottom: 24,
    textAlign: 'center',
  },
  helpContent: {
    padding: 20,
  },
  helpSection: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 24,
    backgroundColor: '#F5F5F5',
    padding: 16,
    borderRadius: 12,
  },
  helpText: {
    flex: 1,
    marginLeft: 16,
  },
  helpTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: 'black',
    marginBottom: 8,
  },
  helpDescription: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  feedbackContent: {
    padding: 20,
    alignItems: 'center',
  },
  feedbackQuestion: {
    fontSize: 18,
    fontWeight: '500',
    color: 'black',
    marginBottom: 24,
    textAlign: 'center',
  },
  starContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 32,
  },
  starButton: {
    marginHorizontal: 8,
  },
  star: {
    borderWidth: 2,
    borderColor: '#19E675',
    borderRadius: 20,
    padding: 4,
  },
  submitButton: {
    backgroundColor: '#19E675',
    paddingHorizontal: 40,
    paddingVertical: 16,
    borderRadius: 25,
    marginBottom: 16,
  },
  submitButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '600',
  },
  feedbackNote: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    lineHeight: 20,
  },
  termsContent: {
    padding: 20,
  },
  termsSection: {
    marginBottom: 24,
  },
  termsSubtitle: {
    fontSize: 18,
    fontWeight: '600',
    color: 'black',
    marginBottom: 12,
  },
  termsText: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  termsFooter: {
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
    marginTop: 32,
  },
});