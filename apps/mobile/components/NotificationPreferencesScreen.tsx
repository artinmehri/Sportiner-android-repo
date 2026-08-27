import { View, Text, StyleSheet, TouchableOpacity, StatusBar, ScrollView, Alert, ActivityIndicator, Switch } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/context/AuthContext';

type NotificationPreferencesScreenProps = {
  onClose: () => void;
};

// Only the product-level toggles this screen owns. Quiet hours and radius are
// deferred, and favourite_park_games stays derived from the favorite park
// picker in profileSettings.
const PREFERENCE_ROWS = [
  { key: 'chat_messages', label: 'Chat messages', icon: 'chatbubble-ellipses-outline' },
  { key: 'message_previews', label: 'Message previews', icon: 'eye-outline' },
  { key: 'game_reminders', label: 'Game reminders', icon: 'alarm-outline' },
  { key: 'host_updates', label: 'Host updates', icon: 'megaphone-outline' },
  { key: 'nearby_games', label: 'Nearby games', icon: 'location-outline' },
  { key: 'marketing_updates', label: 'Marketing updates', icon: 'pricetag-outline' },
] as const;

type PreferenceKey = typeof PREFERENCE_ROWS[number]['key'];
type PreferenceField = PreferenceKey | 'notifications_enabled';
type PreferenceState = Record<PreferenceField, boolean>;

// Mirrors the column defaults on notification_preferences so a value the RPC
// omits still lands on the same state the database would have used.
const PREFERENCE_DEFAULTS: PreferenceState = {
  notifications_enabled: true,
  chat_messages: true,
  message_previews: false,
  game_reminders: true,
  host_updates: true,
  nearby_games: false,
  marketing_updates: false,
};

const PATCH_KEYS: PreferenceField[] = [
  'notifications_enabled',
  ...PREFERENCE_ROWS.map((row) => row.key),
];

const toPreferenceState = (row: any): PreferenceState => {
  const state = { ...PREFERENCE_DEFAULTS };

  PATCH_KEYS.forEach((key) => {
    const value = row?.[key];
    if (typeof value === 'boolean') {
      state[key] = value;
    }
  });

  return state;
};

// Merge patch: only the keys that actually moved since load. The RPC coalesces
// every absent key back to its stored value, so untouched fields are left alone.
const buildPatch = (loaded: PreferenceState, current: PreferenceState) => {
  const patch: Partial<PreferenceState> = {};

  PATCH_KEYS.forEach((key) => {
    if (loaded[key] !== current[key]) {
      patch[key] = current[key];
    }
  });

  return patch;
};

