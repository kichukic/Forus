// Signing in to chat, or making an account, with a phone number or an email
// verified by a code through Phone.Email: no password. Something new asks for a
// name before the account is made. Accounts from before verification can
// still sign in with their password. The server's address sits under
// "Server", for testing against one run at home.
import { useState } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GUTTER, colors } from '../theme';
import { DEFAULT_SERVER, serverAddress, setServerAddress } from './api';
import { emailSignIn, finishSignUp, phoneSignIn, signIn } from './store';
import { Button, Field, chatStyles } from './ui';
import { Verify, type VerifyKind } from './Verify';

export function AuthView() {
  const insets = useSafeAreaInsets();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [server, setServer] = useState(serverAddress());
  const [showServer, setShowServer] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState<VerifyKind | null>(null);
  // Something verified and new, waiting for a name to make the account.
  const [ticket, setTicket] = useState<string | null>(null);

  const run = async (fn: () => Promise<void>) => {
    setError(null);
    setBusy(true);
    try {
      await setServerAddress(server);
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const verified = (kind: VerifyKind, result: string) => {
    setVerifying(null);
    run(async () => {
      const pending = kind === 'phone' ? await phoneSignIn(result) : await emailSignIn(result);
      if (pending) {
        setTicket(pending.ticket);
        setName(pending.suggestedName ?? '');
      }
    });
  };

  const header = (title: string, lead: string) => (
    <>
      <View style={styles.mark}>
        <Ionicons name="chatbubbles" size={34} color={colors.accent} />
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={[chatStyles.note, styles.lead]}>{lead}</Text>
    </>
  );

  if (ticket) {
    const finish = () => run(() => finishSignUp(ticket, name));
    return (
      <KeyboardAvoidingView behavior="padding" style={chatStyles.screen}>
        <ScrollView
          contentContainerStyle={[styles.content, { paddingTop: insets.top + GUTTER }]}
          keyboardShouldPersistTaps="handled"
        >
          {header("You're verified", 'Last step: what should your friends see as your name?')}
          <Field
            value={name}
            onChangeText={setName}
            placeholder="Your name"
            autoComplete="name"
            autoFocus
            style={styles.field}
            onSubmitEditing={finish}
          />
          {error && <Text style={chatStyles.error}>{error}</Text>}
          <Button
            label={busy ? 'Please wait…' : 'Create account'}
            onPress={finish}
            disabled={busy || !name.trim()}
            style={styles.submit}
          />
          <Pressable onPress={() => setTicket(null)} style={styles.switch}>
            <Text style={styles.switchText}>Back</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  return (
    <KeyboardAvoidingView behavior="padding" style={chatStyles.screen}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + GUTTER }]}
        keyboardShouldPersistTaps="handled"
      >
        {header('Chat with friends', 'Message your friends on ForUs and send them films and shows to watch.')}

        <VerifyButton icon="call" label="Continue with phone" onPress={() => setVerifying('phone')} disabled={busy} />
        <VerifyButton
          icon="mail"
          label="Continue with email"
          onPress={() => setVerifying('email')}
          disabled={busy}
          secondary
        />
        <Text style={[chatStyles.note, styles.hint]}>{"We'll send you a code. No password needed."}</Text>
        {error && !showPassword && <Text style={[chatStyles.error, styles.center]}>{error}</Text>}

        <Pressable onPress={() => setShowPassword((s) => !s)} style={styles.switch}>
          <Text style={styles.switchText}>
            Made an account with a password? <Text style={styles.switchLink}>Sign in with it</Text>
          </Text>
        </Pressable>
        {showPassword && (
          <>
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
              placeholder="Password"
              secureTextEntry
              autoComplete="current-password"
              style={styles.field}
              onSubmitEditing={() => run(() => signIn(email, password))}
            />
            {error && <Text style={chatStyles.error}>{error}</Text>}
            <Button
              label={busy ? 'Please wait…' : 'Sign in'}
              onPress={() => run(() => signIn(email, password))}
              disabled={busy}
              kind="plain"
              style={styles.submit}
            />
          </>
        )}

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
      <Verify
        kind={verifying}
        title={verifying === 'email' ? 'Continue with email' : 'Continue with phone'}
        onVerified={verified}
        onClose={() => setVerifying(null)}
      />
    </KeyboardAvoidingView>
  );
}

function VerifyButton({
  icon,
  label,
  onPress,
  disabled,
  secondary,
}: {
  icon: 'call' | 'mail';
  label: string;
  onPress: () => void;
  disabled: boolean;
  secondary?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.verifyButton,
        secondary && styles.verifySecondary,
        (pressed || disabled) && styles.pressed,
      ]}
    >
      <Ionicons name={icon} size={18} color="#fff" />
      <Text style={styles.verifyText}>{label}</Text>
    </Pressable>
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
  verifyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: colors.accent,
    marginBottom: 10,
  },
  verifySecondary: { backgroundColor: colors.surfaceRaised },
  verifyText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  pressed: { opacity: 0.6 },
  hint: { fontSize: 12.5, textAlign: 'center', marginTop: 4 },
  center: { textAlign: 'center' },
  field: { marginBottom: 12 },
  submit: { marginTop: 4 },
  switch: { alignItems: 'center', paddingVertical: 16 },
  switchText: { color: colors.muted, fontSize: 14, textAlign: 'center' },
  switchLink: { color: colors.accent, fontWeight: '800' },
  serverToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 8 },
  serverToggleText: { color: colors.faint, fontSize: 12.5, fontWeight: '700' },
});
