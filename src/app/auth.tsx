import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { friendlyAuthError, signIn, signUp } from '@/services/firebase/firebaseAuth';
import { useTheme } from '@/hooks/use-theme';

export default function AuthScreen() {
  const theme = useTheme();
  const router = useRouter();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isSignup = mode === 'signup';
  const namesValid =
    !isSignup || (firstName.trim().length > 0 && lastName.trim().length > 0);
  const canSubmit =
    email.trim().length > 3 && password.length >= 6 && namesValid && !busy;

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      if (isSignup) await signUp(email, password, firstName, lastName);
      else await signIn(email, password);
      router.back();
    } catch (e) {
      setError(friendlyAuthError(e));
      setBusy(false);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} hitSlop={8} accessibilityRole="button">
          <Icon name="close" size={26} color={theme.textSecondary} />
        </Pressable>
      </View>

      <KeyboardAvoidingView
        style={styles.body}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.brand}>
          <View style={[styles.brandIcon, { backgroundColor: theme.accent }]}>
            <Icon name="all-notes" size={34} color={theme.accentContrast} />
          </View>
          <ThemedText type="subtitle" style={styles.heading}>
            {mode === 'signin' ? 'Welcome Back' : 'Create Account'}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.sub}>
            {mode === 'signin'
              ? 'Sign in to sync your notes across devices.'
              : 'Sync your notes securely across all your devices.'}
          </ThemedText>
        </View>

        {isSignup && (
          <View style={styles.nameRow}>
            <TextInput
              value={firstName}
              onChangeText={setFirstName}
              placeholder="First name"
              placeholderTextColor={theme.textSecondary}
              style={[
                styles.input,
                styles.nameInput,
                { backgroundColor: theme.backgroundElement, color: theme.text },
              ]}
              autoCapitalize="words"
              autoCorrect={false}
              textContentType="givenName"
            />
            <TextInput
              value={lastName}
              onChangeText={setLastName}
              placeholder="Last name"
              placeholderTextColor={theme.textSecondary}
              style={[
                styles.input,
                styles.nameInput,
                { backgroundColor: theme.backgroundElement, color: theme.text },
              ]}
              autoCapitalize="words"
              autoCorrect={false}
              textContentType="familyName"
            />
          </View>
        )}

        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder="Email"
          placeholderTextColor={theme.textSecondary}
          style={[styles.input, { backgroundColor: theme.backgroundElement, color: theme.text }]}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="emailAddress"
        />
        <TextInput
          value={password}
          onChangeText={setPassword}
          placeholder="Password"
          placeholderTextColor={theme.textSecondary}
          style={[styles.input, { backgroundColor: theme.backgroundElement, color: theme.text }]}
          secureTextEntry
          autoCapitalize="none"
          textContentType={mode === 'signin' ? 'password' : 'newPassword'}
          onSubmitEditing={submit}
          returnKeyType="go"
        />

        {error && (
          <ThemedText type="small" style={[styles.error, { color: theme.danger }]}>
            {error}
          </ThemedText>
        )}

        <Pressable
          onPress={submit}
          disabled={!canSubmit}
          accessibilityRole="button"
          style={[styles.submit, { backgroundColor: theme.accent, opacity: canSubmit ? 1 : 0.5 }]}>
          {busy ? (
            <ActivityIndicator color={theme.accentContrast} />
          ) : (
            <ThemedText style={[styles.submitText, { color: theme.accentContrast }]}>
              {mode === 'signin' ? 'Sign In' : 'Create Account'}
            </ThemedText>
          )}
        </Pressable>

        <Pressable
          onPress={() => {
            setMode(mode === 'signin' ? 'signup' : 'signin');
            setError(null);
          }}
          hitSlop={8}
          style={styles.toggle}>
          <ThemedText type="small" themeColor="textSecondary">
            {mode === 'signin' ? "Don't have an account? " : 'Already have an account? '}
            <ThemedText type="smallBold" style={{ color: theme.accent }}>
              {mode === 'signin' ? 'Sign Up' : 'Sign In'}
            </ThemedText>
          </ThemedText>
        </Pressable>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: { paddingHorizontal: Spacing.four, paddingTop: Spacing.three, alignItems: 'flex-end' },
  body: { flex: 1, paddingHorizontal: Spacing.four, justifyContent: 'center', gap: Spacing.three },
  brand: { alignItems: 'center', gap: Spacing.two, marginBottom: Spacing.three },
  brandIcon: {
    width: 68,
    height: 68,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.two,
  },
  heading: { textAlign: 'center' },
  sub: { textAlign: 'center', paddingHorizontal: Spacing.four },
  input: { height: 50, borderRadius: 12, paddingHorizontal: Spacing.three, fontSize: 16 },
  nameRow: { flexDirection: 'row', gap: Spacing.three },
  nameInput: { flex: 1 },
  error: { paddingHorizontal: Spacing.one },
  submit: { height: 50, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: Spacing.one },
  submitText: { fontSize: 16, fontWeight: '600' },
  toggle: { alignItems: 'center', paddingTop: Spacing.two },
});
