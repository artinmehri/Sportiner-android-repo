import { createClient } from '@supabase/supabase-js'
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as SecureStore from 'expo-secure-store'

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

export async function userExists() {
    const { data, error } = await supabase.auth.getUser();

    if (error || !data.user) {
        return
    }

    let user = data.user;

    console.log("user data :")
    console.log(data.user)

    
    if (!user) {
        return
    }

    const { data: existing } = await supabase
    .from('users')
    .select('id')
    .eq('id', user.id)
    .maybeSingle();

    if (existing) {
    console.log('User already exists!');
        return true
    } else {
        return false
    }
}

export const isOnboarding = { current: false}