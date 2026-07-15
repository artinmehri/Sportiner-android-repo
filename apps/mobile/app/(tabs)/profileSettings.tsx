import { View, Text, StyleSheet, TouchableOpacity, StatusBar, ScrollView, TextInput, Alert, Image, Modal, Linking, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCallback, useEffect, useRef, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { decode } from 'base64-arraybuffer';
import { supabase, getCurrentUser, getCurrentUserId, signOutCurrentUser } from '@/context/AuthContext';
import { useRouter } from 'expo-router';
import { LEGAL_LAST_UPDATED, LEGAL_LINKS } from '@/constants/legal';

type ProfileSettingsData = {
  displayName?: string;
  availability?: any;
  profileImage?: string | null;
};

type ProfileSettingsScreenProps = {
  onClose: () => void;
  onSave: (newData: ProfileSettingsData) => void;
};

const daysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;
type Day = typeof daysOfWeek[number];
type TimeOfDay = 'morning' | 'afternoon' | 'evening';

export default function ProfileSettingsScreen({ onClose, onSave }: ProfileSettingsScreenProps) {
  const insets = useSafeAreaInsets();
  const [displayName, setDisplayName] = useState('');
  const [availability, setAvailability] = useState<{
    morning: string[];
    afternoon: string[];
    evening: string[];
}>({
    morning: Array(daysOfWeek.length).fill(''),
    afternoon: Array(daysOfWeek.length).fill(''),
    evening: Array(daysOfWeek.length).fill(''),
});
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [profileImageRead, setProfileImageRead] = useState<any | null>(null)
  const [showWebModal, setShowWebModal] = useState(false);
  const [webContentType, setWebContentType] = useState('');
  const [rating, setRating] = useState(5);
  const [userId, setUserId] = useState<string | undefined>()
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const logoutInFlight = useRef(false);
  const router = useRouter()
  useEffect(() => {
    const loadUser = async () => {
      // Getting user
      const user = await getCurrentUser();

      if (!user) {
        console.log('No user found in profileSettings');
        return;
      }

      const userId = user.id;
      setUserId(userId)

      const name = user?.name;
      setDisplayName(name ?? '');

      const availability = user?.availability;

      if (availability) {
        setAvailability({
            morning: daysOfWeek.map(day => availability[day]?.morning ? 'filled' : ''),
            afternoon: daysOfWeek.map(day => availability[day]?.afternoon ? 'filled' : ''),
            evening: daysOfWeek.map(day => availability[day]?.evening ? 'filled' : ''),
        });
      }

      const profilePicture = user?.profile_picture;
      setProfileImage(profilePicture ?? null);
      setProfileImageRead(profilePicture ?? null);
    };

    loadUser();
  }, []);


  const handleImageUpload = async (base64String: any) => {
    try {

    const user = await getCurrentUserId()
    const userId = user?.id;

  if (!userId) throw new Error("No user ID found");

  const filePath = `${userId}/avatar_${Date.now()}.png`;

  // Strip data URI prefix if present
  const base64Data = base64String.includes('base64,')
    ? base64String.split('base64,')[1]
    : base64String;

    const { data, error } = await supabase.storage
      .from('files')
      .upload(filePath, decode(base64Data), {
        contentType: 'image/png',
        upsert: true,
      });

    if (error) {
        Alert.alert('Error occured while uploading your profile picture!')
        throw error;
    }

    const { data: urlData } = supabase.storage
    .from('files')
    .getPublicUrl(filePath);


    const publicUrl = urlData.publicUrl;


    const {data: dbData, error: dbError} = await supabase.from('users')
    .update({
        profile_picture: publicUrl
    }).eq('id', userId)


    if (dbError) {
        Alert.alert('error updating profile image')
        console.log(dbError)
        console.log(dbError.message)
        throw dbError;
    }

    if (dbData) {
        console.log('image successfully updated!')
        setProfileImage(publicUrl)
        setProfileImageRead(publicUrl)
    }

    return data.path

    } catch (err) {
      Alert.alert("Couldn't upload image!");
      console.log(err)
      throw err;
    }
}

  const pickImage = async () => {
    const result = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (result.granted === false) {
      Alert.alert('Permission required', 'Sorry, we need camera roll permissions to make this work!');
      return;
    }

    const pickerResult = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'], 
      allowsEditing: true,
      aspect: [1, 1],
      quality: 1,
      base64: true
    });


    const uri = pickerResult.assets?.[0]?.uri
    setProfileImageRead(uri);

    if (!pickerResult.canceled) {
      const image = pickerResult.assets[0];
      const base64 = image.base64;
      
      await handleImageUpload(base64);
    }
  };


  const logout = useCallback(async () => {
    if (logoutInFlight.current) {
      return;
    }

    logoutInFlight.current = true;
    setIsLoggingOut(true);

    try {
      const { error } = await signOutCurrentUser();

      if (error) {
        Alert.alert(
          'Logout failed',
          `${error.message} Please try again.`,
        );
        return;
      }

      setDisplayName('');
      setProfileImage(null);
      setProfileImageRead(null);
      setUserId(undefined);
      router.replace('/(auth)/SignUp');
      Alert.alert('Logged out', 'You successfully logged out.');
    } catch (error) {
      console.warn('Unexpected logout error:', error);
      Alert.alert(
        'Logout failed',
        'We could not log you out. Please check your connection and try again.',
      );
    } finally {
      logoutInFlight.current = false;
      setIsLoggingOut(false);
    }
  }, [router]);

  const handleDeleteAccount = async () => {
    const { data, error } = await supabase.functions.invoke('delete-user', {
      body: {},
    });

    if (error || data?.error) {
      Alert.alert(
        'Delete failed',
        'Unable to delete your account. Please try again later or contact support.'
      );
      return;
    }

    await supabase.auth.signOut();
    Alert.alert('Account deleted', 'Your account was deleted successfully.');
    router.replace('/SignUp');
  }


  const deleteAccount = async() => {
    Alert.alert(
      "Delete Account",
      "This permanently deletes your Sportiner account, profile, photos, games, messages, and personal data where deletion is legally permitted. This cannot be undone.",
      [
        {
          text: "Cancel",
          style: "cancel"
        },
        { 
          text: "Delete Account",
          onPress: () => handleDeleteAccount(),
          style: "destructive"
        }
      ],
      { cancelable: false }
    );
  }


  const toggleAvailability = (timeOfDay: 'morning' | 'afternoon' | 'evening', dayIndex: number) => {
    setAvailability((prev) => ({
      ...prev,
      [timeOfDay]: prev[timeOfDay].map((value, index) =>
        index === dayIndex ? (value === 'filled' ? '' : 'filled') : value
      ),
    }));
  };

  const toDbAvailability = (
    uiAvailability: { morning: string[]; afternoon: string[]; evening: string[] }
  ) => {
    const dbAvailability: Record<Day, Record<TimeOfDay, boolean>> = {} as Record<
      Day,
      Record<TimeOfDay, boolean>
    >;

    daysOfWeek.forEach((day, index) => {
      dbAvailability[day] = {
        morning: uiAvailability.morning[index] === 'filled',
        afternoon: uiAvailability.afternoon[index] === 'filled',
        evening: uiAvailability.evening[index] === 'filled',
      };
    });

    return dbAvailability;
  };

  const handleSave = async () => {
    const availabilityForDb = toDbAvailability(availability);
    const {data, error} = await supabase.from('users')
    .update({
      name: displayName,
      availability: availabilityForDb,
    }).eq('id', userId)

    if (error) {
      Alert.alert("There was an error saving your changes.")
      console.log(error)
    } else {
      console.log("updated data: ", data)
      onSave({
        displayName,
        availability: availabilityForDb,
        profileImage,
      });
      onClose();
    }
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
              <Image source={{ uri: profileImageRead }} style={styles.profileImagePreview} />
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
                {availability.evening.map((status, index) => (
                  <TouchableOpacity 
                    key={index} 
                    style={styles.availabilityCell}
                    onPress={() => toggleAvailability('evening', index)}
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
          <Text style={styles.legalUpdatedText}>Last updated: {LEGAL_LAST_UPDATED}</Text>
          
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

          <TouchableOpacity style={styles.menuRow} onPress={() => Linking.openURL(LEGAL_LINKS.terms)}>
            <View style={styles.menuLeft}>
              <Ionicons name="document-text-outline" size={24} color="#666" />
              <Text style={styles.menuText}>Terms of Use</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#666" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuRow} onPress={() => Linking.openURL(LEGAL_LINKS.privacy)}>
            <View style={styles.menuLeft}>
              <Ionicons name="lock-closed-outline" size={24} color="#666" />
              <Text style={styles.menuText}>Privacy Policy</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#666" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuRow} onPress={() => Linking.openURL(LEGAL_LINKS.communityGuidelines)}>
            <View style={styles.menuLeft}>
              <Ionicons name="people-outline" size={24} color="#666" />
              <Text style={styles.menuText}>Community Guidelines</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#666" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuRow} onPress={() => Linking.openURL(LEGAL_LINKS.support)}>
            <View style={styles.menuLeft}>
              <Ionicons name="help-buoy-outline" size={24} color="#666" />
              <Text style={styles.menuText}>Support</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#666" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuRow} onPress={() => Linking.openURL(LEGAL_LINKS.supportMailto)}>
            <View style={styles.menuLeft}>
              <Ionicons name="mail-outline" size={24} color="#666" />
              <Text style={styles.menuText}>Contact Support</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#666" />
          </TouchableOpacity>


          <TouchableOpacity style={styles.menuRow} onPress={logout}>
            <View style={styles.menuLeft}>
              <Ionicons name="exit-outline" size={24} color="#BA1A1A" />
              <Text style={[styles.menuText, { color: '#BA1A1A' }]}>Log Out</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#BA1A1A" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuRow} onPress={deleteAccount}>
            <View style={styles.menuLeft}>
              <Ionicons name="trash-outline" size={24} color="#BA1A1A" />
              <Text style={[styles.menuText, { color: '#BA1A1A' }]}>Delete Account</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#BA1A1A" />
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
                    <Text style={styles.helpDescription}>
                      {`Use the availability grid to show when you're free to play. Other players can see your schedule and invite you to matches.`}
                    </Text>
                  </View>
                </View>

                <View style={styles.helpSection}>
                  <Ionicons name="trophy-outline" size={24} color="#19E675" />
                  <View style={styles.helpText}>
                    <Text style={styles.helpTitle}>ELO Rating System</Text>
                    <Text style={styles.helpDescription}>The ELO rating helps match you with players of similar skill levels. Ratings range from 400 (beginner) to +1600 (professional).</Text>
                  </View>
                </View>

                <View style={styles.helpSection}>
                  <Ionicons name="shield-checkmark-outline" size={24} color="#19E675" />
                  <View style={styles.helpText}>
                    <Text style={styles.helpTitle}>Account Safety</Text>
                    <Text style={styles.helpDescription}>Your profile is only visible to other tennis players. We never share your personal information with third parties.</Text>
                  </View>
                </View>

                <View style={styles.supportContactSection}>
                  <Text style={styles.supportContactTitle}>Contact Support</Text>
                  <Text style={styles.supportContactText}>Questions or safety concerns? Contact support@sportiner.com.</Text>
                  <TouchableOpacity onPress={() => Linking.openURL(LEGAL_LINKS.supportMailto)}>
                    <Text style={styles.supportContactEmail}>{LEGAL_LINKS.supportEmail}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => Linking.openURL(LEGAL_LINKS.support)}>
                    <Text style={styles.supportContactLink}>Visit Support Page</Text>
                  </TouchableOpacity>
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
    marginBottom: 30
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: 'black',
    marginBottom: 16,
  },
  legalUpdatedText: {
    color: '#666',
    fontSize: 12,
    fontWeight: '600',
    marginTop: -8,
    marginBottom: 8,
    textTransform: 'uppercase',
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
    flex: 1,
  },
  menuText: {
    flex: 1,
    fontSize: 16,
    color: 'black',
    marginLeft: 12,
  },
  logoutButton: {
    flexDirection: 'row',
    borderColor: '#EA4335',
    borderWidth: 2,
    width: 200,
    borderRadius: 90,
    justifyContent: 'space-evenly',
    minHeight: 40,
    alignSelf: 'center',
    marginTop: 70,
    marginBottom: 30
  },
  logoutButtonDisabled: {
    opacity: 0.65,
  },
  logoutLogo: {
    color: '#EA4335',
    marginTop: 6
  },
  logoutText: {
    color: '#EA4335',
    fontWeight: '600',
    fontSize: 15,
    justifyContent: 'center',
    marginTop: 8,
    marginRight: 10,
    marginLeft: -20
  },
  deleteButton: {
    flexDirection: 'row',
    backgroundColor: '#EA4335',
    borderColor: '#fff',
    width: 200,
    borderRadius: 90,
    justifyContent: 'space-evenly',
    minHeight: 43,
    alignSelf: 'center',
    marginTop: 30,
    marginBottom: 40
  },
  deleteText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 15,
    justifyContent: 'center',
    marginTop: 12,
    marginRight: 10,
    marginLeft: 10
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
  supportContactSection: {
    marginTop: 32,
    padding: 20,
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
  },
  supportContactTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#19E675',
    marginBottom: 8,
  },
  supportContactText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 12,
  },
  supportContactEmail: {
    fontSize: 16,
    fontWeight: '600',
    color: '#19E675',
    marginBottom: 8,
  },
  supportContactLink: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    textDecorationLine: 'underline',
  },
});
