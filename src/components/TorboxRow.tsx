import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';
import { formatSize, getApiKey, listVideoFiles, type TorboxFile } from '../api/torbox';
import { CARD_HEIGHT, GUTTER, colors, isTV } from '../theme';
import type { FilePlayable } from '../types';
import { FileCardContent } from './FileCardContent';
import { FocusCard } from './FocusCard';

type Props = {
  // Bumped by the parent after the API key changes, to reload the list.
  version: number;
  onPlay: (item: FilePlayable) => void;
  onOpenSettings: () => void;
};

type State =
  | { status: 'loading' }
  | { status: 'disconnected' }
  | { status: 'error'; message: string }
  | { status: 'ready'; files: TorboxFile[] };

type Card = { type: 'file'; file: TorboxFile } | { type: 'settings' };

export function TorboxRow({ version, onPlay, onOpenSettings }: Props) {
  const [state, setState] = useState<State>({ status: 'loading' });

  useEffect(() => {
    setState({ status: 'loading' });
    getApiKey()
      .then(async (key) => {
        if (!key) return setState({ status: 'disconnected' });
        setState({ status: 'ready', files: await listVideoFiles(key) });
      })
      .catch((e) => setState({ status: 'error', message: String(e.message ?? e) }));
  }, [version]);

  if (state.status === 'loading') {
    return <ActivityIndicator color={colors.accent} style={styles.loading} />;
  }

  const cards: Card[] =
    state.status === 'ready' ? [...state.files.map((file) => ({ type: 'file' as const, file })), { type: 'settings' }] : [{ type: 'settings' }];

  return (
    <View style={styles.row}>
      {state.status === 'error' && <Text style={styles.note}>Couldn't load TorBox: {state.message}</Text>}
      {state.status === 'ready' && state.files.length === 0 && (
        <Text style={styles.note}>No finished video files in your TorBox account yet.</Text>
      )}
      <FlatList
        horizontal
        data={cards}
        keyExtractor={(c) => (c.type === 'file' ? `${c.file.source}:${c.file.itemId}:${c.file.fileId}` : 'settings')}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.list}
        renderItem={({ item }) =>
          item.type === 'file' ? (
            <FocusCard
              onPress={() =>
                onPlay({
                  kind: 'file',
                  source: item.file.source,
                  itemId: item.file.itemId,
                  fileId: item.file.fileId,
                  title: item.file.name,
                })
              }
            >
              <FileCardContent fileName={item.file.name} detail={formatSize(item.file.size)} />
            </FocusCard>
          ) : (
            <FocusCard onPress={onOpenSettings}>
              <View style={[styles.fileTile, styles.settingsTile]}>
                <Text style={styles.settingsText}>
                  {state.status === 'disconnected' ? 'Connect TorBox' : 'TorBox settings'}
                </Text>
              </View>
            </FocusCard>
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { marginBottom: isTV ? 20 : 12 },
  list: { paddingHorizontal: GUTTER, paddingVertical: 10 },
  loading: { alignSelf: 'flex-start', marginLeft: GUTTER, marginVertical: 20 },
  note: { color: colors.muted, fontSize: isTV ? 16 : 14, marginLeft: GUTTER, marginBottom: 4 },
  fileTile: {
    height: CARD_HEIGHT + (isTV ? 52 : 20),
    padding: isTV ? 16 : 12,
    justifyContent: 'space-between',
    backgroundColor: '#1f2533',
  },
  settingsTile: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  settingsText: { color: colors.accent, fontSize: isTV ? 20 : 17, fontWeight: '800' },
});
