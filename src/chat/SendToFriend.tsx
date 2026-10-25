// "Send to a friend": a sheet listing your friends; picking one sends them the
// video as a card they can tap to watch. Opened from the player, or by
// pressing and holding a video card anywhere (see share.ts).
import { useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { showToast } from '../data/toasts';
import { GUTTER, colors } from '../theme';
import type { ChatUser } from './api';
import { closeShare, useShareRequest } from './share';
import { send, useChat } from './store';
import { Avatar, chatStyles } from './ui';

// Shown once, in App; it opens whenever something asks to share.
export function SendToFriend() {
  const title = useShareRequest();
  const onClose = closeShare;
  const insets = useSafeAreaInsets();
  const { status, friends } = useChat();
  const [sendingTo, setSendingTo] = useState<string | null>(null);

  const pick = async (user: ChatUser) => {
    if (!title || sendingTo) return;
    setSendingTo(user.id);
    try {
      await send(user.id, { title });
      showToast({ text: `Sent to ${user.name}` });
      onClose();
    } catch (e) {
      showToast({ text: (e as Error).message });
    } finally {
      setSendingTo(null);
    }
  };

  const list = friends?.friends ?? [];
  return (
    <Modal visible={!!title} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.grabber} />
        <Text style={styles.heading}>Send to a friend</Text>
        <Text style={[chatStyles.note, styles.sub]} numberOfLines={1}>
          {title?.title}
        </Text>
        {status !== 'signedIn' ? (
          <Text style={[chatStyles.note, styles.message]}>Sign in on the Chat tab to send films to friends.</Text>
        ) : list.length === 0 ? (
          <Text style={[chatStyles.note, styles.message]}>Add friends on the Chat tab first.</Text>
        ) : (
          <FlatList
            data={list}
            keyExtractor={(f) => f.user.id}
            style={styles.list}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => pick(item.user)}
                style={({ pressed }) => [styles.row, pressed && styles.pressed]}
              >
                <Avatar name={item.user.name} id={item.user.id} size={42} />
                <Text style={styles.name} numberOfLines={1}>
                  {item.user.name}
                </Text>
                <Ionicons
                  name={sendingTo === item.user.id ? 'hourglass-outline' : 'send'}
                  size={18}
                  color={colors.accent}
                />
              </Pressable>
            )}
          />
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: GUTTER,
    paddingTop: 10,
    maxHeight: '70%',
  },
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.faint,
    marginBottom: 14,
  },
  heading: { color: colors.text, fontSize: 19, fontWeight: '900' },
  sub: { marginTop: 4, marginBottom: 12 },
  message: { paddingVertical: 24, textAlign: 'center' },
  list: { flexGrow: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  pressed: { opacity: 0.6 },
  name: { flex: 1, color: colors.text, fontSize: 16, fontWeight: '700' },
});
