import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  Image,
  ScrollView,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { SignupInterface } from '../../context/SignupInterface.type';


type AuthMethod = 'email' | 'google' | 'facebook' | 'apple';

export default function FirstOnbPage({onNext, changeData, onBack} : SignupInterface) {
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [selectedAgeGroup, setSelectedAgeGroup] = useState('15-18');
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const router = useRouter();
  const params = useLocalSearchParams<{ method?: AuthMethod; email?: string }>();
  const authMethod = params.method || 'email';

  const ageGroups = ['15-18', '19-25', '26-35', '36-50', '50+'];


  const handleContinue = () => {
    if (!displayName.trim()) {
      Alert.alert('Error', 'Please enter your display name');
      return;
    }

    if (authMethod === 'email') {
      if (!email.trim()) {
        Alert.alert('Error', 'Please enter your email address');
        return;
      }
      
      if (!password.trim()) {
        Alert.alert('Error', 'Please enter your password');
        return;
      }

      if (password.length < 6) {
        Alert.alert('Error', 'Your password has to be at least 6 characters.')
        return;
      }
    }

    if (!selectedAgeGroup) {
      Alert.alert('Error', 'Please select your age group');
      return;
    }

    changeData((prev: any) => ({
      ...prev,
      name: displayName,
      profile_picture: profileImage,
      email: email,
      password: password,
      age_group: selectedAgeGroup
    }))

    onNext();
    console.log('data sent to signup flow')
  };

  const handleImagePick = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    
    if (permissionResult.granted === false) {
      Alert.alert('Permission Required', 'Please grant camera roll permissions to upload a photo.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      setProfileImage(result.assets[0].uri);
    }
  };

  React.useEffect(() => {
    if (params.email) {
      setEmail(params.email);
    }
  }, [params.email]);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color="#000" />
        </TouchableOpacity>
        <View style={styles.progressDots}>
          <View style={[styles.dot, styles.activeDot]} />
          <View style={styles.dot} />
          <View style={styles.dot} />
        </View>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.profileSection}>
          <TouchableOpacity style={styles.photoContainer} onPress={handleImagePick}>
            <View style={styles.photoCircle}>
              {profileImage ? (
                <Image source={{ uri: profileImage }} style={styles.profileImage} />
              ) : (
                <>
                  <Ionicons name="camera" size={32} color="#19E675" />
                  <Text style={styles.addPhotoText}>+ Add photo</Text>
                </>
              )}
            </View>
          </TouchableOpacity>
          <Text style={styles.photoDescription}>
            Hosts are 80% more likely to accept players with a clear photo.
          </Text>
        </View>

        <View style={styles.formSection}>
          <View style={styles.inputGroup}>
            <Text style={[styles.label, focusedField === 'displayName' && styles.labelFocused]}>Display Name</Text>
            <TextInput
              style={[styles.input, focusedField === 'displayName' && styles.inputFocused]}
              value={displayName}
              onChangeText={setDisplayName}
              placeholder="Enter your display name"
              onFocus={() => setFocusedField('displayName')}
              onBlur={() => setFocusedField(null)}
            />
          </View>

          {/* Only show email/password fields for email auth */}
          {authMethod === 'email' && (
            <>
              <View style={styles.inputGroup}>
                <Text style={[styles.label, focusedField === 'email' && styles.labelFocused]}>Email</Text>
                <TextInput
                  style={[styles.input, focusedField === 'email' && styles.inputFocused]}
                  value={email}
                  onChangeText={setEmail}
                  placeholder="e.g., artin@sportiner.com"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  onFocus={() => setFocusedField('email')}
                  onBlur={() => setFocusedField(null)}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={[styles.label, focusedField === 'password' && styles.labelFocused]}>Password</Text>
                <View style={styles.passwordInputContainer}>
                  <TextInput
                    style={[styles.input, styles.passwordInput, focusedField === 'password' && styles.inputFocused]}
                    value={password}
                    onChangeText={setPassword}
                    placeholder="e.g., Artin K"
                    secureTextEntry={!showPassword}
                    onFocus={() => setFocusedField('password')}
                    onBlur={() => setFocusedField(null)}
                  />
                  <TouchableOpacity 
                    style={styles.eyeIcon} 
                    onPress={() => setShowPassword(!showPassword)}
                  >
                    <Ionicons 
                      name={showPassword ? 'eye-off' : 'eye'} 
                      size={20} 
                      color="#666" 
                    />
                  </TouchableOpacity>
                </View>
              </View>
            </>
          )}

          <View style={styles.ageSection}>
            <Text style={styles.label}>Age Group</Text>
            <View style={styles.ageRow}>
              {ageGroups.slice(0, 3).map((group) => (
                <TouchableOpacity
                  key={group}
                  style={[
                    styles.ageButton,
                    selectedAgeGroup === group && styles.ageButtonSelected,
                  ]}
                  onPress={() => setSelectedAgeGroup(group)}
                >
                  <Text
                    style={[
                      styles.ageButtonText,
                      selectedAgeGroup === group && styles.ageButtonTextSelected,
                    ]}
                  >
                    {group}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.ageRow}>
              {ageGroups.slice(3).map((group) => (
                <TouchableOpacity
                  key={group}
                  style={[
                    styles.ageButton,
                    selectedAgeGroup === group && styles.ageButtonSelected,
                  ]}
                  onPress={() => setSelectedAgeGroup(group)}
                >
                  <Text
                    style={[
                      styles.ageButtonText,
                      selectedAgeGroup === group && styles.ageButtonTextSelected,
                    ]}
                  >
                    {group}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.continueButton} onPress={handleContinue}>
          <Text style={styles.continueButtonText}>Continue</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 20,
  },
  backButton: {
    padding: 5,
  },
  progressDots: {
    flexDirection: 'row',
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#E5E5E5',
  },
  activeDot: {
    backgroundColor: '#19E675',
  },
  placeholder: {
    width: 34,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  profileSection: {
    alignItems: 'center',
    marginBottom: 40,
  },
  photoContainer: {
    marginBottom: 12,
  },
  photoCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 2,
    borderColor: '#19E675',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FFF8',
  },
  addPhotoText: {
    fontSize: 14,
    color: '#19E675',
    fontWeight: '600',
    marginTop: 8,
  },
  profileImage: {
    width: 120,
    height: 120,
    borderRadius: 60,
  },
  photoDescription: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 280,
  },
  formSection: {
    marginBottom: 40,
  },
  inputGroup: {
    marginBottom: 24,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  labelFocused: {
    color: '#19E675',
  },
  input: {
    height: 50,
    borderWidth: 1,
    borderColor: '#E5E5E5',
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 16,
    backgroundColor: '#fff',
  },
  inputFocused: {
    borderColor: '#19E675',
    borderWidth: 2,
  },
  passwordInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  passwordInput: {
    flex: 1,
  },
  eyeIcon: {
    position: 'absolute',
    right: 16,
    padding: 4,
  },
  ageSection: {
    marginBottom: 24,
  },
  ageRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  ageButton: {
    flex: 1,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#E5E5E5',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  ageButtonSelected: {
    backgroundColor: '#19E675',
    borderColor: '#19E675',
  },
  ageButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  ageButtonTextSelected: {
    color: '#fff',
  },
  footer: {
    paddingHorizontal: 20,
    paddingBottom: 30,
    paddingTop: 10,
    backgroundColor: '#fff',
  },
  continueButton: {
    height: 56,
    backgroundColor: '#19E675',
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  continueButtonText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
});