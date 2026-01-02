import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';

export default function SignUp() {
  const [email, setEmail] = useState('');
  const router = useRouter();
  const { signUp, signInWithGoogle, signInWithFacebook, signInWithApple, isLoading } = useAuth();

  const handleEmailSignUp = async () => {
    if (!email) {
      Alert.alert('Error', 'Please enter your email address');
      return;
    }

    try {
      await signUp(email);
      Alert.alert('Success', 'Account created successfully!');
      router.push('/(tabs)');
    } catch (error) {
      Alert.alert('Error', 'Failed to create account. Please try again.');
    }
  };

  const handleGoogleSignUp = async () => {
    try {
      await signInWithGoogle();
      Alert.alert('Success', 'Signed up with Google successfully!');
      router.push('/(tabs)');
    } catch (error) {
      Alert.alert('Error', 'Failed to sign up with Google. Please try again.');
    }
  };

  const handleFacebookSignUp = async () => {
    try {
      await signInWithFacebook();
      Alert.alert('Success', 'Signed up with Facebook successfully!');
      router.push('/(tabs)');
    } catch (error) {
      Alert.alert('Error', 'Failed to sign up with Facebook. Please try again.');
    }
  };

  const handleAppleSignUp = async () => {
    try {
      await signInWithApple();
      Alert.alert('Success', 'Signed up with Apple successfully!');
      router.push('/(tabs)');
    } catch (error) {
      Alert.alert('Error', 'Failed to sign up with Apple. Please try again.');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.container}
      >
        <View style={styles.content}>
          <Text style={styles.title}>Create your Sportiner account</Text>
          
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.emailInput}
              placeholder="Email"
              placeholderTextColor="#999"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <TouchableOpacity style={styles.continueButton} onPress={handleEmailSignUp} disabled={isLoading}>
            {isLoading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.continueButtonText}>Continue</Text>
            )}
          </TouchableOpacity>

          <View style={styles.loginContainer}>
            <Text style={styles.loginText}>Already have an account? </Text>
            <TouchableOpacity>
              <Text style={styles.loginLink}>Log In</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.dividerContainer}>
            <View style={styles.divider} />
            <Text style={styles.dividerText}>OR</Text>
            <View style={styles.divider} />
          </View>

          <View style={styles.socialButtonsContainer}>
            <TouchableOpacity style={styles.socialButton} onPress={handleGoogleSignUp} disabled={isLoading}>
              {isLoading ? (
                <ActivityIndicator color="#4285F4" size="small" />
              ) : (
                <Ionicons name="logo-google" size={24} color="#4285F4" />
              )}
            </TouchableOpacity>
            
            <TouchableOpacity style={styles.socialButton} onPress={handleFacebookSignUp} disabled={isLoading}>
              {isLoading ? (
                <ActivityIndicator color="#1877F2" size="small" />
              ) : (
                <Ionicons name="logo-facebook" size={24} color="#1877F2" />
              )}
            </TouchableOpacity>
            
            <TouchableOpacity style={styles.socialButton} onPress={handleAppleSignUp} disabled={isLoading}>
              {isLoading ? (
                <ActivityIndicator color="#000" size="small" />
              ) : (
                <Ionicons name="logo-apple" size={24} color="#000" />
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 50,
    color: '#111',
  },
  inputContainer: {
    marginBottom: 24,
  },
  emailInput: {
    height: 56,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 16,
    fontSize: 16,
    backgroundColor: '#fff',
  },
  continueButton: {
    height: 48,
    backgroundColor: '#19E675',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  continueButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  loginContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 32,
  },
  loginText: {
    fontSize: 14,
    color: '#666',
  },
  loginLink: {
    fontSize: 14,
    color: '#007AFF',
    fontWeight: '600',
  },
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 32,
  },
  divider: {
    flex: 1,
    height: 1,
    backgroundColor: '#ddd',
  },
  dividerText: {
    paddingHorizontal: 16,
    fontSize: 14,
    color: '#666',
  },
  socialButtonsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
  },
  socialButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: '#ddd',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
});