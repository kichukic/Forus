// Signing in to chat, or making an account. The server's address sits under
// "Server" for while it runs on a computer at home.
import { useState } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GUTTER, colors } from '../theme';
import { DEFAULT_SERVER, serverAddress, setServerAddress } from './api';
import { register, signIn } from './store';
import { Button, Field, chatStyles } from './ui';

export function AuthView() {
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<'signIn' | 'register'>('signIn');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [server, setServer] = useState(serverAddress());
  const [showServer, setShowServer] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      await setServerAddress(server);
      if (mode === 'register') {
        await register({ name, email, password, phone: phone.trim() || undefined });
      } else {
        await signIn(email, password);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const registering = mode === 'register';
  return (
    <KeyboardAvoidingView behavior="padding" style={chatStyles.screen}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + GUTTER }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.mark}>
          <Ionicons name="chatbubbles" size={34} color={colors.accent} />
        </View>
        <Text style={styles.title}>{registering ? 'Create your account' : 'Chat with friends'}</Text>
        <Text style={[chatStyles.note, styles.lead]}>
          Message your friends on ForUs and send them films and shows to watch.
        </Text>

        {registering && (
          <Field value={name} onChangeText={setName} placeholder="Your name" autoComplete="name" style={styles.field} />
        )}
        <Field
          value={email}
          onChangeText={setEmail}
          placeholder="Email"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          style={styles.field}
        />
        <Field
          value={password}
          onChangeText={setPassword}
          placeholder={registering ? 'Password (8 characters or more)' : 'Password'}
          secureTextEntry
          autoComplete={registering ? 'new-password' : 'current-password'}
          style={styles.field}
          onSubmitEditing={registering ? undefined : submit}
        />
        {registering && (
          <>
            <Field
              value={phone}
              onChangeText={setPhone}
              placeholder="Phone with country code (optional)"
              keyboardType="phone-pad"
              autoComplete="tel"
              style={styles.field}
            />
            <Text style={[chatStyles.note, styles.hint]}>
              Friends can find you by your email, or by this number if you add it.
            </Text>
          </>
        )}

        {error && <Text style={chatStyles.error}>{error}</Text>}
        <Button
          label={busy ? 'Please wait…' : registering ? 'Create account' : 'Sign in'}
          onPress={submit}
          disabled={busy}
          style={styles.submit}
        />
        <Pressable
          onPress={() => {
            setMode(registering ? 'signIn' : 'register');
            setError(null);
          }}
          style={styles.switch}
        >
          <Text style={styles.switchText}>
            {registering ? 'Have an account? ' : 'New here? '}
            <Text style={styles.switchLink}>{registering ? 'Sign in' : 'Create an account'}</Text>
          </Text>
        </Pressable>

        <Pressable onPress={() => setShowServer((s) => !s)} style={styles.serverToggle}>
          <Ionicons name="server-outline" size={14} color={colors.faint} />
          <Text style={styles.serverToggleText}>Server</Text>
          <Ionicons name={showServer ? 'chevron-up' : 'chevron-down'} size={14} color={colors.faint} />
        </Pressable>
        {showServer && (
          <Field
            value={server}
            onChangeText={setServer}
            placeholder={DEFAULT_SERVER}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            style={styles.field}
          />
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER, paddingBottom: 140, maxWidth: 520, width: '100%', alignSelf: 'center' },
  mark: {
    width: 64,
    height: 64,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentSoft,
    marginBottom: 18,
  },
  title: { color: colors.text, fontSize: 26, fontWeight: '900' },
  lead: { marginTop: 6, marginBottom: 22 },
  field: { marginBottom: 12 },
  hint: { fontSize: 12.5, marginTop: -4, marginBottom: 6 },
  submit: { marginTop: 10 },
  switch: { alignItems: 'center', paddingVertical: 16 },
  switchText: { color: colors.muted, fontSize: 14 },
  switchLink: { color: colors.accent, fontWeight: '800' },
  serverToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 8 },
  serverToggleText: { color: colors.faint, fontSize: 12.5, fontWeight: '700' },
});
