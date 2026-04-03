import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Redirect, Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { GameProvider } from '@/context/GameContext';
import { GameTicketsProvider } from '@/context/GameTicketsContext';
import { AuthProvider } from '@/context/AuthContext';


export const unstable_settings = {
  anchor: '(tabs)',
};

const colorScheme = useColorScheme();


export default function RootLayout() {
  return (
    <AuthProvider>
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
    </AuthProvider>
  );
}
