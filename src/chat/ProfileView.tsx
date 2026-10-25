// Your chat profile: the name and phone number friends find you by, and
// signing out.
import { useState } from 'react';
import { KeyboardAvoidingView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { showToast } from '../data/toasts';
import { GUTTER, colors } from '../theme';
import { serverAddress } from './api';
import { signOut, updateProfile, useChat } from './store';
import { Avatar, Button, Field, Header, chatStyles } from './ui';

export function ProfileView({ onBack }: { onBack: () => void }) {
  const insets = useSafeAreaInsets();
  const { me } = useChat();
  const [name, setName] = useState(me?.name ?? '');
  const [phone, setPhone] = useState(me?.phone ?? '');
  const [saving, setSaving] = useState(false);
  if (!me) return null;

  const changed = name.trim() !== me.name || phone.trim() !== (me.phone ?? '');
  const save = async () => {
    setSaving(true);
    try {
      await updateProfile({ name: name.trim(), phone: phone.trim() });
      showToast({ text: 'Profile saved' });
    } catch (e) {
      showToast({ text: (e as Error).message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior="padding" style={[chatStyles.screen, { paddingTop: insets.top + 10 }]}>
      <Header title="Profile" onBack={onBack} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.top}>
          <Avatar name={me.name} id={me.id} size={84} />
          <Text style={styles.email}>{me.email}</Text>
        </View>
        <Text style={styles.label}>Name</Text>
        <Field value={name} onChangeText={setName} placeholder="Your name" />
        <Text style={styles.label}>Phone number</Text>
        <Field value={phone} onChangeText={setPhone} placeholder="With country code, e.g. +91…" keyboardType="phone-pad" />
        <Text style={[chatStyles.note, styles.hint]}>Friends can find you by this number. Leave it empty to remove it.</Text>
        <Button label={saving ? 'Saving…' : 'Save'} onPress={save} disabled={!changed || saving} style={styles.save} />
        <Button label="Sign out" kind="danger" onPress={signOut} style={styles.signOut} />
        <Text style={[chatStyles.note, styles.server]}>Server: {serverAddress()}</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER, paddingBottom: 160 },
  top: { alignItems: 'center', gap: 10, marginVertical: 12 },
  email: { color: colors.muted, fontSize: 14 },
  label: { color: colors.muted, fontSize: 12.5, fontWeight: '800', marginTop: 16, marginBottom: 8 },
  hint: { fontSize: 12.5, marginTop: 8 },
  save: { marginTop: 20 },
  signOut: { marginTop: 12 },
  server: { fontSize: 11.5, textAlign: 'center', marginTop: 24, color: colors.faint },
});
