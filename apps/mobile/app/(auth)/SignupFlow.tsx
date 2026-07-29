import { useEffect, useRef, useState } from "react";
import FirstOnbPage from "./firstOnbPage";
import SecondOnbPage from "./secondOnbPage";
import ThirdOnbPage from "./thirdOnbPage";
import FourthOnbPage from "./fourthOnbPage";
import FifthOnbPage from "./fifthOnbPage";
import { supabase, isOnboarding } from "@/context/AuthContext";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Alert } from "react-native";
import { decode } from 'base64-arraybuffer';
import { joinGame, type JoinResult } from "@/lib/gamesDb";
import {
    bindLocalTermsAcceptanceToUser,
    hasUnboundLocalTermsAcceptance,
    persistTermsAcceptanceForUser,
} from "@/lib/termsAcceptance";
import {
    logOnboardingError,
    onboardingErrorCopy,
    OnboardingFlowError,
    providerFromMethod,
    toOnboardingError,
    type OnboardingFailure,
} from "@/lib/onboardingErrors";
import SixthOnbPage from "./sixthOnbPage";
import SeventhOnbPage from "./seventhOnbPage";
import OnboardingGameConfirm, {
    type OnboardingJoinConfirmation,
} from "./onboardingGameConfirm";
import { FAVORITE_PARK_OPTIONS } from "@/lib/favoriteParks";

type SignupNotificationPermission =
    | 'granted'
    | 'skipped'
    | 'unsupported-platform'
    | 'not-a-device'
    | 'permission-not-requested'
    | 'permission-denied'
    | 'missing-project-id'
    | 'not-authenticated'
    | 'registration-failed';

type SignupData = {
    name: string;
    profile_picture: string | null;
    profile_picture_preview?: string | null;
    email: string;
    password: string;
    age_group: string;
    level: string;
    availability: string[];
    city: string;
    last_active_at: string;
    elo: number;
    id: string;
    created_at: string;
    gamesPlayed: number;
    reliability_score: number;
    method?: string;
    location?: {
        lat: number;
        lng: number;
    } | null;
    location_permission?: 'granted' | 'denied' | 'skipped';
    notifications_permission?: SignupNotificationPermission;
    favorite_park?: string | null;
    onboarding_join_candidate?: {
        gameId: string;
        title: string;
        date: string;
        location_name: string;
        players_enrolled: number;
        capacity: number;
        image?: string | null;
    } | null;
};

