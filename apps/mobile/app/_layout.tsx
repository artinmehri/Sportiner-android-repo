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


export default function RootLayout() {
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
