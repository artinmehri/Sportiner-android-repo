import React, { useState } from 'react';
import { ActivityIndicator, Image, Text, StyleSheet, StatusBar, TouchableOpacity, View, TextInput, Alert, Modal } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import GoogleIcon from '@/scripts/GoogleIcon'
import { isOnboarding, supabase, userExists } from '@/context/AuthContext';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto'
import {
  bindLocalTermsAcceptanceToUser,
  persistTermsAcceptanceForUser,
  userHasAcceptedCurrentTerms,
} from '@/lib/termsAcceptance';

const PASSWORD_RESET_REDIRECT_URL = 'sportiner://reset-password';
const PASSWORD_RESET_CONFIRMATION_COPY = 'If an account exists for this email, we sent password reset instructions.';

GoogleSignin.configure({
  webClientId: '939148334598-u3nj7v0p1fvrgak8hg14rssm0incde6s.apps.googleusercontent.com',
  iosClientId: '939148334598-8al463kq6ov8gr46v932pdl98vnjd3r7.apps.googleusercontent.com',
  scopes: ['profile', 'email'],
});

async function hasAcceptedTermsForCurrentUser(): Promise<boolean> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  const userId = userData?.user?.id;

  if (userError || !userId) {
    console.log('Unable to check accepted terms: missing user session', userError?.message);
    return false;
  }

  if (await userHasAcceptedCurrentTerms(userId)) {
    return true;
  }

  if (!(await bindLocalTermsAcceptanceToUser(userId))) {
    return false;
  }

  return persistTermsAcceptanceForUser(userId);
}

