// The chat tab's front page: every conversation, newest first, with unread
// counts. The header leads to friends (with a badge for new requests) and to
// your profile.
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useState } from 'react';
import { BOTTOM_NAV_HEIGHT } from '../components/BottomNav';
import { Loader } from '../components/Loader';
import { GUTTER, colors } from '../theme';
import type { ChatUser, Conversation } from './api';
import { refresh, useChat } from './store';
import { Avatar, Badge, Button, Header, IconButton, chatStyles, shortTime } from './ui';
import { formatDuration } from './voice';

type Props = {
  onOpen: (user: ChatUser) => void;
  onFriends: () => void;
  onProfile: () => void;
};

export function ConversationListView({ onOpen, onFriends, onProfile }: Props) {
  const insets = useSafeAreaInsets();
  const { conversations, friends, live, me } = useChat();
  const [refreshing, setRefreshing] = useState(false);
  const requests = friends?.incoming.length ?? 0;

  return (
    <View style={[chatStyles.screen, { paddingTop: insets.top + GUTTER }]}>
      <Header
        title="Chat"
        subtitle={live ? undefined : 'Connecting…'}
        right={
          <>
            <IconButton icon="people-outline" label="Friends" onPress={onFriends} badge={requests} />
            <IconButton icon="person-circle-outline" label="Profile" onPress={onProfile} />
          </>
        }
      />
      {conversations === null ? (
        <Loader label="Loading your chats" icon="chatbubbles-outline" style={styles.loader} />
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={(c) => c.user.id}
          contentContainerStyle={{ paddingBottom: BOTTOM_NAV_HEIGHT + insets.bottom + 40, flexGrow: 1 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                refresh().finally(() => setRefreshing(false));
              }}
              tintColor={colors.accent}
              colors={[colors.accent]}
              progressBackgroundColor={colors.surface}
            />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="chatbubbles-outline" size={52} color={colors.faint} />
              <Text style={styles.emptyTitle}>No chats yet</Text>
              <Text style={[chatStyles.note, styles.center]}>
                {(friends?.friends.length ?? 0) > 0
                  ? 'Open Friends and pick someone to message.'
                  : 'Add friends by their email or phone number to start chatting.'}
              </Text>
              <Button label={requests ? `Friends (${requests} new)` : 'Find friends'} onPress={onFriends} />
            </View>
          }
          renderItem={({ item }) => <Row item={item} meId={me?.id} onPress={() => onOpen(item.user)} />}
        />
      )}
    </View>
  );
}

function Row({ item, meId, onPress }: { item: Conversation; meId?: string; onPress: () => void }) {
  const mine = item.last.sender === meId;
  const preview = item.last.voice
    ? `Voice message ${formatDuration(item.last.voice.durationMs)}`
    : item.last.title
      ? `Sent a film: ${item.last.title.title}`
      : (item.last.text ?? '');
  const unread = item.unread > 0;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      <Avatar name={item.user.name} id={item.user.id} size={50} />
      <View style={styles.rowText}>
        <View style={styles.rowTop}>
          <Text style={[styles.name, unread && styles.bold]} numberOfLines={1}>
            {item.user.name}
          </Text>
          <Text style={[styles.time, unread && styles.timeUnread]}>{shortTime(item.last.createdAt)}</Text>
        </View>
        <View style={styles.rowTop}>
          <Text style={[styles.preview, unread && styles.previewUnread]} numberOfLines={1}>
            {mine ? 'You: ' : ''}
            {preview}
          </Text>
          {unread && <Badge count={item.unread} style={styles.unread} />}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  loader: { marginTop: 40, alignSelf: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: GUTTER, paddingVertical: 11 },
  pressed: { backgroundColor: colors.surface },
  rowText: { flex: 1 },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { flex: 1, color: colors.text, fontSize: 16, fontWeight: '700' },
  bold: { fontWeight: '900' },
  time: { color: colors.faint, fontSize: 12 },
  timeUnread: { color: colors.accent, fontWeight: '800' },
  preview: { flex: 1, color: colors.muted, fontSize: 14, marginTop: 3 },
  previewUnread: { color: colors.text, fontWeight: '600' },
  unread: { backgroundColor: colors.accent, marginTop: 3 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 40, minHeight: 360 },
  emptyTitle: { color: colors.text, fontSize: 19, fontWeight: '900' },
  center: { textAlign: 'center', marginBottom: 6 },
});
