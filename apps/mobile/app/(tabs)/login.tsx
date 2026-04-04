import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Image, Text, StyleSheet, StatusBar, TouchableOpacity, View, TextInput, Alert } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import BottomSheet, { BottomSheetView } from '@gorhom/bottom-sheet';
import { useRouter } from 'expo-router';
import { SafeAreaFrameContext, SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import GoogleIcon from '@/scripts/GoogleIcon'
import AsyncStorage from '@react-native-async-storage/async-storage';


const login = () => {
  const router = useRouter();
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);


  const handleGoogleLogin = () => {
    console.log('Navigating to firstOnbPage with Google method');
    router.push('/firstOnbPage?method=google');
  };

  const handleFacebookLogin = () => {
    console.log('Navigating to firstOnbPage with Facebook method');
    router.push('/firstOnbPage?method=facebook');
  };

  const handleAppleLogin = () => {
    console.log('Navigating to firstOnbPage with Apple method');
    router.push('/firstOnbPage?method=apple');
  };

  const handleLogin = () => {
    if (!email.trim()) {
        Alert.alert('Error', 'Please enter your email');
        return
    }

    if (!password.trim()) {
        Alert.alert('Error', 'Please enter your password');
        return
    } 

    router.replace('/');
    AsyncStorage.setItem("signupValue", "signedUp")
  };

  // renders
  return (
    <SafeAreaView style={styles.container}>
        <StatusBar barStyle="dark-content" />
        <View style={styles.pageContainer}>

            <View>
                <Image style={styles.logoCircle} source={require('@/assets/images/icon.png')}></Image>
                <Text style={styles.heading}>Welcome Back</Text>
                <Text style={styles.subheading}>Sign in to your Sportiner account</Text>
            </View>

            <View style={styles.socialBtnContainer}>
              <TouchableOpacity style={styles.socialBtn} onPress={handleAppleLogin}>
                <Ionicons size={30} name="logo-apple"></Ionicons>
              </TouchableOpacity>
              <TouchableOpacity style={styles.socialBtn} onPress={handleGoogleLogin}>
                <GoogleIcon size={26} style={styles.socialBtnText}/>
              </TouchableOpacity>
              <TouchableOpacity style={styles.socialBtn} onPress={handleFacebookLogin}>
                <Ionicons  color="#1877F2" size={30} name="logo-facebook"></Ionicons>
              </TouchableOpacity>
            </View>

            <View style={styles.orRow}>
            <View style={styles.orLine} />
            <Text style={styles.orText}>OR</Text>
            <View style={styles.orLine} />
            </View>


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

            <TouchableOpacity style={styles.loginBtn} onPress={handleLogin}>
              <Text style={styles.loginBtnText}>Log In</Text>            
            </TouchableOpacity>

            <View style={styles.loginTxtContainer}>
              <Text style={styles.loginTxt}>Don't have an account? <Text onPress={() => router.replace('/SignUp')} style={styles.login}>Sign up</Text></Text>
            </View>

        </View>
    </SafeAreaView>


  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  pageContainer: {
    marginTop: 30,
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
    width: 70,
    height: 70,
    marginLeft: 150,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  logoText: {
    fontSize: 56,
    fontWeight: '700',
    color: '#222',
  },
  heading: {
    fontSize: 30,
    fontWeight: '700',
    color: '#222',
    textAlign: 'center',
    marginBottom: 9,
  },
  subheading: {
    fontSize: 16,
    fontWeight: '300',
    color: '#222',
    textAlign: 'center',
    marginBottom: 30
  },
  socials: {
    width: '100%',
    marginBottom: 36,
  },
  iconLeft: {
    width: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  loginTxtContainer: {
    marginTop: 20,
    alignItems: 'center',
    justifyContent: 'center'
  },
  loginTxt: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  login: {
    fontSize: 14,
    fontWeight: '600',
    color: '#19E675',
    textDecorationLine: 'underline'
  },
  socialBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#222',
  },
  orRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    marginBottom: 32,
    marginTop: 20
  },
  orLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#E5E5E5',
  },
  orText: {
    marginHorizontal: 12,
    fontSize: 10,
    color: '#888',
    fontWeight: '600',
  },
  inputGroup: {
    marginBottom: 24,
    maxWidth: 330,
    marginLeft: 30
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
  socialBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    borderRadius: 9999,
    marginTop: 0,
    paddingVertical: 15,
    paddingHorizontal: 15,
    borderWidth: 1.3,
    borderColor: '#F3F4F6', 
  },
  socialBtnContainer: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    alignItems: 'center',
    padding: 16,
  },
  loginBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    borderRadius: 9999,
    paddingVertical: 15,
    paddingHorizontal: 130,
    backgroundColor: '#19E675',
    marginTop: 20
  },
  loginBtnText: {
    fontSize: 18,
    fontWeight: '500',
    color: '#002000',
  },
});
export default login;