export default function Login () {
  const router = useRouter();
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetModalVisible, setResetModalVisible] = useState(false);
  const [resetPending, setResetPending] = useState(false);
  const [resetConfirmation, setResetConfirmation] = useState('');
  

  const handleGoogleLogin = async () => {
    try {
      // 1. Trigger Google login
      await GoogleSignin.hasPlayServices();
      const userInfo = await GoogleSignin.signIn();
      const idToken = userInfo.data?.idToken;
  
      if (!idToken) {
        console.log('user rejected')
        return;
      }

      const { data: authData, error } = await supabase.auth.signInWithIdToken({
        provider: 'google',
        token: idToken,
    });

      if (error || !authData.user) {
        Alert.alert('Google login failed');
        console.log('Google login error:', error?.message ?? 'No user returned');
        return;
      }
  
      const response = await userExists()
   
    if (response === true) {
      console.log("user exists from google login in login.tsx!");
      const acceptedTerms = await hasAcceptedTermsForCurrentUser();

      if (!acceptedTerms) {
        isOnboarding.current = true;
        router.replace({
          pathname: '/(auth)/user-agreement' as never,
          params: { next: 'tabs' },
        });
        return;
      }

      isOnboarding.current = false;
      router.replace('/(tabs)');
    } else {
      console.log("user doesn't exist from google login in login.tsx!");
      isOnboarding.current = true;
      if (await bindLocalTermsAcceptanceToUser(authData.user.id)) {
        router.replace({
          pathname: '/(auth)/SignupFlow' as never,
          params: { method: 'google' },
        });
      } else {
        router.replace({
          pathname: '/(auth)/user-agreement' as never,
          params: { method: 'google' },
        });
      }
    }     
    
    } catch {
      Alert.alert('Error', 'Google login failed');
    }
  };


  const handleAppleLogin = async () => {
    try {


      const rawNonce = Math.random().toString(36).substring(2, 10);

      const hashedNonce = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        rawNonce
      );
      
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
        nonce: hashedNonce
      });


      if (!credential.identityToken) {
        Alert.alert('Error', 'Login failed, please try again!');
        console.log('could not get apple login token')
        return;
      }

      const { error } = await supabase.auth.signInWithIdToken({
        provider: 'apple',
        token: credential.identityToken,
        nonce: rawNonce
      });

      if (error) {
        Alert.alert('Apple sign in failed');
        return;
      }

      const { data: userData } = await supabase.auth.getUser();
      const user = userData?.user;

      if (!user) {
        Alert.alert('Error', 'User session not ready');
        return;
      }

      const response = await userExists()

      if (response === true) {
        console.log("user exists from apple login in login.tsx!");
        const acceptedTerms = await hasAcceptedTermsForCurrentUser();

        if (!acceptedTerms) {
          isOnboarding.current = true;
          router.replace({
            pathname: '/(auth)/user-agreement' as never,
            params: { next: 'tabs' },
          });
          return;
        }

        isOnboarding.current = false;
        router.replace('/(tabs)');
      } else {
        console.log("user doesn't exist in apple login from login.tsx");
        isOnboarding.current = true;

        const appleDisplayName = [credential.fullName?.givenName, credential.fullName?.familyName]
          .filter(Boolean)
          .join(' ')
          .trim();
        const appleEmail = credential.email?.trim() ?? '';

        const params = {
          method: 'apple',
          providerName: appleDisplayName,
          providerEmail: appleEmail,
        };

        if (await bindLocalTermsAcceptanceToUser(user.id)) {
          router.replace({
            pathname: '/(auth)/SignupFlow' as never,
            params,
          });
        } else {
          router.replace({
            pathname: '/(auth)/user-agreement' as never,
            params,
          });
        }
      }
    } catch (error: any) {
        console.log('Apple error:', error);
    }
  };

  const handleLogin = async () => {
    if (!email.trim()) {
        Alert.alert('Error', 'Please enter your email');
        return
    }

    if (!password.trim()) {
        Alert.alert('Error', 'Please enter your password');
        return
    }

    const {data, error} = await supabase.auth.signInWithPassword({email: email, password: password})

    if (error) {
      if (error.message === "Invalid login credentials") {
        Alert.alert("You don't seem to have an account, please make one!")
      }
    } else {
      console.log('signed in', data.session);
      const acceptedTerms = await hasAcceptedTermsForCurrentUser();

      if (!acceptedTerms) {
        isOnboarding.current = true;
        router.replace({
          pathname: '/(auth)/user-agreement' as never,
          params: { next: 'tabs' },
        });
        return;
      }

      isOnboarding.current = false;
      router.replace('/(tabs)');
    }
  };

  const openResetModal = () => {
    setResetEmail(email);
    setResetConfirmation('');
    setResetModalVisible(true);
  };

  const closeResetModal = () => {
    if (resetPending) return;

    setResetModalVisible(false);
    setResetConfirmation('');
  };

  const handlePasswordResetRequest = async () => {
    const normalizedEmail = resetEmail.trim().toLowerCase();

    if (!normalizedEmail) {
      Alert.alert('Email required', 'Enter your email address to request password reset instructions.');
      return;
    }

    setResetPending(true);

    const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
      redirectTo: PASSWORD_RESET_REDIRECT_URL,
    });

    if (error) {
      console.log('Password reset request failed:', error.message);
    }

    setResetPending(false);
    setResetConfirmation(PASSWORD_RESET_CONFIRMATION_COPY);
  };

  return (
    <SafeAreaView style={styles.container}>
        <StatusBar barStyle="dark-content" />
        <View style={styles.pageContainer}>

            <View>
                <Image style={styles.logoCircle} source={require('@/assets/images/icon.png')} />
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
                  <TouchableOpacity style={styles.forgotPasswordButton} onPress={openResetModal}>
                    <Text style={styles.forgotPasswordText}>Forgot password?</Text>
                  </TouchableOpacity>
	              </View>

            <TouchableOpacity 
              style={[styles.loginBtn]} 
              onPress={handleLogin}
            >
            <Text style={styles.loginBtnText}>Log In</Text>
            </TouchableOpacity>
            <View style={styles.loginTxtContainer}>
              <Text style={styles.loginTxt}>Do not have an account? <Text onPress={() => router.replace('/(auth)/SignUp')} style={styles.login}>Sign up</Text></Text>
            </View>

        </View>
        <Modal
          animationType="fade"
          transparent
          visible={resetModalVisible}
          onRequestClose={closeResetModal}
        >
          <View style={styles.modalBackdrop}>
            <View style={styles.resetCard}>
              <Text style={styles.resetTitle}>Reset password</Text>
              <Text style={styles.resetBody}>
                Enter the email for your Sportiner account and we will send password reset instructions.
              </Text>
              <TextInput
                style={styles.resetInput}
                value={resetEmail}
                onChangeText={(value) => {
                  setResetEmail(value);
                  setResetConfirmation('');
                }}
                placeholder="you@example.com"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                editable={!resetPending}
              />
              {resetConfirmation ? (
                <Text style={styles.resetConfirmation}>{resetConfirmation}</Text>
              ) : null}
              <TouchableOpacity
                style={[styles.resetSubmitButton, resetPending && styles.loginBtnDisabled]}
                onPress={handlePasswordResetRequest}
                disabled={resetPending}
              >
                {resetPending ? (
                  <ActivityIndicator color="#002000" />
                ) : (
                  <Text style={styles.resetSubmitText}>Send reset instructions</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity style={styles.resetCancelButton} onPress={closeResetModal} disabled={resetPending}>
                <Text style={styles.resetCancelText}>{resetConfirmation ? 'Done' : 'Cancel'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
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
    alignSelf: 'center',
    borderRadius: 48,
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
    width: 330,
    alignSelf: 'center'
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
    width: '100%',
  },
  passwordInput: {
    flex: 1,
  },
  eyeIcon: {
    position: 'absolute',
    right: 16,
    padding: 4,
  },
  forgotPasswordButton: {
    alignSelf: 'flex-end',
    marginTop: 10,
  },
  forgotPasswordText: {
    color: '#19E675',
    fontSize: 14,
    fontWeight: '700',
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
  loginBtnDisabled: {
    backgroundColor: '#A0D8B5',
  },
  loginBtnText: {
    fontSize: 18,
    fontWeight: '500',
    color: '#002000',
  },
  modalBackdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    paddingHorizontal: 24,
  },
  resetCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 24,
    backgroundColor: '#fff',
    padding: 24,
    borderWidth: 1,
    borderColor: '#E5E5E5',
  },
  resetTitle: {
    color: '#222',
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
  },
  resetBody: {
    color: '#555',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 18,
    textAlign: 'center',
  },
  resetInput: {
    height: 50,
    borderWidth: 1,
    borderColor: '#E5E5E5',
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 16,
    backgroundColor: '#fff',
    marginBottom: 14,
  },
  resetConfirmation: {
    color: '#333',
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 14,
    textAlign: 'center',
  },
  resetSubmitButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
    borderRadius: 9999,
    backgroundColor: '#19E675',
    marginBottom: 12,
  },
  resetSubmitText: {
    color: '#002000',
    fontSize: 15,
    fontWeight: '700',
  },
  resetCancelButton: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  resetCancelText: {
    color: '#555',
    fontSize: 14,
    fontWeight: '700',
  },
});
