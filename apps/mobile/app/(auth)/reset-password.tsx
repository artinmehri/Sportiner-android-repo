import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, SafeAreaView, StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { isPasswordRecovery, supabase } from '@/context/AuthContext';

export default function ResetPassword() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loadingSession, setLoadingSession] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);

  useEffect(() => {
    isPasswordRecovery.current = true;

    const checkSession = async () => {
      setLoadingSession(true);
      const { data } = await supabase.auth.getSession();
      setSessionReady(Boolean(data.session));
      setLoadingSession(false);
    };

    checkSession();
  }, []);

  const handleUpdatePassword = async () => {
    if (password.length < 8) {
      Alert.alert('Password too short', 'Use at least 8 characters for your new password.');
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert('Passwords do not match', 'Enter the same password in both fields.');
      return;
    }

    setSubmitting(true);

    const { error } = await supabase.auth.updateUser({ password });

    setSubmitting(false);

    if (error) {
      Alert.alert('Unable to update password', 'Please open the latest reset email and try again.');
      console.log('Password update failed:', error.message);
      return;
    }

    isPasswordRecovery.current = false;
    Alert.alert('Password updated', 'Your password has been updated.', [
      {
        text: 'Continue',
        onPress: () => router.replace('/(tabs)'),
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.card}>
        <Text style={styles.title}>Create a new password</Text>
        <Text style={styles.body}>Enter a new password for your Sportiner account.</Text>

        {loadingSession ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator color="#19E675" />
            <Text style={styles.loadingText}>Checking reset link...</Text>
          </View>
        ) : sessionReady ? (
          <>
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              placeholder="New password"
              secureTextEntry
              autoCapitalize="none"
            />
            <TextInput
              style={styles.input}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              placeholder="Confirm new password"
              secureTextEntry
              autoCapitalize="none"
            />
            <TouchableOpacity
              style={[styles.submitButton, submitting && styles.submitButtonDisabled]}
              onPress={handleUpdatePassword}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator color="#002000" />
              ) : (
                <Text style={styles.submitText}>Update password</Text>
              )}
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={styles.errorText}>This reset link is invalid or expired. Request a new password reset email and try again.</Text>
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() => {
                isPasswordRecovery.current = false;
                router.replace('/(auth)/login');
              }}
            >
              <Text style={styles.secondaryText}>Back to login</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 24,
  },
  card: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#E5E5E5',
    padding: 24,
    backgroundColor: '#fff',
  },
  title: {
    color: '#222',
    fontSize: 28,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 10,
  },
  body: {
    color: '#555',
    fontSize: 15,
    lineHeight: 21,
    textAlign: 'center',
    marginBottom: 24,
  },
  loadingContainer: {
    alignItems: 'center',
    gap: 12,
    paddingVertical: 18,
  },
  loadingText: {
    color: '#555',
    fontSize: 14,
    fontWeight: '600',
  },
  input: {
    height: 52,
    borderWidth: 1,
    borderColor: '#E5E5E5',
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 16,
    backgroundColor: '#fff',
    marginBottom: 14,
  },
  submitButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
    borderRadius: 9999,
    backgroundColor: '#19E675',
    marginTop: 6,
  },
  submitButtonDisabled: {
    backgroundColor: '#A0D8B5',
  },
  submitText: {
    color: '#002000',
    fontSize: 16,
    fontWeight: '700',
  },
  errorText: {
    color: '#BA1A1A',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 16,
  },
  secondaryButton: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  secondaryText: {
    color: '#19E675',
    fontSize: 15,
    fontWeight: '700',
  },
});
