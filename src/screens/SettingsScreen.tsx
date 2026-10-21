import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getApiKey } from '../api/torbox';
import { LIVE_NEWS, MOVIES, SHOWS } from '../data/channels';
import { GLOW, GUTTER, RADIUS, colors, isTV, sz } from '../theme';

type Props = {
  // Bumped when the TorBox key changes, so the status here updates.
  torboxVersion: number;
  onOpenTorbox: () => void;
  onClearHistory: () => void;
};

export function SettingsScreen({ torboxVersion, onOpenTorbox, onClearHistory }: Props) {
  const insets = useSafeAreaInsets();
  const [connected, setConnected] = useState<boolean | null>(null);
  const [cleared, setCleared] = useState(false);

  useEffect(() => {
    getApiKey().then((k) => setConnected(!!k));
  }, [torboxVersion]);

  return (
    <View style={styles.screen}>
      <LinearGradient colors={GLOW} style={styles.glow} pointerEvents="none" />
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + GUTTER }]}>
        <Text style={styles.title}>Settings</Text>

        <Group title="Your accounts">
          <Row
            icon="cloud-outline"
            title="TorBox"
            detail={connected === null ? '…' : connected ? 'Connected' : 'Not connected'}
            onPress={onOpenTorbox}
            first
          />
        </Group>

        <Group title="Watching">
          <Row
            icon="trash-outline"
            title="Clear watch history"
            detail={cleared ? 'Cleared' : undefined}
            onPress={() => {
              onClearHistory();
              setCleared(true);
            }}
          />
        </Group>

        <Group title="About">
          <Row
            icon="tv-outline"
            title="Official channels"
            detail={`${LIVE_NEWS.length} live · ${SHOWS.length} shows · ${MOVIES.length} movies`}
          />
          <Row icon="shield-checkmark-outline" title="Only free, official uploads" detail="No pirated sources" />
        </Group>

        <View style={styles.credit}>
          <Text style={styles.creditBrand}>
            For<Text style={{ color: colors.accent }}>Us</Text>
          </Text>
          <Text style={styles.creditText}>
            Made with <Text style={{ color: colors.accent }}>♥</Text> by Kishor
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.group}>
      <Text style={styles.groupTitle}>{title}</Text>
      <View style={styles.groupBody}>{children}</View>
    </View>
  );
}

function Row({
  icon,
  title,
  detail,
  onPress,
  first,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  detail?: string;
  onPress?: () => void;
  // TV: where the remote starts on this screen.
  first?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      focusable={!!onPress}
      hasTVPreferredFocus={isTV && first}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={({ pressed }) => [styles.row, (pressed || focused) && styles.rowActive]}
    >
      <View style={styles.rowIcon}>
        <Ionicons name={icon} size={20} color={colors.accent} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle}>{title}</Text>
        {detail ? <Text style={styles.rowDetail}>{detail}</Text> : null}
      </View>
      {onPress ? <Ionicons name="chevron-forward" size={18} color={colors.faint} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  glow: { position: 'absolute', top: 0, left: 0, right: 0, height: 320 },
  content: { paddingHorizontal: GUTTER, paddingBottom: 120 },
  title: { color: colors.text, fontSize: sz(26, 32), fontWeight: '900', marginBottom: 20 },
  group: { marginBottom: 22 },
  groupTitle: {
    color: colors.muted,
    fontSize: 12.5,
    fontWeight: '800',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 8,
    marginLeft: 4,
  },
  groupBody: { backgroundColor: colors.surface, borderRadius: RADIUS + 4, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 14, gap: 12 },
  rowActive: { backgroundColor: colors.surfaceRaised },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentSoft,
  },
  rowTitle: { color: colors.text, fontSize: 15.5, fontWeight: '700' },
  rowDetail: { color: colors.muted, fontSize: 13, marginTop: 2 },
  credit: { alignItems: 'center', marginTop: 20, gap: 4 },
  creditBrand: { color: colors.text, fontSize: 20, fontWeight: '900' },
  creditText: { color: colors.muted, fontSize: 13.5, fontWeight: '600' },
});
