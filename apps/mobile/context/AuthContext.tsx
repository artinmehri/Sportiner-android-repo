import { createClient } from '@supabase/supabase-js'
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as SecureStore from 'expo-secure-store'
import { useEffect, useState } from 'react'
import type { Session, User } from '@supabase/supabase-js'

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

export async function getUser(userId: string) {

    const { data: userData } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

    if (userData) {
        return userData
    }
}

export async function getCurrentUser() {
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
    .select('*')
    .eq('id', user.id)
    .maybeSingle();

    if (userData) {
        return userData
    }
}

export async function userExists() {
    const { data, error } = await supabase.auth.getUser();

    if (error || !data.user) {
        return
    }

    const user = data.user;
    if (!user) {
        return
    }

    const { data: existing } = await supabase
    .from('users')
    .select('id')
    .eq('id', user.id)
    .maybeSingle();

    if (existing) {
        return true
    } else {
        return false
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
