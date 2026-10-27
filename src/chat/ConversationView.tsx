// One conversation: messages newest at the bottom, a film shared from ForUs
// as a card that plays when tapped, "Seen" under the last thing you sent once
// it's read, and the box to type in.
import { useEffect, useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { thumbnailUrl } from '../api/youtube';
import { Loader } from '../components/Loader';
import { cleanTitle } from '../components/VideoRow';
import { showToast } from '../data/toasts';
import { GUTTER, colors } from '../theme';
import type { ChatMessage, ChatUser, SharedTitle } from './api';
import { closeConversation, loadOlder, openConversation, send, useChat } from './store';
import { Avatar, Header, chatStyles } from './ui';
import { MicButton, RecordingBar, VoiceBubble, useVoicePlayback, useVoiceRecorder } from './VoiceNote';

type Props = {
  user: ChatUser;
  onBack: () => void;
  onPlay: (title: SharedTitle) => void;
};

export function ConversationView({ user, onBack, onPlay }: Props) {
  const insets = useSafeAreaInsets();
  const { threads, me, friends } = useChat();
  const thread = threads[user.id];
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const voice = useVoiceRecorder(user.id);
  // Unfriended (by either side): the history stays, but nothing more can be sent.
  const stillFriends = friends === null || friends.friends.some((f) => f.user.id === user.id);

  useEffect(() => {
    openConversation(user.id);
    return () => closeConversation(user.id);
  }, [user.id]);

  const submit = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      await send(user.id, { text });
      setDraft('');
    } catch (e) {
      showToast({ text: (e as Error).message });
    } finally {
      setSending(false);
    }
  };

  const listRef = useRef<FlatList<ChatMessage>>(null);
  const messages = thread?.messages ?? [];
  const voicePlayer = useVoicePlayback(messages, (nextId) => {
    const idx = messages.findIndex((m) => m.id === nextId);
    if (idx >= 0) {
      try {
        listRef.current?.scrollToIndex({ index: idx, animated: true, viewPosition: 0.3 });
      } catch {}
    }
  });

  // "Seen" goes under the newest message you sent, once it's been read.
  const lastMine = messages.find((m) => m.sender === me?.id);

  return (
    <KeyboardAvoidingView behavior="padding" style={[chatStyles.screen, { paddingTop: insets.top + 10 }]}>
      <Header
        title={user.name}
        subtitle={user.email}
        onBack={onBack}
        right={<Avatar name={user.name} id={user.id} size={38} />}
      />
      <FlatList
        ref={listRef}
        // Newest first, drawn upside down, so the list starts at the bottom and
        // older pages load as it's scrolled up.
        inverted
        data={messages}
        keyExtractor={(m) => m.id}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        onEndReached={() => loadOlder(user.id)}
        onEndReachedThreshold={0.4}
        onScrollToIndexFailed={() => {}}
        ListFooterComponent={thread?.loading ? <Loader style={styles.loader} /> : null}
        ListEmptyComponent={
          thread && !thread.loading ? (
            <View style={styles.empty}>
              <Text style={chatStyles.note}>
                Say hello to {user.name}, or send them a video: press and hold any video in ForUs.
              </Text>
            </View>
          ) : null
        }
        renderItem={({ item, index }) => {
          const mine = item.sender === me?.id;
          // The older neighbour; a gap opens when the sender changes.
          const older = messages[index + 1];
          return (
            <Bubble
              message={item}
              mine={mine}
              grouped={older?.sender === item.sender}
              seen={item === lastMine && !!item.readAt}
              onPlay={onPlay}
              activeVoice={voicePlayer.activeVoiceId === item.id ? voicePlayer : undefined}
              onToggleVoice={() => voicePlayer.toggle(item.id)}
            />
          );
        }}
      />
      {stillFriends ? (
        <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, 10) }]}>
          {voice.recording ? (
            <RecordingBar elapsedMs={voice.elapsedMs} />
          ) : (
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="Message"
              placeholderTextColor={colors.faint}
              multiline
              maxLength={4000}
              style={styles.input}
            />
          )}
          {/* With nothing typed, the button records a voice message instead. */}
          {draft.trim() ? (
            <Pressable
              onPress={submit}
              disabled={sending}
              accessibilityLabel="Send"
              style={({ pressed }) => [styles.send, pressed && styles.sendIdle]}
            >
              <Ionicons name="send" size={18} color="#fff" />
            </Pressable>
          ) : (
            <MicButton
              recording={voice.recording}
              onStart={() => {
                voicePlayer.stop();
                voice.start();
              }}
              onFinish={() => voice.finish(true)}
            />
          )}
        </View>
      ) : (
        <Text style={[chatStyles.note, styles.ended, { paddingBottom: insets.bottom + 16 }]}>
          {"You're no longer friends, so you can't send messages here."}
        </Text>
      )}
    </KeyboardAvoidingView>
  );
}

