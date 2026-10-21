// Settings shared by the horizontal rows of cards. Every card is the same
// width, so the list can place them without measuring, and it only keeps a few
// screens' worth of cards around instead of every card in a long row.
import { Platform } from 'react-native';
import { CARD_GAP, CARD_WIDTH, GUTTER, isTV } from '../theme';

const ITEM = CARD_WIDTH + CARD_GAP;

export const rowListProps = {
  initialNumToRender: 4,
  maxToRenderPerBatch: 4,
  windowSize: 5,
  // Detaching off-screen cards saves memory on phones; on TV the remote's
  // focus search needs them attached.
  removeClippedSubviews: Platform.OS === 'android' && !isTV,
  getItemLayout: (_: unknown, index: number) => ({ length: ITEM, offset: GUTTER + ITEM * index, index }),
};
