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
import {
  getOnboardingStatus,
  onboardingStatusToStep,
  isOnboarding,
  supabase,
} from '@/context/AuthContext';
import * as Crypto from 'expo-crypto'
import {
  bindLocalTermsAcceptanceToUser,
  hasUnboundLocalTermsAcceptance,
  persistTermsAcceptanceForUser,
  userHasAcceptedCurrentTerms,
} from '@/lib/termsAcceptance';
import {
  logOnboardingError,
  onboardingErrorCopy,
  OnboardingFlowError,
  toOnboardingError,
  type OnboardingProvider,
} from '@/lib/onboardingErrors';
import { storeAppleAuthorizationCode } from '@/lib/appleAuth';

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

  const showSocialAuthError = (
    provider: OnboardingProvider,
    source: string,
    error: unknown
  ) => {
    const onboardingError = toOnboardingError(
      { failure: 'account_creation', provider, source },
      error
    );
    const copy = onboardingErrorCopy(onboardingError);
    logOnboardingError(onboardingError);
    Alert.alert(copy.title, copy.message, [{ text: 'Try Again' }]);
  };

  const routeToAgreement = (params: Record<string, string>) => {
    router.replace({
      pathname: '/(auth)/user-agreement' as never,
      params,
    });
  };

  const routeToSignupFlow = (params: Record<string, string>) => {
    router.replace({
      pathname: '/(auth)/SignupFlow' as never,
      params,
    });
  };

  const bindTermsForUser = async (userId: string, provider: OnboardingProvider) => {
    try {
      return await bindLocalTermsAcceptanceToUser(userId);
    } catch (error) {
      throw toOnboardingError(
        { failure: 'terms_save', provider, source: 'terms.local.bind_user' },
        error
      );
    }
  };

  const finishAuthenticatedTermsCheck = async (
    userId: string,
    provider: OnboardingProvider
  ) => {
    try {
      if (await userHasAcceptedCurrentTerms(userId)) {
        return true;
      }

      if (!(await bindTermsForUser(userId, provider))) {
        return false;
      }

      if (!(await persistTermsAcceptanceForUser(userId))) {
        throw new OnboardingFlowError({
          failure: 'terms_save',
          provider,
          source: 'terms.users.persist',
        });
      }

      return true;
    } catch (error) {
      throw toOnboardingError(
        { failure: 'terms_save', provider, source: 'terms.acceptance.check' },
        error
      );
    }
  };

  const routeAuthenticatedUser = async (
    userId: string,
    provider: OnboardingProvider,
    params: Record<string, string>,
  ) => {
    const status = await getOnboardingStatus(userId);
    const acceptedTerms = await finishAuthenticatedTermsCheck(userId, provider);

    if (status === 'Completed') {
      isOnboarding.current = false;
      if (acceptedTerms) {
        router.replace('/(tabs)');
      } else {
        routeToAgreement({ ...params, next: 'tabs' });
      }
      return;
    }

    isOnboarding.current = true;
    const onboardingParams = {
      ...params,
      resumeStep: String(onboardingStatusToStep(status)),
    };

    if (acceptedTerms) {
      routeToSignupFlow(onboardingParams);
    } else {
      routeToAgreement(onboardingParams);
    }
  };


  const handleGoogleSignUp = async () => {
    try {
        isOnboarding.current = true;
        await GoogleSignin.hasPlayServices();
        const userInfo = await GoogleSignin.signIn();
        const idToken = userInfo.data?.idToken;

        if (!idToken) {
          console.log('user rejected');
          isOnboarding.current = false;
          return;
        }

        const { data: authData, error } = await supabase.auth.signInWithIdToken({
          provider: 'google',
          token: idToken,
        });

        if (error || !authData.user) {
          isOnboarding.current = false;
          showSocialAuthError(
            'google',
            'auth.google.sign_in_with_id_token',
            error ?? new Error('No authenticated Google user returned')
          );
          return;
        }

        await routeAuthenticatedUser(authData.user.id, 'google', { method: 'google' });
    } catch (error) {
      isOnboarding.current = false;
      showSocialAuthError('google', 'auth.google.sign_up', error);
    }
};

  const handleAppleSignUp = async () => {
    try {
      isOnboarding.current = true;
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
        nonce: hashedNonce,
      });

      const appleCredentialName = [credential.fullName?.givenName, credential.fullName?.familyName]
        .filter(Boolean)
        .join(' ')
        .trim();

      if (!credential.identityToken) {
        isOnboarding.current = false;
        showSocialAuthError(
          'apple',
          'auth.apple.missing_identity_token',
          new Error('Missing identity token')
        );
        return;
      }

      const { data: authData, error } = await supabase.auth.signInWithIdToken({
        provider: 'apple',
        token: credential.identityToken,
        nonce: rawNonce,
      });

      if (error || !authData.user) {
        isOnboarding.current = false;
        showSocialAuthError(
          'apple',
          'auth.apple.sign_in_with_id_token',
          error ?? new Error('No authenticated Apple user returned')
        );
        return;
      }

      try {
        await storeAppleAuthorizationCode(credential.authorizationCode);
      } catch (captureError) {
        await supabase.auth.signOut({ scope: 'local' });
        throw captureError;
      }

      const metadata = authData.user?.user_metadata ?? {};
      const metadataName = [metadata.given_name, metadata.family_name]
        .filter((part): part is string => typeof part === 'string' && part.trim().length > 0)
        .join(' ')
        .trim();
      const appleDisplayName =
        appleCredentialName ||
        metadataName ||
        (typeof metadata.full_name === 'string' ? metadata.full_name.trim() : '') ||
        (typeof metadata.name === 'string' ? metadata.name.trim() : '') ||
        (typeof metadata.display_name === 'string' ? metadata.display_name.trim() : '');
      const appleEmail = credential.email?.trim() || authData.user?.email?.trim() || '';

      const appleParams = {
        method: 'apple',
        providerName: appleDisplayName,
        providerEmail: appleEmail,
      };

      await routeAuthenticatedUser(authData.user.id, 'apple', appleParams);
    } catch (error: any) {
      isOnboarding.current = false;
      showSocialAuthError('apple', 'auth.apple.sign_up', error);
    }
  };


  const handleEmailSignUp = async () => {
    if (await hasUnboundLocalTermsAcceptance()) {
      routeToSignupFlow({ method: 'email' });
      return;
    }

    routeToAgreement({ method: 'email' });
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
              <Text style={styles.loginTxt}>Already a member? <Text onPress={() => router.replace('/(auth)/login')} style={styles.login}>Log in</Text></Text>
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
