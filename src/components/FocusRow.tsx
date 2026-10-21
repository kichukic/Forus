// A row of focusable things that the TV remote moves through as a unit: on the
// way into the row, focus returns to whichever item was focused last, the way
// TV apps do. On phones it is a plain View.
import type { ReactNode } from 'react';
import { TVFocusGuideView, View, type StyleProp, type ViewStyle } from 'react-native';
import { isTV } from '../theme';

export function FocusRow({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  if (isTV && TVFocusGuideView) {
    return (
      <TVFocusGuideView autoFocus style={style}>
        {children}
      </TVFocusGuideView>
    );
  }
  return <View style={style}>{children}</View>;
}
