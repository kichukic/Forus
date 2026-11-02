// The social corner of Home: who is around, and what friends are playing.
// Both are friends-only and quietly absent when there is nothing to show (or
// when the server has not been updated with the presence events yet).
import { useMemo } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import type { ChatUser, FriendWatching, WatchingTitle } from '../chat/api';
import { openChatRequest } from '../chat/push';
import { useChat, useChatStatus, useFriendsWatching, useOnlineFriendIds } from '../chat/store';
import { Avatar } from '../chat/ui';
import { thumbnailUrl } from '../api/youtube';
import { posterColour } from './MovieboxPoster';
import { FocusCard } from './FocusCard';
import { FocusRow } from './FocusRow';
import { SectionHeader } from './Section';
import { CARD_GAP, CARD_WIDTH, GUTTER, colors, sz } from '../theme';
import type { Playable } from '../types';

export function FriendsOnlineRow() {
  const { status, friends } = useChat();
  const onlineIds = useOnlineFriendIds();

  const online = useMemo(() => {
    if (status !== 'signedIn' || !friends) return [];
    const ids = new Set(onlineIds);
    return friends.friends.map((entry) => entry.user).filter((user) => ids.has(user.id));
  }, [status, friends, onlineIds]);

  if (online.length === 0) return null;

  return (
    <View style={styles.section}>
      <SectionHeader
        title="Friends online"
        subtitle={online.length === 1 ? '1 friend is around right now' : `${online.length} friends are around right now`}
      />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.people}>
        {online.map((user) => (
          <OnlinePerson key={user.id} user={user} />
        ))}
      </ScrollView>
    </View>
  );
}

function OnlinePerson({ user }: { user: ChatUser }) {
  const firstName = user.name.trim().split(/\s+/)[0] || user.name;
  return (
    <Pressable
      onPress={() => openChatRequest(user)}
      accessibilityRole="button"
      accessibilityLabel={`Message ${user.name}`}
      style={({ pressed }) => [styles.person, pressed && styles.pressed]}
    >
      <View>
        <Avatar name={user.name} id={user.id} avatar={user.avatar} size={sz(54, 64)} />
        <View style={styles.onlineDot} />
      </View>
      <Text style={styles.personName} numberOfLines={1}>
        {firstName}
      </Text>
    </Pressable>
  );
}

export function FriendsWatchingRow({ onPlay }: { onPlay: (item: Playable) => void }) {
  const status = useChatStatus();
  const watching = useFriendsWatching();
  if (status !== 'signedIn' || watching.length === 0) return null;

  return (
    <View style={styles.section}>
      <SectionHeader title="Friends watching now" subtitle="Tap a film to join in — or message them below" />
      <FocusRow>
        <FlatList
          horizontal
          data={watching}
          keyExtractor={(entry) => entry.user.id}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => <WatchingCard entry={item} onPlay={onPlay} />}
        />
      </FocusRow>
    </View>
  );
}

function WatchingCard({ entry, onPlay }: { entry: FriendWatching; onPlay: (item: Playable) => void }) {
  const playable = playableFromWatching(entry.watching);
  const image = artworkFor(entry.watching);
  const live = entry.watching.kind === 'live';
  const firstName = entry.user.name.trim().split(/\s+/)[0] || entry.user.name;

  return (
    <View style={styles.watchItem}>
      <FocusCard
        width={CARD_WIDTH}
        onPress={() => (playable ? onPlay(playable) : openChatRequest(entry.user))}
        style={styles.watchCard}
      >
        <View style={styles.art}>
          {image ? (
            <Image
              source={image}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              transition={150}
              cachePolicy="memory-disk"
              recyclingKey={image}
            />
          ) : (
            <LinearGradient
              colors={[posterColour(entry.watching.title), colors.surface]}
              style={[StyleSheet.absoluteFill, styles.blank]}
            >
              <Ionicons
                name={entry.watching.kind === 'file' ? 'folder-open-outline' : 'film-outline'}
                size={sz(30, 38)}
                color="rgba(255,255,255,0.45)"
              />
              <Text style={styles.blankTitle} numberOfLines={2}>
                {entry.watching.title}
              </Text>
            </LinearGradient>
          )}
          <LinearGradient colors={['transparent', 'rgba(5,3,9,0.72)']} style={StyleSheet.absoluteFill} />
          <View style={styles.watchBadge}>
            <Avatar name={entry.user.name} id={entry.user.id} avatar={entry.user.avatar} size={sz(22, 26)} />
            <Text style={styles.watchBadgeText} numberOfLines={1}>
              {firstName}
            </Text>
          </View>
          {live ? (
            <View style={styles.liveBadge}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>LIVE</Text>
            </View>
          ) : playable ? (
            <View style={styles.playBadge}>
              <Ionicons name="play" size={sz(12, 15)} color="#fff" />
            </View>
          ) : (
            <View style={styles.privateBadge}>
              <Ionicons name="lock-closed" size={sz(10, 12)} color="#fff" />
              <Text style={styles.privateText}>In their TorBox</Text>
            </View>
          )}
        </View>
        <Text style={styles.watchTitle} numberOfLines={2}>
          {entry.watching.title}
        </Text>
      </FocusCard>

      <Pressable
        onPress={() => openChatRequest(entry.user)}
        accessibilityRole="button"
        accessibilityLabel={`Message ${entry.user.name}`}
        style={({ pressed }) => [styles.messageRow, pressed && styles.messageRowPressed]}
      >
        <Avatar name={entry.user.name} id={entry.user.id} avatar={entry.user.avatar} size={sz(22, 26)} />
        <Text style={styles.messageName} numberOfLines={1}>
          Message {firstName}
        </Text>
        <Ionicons name="chatbubble-ellipses-outline" size={sz(15, 18)} color={colors.accent} />
      </Pressable>
    </View>
  );
}

