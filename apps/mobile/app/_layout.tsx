import 'react-native-reanimated';
import { useEffect, useState, useRef } from 'react';
import { isOnboarding, supabase } from '@/context/AuthContext';
import { Slot, useRouter } from 'expo-router';
import type { Session } from '@supabase/supabase-js';
import { GameTicketsProvider } from '@/context/GameTicketsContext';
import { GameProvider } from '@/context/GameContext';
import * as SplashScreen from 'expo-splash-screen';

SplashScreen.preventAutoHideAsync();

async function userHasAcceptedTerms(session: Session | null): Promise<boolean> {
    const userId = session?.user?.id;

    if (!userId) {
        return false;
    }

    const { data, error } = await supabase
        .from('users')
        .select('accepted_terms')
        .eq('id', userId)
        .maybeSingle();

    if (error) {
        console.log('Error checking accepted terms:', error.message);
        return false;
    }

    return data?.accepted_terms === true;
}

export default function RootLayout() {
    const [session, setSession] = useState<boolean | null>(null);
    const router = useRouter();
    const splashHidden = useRef(false);

    useEffect(() => {
        supabase.auth.getSession().then(async ({ data: { session } }) => {
            if (!session) {
                setSession(false);
                return;
            }

            const acceptedTerms = await userHasAcceptedTerms(session);
            setSession(acceptedTerms);
        });

        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            if (event === 'SIGNED_IN') {
                if (isOnboarding.current) return;

                setTimeout(async () => {
                    const acceptedTerms = await userHasAcceptedTerms(session);

                    if (!acceptedTerms) {
                        return;
                    }

                    setSession(true);
                }, 0);

                return;
            }

            if (event === 'SIGNED_OUT') {
                setSession(false);
                router.replace('/(auth)/SignUp')
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