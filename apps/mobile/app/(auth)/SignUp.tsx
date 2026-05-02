import React, { useMemo, useRef } from 'react';
import { Image, Text, StyleSheet, StatusBar, TouchableOpacity, View, Alert } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import BottomSheet, { BottomSheetView } from '@gorhom/bottom-sheet';
import { useRouter } from 'expo-router';
import * as AppleAuthentication from 'expo-apple-authentication'
import { SafeAreaFrameContext } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import GoogleIcon from '@/scripts/GoogleIcon'
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { isOnboarding, supabase, userExists } from '@/context/AuthContext';
import * as Crypto from 'expo-crypto'

GoogleSignin.configure({
  webClientId: '939148334598-u3nj7v0p1fvrgak8hg14rssm0incde6s.apps.googleusercontent.com',
  iosClientId: '939148334598-8al463kq6ov8gr46v932pdl98vnjd3r7.apps.googleusercontent.com',
  scopes: ['profile', 'email'],
});


export default function SignUp() {
  const router = useRouter();
  // ref
  const bottomSheetRef = useRef<BottomSheet>(null);
  const snapPoints = useMemo(() => ['34%', '40%'], []);
  

  const handleGoogleSignUp = async () => {
    try {
        await GoogleSignin.hasPlayServices();
        const userInfo = await GoogleSignin.signIn();
        const idToken = userInfo.data?.idToken;
        
        if (!idToken) {
          console.log('user rejected')
            return;
        }

        const { error } = await supabase.auth.signInWithIdToken({
          provider: 'google',
          token: idToken,
      });

        const response = await userExists()

        // Checking if user exists
        if (response == true) {
          console.log('user already exists from signup.tsx!')
          isOnboarding.current = false

          console.log('redirecting the user to homepage!')

          router.replace('/(tabs)');

        } else {
          console.log("user doesn't exist!")
          isOnboarding.current = true


          if (error) {
            isOnboarding.current = false
              Alert.alert('Google sign up failed', error.message);
              return;
          }
  
          console.log("redirecting the user to signup process!")
          router.push({ pathname: '/SignupFlow', params: { method: 'google' }});
  
        }
    } catch (error) {
        Alert.alert('Error', 'Google sign in failed');
    }
};

  const handleAppleSignUp = async () => {
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
        Alert.alert('Error', 'Could not get Apple token');
        return;
      }

      const { error } = await supabase.auth.signInWithIdToken({
        provider: 'apple',
        token: credential.identityToken,
        nonce: rawNonce
      });

      const response = await userExists()

      if (response == true) {
        console.log("user already exists!")

        isOnboarding.current = false

        router.push('/(tabs)');
      } else {
      console.log("user doesn't exist! from apple signup in signup.tsx!")

      isOnboarding.current = true;

      if (error) {
        isOnboarding.current = false;
        Alert.alert('Apple sign up failed', error.message);
        return;
      }

      router.push({ pathname: '/SignupFlow', params: { method: 'apple' }}); 
    }

  } catch(error: any) {
        // Ignore user cancellation
        if (error?.code !== 'ERR_REQUEST_CANCELED') {
          Alert.alert('Error', error?.message || 'Apple sign in failed');
          console.log('Apple error:', error);
      }
  }
};


  const handleEmailSignUp = () => {
    router.push('/SignupFlow');
  };

  // renders
  return (
    <GestureHandlerRootView style={styles.inner}>
      <SafeAreaFrameContext value={null}>
          <StatusBar barStyle="dark-content" />
            <Image
            style={styles.frameImage}
            source={require('@/assets/images/Frame.png')}
            ></Image>

        <BottomSheet
        index={0}
          ref={bottomSheetRef}
          snapPoints={snapPoints}
          enableDynamicSizing={false}>
          <BottomSheetView style={styles.container}>
            <View style={styles.socialBtnContainer}>
              <TouchableOpacity style={styles.socialBtn} onPress={handleAppleSignUp}>
                <Ionicons size={30} name="logo-apple"></Ionicons>
              </TouchableOpacity>
              <TouchableOpacity style={styles.socialBtn} onPress={handleGoogleSignUp}>
                <GoogleIcon size={26} style={styles.socialBtnText}/>
              </TouchableOpacity>
            </View>

            <View style={styles.orRow}>
            <View style={styles.orLine} />
            <Text style={styles.orText}>OR</Text>
            <View style={styles.orLine} />
            </View>

            <TouchableOpacity style={styles.emailBtn} onPress={handleEmailSignUp}>
              <Text style={styles.emailBtnText}>Continue with Email</Text>            
            </TouchableOpacity>

            <View style={styles.loginTxtContainer}>
              <Text style={styles.loginTxt}>Already a member? <Text onPress={() => router.replace('/login')} style={styles.login}>Log in</Text></Text>
            </View>

          </BottomSheetView>
        </BottomSheet>
      </SafeAreaFrameContext>
    </GestureHandlerRootView>


  );
};

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
  frameImage: {
    marginTop: -190,
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
    color: '#000000',
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
    marginTop: -5
  },
  emailBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    borderRadius: 9999,
    marginTop: -9,
    paddingVertical: 15,
    paddingHorizontal: 90,
    backgroundColor: '#19E675'
  },
  emailBtnText: {
    fontSize: 18,
    fontWeight: '500',
    color: '#002000',
  },
});