<<<<<<< HEAD
import 'react-native-reanimated';
import { useEffect, useState, useRef } from 'react';
import { isOnboarding, supabase } from '@/context/AuthContext';
import { Slot, useRouter } from 'expo-router';
import { GameTicketsProvider } from '@/context/GameTicketsContext';
import { GameProvider } from '@/context/GameContext';
import * as SplashScreen from 'expo-splash-screen';
=======
import 'react-native-url-polyfill/auto';

import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { GameProvider } from '@/context/GameContext';
import { GameTicketsProvider } from '@/context/GameTicketsContext';
import { AuthProvider } from '@/context/AuthContext';
import { OnboardingProvider } from '@/context/OnboardingContext';


export const unstable_settings = {
  anchor: '(tabs)',
};

const colorScheme = useColorScheme();
>>>>>>> 9b8c7f1e84da425159ef2248069f713aa8930bd6

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
<<<<<<< HEAD
    const [session, setSession] = useState<boolean | null>(null);
    const router = useRouter();
    const splashHidden = useRef(false);
    const isInitialLoad = useRef(true); // ✅ tracks if this is the first session check

    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            setSession(!!session);
            isInitialLoad.current = false;
        });

        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            if (event === 'SIGNED_IN') {
                if (isOnboarding.current) return;
                setSession(true)
                return;
            }

            // ✅ Only redirect on SIGNED_OUT (logout) or initial session restore
            if (event === 'SIGNED_OUT') {
                setSession(false);
                router.replace('/SignUp')
            }
        });

        return () => subscription.unsubscribe();
    }, []);

    useEffect(() => {
        if (session === null) return;

        const navigate = async () => {
            if (!splashHidden.current) {
                splashHidden.current = true;
                await SplashScreen.hideAsync();
            }

            if (session) {
                router.replace('/(tabs)');
            } else {
                router.replace('/(auth)/SignUp');
            }
        };

        navigate();
    }, [session]);

    if (session === null) return null;

    return (
        <GameProvider>
            <GameTicketsProvider>
                <Slot />
            </GameTicketsProvider>
        </GameProvider>
    );
}
=======
  return (
    <AuthProvider>
      <OnboardingProvider>
        <GameProvider>
          <GameTicketsProvider>
            <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
              <Stack>
                <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
              </Stack>
              <StatusBar style="auto" />
            </ThemeProvider>
          </GameTicketsProvider>
        </GameProvider>
      </OnboardingProvider>
    </AuthProvider>
  );
}
>>>>>>> 9b8c7f1e84da425159ef2248069f713aa8930bd6