function artworkFor(watching: WatchingTitle): string | undefined {
  if (watching.kind === 'video') return thumbnailUrl(watching.videoId);
  if (watching.kind === 'live' || watching.kind === 'file') return undefined;
  return watching.poster;
}

function playableFromWatching(watching: WatchingTitle): Playable | null {
  switch (watching.kind) {
    case 'video':
      return { kind: 'video', videoId: watching.videoId, title: watching.title };
    case 'live':
      return { kind: 'live', channelId: watching.channelId, title: watching.title };
    case 'stream':
      return { kind: 'stream', url: watching.url, title: watching.title, poster: watching.poster };
    case 'web':
      return { kind: 'web', url: watching.url, title: watching.title, poster: watching.poster };
    case 'moviebox':
      return {
        kind: 'moviebox',
        subjectId: watching.subjectId,
        season: watching.season ?? 0,
        episode: watching.episode ?? 0,
        title: watching.title,
        poster: watching.poster,
      };
    case 'file':
      // The file belongs to their TorBox, not ours.
      return null;
  }
}

const styles = StyleSheet.create({
  section: { marginBottom: sz(24, 30) },
  people: { paddingHorizontal: GUTTER, gap: sz(16, 20), paddingVertical: sz(2, 6) },
  person: { width: sz(62, 82), alignItems: 'center', gap: 6 },
  pressed: { opacity: 0.65 },
  onlineDot: {
    position: 'absolute',
    right: 1,
    bottom: 2,
    width: sz(14, 17),
    height: sz(14, 17),
    borderRadius: 9,
    backgroundColor: '#4cd6a0',
    borderWidth: 2.5,
    borderColor: colors.background,
  },
  personName: { color: colors.text, fontSize: sz(12.5, 15), fontWeight: '700', maxWidth: '100%' },
  list: { paddingHorizontal: GUTTER, paddingVertical: sz(2, 8) },
  watchItem: { width: CARD_WIDTH, marginRight: CARD_GAP },
  watchCard: { marginRight: 0 },
  art: {
    width: '100%',
    height: Math.round((CARD_WIDTH * 9) / 16),
    borderRadius: sz(14, 16),
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  blank: { justifyContent: 'flex-end', padding: sz(12, 16), gap: 8 },
  blankTitle: { color: colors.text, fontSize: sz(14, 17), fontWeight: '800' },
  watchBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingRight: 8,
    paddingLeft: 2,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: 'rgba(12,10,18,0.82)',
    maxWidth: '70%',
  },
  watchBadgeText: { color: '#fff', fontSize: sz(10.5, 12.5), fontWeight: '800', flexShrink: 1 },
  liveBadge: {
    position: 'absolute',
    right: 8,
    bottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: colors.live,
  },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#fff' },
  liveText: { color: '#fff', fontSize: sz(10, 12), fontWeight: '900', letterSpacing: 0.8 },
  playBadge: {
    position: 'absolute',
    right: 8,
    bottom: 8,
    width: sz(28, 34),
    height: sz(28, 34),
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(155,92,255,0.94)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.85)',
  },
  privateBadge: {
    position: 'absolute',
    right: 8,
    bottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: 'rgba(12,10,18,0.78)',
  },
  privateText: { color: '#fff', fontSize: sz(9.5, 11.5), fontWeight: '700' },
  watchTitle: {
    color: colors.text,
    fontSize: sz(13.5, 16),
    fontWeight: '700',
    lineHeight: sz(18, 21),
    marginTop: 7,
    paddingHorizontal: 2,
  },
  messageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginTop: 7,
    marginHorizontal: 2,
    paddingVertical: 5,
    paddingHorizontal: 7,
    borderRadius: 999,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  messageRowPressed: { opacity: 0.65 },
  messageName: { flex: 1, color: colors.muted, fontSize: sz(11.5, 13.5), fontWeight: '700' },
});
