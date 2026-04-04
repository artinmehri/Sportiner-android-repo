import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { fetch as expoFetch } from 'expo/fetch';
import { Platform } from 'react-native';

export function sanitizeSupabaseUrl(raw: string): string {
  return raw
    .replace(/^\uFEFF/, '')
    .trim()
    .replace(/^["']+|["']+$/g, '')
    .replace(/\/+$/, '');
}

const supabaseUrl = sanitizeSupabaseUrl(process.env.EXPO_PUBLIC_SUPABASE_URL ?? '');
const supabaseAnonKey = (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '').trim();

export const isSupabaseConfigured = Boolean(
  supabaseUrl.length > 0 && supabaseAnonKey.length > 0
);

export const SUPABASE_SETUP_HINT =
  'Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY to apps/mobile/.env, then restart Expo with --clear. See apps/mobile/supabase-setup.txt';

export const SUPABASE_BAD_HOST_HINT =
  'This Supabase URL does not exist on the internet (wrong ref, deleted project, or typo). In Supabase Dashboard → Project Settings → API, copy the exact "Project URL" (https://xxxxx.supabase.co) into apps/mobile/.env as EXPO_PUBLIC_SUPABASE_URL, save, then run: pnpm mobile:dev -- --clear';

const authStorage = {
  getItem: (key: string) => AsyncStorage.getItem(key),
  setItem: (key: string, value: string) => AsyncStorage.setItem(key, value),
  removeItem: (key: string) => AsyncStorage.removeItem(key),
};

const placeholderUrl = 'https://placeholder.supabase.co';
const placeholderKey =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiJ9.invalid';

const supabaseFetch: typeof fetch = (input, init) => {
  if (Platform.OS === 'web') {
    return globalThis.fetch(input, init);
  }
  const url =
    typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.href
        : (input as Request).url;
  return expoFetch(url, init as Parameters<typeof expoFetch>[1]) as unknown as Promise<Response>;
};

export const supabase: SupabaseClient = createClient(
  isSupabaseConfigured ? supabaseUrl : placeholderUrl,
  isSupabaseConfigured ? supabaseAnonKey : placeholderKey,
  {
    global: {
      fetch: supabaseFetch,
    },
    auth: {
      storage: authStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  }
);
