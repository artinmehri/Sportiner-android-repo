import { createClient } from '@supabase/supabase-js'
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as SecureStore from 'expo-secure-store'
import { useEffect, useState } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import {
    disablePushTokensForCurrentDevice,
    pausePushRegistrationForLogout,
    resumePushRegistrationAfterLogout,
} from '@/lib/pushNotifications'
import { requestAcquisitionDeviceMatch } from '@/lib/acquisitionMatch'

class LargeSecureStore {
  async getItem(key: string) {
      try {
          const value = await SecureStore.getItemAsync(key);
          return value;
      } catch {
          return await AsyncStorage.getItem(key);
      }
  }

  async setItem(key: string, value: string) {
      try {
          await SecureStore.setItemAsync(key, value);
      } catch {
          await AsyncStorage.setItem(key, value);
      }
  }

  async removeItem(key: string) {
      await SecureStore.deleteItemAsync(key).catch(() => {});
      await AsyncStorage.removeItem(key).catch(() => {});
  }
}

const supabaseUrl = "https://prswdcjmowfdvalyutlu.supabase.co"
const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InByc3dkY2ptb3dmZHZhbHl1dGx1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU2NDY2NjIsImV4cCI6MjA4MTIyMjY2Mn0.XCJ8-mi8bVBIU8als-kyQvruLkv09hF6-SgzqfnSSGg"

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: new LargeSecureStore(),
    storageKey: 'signup-key',
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
})

const USER_PROFILE_SELECT =
    'id, created_at, name, profile_picture, age_group, level, availability, city, last_active_at, elo, gamesPlayed, reliability_score, updated_at, accepted_terms, onboarding_version, onboarding_stage, onboarding_completed_at, favorite_park' as const

export const ONBOARDING_STATUSES = [
    'Not Started',
    '1',
    '2',
    '3',
    '4',
    '5',
    '6',
    '7',
    'Completed',
] as const;

export type OnboardingStatus = (typeof ONBOARDING_STATUSES)[number];

function normalizeOnboardingStatus(value: unknown): OnboardingStatus {
    if (value === 'complete') return 'Completed';
    if (value === 'minimum_complete') return '4';
    if (value === 'not_started' || value == null) return 'Not Started';
    return ONBOARDING_STATUSES.includes(value as OnboardingStatus)
        ? value as OnboardingStatus
        : 'Not Started';
}

export function onboardingStatusToStep(status: string | null | undefined): number {
    const normalized = normalizeOnboardingStatus(status);
    if (normalized === 'Completed') return 7;
    if (normalized === 'Not Started') return 1;
    return Number(normalized);
}

export async function getOnboardingStatus(userId: string): Promise<OnboardingStatus> {
    const { data, error } = await supabase
        .from('users')
        .select('onboarding_stage')
        .eq('id', userId)
        .maybeSingle();

    if (error) {
        console.warn('Unable to read onboarding status:', error.message);
        return 'Not Started';
    }

    return normalizeOnboardingStatus(data?.onboarding_stage);
}

export async function setOnboardingStatus(
    userId: string,
    status: OnboardingStatus,
): Promise<boolean> {
    const { error } = await supabase
        .from('users')
        .upsert(
            {
                id: userId,
                onboarding_stage: status,
                onboarding_version: 2,
                onboarding_completed_at:
                    status === 'Completed' ? new Date().toISOString() : null,
            },
            { onConflict: 'id' },
        );

    if (error) {
        console.warn('Unable to save onboarding status:', error.message);
        return false;
    }

    // Single hook point for all three onboarding exits (create game / browse /
    // join). Fire-and-forget — attribution must never block finishing onboarding.
    if (status === 'Completed') {
        void requestAcquisitionDeviceMatch(supabase);
    }

    return true;
}

export async function getCurrentUserId() {
    const { data, error } = await supabase.auth.getUser();

    if (error || !data.user) {
        return
    }

    const user = data.user;
    if (!user) {
        return
    }

    const { data: userData } = await supabase
    .from('users')
    .select('id')
    .eq('id', user.id)
    .maybeSingle();

    if (userData) {
        return userData
    }
}

export async function getUser(userId: string): Promise<any | undefined> {

    const { data: userData } = await supabase
    .from('users')
    .select(USER_PROFILE_SELECT)
    .eq('id', userId)
    .maybeSingle();

    if (userData) {
        return userData
    }
}

export async function getCurrentUser(): Promise<any | undefined> {
    const { data, error } = await supabase.auth.getUser();

    if (error || !data.user) {
        return
    }

    const user = data.user;
    if (!user) {
        return
    }

    const { data: userData } = await supabase
    .from('users')
    .select(USER_PROFILE_SELECT)
    .eq('id', user.id)
    .maybeSingle();

    if (userData) {
        return userData
    }
}

export const isOnboarding = { current: false}
export const isPasswordRecovery = { current: false}

export async function signOutCurrentUser(): Promise<{ error: Error | null }> {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();

    if (sessionError) {
        return { error: new Error(`Unable to check your session: ${sessionError.message}`) };
    }

    if (!sessionData.session) {
        isOnboarding.current = false;
        isPasswordRecovery.current = false;
        return { error: null };
    }

    await pausePushRegistrationForLogout();

    try {
        // Must run before signOut while the session JWT is still valid.
        const pushTokensCleared = await disablePushTokensForCurrentDevice(supabase, 'logout');
        if (!pushTokensCleared) {
            return {
                error: new Error('Unable to clear this device notification registration.'),
            };
        }

        const { error: signOutError } = await supabase.auth.signOut();

        if (signOutError) {
            return { error: new Error(`Unable to log out: ${signOutError.message}`) };
        }

        const { data: verificationData, error: verificationError } = await supabase.auth.getSession();

        if (verificationError) {
            return { error: new Error(`Unable to confirm logout: ${verificationError.message}`) };
        }

        if (verificationData.session) {
            return { error: new Error('Your session is still active. Please try again.') };
        }

        isOnboarding.current = false;
        isPasswordRecovery.current = false;
        return { error: null };
    } finally {
        resumePushRegistrationAfterLogout();
    }
}

export function useAuth(): { session: Session | null; user: User | null; loading: boolean } {
    const [session, setSession] = useState<Session | null>(null)
    const [user, setUser] = useState<User | null>(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        let isMounted = true

        const init = async () => {
            const { data, error } = await supabase.auth.getSession()
            if (!isMounted) return

            if (error) {
                setSession(null)
                setUser(null)
            } else {
                setSession(data.session ?? null)
                setUser(data.session?.user ?? null)
            }
            setLoading(false)
        }

        init()

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
            setSession(nextSession ?? null)
            setUser(nextSession?.user ?? null)
            setLoading(false)
        })

        return () => {
            isMounted = false
            subscription.unsubscribe()
        }
    }, [])

    return { session, user, loading }
}

export async function getBlockedUserIds(): Promise<string[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('blocked_users')
    .select('blocked_id')
    .eq('blocker_id', user.id);

  if (error) {
    console.log('Error fetching blocked users:', error);
    return [];
  }

  return (data ?? []).map((row: { blocked_id: string }) => row.blocked_id);
}
