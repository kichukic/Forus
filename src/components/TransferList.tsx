// The transfers that are running in the background, shown in the TorBox tab.
// Each one keeps polling TorBox on its own, so this is just the view of them.
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { subscribe, playableFrom, type Transfer } from '../data/transfers';
import type { Playable } from '../types';
import { GUTTER, colors, isTV } from '../theme';

type Props = {
  onPlay: (item: Playable) => void;
};

export function TransferList({ onPlay }: Props) {
  const [list, setList] = useState<Transfer[]>([]);
  useEffect(() => subscribe(setList), []);

  const active = list.filter((t) => t.state === 'sending' || t.state === 'downloading' || t.state === 'ready');
  if (active.length === 0) return null;

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Transfers</Text>
      {active.map((t) => {
        const ready = t.state === 'ready';
        const progress = t.state === 'sending' ? 0 : t.progress;
        return (
          <View key={t.id} style={styles.row}>
            <View style={styles.main}>
              <Text style={styles.name} numberOfLines={1}>
                {t.title}
              </Text>
              <View style={styles.track}>
                <View style={[styles.fill, { width: `${Math.max(2, progress)}%`, backgroundColor: ready ? colors.live : colors.accent }]} />
              </View>
              <Text style={styles.meta}>
                {t.state === 'sending'
                  ? 'Sending to TorBox…'
                  : ready
                    ? 'Ready in TorBox'
                    : progress > 0
                      ? `Downloading — ${Math.round(progress)}%${t.speed ? ` · ${Math.max(1, Math.round(t.speed / 1000))} KB/s` : ''}${t.eta ? ` · ${Math.round(t.eta / 60)} min left` : ''}`
                      : 'Checking TorBox…'}
              </Text>
              {t.state === 'error' && t.message ? <Text style={styles.error}>{t.message}</Text> : null}
            </View>
            {ready && (
              <Pressable
                onPress={() => {
                  const item = playableFrom(t);
                  if (item) onPlay(item);
                }}
                style={({ focused, pressed }) => [styles.play, (focused || pressed) && styles.playActive]}
              >
                <Ionicons name="play" size={isTV ? 18 : 15} color="#fff" />
                <Text style={styles.playText}>Play</Text>
              </Pressable>
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginHorizontal: GUTTER, marginBottom: 12 },
  title: { color: colors.text, fontSize: isTV ? 20 : 17, fontWeight: '800', marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  main: { flex: 1, gap: 4 },
  name: { color: colors.text, fontSize: isTV ? 15 : 13, fontWeight: '700' },
  track: { height: 4, borderRadius: 2, backgroundColor: colors.surface, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 2 },
  meta: { color: colors.muted, fontSize: isTV ? 13 : 11.5, fontWeight: '600' },
  error: { color: colors.live, fontSize: isTV ? 13 : 11.5, fontWeight: '600' },
  play: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 14, backgroundColor: colors.accent },
  playActive: { opacity: 0.8 },
  playText: { color: '#fff', fontSize: isTV ? 14 : 12, fontWeight: '800' },
});
