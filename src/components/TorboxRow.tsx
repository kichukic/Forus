import { useEffect, useState, type ReactElement } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Platform,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type RefreshControlProps,
} from 'react-native';
import { formatSize, getApiKey, listVideoFiles, type TorboxFile } from '../api/torbox';
import { Ionicons } from '@expo/vector-icons';
import { CARD_GAP, CARD_HEIGHT, CARD_WIDTH, GUTTER, RADIUS, colors, isTV, sz } from '../theme';
import type { FilePlayable } from '../types';
import { FileCardContent } from './FileCardContent';
import { FocusCard } from './FocusCard';

type Props = {
  // Bumped by the parent after the API key changes, to reload the list.
  version: number;
  onPlay: (item: FilePlayable) => void;
  onOpenSettings: () => void;
  // A scrolling grid filling its parent (the TorBox tab) instead of one row.
  grid?: boolean;
  // Grid only: content above the grid, scrolled with it.
  header?: ReactElement;
  refreshControl?: ReactElement<RefreshControlProps>;
};

type State =
  | { status: 'loading' }
  | { status: 'disconnected' }
  | { status: 'error'; message: string }
  | { status: 'ready'; files: TorboxFile[] };

type Card = { type: 'file'; file: TorboxFile } | { type: 'settings' };


export function TorboxRow({ version, onPlay, onOpenSettings, grid, header, refreshControl }: Props) {
  const [state, setState] = useState<State>({ status: 'loading' });
  // The list is loaded again when the version changes, and goes back to
  // loading while it does.
  const [shownVersion, setShownVersion] = useState(version);
  if (shownVersion !== version) {
    setShownVersion(version);
    setState({ status: 'loading' });
  }
  const { width } = useWindowDimensions();
  const columns = Math.max(1, Math.floor((width - GUTTER * 2 + CARD_GAP) / (CARD_WIDTH + CARD_GAP)));

  useEffect(() => {
    let alive = true;
    getApiKey()
      .then(async (key) => {
        if (!alive) return;
        if (!key) return setState({ status: 'disconnected' });
        const files = await listVideoFiles(key);
        if (alive) setState({ status: 'ready', files });
      })
      .catch((e) => alive && setState({ status: 'error', message: String(e?.message ?? e) }));
    // The row is left when the tab is closed, so a late answer is dropped.
    return () => {
      alive = false;
    };
  }, [version]);

  if (state.status === 'loading' && !grid) {
    return <ActivityIndicator color={colors.accent} style={styles.loading} />;
  }

  const cards: Card[] =
    state.status === 'ready'
      ? [...state.files.map((file) => ({ type: 'file' as const, file })), { type: 'settings' }]
      : state.status === 'loading'
        ? []
        : [{ type: 'settings' }];

  const note =
    state.status === 'loading' ? (
      <ActivityIndicator color={colors.accent} style={styles.loading} />
    ) : state.status === 'error' ? (
      <Text style={styles.note}>Couldn&apos;t load TorBox: {state.message}</Text>
    ) : state.status === 'ready' && state.files.length === 0 ? (
      <Text style={styles.note}>No finished video files in your TorBox account yet.</Text>
    ) : state.status === 'disconnected' && grid ? (
      <Text style={styles.note}>Connect your TorBox account to play your own files here.</Text>
    ) : null;

  const list = (
    <FlatList
      // A new column count needs a fresh list.
      key={grid ? `grid-${columns}` : 'row'}
      horizontal={!grid}
      numColumns={grid ? columns : undefined}
      columnWrapperStyle={grid && columns > 1 ? styles.gridRow : undefined}
      style={grid ? styles.gridList : undefined}
      ListHeaderComponent={
        grid ? (
          <>
            {header}
            {note}
          </>
        ) : undefined
      }
      refreshControl={grid ? refreshControl : undefined}
      // Only a few cards are built at a time, so a phone with little memory
      // is not asked to hold them all.
      initialNumToRender={isTV ? 12 : 8}
      maxToRenderPerBatch={isTV ? 12 : 8}
      windowSize={7}
      updateCellsBatchingPeriod={60}
      // Android keeps what it draws out of view; letting go of it saves memory.
      removeClippedSubviews={Platform.OS === 'android'}
      data={cards}
      keyExtractor={(c) => (c.type === 'file' ? `${c.file.source}:${c.file.itemId}:${c.file.fileId}` : 'settings')}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={grid ? styles.grid : styles.list}
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
            <View>
              <View style={styles.settingsTile}>
                <Ionicons name="settings-outline" size={sz(28, 34)} color={colors.accent} />
              </View>
              <Text style={styles.settingsText}>
                {state.status === 'disconnected' ? 'Connect TorBox' : 'TorBox settings'}
              </Text>
            </View>
          </FocusCard>
        )
      }
    />
  );

  if (grid) return list;
  return (
    <View style={styles.row}>
      {note}
      {list}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { marginBottom: sz(12, 20) },
  list: { paddingHorizontal: GUTTER, paddingVertical: 10 },
  gridList: { flex: 1 },
  grid: { paddingHorizontal: GUTTER, paddingBottom: 32 },
  // FocusCard has its own right margin; the row only needs spacing below.
  gridRow: { marginBottom: CARD_GAP },
  loading: { alignSelf: 'flex-start', marginLeft: GUTTER, marginVertical: 20 },
  note: { color: colors.muted, fontSize: sz(14, 16), marginLeft: GUTTER, marginBottom: 4 },
  settingsTile: {
    height: CARD_HEIGHT,
    borderRadius: RADIUS,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: 'rgba(155,92,255,0.35)',
  },
  settingsText: { color: colors.text, fontSize: sz(14, 16), fontWeight: '700', marginTop: 8, paddingHorizontal: 2 },
});
