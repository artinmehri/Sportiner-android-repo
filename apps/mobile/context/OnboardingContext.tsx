import React, { createContext, useCallback, useContext, useMemo, useState, ReactNode } from 'react';

import type { AuthError } from '@supabase/supabase-js';

import {
  isSupabaseConfigured,
  supabase,
  SUPABASE_BAD_HOST_HINT,
  SUPABASE_SETUP_HINT,
} from '@/lib/supabase';
import {
  isUgcTextRejectedError,
  UGC_TEXT_REJECTED_COPY,
} from '@/lib/ugcModeration';

const RATE_LIMIT_HINT =
  'Supabase is temporarily blocking more sign-up emails for this address. Wait a few minutes, or in Dashboard go to Authentication → Rate Limits and relax limits for development. You can also turn off “Confirm email” under Email provider to send fewer messages. If you already have an account, fixing your password and finishing again will use sign-in only (no new sign-up email).';

function emailMatchesSession(sessionEmail: string | undefined, onboardingEmail: string): boolean {
  if (!sessionEmail) return false;
  return sessionEmail.trim().toLowerCase() === onboardingEmail.trim().toLowerCase();
}

function looksLikeUserAlreadyExists(err: AuthError): boolean {
  const msg = err.message?.toLowerCase() ?? '';
  return (
    msg.includes('already') ||
    msg.includes('registered') ||
    msg.includes('exists') ||
    err.status === 422
  );
}

function looksLikeInvalidCredentials(err: AuthError): boolean {
  const msg = err.message?.toLowerCase() ?? '';
  return (
    msg.includes('invalid login credentials') ||
    msg.includes('invalid credentials') ||
    (msg.includes('invalid') && msg.includes('password'))
  );
}

function looksLikeEmailNotConfirmed(err: AuthError): boolean {
  const msg = err.message?.toLowerCase() ?? '';
  return msg.includes('email not confirmed') || msg.includes('not confirmed');
}

function looksLikeRateLimit(err: AuthError | Error): boolean {
  const msg = ('message' in err ? err.message : String(err))?.toLowerCase() ?? '';
  return msg.includes('rate limit') || msg.includes('too many requests') || msg.includes('over_email_send_rate_limit');
}

export type AuthMethod = 'email' | 'google' | 'facebook' | 'apple';

export type WeekSchedule = Record<
  string,
  { morning: boolean; afternoon: boolean; evening: boolean }
>;

type OnboardingContextValue = {
  authMethod: AuthMethod;
  setAuthMethod: (m: AuthMethod) => void;
  displayName: string;
  setDisplayName: (v: string) => void;
  email: string;
  setEmail: (v: string) => void;
  password: string;
  setPassword: (v: string) => void;
  ageGroup: string;
  setAgeGroup: (v: string) => void;
  profileImageUri: string | null;
  setProfileImageUri: (v: string | null) => void;
  tennisLevel: string | null;
  setTennisLevel: (v: string | null) => void;
  schedule: WeekSchedule | null;
  setSchedule: (v: WeekSchedule | null) => void;
  completeOnboarding: () => Promise<{ error: string | null }>;
  reset: () => void;
};

