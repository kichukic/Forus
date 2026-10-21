// Settings shared by the horizontal rows of cards. Every card is the same
// width, so the list can place them without measuring, and it only keeps a few
// screens' worth of cards around instead of every card in a long row.
import { Platform } from 'react-native';
import { CARD_GAP, CARD_WIDTH, GUTTER, isTV } from '../theme';

const ITEM = CARD_WIDTH + CARD_GAP;

export const rowListProps = {
  // A TV shows about six cards across, and its chip is far slower than a
  // phone's, so it keeps fewer cards ready beyond the screen.
  initialNumToRender: isTV ? 6 : 4,
  maxToRenderPerBatch: isTV ? 3 : 4,
  windowSize: isTV ? 3 : 5,
  updateCellsBatchingPeriod: isTV ? 80 : 50,
  // Detaching off-screen cards saves memory on phones; on TV the remote's
  // focus search needs them attached.
  removeClippedSubviews: Platform.OS === 'android' && !isTV,
  getItemLayout: (_: unknown, index: number) => ({ length: ITEM, offset: GUTTER + ITEM * index, index }),
};
