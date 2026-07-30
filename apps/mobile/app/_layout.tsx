import 'react-native-reanimated';
import { useEffect, useState, useRef } from 'react';
import { Linking } from 'react-native';
import { isOnboarding, isPasswordRecovery, supabase } from '@/context/AuthContext';
import { Slot, useRouter } from 'expo-router';
import type { Session } from '@supabase/supabase-js';
import { GameTicketsProvider } from '@/context/GameTicketsContext';
import { GameProvider } from '@/context/GameContext';
import { LatestLocationProvider } from '@/context/LatestLocationContext';
import { NotificationProvider } from '@/context/NotificationContext';
import { UnreadMessagesProvider } from '@/context/UnreadMessagesContext';
import * as SplashScreen from 'expo-splash-screen';
import {
    hasCurrentLocalTermsAcceptance,
    hasLocalTermsAcceptanceForUser,
    persistTermsAcceptanceForUser,
    userHasAcceptedCurrentTerms,
} from '@/lib/termsAcceptance';

SplashScreen.preventAutoHideAsync().catch(() => {});

const STARTUP_STEP_TIMEOUT_MS = 5_000;
const STARTUP_FALLBACK_TIMEOUT_MS = 8_000;
type InitialRoute = 'agreement-signup' | 'agreement-tabs' | 'signup' | 'tabs' | 'password-reset';

async function withTimeout<T>(promise: PromiseLike<T>, timeoutMs: number): Promise<T | null> {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    try {
        return await Promise.race([
            Promise.resolve(promise),
            new Promise<null>((resolve) => {
                timeoutId = setTimeout(() => resolve(null), timeoutMs);
            }),
        ]);
    } finally {
        if (timeoutId) {
            clearTimeout(timeoutId);
        }
    }
}

function decodeParam(value: string): string {
    return decodeURIComponent(value.replace(/\+/g, ' '));
}

function parseAuthParams(url: string | null): Record<string, string> {
    if (!url) return {};

    const params: Record<string, string> = {};
    const query = url.includes('?') ? url.split('?')[1].split('#')[0] : '';
    const hash = url.includes('#') ? url.split('#')[1] : '';

    [query, hash].forEach((part) => {
        part
            .split('&')
            .filter(Boolean)
            .forEach((pair) => {
                const [key, ...valueParts] = pair.split('=');
                if (!key) return;

                params[decodeParam(key)] = decodeParam(valueParts.join('='));
            });
    });

    return params;
}

function isPasswordResetUrl(url: string | null): boolean {
    if (!url) {
        return false;
    }

    return url.includes('reset-password') || url.includes('type=recovery');
}

async function handlePasswordResetUrl(url: string | null): Promise<boolean> {
    if (!url) return false;

    const params = parseAuthParams(url);

    if (params.error || params.error_description) {
        console.log('Password reset link error:', params.error_description ?? params.error);
        return false;
    }

    if (params.access_token && params.refresh_token) {
        const { error } = await supabase.auth.setSession({
            access_token: params.access_token,
            refresh_token: params.refresh_token,
        });

        if (error) {
            console.log('Unable to set password recovery session:', error.message);
            return false;
        }
        return true;
    }

    if (params.code) {
        const { error } = await supabase.auth.exchangeCodeForSession(params.code);

        if (error) {
            console.log('Unable to exchange password recovery code:', error.message);
            return false;
        }
        return true;
    }

    return false;
}

async function userHasAcceptedTerms(session: Session | null): Promise<boolean> {
    const userId = session?.user?.id;

    if (!userId) {
        return false;
    }

    const backendAcceptance = await withTimeout(
        userHasAcceptedCurrentTerms(userId),
        STARTUP_STEP_TIMEOUT_MS,
    );

    if (backendAcceptance === true) return true;

    const localAcceptance = await hasLocalTermsAcceptanceForUser(userId);
    if (!localAcceptance) return false;

    return persistTermsAcceptanceForUser(userId);
}

