// Downloads and installs a newer version of the app from GitHub Releases.
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Update } from '../api/updates';
import { downloadUpdate, installUpdate, openInstallUnknownAppsSettings } from '../api/updates';
import { GUTTER, colors, isTV, sz } from '../theme';

type Props = {
  update: Update;
  onClose: () => void;
};

export function UpdateScreen({ update, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const [phase, setPhase] = useState<'idle' | 'downloading' | 'installing' | 'done' | 'error'>('idle');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  const start = useCallback(async () => {
    setPhase('downloading');
    setError(null);
    setProgress(0);
    try {
      const uri = await downloadUpdate(update, (written, total) => {
        if (total > 0) setProgress(written / total);
      });
      setPhase('installing');
      await installUpdate(uri);
      setPhase('done');
    } catch (e) {
      setError(String((e as Error).message ?? e));
      setPhase('error');
    }
  }, [update]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    start();
  }, [start]);

  const sizeMb = update.size ? `${(update.size / 1024 / 1024).toFixed(0)} MB` : null;

  return (
    <View style={[styles.screen, { paddingTop: insets.top + (isTV ? 18 : 10) }]}>
      <Pressable onPress={onClose} style={styles.back} hitSlop={12}>
        <Ionicons name="chevron-back" size={isTV ? 28 : 24} color={colors.text} />
      </Pressable>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Update available</Text>
        <Text style={styles.version}>
          Version {update.version} (code {update.versionCode})
          {sizeMb ? ` · ${sizeMb}` : ''}
        </Text>

        {update.notes ? <Text style={styles.notes}>{update.notes}</Text> : null}

        {phase === 'downloading' && (
          <View style={styles.block}>
            <Text style={styles.state}>Downloading — {Math.round(progress * 100)}%</Text>
            <View style={styles.track}>
              <View style={[styles.fill, { width: `${Math.max(2, progress * 100)}%` }]} />
            </View>
            <ActivityIndicator color={colors.accent} style={styles.spinner} />
          </View>
        )}

        {phase === 'installing' && (
          <View style={styles.block}>
            <ActivityIndicator color={colors.accent} style={styles.spinner} />
            <Text style={styles.state}>Opening the installer…</Text>
            <Text style={styles.note}>
              If Android asks, allow ForUs to install unknown apps, then tap Install.
            </Text>
            <Pressable onPress={openInstallUnknownAppsSettings} style={styles.secondary}>
              <Text style={styles.secondaryText}>Open the install permission</Text>
            </Pressable>
          </View>
        )}

        {phase === 'done' && (
          <View style={styles.block}>
            <Text style={styles.state}>The installer is open. Tap Install to finish.</Text>
            <Pressable onPress={onClose} style={styles.secondary}>
              <Text style={styles.secondaryText}>Close</Text>
            </Pressable>
          </View>
        )}

        {phase === 'error' && (
          <View style={styles.block}>
            <Text style={styles.error}>{error ?? 'Something went wrong.'}</Text>
            <Pressable
              hasTVPreferredFocus
              onPress={start}
              style={({ focused, pressed }) => [styles.primary, (focused || pressed) && styles.primaryActive]}
            >
              <Text style={styles.primaryText}>Try again</Text>
            </Pressable>
          </View>
        )}

        {phase === 'idle' && (
          <Pressable
            hasTVPreferredFocus
            onPress={start}
            style={({ focused, pressed }) => [styles.primary, (focused || pressed) && styles.primaryActive]}
          >
            <Text style={styles.primaryText}>Download and install</Text>
          </Pressable>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, paddingHorizontal: GUTTER },
  back: {
    width: isTV ? 44 : 38,
    height: isTV ? 44 : 38,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
    marginBottom: 8,
  },
  content: { paddingBottom: 120 },
  title: { color: colors.text, fontSize: isTV ? 26 : 22, fontWeight: '900', marginTop: 8 },
  version: { color: colors.muted, fontSize: isTV ? 15 : 13, marginTop: 6 },
  notes: { color: colors.muted, fontSize: isTV ? 15 : 13, lineHeight: isTV ? 23 : 20, marginTop: 16 },
  block: { marginTop: 24, gap: 12 },
  state: { color: colors.text, fontSize: isTV ? 17 : 14, fontWeight: '700' },
  note: { color: colors.muted, fontSize: isTV ? 14 : 12.5, lineHeight: isTV ? 22 : 18 },
  track: { height: 10, borderRadius: 5, backgroundColor: colors.surfaceRaised, overflow: 'hidden', marginTop: 8 },
  fill: { height: '100%', backgroundColor: colors.accent, borderRadius: 5 },
  spinner: { marginTop: 12 },
  primary: {
    marginTop: 24,
    alignSelf: 'flex-start',
    paddingHorizontal: 26,
    paddingVertical: 14,
    borderRadius: 24,
    backgroundColor: colors.accent,
  },
  primaryActive: { opacity: 0.8 },
  primaryText: { color: '#fff', fontSize: isTV ? 17 : 15, fontWeight: '800' },
  secondary: {
    marginTop: 8,
    alignSelf: 'flex-start',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  secondaryText: { color: colors.text, fontSize: isTV ? 15 : 13, fontWeight: '700' },
  error: { color: colors.live, fontSize: isTV ? 15 : 13, fontWeight: '600' },
});
