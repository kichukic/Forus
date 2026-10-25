// Your chat profile: your name, the phone number and email friends find you by
// (each verified with a code), and signing out.
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { showToast } from '../data/toasts';
import { GUTTER, colors } from '../theme';
import { serverAddress } from './api';
import { removeEmail, removePhone, signOut, updateName, useChat, verifyEmail, verifyPhone } from './store';
import { Avatar, Button, Field, Header, chatStyles } from './ui';
import { Verify, type VerifyKind } from './Verify';

/** 919876543210 → +91 98765 43210 (Indian numbers), others → +<digits>. */
function formatPhone(digits: string): string {
  if (digits.length === 12 && digits.startsWith('91')) return `+91 ${digits.slice(2, 7)} ${digits.slice(7)}`;
  return `+${digits}`;
}

export function ProfileView({ onBack }: { onBack: () => void }) {
  const insets = useSafeAreaInsets();
  const { me } = useChat();
  const [name, setName] = useState(me?.name ?? '');
  const [saving, setSaving] = useState(false);
  const [verifying, setVerifying] = useState<VerifyKind | null>(null);
  if (!me) return null;

  // Runs a profile change, with a toast for how it went.
  const act = async (fn: () => Promise<void>, done: string) => {
    setSaving(true);
    try {
      await fn();
      showToast({ text: done });
    } catch (e) {
      showToast({ text: (e as Error).message });
    } finally {
      setSaving(false);
    }
  };

  const confirmRemove = (kind: VerifyKind) =>
    Alert.alert(
      kind === 'phone' ? 'Remove your number?' : 'Remove your email?',
      "Friends won't be able to find you by it any more.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () =>
            kind === 'phone' ? act(removePhone, 'Number removed') : act(removeEmail, 'Email removed'),
        },
      ],
    );

  const verifyTitle =
    verifying === 'email'
      ? me.email && me.emailVerified
        ? 'Change email'
        : 'Verify email'
      : me.phone
        ? 'Change number'
        : 'Verify phone number';

  return (
    <KeyboardAvoidingView behavior="padding" style={[chatStyles.screen, { paddingTop: insets.top + 10 }]}>
      <Header title="Profile" onBack={onBack} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.top}>
          <Avatar name={me.name} id={me.id} size={84} />
        </View>

        <Text style={styles.label}>Name</Text>
        <Field value={name} onChangeText={setName} placeholder="Your name" />
        <Button
          label={saving ? 'Saving…' : 'Save name'}
          onPress={() => act(() => updateName(name.trim()), 'Name saved')}
          disabled={saving || !name.trim() || name.trim() === me.name}
          style={styles.save}
        />

        <Text style={styles.label}>Phone number</Text>
        <Contact
          value={me.phone ? formatPhone(me.phone) : undefined}
          verified={!!me.phone}
          empty={"Add your number so friends can find you by it. We'll text you a code to check it's yours."}
          verifyLabel={me.phone ? 'Change number' : 'Verify phone number'}
          // An account with nothing else to sign in with keeps its number.
          canRemove={!!me.phone && !!me.email}
          busy={saving}
          onVerify={() => setVerifying('phone')}
          onRemove={() => confirmRemove('phone')}
        />

        <Text style={styles.label}>Email</Text>
        <Contact
          value={me.email}
          verified={!!me.email && me.emailVerified}
          empty={"Add your email so friends can find you by it. We'll email you a code to check it's yours."}
          unverified="Not verified · verify it so friends can find you by it"
          verifyLabel={!me.email ? 'Add email' : me.emailVerified ? 'Change email' : 'Verify email'}
          canRemove={!!me.email && !!me.phone}
          busy={saving}
          onVerify={() => setVerifying('email')}
          onRemove={() => confirmRemove('email')}
        />

        <Button label="Sign out" kind="danger" onPress={signOut} style={styles.signOut} />
        <Text style={[chatStyles.note, styles.server]}>Server: {serverAddress()}</Text>
      </ScrollView>
      <Verify
        kind={verifying}
        title={verifyTitle}
        onVerified={(kind, result) => {
          setVerifying(null);
          if (kind === 'phone') act(() => verifyPhone(result), 'Number verified');
          else act(() => verifyEmail(result), 'Email verified');
        }}
        onClose={() => setVerifying(null)}
      />
    </KeyboardAvoidingView>
  );
}

/** A phone number or email: its state, and the buttons to verify or remove it. */
function Contact({
  value,
  verified,
  empty,
  unverified,
  verifyLabel,
  canRemove,
  busy,
  onVerify,
  onRemove,
}: {
  value?: string;
  verified: boolean;
  empty: string;
  unverified?: string;
  verifyLabel: string;
  canRemove: boolean;
  busy: boolean;
  onVerify: () => void;
  onRemove: () => void;
}) {
  return (
    <>
      {value ? (
        <View style={styles.card}>
          <Ionicons
            name={verified ? 'checkmark-circle' : 'alert-circle'}
            size={22}
            color={verified ? '#4cd6a0' : '#ffb74d'}
          />
          <View style={styles.cardText}>
            <Text style={styles.value} numberOfLines={1}>
              {value}
            </Text>
            <Text style={styles.state}>{verified ? 'Verified · friends can find you by it' : unverified}</Text>
          </View>
        </View>
      ) : (
        <Text style={[chatStyles.note, styles.hint]}>{empty}</Text>
      )}
      <View style={styles.row}>
        <Button
          label={verifyLabel}
          onPress={onVerify}
          kind={verified ? 'plain' : 'primary'}
          disabled={busy}
          style={styles.grow}
        />
        {canRemove ? <Button label="Remove" kind="plain" onPress={onRemove} disabled={busy} /> : null}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER, paddingBottom: 160 },
  top: { alignItems: 'center', marginVertical: 12 },
  label: { color: colors.muted, fontSize: 12.5, fontWeight: '800', marginTop: 22, marginBottom: 8 },
  hint: { fontSize: 13, marginBottom: 12 },
  save: { marginTop: 10 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 14,
    backgroundColor: colors.surface,
    marginBottom: 10,
  },
  cardText: { flex: 1 },
  value: { color: colors.text, fontSize: 16.5, fontWeight: '800' },
  state: { color: colors.muted, fontSize: 12.5, marginTop: 2 },
  row: { flexDirection: 'row', gap: 10 },
  grow: { flex: 1 },
  signOut: { marginTop: 28 },
  server: { fontSize: 11.5, textAlign: 'center', marginTop: 24, color: colors.faint },
});
