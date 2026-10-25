import { useEffect, useState, type ReactNode } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getApiKey } from '../api/torbox';
import { getAddonUrls, addAddon, removeAddon } from '../api/addons';
import { useDownloads } from '../data/downloads';
import { useNavScrollHide } from '../data/navChrome';
import { getTraktSession, subscribeTrakt, type TraktSession } from '../api/trakt';
import { TraktSetupScreen } from './TraktSetupScreen';
import { ForUsWrappedModal } from '../components/ForUsWrappedModal';
import { LIVE_NEWS, MOVIES, SHOWS } from '../data/channels';
import { GLOW, GUTTER, RADIUS, colors, isTV, sz } from '../theme';

type Props = {
  // Bumped when the TorBox key changes, so the status here updates.
  torboxVersion: number;
  onOpenTorbox: () => void;
  onClearHistory: () => void;
  // Checks GitHub Releases for a newer build.
  onCheckForUpdates: () => void;
  onOpenDownloads?: () => void;
};

export function SettingsScreen({
  torboxVersion,
  onOpenTorbox,
  onClearHistory,
  onCheckForUpdates,
  onOpenDownloads,
}: Props) {
  const insets = useSafeAreaInsets();
  // Scrolling the settings list down tucks the bottom bar away.
  const navScroll = useNavScrollHide();
  const [connected, setConnected] = useState<boolean | null>(null);
  const [addons, setAddons] = useState<string[]>([]);
  const [newUrl, setNewUrl] = useState('');
  const [cleared, setCleared] = useState(false);
  const [traktOpen, setTraktOpen] = useState(false);
  const [traktSession, setTraktSession] = useState<TraktSession | null>(null);
  const [wrappedOpen, setWrappedOpen] = useState(false);
  const downloads = useDownloads();

  useEffect(() => {
    getTraktSession().then(setTraktSession);
    return subscribeTrakt(() => {
      getTraktSession().then(setTraktSession);
    });
  }, []);

  useEffect(() => {
    getApiKey().then((k) => setConnected(!!k));
  }, [torboxVersion]);

  const refreshAddons = () => getAddonUrls().then(setAddons);
  useEffect(() => {
    refreshAddons();
  }, []);

  return (
    <View style={styles.screen}>
      <LinearGradient colors={GLOW} style={styles.glow} pointerEvents="none" />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + GUTTER }]}
        onScroll={(e) => navScroll(e.nativeEvent.contentOffset.y)}
        scrollEventThrottle={48}
      >
        <Text style={styles.title}>Settings</Text>

        <Group title="Your accounts">
          <Row
            icon="cloud-outline"
            title="TorBox"
            detail={connected === null ? '…' : connected ? 'Connected' : 'Not connected'}
            onPress={onOpenTorbox}
            first
          />
          <Row
            icon="film-outline"
            title="Trakt.tv"
            detail={traktSession ? `@${traktSession.username}` : 'Not connected'}
            onPress={() => setTraktOpen(true)}
          />
        </Group>

        <Group title="Watching">
          {!isTV && onOpenDownloads && (
            <Row
              icon="cloud-download-outline"
              title="Offline Downloads"
              detail={downloads.length > 0 ? `${downloads.length} ${downloads.length === 1 ? 'item' : 'items'}` : 'None'}
              onPress={onOpenDownloads}
              first
            />
          )}
          <Row
            icon="sparkles-outline"
            title="ForUs Wrapped"
            detail="Your streaming persona & stats"
            onPress={() => setWrappedOpen(true)}
          />
          <Row
            icon="trash-outline"
            title="Clear watch history"
            detail={cleared ? 'Cleared' : undefined}
            onPress={() => {
              onClearHistory();
              setCleared(true);
            }}
            first={isTV || !onOpenDownloads}
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

        <Group title="Addons">
          <View style={{ paddingHorizontal: 16, paddingVertical: 8 }}>
            <Text style={{ color: colors.muted, fontSize: 12, marginBottom: 8, lineHeight: 18 }}>
              Configure the addon on its own site first (paste your TorBox key there), then copy the
              &ldquo;Install&rdquo; URL it gives you and paste it below. The URL already carries your key.
            </Text>
            <Pressable
              onPress={() => Linking.openURL('https://torrentio.strem.fun/configure')}
              style={{ alignSelf: 'flex-start', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, marginBottom: 8 }}
            >
              <Text style={{ color: colors.accent, fontWeight: '700', fontSize: 13 }}>Configure Torrentio</Text>
            </Pressable>
            <Pressable
              onPress={() => Linking.openURL('https://aiostreams.elfhosted.com/stremio/configure')}
              style={{ alignSelf: 'flex-start', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, marginBottom: 8 }}
            >
              <Text style={{ color: colors.accent, fontWeight: '700', fontSize: 13 }}>Configure AIOStreams</Text>
            </Pressable>
          </View>
          {addons.map((u) => (
            <Row
              key={u}
              icon="apps-outline"
              title={u}
              detail="Installed"
              onPress={() => {
                removeAddon(u).then(refreshAddons);
              }}
            />
          ))}
          <View style={{ paddingHorizontal: 16, paddingVertical: 8 }}>
            <Text style={{ color: colors.muted, fontSize: 13, marginBottom: 6 }}>Install by URL</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TextInput
                value={newUrl}
                onChangeText={setNewUrl}
                placeholder="https://..."
                placeholderTextColor={colors.muted}
                autoCapitalize="none"
                autoCorrect={false}
                style={{ flex: 1, backgroundColor: colors.surface, color: colors.text, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 }}
              />
              <Pressable
                onPress={() => {
                  if (!newUrl.trim()) return;
                  addAddon(newUrl.trim()).then(() => {
                    setNewUrl('');
                    refreshAddons();
                  });
                }}
                style={{ paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, backgroundColor: colors.accent }}
              >
                <Text style={{ color: '#fff', fontWeight: '700' }}>Add</Text>
              </Pressable>
            </View>
          </View>
        </Group>

        <Group title="App">
          <Row
            icon="cloud-download-outline"
            title="Check for updates"
            detail="Looks on GitHub Releases"
            onPress={onCheckForUpdates}
            first
          />
        </Group>

        <View style={styles.credit}>
          <Text style={styles.creditBrand}>
            For<Text style={{ color: colors.accent }}>Us</Text>
          </Text>
          <Text style={styles.creditText}>
            Made with <Text style={{ color: colors.accent }}>love</Text>
          </Text>
        </View>
      </ScrollView>

      <TraktSetupScreen visible={traktOpen} onClose={() => setTraktOpen(false)} />
      <ForUsWrappedModal visible={wrappedOpen} onClose={() => setWrappedOpen(false)} />
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
