import { useState } from 'react';
import { FlatList, Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { clearVideoCache, thumbnailUrl } from '../api/youtube';
import { FileCardContent } from '../components/FileCardContent';
import { FocusCard, cardImageStyle } from '../components/FocusCard';
import { TorboxRow } from '../components/TorboxRow';
import { NewRow, VideoRow } from '../components/VideoRow';
import { LIVE_NEWS, MOVIES, SHOWS } from '../data/channels';
import { playableKey } from '../data/history';
import { CARD_HEIGHT, GUTTER, colors, isTV } from '../theme';
import type { Playable } from '../types';

type Props = {
  history: Playable[];
  torboxVersion: number;
  onPlay: (item: Playable) => void;
  onOpenTorbox: () => void;
  onOpenSearch: () => void;
};

export function HomeScreen({ history, torboxVersion, onPlay, onOpenTorbox, onOpenSearch }: Props) {
  // Keeps the header clear of a phone's status bar and notch. Zero on TVs.
  const insets = useSafeAreaInsets();
  // Bumped on refresh; the rows below are keyed on it, so they remount and refetch.
  const [refreshKey, setRefreshKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = () => {
    clearVideoCache();
    setRefreshKey((k) => k + 1);
    // The rows show their own spinners; this one only acknowledges the pull.
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 600);
  };

  return (
    <View style={styles.screen}>
      <ScrollView
        style={styles.screen}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + styles.content.paddingVertical }]}
        refreshControl={
          isTV ? undefined : (
            <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.accent} colors={[colors.accent]} />
          )
        }
      >
        <View style={styles.header}>
          <Text style={styles.brand}>MyTV Malayalam</Text>
          <HeaderButton label="🔍  Search" onPress={onOpenSearch} />
          {isTV && <HeaderButton label="↻  Refresh" onPress={refresh} />}
        </View>

        {history.length > 0 && (
          <>
            <Section title="Recently Watched" />
            <FlatList
              horizontal
              data={history}
              keyExtractor={playableKey}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.list}
              renderItem={({ item, index }) => (
                <FocusCard preferredFocus={index === 0} onPress={() => onPlay(item)}>
                  {item.kind === 'live' ? (
                    <LiveTile channelId={item.channelId} name={item.title} />
                  ) : item.kind === 'file' ? (
                    <FileCardContent fileName={item.title} detail="TorBox" />
                  ) : (
                    <>
                      <Image source={{ uri: thumbnailUrl(item.videoId) }} style={cardImageStyle} />
                      <Text style={styles.cardTitle} numberOfLines={2}>
                        {item.title}
                      </Text>
                    </>
                  )}
                </FocusCard>
              )}
            />
          </>
        )}

        <NewRow key={`new-${refreshKey}`} onPlay={(v) => onPlay({ kind: 'video', videoId: v.id, title: v.title })} />

        <Section title="Live News" />
        <FlatList
          horizontal
          data={LIVE_NEWS}
          keyExtractor={(c) => c.channelId}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.list}
          renderItem={({ item, index }) => (
            <FocusCard
              preferredFocus={history.length === 0 && index === 0}
              onPress={() => onPlay({ kind: 'live', channelId: item.channelId, title: item.name })}
            >
              <LiveTile channelId={item.channelId} name={item.name} />
            </FocusCard>
          )}
        />

        <Section title="Serials & Shows" />
        {SHOWS.map((source) => (
          <VideoRow
            key={`${source.channelId}-${refreshKey}`}
            source={source}
            onPlay={(v) => onPlay({ kind: 'video', videoId: v.id, title: v.title })}
          />
        ))}

        <Section title="My TorBox" />
        <TorboxRow version={torboxVersion + refreshKey} onPlay={onPlay} onOpenSettings={onOpenTorbox} />

        <Section title="Movies" />
        {MOVIES.length === 0 ? (
          <Text style={styles.empty}>No free movie channels added yet.</Text>
        ) : (
          MOVIES.map((source) => (
            <VideoRow
              key={`${source.channelId}-${refreshKey}`}
              source={source}
              onPlay={(v) => onPlay({ kind: 'video', videoId: v.id, title: v.title })}
            />
          ))
        )}
      </ScrollView>
      {/* Solid strip so rows don't scroll visibly behind the phone's status bar. */}
      <View style={[styles.statusStrip, { height: insets.top }]} />
    </View>
  );
}

function HeaderButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ focused, pressed }) => [styles.headerButton, (focused || pressed) && styles.headerButtonActive]}
    >
      <Text style={styles.headerButtonText}>{label}</Text>
    </Pressable>
  );
}

function Section({ title }: { title: string }) {
  return <Text style={styles.section}>{title}</Text>;
}

function LiveTile({ channelId, name }: { channelId: string; name: string }) {
  const color = LIVE_NEWS.find((c) => c.channelId === channelId)?.color ?? colors.live;
  return (
    <View style={[styles.liveTile, { backgroundColor: color }]}>
      <Text style={styles.liveBadge}>● LIVE</Text>
      <Text style={styles.liveName}>{name}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  statusStrip: { position: 'absolute', top: 0, left: 0, right: 0, backgroundColor: colors.background },
  content: { paddingVertical: isTV ? 32 : 16 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: isTV ? 16 : 10,
    paddingHorizontal: GUTTER,
    marginBottom: 8,
  },
  brand: {
    flex: 1,
    color: colors.accent,
    fontSize: isTV ? 30 : 24,
    fontWeight: '800',
  },
  headerButton: {
    backgroundColor: colors.surface,
    paddingHorizontal: isTV ? 20 : 14,
    paddingVertical: isTV ? 10 : 8,
    borderRadius: 20,
    borderWidth: 3,
    borderColor: 'transparent',
  },
  headerButtonActive: { borderColor: colors.accent },
  headerButtonText: { color: colors.text, fontSize: isTV ? 18 : 14, fontWeight: '700' },
  section: {
    color: colors.muted,
    fontSize: isTV ? 16 : 13,
    fontWeight: '700',
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginLeft: GUTTER,
    marginTop: isTV ? 20 : 12,
    marginBottom: isTV ? 12 : 6,
  },
  list: { paddingHorizontal: GUTTER, paddingVertical: 10, marginBottom: isTV ? 20 : 12 },
  liveTile: { height: CARD_HEIGHT + (isTV ? 52 : 20), padding: isTV ? 16 : 12, justifyContent: 'space-between' },
  liveBadge: { color: '#fff', fontSize: isTV ? 14 : 12, fontWeight: '800' },
  liveName: { color: '#fff', fontSize: isTV ? 24 : 20, fontWeight: '800' },
  cardTitle: { color: colors.text, fontSize: isTV ? 14 : 13, padding: 8, height: isTV ? 52 : 50 },
  empty: { color: colors.muted, fontSize: isTV ? 16 : 14, marginLeft: GUTTER, marginBottom: 20 },
});
