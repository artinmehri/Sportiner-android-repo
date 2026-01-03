import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

export default function SignUp() {
  const router = useRouter();

  const handleGoogleSignUp = () => {
    console.log('Navigating to firstOnbPage with Google method');
    router.push('/firstOnbPage?method=google');
  };

  const handleFacebookSignUp = () => {
    console.log('Navigating to firstOnbPage with Facebook method');
    router.push('/firstOnbPage?method=facebook');
  };

  const handleAppleSignUp = () => {
    console.log('Navigating to firstOnbPage with Apple method');
    router.push('/firstOnbPage?method=apple');
  };

  const handleEmailSignUp = () => {
    console.log('Navigating to firstOnbPage with Email method');
    router.push('/firstOnbPage');
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.inner}>
        <View style={styles.logoCircle}>
          <Text style={styles.logoText}>S</Text>
        </View>
        <Text style={styles.heading}>Play with the people{'\n'}around you</Text>
        <View style={styles.socials}>
          <TouchableOpacity style={[styles.socialBtn, {backgroundColor: '#FFFFFF', borderColor: '#4285F4'}]} onPress={handleGoogleSignUp}>
            <View style={styles.iconLeft}><Ionicons name="logo-google" size={24} color="#4285F4" /></View>
            <Text style={styles.socialBtnText}>Continue with Google</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.socialBtn, {backgroundColor: '#1877F2', borderColor: '#1877F2'}]} onPress={handleFacebookSignUp}>
            <View style={styles.iconLeft}><Ionicons name="logo-facebook" size={24} color="#FFFFFF" /></View>
            <Text style={[styles.socialBtnText, {color: '#FFFFFF'}]}>Continue with Facebook</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.socialBtn, {backgroundColor: '#000000', borderColor: '#000000'}]} onPress={handleAppleSignUp}>
            <View style={styles.iconLeft}><Ionicons name="logo-apple" size={24} color="#FFFFFF" /></View>
            <Text style={[styles.socialBtnText, {color: '#FFFFFF'}]}>Continue with Apple</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.orRow}>
          <View style={styles.orLine} />
          <Text style={styles.orText}>OR</Text>
          <View style={styles.orLine} />
        </View>
        <TouchableOpacity style={styles.emailBtn} onPress={handleEmailSignUp}>
          <Ionicons name="mail-outline" size={24} color="#19E675" style={{marginRight:8}} />
          <Text style={styles.emailBtnText}>Continue with Email</Text>
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
  inner: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  logoCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#19E675',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 32,
  },
  logoText: {
    fontSize: 56,
    fontWeight: '700',
    color: '#222',
  },
  heading: {
    fontSize: 22,
    fontWeight: '700',
    color: '#222',
    textAlign: 'center',
    marginBottom: 44,
  },
  socials: {
    width: '100%',
    marginBottom: 36,
  },
  socialBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#222',
    borderRadius: 24,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 16,
    backgroundColor: '#fff',
  },
  iconLeft: {
    width: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  socialBtnText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#222',
  },
  orRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    marginBottom: 32,
  },
  orLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#E5E5E5',
  },
  orText: {
    marginHorizontal: 12,
    fontSize: 16,
    color: '#888',
    fontWeight: '600',
  },
  emailBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    marginTop: 0,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  emailBtnText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#19E675',
  },
});