export default function SignupFlow() {
    const { method, providerName, providerEmail } = useLocalSearchParams();
    const router = useRouter()

    const [step, setStep] = useState(1);
    const [formData, setFormData] = useState<SignupData>({
        name: '',
        profile_picture: null,
        email: '',
        password: '',
        age_group: '',
        level: '',
        availability: [],
        city: '',
        last_active_at: '',
        elo: 0,
        id: '',
        created_at: '',
        gamesPlayed: 0,
        reliability_score: 75,
        method: method as string | undefined,
        location: null,
    })
    const [termsVerified, setTermsVerified] = useState(false);
    const [joinConfirmation, setJoinConfirmation] =
        useState<OnboardingJoinConfirmation | null>(null);
    const preparedUserId = useRef<string | null>(null);
    const joinCandidateRef = useRef<SignupData['onboarding_join_candidate']>(null);
    const finalActionInFlight = useRef(false);
    const signupProvider = providerFromMethod(method ?? 'email');

    useEffect(() => {
        let active = true;
        setTermsVerified(false);

        const verifyAgreement = async () => {
            const signupMethod = method ? String(method) : 'email';
            let hasAcceptedTerms = await hasUnboundLocalTermsAcceptance();

            if (signupMethod !== 'email') {
                const { data } = await supabase.auth.getUser();
                hasAcceptedTerms = data.user
                    ? await bindLocalTermsAcceptanceToUser(data.user.id)
                    : false;
            }

            if (!active) {
                return;
            }

            if (!hasAcceptedTerms) {
                router.replace({
                    pathname: '/(auth)/user-agreement' as never,
                    params: {
                        ...(method ? { method: String(method) } : {}),
                        ...(providerName ? { providerName: String(providerName) } : {}),
                        ...(providerEmail ? { providerEmail: String(providerEmail) } : {}),
                    },
                });
                return;
            }

            setTermsVerified(true);
            isOnboarding.current = true;
        };

        verifyAgreement();

        return () => {
            active = false;
            isOnboarding.current = false;
        };
    }, [method, providerName, providerEmail, router]);

    useEffect(() => {
        if (method === 'apple') {
            setFormData((prev) => ({
                ...prev,
                name: providerName ? String(providerName) : prev.name,
                email: providerEmail ? String(providerEmail) : prev.email,
                method: 'apple',
            }));
        } else if (method === 'google') {
            setFormData((prev) => ({
                ...prev,
                method: 'google',
            }));
        }
    }, [method, providerName, providerEmail]);

    const handleBack = () => {
        if (step === 1) {
            router.back();
            return;
        }

        // Account creation happens at the end of step 4. After that, only allow
        // returning within post-account steps (park → notifications → games).
        if (preparedUserId.current && step <= 5) {
            return;
        }

        setStep(step - 1);
    };


    const handleImageUpload = async (userId: string, base64String: string) => {
        try {
            const isPng = base64String.startsWith('data:image/png');
            const contentType = isPng ? 'image/png' : 'image/jpeg';
            const fileExtension = isPng ? 'png' : 'jpg';
            const filePath = `${userId}/avatar_${Date.now()}.${fileExtension}`;

            // Strip data URI prefix if present
            const base64Data = base64String.includes('base64,')
                ? base64String.split('base64,')[1]
                : base64String;

            const { data, error } = await supabase.storage
                .from('files')
                .upload(filePath, decode(base64Data), {
                    contentType,
                    upsert: true,
                });

            if (error) {
                throw error;
            }

            const { data: urlData } = supabase.storage
                .from('files')
                .getPublicUrl(filePath);

            const publicUrl = urlData.publicUrl;

            const { error: dbError } = await supabase.from('users')
                .update({
                    profile_picture: publicUrl,
                })
                .eq('id', userId);

            if (dbError) {
                throw dbError;
            }

            console.log('image successfully updated!');
            setFormData((prev) => ({ ...prev, profile_picture: publicUrl }));

            return data.path;
        } catch (err) {
            console.log(err);
            throw err;
        }
    };


    type SignupResult = {
        success: boolean;
        userId?: string;
    };

    function onboardingJoinFailure(result: JoinResult): OnboardingFailure | null {
        switch (result) {
            case 'joined':
            case 'requested':
                return null;
            case 'already_member':
                return 'already_joined';
            case 'already_requested':
                return 'already_requested';
            case 'full':
                return 'game_full';
            case 'not_found':
                return 'game_unavailable';
            case 'not_authenticated':
                return 'session';
            case 'not_configured':
                return 'configuration';
            default:
                return 'game_join';
        }
    }

    const isInvalidCredentialsError = (message: string | undefined) => {
        const normalized = message?.toLowerCase() ?? '';
        return normalized.includes('invalid login credentials') || normalized.includes('invalid credentials');
    };

    async function waitForSession(userId: string) {
        for (let attempt = 0; attempt < 6; attempt += 1) {
            const { data, error } = await supabase.auth.getSession();
            if (!error && data.session?.user.id === userId) {
                return data.session;
            }

            await new Promise((resolve) => setTimeout(resolve, 150));
        }

        return null;
    }

    async function getEmailUser() {
        const email = formData.email.trim().toLowerCase();
        const password = formData.password;

        const { data: sessionData } = await supabase.auth.getSession();
        if (
            sessionData.session?.user &&
            sessionData.session.user.email?.toLowerCase() === email
        ) {
            return sessionData.session.user;
        }

        // A prior attempt may have created the auth account before profile setup failed.
        // Recover that account first instead of repeatedly calling signUp.
        const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
            email,
            password,
        });

        if (!signInError && signInData.user && signInData.session) {
            return signInData.user;
        }

        if (signInError && !isInvalidCredentialsError(signInError.message)) {
            throw toOnboardingError(
                { failure: 'account_creation', provider: 'email', source: 'auth.email.recover_sign_in' },
                signInError
            );
        }

        const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
            email,
            password,
            options: {
                data: {
                    display_name: formData.name,
                    last_active_at: new Date().toISOString(),
                },
            },
        });

        if (signUpError) {
            throw toOnboardingError(
                { failure: 'account_creation', provider: 'email', source: 'auth.email.sign_up' },
                signUpError
            );
        }

        // Supabase can return an obfuscated user for an email that already exists.
        if (signUpData.user?.identities?.length === 0) {
            throw new OnboardingFlowError({
                failure: 'account_exists',
                provider: 'email',
                source: 'auth.email.sign_up',
            });
        }

        if (!signUpData.user) {
            throw new OnboardingFlowError({
                failure: 'account_creation',
                provider: 'email',
                source: 'auth.email.sign_up_missing_user',
            });
        }

        if (!signUpData.session) {
            const { data: retryData, error: retryError } = await supabase.auth.signInWithPassword({
                email,
                password,
            });

            if (retryError || !retryData.user || !retryData.session) {
                throw toOnboardingError(
                    { failure: 'account_creation', provider: 'email', source: 'auth.email.session_recovery' },
                    retryError
                );
            }

            return retryData.user;
        }

        return signUpData.user;
    }

    async function addData(): Promise<SignupResult> {
        try {
            const isEmailSignup = !method || method === 'email';
            let user;
            if (isEmailSignup) {
                user = await getEmailUser();
            } else {
                const { data, error } = await supabase.auth.getUser();
                if (error) {
                    throw toOnboardingError(
                        { failure: 'session', provider: signupProvider, source: 'auth.social.get_user' },
                        error
                    );
                }
                user = data.user;
            }

            if (!user) {
                throw new OnboardingFlowError({
                    failure: 'session',
                    provider: signupProvider,
                    source: 'auth.session.missing_user',
                });
            }

            const currentSession = await waitForSession(user.id);
            if (!currentSession) {
                throw new OnboardingFlowError({
                    failure: 'session',
                    provider: signupProvider,
                    source: 'auth.session.wait',
                });
            }

            const userEmail = user.email ?? (providerEmail ? String(providerEmail) : formData.email.trim());

            if (!formData.name.trim()) {
                throw new OnboardingFlowError({
                    failure: 'profile_save',
                    provider: signupProvider,
                    source: 'profile.validation.display_name',
                });
            }

            if (!userEmail.trim()) {
                throw new OnboardingFlowError({
                    failure: 'profile_save',
                    provider: signupProvider,
                    source: 'profile.validation.email',
                });
            }

            let elo = 400;

            if (formData.level === 'intermediate') {
                elo = 800;
            } else if (formData.level === 'advanced') {
                elo = 1200;
            } else if (formData.level === 'pro') {
                elo = 1600;
            }

            const profilePicture = formData.profile_picture?.startsWith('http')
                ? formData.profile_picture
                : '';

            const { error: dbError } = await supabase.from('users').upsert(
                {
                    id: user.id,
                    name: formData.name.trim(),
                    email: userEmail,
                    age_group: formData.age_group,
                    level: formData.level,
                    availability: formData.availability,
                    profile_picture: profilePicture,
                    city: 'Toronto',
                    elo,
                    last_active_at: new Date().toISOString(),
                    gamesPlayed: 0,
                    reliability_score: 75,
                    accepted_terms: true,
                },
                { onConflict: 'id' }
            );

            if (dbError) {
                throw toOnboardingError(
                    { failure: 'profile_save', provider: signupProvider, source: 'profile.users.upsert' },
                    dbError
                );
            }

            try {
                if (!(await bindLocalTermsAcceptanceToUser(user.id))) {
                    throw new OnboardingFlowError({
                        failure: 'terms_save',
                        provider: signupProvider,
                        source: 'terms.local.bind_user',
                    });
                }

                if (!(await persistTermsAcceptanceForUser(user.id))) {
                    throw new OnboardingFlowError({
                        failure: 'terms_save',
                        provider: signupProvider,
                        source: 'terms.users.persist',
                    });
                }
            } catch (error) {
                throw toOnboardingError(
                    { failure: 'terms_save', provider: signupProvider, source: 'terms.acceptance.persist' },
                    error
                );
            }

            // Only upload if it's a base64 string (user uploaded), not a default URL
            if (formData.profile_picture && !formData.profile_picture.startsWith('http')) {
                console.log('about to upload the image...');
                try {
                    await handleImageUpload(user.id, formData.profile_picture);
                } catch (err) {
                    throw toOnboardingError(
                        { failure: 'profile_save', provider: signupProvider, source: 'profile.avatar.upload' },
                        err
                    );
                }
            }

            return { success: true, userId: user.id };
        } catch (error) {
            const onboardingError = toOnboardingError(
                { failure: 'account_creation', provider: signupProvider, source: 'onboarding.prepare_final_step' },
                error
            );
            const copy = onboardingErrorCopy(onboardingError);
            logOnboardingError(onboardingError);
            Alert.alert(copy.title, copy.message, [{ text: 'Try Again' }]);
            return { success: false };
        }
    }

    async function prepareFinalStep() {
        if (preparedUserId.current) {
            setStep(5);
            return;
        }

        const result = await addData();
        if (!result.success || !result.userId) {
            return;
        }

        preparedUserId.current = result.userId;
        setStep(5);
    }

    async function saveFavoritePark(favoritePark?: string) {
        const userId = preparedUserId.current;
        if (!userId) {
            throw new OnboardingFlowError({
                failure: 'session',
                provider: signupProvider,
                source: 'onboarding.favorite_park.missing_user',
            });
        }

        const normalizedPark =
            typeof favoritePark === 'string' && favoritePark.trim()
                ? favoritePark.trim()
                : null;

        if (
            normalizedPark &&
            !FAVORITE_PARK_OPTIONS.includes(
                normalizedPark as (typeof FAVORITE_PARK_OPTIONS)[number],
            )
        ) {
            throw new OnboardingFlowError({
                failure: 'profile_save',
                provider: signupProvider,
                source: 'onboarding.favorite_park.invalid',
            });
        }

        const { error } = await supabase
            .from('users')
            .update({ favorite_park: normalizedPark })
            .eq('id', userId);

        if (error) {
            throw toOnboardingError(
                {
                    failure: 'profile_save',
                    provider: signupProvider,
                    source: 'onboarding.favorite_park.update',
                },
                error,
            );
        }

        // Selecting a park opts the user into favorite-park game alerts.
        // Skipping leaves the preference off so they won't get these pushes.
        const { error: prefsError } = await supabase.rpc(
            'update_notification_preferences_v1',
            {
                p_patch: {
                    favourite_park_games: Boolean(normalizedPark),
                },
            },
        );

        if (prefsError) {
            throw toOnboardingError(
                {
                    failure: 'profile_save',
                    provider: signupProvider,
                    source: 'onboarding.favorite_park.preferences',
                },
                prefsError,
            );
        }

        setFormData((current) => ({
            ...current,
            favorite_park: normalizedPark,
        }));
    }

    async function continueAfterFavoritePark(favoritePark?: string) {
        const isSkip = !favoritePark;

        try {
            await saveFavoritePark(favoritePark);
        } catch (error) {
            const parkError = toOnboardingError(
                {
                    failure: 'profile_save',
                    provider: signupProvider,
                    source: 'onboarding.favorite_park.finish',
                },
                error,
            );
            logOnboardingError(parkError);

            if (!isSkip) {
                const copy = onboardingErrorCopy(parkError);
                Alert.alert(copy.title, copy.message, [{ text: 'Try Again' }]);
                return;
            }

            // Skipping must never block continuing onboarding.
            console.warn('Favorite park skip save failed; continuing onboarding', parkError);
        }

        setStep(6);
    }

    async function completeOnboardingToHome() {
        isOnboarding.current = false;
        router.replace('/(tabs)');
    }

    async function completeOnboardingToGame(gameId: string) {
        isOnboarding.current = false;
        router.replace({
            pathname: '/(tabs)/EventDetails',
            params: { id: gameId },
        });
    }

    async function handleSubmit(selectedGameId?: string) {
        if (finalActionInFlight.current) {
            return;
        }

        const userId = preparedUserId.current;
        if (!userId) {
            throw new OnboardingFlowError({
                failure: 'session',
                provider: signupProvider,
                source: 'onboarding.final_step.missing_user',
            });
        }

        // Browse all games — finish without joining.
        if (!selectedGameId) {
            await completeOnboardingToHome();
            return;
        }

        finalActionInFlight.current = true;
        try {
            let joinResult: JoinResult;
            try {
                joinResult = await joinGame(selectedGameId, userId);
            } catch (error) {
                const joinError = toOnboardingError(
                    { failure: 'game_join', provider: signupProvider, source: 'games.join' },
                    error
                );
                logOnboardingError(joinError, { gameId: selectedGameId });
                throw joinError;
            }

            const candidate = joinCandidateRef.current;

            const makeJoinConfirmation = (
                outcome: OnboardingJoinConfirmation['outcome'],
            ): OnboardingJoinConfirmation => {
                return {
                    gameId: selectedGameId,
                    title: candidate?.title || 'Your game',
                    date: candidate?.date || '',
                    location_name: candidate?.location_name || 'Tennis court',
                    players_enrolled: candidate?.players_enrolled ?? 0,
                    capacity: candidate?.capacity ?? 4,
                    outcome,
                    image: candidate?.image ?? null,
                };
            };

            if (joinResult === 'joined' || joinResult === 'already_member') {
                setJoinConfirmation(makeJoinConfirmation('joined'));
                return;
            }

            if (joinResult === 'requested' || joinResult === 'already_requested') {
                setJoinConfirmation(makeJoinConfirmation('requested'));
                return;
            }

            const joinFailure = onboardingJoinFailure(joinResult);

            if (joinFailure) {
                const joinError = new OnboardingFlowError({
                    failure: joinFailure,
                    provider: signupProvider,
                    source: 'games.join.result',
                });
                logOnboardingError(joinError, { gameId: selectedGameId, result: joinResult });
                throw joinError;
            }

            await completeOnboardingToHome();
        } finally {
            finalActionInFlight.current = false;
        }
    }

    const handleSeventhChangeData = (
        value: SignupData | Partial<SignupData> | ((prev: SignupData) => SignupData),
    ) => {
        setFormData((prev) => {
            const next =
                typeof value === 'function' ? value(prev) : { ...prev, ...value };
            if (next.onboarding_join_candidate) {
                joinCandidateRef.current = next.onboarding_join_candidate;
            }
            return next;
        });
    };

    if (!termsVerified) {
        return null;
    }

    if (joinConfirmation) {
        return (
            <OnboardingGameConfirm
                confirmation={joinConfirmation}
                onViewGame={() => {
                    void completeOnboardingToGame(joinConfirmation.gameId);
                }}
                onExploreMore={
                    joinConfirmation.outcome === 'requested'
                        ? () => {
                            void completeOnboardingToHome();
                        }
                        : undefined
                }
            />
        );
    }

    if (step === 1) {
        return (
            <FirstOnbPage
                onNext={() => setStep(2)}
                changeData={setFormData}
                onBack={handleBack}
                method={method as string}
                providerName={providerName as string}
                data={formData}
            />
        );
    }

    if (step === 2) {
        return (
            <SecondOnbPage onNext={() => setStep(3)} changeData={setFormData} onBack={handleBack} data={formData} />
        );
    }

    if (step === 3) {
        return (
            <ThirdOnbPage onNext={() => setStep(4)} changeData={setFormData} onBack={handleBack} data={formData} />
        );
    }

    if (step === 4) {
        return (
            <FourthOnbPage
                onNext={prepareFinalStep}
                onBack={handleBack}
                changeData={setFormData}
                data={formData}
            />
        );
    }

    if (step === 5) {
        return (
            <FifthOnbPage
                onNext={continueAfterFavoritePark}
                onBack={handleBack}
                changeData={setFormData}
                data={formData}
            />
        );
    }

    if (step === 6) {
        return (
            <SixthOnbPage
                onNext={() => setStep(7)}
                onBack={handleBack}
                changeData={setFormData}
                data={formData}
            />
        );
    }

    if (step === 7) {
        return (
            <SeventhOnbPage
                onNext={handleSubmit}
                changeData={handleSeventhChangeData}
                onBack={handleBack}
                data={formData}
            />
        );
    }

    return null;
}