const OnboardingContext = createContext<OnboardingContextValue | undefined>(undefined);

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const [authMethod, setAuthMethod] = useState<AuthMethod>('email');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [ageGroup, setAgeGroup] = useState('16-17');
  const [profileImageUri, setProfileImageUri] = useState<string | null>(null);
  const [tennisLevel, setTennisLevel] = useState<string | null>(null);
  const [schedule, setSchedule] = useState<WeekSchedule | null>(null);

  const reset = useCallback(() => {
    setAuthMethod('email');
    setDisplayName('');
    setEmail('');
    setPassword('');
    setAgeGroup('16-17');
    setProfileImageUri(null);
    setTennisLevel(null);
    setSchedule(null);
  }, []);

  const completeOnboarding = useCallback(async (): Promise<{ error: string | null }> => {
    if (!isSupabaseConfigured) {
      return { error: SUPABASE_SETUP_HINT };
    }

    const hasEmailCredentials = email.trim().length > 0 && password.trim().length > 0;
    if (authMethod !== 'email' && !hasEmailCredentials) {
      return { error: 'Use "Continue with Email" to register with Supabase for now.' };
    }

    if (!displayName.trim()) {
      return { error: 'Display name is required.' };
    }
    if (!email.trim() || !password.trim()) {
      return { error: 'Email and password are required.' };
    }

    const emailTrim = email.trim();
    const passwordTrim = password.trim();

    try {
      let uid: string | undefined;

      const {
        data: { session: existingSession },
      } = await supabase.auth.getSession();

      if (
        existingSession?.user?.id &&
        emailMatchesSession(existingSession.user.email, emailTrim)
      ) {
        uid = existingSession.user.id;
      } else {
        const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({
          email: emailTrim,
          password: passwordTrim,
        });

        if (!signInErr && signInData.user?.id) {
          uid = signInData.user.id;
        } else if (signInErr) {
          if (looksLikeRateLimit(signInErr)) {
            return { error: RATE_LIMIT_HINT };
          }
          if (looksLikeEmailNotConfirmed(signInErr)) {
            return {
              error:
                'Confirm the sign-up link in your email first, or disable “Confirm email” in Supabase (Authentication → Providers → Email) for local testing.',
            };
          }

          if (!looksLikeInvalidCredentials(signInErr)) {
            return { error: signInErr.message };
          }

          const { data: signUpData, error: signErr } = await supabase.auth.signUp({
            email: emailTrim,
            password: passwordTrim,
            options: { data: { display_name: displayName.trim() } },
          });

          uid = signUpData.user?.id;

          if (signErr) {
            if (looksLikeRateLimit(signErr)) {
              return { error: RATE_LIMIT_HINT };
            }
            if (looksLikeUserAlreadyExists(signErr)) {
              const { data: retryIn, error: retryErr } = await supabase.auth.signInWithPassword({
                email: emailTrim,
                password: passwordTrim,
              });
              if (retryErr) {
                if (looksLikeRateLimit(retryErr)) {
                  return { error: RATE_LIMIT_HINT };
                }
                return { error: retryErr.message };
              }
              uid = retryIn.user?.id;
            } else {
              return { error: signErr.message };
            }
          }
        }
      }

      if (!uid) {
        return {
          error:
            'No user id returned. If email confirmation is on in Supabase, confirm the link in your inbox or disable confirmation for development.',
        };
      }

      const { error: profileErr } = await supabase.from('users').upsert(
        {
          id: uid,
          name: displayName.trim(),
          age_group: ageGroup,
          level: tennisLevel ?? 'Beginner',
          availability: schedule ?? {},
        },
        { onConflict: 'id' }
      );

      if (profileErr) {
        if (isUgcTextRejectedError(profileErr)) {
          return { error: UGC_TEXT_REJECTED_COPY.message };
        }
        return { error: profileErr.message };
      }

      return { error: null };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (
        /hostname could not be found|server with the specified hostname|could not be found\./i.test(
          msg
        )
      ) {
        return { error: SUPABASE_BAD_HOST_HINT };
      }
      if (/network request failed|failed to fetch|network error/i.test(msg)) {
        return {
          error:
            'Could not reach Supabase. Check Wi‑Fi or cellular data, turn off VPN if you use one, then restart the app with: pnpm mobile:dev -- --clear',
        };
      }
      return { error: msg || 'Unknown error occurred' };
    }
  }, [authMethod, ageGroup, displayName, email, password, profileImageUri, schedule, tennisLevel]);

  const value = useMemo(
    () => ({
      authMethod,
      setAuthMethod,
      displayName,
      setDisplayName,
      email,
      setEmail,
      password,
      setPassword,
      ageGroup,
      setAgeGroup,
      profileImageUri,
      setProfileImageUri,
      tennisLevel,
      setTennisLevel,
      schedule,
      setSchedule,
      completeOnboarding,
      reset,
    }),
    [
      authMethod,
      ageGroup,
      completeOnboarding,
      displayName,
      email,
      password,
      profileImageUri,
      reset,
      schedule,
      tennisLevel,
    ]
  );

  return <OnboardingContext.Provider value={value}>{children}</OnboardingContext.Provider>;
}

export function useOnboarding() {
  const ctx = useContext(OnboardingContext);
  if (!ctx) {
    throw new Error('useOnboarding must be used within OnboardingProvider');
  }
  return ctx;
}
