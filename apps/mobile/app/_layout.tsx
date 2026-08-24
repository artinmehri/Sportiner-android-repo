import 'react-native-reanimated';
import { useEffect, useState, useRef } from 'react';
import { Alert, Linking, Platform } from 'react-native';
import * as Application from 'expo-application';
import {
    getOnboardingStatus,
    onboardingStatusToStep,
    isOnboarding,
    isPasswordRecovery,
    supabase,
} from '@/context/AuthContext';
import { Stack, useRouter } from 'expo-router';
import type { Session } from '@supabase/supabase-js';
import { GameTicketsProvider } from '@/context/GameTicketsContext';
import { GameProvider } from '@/context/GameContext';
import { LatestLocationProvider } from '@/context/LatestLocationContext';
import { NotificationProvider } from '@/context/NotificationContext';
import { UnreadMessagesProvider } from '@/context/UnreadMessagesContext';
import { MessagesProvider } from '@/context/MessagesContext';
import { HostedGameJoinsProvider } from '@/context/HostedGameJoinsContext';
import { OnlinePresenceProvider } from '@/context/OnlinePresenceContext';
import * as SplashScreen from 'expo-splash-screen';
import {
    hasCurrentLocalTermsAcceptance,
    hasLocalTermsAcceptanceForUser,
    persistTermsAcceptanceForUser,
    userHasAcceptedCurrentTerms,
} from '@/lib/termsAcceptance';
import { inboundDeepLinkPath, resolveStartupRoute } from '@/lib/startupDeepLink';
import { isAppUpdateAvailable, shouldStartUpdateCheck } from '@/lib/appUpdate';
import { APP_STORE_URL } from '@/constants/appStore';

SplashScreen.preventAutoHideAsync().catch(() => {});

