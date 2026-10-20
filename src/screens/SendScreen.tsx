import { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { TorrentOption } from '../api/torrents';
import { TorboxSendCard } from '../components/TorboxSendCard';
import { useTorboxSend } from '../hooks/useTorboxSend';
import { GUTTER, colors, isTV } from '../theme';
import type { Playable } from '../types';

type Props = {
  option: TorrentOption;
  onClose: () => void;
  onPlay: (item: Playable) => void;
  // Opens the TorBox settings, for when the app isn't connected yet.
  onOpenTorbox: () => void;
};

/** Sends a release found by searching to TorBox, and plays it when it's there. */
export function SendScreen({ option, onClose, onPlay, onOpenTorbox }: Props) {
  const insets = useSafeAreaInsets();
  const { phase, start, cancel } = useTorboxSend({
    onPlay: (item) => {
      onPlay(item);
      onClose();
    },
  });
  const started = useRef(false);

  // Picking a release is the go-ahead, so it starts on its own.
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    start(option);
  }, [option, start]);

  // Nothing to send yet: show the release and the button that starts it.
  if (phase.kind === 'idle') {
    return (
      <View style={[styles.screen, { paddingTop: insets.top + GUTTER }]}>
        <Pressable onPress={onClose} style={styles.back} hitSlop={12}>
          <Ionicons name="chevron-back" size={isTV ? 28 : 24} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>{option.name}</Text>
        <Text style={styles.meta}>
          {[option.quality, option.size, option.seeders !== undefined ? `${option.seeders} seeds` : null]
            .filter(Boolean)
            .join(' · ')}
        </Text>
        <Text style={styles.body}>
          This release is sent to your TorBox account, and plays here once TorBox has it.
        </Text>        <Pressable
          hasTVPreferredFocus
          onPress={() => start(option)}
          style={({ focused, pressed }) => [styles.send, (focused || pressed) && styles.sendActive]}
        >
          <Text style={styles.sendText}>Send to TorBox</Text>
        </Pressable>
      </View>
    );
  }

  if (phase.kind === 'error') {
    return (
      <View style={[styles.screen, { paddingTop: insets.top + GUTTER }]}>
        <Pressable onPress={onClose} style={styles.back} hitSlop={12}>
          <Ionicons name="chevron-back" size={isTV ? 28 : 24} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>Couldn&apos;t send this</Text>
        <Text style={styles.body}>{phase.message}</Text>
        {phase.needsKey && (
          <Pressable
            hasTVPreferredFocus
            onPress={onOpenTorbox}
            style={({ focused, pressed }) => [styles.send, (focused || pressed) && styles.sendActive]}
          >
            <Text style={styles.sendText}>Connect TorBox</Text>
          </Pressable>
        )}
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <TorboxSendCard
        title={option.name}
        torrent={phase.kind === 'downloading' ? phase.torrent : null}
        sending={phase.kind === 'sending'}
        onCancel={cancel}
      />
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
  },
  title: { color: colors.text, fontSize: isTV ? 26 : 21, fontWeight: '900', marginTop: 18 },
  meta: { color: colors.muted, fontSize: isTV ? 15 : 13, marginTop: 6 },
  body: {
    color: colors.muted,
    fontSize: isTV ? 16 : 14,
    lineHeight: isTV ? 24 : 20,
    marginTop: 18,
    marginBottom: 26,
  },
  send: {
    alignSelf: 'flex-start',
    paddingHorizontal: 26,
    paddingVertical: 14,
    borderRadius: 24,
    backgroundColor: colors.accent,
  },
  sendActive: { opacity: 0.8 },
  sendText: { color: '#fff', fontSize: isTV ? 17 : 15, fontWeight: '800' },
});
