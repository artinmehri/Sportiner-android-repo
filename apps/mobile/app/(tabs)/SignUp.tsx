import React, { useCallback, useMemo, useRef } from 'react';
import { Image, Text, StyleSheet, StatusBar, TouchableOpacity, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import BottomSheet, { BottomSheetView } from '@gorhom/bottom-sheet';
import { useRouter } from 'expo-router';
import { SafeAreaFrameContext } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import GoogleIcon from '@/scripts/GoogleIcon'


const SignUp = () => {
  const router = useRouter();
  // ref
  const bottomSheetRef = useRef<BottomSheet>(null);
  const snapPoints = useMemo(() => ['34%', '40%'], []);

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
    router.replace('/firstOnbPage');
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
              <TouchableOpacity style={styles.socialBtn} onPress={handleFacebookSignUp}>
                <Ionicons  color="#1877F2" size={30} name="logo-facebook"></Ionicons>
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
export default SignUp;