export default function RootLayout() {
<<<<<<< HEAD
    const [initialRoute, setInitialRoute] = useState<InitialRoute | null>(null);
    const [initialNavigationComplete, setInitialNavigationComplete] = useState(false);
    const [authUserId, setAuthUserId] = useState<string | null>(null);
    const router = useRouter();
    const splashHidden = useRef(false);

    useEffect(() => {
        let isMounted = true;
        let startupFallback: ReturnType<typeof setTimeout> | undefined;

        const chooseInitialRoute = (route: InitialRoute) => {
            if (isMounted) {
                if (startupFallback) {
                    clearTimeout(startupFallback);
                }
                setInitialRoute((currentRoute) => currentRoute ?? route);
            }
        };

        startupFallback = setTimeout(() => {
            console.warn('Startup timed out; continuing to the agreement screen.');
            chooseInitialRoute('agreement-signup');
        }, STARTUP_FALLBACK_TIMEOUT_MS);

        const restoreInitialRoute = async () => {
            try {
                const initialUrl = await withTimeout(
                    Linking.getInitialURL(),
                    STARTUP_STEP_TIMEOUT_MS,
                );

                if (isPasswordResetUrl(initialUrl)) {
                    isPasswordRecovery.current = true;
                    const exchangeSuccess = await handlePasswordResetUrl(initialUrl);
                    if (exchangeSuccess) {
                        chooseInitialRoute('password-reset');
                    } else {
                        chooseInitialRoute('signup');
                    }
                    return;
                }

                const sessionResult = await withTimeout(
                    supabase.auth.getSession(),
                    STARTUP_STEP_TIMEOUT_MS,
                );

                if (!sessionResult) {
                    console.warn('Session restoration timed out.');
                    chooseInitialRoute('agreement-signup');
                    return;
                }

                if (sessionResult.error) {
                    console.warn('Unable to restore session:', sessionResult.error.message);
                    chooseInitialRoute('agreement-signup');
                    return;
                }

                const session = sessionResult.data.session;
                if (!session) {
                    setAuthUserId(null);
                    const hasSeenTerms = await hasCurrentLocalTermsAcceptance();
                    chooseInitialRoute(hasSeenTerms ? 'signup' : 'agreement-signup');
                    return;
                }

                setAuthUserId(session.user.id);
                const acceptedTerms = await userHasAcceptedTerms(session);
                chooseInitialRoute(acceptedTerms ? 'tabs' : 'agreement-tabs');
            } catch (error) {
                console.warn('Unable to initialize the app:', error);
                chooseInitialRoute('agreement-signup');
            }
        };

        void restoreInitialRoute();

        const linkingSubscription = Linking.addEventListener('url', async ({ url }) => {
            if (isPasswordResetUrl(url)) {
                isPasswordRecovery.current = true;
                const exchangeSuccess = await handlePasswordResetUrl(url);
                if (exchangeSuccess) {
                    setInitialRoute('password-reset');
                } else {
                    setInitialRoute('signup');
                }
            }
        });

        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            if (event === 'PASSWORD_RECOVERY') {
                isPasswordRecovery.current = true;
                setInitialRoute('password-reset');
                return;
            }

            if (event === 'SIGNED_IN') {
                setAuthUserId(session?.user.id ?? null);
                if (isOnboarding.current || isPasswordRecovery.current) return;

                setTimeout(async () => {
                    const acceptedTerms = await userHasAcceptedTerms(session);

                    if (!acceptedTerms) {
                        setInitialRoute('agreement-tabs');
                        return;
                    }

                    setInitialRoute('tabs');
                }, 0);

                return;
            }

            if (event === 'SIGNED_OUT') {
                isOnboarding.current = false;
                isPasswordRecovery.current = false;
                setAuthUserId(null);
                setInitialRoute('signup');
            }
        });

        return () => {
            isMounted = false;
            if (startupFallback) {
                clearTimeout(startupFallback);
            }
            linkingSubscription.remove();
            subscription.unsubscribe();
        };
    }, []);

    useEffect(() => {
        if (initialRoute === null) return;

        let isCancelled = false;

        const navigate = async () => {
            try {
                setInitialNavigationComplete(false);
                if (initialRoute === 'tabs') {
                    router.replace('/(tabs)');
                } else if (initialRoute === 'password-reset') {
                    router.replace('/(auth)/reset-password' as never);
                } else if (initialRoute === 'signup') {
                    router.replace('/(auth)/SignUp');
                } else {
                    router.replace({
                        pathname: '/(auth)/user-agreement' as never,
                        params: { next: initialRoute === 'agreement-tabs' ? 'tabs' : 'signup' },
                    });
                }

                await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
                if (!isCancelled) {
                    setInitialNavigationComplete(true);
                }
            } catch (error) {
                console.warn('Initial navigation failed:', error);
            } finally {
                if (!isCancelled && !splashHidden.current) {
                    splashHidden.current = true;
                    await SplashScreen.hideAsync().catch((error) => {
                        console.warn('Unable to hide splash screen:', error);
                    });
                }
            }
        };

        void navigate();

        return () => {
            isCancelled = true;
        };
    }, [initialRoute, router]);

    if (initialRoute === null) return null;

    return (
        <LatestLocationProvider userId={authUserId}>
            <NotificationProvider
                navigationReady={initialNavigationComplete}
                userId={authUserId}
            >
                <GameProvider key={authUserId ?? 'signed-out'}>
                    <UnreadMessagesProvider>
                        <GameTicketsProvider key={authUserId ?? 'signed-out'}>
                            <Slot />
                        </GameTicketsProvider>
                    </UnreadMessagesProvider>
                </GameProvider>
            </NotificationProvider>
        </LatestLocationProvider>
    );
}
