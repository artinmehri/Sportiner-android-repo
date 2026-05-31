import 'react-native-reanimated';
import { useEffect, useState, useRef } from 'react';
import { isOnboarding, supabase } from '@/context/AuthContext';
import { Slot, useRouter } from 'expo-router';
import { GameTicketsProvider } from '@/context/GameTicketsContext';
import { GameProvider } from '@/context/GameContext';
import * as SplashScreen from 'expo-splash-screen';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
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
