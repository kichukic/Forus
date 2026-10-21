import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { checkApiKey, getApiKey, setApiKey } from '../api/torbox';
import { GUTTER, colors, sz } from '../theme';

type Props = {
  onDone: () => void;
};

export function TorboxSetupScreen({ onDone }: Props) {
  const insets = useSafeAreaInsets();
  const [key, setKey] = useState('');
  const [connected, setConnected] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getApiKey().then((k) => setConnected(!!k));
  }, []);

  const save = async () => {
    const trimmed = key.trim();
    if (!trimmed) return;
    setChecking(true);
    setError(null);
    try {
      await checkApiKey(trimmed);
      await setApiKey(trimmed);
      onDone();
    } catch (e) {
      setError(`TorBox didn't accept this key: ${(e as Error).message}`);
    } finally {
      setChecking(false);
    }
  };

  const disconnect = async () => {
    await setApiKey(null);
    onDone();
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + GUTTER }]}>
      <Text style={styles.title}>{connected ? 'TorBox is connected' : 'Connect TorBox'}</Text>
      <Text style={styles.body}>
        Paste your API key from the Settings page on torbox.app. The app lists the video files already in
        your TorBox account and plays them here. The key is saved only on this device.
      </Text>

      <TextInput
        value={key}
        onChangeText={setKey}
        placeholder={connected ? 'Paste a new key to replace it' : 'TorBox API key'}
        placeholderTextColor={colors.muted}
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry
        style={styles.input}
        onSubmitEditing={save}
        hasTVPreferredFocus
      />
      {error && <Text style={styles.error}>{error}</Text>}

      <View style={styles.buttons}>
        <Button label={checking ? 'Checking…' : 'Save'} onPress={save} disabled={checking} />
        {connected && <Button label="Disconnect" onPress={disconnect} />}
        <Button label="Back" onPress={onDone} />
      </View>
      {checking && <ActivityIndicator color={colors.accent} style={styles.spinner} />}
    </View>
  );
}

function Button({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ focused, pressed }) => [styles.button, (focused || pressed) && styles.buttonActive]}
    >
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, paddingHorizontal: GUTTER },
  title: { color: colors.accent, fontSize: sz(24, 30), fontWeight: '800' },
  body: { color: colors.muted, fontSize: sz(15, 18), lineHeight: sz(22, 26), marginTop: 12, maxWidth: 720 },
  input: {
    marginTop: 24,
    maxWidth: 720,
    backgroundColor: colors.surface,
    color: colors.text,
    fontSize: sz(16, 20),
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
  },
  error: { color: colors.live, fontSize: sz(14, 16), marginTop: 10 },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 20 },
  button: {
    backgroundColor: colors.surface,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 3,
    borderColor: 'transparent',
  },
  buttonActive: { borderColor: colors.accent },
  buttonText: { color: colors.text, fontSize: sz(16, 18), fontWeight: '700' },
  spinner: { marginTop: 16, alignSelf: 'flex-start' },
});