const STARTUP_STEP_TIMEOUT_MS = 5_000;
const STARTUP_FALLBACK_TIMEOUT_MS = 8_000;
type InitialRoute =
    | 'agreement-signup'
    | 'agreement-tabs'
    | 'agreement-onboarding'
    | 'signup'
    | 'onboarding'
    | 'tabs'
    | 'password-reset'
    | 'game-link';

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
    const [initialRoute, setInitialRoute] = useState<InitialRoute | null>(null);
    const [initialNavigationComplete, setInitialNavigationComplete] = useState(false);
    const [authUserId, setAuthUserId] = useState<string | null>(null);
    const [onboardingStep, setOnboardingStep] = useState(1);
    const router = useRouter();
    const routerRef = useRef(router);
    routerRef.current = router;
    const splashHidden = useRef(false);
    const startupHasGameLink = useRef(false);
    const pendingGameLinkPath = useRef<string | null>(null);
    const updateCheckStarted = useRef(false);

    useEffect(() => {
        let isMounted = true;
        let startupFallback: ReturnType<typeof setTimeout> | undefined;

        const rememberGameLink = (url: string | null): string | null => {
            const path = inboundDeepLinkPath(url);
            if (!path) {
                return null;
            }

            pendingGameLinkPath.current = path;
            startupHasGameLink.current = true;
            return path;
        };

        const chooseInitialRoute = (route: InitialRoute) => {
            if (!isMounted) {
                return;
            }

            if (startupFallback) {
                clearTimeout(startupFallback);
            }

            setInitialRoute((currentRoute) =>
                resolveStartupRoute(route, currentRoute, startupHasGameLink.current),
            );
        };

        const chooseOnboardingRoute = (status: string | null | undefined) => {
            setOnboardingStep(onboardingStatusToStep(status));
            chooseInitialRoute('onboarding');
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
                rememberGameLink(initialUrl);

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
                    // Keep /g/[id] when Expo Router already opened the shared link for a signed-out user.
                    chooseInitialRoute(
                        startupHasGameLink.current
                            ? 'game-link'
                            : hasSeenTerms
                              ? 'signup'
                              : 'agreement-signup',
                    );
                    return;
                }

                setAuthUserId(session.user.id);
                const acceptedTerms = await userHasAcceptedTerms(session);
                const onboardingStatus = await getOnboardingStatus(session.user.id);
                if (!acceptedTerms) {
                    setOnboardingStep(onboardingStatusToStep(onboardingStatus));
                    chooseInitialRoute(
                        onboardingStatus === 'Completed'
                            ? 'agreement-tabs'
                            : 'agreement-onboarding',
                    );
                } else if (onboardingStatus === 'Completed') {
                    chooseInitialRoute(
                        startupHasGameLink.current ? 'game-link' : 'tabs',
                    );
                } else {
                    chooseOnboardingRoute(onboardingStatus);
                }
            } catch (error) {
                console.warn('Unable to initialize the app:', error);
                chooseInitialRoute('agreement-signup');
            }
        };

        void restoreInitialRoute();

        const linkingSubscription = Linking.addEventListener('url', async ({ url }) => {
            const gamePath = rememberGameLink(url);
            if (gamePath) {
                // Explicitly open the shared game even if a prior startup navigation
                // already replaced Expo Router away from the incoming /g route.
                setInitialRoute('game-link');
                routerRef.current.replace(gamePath as never);
                return;
            }

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
                    const onboardingStatus = session?.user?.id
                        ? await getOnboardingStatus(session.user.id)
                        : 'Not Started';

                    if (!acceptedTerms) {
                        setOnboardingStep(onboardingStatusToStep(onboardingStatus));
                        setInitialRoute(
                            onboardingStatus === 'Completed'
                                ? 'agreement-tabs'
                                : 'agreement-onboarding',
                        );
                        return;
                    }

                    if (onboardingStatus !== 'Completed') {
                        setOnboardingStep(onboardingStatusToStep(onboardingStatus));
                        setInitialRoute('onboarding');
                        return;
                    }

                    chooseInitialRoute(startupHasGameLink.current ? 'game-link' : 'tabs');
                }, 0);

                return;
            }

            if (event === 'SIGNED_OUT') {
                isOnboarding.current = false;
                isPasswordRecovery.current = false;
                startupHasGameLink.current = false;
                pendingGameLinkPath.current = null;
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
        if (!shouldStartUpdateCheck(
            Platform.OS,
            initialNavigationComplete,
            updateCheckStarted.current,
        )) {
            return;
        }

        updateCheckStarted.current = true;

        const checkForUpdate = async () => {
            const updateAvailable = await isAppUpdateAvailable(
                Application.nativeApplicationVersion,
            );
            if (!updateAvailable) return;

            Alert.alert(
                'A new Sportiner update is available 🎾',
                "We've made some improvements. Update Sportiner to get the latest version.",
                [
                    { text: 'Later', style: 'cancel' },
                    {
                        text: 'Update',
                        onPress: () => {
                            void Linking.openURL(APP_STORE_URL).catch((error) => {
                                console.warn('Could not open Sportiner on the App Store', error);
                                Alert.alert(
                                    'App Store unavailable',
                                    'We could not open Sportiner on the App Store. Please try again later.',
                                );
                            });
                        },
                    },
                ],
            );
        };

        void checkForUpdate();
    }, [initialNavigationComplete]);

    useEffect(() => {
        if (initialRoute === null) return;

        let isCancelled = false;

        const navigate = async () => {
            try {
                setInitialNavigationComplete(false);
                if (initialRoute === 'game-link') {
                    const path = pendingGameLinkPath.current;
                    if (path) {
                        router.replace(path as never);
                    }
                    // If Expo Router already holds /g/[id] and we only know a boolean flag,
                    // leave the current route alone rather than bouncing to tabs.
                } else if (initialRoute === 'tabs') {
                    if (startupHasGameLink.current && pendingGameLinkPath.current) {
                        router.replace(pendingGameLinkPath.current as never);
                    } else {
                        router.replace('/(tabs)');
                    }
                } else if (initialRoute === 'password-reset') {
                    router.replace('/(auth)/reset-password' as never);
                } else if (initialRoute === 'signup') {
                    router.replace('/(auth)/SignUp');
                } else if (initialRoute === 'onboarding') {
                    router.replace({
                        pathname: '/(auth)/SignupFlow' as never,
                        params: { resumeStep: String(onboardingStep) },
                    });
                } else {
                    router.replace({
                        pathname: '/(auth)/user-agreement' as never,
                        params: {
                            next:
                                initialRoute === 'agreement-tabs'
                                    ? 'tabs'
                                    : initialRoute === 'agreement-onboarding'
                                      ? 'onboarding'
                                      : 'signup',
                            ...(initialRoute === 'agreement-onboarding'
                                ? { resumeStep: String(onboardingStep) }
                                : {}),
                        },
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
    }, [initialRoute, onboardingStep, router]);

    if (initialRoute === null) return null;

    return (
        <OnlinePresenceProvider userId={authUserId}>
            <LatestLocationProvider userId={authUserId}>
                <NotificationProvider
                    navigationReady={initialNavigationComplete}
                    userId={authUserId}
                >
                    <GameProvider key={authUserId ?? 'signed-out'}>
                        <UnreadMessagesProvider>
                            <MessagesProvider>
                                <HostedGameJoinsProvider>
                                    <GameTicketsProvider key={authUserId ?? 'signed-out'}>
                                        {/* Conversations push onto the stack, so each chat is
                                            its own screen instance instead of one reused tab. */}
                                        <Stack
                                            screenOptions={{
                                                headerShown: false,
                                                animation: 'none',
                                                gestureEnabled: false,
                                            }}
                                        >
                                            <Stack.Screen
                                                name="chat/[id]"
                                                options={{
                                                    animation: 'slide_from_right',
                                                    gestureEnabled: true,
                                                }}
                                            />
                                            <Stack.Screen
                                                name="groupchat/[id]"
                                                options={{
                                                    animation: 'slide_from_right',
                                                    gestureEnabled: true,
                                                }}
                                            />
                                        </Stack>
                                    </GameTicketsProvider>
                                </HostedGameJoinsProvider>
                            </MessagesProvider>
                        </UnreadMessagesProvider>
                    </GameProvider>
                </NotificationProvider>
            </LatestLocationProvider>
        </OnlinePresenceProvider>
    );
}