function Bubble({
  message,
  mine,
  grouped,
  seen,
  onPlay,
  activeVoice,
  onToggleVoice,
}: {
  message: ChatMessage;
  mine: boolean;
  grouped: boolean;
  seen: boolean;
  onPlay: (title: SharedTitle) => void;
  activeVoice?: { playing: boolean; position: number; duration: number };
  onToggleVoice?: () => void;
}) {
  const time = new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const title = message.title;
  return (
    <View style={[styles.bubbleRow, mine ? styles.right : styles.left, !grouped && styles.gap]}>
      {message.voice ? (
        <VoiceBubble
          message={message}
          mine={mine}
          time={time}
          active={!!activeVoice}
          playing={activeVoice?.playing}
          position={activeVoice?.position}
          onToggle={onToggleVoice}
        />
      ) : title ? (
        <Pressable
          onPress={() => onPlay(title)}
          style={({ pressed }) => [styles.card, mine ? styles.cardMine : styles.cardTheirs, pressed && styles.pressed]}
        >
          <View>
            {title.kind === 'video' ? (
              <Image
                source={thumbnailUrl(title.videoId)}
                style={styles.cardImage}
                contentFit="cover"
                cachePolicy="memory-disk"
              />
            ) : 'poster' in title && title.poster ? (
              <Image
                source={{ uri: title.poster }}
                style={styles.cardImage}
                contentFit="cover"
                cachePolicy="memory-disk"
              />
            ) : (
              <View style={[styles.cardImage, { backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }]}>
                <Ionicons name="film-outline" size={32} color={colors.muted} />
              </View>
            )}
            <View style={styles.cardPlay}>
              <Ionicons name="play" size={20} color="#fff" style={styles.playIcon} />
            </View>
          </View>
          <Text style={styles.cardTitle} numberOfLines={2}>
            {cleanTitle(title.title)}
          </Text>
          <Text style={styles.cardHint}>Tap to watch · {time}</Text>
        </Pressable>
      ) : (
        <View style={[styles.bubble, mine ? styles.mine : styles.theirs]}>
          <Text style={styles.text}>{message.text}</Text>
          <Text style={[styles.time, mine && styles.timeMine]}>{time}</Text>
        </View>
      )}
      {seen && <Text style={styles.seen}>Seen</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { flex: 1 },
  listContent: { paddingHorizontal: GUTTER, paddingVertical: 12 },
  loader: { alignSelf: 'center', marginVertical: 14 },
  empty: { padding: 24, transform: [{ scaleY: -1 }] },
  bubbleRow: { maxWidth: '82%', marginTop: 3 },
  gap: { marginTop: 12 },
  left: { alignSelf: 'flex-start' },
  right: { alignSelf: 'flex-end', alignItems: 'flex-end' },
  bubble: { paddingHorizontal: 13, paddingTop: 8, paddingBottom: 6, borderRadius: 18 },
  mine: { backgroundColor: colors.accentDeep, borderBottomRightRadius: 6 },
  theirs: { backgroundColor: colors.surfaceRaised, borderBottomLeftRadius: 6 },
  text: { color: colors.text, fontSize: 15.5, lineHeight: 21 },
  time: { color: colors.faint, fontSize: 10.5, marginTop: 2, alignSelf: 'flex-end' },
  timeMine: { color: 'rgba(255,255,255,0.6)' },
  seen: { color: colors.faint, fontSize: 11, marginTop: 3, marginRight: 4 },
  card: { width: 240, borderRadius: 16, overflow: 'hidden', paddingBottom: 10 },
  cardMine: { backgroundColor: colors.accentDeep },
  cardTheirs: { backgroundColor: colors.surfaceRaised },
  cardImage: { width: 240, height: 135, backgroundColor: colors.surface },
  cardPlay: {
    position: 'absolute',
    alignSelf: 'center',
    top: 135 / 2 - 22,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  playIcon: { marginLeft: 3 },
  cardTitle: { color: colors.text, fontSize: 14.5, fontWeight: '800', paddingHorizontal: 12, marginTop: 9 },
  cardHint: { color: 'rgba(255,255,255,0.6)', fontSize: 11.5, paddingHorizontal: 12, marginTop: 3 },
  pressed: { opacity: 0.75 },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    paddingHorizontal: 12,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
  input: {
    flex: 1,
    maxHeight: 120,
    backgroundColor: colors.surface,
    color: colors.text,
    fontSize: 15.5,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
    borderRadius: 22,
  },
  send: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
  },
  sendIdle: { opacity: 0.45 },
  ended: { textAlign: 'center', paddingHorizontal: GUTTER, paddingTop: 12 },
});