export default function NotificationPreferencesScreen({ onClose }: NotificationPreferencesScreenProps) {
  const insets = useSafeAreaInsets();
  const [preferences, setPreferences] = useState<PreferenceState>(PREFERENCE_DEFAULTS);
  // Snapshot taken at load. Also gates Save: without it there is nothing
  // trustworthy to diff against, so we must not send a patch.
  const [loadedPreferences, setLoadedPreferences] = useState<PreferenceState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const loadPreferences = useCallback(async (options?: { silent?: boolean }) => {
    setIsLoading(true);
    setLoadFailed(false);

    const { data, error } = await supabase.rpc('get_notification_preferences_v1');

    if (error || !data) {
      setIsLoading(false);
      setLoadFailed(true);
      console.log(error);

      if (!options?.silent) {
        Alert.alert(
          'Couldn\'t load preferences',
          'We could not load your notification preferences. Check your connection and try again.',
        );
      }
      return;
    }

    const loaded = toPreferenceState(data);
    setPreferences(loaded);
    setLoadedPreferences(loaded);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    void loadPreferences();
  }, [loadPreferences]);

  const togglePreference = (key: PreferenceField) => {
    setPreferences((previous) => ({ ...previous, [key]: !previous[key] }));
  };

  const handleSave = async () => {
    if (!loadedPreferences || isSaving) {
      return;
    }

    setIsSaving(true);
    const patch = buildPatch(loadedPreferences, preferences);

    const { error } = await supabase.rpc('update_notification_preferences_v1', {
      p_patch: patch,
    });

    if (error) {
      // Local state is deliberately left untouched so unsaved edits survive.
      setIsSaving(false);
      Alert.alert('There was an error saving your changes.');
      console.log(error);
      return;
    }

    // Re-baseline so a second save only sends what moved after this one.
    setLoadedPreferences(preferences);
    setIsSaving(false);
    Alert.alert(
      'Preferences saved',
      'Your notification preferences were updated.',
      [{ text: 'OK', onPress: onClose }],
    );
  };

  const notificationsEnabled = preferences.notifications_enabled;
  const canSave = Boolean(loadedPreferences) && !isLoading;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <TouchableOpacity style={styles.headerButton} onPress={onClose}>
          <Ionicons name="arrow-back" size={24} color="black" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Notifications</Text>
        <TouchableOpacity
          style={styles.headerButton}
          onPress={handleSave}
          disabled={!canSave || isSaving}
        >
          {isSaving ? (
            <ActivityIndicator size="small" color="#19E675" />
          ) : (
            <Text style={[styles.saveButton, !canSave && styles.saveButtonDisabled]}>Save</Text>
          )}
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <View style={styles.stateContainer}>
          <ActivityIndicator size="large" color="#19E675" />
        </View>
      ) : loadFailed ? (
        <View style={styles.stateContainer}>
          <Ionicons name="cloud-offline-outline" size={40} color="#666" />
          <Text style={styles.loadErrorText}>
            We could not load your notification preferences.
          </Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={() => void loadPreferences({ silent: true })}
          >
            <Text style={styles.retryButtonText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
          {/* Master Toggle Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>All Notifications</Text>

            <View style={styles.menuRow}>
              <View style={styles.menuLeft}>
                <Ionicons name="notifications-outline" size={24} color="#666" />
                <Text style={styles.menuText}>All Notifications</Text>
              </View>
              <Switch
                value={notificationsEnabled}
                onValueChange={() => togglePreference('notifications_enabled')}
                trackColor={{ false: '#E0E0E0', true: '#19E675' }}
                thumbColor="white"
                ios_backgroundColor="#E0E0E0"
              />
            </View>

            <Text style={styles.sectionFootnote}>
              {notificationsEnabled
                ? 'Choose which Sportiner notifications you want to receive.'
                : 'All Sportiner notifications are turned off. Turn this back on to change the settings below.'}
            </Text>
          </View>

          {/* Individual Preferences Section */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, !notificationsEnabled && styles.disabledText]}>
              What You Get Notified About
            </Text>

            {PREFERENCE_ROWS.map((row) => (
              <View key={row.key} style={styles.menuRow}>
                <View style={styles.menuLeft}>
                  <Ionicons
                    name={row.icon}
                    size={24}
                    color={notificationsEnabled ? '#666' : '#BDBDBD'}
                  />
                  <Text style={[styles.menuText, !notificationsEnabled && styles.disabledText]}>
                    {row.label}
                  </Text>
                </View>
                {/* Display-only: a locked row renders off so it never looks active.
                    The stored value is untouched and comes back as-is when the
                    master toggle is turned on again. */}
                <Switch
                  value={notificationsEnabled && preferences[row.key]}
                  onValueChange={() => togglePreference(row.key)}
                  disabled={!notificationsEnabled}
                  trackColor={{ false: '#E0E0E0', true: '#19E675' }}
                  thumbColor="white"
                  ios_backgroundColor="#E0E0E0"
                />
              </View>
            ))}
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'white',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  headerButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: 'black',
  },
  saveButton: {
    fontSize: 16,
    fontWeight: '600',
    color: '#19E675',
  },
  saveButtonDisabled: {
    color: '#B7EFCE',
  },
  scrollView: {
    flex: 1,
  },
  section: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
    marginBottom: 30,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: 'black',
    marginBottom: 16,
  },
  sectionFootnote: {
    fontSize: 14,
    color: '#666',
    marginTop: 12,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  menuLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  menuText: {
    flex: 1,
    fontSize: 16,
    color: 'black',
    marginLeft: 12,
  },
  disabledText: {
    color: '#999',
  },
  stateContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  loadErrorText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginTop: 12,
  },
  retryButton: {
    marginTop: 16,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  retryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#19E675',
  },
});
