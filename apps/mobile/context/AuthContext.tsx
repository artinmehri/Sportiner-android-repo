import React, { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';

import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import type { User as SupabaseUser, Session } from '@supabase/supabase-js';

export interface User {
  id: string;
  email: string;
  name?: string;
  avatar?: string;
  provider: 'email' | 'google' | 'facebook' | 'apple';
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  session: Session | null;
  signUp: (email: string, password?: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signInWithFacebook: () => Promise<void>;
  signInWithApple: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

async function mapSessionToUser(session: Session | null): Promise<User | null> {
  if (!session?.user) {
    return null;
  }
  const su: SupabaseUser = session.user;
  const email = su.email ?? '';
  let name: string | undefined;
  let avatar: string | undefined;

  if (isSupabaseConfigured) {
    const { data: row } = await supabase
      .from('users')
      .select('name')
      .eq('id', su.id)
      .maybeSingle();
    name = row?.name ?? su.user_metadata?.display_name ?? email.split('@')[0];
    avatar = undefined;
  } else {
    name = su.user_metadata?.display_name ?? email.split('@')[0];
  }

  const providerRaw = su.app_metadata?.provider;
  const provider: User['provider'] =
    providerRaw === 'google' || providerRaw === 'facebook' || providerRaw === 'apple'
      ? providerRaw
      : 'email';

  return {
    id: su.id,
    email,
    name,
    avatar,
    provider,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setUser(null);
      setSession(null);
      return;
    }
    const { data: { session: s } } = await supabase.auth.getSession();
    setSession(s);
    setUser(await mapSessionToUser(s));
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!isSupabaseConfigured) {
        setIsLoading(false);
        return;
      }
      const { data: { session: s } } = await supabase.auth.getSession();
      if (cancelled) return;
      setSession(s);
      setUser(await mapSessionToUser(s));
      setIsLoading(false);
    })();

    if (!isSupabaseConfigured) {
      return () => {
        cancelled = true;
      };
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, s) => {
      setSession(s);
      setUser(await mapSessionToUser(s));
      setIsLoading(false);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  const signUp = async (email: string, password?: string) => {
    if (!isSupabaseConfigured) {
      await new Promise((r) => setTimeout(r, 500));
      setUser({
        id: String(Date.now()),
        email,
        provider: 'email',
        name: email.split('@')[0],
        avatar:
          'https://images.unsplash.com/photo-1534158914592-062992fbe900?auto=format&fit=crop&w=200&q=60',
      });
      return;
    }
    if (!password) {
      throw new Error('Password is required');
    }
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) {
      throw error;
    }
    await refreshUser();
  };

  const signInWithGoogle = async () => {
    if (!isSupabaseConfigured) {
      await new Promise((r) => setTimeout(r, 1500));
      setUser({
        id: String(Date.now()),
        email: 'user@gmail.com',
        name: 'Google User',
        provider: 'google',
        avatar:
          'https://images.unsplash.com/photo-1534158914592-062992fbe900?auto=format&fit=crop&w=200&q=60',
      });
      return;
    }
    throw new Error('Google sign-in: configure OAuth in Supabase and expo-auth-session in the app.');
  };

  const signInWithFacebook = async () => {
    if (!isSupabaseConfigured) {
      await new Promise((r) => setTimeout(r, 1500));
      setUser({
        id: String(Date.now()),
        email: 'user@facebook.com',
        name: 'Facebook User',
        provider: 'facebook',
        avatar:
          'https://images.unsplash.com/photo-1534158914592-062992fbe900?auto=format&fit=crop&w=200&q=60',
      });
      return;
    }
    throw new Error('Facebook sign-in is not configured yet.');
  };

  const signInWithApple = async () => {
    if (!isSupabaseConfigured) {
      await new Promise((r) => setTimeout(r, 1500));
      setUser({
        id: String(Date.now()),
        email: 'user@icloud.com',
        name: 'Apple User',
        provider: 'apple',
        avatar:
          'https://images.unsplash.com/photo-1534158914592-062992fbe900?auto=format&fit=crop&w=200&q=60',
      });
      return;
    }
    throw new Error('Apple sign-in is not configured yet.');
  };

  const signOut = async () => {
    if (isSupabaseConfigured) {
      await supabase.auth.signOut();
    }
    setUser(null);
    setSession(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        session,
        signUp,
        signInWithGoogle,
        signInWithFacebook,
        signInWithApple,
        signOut,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
